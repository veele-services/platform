#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const severityRank = Object.freeze({ info: 0, low: 1, moderate: 2, high: 3, critical: 4 });
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = join(rootDir, "artifacts", "dependency-security");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function findingScope(finding) {
  if (finding.optional) return "optional";
  return finding.dev ? "development" : "production";
}

export function evaluateAudit(rawAudit) {
  if (!isObject(rawAudit) || !isObject(rawAudit.advisories) || !isObject(rawAudit.metadata)) {
    throw new Error("pnpm audit returned malformed JSON without advisories and metadata.");
  }
  if (!isObject(rawAudit.metadata.vulnerabilities)) {
    throw new Error("pnpm audit metadata is missing vulnerability totals.");
  }

  const findings = [];
  for (const advisory of Object.values(rawAudit.advisories)) {
    if (!isObject(advisory) || typeof advisory.github_advisory_id !== "string" ||
        typeof advisory.module_name !== "string" || !(advisory.severity in severityRank) ||
        !Array.isArray(advisory.findings)) {
      throw new Error("pnpm audit returned an advisory with missing required fields.");
    }
    for (const occurrence of advisory.findings) {
      if (!isObject(occurrence) || typeof occurrence.version !== "string" || !Array.isArray(occurrence.paths)) {
        throw new Error(`Advisory ${advisory.github_advisory_id} has a malformed finding.`);
      }
      const scope = findingScope(occurrence);
      const threshold = scope === "development" ? severityRank.high : severityRank.moderate;
      findings.push({
        advisory: advisory.github_advisory_id,
        package: advisory.module_name,
        version: occurrence.version,
        severity: advisory.severity,
        scope,
        paths: [...occurrence.paths].sort(),
        patchedVersions: advisory.patched_versions ?? null,
        url: advisory.url ?? null,
        blocking: severityRank[advisory.severity] >= threshold,
      });
    }
  }
  findings.sort((left, right) =>
    severityRank[right.severity] - severityRank[left.severity] ||
    left.advisory.localeCompare(right.advisory) ||
    left.package.localeCompare(right.package) ||
    left.version.localeCompare(right.version) ||
    left.scope.localeCompare(right.scope),
  );
  return {
    policy: {
      production: "moderate",
      optional: "moderate",
      development: "high",
      criticalWaiversAllowed: false,
      nativePnpmAuditIgnoresAllowed: false,
    },
    totals: rawAudit.metadata.vulnerabilities,
    findings,
    blockingFindings: findings.filter((finding) => finding.blocking),
    passed: findings.every((finding) => !finding.blocking),
  };
}

export function evaluateSignatures(report) {
  if (!isObject(report) || !Number.isInteger(report.audited) || !Number.isInteger(report.verified) ||
      !Array.isArray(report.invalid) || !Array.isArray(report.missing)) {
    throw new Error("pnpm audit signatures returned malformed JSON.");
  }
  const passed = report.audited > 0 && report.audited === report.verified &&
    report.invalid.length === 0 && report.missing.length === 0;
  return { ...report, passed };
}

export function assertNoNativeIgnores(workspaceText) {
  const forbidden = ["ignoreGhsas", "ignoreCves", "ignore-registry-errors", "ignore-unfixable"];
  const found = forbidden.filter((entry) => workspaceText.includes(entry));
  if (found.length > 0) throw new Error(`Forbidden fail-open pnpm audit configuration: ${found.join(", ")}`);
}

function executePnpm(args, acceptedExitCodes) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    last = spawnSync("pnpm", args, { cwd: rootDir, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    if (!last.error && acceptedExitCodes.includes(last.status)) return last;
  }
  const detail = last?.error?.message ?? last?.stderr?.trim() ?? `exit ${last?.status}`;
  throw new Error(`pnpm ${args.join(" ")} failed closed after 3 attempts: ${detail}`);
}

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }
}

function currentSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function checkSourceContract() {
  assertNoNativeIgnores(readFileSync(join(rootDir, "pnpm-workspace.yaml"), "utf8"));
  const packageJson = readFileSync(join(rootDir, "package.json"), "utf8");
  assertNoNativeIgnores(packageJson);
  console.log("Dependency-security source contract is valid.");
}

function runAudit() {
  checkSourceContract();
  mkdirSync(artifactDir, { recursive: true });
  const auditResult = executePnpm(["audit", "--json"], [0, 1]);
  const rawAudit = parseJson(auditResult.stdout, "pnpm audit");
  const evaluated = evaluateAudit(rawAudit);
  // pnpm deliberately exits 1 when it has valid JSON describing invalid or
  // missing signatures. Preserve that diagnostic evidence and let policy fail.
  const signatureResult = executePnpm(["audit", "signatures", "--json"], [0, 1]);
  const rawSignatures = parseJson(signatureResult.stdout, "pnpm audit signatures");
  const signatures = evaluateSignatures(rawSignatures);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    gitSha: process.env.FIELDGRID_VALIDATION_SHA ?? currentSha(),
    evaluated,
    signatures,
  };
  writeFileSync(join(artifactDir, "pnpm-audit.raw.json"), `${JSON.stringify(rawAudit, null, 2)}\n`);
  writeFileSync(join(artifactDir, "pnpm-signatures.raw.json"), `${JSON.stringify(rawSignatures, null, 2)}\n`);
  writeFileSync(join(artifactDir, "dependency-security-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Dependency scan: ${evaluated.findings.length} finding(s), ${evaluated.blockingFindings.length} blocking.`);
  console.log(`Registry signatures: ${signatures.verified}/${signatures.audited} verified.`);
  if (!evaluated.passed || !signatures.passed) {
    for (const finding of evaluated.blockingFindings) {
      console.error(`${finding.severity.toUpperCase()} ${finding.scope} ${finding.advisory} ${finding.package}@${finding.version}`);
    }
    throw new Error("Finding 8 dependency-security policy failed.");
  }
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (direct) {
  try {
    if (process.argv.includes("--check")) checkSourceContract();
    else if (process.argv.includes("--run")) runAudit();
    else throw new Error("Use --check or --run.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

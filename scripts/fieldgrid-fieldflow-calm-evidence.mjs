#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMachineEvidenceReport } from "./fieldgrid-fieldflow-calm-handoff.mjs";

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHA_256 = /^[0-9a-f]{64}$/u;
const GIT_SHA = /^[0-9a-f]{40}$/u;
const SUBJECT_ID = /^(?:FFC-[A-Z0-9]+-\d{3}|R-\d{3})$/u;
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/u;
const SAFE_EVIDENCE_PREFIXES = Object.freeze([
  "outputs/fieldflow-calm/",
  "docs/uiux/fieldflow-calm-handoff/evidence/implementation/",
]);
const REPORT_ERROR_CHANNELS = Object.freeze([
  "console",
  "page",
  "request",
  "server",
  "hydration",
]);
const ATTACHMENT_TYPES = new Set([
  "axe",
  "dom",
  "geometry",
  "junit",
  "log",
  "screenshot",
  "trace",
  "video",
]);
const BROWSER_TOKENS = new Set([
  "axe",
  "browser",
  "clock-e2e",
  "e2e",
  "keyboard-e2e",
  "mobile-e2e",
  "performance",
  "permission-e2e",
  "pointer",
  "pointer-e2e",
  "screenreader-e2e",
  "search",
  "touch-e2e",
  "two-session-e2e",
  "two-tenant-e2e",
]);
const VISUAL_TOKENS = new Set([
  "computed-style",
  "geometry",
  "visual",
  "visual-diff",
  "visual-e2e",
  "visual-review",
]);

export const EVIDENCE_MODES = Object.freeze({
  runtime: Object.freeze({
    kind: "runtime",
    commandId: "fieldflow-runtime",
    requiredFlags: [],
  }),
  browser: Object.freeze({
    kind: "runtime",
    commandId: "fieldflow-browser",
    requiredFlags: [],
  }),
  visual: Object.freeze({
    kind: "runtime",
    commandId: "fieldflow-visual",
    requiredFlags: ["run", "strict"],
  }),
  staging: Object.freeze({
    kind: "staging",
    commandId: "fieldflow-staging",
    requiredFlags: ["strict"],
  }),
  release: Object.freeze({
    kind: "staging",
    commandId: "fieldflow-release",
    requiredFlags: ["verify"],
  }),
});

function fail(message) {
  throw new Error(`Fieldflow Calm evidence: ${message}`);
}

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path, label) {
  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    fail(`${label} ontbreekt of is niet leesbaar: ${error.message}`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`${label} is malformed JSON: ${error.message}`);
  }
}

function git(root, args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: Object.hasOwn(options, "encoding") ? options.encoding : "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    fail(
      `Git-controle '${args.join(" ")}' faalde: ${String(error.stderr ?? error.message).trim()}`,
    );
  }
}

function fullGitHead(root) {
  const head = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]).trim();
  if (!GIT_SHA.test(head))
    fail("de checkout heeft geen exact 40-teken Git-HEAD");
  return head;
}

function assertAncestor(root, base, head) {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", base, head], {
    cwd: root,
    stdio: "ignore",
  });
  if (result.status !== 0) {
    fail(
      "de opgegeven PR-base bestaat niet of is geen ancestor van exact HEAD",
    );
  }
}

export function parseEvidenceArgs(argv) {
  const result = {
    mode: null,
    evidenceSubject: null,
    report: null,
    input: null,
    expectedHead: null,
    flags: new Set(),
  };
  const valueOptions = new Map([
    ["--mode", "mode"],
    ["--evidence-subject", "evidenceSubject"],
    ["--report", "report"],
    ["--input", "input"],
    ["--evidence-input", "input"],
    ["--expected-head", "expectedHead"],
  ]);
  const booleanOptions = new Map([
    ["--run", "run"],
    ["--strict", "strict"],
    ["--verify", "verify"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (valueOptions.has(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--"))
        fail(`${argument} vereist één waarde`);
      const field = valueOptions.get(argument);
      if (result[field] !== null)
        fail(`${argument} mag maar één keer voorkomen`);
      result[field] = value;
      index += 1;
      continue;
    }
    if (booleanOptions.has(argument)) {
      const flag = booleanOptions.get(argument);
      if (result.flags.has(flag))
        fail(`${argument} mag maar één keer voorkomen`);
      result.flags.add(flag);
      continue;
    }
    fail(`onbekende optie ${argument}`);
  }
  if (!Object.hasOwn(EVIDENCE_MODES, result.mode ?? "")) {
    fail(
      `--mode moet exact één van ${Object.keys(EVIDENCE_MODES).join(", ")} zijn`,
    );
  }
  const config = EVIDENCE_MODES[result.mode];
  for (const flag of config.requiredFlags) {
    if (!result.flags.has(flag)) fail(`mode ${result.mode} vereist --${flag}`);
  }
  for (const flag of result.flags) {
    if (!config.requiredFlags.includes(flag)) {
      fail(`--${flag} is niet toegestaan voor mode ${result.mode}`);
    }
  }
  return result;
}

export function assertSafeEvidencePath(
  path,
  root = SCRIPT_ROOT,
  label = "pad",
  requireJson = true,
) {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    isAbsolute(path) ||
    !SAFE_PATH.test(path) ||
    path.includes("//") ||
    path
      .split("/")
      .some((part) => part === "" || part === "." || part === "..") ||
    !SAFE_EVIDENCE_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    (requireJson && !path.endsWith(".json"))
  ) {
    fail(
      `${label} moet een veilig repository-relatief JSON-pad onder de Fieldflow evidence-root zijn`,
    );
  }
  const absolute = resolve(root, path);
  const relativePath = relative(root, absolute);
  if (
    relativePath.startsWith(`..${sep}`) ||
    relativePath === ".." ||
    isAbsolute(relativePath)
  ) {
    fail(`${label} ontsnapt uit de repository`);
  }
  return absolute;
}

function assertNoSymlinkPath(
  root,
  absolute,
  { allowMissingLeaf = false } = {},
) {
  const relativePath = relative(root, absolute);
  let current = root;
  const parts = relativePath.split(sep);
  for (let index = 0; index < parts.length; index += 1) {
    current = resolve(current, parts[index]);
    if (!existsSync(current)) {
      if (allowMissingLeaf) return;
      fail(`evidencepad ontbreekt: ${relativePath}`);
    }
    if (lstatSync(current).isSymbolicLink()) {
      fail(`symlinks zijn verboden in evidencepaden: ${relativePath}`);
    }
    if (index < parts.length - 1 && !statSync(current).isDirectory()) {
      fail(`evidencepad bevat een niet-directory: ${relativePath}`);
    }
  }
}

export function findForbiddenEvidenceOutcomes(
  value,
  path = "evidence",
  found = [],
) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      findForbiddenEvidenceOutcomes(entry, `${path}[${index}]`, found),
    );
    return found;
  }
  if (value === null || typeof value !== "object") return found;
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = `${path}.${key}`;
    const normalizedKey = key.replaceAll(/[_-]/gu, "").toLowerCase();
    if (
      ["failed", "skipped", "notrun", "manual"].includes(normalizedKey) &&
      (!Number.isInteger(entry) || entry !== 0)
    ) {
      found.push(entryPath);
    }
    if (
      ["status", "outcome", "result", "expectedstatus"].includes(
        normalizedKey,
      ) &&
      typeof entry === "string" &&
      [
        "failed",
        "manual",
        "notrun",
        "notexecuted",
        "skipped",
        "pending",
      ].includes(entry.replaceAll(/[\s_-]/gu, "").toLowerCase())
    ) {
      found.push(entryPath);
    }
    findForbiddenEvidenceOutcomes(entry, entryPath, found);
  }
  return found;
}

function loadSubject(root, subjectId) {
  if (!SUBJECT_ID.test(subjectId ?? "")) {
    fail("--evidence-subject heeft geen geldig FFC-…-NNN of R-NNN formaat");
  }
  const packageRoot = resolve(
    root,
    "docs/uiux/fieldflow-calm-handoff/manifests",
  );
  const acceptance = readJson(
    resolve(packageRoot, "acceptance.json"),
    "acceptancecontract",
  );
  const risks = readJson(resolve(packageRoot, "risks.json"), "risicocontract");
  const acceptanceItem = acceptance.requirements?.find(
    (item) => item.id === subjectId,
  );
  const riskItem = risks.risks?.find((item) => item.id === subjectId);
  if (Boolean(acceptanceItem) === Boolean(riskItem)) {
    fail(
      `subject ${subjectId} moet exact één keer in acceptance.json of risks.json bestaan`,
    );
  }
  if (acceptanceItem) return { ...acceptanceItem };
  return {
    ...riskItem,
    verification: "risk-mitigation",
    routes: [],
    themes: [],
    viewports: [],
    densities: [],
  };
}

function requiredRuntimeCommandIds(item) {
  const commandIds = ["fieldflow-runtime"];
  const tokens = new Set(String(item.verification ?? "").split("+"));
  if (
    [...tokens].some(
      (token) => BROWSER_TOKENS.has(token) || token.endsWith("-e2e"),
    )
  ) {
    commandIds.push("fieldflow-browser");
  }
  if ([...tokens].some((token) => VISUAL_TOKENS.has(token))) {
    commandIds.push("fieldflow-visual");
  }
  return commandIds;
}

export function expectedCommandIds(mode, item) {
  if (["runtime", "browser", "visual"].includes(mode)) {
    return requiredRuntimeCommandIds(item);
  }
  if (mode === "staging") return ["fieldflow-staging"];
  if (mode === "release") return ["fieldflow-staging", "fieldflow-release"];
  fail(`onbekende evidence-mode ${mode}`);
}

function provenanceFromEnvironment(env, head, mode) {
  const integer = (name) => {
    const value = env[name];
    if (!/^[1-9][0-9]*$/u.test(value ?? ""))
      fail(`${name} ontbreekt of is geen positief geheel getal`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed))
      fail(`${name} valt buiten het veilige getalbereik`);
    return parsed;
  };
  const baseCommit = env.GITHUB_BASE_SHA;
  if (!GIT_SHA.test(baseCommit ?? "") || baseCommit === head) {
    fail("GITHUB_BASE_SHA moet een andere exacte 40-teken basecommit zijn");
  }
  if (!SHA_256.test(env.FIELDFLOW_WORKFLOW_BLOB_SHA256 ?? "")) {
    fail("FIELDFLOW_WORKFLOW_BLOB_SHA256 ontbreekt of is ongeldig");
  }
  if (
    typeof env.FIELDFLOW_JOB_NAME !== "string" ||
    env.FIELDFLOW_JOB_NAME.trim() === ""
  ) {
    fail("FIELDFLOW_JOB_NAME ontbreekt");
  }
  if (env.GITHUB_EVENT_NAME !== "pull_request_target") {
    fail(
      "promoveerbaar evidence mag uitsluitend uit een base-owned pull_request_target-run komen",
    );
  }
  if (env.GITHUB_REPOSITORY !== "veele-services/platform") {
    fail("GITHUB_REPOSITORY wijkt af van veele-services/platform");
  }
  return {
    provider: "github-actions",
    repository: env.GITHUB_REPOSITORY,
    headCommit: head,
    baseCommit,
    pullRequestNumber: integer("GITHUB_PR_NUMBER"),
    workflowPath: ".github/workflows/fieldflow-calm-evidence.yml",
    workflowBlobSha256: env.FIELDFLOW_WORKFLOW_BLOB_SHA256,
    executorWorkflowSha: env.FIELDFLOW_EXECUTOR_WORKFLOW_SHA,
    evidenceMode: mode,
    runId: integer("GITHUB_RUN_ID"),
    runAttempt: integer("GITHUB_RUN_ATTEMPT"),
    checkSuiteId: integer("FIELDFLOW_CHECK_SUITE_ID"),
    jobId: integer("FIELDFLOW_JOB_ID"),
    jobName: env.FIELDFLOW_JOB_NAME,
    eventName: env.GITHUB_EVENT_NAME,
    attestationProvider: "github-artifact-attestations",
  };
}

function validateProvenance(root, provenance, head, mode, env) {
  const keys = [
    "provider",
    "repository",
    "headCommit",
    "baseCommit",
    "pullRequestNumber",
    "workflowPath",
    "workflowBlobSha256",
    "executorWorkflowSha",
    "evidenceMode",
    "runId",
    "runAttempt",
    "checkSuiteId",
    "jobId",
    "jobName",
    "eventName",
    "attestationProvider",
  ];
  if (
    !exactKeys(provenance, keys) ||
    provenance.provider !== "github-actions" ||
    provenance.repository !== "veele-services/platform" ||
    provenance.headCommit !== head ||
    !GIT_SHA.test(provenance.baseCommit ?? "") ||
    provenance.baseCommit === head ||
    !Number.isSafeInteger(provenance.pullRequestNumber) ||
    provenance.pullRequestNumber < 1 ||
    provenance.workflowPath !==
      ".github/workflows/fieldflow-calm-evidence.yml" ||
    !SHA_256.test(provenance.workflowBlobSha256 ?? "") ||
    !GIT_SHA.test(provenance.executorWorkflowSha ?? "") ||
    provenance.evidenceMode !== mode ||
    !Number.isSafeInteger(provenance.runId) ||
    provenance.runId < 1 ||
    !Number.isSafeInteger(provenance.runAttempt) ||
    provenance.runAttempt < 1 ||
    !Number.isSafeInteger(provenance.checkSuiteId) ||
    provenance.checkSuiteId < 1 ||
    !Number.isSafeInteger(provenance.jobId) ||
    provenance.jobId < 1 ||
    typeof provenance.jobName !== "string" ||
    provenance.jobName.trim() === "" ||
    provenance.eventName !== "pull_request_target" ||
    provenance.attestationProvider !== "github-artifact-attestations"
  ) {
    fail("provenance mist de exact getypeerde GitHub Actions/PR/HEAD-binding");
  }
  const expected = provenanceFromEnvironment(env, head, mode);
  if (Object.keys(expected).some((key) => provenance[key] !== expected[key])) {
    fail("payloadprovenance wijkt af van de onveranderlijke workflowomgeving");
  }
  assertAncestor(root, provenance.baseCommit, head);
  const currentWorkflow = readFileSync(resolve(root, provenance.workflowPath));
  const baseWorkflow = git(
    root,
    ["show", `${provenance.baseCommit}:${provenance.workflowPath}`],
    {
      encoding: null,
    },
  );
  const currentHash = sha256(currentWorkflow);
  if (
    !currentWorkflow.equals(baseWorkflow) ||
    currentHash !== provenance.workflowBlobSha256
  ) {
    fail(
      "de evidenceworkflow moet byte-identiek op PR-base en exact HEAD staan",
    );
  }
}

function validateInputShape(input, hasMatrix) {
  const payloadKeys = [
    "schemaVersion",
    "subjectId",
    "headCommit",
    "coverage",
    ...(hasMatrix ? ["verificationMatrix"] : []),
    "assertions",
    "summary",
    "errors",
    "attachments",
  ];
  const fullKeys = [
    "schemaVersion",
    "kind",
    "subjectId",
    "headCommit",
    "verification",
    "provenance",
    "coverage",
    ...(hasMatrix ? ["verificationMatrix"] : []),
    "assertions",
    "summary",
    "errors",
    "attachments",
  ];
  const fullReport =
    Object.hasOwn(input ?? {}, "provenance") ||
    Object.hasOwn(input ?? {}, "kind");
  if (!exactKeys(input, fullReport ? fullKeys : payloadKeys)) {
    fail(
      "inputpayload heeft ontbrekende, extra of verkeerd getypeerde top-level velden",
    );
  }
  return fullReport;
}

function validateAttachments(root, attachments) {
  if (!Array.isArray(attachments)) fail("attachments moet een array zijn");
  const seen = new Set();
  for (const attachment of attachments) {
    if (
      !exactKeys(attachment, ["type", "path", "sha256"]) ||
      !ATTACHMENT_TYPES.has(attachment.type) ||
      !SHA_256.test(attachment.sha256 ?? "") ||
      seen.has(attachment.path)
    ) {
      fail("iedere attachment moet uniek, getypeerd en SHA-256-gebonden zijn");
    }
    seen.add(attachment.path);
    const absolute = assertSafeEvidencePath(
      attachment.path,
      root,
      "attachmentpad",
      false,
    );
    assertNoSymlinkPath(root, absolute);
    if (!statSync(absolute).isFile())
      fail(`attachment is geen bestand: ${attachment.path}`);
    if (sha256(readFileSync(absolute)) !== attachment.sha256) {
      fail(`attachmenthash wijkt af: ${attachment.path}`);
    }
  }
}

function validateMatrixPathsNoSymlinks(root, verificationMatrix) {
  if (!verificationMatrix) return;
  const matrixRecords = [
    verificationMatrix.requirement,
    ...(Array.isArray(verificationMatrix.sharedMatrices)
      ? verificationMatrix.sharedMatrices
      : []),
  ].filter(Boolean);
  for (const matrixRecord of matrixRecords) {
    if (!Array.isArray(matrixRecord.shards)) continue;
    for (const shard of matrixRecord.shards) {
      const reportPath = assertSafeEvidencePath(
        shard.assertionReportPath,
        root,
        "assertionrapportpad",
      );
      assertNoSymlinkPath(root, reportPath);
      if (!statSync(reportPath).isFile()) {
        fail(`assertionrapport is geen bestand: ${shard.assertionReportPath}`);
      }
      const assertionReport = readJson(reportPath, "assertionrapport");
      if (!Array.isArray(assertionReport.attachments)) continue;
      for (const attachment of assertionReport.attachments) {
        const attachmentPath = assertSafeEvidencePath(
          attachment.path,
          root,
          "assertionattachmentpad",
          false,
        );
        assertNoSymlinkPath(root, attachmentPath);
        if (!statSync(attachmentPath).isFile()) {
          fail(`assertionattachment is geen bestand: ${attachment.path}`);
        }
      }
    }
  }
}

function validateRequiredAttachmentTypes(mode, item, attachments) {
  const types = new Set(attachments.map((attachment) => attachment.type));
  const commandIds = expectedCommandIds(mode, item);
  const required = new Set(
    EVIDENCE_MODES[mode].kind === "runtime" ? ["junit"] : ["log"],
  );
  if (commandIds.includes("fieldflow-browser")) required.add("trace");
  if (commandIds.includes("fieldflow-visual")) {
    required.add("screenshot");
    required.add("geometry");
  }
  const missing = [...required].filter((type) => !types.has(type));
  if (missing.length > 0)
    fail(`verplichte attachmenttypes ontbreken: ${missing.join(", ")}`);
}

function atomicWriteJson(root, reportPath, report) {
  const absolute = assertSafeEvidencePath(reportPath, root, "--report");
  if (existsSync(absolute)) assertNoSymlinkPath(root, absolute);
  assertNoSymlinkPath(root, dirname(absolute), { allowMissingLeaf: true });
  mkdirSync(dirname(absolute), { recursive: true });
  assertNoSymlinkPath(root, dirname(absolute));
  const temporary = `${absolute}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporary, absolute);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function buildAndValidateEvidenceReport({
  root = SCRIPT_ROOT,
  env = process.env,
  mode,
  subjectId,
  input,
  head,
}) {
  const item = loadSubject(root, subjectId);
  item.evidence = { commit: head };
  if (
    !expectedCommandIds(mode, item).includes(EVIDENCE_MODES[mode].commandId)
  ) {
    fail(
      `mode ${mode} is niet vereist door verificatiemethode ${item.verification}`,
    );
  }
  const matrix = readJson(
    resolve(
      root,
      "docs/uiux/fieldflow-calm-handoff/manifests/verification-matrix.json",
    ),
    "verificatiematrix",
  );
  const hasMatrix = Boolean(
    matrix.requirementBindings?.some(
      (binding) => binding.requirementId === subjectId,
    ),
  );
  const fullReport = validateInputShape(input, hasMatrix);
  const provenance = fullReport
    ? input.provenance
    : provenanceFromEnvironment(env, head, mode);
  const report = fullReport
    ? input
    : {
        schemaVersion: input.schemaVersion,
        kind: EVIDENCE_MODES[mode].kind,
        subjectId,
        headCommit: head,
        verification: item.verification,
        provenance,
        coverage: input.coverage,
        ...(hasMatrix ? { verificationMatrix: input.verificationMatrix } : {}),
        assertions: input.assertions,
        summary: input.summary,
        errors: input.errors,
        attachments: input.attachments,
      };
  if (
    report.schemaVersion !== 1 ||
    report.kind !== EVIDENCE_MODES[mode].kind ||
    report.subjectId !== subjectId ||
    report.headCommit !== head ||
    report.verification !== item.verification
  ) {
    fail(
      "rapport is niet exact aan mode, subject, verificatiemethode en HEAD gebonden",
    );
  }
  const forbidden = findForbiddenEvidenceOutcomes(report);
  if (forbidden.length > 0) {
    fail(
      `manual/skipped/notRun/failed evidence is verboden (${forbidden.join(", ")})`,
    );
  }
  validateProvenance(root, provenance, head, mode, env);
  validateAttachments(root, report.attachments);
  validateRequiredAttachmentTypes(mode, item, report.attachments);
  if (hasMatrix) {
    validateMatrixPathsNoSymlinks(root, report.verificationMatrix);
  }
  if (
    !exactKeys(report.errors, REPORT_ERROR_CHANNELS) ||
    REPORT_ERROR_CHANNELS.some(
      (channel) =>
        !Array.isArray(report.errors[channel]) ||
        report.errors[channel].length > 0,
    )
  ) {
    fail(
      "runtime-, request-, server-, page- of hydrationerrors moeten als lege arrays zijn vastgelegd",
    );
  }
  const errors = validateMachineEvidenceReport(item, report, {
    kind: EVIDENCE_MODES[mode].kind,
    commandIds: expectedCommandIds(mode, item),
    provenance,
    root,
    verifyFiles: true,
  });
  if (errors.length > 0)
    fail(`rapport voldoet niet aan het contract:\n- ${errors.join("\n- ")}`);
  return report;
}

export function runEvidenceCli(
  argv = process.argv.slice(2),
  { root = SCRIPT_ROOT, env = process.env } = {},
) {
  const options = parseEvidenceArgs(argv);
  const config = EVIDENCE_MODES[options.mode];
  const hasSubject = options.evidenceSubject !== null;
  const hasReport = options.report !== null;
  if (!hasSubject && !hasReport && options.mode === "browser") {
    return { legacyBrowserValidationOnly: true };
  }
  if (!hasSubject || !hasReport) {
    fail("--evidence-subject en --report zijn samen verplicht");
  }
  const head = fullGitHead(root);
  const expectedHead =
    options.expectedHead ??
    env.FIELDGRID_EXACT_HEAD ??
    env.GITHUB_HEAD_SHA ??
    (env.GITHUB_ACTIONS === "true" ? null : head);
  if (!GIT_SHA.test(expectedHead ?? "") || expectedHead !== head) {
    fail(
      `checkout HEAD ${head} wijkt af van de vereiste evidence-HEAD ${expectedHead ?? "<ontbreekt>"}`,
    );
  }
  const defaultInput = `outputs/fieldflow-calm/input/${options.evidenceSubject}.${options.mode}.json`;
  const inputPath =
    options.input ?? env.FIELDFLOW_CALM_EVIDENCE_INPUT ?? defaultInput;
  const absoluteInput = assertSafeEvidencePath(
    inputPath,
    root,
    "evidence-input",
  );
  const absoluteReport = assertSafeEvidencePath(
    options.report,
    root,
    "--report",
  );
  if (absoluteInput === absoluteReport)
    fail("input- en rapportpad moeten verschillen");
  assertNoSymlinkPath(root, absoluteInput);
  if (!statSync(absoluteInput).isFile())
    fail("evidence-input is geen regulier bestand");
  const input = readJson(absoluteInput, "evidence-input");
  const report = buildAndValidateEvidenceReport({
    root,
    env,
    mode: options.mode,
    subjectId: options.evidenceSubject,
    input,
    head,
  });
  atomicWriteJson(root, options.report, report);
  return {
    mode: options.mode,
    kind: config.kind,
    subjectId: options.evidenceSubject,
    headCommit: head,
    reportPath: options.report,
    reportSha256: sha256(readFileSync(absoluteReport)),
  };
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const result = runEvidenceCli();
    if (!result.legacyBrowserValidationOnly) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

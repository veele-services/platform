#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseTraceabilityRows } from "./fieldgrid-uiux-traceability.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MASTERPLAN = "docs/uiux/fieldgrid-codex-cloud-masterplan.md";
const TRACEABILITY_JSON = "docs/uiux/uiux-traceability.json";
const BASELINE = "docs/uiux/uiux-gate-baseline.json";
const REQUIRED_FILES = [
  "AGENTS.md",
  MASTERPLAN,
  "docs/uiux/uiux-traceability.md",
  TRACEABILITY_JSON,
  "docs/uiux/design-decisions.md",
  "docs/uiux/radix-shadcn-architecture.md",
  "docs/uiux/component-registry.md",
  "docs/uiux/branch-and-staging-runbook.md",
  "docs/uiux/evidence/.gitkeep",
];
const SOURCE_ROOTS = [
  "artifacts/backoffice/src",
  "artifacts/klant-pwa/src",
  "artifacts/personeel-pwa/src",
  "lib/shared-ui/src",
];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);

const RULES = [
  {
    id: "DIRECT_RADIX_IMPORT",
    pattern: /(?:from\s+|import\s*\()["']@radix-ui\/react-/u,
    message:
      "Direct Radix import outside the canonical primitive/adapter layer.",
  },
  {
    id: "PLACEHOLDER_COPY",
    pattern:
      /\b(?:volgt\s+in\s+(?:een\s+)?fase|komt\s+later|wordt\s+later\s+toegevoegd|binnenkort\s+beschikbaar)\b/iu,
    message: "Visible release placeholder copy.",
  },
  {
    id: "HIDDEN_FALSE_UI",
    pattern: /\bfalse\s*&&/u,
    message: "Permanently hidden legacy UI.",
  },
  {
    id: "BROWSER_DIALOG",
    pattern: /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/u,
    message: "Raw browser dialog instead of an in-product primitive.",
  },
  {
    id: "CUSTOM_OVERLAY",
    pattern:
      /(?:createPortal\s*\(|role=["']dialog["']|aria-modal=["']true["'])/u,
    message: "Page-specific overlay or dialog implementation.",
  },
  {
    id: "RAW_SELECT",
    pattern: /<select(?:\s|>)/u,
    message: "Raw select outside a documented native exception.",
  },
  {
    id: "RAW_CHOICE_CONTROL",
    pattern: /<input\b[^>]*\btype=["'](?:checkbox|radio)["']/u,
    message: "Raw checkbox or radio outside a documented native exception.",
  },
];

function normalizedPath(path) {
  return path.split(sep).join("/");
}

function isAllowedPrimitivePath(file) {
  const normalized = normalizedPath(file);
  return (
    normalized.includes("/components/ui/") ||
    normalized.includes("/components/radix-adapters/")
  );
}

function walk(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = resolve(root, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...walk(path));
    } else if (SOURCE_EXTENSIONS.has(extname(path))) {
      files.push(path);
    }
  }
  return files;
}

export function findingKey(finding) {
  const normalized = finding.source.trim().replaceAll(/\s+/gu, " ");
  const digest = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 16);
  return `${finding.rule}:${finding.file}:${digest}`;
}

export function scanReleasedSources(root = ROOT) {
  const findings = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    for (const absoluteFile of walk(resolve(root, sourceRoot))) {
      const file = normalizedPath(relative(root, absoluteFile));
      const lines = readFileSync(absoluteFile, "utf8").split(/\r?\n/u);

      lines.forEach((source, index) => {
        for (const rule of RULES) {
          if (
            rule.id === "DIRECT_RADIX_IMPORT" &&
            isAllowedPrimitivePath(absoluteFile)
          ) {
            continue;
          }
          if (
            rule.id === "CUSTOM_OVERLAY" &&
            isAllowedPrimitivePath(absoluteFile)
          ) {
            continue;
          }
          if (!rule.pattern.test(source)) continue;

          findings.push({
            rule: rule.id,
            file,
            line: index + 1,
            source: source.trim(),
            message: rule.message,
          });
        }
      });
    }
  }
  return findings;
}

export function validateTraceability(
  masterplan,
  payload,
  { strict = false } = {},
) {
  const expected = parseTraceabilityRows(masterplan);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const errors = [];
  const expectedIds = new Set(expected.map((item) => item.id));
  const actualIds = new Set(items.map((item) => item.id));

  for (const id of expectedIds) {
    if (!actualIds.has(id)) errors.push(`Missing traceability item ${id}.`);
  }
  for (const id of actualIds) {
    if (!expectedIds.has(id))
      errors.push(`Unexpected traceability item ${id}.`);
  }
  if (items.length !== actualIds.size)
    errors.push("Duplicate traceability IDs found.");

  for (const item of items) {
    for (const field of [
      "requirement",
      "workPackage",
      "status",
      "pr",
      "stagingResult",
    ]) {
      if (typeof item[field] !== "string" || item[field].trim() === "") {
        errors.push(`${item.id ?? "unknown"} has no ${field}.`);
      }
    }
    if (!Array.isArray(item.tests) || !Array.isArray(item.evidence)) {
      errors.push(
        `${item.id ?? "unknown"} must have tests and evidence arrays.`,
      );
    }

    if (strict) {
      if (!["DONE", "VERIFIED"].includes(item.status)) {
        errors.push(
          `${item.id} is ${item.status}; strict mode requires DONE/VERIFIED.`,
        );
      }
      if (!["PASS", "NOT_APPLICABLE"].includes(item.stagingResult)) {
        errors.push(`${item.id} has no passing staging result.`);
      }
      if (item.tests.length === 0)
        errors.push(`${item.id} has no test evidence.`);
      if (item.evidence.length === 0)
        errors.push(`${item.id} has no evidence path.`);
    }
  }

  return errors;
}

function loadJson(relativePath) {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), "utf8"));
}

function validateRequiredFiles() {
  return REQUIRED_FILES.filter((file) => !existsSync(resolve(ROOT, file))).map(
    (file) => `Missing required file ${file}.`,
  );
}

function validateEvidencePaths(items) {
  const errors = [];
  for (const item of items) {
    for (const evidence of item.evidence) {
      if (!existsSync(resolve(ROOT, evidence))) {
        errors.push(`${item.id} evidence does not exist: ${evidence}`);
      }
    }
  }
  return errors;
}

function loadBaseline() {
  if (!existsSync(resolve(ROOT, BASELINE))) return new Set();
  const payload = loadJson(BASELINE);
  return new Set(payload.findings ?? []);
}

function writeBaseline(findings) {
  const payload = {
    schemaVersion: 1,
    purpose:
      "Temporary W00 inventory. Check mode rejects new findings; strict mode rejects every finding.",
    findings: [...new Set(findings.map(findingKey))].sort(),
  };
  writeFileSync(
    resolve(ROOT, BASELINE),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

export function runGate(argv = process.argv.slice(2)) {
  const strict = argv.includes("--strict");
  const check = strict || argv.includes("--check");
  const writeBaselineRequested = argv.includes("--write-baseline");
  const errors = validateRequiredFiles();
  const masterplanPath = resolve(ROOT, MASTERPLAN);
  const traceabilityPath = resolve(ROOT, TRACEABILITY_JSON);

  let traceability = { items: [] };
  if (existsSync(masterplanPath) && existsSync(traceabilityPath)) {
    traceability = loadJson(TRACEABILITY_JSON);
    errors.push(
      ...validateTraceability(
        readFileSync(masterplanPath, "utf8"),
        traceability,
        {
          strict,
        },
      ),
    );
  }

  const findings = scanReleasedSources();
  if (writeBaselineRequested) {
    writeBaseline(findings);
    process.stdout.write(
      `Recorded ${findings.length} W00 baseline findings.\n`,
    );
    return errors.length === 0 ? 0 : 1;
  }

  const baseline = loadBaseline();
  const activeFindings = strict
    ? findings
    : findings.filter((finding) => !baseline.has(findingKey(finding)));

  if (check && activeFindings.length > 0) {
    errors.push(
      ...activeFindings.map(
        (finding) =>
          `${finding.rule} ${finding.file}:${finding.line} — ${finding.message}`,
      ),
    );
  }
  if (strict) errors.push(...validateEvidencePaths(traceability.items ?? []));

  const summary = {
    mode: strict ? "strict" : check ? "check" : "report",
    traceabilityItems: traceability.items?.length ?? 0,
    findings: findings.length,
    baselineFindings: findings.length - activeFindings.length,
    activeFindings: activeFindings.length,
    errors: errors.length,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (errors.length > 0) {
    process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
    return 1;
  }
  return 0;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  process.exitCode = runGate();
}

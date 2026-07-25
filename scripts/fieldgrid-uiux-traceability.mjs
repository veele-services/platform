#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MASTERPLAN_PATH = resolve(
  ROOT,
  "docs/uiux/fieldgrid-codex-cloud-masterplan.md",
);
const JSON_PATH = resolve(ROOT, "docs/uiux/uiux-traceability.json");
const MARKDOWN_PATH = resolve(ROOT, "docs/uiux/uiux-traceability.md");

export function parseTraceabilityRows(markdown) {
  const rows = [];
  const seen = new Set();

  for (const line of markdown.split(/\r?\n/u)) {
    const match = line.match(
      /^\|\s*((?:PB|UX|RADIX)-\d{3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/u,
    );
    if (!match || seen.has(match[1])) continue;

    seen.add(match[1]);
    rows.push({
      id: match[1],
      requirement: match[2].trim(),
      workPackage: match[3].trim(),
    });
  }

  return rows.sort((left, right) =>
    left.id.localeCompare(right.id, "en", { numeric: true }),
  );
}

function loadExisting() {
  if (!existsSync(JSON_PATH)) return new Map();

  const parsed = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  return new Map((parsed.items ?? []).map((item) => [item.id, item]));
}

function buildItems(masterplan, existing) {
  return parseTraceabilityRows(masterplan).map((row) => {
    const previous = existing.get(row.id) ?? {};
    return {
      ...row,
      status: previous.status ?? "OPEN",
      pr: previous.pr ?? "LOCAL_ONLY",
      tests: previous.tests ?? [],
      evidence: previous.evidence ?? [],
      stagingResult: previous.stagingResult ?? "NOT_RUN",
      notes: previous.notes ?? "",
    };
  });
}

function markdownCell(value) {
  if (Array.isArray(value)) return value.length > 0 ? value.join("<br>") : "—";
  const text = String(value || "—");
  return text.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function renderMarkdown(items) {
  const lines = [
    "# Fieldgrid UI/UX traceability",
    "",
    "This file is generated from the canonical masterplan and `uiux-traceability.json` by `scripts/fieldgrid-uiux-traceability.mjs`.",
    "",
    "| ID | Requirement | Work package | Status | PR | Tests | Evidence | Staging result | Notes |",
    "|---|---|---|---|---|---|---|---|---|",
  ];

  for (const item of items) {
    lines.push(
      `| ${[
        item.id,
        item.requirement,
        item.workPackage,
        item.status,
        item.pr,
        item.tests,
        item.evidence,
        item.stagingResult,
        item.notes,
      ]
        .map(markdownCell)
        .join(" | ")} |`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

export function generateTraceability() {
  const masterplan = readFileSync(MASTERPLAN_PATH, "utf8");
  const items = buildItems(masterplan, loadExisting());
  const payload = {
    schemaVersion: 1,
    source: "docs/uiux/fieldgrid-codex-cloud-masterplan.md",
    items,
  };

  writeFileSync(JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  writeFileSync(MARKDOWN_PATH, renderMarkdown(items), "utf8");
  return items;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  if (process.argv.includes("--write")) {
    const items = generateTraceability();
    process.stdout.write(`Generated ${items.length} traceability items.\n`);
  } else {
    process.stderr.write(
      "Refusing to modify traceability without the explicit --write option.\n",
    );
    process.exitCode = 2;
  }
}

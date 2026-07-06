#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const outputDir =
  process.env.FIELDGRID_KB_ROADMAP_RELEASE_PHASE5_OUT_DIR ||
  join(process.cwd(), "outputs", "kb-roadmap-release-phase5-autocomplete");

const report = {
  createdAt: new Date().toISOString(),
  mode: checkOnly ? "check" : "full",
  checks: [
    checkSearchHelper(),
    checkSurfaceActions(),
    checkApiRoutes(),
    checkAutocompleteComponents(),
    checkHelpPages(),
  ],
};

await mkdir(outputDir, { recursive: true });
const reportPath = join(outputDir, "phase5-autocomplete.json");
await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

const failures = report.checks.flatMap((check) =>
  check.failures.map((failure) => ({ check: check.id, ...failure })),
);

if (failures.length > 0) {
  console.error(`Knowledgebase phase 5 autocomplete gate failed. Report: ${reportPath}`);
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Knowledgebase phase 5 autocomplete gate passed. Report: ${reportPath}`);

function read(path) {
  return readFileSync(path, "utf8");
}

function fileExists(path) {
  return existsSync(path);
}

function failure(message, evidence = null) {
  return { message, evidence };
}

function check(id, label, failures) {
  return { id, label, status: failures.length === 0 ? "passed" : "failed", failures };
}

function expectFileContains(path, expectations) {
  const failures = [];
  if (!fileExists(path)) return [failure(`Missing file: ${path}`)];
  const text = read(path);
  for (const expectation of expectations) {
    const found = typeof expectation.pattern === "string"
      ? text.includes(expectation.pattern)
      : expectation.pattern.test(text);
    if (!found) failures.push(failure(expectation.message, path));
  }
  return failures;
}

function checkSearchHelper() {
  const path = "lib/db/src/knowledgebase-content.ts";
  const failures = expectFileContains(path, [
    { pattern: "...article.moduleKeys", message: "Search text must include article module keys." },
    { pattern: "...article.requiredModuleKeys", message: "Search text must include required module keys." },
    { pattern: "listKnowledgebaseSearchSuggestionsForContext", message: "Suggestion helper must remain exported." },
    { pattern: "recordKnowledgebaseSearchEvent", message: "Search analytics helper must remain available." },
  ]);
  const text = fileExists(path) ? read(path) : "";
  if (/plainto_tsquery|to_tsvector/u.test(text)) {
    failures.push(failure("Search must not prefilter before module/category in-memory matching.", path));
  }
  return check("search-helper", "Search helper covers title, content, keywords, smart terms, category and module", failures);
}

function checkSurfaceActions() {
  const files = [
    "artifacts/backoffice/src/app/actions/knowledgebase-help.ts",
    "artifacts/klant-pwa/src/actions/knowledgebase.ts",
    "artifacts/personeel-pwa/src/actions/knowledgebase.ts",
  ];
  const failures = files.flatMap((path) => expectFileContains(path, [
    { pattern: "listKnowledgebaseSearchSuggestionsForContext", message: "Surface action must call visibility-filtered suggestions." },
    { pattern: /get.*KnowledgebaseSearchSuggestions/u, message: "Surface action must export search suggestions." },
  ]));
  return check("surface-actions", "All surfaces expose visibility-filtered suggestion actions", failures);
}

function checkApiRoutes() {
  const files = [
    "artifacts/backoffice/src/app/api/help/search-suggestions/route.ts",
    "artifacts/klant-pwa/src/app/api/help/search-suggestions/route.ts",
    "artifacts/personeel-pwa/src/app/api/help/search-suggestions/route.ts",
  ];
  const failures = files.flatMap((path) => expectFileContains(path, [
    { pattern: "NextResponse.json", message: "Suggestion route must return JSON." },
    { pattern: "suggestions", message: "Suggestion route must return suggestions key." },
  ]));
  return check("api-routes", "All surfaces have autocomplete JSON endpoints", failures);
}

function checkAutocompleteComponents() {
  const files = [
    "artifacts/backoffice/src/components/knowledgebase/KnowledgebaseAutocompleteSearch.tsx",
    "artifacts/klant-pwa/src/components/KnowledgebaseAutocompleteSearch.tsx",
    "artifacts/personeel-pwa/src/components/KnowledgebaseAutocompleteSearch.tsx",
  ];
  const failures = files.flatMap((path) => expectFileContains(path, [
    { pattern: 'role="combobox"', message: "Autocomplete input must expose combobox semantics." },
    { pattern: 'role="listbox"', message: "Autocomplete suggestions must expose listbox semantics." },
    { pattern: "ArrowDown", message: "Autocomplete must support keyboard navigation." },
    { pattern: "pointerdown", message: "Autocomplete must close on outside tap/click." },
    { pattern: "fetch(`${endpoint}?q=", message: "Autocomplete must fetch suggestions while typing." },
  ]));
  return check("autocomplete-components", "Autocomplete components work on desktop and mobile", failures);
}

function checkHelpPages() {
  const files = [
    "artifacts/backoffice/src/app/(dashboard)/help/page.tsx",
    "artifacts/klant-pwa/src/app/(app)/help/page.tsx",
    "artifacts/personeel-pwa/src/app/(app)/help/page.tsx",
  ];
  const failures = files.flatMap((path) => expectFileContains(path, [
    { pattern: "KnowledgebaseAutocompleteSearch", message: "Help page must use the shared autocomplete experience." },
    { pattern: "Geen artikelen gevonden", message: "Help page must include no-results state." },
  ]));
  for (const path of files) {
    const text = fileExists(path) ? read(path) : "";
    if (/<datalist|list=/u.test(text)) {
      failures.push(failure("Help page must not use native datalist fallback instead of autocomplete UX.", path));
    }
  }
  return check("help-pages", "All Help pages use autocomplete and no-results states", failures);
}

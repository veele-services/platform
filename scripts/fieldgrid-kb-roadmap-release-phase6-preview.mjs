#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const outputDir =
  process.env.FIELDGRID_KB_ROADMAP_RELEASE_PHASE6_OUT_DIR ||
  join(process.cwd(), "outputs", "kb-roadmap-release-phase6-preview");

const report = {
  createdAt: new Date().toISOString(),
  mode: checkOnly ? "check" : "full",
  checks: [
    checkSharedVisibilityExplanations(),
    checkPreviewService(),
    checkPreviewComponent(),
    checkPlatformPages(),
    checkCompletionPlan(),
  ],
};

await mkdir(outputDir, { recursive: true });
const reportPath = join(outputDir, "phase6-preview.json");
await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

const failures = report.checks.flatMap((check) =>
  check.failures.map((failure) => ({ check: check.id, ...failure })),
);

if (failures.length > 0) {
  console.error(`Knowledgebase phase 6 preview gate failed. Report: ${reportPath}`);
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Knowledgebase phase 6 preview gate passed. Report: ${reportPath}`);

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

function checkSharedVisibilityExplanations() {
  const failures = [
    ...expectFileContains("lib/db/src/content-visibility.ts", [
      { pattern: "explainPublishedContentVisibility", message: "KB preview must use a shared content visibility explanation." },
      { pattern: "matchesTenantScope", message: "Explanation must reuse tenant scope helper." },
      { pattern: "matchesAudienceScope", message: "Explanation must reuse audience scope helper." },
      { pattern: "matchesModuleScope", message: "Explanation must reuse module scope helper." },
      { pattern: "matchesPermissionScope", message: "Explanation must reuse permission scope helper." },
    ]),
    ...expectFileContains("lib/db/src/release-content.ts", [
      { pattern: "explainReleaseVisibility", message: "Release preview must expose a shared visibility explanation." },
      { pattern: "canReadRelease(context, release", message: "Release explanation must call the runtime release resolver." },
    ]),
    ...expectFileContains("lib/db/src/knowledgebase-tooltips.ts", [
      { pattern: "explainKnowledgebaseFeatureHelpVisibility", message: "Tooltip preview must expose a shared visibility explanation." },
      { pattern: "getKnowledgebaseFeatureHelpForContext(context, featureKey", message: "Tooltip explanation must call the runtime tooltip resolver first." },
    ]),
  ];
  return check("shared-visibility", "Preview explanations are shared with runtime visibility helpers", failures);
}

function checkPreviewService() {
  const path = "artifacts/backoffice/src/lib/platform-content-preview.ts";
  const failures = expectFileContains(path, [
    { pattern: "PLATFORM_PREVIEW_MODES", message: "Preview modes must be centralized." },
    { pattern: "tenant_admin", message: "Tenant admin preview mode must exist." },
    { pattern: "tenant_management", message: "Management preview mode must exist." },
    { pattern: "tenant_planning", message: "Planning preview mode must exist." },
    { pattern: "tenant_administration", message: "Administration preview mode must exist." },
    { pattern: "tenant_personnel", message: "Personnel preview mode must exist." },
    { pattern: "tenant_customer", message: "Customer preview mode must exist." },
    { pattern: "listEnabledKnowledgebaseModuleKeysForTenant", message: "Preview must use tenant module entitlements." },
    { pattern: "getPlatformContentPreviewModel", message: "Preview service must expose a server model." },
    { pattern: "previewTenantId", message: "Preview must parse tenant selector." },
    { pattern: "previewModuleKeys", message: "Preview must parse module selector." },
    { pattern: "explainPublishedContentVisibility", message: "KB preview must use shared visibility explanation." },
    { pattern: "explainReleaseVisibility", message: "Release preview must use shared visibility explanation." },
    { pattern: "explainKnowledgebaseFeatureHelpVisibility", message: "Tooltip preview must use shared visibility explanation." },
  ]);
  return check("preview-service", "Platform preview service supports mode, tenant and module selectors", failures);
}

function checkPreviewComponent() {
  const path = "artifacts/backoffice/src/components/platform/PlatformContentPreviewPanel.tsx";
  const failures = expectFileContains(path, [
    { pattern: 'name="previewMode"', message: "Preview UI must include mode selector." },
    { pattern: 'name="previewTenantId"', message: "Preview UI must include tenant selector." },
    { pattern: 'name="previewModuleKeys"', message: "Preview UI must include module selector." },
    { pattern: "Runtime context", message: "Preview UI must show runtime context." },
    { pattern: "Zichtbaar", message: "Preview UI must show visible content." },
    { pattern: "Verborgen", message: "Preview UI must show hidden content." },
    { pattern: "item.reasons", message: "Preview UI must render hidden reasons." },
  ]);
  return check("preview-component", "Platform preview component renders controls and explanations", failures);
}

function checkPlatformPages() {
  const files = [
    "artifacts/backoffice/src/app/(platform)/platform/knowledgebase/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/releases/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/knowledgebase/tooltips/page.tsx",
  ];
  const failures = files.flatMap((path) => expectFileContains(path, [
    { pattern: "PlatformContentPreviewPanel", message: "Page must render platform preview panel." },
    { pattern: "getPlatformContentPreviewModel", message: "Page must load platform preview model." },
    { pattern: "previewMode", message: "Page must accept preview mode query params." },
    { pattern: "previewTenantId", message: "Page must accept preview tenant query params." },
    { pattern: "previewModuleKeys", message: "Page must accept preview module query params." },
  ]));
  return check("platform-pages", "KB, release and tooltip management pages expose preview controls", failures);
}

function checkCompletionPlan() {
  const path = "docs/knowledgebase-roadmap-release-completion-plan.md";
  const failures = expectFileContains(path, [
    { pattern: "Fase 6 - Platform Preview Als Audience/Tenant/Rol", message: "Completion plan must document phase 6." },
    { pattern: "PlatformContentPreviewPanel", message: "Completion plan must mention preview UI component." },
    { pattern: "fieldgrid:kb-roadmap-release-phase6-preview:check", message: "Completion plan must mention phase 6 gate." },
  ]);
  return check("completion-plan", "Completion plan documents phase 6 implementation and gate", failures);
}

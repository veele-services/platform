import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("sprint 14 extends platform tenant detail with operational readiness data", () => {
  const actions = read("artifacts/backoffice/src/app/actions/platform-tenants.ts");

  assertContains(
    actions,
    [
      "PlatformTenantOperationalReadiness",
      "PlatformTenantBrandingSurfacePreview",
      "PlatformTenantUsageLimit",
      "buildOperationalReadiness",
      "downloadAuditEvents",
      "pdfAuditEvents",
      "tenantPrefixedDocuments",
      "legacyDocumentPaths",
      "activeRegions",
      "migrationHistoryTables",
      "planLimitsTable",
      "supportAccessAuditLogTable",
      "tenantRegionsTable",
      "Backoffice",
      "Klantportaal",
      "Personeelsapp",
      "E-mail",
      "PDF",
    ],
    "platform tenant actions",
  );
});

test("sprint 14 tenant detail renders readiness, channel previews and limits", () => {
  const tenantPage = read("artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx");

  assertContains(
    tenantPage,
    [
      "Operational readiness",
      "tenant.operationalReadiness.score",
      "tenant.operationalReadiness.signals",
      "statusChipClass(readinessTone(signal.status))",
      "tenant.brandingPreview.surfaces",
      "Downloads/PDF",
      "Planlimieten",
      "Legacy storagepaden",
      "tenant.usageLimits",
      "tenant.usage.downloadAuditEvents",
      "tenant.usage.tenantPrefixedDocuments",
      "tenant.usage.legacyDocumentPaths",
    ],
    "tenant detail page",
  );
});

test("sprint 14 docs capture operational readiness scope and runtime proof status", () => {
  const sprint14 = read("docs/fieldgrid-sprint-14-operational-readiness.md");
  const sprintPlan = read("docs/fieldgrid-saas-proof-sprint-plan.md");
  const testMatrix = read("docs/fieldgrid-cross-tenant-testmatrix.md");

  assertContains(
    `${sprint14}\n${sprintPlan}\n${testMatrix}`,
    [
      "Sprint 14",
      "Operational readiness",
      "Usage dashboard",
      "Branding preview",
      "FG-OPS-003",
      "FG-OPS-004",
      "runtime-proof-open",
      "geen migratie",
      "Supabase changelog",
    ],
    "sprint 14 canon",
  );
});

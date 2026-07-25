import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  const normalizedContent = content.replace(/\s+/gu, " ");
  for (const phrase of phrases) {
    assert.ok(
      normalizedContent.includes(phrase.replace(/\s+/gu, " ")),
      `${label} should contain ${phrase}`,
    );
  }
}

test("phase 6 extends platform tenant detail with first-run and branding data", () => {
  const actions = read("artifacts/backoffice/src/app/actions/platform-tenants.ts");

  assertContains(
    actions,
    [
      "PlatformTenantFirstRun",
      "PlatformTenantBrandingPreview",
      "buildFirstRunStatus",
      "buildBrandingPreview",
      "getTenantBranding",
      "FIELDGRID_BRAND_DEFAULTS",
      "documents: sql<number>`(SELECT count(*) FROM documents",
      "storageBytes: sql<number>`COALESCE((SELECT sum(size_bytes) FROM documents",
      "brandingPreview",
      "firstRun",
    ],
    "platform tenant actions",
  );
});

test("phase 6 tenant detail renders first-run, usage and branding preview", () => {
  const tenantPage = read("artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx");

  assertContains(
    tenantPage,
    [
      "First-run",
      "tenant.firstRun.steps",
      "Branding preview",
      "tenant.brandingPreview.primaryColor",
      "tenant.brandingPreview.accentColor",
      "Documenten",
      "tenant.usage.documents",
      "formatBytes(tenant.usage.storageBytes)",
      "Gebruikscijfers voor beheer, support en abonnementsgrenzen.",
    ],
    "tenant detail page",
  );
});

test("phase 6 platform page exposes onboarding wizard structure", () => {
  const platformPage = read("artifacts/backoffice/src/app/(platform)/platform/page.tsx");

  assertContains(
    platformPage,
    [
      "Tenant onboarding wizard",
      "OnboardingStep",
      "Tenant provisionen",
      "Provisioning service",
      "Modules, sectoren en first-run",
      "Owner-uitnodiging wordt direct verstuurd",
    ],
    "platform page",
  );
});

test("phase 6 documentation captures staging-safe productization scope", () => {
  const phase6 = read("docs/fieldgrid-phase-6-productization.md");

  assertContains(
    phase6,
    [
      "fase 6 productisering",
      "Platform-admin onboarding",
      "Tenantdetail krijgt `firstRun` statusdata",
      "storage estimate",
      "Branding preview",
      "FG-USAGE-001",
      "FG-BRANDING-001",
      "geen migraties",
      "geen bestaande tenantdata gewijzigd",
    ],
    "phase 6 docs",
  );
});

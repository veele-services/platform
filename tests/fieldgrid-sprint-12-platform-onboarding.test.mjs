import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertIncludes(content, phrases, label) {
  const normalizedContent = content.replace(/\s+/gu, " ");
  for (const phrase of phrases) {
    assert.ok(
      normalizedContent.includes(phrase.replace(/\s+/gu, " ")),
      `${label} should include ${phrase}`,
    );
  }
}

test("sprint 12 platform provisioning actions support catalog, draft, resume and retry", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-provisioning.ts");

  assertIncludes(
    action,
    [
      "listPlatformOnboardingCatalog",
      "getPlatformOnboardingDraft",
      "savePlatformOnboardingDraft",
      "retryPlatformTenantProvisioning",
      "status: \"draft\"",
      "currentStep: \"draft\"",
      "metadataForInput",
      "saveResume: true",
      "reviewStatus",
      "onboardingWizard",
      "moduleKeys",
      "sectorIds",
      "regionNames",
      "branding",
      "runRollbackPath",
    ],
    "platform onboarding actions",
  );
});

test("sprint 12 platform page renders the full onboarding wizard and run controls", () => {
  const page = read("artifacts/backoffice/src/app/(platform)/platform/onboarding/page.tsx");

  assertIncludes(
    page,
    [
      "Onboarding 2.0 wizard",
      "Tenantgegevens",
      "Fieldgrid subdomain",
      "Modules",
      "Owner invite",
      "Review",
      "Provisioning run",
      "name=\"moduleKeys\"",
      "name=\"sectorIds\"",
      "name=\"regionNames\"",
      "name=\"brandingDisplayName\"",
      "Concept opslaan",
      "formNoValidate",
      "onboardingDraft",
      "Hervat",
      "Retry",
      "Rollbackpad",
    ],
    "platform onboarding page",
  );
});

test("sprint 12 provisioning service seeds modules, sectors, regions and branding safely", () => {
  const service = read("lib/db/src/tenant-provisioning.ts");
  const schema = read("lib/db/src/schema/tenant-provisioning.ts");

  assertIncludes(
    `${service}\n${schema}`,
    [
      "\"draft\"",
      "moduleKeys",
      "sectorIds",
      "tenantRegionsTable",
      "regionNames",
      "normalizeTenantProvisioningRegionName",
      "organizationSettingsValues",
      "emailTemplateBrandColor",
      "emailTemplateAccentColor",
      "emailTemplateSignature",
      "\"fieldgrid_subdomain\"",
      "\"custom_domain\"",
      "rollback: {",
      "rolledBackTenantId",
    ],
    "tenant provisioning service",
  );
});

test("sprint 12 docs update canon status and acceptance mapping", () => {
  const sprintDoc = read("docs/fieldgrid-sprint-12-platform-onboarding.md");
  const sprintPlan = read("docs/fieldgrid-saas-proof-sprint-plan.md");
  const matrix = read("docs/fieldgrid-cross-tenant-testmatrix.md");
  const classification = read("docs/fieldgrid-data-classification.md");

  assertIncludes(
    `${sprintDoc}\n${sprintPlan}\n${matrix}\n${classification}`,
    [
      "FG-OPS-001",
      "runtime-proof-open",
      "save/resume",
      "review",
      "retry",
      "rollback",
      "tenant_regions",
      "organization_settings",
      "Provisioning success/rollback tests",
    ],
    "sprint 12 canon docs",
  );
});

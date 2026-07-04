import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertIncludes(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should include ${phrase}`);
  }
}

test("sprint 13 promotes first-run from checklist to wizard status", () => {
  const actions = read("artifacts/backoffice/src/app/actions/tenant-first-run.ts");
  const types = read("artifacts/backoffice/src/app/actions/tenant-first-run.types.ts");

  assertIncludes(
    actions,
    [
      "FIRST_RUN_WIZARD_STEPS",
      "getTenantFirstRunWizard",
      "saveTenantFirstRunWizardDraft",
      "finishTenantFirstRunWizard",
      "readinessWarnings",
      "readinessScore",
      "organizationSettingsTable",
      "tenantRegionsTable",
      "tenantFirstRunStateTable",
      "completedSteps",
      "requiredSteps",
    ],
    "tenant first-run actions",
  );
  assertIncludes(
    types,
    ["export const FIRST_RUN_WIZARD_STEPS", "export type TenantFirstRunWizardStep"],
    "tenant first-run types",
  );
  assert.ok(
    !actions.includes("export const FIRST_RUN_WIZARD_STEPS"),
    "tenant first-run server action should not export runtime constants",
  );
});

test("sprint 13 wizard covers tenant setup domains and save resume controls", () => {
  const page = read("artifacts/backoffice/src/app/(dashboard)/first-run/page.tsx");

  assertIncludes(
    page,
    [
      "Tenant first-run wizard",
      "Tenant onboarding",
      "Bedrijfsgegevens",
      "Branding",
      "Sectoren, regio's en modules",
      "Gebruikers, basisinstellingen en eerste data",
      "Eerste klant/object/opdracht",
      "Readiness warnings",
      "Concept opslaan",
      "Afronden",
      "Markeer gereed",
      "Overslaan",
    ],
    "tenant first-run page",
  );
});

test("sprint 13 readiness uses existing tenant data without new migrations", () => {
  const actions = read("artifacts/backoffice/src/app/actions/tenant-first-run.ts");
  const sprintDoc = read("docs/fieldgrid-sprint-13-tenant-first-run.md");
  const sprintPlan = read("docs/fieldgrid-saas-proof-sprint-plan.md");
  const matrix = read("docs/fieldgrid-cross-tenant-testmatrix.md");

  assertIncludes(
    actions,
    [
      "tenantUsersTable",
      "tenantModulesTable",
      "tenantSectorsTable",
      "customersTable",
      "objectsTable",
      "assignmentsTable",
      "tenantId",
    ],
    "tenant readiness sources",
  );
  assertIncludes(
    `${sprintDoc}\n${sprintPlan}\n${matrix}`,
    [
      "FG-OPS-002",
      "tenant first-run wizard",
      "Owner kan een concept opslaan en later hervatten",
      "geen nieuwe migratie",
      "Tenant first-run wizard | `post-launch-accepted` | Sprint 13/16",
    ],
    "sprint 13 canon",
  );
});

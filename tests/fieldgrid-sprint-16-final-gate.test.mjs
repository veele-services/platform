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

test("sprint 16 script defines a read-only final gate contract", () => {
  const script = read("scripts/fieldgrid-sprint16-final-gate.mjs");
  const packageJson = read("package.json");

  assertContains(
    script,
    [
      "SPRINT16_FINAL_GATE_VERSION",
      "sprint-16-final-gate-v1",
      "post-launch-accepted",
      "finalGateRequirements",
      "postLaunchExceptions",
      "collectServiceRoleUsage",
      "SUPABASE_SERVICE_ROLE_KEY",
      "FG-FINAL-PERFORMANCE",
      "FG-FINAL-SERVICE-ROLE",
      "FG-FINAL-STAGING-COPY",
      "FG-FINAL-RUNTIME-PROOF",
      "FG-FINAL-EXTERNAL-TENANT",
      "FG-POST-STORAGE-PROOF",
      "destructive: false",
      "noMigration: true",
      "https://supabase.com/changelog.md",
      "Postgres 14",
      "Data/GraphQL API",
    ],
    "sprint 16 script",
  );

  assertContains(
    packageJson,
    ["fieldgrid:sprint16-final-gate", "fieldgrid:sprint16-final-gate:check"],
    "package scripts",
  );
});

test("sprint 16 extends the staging smoke dashboard with the external tenant gate", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-smoke.ts");
  const page = read("artifacts/backoffice/src/app/(platform)/platform/staging-smoke/page.tsx");

  assertContains(
    action,
    [
      "PlatformFinalExternalTenantGate",
      "PlatformFinalGateRequirement",
      "PlatformPostLaunchException",
      "buildFinalExternalTenantGate",
      "finalExternalTenantGate",
      "FG-FINAL-PERFORMANCE",
      "FG-POST-RUNTIME-E2E",
      "postLaunchExceptions",
      "artifacts/final-gate",
    ],
    "platform smoke action",
  );

  assertContains(
    page,
    [
      "Finale externe tenant gate",
      "Post-launch accepted register",
      "dashboard.finalExternalTenantGate",
      "FinalGateCard",
      "gate.requirements",
      "gate.postLaunchExceptions",
    ],
    "staging smoke page",
  );
});

test("sprint 16 canon captures final gate and post-launch acceptance", () => {
  const sprint16 = read("docs/fieldgrid-sprint-16-final-gate.md");
  const sprintPlan = read("docs/fieldgrid-saas-proof-sprint-plan.md");
  const dataClassification = read("docs/fieldgrid-data-classification.md");
  const matrix = read("docs/fieldgrid-cross-tenant-testmatrix.md");
  const firstTenant = read("docs/fieldgrid-first-external-tenant-checklist.md");
  const stagingChecklist = read("docs/fieldgrid-staging-promotion-checklist.md");

  assertContains(
    `${sprint16}\n${sprintPlan}\n${dataClassification}\n${matrix}\n${firstTenant}\n${stagingChecklist}`,
    [
      "Sprint 16",
      "Final hardening en externe tenant gate",
      "post-launch-accepted",
      "performance review",
      "service-role",
      "staging-copy",
      "eerste externe tenant checklist",
      "FG-FINAL-PERFORMANCE",
      "FG-FINAL-SERVICE-ROLE",
      "FG-FINAL-STAGING-COPY",
      "FG-POST-AUDIT-CENTRALIZATION",
      "geen migratie",
      "Supabase changelog",
      "Postgres 14",
      "Data/GraphQL API",
    ],
    "sprint 16 canon",
  );
});

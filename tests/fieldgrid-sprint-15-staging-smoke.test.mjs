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

test("sprint 15 extends staging smoke data with run history and live smoke contracts", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-smoke.ts");
  const types = read("artifacts/backoffice/src/app/actions/platform-smoke.types.ts");

  assertContains(
    `${action}\n${types}`,
    [
      "PlatformSmokeRunHistoryEntry",
      "PlatformLiveSmokeTarget",
      "PlatformMigrationSmokeStatus",
      "PlatformMutatingSmokeCheck",
      "readSmokeRunReports",
      "runHistory",
      "liveSmokes",
      "migrationSmoke",
      "mutatingChecks",
      "tenantRegionsTable",
      "FG-LIVE-HOST",
      "FG-LIVE-PERSONNEL-PLANNING",
      "FG-MUTATE-LIFECYCLE",
      "FIELDGRID_MUTATING_SMOKE_CONFIRM=demo-tenants-only",
    ],
    "platform smoke action",
  );
});

test("sprint 15 staging smoke page renders run history, live smokes and cleanup", () => {
  const page = read("artifacts/backoffice/src/app/(platform)/platform/staging-smoke/page.tsx");

  assertContains(
    page,
    [
      "Run history",
      "Live Playwright-smokes",
      "Migratie-smoke status",
      "Mutating checks en cleanup",
      "dashboard.runHistory",
      "dashboard.liveSmokes",
      "dashboard.migrationSmoke",
      "dashboard.mutatingChecks",
      "FG-OPS-008",
      "platform-smoke.types",
      "RunHistoryCard",
      "LiveSmokeCard",
      "MutatingCheckCard",
    ],
    "staging smoke page",
  );
});

test("sprint 15 script is plan-only by default and supports read-only snapshots", () => {
  const script = read("scripts/fieldgrid-sprint15-staging-smoke.mjs");
  const packageJson = read("package.json");

  assertContains(
    script,
    [
      "fieldgrid-sprint-15-staging-smoke",
      "FIELDGRID_STAGING_SMOKE_COOKIE",
      "FIELDGRID_STAGING_SMOKE_BEARER",
      "FIELDGRID_MUTATING_SMOKE_CONFIRM",
      "runReadOnlySnapshot",
      "artifacts/staging-smoke",
      "artifacts/migration-smoke",
      "liveSmokeTargets",
      "mutatingChecks",
      "cleanupSelectors",
      "Playwright",
      "destructive: false",
      "mutatesExistingTenants: false",
    ],
    "sprint 15 script",
  );
  assertContains(
    packageJson,
    [
      "fieldgrid:sprint15-staging-smoke",
      "fieldgrid:sprint15-staging-smoke:check",
      "fieldgrid:sprint15-staging-smoke:run-read-only",
    ],
    "package scripts",
  );
});

test("sprint 15 docs capture staging smoke dashboard delivery", () => {
  const sprint15 = read("docs/fieldgrid-sprint-15-staging-smoke.md");
  const sprintPlan = read("docs/fieldgrid-saas-proof-sprint-plan.md");
  const testMatrix = read("docs/fieldgrid-cross-tenant-testmatrix.md");

  assertContains(
    `${sprint15}\n${sprintPlan}\n${testMatrix}`,
    [
      "Sprint 15",
      "Staging smoke dashboard",
      "Run history",
      "Live Playwright-smokes",
      "Migratie-smoke status",
      "Mutating checks en cleanup",
      "FG-OPS-008",
      "runtime-proof-open",
      "geen migratie",
      "Supabase changelog",
    ],
    "sprint 15 canon",
  );
});

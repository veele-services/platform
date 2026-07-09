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

test("phase 11 exposes a platform operations dashboard action", () => {
  const operations = read("artifacts/backoffice/src/app/actions/platform-operations.ts");

  assertContains(
    operations,
    [
      "getPlatformOperationsDashboard",
      "getPlatformStagingSmokeDashboard",
      "PlatformOperationsHealthCheck",
      "\"backoffice\" | \"api\" | \"klant-pwa\" | \"personeel-pwa\" | \"database\" | \"storage\" | \"mail\"",
      "fetchHealthEndpoint",
      "API_INTERNAL_URL",
      "KLANT_PORT",
      "PERSONEEL_PORT",
      "FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL",
      "FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL",
      "requestPlatformOperationsRerun",
      "platform_operations_rerun_requested",
      "cleanupContract",
    ],
    "phase 11 operations action",
  );
});

test("phase 11 operations page covers health, migration smoke, final gate and reruns", () => {
  const page = read("artifacts/backoffice/src/app/(platform)/platform/operations/page.tsx");

  assertContains(
    page,
    [
      "Operations en staging smoke",
      "JSON operations API",
      "Healthchecks",
      "Backoffice, API, klant-PWA, personeel-PWA, database, storage en mail",
      "Run history",
      "Handmatige rerun",
      "Rerun aanvragen",
      "Migration smoke status",
      "Final external tenant gate",
      "cleanup-contract",
      "Staging smoke checks",
    ],
    "phase 11 operations page",
  );
});

test("phase 11 adds API and navigation for operations", () => {
  const route = read("artifacts/backoffice/src/app/api/platform/operations/route.ts");
  const shell = read("artifacts/backoffice/src/components/platform/PlatformShell.tsx");
  const dashboard = read("artifacts/backoffice/src/app/(platform)/platform/page.tsx");

  assertContains(route, ["getPlatformOperationsDashboard", "Cache-Control", "no-store"], "operations API route");
  assertContains(shell, ["/platform/operations", "Operations"], "platform shell navigation");
  assertContains(shell, ["/platform/accelerators", "Versnellers"], "platform accelerators navigation");
  assertContains(dashboard, ["/platform/operations"], "platform dashboard operations links");
  assert.doesNotMatch(dashboard, /min-h-36/);
  assert.doesNotMatch(dashboard, /Open platformtickets/);
  assert.doesNotMatch(dashboard, /Platformmeldingen/);
  assert.match(dashboard, /line-clamp-1/);
  assert.match(dashboard, /<details className="group\/details mt-1">/);
});

test("phase 11 documentation records the non-destructive rerun contract", () => {
  const docs = read("docs/fieldgrid-platform-admin-phase-11-operations.md");

  assertContains(
    docs,
    [
      "/platform/operations",
      "/api/platform/operations",
      "lege database",
      "staging-copy",
      "Final external tenant gate",
      "platform_operations_rerun_requested",
      "cleanup-contract",
      "geen destructieve runner direct",
    ],
    "phase 11 documentation",
  );
});

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

test("phase 7 exposes a read-only staging smoke action", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-smoke.ts");

  assertContains(
    action,
    [
      "getPlatformStagingSmokeDashboard",
      "PlatformStagingSmokeDashboard",
      "FG-SMOKE-HOST",
      "FG-SMOKE-MIGRATIONS",
      "FG-SMOKE-SUPPORT",
      "FG-SMOKE-AUDIT",
      "isPlatformHost",
      "tenantPrefixedDocuments",
      "migrationHistoryTables",
      "supportAccessAuditLogTable",
    ],
    "platform smoke action",
  );
});

test("phase 7 renders the platform staging smoke dashboard", () => {
  const page = read("artifacts/backoffice/src/app/(platform)/platform/staging-smoke/page.tsx");

  assertContains(
    page,
    [
      "Staging smoke dashboard",
      "Read-only acceptatieoverzicht",
      "JSON smoke API",
      "dashboard.minimumGreen",
      "Operationele bronnen",
      "Platformbeheer",
    ],
    "staging smoke page",
  );
});

test("phase 7 exposes a protected JSON smoke endpoint", () => {
  const route = read("artifacts/backoffice/src/app/api/platform/staging-smoke/route.ts");

  assertContains(
    route,
    [
      "NextResponse.json",
      "requirePlatformAdminFromRequest",
      "buildPlatformStagingSmokeDashboard",
      "export async function GET",
    ],
    "staging smoke route",
  );
});

test("phase 7 smoke script is plan-only and wired into package scripts", () => {
  const script = read("scripts/fieldgrid-phase7-staging-smoke.mjs");
  const packageJson = read("package.json");

  assertContains(
    script,
    [
      "fieldgrid-phase-7-staging-smoke",
      "destructive: false",
      "mutatesExistingTenants: false",
      "FG-SMOKE-STORAGE",
      "docs/fieldgrid-backup-restore-rollback-playbook.md",
      "docs/fieldgrid-first-external-tenant-checklist.md",
    ],
    "phase 7 script",
  );
  assertContains(packageJson, ["fieldgrid:phase7-smoke"], "package scripts");
});

test("phase 7 operation docs capture smoke, rollback and first tenant readiness", () => {
  const phase7 = read("docs/fieldgrid-phase-7-operations.md");
  const rollback = read("docs/fieldgrid-backup-restore-rollback-playbook.md");
  const firstTenant = read("docs/fieldgrid-first-external-tenant-checklist.md");

  assertContains(
    phase7,
    [
      "fase 7 staging smoke",
      "read-only staging smoke dashboard",
      "Smoke API",
      "FG-SMOKE-HOST",
      "FG-SMOKE-MIGRATIONS",
      "Geen migraties",
      "Geen bestaande tenantdata gewijzigd",
    ],
    "phase 7 docs",
  );
  assertContains(
    rollback,
    [
      "backup, restore en rollback playbook",
      "staging-data blijft behouden",
      "copy-first, verify-second, switch-third, cleanup-last",
      "Geen secrets",
    ],
    "rollback playbook",
  );
  assertContains(
    firstTenant,
    [
      "eerste externe tenant checklist",
      "Veele blijft een gewone tenant",
      "FG-SMOKE-HOST",
      "Support break-glass",
      "Go/no-go",
    ],
    "first external tenant checklist",
  );
});

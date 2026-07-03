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

test("phase 4 exposes one canonical permission module map", () => {
  const moduleContract = read("lib/db/src/module-permissions.ts");

  assertContains(
    moduleContract,
    [
      "FIELDGRID_PERMISSION_MODULES",
      "moduleForPermissionResource",
      "resourceFromPermissionKey",
      "moduleForPermissionKey",
      "customers: \"customers\"",
      "objects: \"objects\"",
      "personnel: \"personnel\"",
      "assignments: \"assignments\"",
      "planning: \"planning\"",
      "reports: \"reporting\"",
      "documents: \"documents\"",
      "invoices: \"finance\"",
      "quotes: \"finance\"",
      "payments: \"finance\"",
      "customer_payment_batches: \"finance\"",
      "notifications: \"notifications\"",
      "news: \"notifications\"",
      "task_codes: \"assignments\"",
      "customer_portal: \"customer_portal\"",
      "personnel_portal: \"personnel_portal\"",
      "smart_planning: \"smart_planning\"",
    ],
    "module permission contract",
  );
});

test("API and backoffice use the shared module map instead of local copies", () => {
  const apiAuth = read("artifacts/api-server/src/middleware/auth.ts");
  const backofficeAuth = read("artifacts/backoffice/src/lib/auth/permissions.ts");

  assertContains(apiAuth, ["moduleForPermissionResource", "requireTenantModule"], "API auth");
  assertContains(backofficeAuth, ["moduleForPermissionResource", "resourceFromPermissionKey"], "backoffice auth");

  assert.ok(!apiAuth.includes("const PERMISSION_MODULES"), "API auth should not keep a local module map");
  assert.ok(!backofficeAuth.includes("const PERMISSION_MODULES"), "backoffice auth should not keep a local module map");
});

test("phase 4 documentation links module guards to the cross-tenant testmatrix", () => {
  const phase4 = read("docs/fieldgrid-phase-4-module-enforcement.md");

  assertContains(
    phase4,
    [
      "Fase 4",
      "FIELDGRID_PERMISSION_MODULES",
      "FG-MODULE-005",
      "customer_portal",
      "personnel_portal",
      "geen migraties",
      "pnpm test",
      "pnpm run typecheck",
    ],
    "phase 4 docs",
  );
});

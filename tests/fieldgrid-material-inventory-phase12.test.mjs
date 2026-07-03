import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildPhase12ReadinessPlan,
  PHASE12_MONITOR_SIGNALS,
  PHASE12_PRODUCTION_GATES,
  validatePhase12ReadinessPlan,
} from "../scripts/fieldgrid-material-inventory-phase12-readiness.mjs";

const read = (path) => readFileSync(path, "utf8");

test("phase 12 readiness plan is non-destructive and depends on phase 11", () => {
  const plan = buildPhase12ReadinessPlan();
  const validation = validatePhase12ReadinessPlan(plan);

  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.equal(plan.destructive, false);
  assert.equal(plan.mutatesExistingTenants, false);
  assert.equal(plan.keepsStagingReachable, true);
  assert.ok(plan.dependsOn.includes("fieldgrid-material-inventory-phase-11-hardening"));
});

test("phase 12 monitors the required production-readiness signals", () => {
  const plan = buildPhase12ReadinessPlan();
  const signals = plan.monitorSignals.map((entry) => entry.signal);

  for (const signal of PHASE12_MONITOR_SIGNALS) {
    assert.ok(signals.includes(signal), `missing monitor signal ${signal}`);
  }

  assert.ok(signals.includes("negative_stock"));
  assert.ok(signals.includes("qr_denial"));
  assert.ok(signals.includes("cross_tenant_denial"));
  assert.ok(signals.includes("migration_error"));
  assert.ok(signals.includes("stock_conflict"));
});

test("phase 12 production gates include migration, security, PWA, storage and rollback", () => {
  const plan = buildPhase12ReadinessPlan();

  for (const gate of PHASE12_PRODUCTION_GATES) {
    assert.ok(plan.productionGates.includes(gate), `missing production gate ${gate}`);
  }

  assert.ok(plan.productionGates.includes("empty_database_migration_smoke_green"));
  assert.ok(plan.productionGates.includes("staging_copy_migration_smoke_green"));
  assert.ok(plan.productionGates.includes("cross_tenant_suite_green"));
  assert.ok(plan.productionGates.includes("pwa_material_suite_green"));
  assert.ok(plan.productionGates.includes("storage_signed_url_suite_green"));
  assert.ok(plan.productionGates.includes("rollback_plan_confirmed"));
});

test("phase 12 documentation covers legacy, nullable columns, monitoring and rollout", () => {
  const doc = read("docs/fieldgrid-material-inventory-production-readiness.md");

  for (const term of [
    "legacy material fields",
    "historical fallback",
    "Overig",
    "nullable transition columns",
    "negative stock",
    "QR denials",
    "cross-tenant denials",
    "migration errors",
    "stock conflicts",
    "production rollout checklist",
    "staging-copy",
    "no staging reset",
  ]) {
    assert.ok(doc.includes(term), `missing documentation term ${term}`);
  }
});

test("package scripts expose the phase 12 readiness check", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.equal(
    packageJson.scripts["fieldgrid:material-inventory-phase12"],
    "node scripts/fieldgrid-material-inventory-phase12-readiness.mjs",
  );
  assert.equal(
    packageJson.scripts["fieldgrid:material-inventory-phase12:check"],
    "node scripts/fieldgrid-material-inventory-phase12-readiness.mjs --check",
  );
});

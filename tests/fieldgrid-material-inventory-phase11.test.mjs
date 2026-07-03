import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildMaterialInventoryPhase11Fixtures,
  validateMaterialInventoryPhase11Fixtures,
} from "./fixtures/fieldgrid-material-inventory-phase11-fixtures.mjs";
import {
  buildPhase11HardeningPlan,
  validatePhase11HardeningPlan,
} from "../scripts/fieldgrid-material-inventory-phase11-hardening.mjs";

const read = (path) => readFileSync(path, "utf8");

test("phase 11 fixtures cover demo-a, demo-b and veele as ordinary tenants", () => {
  const fixtures = buildMaterialInventoryPhase11Fixtures();
  const validation = validateMaterialInventoryPhase11Fixtures(fixtures);
  const tenants = fixtures.tenants.map((tenant) => tenant.slug);
  const modules = fixtures.moduleEntitlements.map((entitlement) => entitlement.moduleKey);

  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.deepEqual(tenants, ["demo-a", "demo-b", "veele"]);
  assert.ok(fixtures.tenants.every((tenant) => tenant.ordinaryTenant));
  assert.ok(modules.includes("materials"));
  assert.ok(modules.includes("inventory"));
  assert.ok(fixtures.materials.every((material) => material.code === "M00001"));
  assert.ok(fixtures.inventoryItems.every((item) => item.code === "I000001"));
});

test("phase 11 hardening plan includes migration, storage, QR, billing and audit gates", () => {
  const plan = buildPhase11HardeningPlan();
  const validation = validatePhase11HardeningPlan(plan);
  const scenarioIds = plan.scenarioMatrix.map((scenario) => scenario.id);
  const migrationTargets = plan.migrationSmokes.map((smoke) => smoke.target);

  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.ok(migrationTargets.includes("empty-db"));
  assert.ok(migrationTargets.includes("staging-copy"));
  assert.ok(scenarioIds.includes("MI-STORAGE-001"));
  assert.ok(scenarioIds.includes("MI-QR-001"));
  assert.ok(scenarioIds.includes("MI-BILLING-001"));
  assert.ok(scenarioIds.includes("MI-AUDIT-001"));
});

test("phase 11 workflow is manual and runs the safe contract checks", () => {
  const workflow = read(".github/workflows/fieldgrid-material-inventory-phase11.yml");

  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /fieldgrid:material-inventory-phase11:check/);
  assert.match(workflow, /pnpm test/);
  assert.match(workflow, /pnpm run typecheck/);
  assert.match(workflow, /FIELDGRID_MIGRATION_DATABASE_URL/);
});

test("phase 11 documentation names the minimum staging gates", () => {
  const doc = read("docs/fieldgrid-material-inventory-phase11-hardening.md");

  assert.match(doc, /minimum green before staging/);
  assert.match(doc, /staging-copy/);
  assert.match(doc, /demo-a/);
  assert.match(doc, /demo-b/);
  assert.match(doc, /veele/);
  assert.match(doc, /signed URL/);
  assert.match(doc, /customer_visible/);
});

test("package scripts expose the phase 11 check", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.equal(
    packageJson.scripts["fieldgrid:material-inventory-phase11"],
    "node scripts/fieldgrid-material-inventory-phase11-hardening.mjs",
  );
  assert.equal(
    packageJson.scripts["fieldgrid:material-inventory-phase11:check"],
    "node scripts/fieldgrid-material-inventory-phase11-hardening.mjs --check",
  );
});

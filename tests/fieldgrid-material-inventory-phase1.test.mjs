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

test("material and inventory modules are registered", () => {
  const modules = read("lib/db/src/schema/modules.ts");
  const permissions = read("lib/db/src/module-permissions.ts");

  assertContains(modules, ['"materials"', '"inventory"'], "module schema");
  assertContains(
    permissions,
    [
      "materials: \"materials\"",
      "assignment_material_usage: \"materials\"",
      "inventory: \"inventory\"",
      "assignment_inventory_items: \"inventory\"",
    ],
    "module permissions",
  );
});

test("material and inventory schemas are exported", () => {
  const index = read("lib/db/src/schema/index.ts");

  assertContains(
    index,
    [
      'export * from "./tenant-sequences";',
      'export * from "./materials";',
      'export * from "./inventory";',
    ],
    "schema index",
  );
});

test("tenant sequences support material and inventory codes", () => {
  const schema = read("lib/db/src/schema/tenant-sequences.ts");
  const migration = read("lib/db/migrations/066_material_inventory_foundation.sql");
  const canon = read("docs/research-material-inventory-management.md");

  assertContains(schema, ["material_code", "inventory_code", "tenantSequencesTable"], "tenant sequence schema");
  assertContains(migration, ["tenant_sequences", "material_code", "inventory_code"], "foundation migration");
  assertContains(canon, ["M00001", "I000001"], "research canon");
});

test("assignment material usage has phase 1 transition fields", () => {
  const assignments = read("lib/db/src/schema/assignments.ts");
  const migration = read("lib/db/migrations/066_material_inventory_foundation.sql");

  assertContains(
    assignments,
    [
      "tenantId",
      "materialId",
      "materialCodeSnapshot",
      "registeredName",
      "usesStock",
      "isOther",
      "approvedUnitPrice",
      "invoiceable",
      "customerVisible",
      "approvalStatus",
      "approvalReason",
    ],
    "assignment material usage schema",
  );

  assertContains(
    migration,
    [
      "ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS tenant_id",
      "fieldgrid_set_assignment_material_usage_tenant",
      "assignment_material_usage_tenant_required_check",
    ],
    "assignment material usage migration",
  );
});

test("material and inventory foundation migrations create required tables and RLS", () => {
  const foundation = read("lib/db/migrations/066_material_inventory_foundation.sql");
  const rls = read("lib/db/migrations/067_material_inventory_assignment_usage_rls.sql");

  assertContains(
    foundation,
    [
      "CREATE TABLE IF NOT EXISTS materials",
      "CREATE TABLE IF NOT EXISTS material_stock_balances",
      "CREATE TABLE IF NOT EXISTS material_stock_movements",
      "CREATE TABLE IF NOT EXISTS inventory_items",
      "CREATE TABLE IF NOT EXISTS inventory_issues",
      "CREATE TABLE IF NOT EXISTS inventory_maintenance_events",
      "CREATE TABLE IF NOT EXISTS assignment_inventory_items",
      "ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE material_stock_movements ENABLE ROW LEVEL SECURITY",
    ],
    "foundation migration",
  );

  assertContains(
    rls,
    [
      "ALTER TABLE assignment_material_usage ENABLE ROW LEVEL SECURITY",
      "assignment_material_usage_management_all",
      "assignment_material_usage_personnel_assigned_select",
      "assignment_material_usage_personnel_own_update",
    ],
    "material usage rls migration",
  );
});

test("document entity types include material and inventory targets", () => {
  const documents = read("lib/db/src/schema/documents.ts");
  const migration = read("lib/db/migrations/066_material_inventory_foundation.sql");

  assertContains(
    documents,
    ["material", "inventory_item", "inventory_issue", "inventory_maintenance", "varchar(\"entity_type\", { length: 40 })"],
    "document schema",
  );
  assertContains(migration, ["ALTER COLUMN entity_type TYPE varchar(40)"], "foundation migration");
});

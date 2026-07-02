import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("module entitlement schema exposes canonical tables and keys", () => {
  const schema = read("lib/db/src/schema/modules.ts");
  const index = read("lib/db/src/schema/index.ts");

  for (const token of [
    "FIELDGRID_MODULE_KEYS",
    "TENANT_MODULE_SOURCES",
    "modulesTable",
    "tenantModulesTable",
    "moduleDependenciesTable",
    "isEnabledByDefault",
    "tenantId",
    "moduleId",
    "isEnabled",
  ]) {
    assert.match(schema, new RegExp(`\\b${token}\\b`, "u"));
  }

  for (const moduleKey of [
    "customers",
    "objects",
    "personnel",
    "assignments",
    "planning",
    "reporting",
    "documents",
    "finance",
    "customer_portal",
    "personnel_portal",
    "notifications",
    "smart_planning",
  ]) {
    assert.match(schema, new RegExp(`"${moduleKey}"`, "u"));
  }

  assert.match(index, /export \* from "\.\/modules";/u);
});

test("module entitlement migration is staging safe", () => {
  const migration = read("lib/db/migrations/060_module_entitlements.sql");

  for (const phrase of [
    "CREATE TABLE IF NOT EXISTS modules",
    "CREATE TABLE IF NOT EXISTS module_dependencies",
    "CREATE TABLE IF NOT EXISTS tenant_modules",
    "CREATE UNIQUE INDEX IF NOT EXISTS modules_key_idx",
    "CREATE UNIQUE INDEX IF NOT EXISTS tenant_modules_tenant_module_idx",
    "tenant_modules_source_check",
    "module_dependencies_no_self_check",
    "ALTER TABLE modules ENABLE ROW LEVEL SECURITY",
    "INSERT INTO modules",
    "ON CONFLICT (key) DO UPDATE",
  ]) {
    assert.match(migration, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }

  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/iu);
});

test("module entitlement docs are kept in the SaaS canon", () => {
  const masterplan = read("docs/fieldgrid-saas-masterplan.md");
  const classification = read("docs/fieldgrid-data-classification.md");

  assert.match(masterplan, /`modules`, `tenant_modules` en `module_dependencies` bestaan/u);
  assert.match(classification, /`modules`, `tenant_modules`, `module_dependencies`/u);
  assert.match(classification, /Module uit via UI\/direct URL\/server action\/API faalt/u);
});

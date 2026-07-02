import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("plan entitlement schema exposes canonical tables", () => {
  const schema = read("lib/db/src/schema/plans.ts");
  const schemaIndex = read("lib/db/src/schema/index.ts");
  const dbIndex = read("lib/db/src/index.ts");

  for (const token of [
    "plansTable",
    "planModulesTable",
    "planLimitsTable",
    "tenantSubscriptionsTable",
    "PLAN_LIMIT_KEYS",
    "TENANT_SUBSCRIPTION_STATUSES",
    "TENANT_SUBSCRIPTION_SOURCES",
    "tenant_subscriptions_tenant_active_idx",
  ]) {
    assert.match(schema, new RegExp(`\\b${token}\\b`, "u"));
  }

  assert.match(schemaIndex, /export \* from "\.\/plans";/u);
  assert.match(dbIndex, /export \* from "\.\/tenant-entitlements";/u);
});

test("plan entitlement migration is staging safe", () => {
  const migration = read("lib/db/migrations/061_plan_entitlements.sql");

  for (const phrase of [
    "CREATE TABLE IF NOT EXISTS plans",
    "CREATE TABLE IF NOT EXISTS plan_modules",
    "CREATE TABLE IF NOT EXISTS plan_limits",
    "CREATE TABLE IF NOT EXISTS tenant_subscriptions",
    "CREATE UNIQUE INDEX IF NOT EXISTS plans_key_idx",
    "CREATE UNIQUE INDEX IF NOT EXISTS plan_modules_plan_module_idx",
    "CREATE UNIQUE INDEX IF NOT EXISTS tenant_subscriptions_tenant_active_idx",
    "ALTER TABLE plans ENABLE ROW LEVEL SECURITY",
    "INSERT INTO plans",
    "INSERT INTO plan_modules",
    "WITH plan_limit_seed(plan_key, key, description, is_enabled, limit_value) AS",
    "INSERT INTO tenant_subscriptions",
    "WHERE NOT EXISTS",
  ]) {
    assert.match(migration, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }

  assert.match(migration, /\('starter', 'custom_roles', '[^']+', false, NULL::integer\)/u);
  assert.match(migration, /\('professional', 'custom_roles', '[^']+', true, NULL::integer\)/u);
  assert.match(migration, /\('enterprise', 'custom_roles', '[^']+', true, NULL::integer\)/u);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE tenants/iu);
});

test("tenant entitlement helpers provide plan and module gates", () => {
  const helper = read("lib/db/src/tenant-entitlements.ts");

  for (const token of [
    "getTenantPlanSnapshot",
    "getTenantPlanCapabilitiesForTenant",
    "isTenantModuleEnabled",
    "requireTenantModule",
    "custom_roles",
    "tenantSubscriptionsTable",
    "planModulesTable",
    "tenantModulesTable",
  ]) {
    assert.match(helper, new RegExp(`\\b${token}\\b`, "u"));
  }
});

test("backoffice custom role gating is database-backed", () => {
  const tenantPlan = read("artifacts/backoffice/src/lib/tenant-plan.ts");

  assert.match(tenantPlan, /getTenantPlanCapabilitiesForTenant/u);
  assert.doesNotMatch(tenantPlan, /TENANT_PLAN|NEXT_PUBLIC_TENANT_PLAN|process\.env/u);
});

test("plan entitlement docs are reflected in data classification", () => {
  const classification = read("docs/fieldgrid-data-classification.md");

  assert.match(classification, /`plans`, `plan_modules`, `plan_limits`, `tenant_subscriptions`/u);
  assert.match(classification, /custom-role capability/u);
  assert.match(classification, /Foundation bestaat: Starter\/Professional\/Enterprise/u);
});

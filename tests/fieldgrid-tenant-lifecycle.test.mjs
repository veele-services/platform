import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("tenant schema exposes lifecycle and plan fields", () => {
  const tenantsSchema = read("lib/db/src/schema/tenants.ts");

  assert.match(tenantsSchema, /TENANT_STATUSES/u);
  assert.match(tenantsSchema, /TENANT_RUNTIME_ACTIVE_STATUSES/u);
  assert.match(tenantsSchema, /status: varchar\("status"/u);
  assert.match(tenantsSchema, /planKey: varchar\("plan_key"/u);
  assert.match(tenantsSchema, /createdBy: uuid\("created_by"\)/u);
  assert.match(tenantsSchema, /suspendedAt: timestamp\("suspended_at"/u);
  assert.match(tenantsSchema, /archivedAt: timestamp\("archived_at"/u);
});

test("tenant lifecycle migration is staging safe", () => {
  const migration = read("lib/db/migrations/059_tenant_lifecycle.sql");

  assert.match(migration, /ADD COLUMN IF NOT EXISTS status/u);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS plan_key/u);
  assert.match(migration, /WHERE status IS NULL/u);
  assert.match(migration, /tenants_status_check/u);
  assert.match(migration, /tenants_runtime_active_idx/u);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM tenants/iu);
});

test("shared tenant context helpers are exported from db package", () => {
  const dbIndex = read("lib/db/src/index.ts");
  const tenantContext = read("lib/db/src/tenant-context.ts");

  assert.match(dbIndex, /export \* from "\.\/tenant-context";/u);
  for (const token of [
    "normalizeHost",
    "isPlatformHost",
    "isFieldgridSubdomain",
    "isTenantRuntimeActive",
    "FIELDGRID_ROOT_DOMAIN",
    "DEFAULT_PLATFORM_HOSTS",
  ]) {
    assert.match(tenantContext, new RegExp(`\\b${token}\\b`, "u"));
  }
});

test("legacy and canonical staging hosts are platform hosts", () => {
  const tenantContext = read("lib/db/src/tenant-context.ts");

  assert.match(tenantContext, /platform\.fieldgrid\.nl/u);
  assert.match(tenantContext, /staging\.fieldgrid\.nl/u);
  assert.match(tenantContext, /staging\.veele\.dgwebservices\.nl/u);
});

test("backoffice and API use host-first lifecycle-aware tenant context", () => {
  const backofficeResolver = read("artifacts/backoffice/src/lib/auth/tenant-resolver.ts");
  const backofficeTenant = read("artifacts/backoffice/src/lib/auth/tenant.ts");
  const apiAuth = read("artifacts/api-server/src/middleware/auth.ts");

  assert.match(backofficeResolver, /TENANT_RUNTIME_ACTIVE_STATUSES/u);
  assert.match(backofficeResolver, /inArray\(tenantsTable\.status/u);
  assert.match(backofficeTenant, /TENANT_RUNTIME_ACTIVE_STATUSES/u);
  assert.match(apiAuth, /resolveTenantByHost\(requestHost\(req\)\)/u);
  assert.match(apiAuth, /x-fieldgrid-tenant-id/u);
  assert.match(apiAuth, /Geen actieve tenant-koppeling voor deze host/u);
  assert.match(apiAuth, /TENANT_RUNTIME_ACTIVE_STATUSES/u);
});

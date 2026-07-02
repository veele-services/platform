import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("schema index exports only canonical tenant RBAC tables", () => {
  const schemaIndex = read("lib/db/src/schema/index.ts");

  assert.match(schemaIndex, /export \* from "\.\/tenant-rbac";/u);
  assert.doesNotMatch(schemaIndex, /export \* from "\.\/tenant-roles";/u);
  assert.doesNotMatch(schemaIndex, /export \* from "\.\/tenant-user-roles";/u);
  assert.doesNotMatch(schemaIndex, /export \* from "\.\/tenant-role-permissions";/u);
});

test("runtime permission helpers use tenant role ids, not global role ids", () => {
  const apiAuth = read("artifacts/api-server/src/middleware/auth.ts");
  const backofficePermissions = read("artifacts/backoffice/src/lib/auth/permissions.ts");
  const combined = `${apiAuth}\n${backofficePermissions}`;

  assert.match(combined, /tenantUserRolesTable\.tenantRoleId/u);
  assert.match(combined, /tenantRolePermissionsTable\.tenantRoleId/u);
  assert.doesNotMatch(combined, /tenantUserRolesTable\.roleId/u);
  assert.doesNotMatch(combined, /tenantRolePermissionsTable\.roleId/u);
});

test("platform admin bootstrap is explicit", () => {
  const dbPackage = JSON.parse(read("lib/db/package.json"));
  const seed = read("lib/db/src/seed/platform-users.ts");
  const recoveryPlan = read("docs/fieldgrid-recovery-execution-plan.md");

  assert.equal(dbPackage.scripts["seed:platform-users"], "tsx src/seed/platform-users.ts");
  assert.match(seed, /PLATFORM_OWNER_USER_IDS/u);
  assert.match(recoveryPlan, /seed:platform-users/u);
});

test("tenant sector enforcement is database-backed", () => {
  const schemaIndex = read("lib/db/src/schema/index.ts");
  const taskCodes = read("lib/db/src/schema/task-codes.ts");
  const sectorMigration = read("lib/db/migrations/057_tenant_sector_enforcement.sql");
  const triggerMigration = read("lib/db/migrations/058_tenant_sector_enabled_triggers.sql");

  assert.match(schemaIndex, /export \* from "\.\/tenant-sectors";/u);
  assert.match(taskCodes, /tenantId: uuid\("tenant_id"\)/u);
  assert.match(sectorMigration, /CREATE TABLE IF NOT EXISTS tenant_sectors/u);
  assert.match(triggerMigration, /fieldgrid_assert_tenant_sector_enabled/u);
});

test("legacy scoped RBAC migration can be compatibility-skipped", () => {
  const migrate = read("lib/db/src/migrate.ts");

  assert.match(migrate, /compatibilitySkipReason/u);
  assert.match(migrate, /055_tenant_scoped_rbac\.sql/u);
  assert.match(migrate, /tenant_role_id/u);
});

test("root package has one test script", () => {
  const packageJson = read("package.json");
  const testScriptMatches = packageJson.match(/"test"\s*:/gu) ?? [];

  assert.equal(testScriptMatches.length, 1);
});

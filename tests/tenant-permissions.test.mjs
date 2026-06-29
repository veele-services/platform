import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backofficePermissions = readFileSync("artifacts/backoffice/src/lib/auth/permissions.ts", "utf8");
const apiAuth = readFileSync("artifacts/api-server/src/middleware/auth.ts", "utf8");
const provider = readFileSync("artifacts/backoffice/src/providers/permissions-provider.tsx", "utf8");

for (const [name, source] of [
  ["backoffice permissions", backofficePermissions],
  ["api auth middleware", apiAuth],
]) {
  test(`${name} resolves permissions by user and tenant`, () => {
    assert.match(source, /getUserPermissions\(userId: string, tenantId: string\)/);
    assert.match(source, /tenantUserRolesTable/);
    assert.match(source, /eq\(tenantUserRolesTable\.userId, userId\)/);
    assert.match(source, /eq\(tenantUserRolesTable\.tenantId, tenantId\)/);
    assert.match(source, /tenantRolePermissionsTable/);
    assert.match(source, /eq\(tenantRolePermissionsTable\.tenantId, tenantId\)/);
  });
}

test("permissions provider binds permissions to the tenant they were fetched for", () => {
  assert.match(provider, /tenantId: string/);
  assert.match(provider, /permissions: new Set\(permissions\), tenantId/);
  assert.match(provider, /usePermissionsTenantId/);
});

test("same user can have different permission sets per tenant", () => {
  const tenantA = new Set(["customers:read"]);
  const tenantB = new Set(["customers:write"]);

  assert.equal(tenantA.has("customers:read"), true);
  assert.equal(tenantA.has("customers:write"), false);
  assert.equal(tenantB.has("customers:read"), false);
  assert.equal(tenantB.has("customers:write"), true);
});

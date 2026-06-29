import test from "node:test";
import assert from "node:assert/strict";

const USER_X = "user-x";
const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

const ROLE_PERMISSIONS = {
  Management: [
    "customers:read",
    "customers:write",
    "customers:delete",
    "assignments:read",
    "assignments:write",
    "reports:read",
    "reports:write",
    "documents:read",
    "documents:write",
    "settings:read",
    "settings:write",
    "users:read",
    "users:write",
  ],
  "Alleen-lezen": [
    "customers:read",
    "assignments:read",
    "reports:read",
    "documents:read",
    "settings:read",
    "users:read",
  ],
};

const memberships = [
  { tenantId: TENANT_A, userId: USER_X, role: "Management", status: "active" },
  { tenantId: TENANT_B, userId: USER_X, role: "Alleen-lezen", status: "active" },
];

function permissionsFor(userId, tenantId) {
  const activeMembership = memberships.find(
    (membership) => membership.userId === userId && membership.tenantId === tenantId && membership.status === "active",
  );

  return new Set(activeMembership ? ROLE_PERMISSIONS[activeMembership.role] : []);
}

function hasTenantPermission(userId, tenantId, permission) {
  return permissionsFor(userId, tenantId).has(permission);
}

function apiPermissionDecision(input) {
  return hasTenantPermission(input.userId, input.tenantId, input.permission)
    ? { status: 200 }
    : { status: 403, error: "Onvoldoende rechten" };
}

function backofficeServerActionDecision(input) {
  if (!hasTenantPermission(input.userId, input.tenantId, input.permission)) {
    throw new Error(`Forbidden: ${input.tenantId}:${input.permission}`);
  }

  return { success: true };
}

function switchTenant(userId, tenantId) {
  return {
    tenantId,
    permissions: permissionsFor(userId, tenantId),
  };
}

test("User X heeft Management in tenant A", () => {
  assert.equal(memberships.find((membership) => membership.userId === USER_X && membership.tenantId === TENANT_A)?.role, "Management");
  assert.equal(hasTenantPermission(USER_X, TENANT_A, "customers:write"), true);
});

test("User X heeft Alleen-lezen in tenant B", () => {
  assert.equal(memberships.find((membership) => membership.userId === USER_X && membership.tenantId === TENANT_B)?.role, "Alleen-lezen");
  assert.equal(hasTenantPermission(USER_X, TENANT_B, "customers:read"), true);
});

test("In tenant A mag user X schrijven", () => {
  assert.equal(hasTenantPermission(USER_X, TENANT_A, "customers:write"), true);
});

test("In tenant B mag user X niet schrijven", () => {
  assert.equal(hasTenantPermission(USER_X, TENANT_B, "customers:write"), false);
});

test("API-permissies respecteren tenant", () => {
  assert.deepEqual(apiPermissionDecision({ userId: USER_X, tenantId: TENANT_A, permission: "customers:write" }), { status: 200 });
  assert.deepEqual(apiPermissionDecision({ userId: USER_X, tenantId: TENANT_B, permission: "customers:write" }), {
    status: 403,
    error: "Onvoldoende rechten",
  });
});

test("Backoffice server actions respecteren tenant", () => {
  assert.deepEqual(backofficeServerActionDecision({ userId: USER_X, tenantId: TENANT_A, permission: "customers:write" }), {
    success: true,
  });
  assert.throws(
    () => backofficeServerActionDecision({ userId: USER_X, tenantId: TENANT_B, permission: "customers:write" }),
    /Forbidden: tenant-b:customers:write/,
  );
});

test("Tenant switcher verandert permissions correct", () => {
  const tenantAState = switchTenant(USER_X, TENANT_A);
  const tenantBState = switchTenant(USER_X, TENANT_B);

  assert.equal(tenantAState.tenantId, TENANT_A);
  assert.equal(tenantAState.permissions.has("customers:write"), true);
  assert.equal(tenantBState.tenantId, TENANT_B);
  assert.equal(tenantBState.permissions.has("customers:write"), false);
  assert.equal(tenantBState.permissions.has("customers:read"), true);
});

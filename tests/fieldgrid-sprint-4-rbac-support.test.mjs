import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should mention ${phrase}`);
  }
}

const platformAccess = "lib/db/src/platform-access.ts";
const dbIndex = "lib/db/src/index.ts";
const apiAuth = "artifacts/api-server/src/middleware/auth.ts";
const backofficeTenant = "artifacts/backoffice/src/lib/auth/tenant.ts";
const backofficePlatform = "artifacts/backoffice/src/lib/auth/platform.ts";
const backofficePermissions =
  "artifacts/backoffice/src/lib/auth/permissions.ts";
const dashboardLayout = "artifacts/backoffice/src/app/(dashboard)/layout.tsx";
const platformPage =
  "artifacts/backoffice/src/app/(platform)/platform/page.tsx";
const platformActions = "artifacts/backoffice/src/app/actions/platform.ts";
const supportModeActions =
  "artifacts/backoffice/src/app/actions/support-mode.ts";
const sprintContract = "docs/fieldgrid-sprint-4-rbac-support.md";
const rbacMatrix = "docs/fieldgrid-rbac-permission-matrix.md";
const testMatrix = "docs/fieldgrid-cross-tenant-testmatrix.md";

const RBAC_TEST_IDS = [
  "FG-RBAC-001",
  "FG-RBAC-002",
  "FG-RBAC-003",
  "FG-RBAC-004",
  "FG-RBAC-005",
];

const SUPPORT_TEST_IDS = [
  "FG-SUPPORT-001",
  "FG-SUPPORT-002",
  "FG-SUPPORT-003",
  "FG-SUPPORT-004",
  "FG-SUPPORT-005",
  "FG-SUPPORT-006",
];

test("shared platform access helper codifies RBAC and support priority", () => {
  const helper = read(platformAccess);
  const index = read(dbIndex);

  assertContains(
    helper,
    [
      "FIELDGRID_RUNTIME_ACCESS_PRIORITY",
      "platform-admin",
      "active-support-grant",
      "tenant-role",
      "FIELDGRID_SUPPORT_TENANT_COOKIE",
      "FIELDGRID_SUPPORT_RUNTIME_PERMISSION_KEYS",
      "getActivePlatformUserForUser",
      "getActiveSupportAccessForUser",
      "isSupportRuntimePermission",
      "getSupportRuntimePermissions",
      "writeSupportAccessAuditLogForUser",
    ],
    platformAccess,
  );

  assertContains(index, ['export * from "./platform-access";'], dbIndex);
});

test("API support access is explicit, audited and checked before tenant RBAC", () => {
  const auth = read(apiAuth);

  assertContains(
    auth,
    [
      "supportAccess?",
      "getActiveSupportAccessForUser",
      "attachSupportAccess",
      'hostResolution.kind === "platform"',
      "isSupportRuntimePermission",
      "writeSupportAccessAuditLogForUser",
      "api_permission_allowed",
      "api_permission_denied",
      "Supporttoegang staat deze actie niet toe",
      "requireEnabledPermissionModule(req, res, resource, tenantId)",
    ],
    apiAuth,
  );
  assert.match(
    auth,
    /isSupportRuntimePermission\(\s*resource,\s*action,\s*\)/u,
  );

  const supportCheck = auth.indexOf("if (req.supportAccess)");
  const tenantRoleCheck = auth.indexOf(
    "const permissions = await getUserPermissions(userId, tenantId);",
  );
  assert.notEqual(supportCheck, -1, "API support check should exist");
  assert.notEqual(tenantRoleCheck, -1, "API tenant role check should exist");
  assert.ok(
    supportCheck < tenantRoleCheck,
    "active support grant must be evaluated before tenant-role RBAC",
  );

  const tenantHostBranch = auth.indexOf(
    'if (hostResolution.kind === "tenant")',
  );
  const platformSupportBranch = auth.indexOf(
    'if (hostResolution.kind === "platform")',
  );
  assert.ok(
    tenantHostBranch < platformSupportBranch,
    "tenant host resolution must stay host-first before support context",
  );
});

test("backoffice support mode is platform-host bound and visible in the dashboard shell", () => {
  const tenant = read(backofficeTenant);
  const platform = read(backofficePlatform);
  const layout = read(dashboardLayout);
  const page = read(platformPage);
  const actions = read(platformActions);
  const supportActions = read(supportModeActions);

  assertContains(
    tenant,
    [
      "FIELDGRID_SUPPORT_TENANT_COOKIE",
      "getActiveSupportAccessForUser",
      'if (hostResolution.kind === "platform")',
      "return supportTenantId;",
    ],
    backofficeTenant,
  );

  const supportCookie = tenant.indexOf("FIELDGRID_SUPPORT_TENANT_COOKIE");
  const tenantOptions = tenant.indexOf(
    "const tenantOptions = await getActiveBackofficeTenantsForUser(user.id);",
  );
  assert.ok(
    supportCookie < tenantOptions,
    "support mode must be resolved before normal tenant switcher fallback",
  );

  assertContains(
    platform,
    [
      "getCurrentSupportMode",
      "isCurrentHostPlatformHost",
      "FIELDGRID_SUPPORT_TENANT_COOKIE",
      "ttlSeconds",
      "FIELDGRID_RUNTIME_ACCESS_PRIORITY[1]",
    ],
    backofficePlatform,
  );

  assertContains(
    layout,
    [
      "SupportModeBanner",
      "Supportmodus actief",
      "TTL",
      "Reden",
      "Auditcontext",
      "exitSupportMode",
      "getCurrentEffectiveUserPermissions",
    ],
    dashboardLayout,
  );

  assertContains(
    page,
    [
      "listCurrentSupportAccessGrants",
      "Open supportmodus",
      "supportGrantStatus",
      "Je ziet alleen supportgrants",
    ],
    platformPage,
  );

  assertContains(
    actions,
    [
      "enterSupportMode",
      "exitSupportMode",
      "support_mode_entered",
      "support_mode_exited",
      "FIELDGRID_SUPPORT_TENANT_COOKIE",
    ],
    platformActions,
  );

  assertContains(
    supportActions,
    ["listCurrentSupportAccessGrants", "requirePlatformSupportUser"],
    supportModeActions,
  );
});

test("backoffice permission runtime remains tenant-role first unless explicit support mode is active", () => {
  const permissions = read(backofficePermissions);

  assertContains(
    permissions,
    [
      "tenantUserRolesTable",
      "tenantRolePermissionsTable",
      "getCurrentSupportMode",
      "getSupportRuntimePermissions",
      "backoffice_permission_allowed",
      "backoffice_permission_denied",
      "getCurrentEffectiveUserPermissions",
      "requireEnabledPermissionModule(resource)",
    ],
    backofficePermissions,
  );

  const getUserPermissionsStart = permissions.indexOf(
    "export async function getUserPermissions",
  );
  const getEffectiveStart = permissions.indexOf(
    "/** Fetch runtime permissions after tenant module entitlements are applied. */",
  );
  const getUserPermissionsBlock = permissions.slice(
    getUserPermissionsStart,
    getEffectiveStart,
  );

  assert.doesNotMatch(getUserPermissionsBlock, /\buserRolesTable\b/u);
  assert.doesNotMatch(getUserPermissionsBlock, /\brolePermissionsTable\b/u);
  assert.doesNotMatch(getUserPermissionsBlock, /\brolesTable\b/u);
});

test("Sprint 4 docs bind RBAC and support work to canonical test IDs", () => {
  const contract = read(sprintContract);
  const matrix = read(rbacMatrix);
  const crossTenantMatrix = read(testMatrix);

  assertContains(
    matrix,
    [
      "Globale roles geven geen runtime-rechten",
      "platform-admin",
      "active-support-grant",
      "tenant-role",
      "FIELDGRID_SUPPORT_RUNTIME_PERMISSION_KEYS",
      "support_access_audit_log",
      "read-first",
    ],
    rbacMatrix,
  );

  assertContains(
    contract,
    [
      "Geen schema- of migratiewijzigingen.",
      "Support runtime permissions zijn read-first",
      "Geen globale role runtimepad",
      "support_access_audit_log",
    ],
    sprintContract,
  );

  for (const testId of [...RBAC_TEST_IDS, ...SUPPORT_TEST_IDS]) {
    assertContains(contract, [testId], sprintContract);
    assertContains(matrix, [testId], rbacMatrix);
    assertContains(crossTenantMatrix, [testId], testMatrix);
  }
});

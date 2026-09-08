import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
function action(source, name) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport async function ", start + 22);
  return source.slice(start, next < 0 ? source.length : next);
}

test("roles UI uses only tenant-scoped RBAC actions", () => {
  for (const path of [
    "artifacts/backoffice/src/app/(dashboard)/instellingen/rollen/page.tsx",
    "artifacts/backoffice/src/app/(dashboard)/instellingen/rollen/[id]/page.tsx",
    "artifacts/backoffice/src/components/settings/RollenView.tsx",
    "artifacts/backoffice/src/components/settings/RolDetailView.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /@\/app\/actions\/tenant-roles/u, path);
    assert.doesNotMatch(source, /@\/app\/actions\/settings/u, path);
  }
  const detail = read("artifacts/backoffice/src/components/settings/RolDetailView.tsx");
  assert.match(detail, /toggleTenantRolePermission/u);
  assert.match(detail, /<Checkbox/u);
  assert.match(detail, /min-h-11/u);
  assert.match(detail, /aria-label=/u);
  assert.match(detail, /opslaan mislukt/u);
  assert.match(detail, /const canToggle = canWrite && \(checked \|\| permission\.canGrant\)/u);
  assert.match(detail, /niet toewijsbaar/u);
});

test("role details expose the actor grant ceiling to the permission controls", () => {
  const source = read("artifacts/backoffice/src/app/actions/tenant-roles.ts");
  const detail = action(source, "getTenantRole");
  assert.match(detail, /getCurrentUserPermissions\(\)/u);
  assert.match(detail, /canGrant: actorPermissions\.has/u);
});

test("role and membership mutations validate tenant scope and commit atomically", () => {
  const source = read("artifacts/backoffice/src/app/actions/tenant-roles.ts");
  const toggle = action(source, "toggleTenantRolePermission");
  assert.match(toggle, /eq\(tenantRolesTable\.tenantId, tenantId\)/u);
  assert.match(toggle, /eq\(permissionsTable\.id, permissionId\)/u);
  assert.match(toggle, /getCurrentUserPermissions\(\)/u);
  assert.match(toggle, /U kunt geen recht toekennen dat u zelf niet heeft/u);
  assert.match(toggle, /await db\.transaction/u);
  assert.match(action(source, "deleteTenantRole"), /requirePermission\("roles", "delete"\)/u);
  const membership = action(source, "updateTenantUserRoles");
  assert.match(membership, /requirePermission\("users", "write"\)/u);
  assert.doesNotMatch(membership, /requirePermission\("roles", "write"\)/u);
  assert.match(membership, /eq\(tenantUsersTable\.tenantId, tenantId\)/u);
  assert.match(membership, /Gebruiker is geen lid van deze tenant/u);
  assert.match(membership, /if \(userId === user\.id\)/u);
  assert.match(membership, /await db\.transaction/u);
  assert.doesNotMatch(membership, /insert\(tenantUsersTable\)/u);
  const batch = action(source, "updateTenantRolePermissions");
  assert.match(batch, /inArray\(permissionsTable\.id, uniquePermissionIds\)/u);
  assert.match(batch, /getCurrentUserPermissions\(\)/u);
  assert.match(batch, /U kunt geen rechten toekennen die u zelf niet heeft/u);
  assert.match(batch, /await db\.transaction/u);
  assert.match(batch, /\.for\("update"\)/u);
  assert.match(toggle, /\.for\("update"\)/u);
  assert.equal((source.match(/insert\(auditLogTable\)\.values\(\{\s*tenantId,/gu) ?? []).length, 8);
});

test("privileged role assignment, reset and delete stay explicit and atomic", () => {
  const source = read("artifacts/backoffice/src/app/actions/tenant-roles.ts");
  const assignable = action(source, "listAssignableTenantRoles");
  assert.match(assignable, /requirePermission\("users", "write"\)/u);
  assert.match(assignable, /getAssignableTenantRoleIds\(tenantId\)/u);
  assert.doesNotMatch(assignable, /requirePermission\("roles", "write"\)/u);

  const invite = action(source, "inviteTenantUser");
  assert.match(invite, /requirePermission\("users", "write"\)/u);
  assert.doesNotMatch(invite, /requirePermission\("roles", "write"\)/u);
  assert.match(invite, /user\.email\?\.trim\(\)\.toLowerCase\(\) === email/u);
  assert.match(invite, /invitedUserId === user\.id/u);
  assert.match(invite, /assignableRoleIds\.has\(role\.id\)/u);
  assert.match(invite, /await db\.transaction/u);
  assert.match(invite, /await invite\.rollback\(\)/u);

  const remove = action(source, "deleteTenantRole");
  assert.match(remove, /await db\.transaction/u);
  assert.match(remove, /\.for\("update"\)/u);
  assert.match(remove, /await tx\.insert\(auditLogTable\)/u);
  assert.match(remove, /eq\(tenantUsersTable\.status, "active"\)/u);
  assert.doesNotMatch(remove, /personnelTable/u);

  const reset = action(source, "resetTenantSystemRolesToTemplates");
  assert.match(reset, /if \(!\(await canGrantEveryPermission\(\)\)\)/u);
  assert.match(reset, /alle resulterende rechten zelf heeft/u);
  assert.match(reset, /await db\.transaction/u);
  assert.match(reset, /\.for\("update"\)/u);
  assert.match(reset, /await tx\.insert\(auditLogTable\)/u);

  for (const name of ["createTenantRole", "updateTenantRole"]) {
    const body = action(source, name);
    assert.match(body, /await db\.transaction/u, name);
    assert.match(body, /await tx\.insert\(auditLogTable\)/u, name);
  }
});

test("portal invite provisioning exposes checked compensation and uses it on failure", () => {
  const source = read("artifacts/backoffice/src/lib/auth/portal-invites.ts");
  assert.match(source, /rollback: \(\) => Promise<void>/u);
  assert.match(source, /revokeCredentialRecoveryChallenges/u);
  assert.match(source, /admin\.auth\.admin\.deleteUser\(user\.id\)/u);
  assert.match(source, /app_metadata: originalUser\.app_metadata/u);
  assert.match(source, /user_metadata: originalUser\.user_metadata/u);
  assert.match(source, /if \(errors\.length > 0\)/u);
  assert.match(source, /await rollback\(\)/u);
  assert.doesNotMatch(source, /Promise\.allSettled/u);
});

test("users page remains usable without roles read and hides role assignment", () => {
  const page = read("artifacts/backoffice/src/app/(dashboard)/instellingen/gebruikers/page.tsx");
  const view = read("artifacts/backoffice/src/components/settings/GebruikersView.tsx");
  assert.match(page, /const canAssignRoles = canWrite/u);
  assert.match(page, /canAssignRoles \? listAssignableTenantRoles\(\) : Promise\.resolve\(\[\]\)/u);
  assert.doesNotMatch(page, /listTenantRoles/u);
  assert.match(view, /canAssignRoles:\s*boolean/u);
  assert.match(view, /\.\.\.\(canAssignRoles/u);
  assert.match(view, /canAssignRoles=\{canAssignRoles && user\.canManageRoles\}/u);
  assert.match(view, /\{canAssignRoles && \(\s*<EditRolesSheet/u);

  const actionSource = action(
    read("artifacts/backoffice/src/app/actions/tenant-roles.ts"),
    "listTenantUsersWithRoles",
  );
  assert.match(actionSource, /authUser\.id !== currentUser\.id/u);
  assert.match(actionSource, /assignedRoles\.ids\.every/u);
});

test("roles delete capability exposes reset independently from role writes", () => {
  const view = read("artifacts/backoffice/src/components/settings/RollenView.tsx");
  assert.match(view, /canWrite \|\| capabilities\.canResetSystemRoles/u);
  assert.match(view, /canWrite && capabilities\.customRoles/u);
});

test("role deletion keeps the confirmation open when the server refuses", () => {
  const rolesView = read("artifacts/backoffice/src/components/settings/RollenView.tsx");
  const confirmDialog = read(
    "artifacts/backoffice/src/components/tenant-ui/tenant-confirm-dialog.tsx",
  );

  assert.match(rolesView, /async function handleDeleteConfirm\(\): Promise<boolean>/u);
  assert.match(rolesView, /setDeleteError\([\s\S]*?return false;/u);
  assert.match(confirmDialog, /const shouldClose = await onConfirm\(\)/u);
  assert.match(confirmDialog, /if \(shouldClose !== false\) setOpen\(false\)/u);
});

test("runtime and audit role joins scope both role and membership", () => {
  const permissions = action(read("artifacts/backoffice/src/lib/auth/permissions.ts"), "getUserRoles");
  assert.match(permissions, /eq\(tenantUserRolesTable\.tenantId, tenantId\)/u);
  assert.match(permissions, /eq\(tenantRolesTable\.tenantId, tenantId\)/u);
  const settings = action(read("artifacts/backoffice/src/app/actions/settings.ts"), "listAuditLog");
  assert.match(settings, /from\(tenantUserRolesTable\)/u);
  assert.match(settings, /eq\(tenantUserRolesTable\.tenantId, tenantId\)/u);
  assert.equal(
    (settings.match(/eq\(personnelTable\.tenantId, auditLogTable\.tenantId\)/gu) ?? [])
      .length,
    2,
  );
  assert.match(settings, /\["roles", "tenant_roles"\]/u);
  assert.match(read("artifacts/backoffice/src/app/(dashboard)/instellingen/activiteitslog/page.tsx"), /listTenantRoles/u);
});

test("legacy global RBAC endpoints are retired", () => {
  const settings = read("artifacts/backoffice/src/app/actions/settings.ts");
  for (const name of ["listRoles", "getRole", "createRole", "updateRole", "toggleRolePermission", "updateRolePermissions", "listUsersWithRoles", "inviteUser", "deleteRole", "resetSystemRolesToDefault", "updateUserRoles"]) {
    assert.doesNotMatch(settings, new RegExp(`export async function ${name}\\b`, "u"));
  }
  assert.equal(existsSync(new URL("../../artifacts/backoffice/src/app/actions/roles.ts", import.meta.url)), false);
});

test("new database constraints fail closed without rewriting historical rows", () => {
  const migration = read("lib/db/migrations/20260824150000_tenant_role_membership_scope.sql");
  assert.match(migration, /FOREIGN KEY \(tenant_id, tenant_role_id\)/u);
  assert.match(migration, /FOREIGN KEY \(tenant_id, user_id\)/u);
  assert.equal((migration.match(/NOT VALID/gu) ?? []).length >= 4, true);
  assert.doesNotMatch(migration, /UPDATE\s+public\.tenant_user_roles/iu);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+public\.tenant_user_roles/iu);
});

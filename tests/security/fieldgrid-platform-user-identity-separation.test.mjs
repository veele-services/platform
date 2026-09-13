import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const platformActions = readFileSync(
  "artifacts/backoffice/src/app/actions/platform.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const portalInvites = readFileSync(
  "artifacts/backoffice/src/lib/auth/portal-invites.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const tenantRoleActions = readFileSync(
  "artifacts/backoffice/src/app/actions/tenant-roles.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const customerActions = readFileSync(
  "artifacts/backoffice/src/app/actions/customers.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const personnelActions = readFileSync(
  "artifacts/backoffice/src/app/actions/personnel.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const platformProvisioningActions = readFileSync(
  "artifacts/backoffice/src/app/actions/platform-provisioning.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const tenantProvisioning = readFileSync(
  "lib/db/src/tenant-provisioning.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const platformTenantActions = readFileSync(
  "artifacts/backoffice/src/app/actions/platform-tenants.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const settingsActions = readFileSync(
  "artifacts/backoffice/src/app/actions/settings.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const initialAuthSurfaceMigration = readFileSync(
  "lib/db/migrations/20260913154500_prevent_cross_portal_identity_reuse.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const authSurfaceMigration = readFileSync(
  "lib/db/migrations/20260913161000_serialize_auth_surface_bindings_across_snapshots.sql",
  "utf8",
).replaceAll("\r\n", "\n");

test("an existing portal identity cannot be rewritten for another portal", () => {
  const mismatchGuard = portalInvites.match(
    /const existingPortal = existingUser\.app_metadata\?\.portal;([\s\S]*?)const hasSignedIn/u,
  );
  assert.ok(mismatchGuard, "existing portal guard must remain explicit");
  assert.match(mismatchGuard[1], /existingPortal !== opts\.portal/u);
  assert.doesNotMatch(mismatchGuard[1], /allowExistingActive/u);
});

test("platform-user creation rejects tenant identities and compensates Auth failures", () => {
  const upsertStart = platformActions.indexOf(
    "export async function upsertPlatformUser",
  );
  const inviteStart = platformActions.indexOf(
    "export async function invitePlatformUserFromForm",
  );
  const updateStart = platformActions.indexOf(
    "export async function updatePlatformUserFromForm",
  );
  assert.ok(
    upsertStart >= 0 && inviteStart > upsertStart && updateStart > inviteStart,
  );

  const upsertSource = platformActions.slice(upsertStart, inviteStart);
  const inviteSource = platformActions.slice(inviteStart, updateStart);
  for (const source of [upsertSource, inviteSource]) {
    const tenantGuard = source.indexOf("authUserHasTenantMembership(");
    const platformWrite = source.indexOf(".insert(platformUsersTable)");
    assert.ok(
      tenantGuard >= 0 && platformWrite > tenantGuard,
      "tenant identity check must precede the platform write",
    );
  }

  const authPreflight = inviteSource.indexOf("findAuthUserByEmail(");
  const provision = inviteSource.indexOf("provisionPortalUserForActivation(");
  const postProvisionGuard = inviteSource.indexOf(
    "authUserHasTenantMembership(invite.user.id)",
  );
  const platformMembershipGuard = inviteSource.indexOf(
    "authUserHasPlatformMembership(invite.user.id)",
  );
  const reservation = inviteSource.indexOf('status: "inactive"');
  const activation = inviteSource.indexOf("activate: async (reserved)");
  assert.ok(
    authPreflight >= 0 &&
      provision > authPreflight &&
      postProvisionGuard > provision &&
      platformMembershipGuard > provision &&
      reservation > postProvisionGuard &&
      activation > reservation,
    "identity guards and an inactive reservation must precede platform activation",
  );

  assert.match(inviteSource, /let invite:[\s\S]*=\s*null/u);
  assert.match(
    inviteSource,
    /\.insert\(platformUsersTable\)[\s\S]*status: "inactive"[\s\S]*\.onConflictDoNothing/u,
  );
  assert.match(
    inviteSource,
    /activate: async \(reserved\)[\s\S]*\.update\(platformUsersTable\)[\s\S]*eq\(platformUsersTable\.status, "inactive"\)/u,
  );
  assert.doesNotMatch(
    inviteSource,
    /\.insert\(platformUsersTable\)[\s\S]{0,500}?\.onConflictDoUpdate/u,
  );
});

test("authorization stays inactive until durable Auth finalization", () => {
  const existingIdentityStart = portalInvites.indexOf(
    "const existingPortal = existingUser.app_metadata?.portal",
  );
  const rollbackStart = portalInvites.indexOf("const rollback = async () =>");
  const finalizeStart = portalInvites.indexOf("const finalize = async () =>");
  const challengeStart = portalInvites.indexOf(
    "const challenge = await issueCredentialRecoveryChallenge(",
  );
  assert.ok(
    existingIdentityStart >= 0 &&
      rollbackStart > existingIdentityStart &&
      finalizeStart > rollbackStart &&
      challengeStart > finalizeStart,
  );
  assert.doesNotMatch(
    portalInvites.slice(existingIdentityStart, rollbackStart),
    /updateUserById/u,
  );
  assert.match(
    portalInvites.slice(finalizeStart, challengeStart),
    /existingIdentityMutationAttempted = true[\s\S]*updateUserById/u,
  );
  assert.match(
    portalInvites,
    /function finalizePortalAuthorizationReservation<[\s\S]*operations\.reserve\(\)[\s\S]*invite\.finalize\(\)[\s\S]*operations\.activate\(reservation\)[\s\S]*invite\.rollback\(\)/u,
  );

  assert.match(
    tenantRoleActions,
    /finalizePortalAuthorizationReservation\(invite[\s\S]*reserve:[\s\S]*status: "invited"[\s\S]*activate:[\s\S]*status: "active"[\s\S]*\.insert\(tenantUserRolesTable\)/u,
  );
  assert.match(
    tenantRoleActions,
    /if \(reservation\.membership\.status === "invited"\)[\s\S]*\.set\(\{ status: "active"[\s\S]*else if \(reservation\.membership\.status === "active"\)/u,
  );
  assert.match(
    customerActions,
    /try \{[\s\S]*upsertCustomerPortalInviteLink\([\s\S]*await provisioned\.finalize\(\);[\s\S]*\} catch \(error\) \{[\s\S]*await provisioned\.rollback\(\);[\s\S]*throw error;/u,
  );
  assert.match(
    customerActions,
    /const \[updated\] = await db[\s\S]*\.returning\(\{ id: customerUsersTable\.id \}\);[\s\S]*if \(!updated \|\| updated\.id !== existing\.id\)/u,
  );
  assert.equal(
    [
      ...personnelActions.matchAll(
        /finalizePortalAuthorizationReservation\(activationInvite/gu,
      ),
    ].length,
    2,
  );
  assert.equal(
    [...personnelActions.matchAll(/expectedUserId:/gu)].length,
    3,
  );
  assert.match(
    personnelActions,
    /function reservePersonnelActivationAuthorization[\s\S]*userId: null[\s\S]*function activatePersonnelAuthorizationReservation[\s\S]*userId: reservation\.invitedUserId/u,
  );
  assert.match(
    personnelActions,
    /function activatePersonnelAuthorizationReservation[\s\S]*isNull\(personnelTable\.userId\)[\s\S]*eq\(personnelTable\.updatedAt, reservation\.updatedAt\)/u,
  );
  assert.match(
    platformProvisioningActions,
    /finalizePortalAuthorizationReservation\(ownerInvite[\s\S]*reserveProvisionedTenantOwnerInvite\([\s\S]*activate:[\s\S]*completeProvisionedTenantOwnerInvite\(/u,
  );
  assert.match(
    tenantProvisioning,
    /function reserveProvisionedTenantOwnerInvite[\s\S]*status: "invited"[\s\S]*authorizationReservation[\s\S]*status: "active"/u,
  );
  assert.equal(
    [
      ...platformTenantActions.matchAll(
        /finalizePortalAuthorizationReservation\(invite, \{/gu,
      ),
    ].length,
    2,
  );
  assert.match(
    platformTenantActions,
    /function reserveTenantAuthInvite[\s\S]*status: "invited"/u,
  );
  assert.doesNotMatch(
    platformTenantActions,
    /bindAndFinalizeTenantAuthInvite/u,
  );
  assert.match(
    settingsActions,
    /\.insert\(userRolesTable\)[\s\S]*await invite\.finalize\(\)/u,
  );
});

test("database serializes tenant and platform bindings on one Auth UUID", () => {
  assert.match(
    authSurfaceMigration,
    /LOCK TABLE public\.tenant_users, public\.platform_users[\s\S]*IN SHARE ROW EXCLUSIVE MODE/u,
  );
  assert.match(
    authSurfaceMigration,
    /expected_trigger\(trigger_name, relation_id\)[\s\S]*trigger_row\.tgtype::integer = 23[\s\S]*trigger_row\.tgenabled = 'O'/u,
  );
  assert.match(
    authSurfaceMigration,
    /CREATE TABLE public\.fieldgrid_auth_surface_locks \([\s\S]*user_id uuid PRIMARY KEY[\s\S]*revision bigint NOT NULL/u,
  );
  assert.match(
    authSurfaceMigration,
    /INSERT INTO public\.fieldgrid_auth_surface_locks \(user_id\)[\s\S]*FROM public\.tenant_users[\s\S]*UNION[\s\S]*FROM public\.platform_users/u,
  );
  assert.match(
    authSurfaceMigration,
    /CREATE OR REPLACE FUNCTION public\.fieldgrid_enforce_auth_surface_separation\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/u,
  );
  assert.match(
    authSurfaceMigration,
    /INSERT INTO public\.fieldgrid_auth_surface_locks AS surface_lock[\s\S]*ON CONFLICT \(user_id\) DO UPDATE[\s\S]*surface_lock\.revision \+ 1[\s\S]*RETURNING user_id INTO barrier_user_id/u,
  );
  assert.match(
    authSurfaceMigration,
    /TG_TABLE_NAME = 'tenant_users'[\s\S]*FROM public\.platform_users[\s\S]*platform_user\.user_id = NEW\.user_id[\s\S]*FROM public\.tenant_users[\s\S]*tenant_user\.user_id = NEW\.user_id/u,
  );
  assert.match(
    authSurfaceMigration,
    /ALTER TABLE public\.fieldgrid_auth_surface_locks ENABLE ROW LEVEL SECURITY[\s\S]*REVOKE ALL ON TABLE public\.fieldgrid_auth_surface_locks FROM PUBLIC/u,
  );
  assert.match(
    authSurfaceMigration,
    /fieldgrid_runtime_relation_capabilities[\s\S]*'fieldgrid_auth_surface_locks'[\s\S]*'function_only'[\s\S]*'20260913161000_serialize_auth_surface_bindings_across_snapshots\.sql'/u,
  );
  assert.match(
    authSurfaceMigration,
    /fieldgrid_runtime_function_capabilities[\s\S]*'fieldgrid_enforce_auth_surface_separation'[\s\S]*'trigger_dependency'[\s\S]*'20260913161000_serialize_auth_surface_bindings_across_snapshots\.sql'/u,
  );
  assert.match(
    initialAuthSurfaceMigration,
    /CREATE TRIGGER tenant_users_auth_surface_separation[\s\S]*CREATE TRIGGER platform_users_auth_surface_separation/u,
  );
  assert.doesNotMatch(
    authSurfaceMigration,
    /pg_advisory_xact_lock|DISABLE ROW LEVEL SECURITY|DISABLE TRIGGER|\bGRANT\b/iu,
  );
  assert.doesNotMatch(
    authSurfaceMigration,
    /\b(?:UPDATE|DELETE FROM)\s+public\.(?:tenant_users|platform_users)\b/iu,
  );
});

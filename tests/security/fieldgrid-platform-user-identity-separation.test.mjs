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
  const platformWrite = inviteSource.indexOf(".insert(platformUsersTable)");
  const finalize = inviteSource.indexOf("await invite.finalize()");
  assert.ok(
    authPreflight >= 0 &&
      provision > authPreflight &&
      postProvisionGuard > provision &&
      platformWrite > postProvisionGuard &&
      finalize > platformWrite,
    "tenant membership must be checked around provisioning and Auth metadata finalized only after binding",
  );

  assert.match(inviteSource, /let invite:[\s\S]*=\s*null/u);
  assert.ok(
    [...inviteSource.matchAll(/await invite\.rollback\(\)/gu)].length >= 3,
    "all pre-binding failures must compensate the Auth invitation",
  );
  assert.match(
    inviteSource,
    /catch \{[\s\S]*await invite\.rollback\(\)[\s\S]*platformkoppeling kon niet veilig/u,
  );
});

test("existing Auth metadata is finalized only after durable portal binding", () => {
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
    tenantRoleActions,
    /\.insert\(tenantUsersTable\)[\s\S]*await invite\.finalize\(\)/u,
  );
  assert.match(
    customerActions,
    /try \{[\s\S]*upsertCustomerPortalInviteLink\([\s\S]*await provisioned\.finalize\(\);[\s\S]*\} catch \(error\) \{[\s\S]*await provisioned\.rollback\(\);[\s\S]*throw error;/u,
  );
  assert.match(
    customerActions,
    /const \[updated\] = await db[\s\S]*\.returning\(\{ id: customerUsersTable\.id \}\);[\s\S]*if \(!updated \|\| updated\.id !== existing\.id\)/u,
  );
  assert.ok(
    [...personnelActions.matchAll(/await activationInvite\.finalize\(\)/gu)]
      .length >= 2,
  );
  assert.equal(
    [...personnelActions.matchAll(/const linkedPersonnel = await db/gu)].length,
    2,
  );
  assert.equal(
    [...personnelActions.matchAll(/linkedPersonnel\.length !== 1/gu)].length,
    2,
  );
  assert.match(
    platformProvisioningActions,
    /completeProvisionedTenantOwnerInvite\([\s\S]*await ownerInvite\.finalize\(\)/u,
  );
  assert.match(
    platformTenantActions,
    /await bind\(\);[\s\S]*await invite\.finalize\(\)/u,
  );
  assert.equal(
    [
      ...platformTenantActions.matchAll(
        /bindAndFinalizeTenantAuthInvite\(invite, \(\) =>/gu,
      ),
    ].length,
    2,
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

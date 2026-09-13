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
const authSurfaceMigration = readFileSync(
  "lib/db/migrations/20260913154500_prevent_cross_portal_identity_reuse.sql",
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
  assert.ok(
    authPreflight >= 0 &&
      provision > authPreflight &&
      postProvisionGuard > provision &&
      platformWrite > postProvisionGuard,
    "tenant membership must be checked before e-mail provisioning and again before binding",
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

test("database serializes tenant and platform bindings on one Auth UUID", () => {
  assert.match(
    authSurfaceMigration,
    /CREATE FUNCTION public\.fieldgrid_enforce_auth_surface_separation\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/u,
  );
  assert.match(
    authSurfaceMigration,
    /pg_advisory_xact_lock\([\s\S]*hashtextextended\([\s\S]*NEW\.user_id::text/u,
  );
  assert.match(
    authSurfaceMigration,
    /TG_TABLE_NAME = 'tenant_users'[\s\S]*FROM public\.platform_users[\s\S]*platform_user\.user_id = NEW\.user_id/u,
  );
  assert.match(
    authSurfaceMigration,
    /TG_TABLE_NAME = 'platform_users'[\s\S]*FROM public\.tenant_users[\s\S]*tenant_user\.user_id = NEW\.user_id/u,
  );
  assert.match(
    authSurfaceMigration,
    /CREATE TRIGGER tenant_users_auth_surface_separation[\s\S]*BEFORE INSERT OR UPDATE OF user_id ON public\.tenant_users/u,
  );
  assert.match(
    authSurfaceMigration,
    /CREATE TRIGGER platform_users_auth_surface_separation[\s\S]*BEFORE INSERT OR UPDATE OF user_id ON public\.platform_users/u,
  );
  assert.match(
    authSurfaceMigration,
    /REVOKE ALL ON FUNCTION public\.fieldgrid_enforce_auth_surface_separation\(\)[\s\S]*FROM PUBLIC/u,
  );
  assert.doesNotMatch(
    authSurfaceMigration,
    /DISABLE ROW LEVEL SECURITY|ALTER TABLE[\s\S]*DISABLE TRIGGER|\bGRANT\b/iu,
  );
  assert.doesNotMatch(
    authSurfaceMigration,
    /\b(?:UPDATE|DELETE FROM)\s+public\.(?:tenant_users|platform_users)\b/iu,
  );
});

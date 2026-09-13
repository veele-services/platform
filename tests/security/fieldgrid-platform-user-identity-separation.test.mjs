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
const tenantInvitationSourceMigration = readFileSync(
  "lib/db/migrations/20260913165000_bind_tenant_invite_reservation_sources.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const invitationReservationMigration = readFileSync(
  "lib/db/migrations/20260913170000_bind_authorization_invitation_reservations.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const activeTenantInvitationReservationMigration = readFileSync(
  "lib/db/migrations/20260913171000_bind_active_tenant_invitation_reservations.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const tenantSchema = readFileSync(
  "lib/db/src/schema/tenants.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const platformUserSchema = readFileSync(
  "lib/db/src/schema/platform-users.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const platformUserSeed = readFileSync(
  "lib/db/src/seed/platform-users.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const personnelSchema = readFileSync(
  "lib/db/src/schema/personnel.ts",
  "utf8",
).replaceAll("\r\n", "\n");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("an existing portal identity cannot be rewritten for another portal", () => {
  const mismatchGuard = portalInvites.match(
    /const existingPortal = existingUser\.app_metadata\?\.portal;([\s\S]*?)const hasSignedIn/u,
  );
  assert.ok(mismatchGuard, "existing portal guard must remain explicit");
  assert.match(mismatchGuard[1], /existingPortal !== opts\.portal/u);
  assert.doesNotMatch(mismatchGuard[1], /allowExistingActive/u);
});

test("platform-user creation rejects tenant identities and compensates Auth failures", () => {
  const reservationStart = platformActions.indexOf(
    "async function reservePlatformUserInvitation",
  );
  const upsertStart = platformActions.indexOf(
    "export async function upsertPlatformUser",
  );
  const inviteStart = platformActions.indexOf(
    "export async function invitePlatformUserFromForm",
  );
  const updateStart = platformActions.indexOf(
    "export async function updatePlatformUserFromForm",
  );
  const updateEnd = platformActions.indexOf(
    "export async function sendPlatformUserPasswordResetFromForm",
  );
  assert.ok(
    reservationStart >= 0 &&
      upsertStart > reservationStart &&
      inviteStart > upsertStart &&
      updateStart > inviteStart &&
      updateEnd > updateStart,
  );

  const reservationSource = platformActions.slice(
    reservationStart,
    upsertStart,
  );
  const upsertSource = platformActions.slice(upsertStart, inviteStart);
  const inviteSource = platformActions.slice(inviteStart, updateStart);
  const updateSource = platformActions.slice(updateStart, updateEnd);
  const upsertTenantGuard = upsertSource.indexOf(
    "authUserHasTenantMembership(",
  );
  const upsertPlatformWrite = upsertSource.indexOf(
    ".insert(platformUsersTable)",
  );
  assert.ok(
    upsertTenantGuard >= 0 && upsertPlatformWrite > upsertTenantGuard,
    "tenant identity check must precede the direct platform write",
  );

  const authPreflight = inviteSource.indexOf("findAuthUserByEmail(");
  const provision = inviteSource.indexOf("provisionPortalUserForActivation(");
  const postProvisionGuard = inviteSource.indexOf(
    "authUserHasTenantMembership(invite.user.id)",
  );
  const platformMembershipGuard = inviteSource.indexOf(
    "authUserHasPlatformMembership(invite.user.id, role)",
  );
  const reservation = inviteSource.indexOf("reservePlatformUserInvitation({");
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
    reservationSource,
    /\.insert\(platformUsersTable\)[\s\S]*status: "inactive"[\s\S]*invitationSource: PLATFORM_USER_INVITATION_SOURCE[\s\S]*invitationReservationId: sql`gen_random_uuid\(\)`[\s\S]*\.onConflictDoNothing/u,
  );
  assert.match(
    reservationSource,
    /\.for\("update"\)[\s\S]*existingReservation\.role !== input\.role[\s\S]*existingReservation\.status !== "inactive"[\s\S]*existingReservation\.invitationSource !==[\s\S]*PLATFORM_USER_INVITATION_SOURCE[\s\S]*!existingReservation\.invitationReservationId/u,
  );
  assert.match(
    reservationSource,
    /invitationReservationId: sql`gen_random_uuid\(\)`[\s\S]*eq\([\s\S]*platformUsersTable\.invitationReservationId,[\s\S]*existingReservation\.invitationReservationId/u,
  );
  assert.match(
    inviteSource,
    /activate: async \(reserved\)[\s\S]*\.update\(platformUsersTable\)[\s\S]*invitationSource: null,[\s\S]*invitationReservationId: null,[\s\S]*eq\(platformUsersTable\.status, "inactive"\)[\s\S]*eq\([\s\S]*platformUsersTable\.invitationSource,[\s\S]*reserved\.invitationSource[\s\S]*eq\([\s\S]*platformUsersTable\.invitationReservationId,[\s\S]*reserved\.invitationReservationId/u,
  );
  assert.doesNotMatch(
    reservationSource,
    /\.insert\(platformUsersTable\)[\s\S]{0,500}?\.onConflictDoUpdate/u,
  );
  for (const genericWrite of [upsertSource, updateSource]) {
    assert.match(
      genericWrite,
      /invitationSource !== null[\s\S]*invitationReservationId !== null/u,
    );
    assert.match(
      genericWrite,
      /isNull\(platformUsersTable\.invitationSource\)[\s\S]*isNull\(platformUsersTable\.invitationReservationId\)/u,
    );
    assert.doesNotMatch(genericWrite, /invitationSource: null/u);
    assert.doesNotMatch(genericWrite, /invitationReservationId: null/u);
  }
});

test("tenant invitations preflight platform identities before Auth delivery", () => {
  const inviteSource = tenantRoleActions.slice(
    tenantRoleActions.indexOf("export async function inviteTenantUser"),
  );
  const authPreflight = inviteSource.indexOf("findAuthUserByEmail(");
  const preflightMembership = inviteSource.indexOf(
    "authUserHasPlatformMembership(existingAuthUser.id)",
  );
  const provision = inviteSource.indexOf("provisionPortalUserForActivation({");
  const postProvisionMembership = inviteSource.indexOf(
    "authUserHasPlatformMembership(invitedUserId)",
  );
  const reservation = inviteSource.indexOf(
    "finalizePortalAuthorizationReservation(invite",
  );
  assert.ok(
    authPreflight >= 0 &&
      preflightMembership > authPreflight &&
      provision > preflightMembership &&
      postProvisionMembership > provision &&
      reservation > postProvisionMembership,
    "platform membership must be checked before delivery and again before reservation",
  );
  assert.match(
    tenantRoleActions,
    /function authUserHasPlatformMembership[\s\S]*\.from\(platformUsersTable\)[\s\S]*eq\(platformUsersTable\.userId, userId\)/u,
  );
  assert.match(
    inviteSource.slice(postProvisionMembership, reservation),
    /await invite\.rollback\(\)/u,
  );

  const platformTenantInviteSource = sourceBetween(
    platformTenantActions,
    "async function inviteOrFindTenantAuthUser",
    "type TenantAuthReservation",
  );
  const platformTenantAuthPreflight = platformTenantInviteSource.indexOf(
    "findAuthUserByEmail(admin, email)",
  );
  const platformTenantPreflightMembership = platformTenantInviteSource.indexOf(
    "platformTenantAuthUserHasPlatformMembership(existingAuthUser.id)",
  );
  const platformTenantProvision = platformTenantInviteSource.indexOf(
    "provisionPortalUserForActivation({",
  );
  const platformTenantPostProvisionMembership =
    platformTenantInviteSource.indexOf(
      "hasPlatformMembership = await platformTenantAuthUserHasPlatformMembership(",
    );
  assert.ok(
    platformTenantAuthPreflight >= 0 &&
      platformTenantPreflightMembership > platformTenantAuthPreflight &&
      platformTenantProvision > platformTenantPreflightMembership &&
      platformTenantPostProvisionMembership > platformTenantProvision,
    "platform-managed tenant invites must check platform membership before delivery and after provisioning",
  );
  assert.match(
    platformTenantActions,
    /function platformTenantAuthUserHasPlatformMembership[\s\S]*\.from\(platformUsersTable\)[\s\S]*eq\(platformUsersTable\.userId, userId\)/u,
  );
  assert.match(
    portalInvites,
    /export async function findAuthUserByEmail[\s\S]*for \(let page = 1; page <= 20; page \+= 1\)[\s\S]*listUsers\(\{[\s\S]*page,[\s\S]*perPage: 1000/u,
  );
  assert.match(
    platformTenantInviteSource.slice(platformTenantPostProvisionMembership),
    /await invite\.rollback\(\)/u,
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
  assert.doesNotMatch(tenantRoleActions, /reservation\.created/u);
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
  assert.equal([...personnelActions.matchAll(/expectedUserId:/gu)].length, 3);
  assert.match(
    personnelActions,
    /function reservePersonnelActivationAuthorization[\s\S]*userId: null[\s\S]*function activatePersonnelAuthorizationReservation[\s\S]*userId: reservation\.invitedUserId/u,
  );
  assert.match(
    personnelActions,
    /function activatePersonnelAuthorizationReservation[\s\S]*invitationReservationId: null,[\s\S]*isNull\(personnelTable\.userId\)[\s\S]*eq\([\s\S]*personnelTable\.invitationReservationId,[\s\S]*reservation\.invitationReservationId/u,
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
  const platformTenantReservationSource = sourceBetween(
    platformTenantActions,
    "async function reserveTenantAuthInvite",
    "function tenantAuthReservationPredicate",
  );
  assert.ok(
    platformTenantReservationSource.indexOf('.for("key share")') <
      platformTenantReservationSource.indexOf(".insert(tenantUsersTable)"),
    "platform-managed invites must lock their exact tenant roles before reserving membership",
  );
  assert.match(
    platformTenantReservationSource,
    /expectedTenantRoleIds[\s\S]*eq\(tenantRolesTable\.tenantId, tenantId\)[\s\S]*inArray\(tenantRolesTable\.id, expectedTenantRoleIds\)/u,
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

test("authorization invitation reservations are durable and flow-bound", () => {
  for (const source of [
    "tenant_role_invite",
    "platform_tenant_admin",
    "platform_tenant_owner",
    "tenant_provisioning_owner",
  ]) {
    assert.match(tenantSchema, new RegExp(`"${source}"`, "u"));
    assert.match(
      tenantInvitationSourceMigration,
      new RegExp(`'${source}'`, "u"),
    );
  }
  assert.match(
    tenantSchema,
    /invitationSource: varchar\("invitation_source", \{[\s\S]*length: 64,[\s\S]*\}\)\.\$type<TenantUserInvitationSource>/u,
  );
  assert.match(
    tenantSchema,
    /invitationReservationId: uuid\("invitation_reservation_id"\)/u,
  );
  assert.match(
    tenantInvitationSourceMigration,
    /ADD CONSTRAINT tenant_users_invitation_source_state_check[\s\S]*invitation_source IS NULL[\s\S]*status = 'invited'[\s\S]*tenant_role_invite'[\s\S]*role = 'member'[\s\S]*platform_tenant_owner'[\s\S]*tenant_provisioning_owner'[\s\S]*role = 'owner'/u,
  );
  assert.match(
    activeTenantInvitationReservationMigration,
    /ADD CONSTRAINT tenant_users_invitation_source_state_check_v2[\s\S]*status = 'invited'[\s\S]*status = 'active'[\s\S]*tenant_role_invite'[\s\S]*platform_tenant_admin'[\s\S]*platform_tenant_owner'[\s\S]*NOT VALID[\s\S]*VALIDATE CONSTRAINT tenant_users_invitation_source_state_check_v2[\s\S]*DROP CONSTRAINT tenant_users_invitation_source_state_check[\s\S]*RENAME CONSTRAINT tenant_users_invitation_source_state_check_v2/u,
  );
  assert.doesNotMatch(
    activeTenantInvitationReservationMigration,
    /^(?:BEGIN|COMMIT);$/mu,
    "the migration runner owns schema-and-journal transaction control",
  );
  const activeReservationConstraintBranch = sourceBetween(
    activeTenantInvitationReservationMigration,
    "status = 'active'",
    ") NOT VALID",
  );
  assert.doesNotMatch(
    activeReservationConstraintBranch,
    /tenant_provisioning_owner/u,
  );

  assert.match(
    tenantRoleActions,
    /TENANT_ROLE_INVITATION_SOURCE = "tenant_role_invite"[\s\S]*status: "invited",[\s\S]*invitationSource: TENANT_ROLE_INVITATION_SOURCE,[\s\S]*invitationReservationId: sql`gen_random_uuid\(\)`/u,
  );
  assert.match(
    tenantRoleActions,
    /existingMembership\.status === "active" &&[\s\S]*TENANT_ROLE_INVITATION_SOURCE[\s\S]*if \(existingMembership\.status === "active"\)[\s\S]*\.update\(tenantUsersTable\)[\s\S]*invitationSource: TENANT_ROLE_INVITATION_SOURCE[\s\S]*invitationReservationId: sql`gen_random_uuid\(\)`[\s\S]*eq\(tenantUsersTable\.status, "active"\)[\s\S]*\.returning/u,
  );
  assert.match(
    tenantRoleActions,
    /activeMembershipReservation =[\s\S]*reservation\.membership\.status === "active"[\s\S]*invitationSource ===[\s\S]*TENANT_ROLE_INVITATION_SOURCE[\s\S]*invitationReservationId !== null[\s\S]*status: "active",[\s\S]*invitationSource: null,[\s\S]*invitationReservationId: null/u,
  );
  assert.doesNotMatch(
    tenantRoleActions,
    /existingMembership\.status === "active"[\s\S]{0,250}?return \{ membership: existingMembership \}/u,
  );

  assert.match(
    tenantProvisioning,
    /TENANT_PROVISIONING_OWNER_INVITATION_SOURCE =[\s\S]*"tenant_provisioning_owner"[\s\S]*status: "invited",[\s\S]*invitationSource: TENANT_PROVISIONING_OWNER_INVITATION_SOURCE,[\s\S]*invitationReservationId: sql`gen_random_uuid\(\)`/u,
  );
  assert.match(
    tenantProvisioning,
    /existingReservation\.role !== "owner" \|\|[\s\S]*existingReservation\.status !== "invited" \|\|[\s\S]*existingReservation\.invitationSource !==[\s\S]*TENANT_PROVISIONING_OWNER_INVITATION_SOURCE/u,
  );
  assert.match(
    tenantProvisioning,
    /eq\([\s\S]*tenantUsersTable\.invitationSource,[\s\S]*input\.authorizationReservation\.invitationSource[\s\S]*eq\([\s\S]*tenantUsersTable\.invitationReservationId,[\s\S]*input\.authorizationReservation\.invitationReservationId[\s\S]*De gereserveerde ownerautorisatie/u,
  );
  assert.match(
    tenantProvisioning,
    /status: "active",[\s\S]*invitationSource: null,[\s\S]*invitationReservationId: null/u,
  );
  const completeProvisioningSource = sourceBetween(
    tenantProvisioning,
    "export async function completeProvisionedTenantOwnerInvite",
    "export async function rollbackProvisionedTenant",
  );
  assert.match(
    completeProvisioningSource,
    /authorizationReservation: ProvisionedTenantOwnerAuthorizationReservation/u,
  );
  assert.doesNotMatch(
    completeProvisioningSource,
    /authorizationReservation\?:/u,
  );
  assert.doesNotMatch(
    completeProvisioningSource,
    /\.insert\(tenantUsersTable\)/u,
    "provisioning completion must activate only its exact reservation",
  );

  assert.match(
    platformTenantActions,
    /PLATFORM_TENANT_ADMIN_INVITATION_SOURCE =[\s\S]*"platform_tenant_admin"[\s\S]*PLATFORM_TENANT_OWNER_INVITATION_SOURCE =[\s\S]*"platform_tenant_owner"/u,
  );
  assert.match(
    platformTenantActions,
    /existingReservation\.status === "active" &&[\s\S]*existingReservation\.invitationSource === invitationSource[\s\S]*if \(existingReservation\.status === "active"\)[\s\S]*\.update\(tenantUsersTable\)[\s\S]*invitationSource,[\s\S]*invitationReservationId: sql`gen_random_uuid\(\)`[\s\S]*eq\(tenantUsersTable\.status, "active"\)[\s\S]*\.returning/u,
  );
  assert.match(
    platformTenantActions,
    /tenantAuthReservationPredicate[\s\S]*eq\([\s\S]*tenantUsersTable\.invitationSource,[\s\S]*reservation\.invitationSource[\s\S]*eq\([\s\S]*tenantUsersTable\.invitationReservationId,[\s\S]*reservation\.invitationReservationId/u,
  );
  assert.doesNotMatch(
    platformTenantActions,
    /existingReservation\.status === "active"[\s\S]{0,250}?return \{ \.\.\.existingReservation, invitationSource: null \}/u,
  );
  assert.match(
    platformTenantActions,
    /reserveTenantAuthInvite\([\s\S]*PLATFORM_TENANT_ADMIN_INVITATION_SOURCE[\s\S]*reserveTenantAuthInvite\([\s\S]*PLATFORM_TENANT_OWNER_INVITATION_SOURCE/u,
  );
  const addTenantAdminSource = sourceBetween(
    platformTenantActions,
    "export async function addPlatformTenantAdmin",
    "export async function updatePlatformTenantAdmin",
  );
  const updateTenantAdminSource = sourceBetween(
    platformTenantActions,
    "export async function updatePlatformTenantAdmin",
    "export async function deletePlatformTenantAdmin",
  );
  const deleteTenantAdminSource = sourceBetween(
    platformTenantActions,
    "export async function deletePlatformTenantAdmin",
    "export async function sendPlatformTenantAdminPasswordReset",
  );
  const updateTenantOwnerSource = sourceBetween(
    platformTenantActions,
    "export async function updatePlatformTenantOwnerInvite",
    "export async function listPlatformTenantRegions",
  );
  for (const owningInviteFlow of [
    addTenantAdminSource,
    updateTenantOwnerSource,
  ]) {
    assert.match(owningInviteFlow, /invitationSource: null/u);
    assert.match(owningInviteFlow, /invitationReservationId: null/u);
  }
  assert.match(
    updateTenantAdminSource,
    /invitationSource: tenantUsersTable\.invitationSource[\s\S]*invitationReservationId: tenantUsersTable\.invitationReservationId/u,
  );
  assert.match(
    updateTenantAdminSource,
    /invitationSource !== null[\s\S]*invitationReservationId !== null/u,
  );
  assert.match(
    updateTenantAdminSource,
    /isNull\(tenantUsersTable\.invitationSource\)[\s\S]*isNull\(tenantUsersTable\.invitationReservationId\)/u,
  );
  assert.doesNotMatch(updateTenantAdminSource, /invitationSource: null/u);
  assert.doesNotMatch(
    updateTenantAdminSource,
    /invitationReservationId: null/u,
  );
  assert.match(
    deleteTenantAdminSource,
    /invitationReservationId: tenantUsersTable\.invitationReservationId[\s\S]*\.for\("update"\)[\s\S]*lockedTenantUser\.invitationReservationId !== null[\s\S]*\.delete\(tenantUsersTable\)[\s\S]*isNull\(tenantUsersTable\.invitationSource\)[\s\S]*isNull\(tenantUsersTable\.invitationReservationId\)[\s\S]*\.returning\(\{ id: tenantUsersTable\.id \}\)/u,
  );

  assert.match(
    platformUserSchema,
    /PLATFORM_USER_INVITATION_SOURCES = \[[\s\S]*"platform_user_invite"[\s\S]*invitationSource: varchar\("invitation_source", \{[\s\S]*length: 64,[\s\S]*invitationReservationId: uuid\("invitation_reservation_id"\)/u,
  );
  assert.match(
    personnelSchema,
    /invitationReservationId: uuid\("invitation_reservation_id"\)/u,
  );
  for (const contract of [
    "tenant_users_invitation_reservation_check",
    "platform_users_invitation_reservation_check",
    "personnel_invitation_reservation_check",
  ]) {
    assert.match(invitationReservationMigration, new RegExp(contract, "u"));
  }
  assert.match(
    invitationReservationMigration,
    /UPDATE public\.tenant_users[\s\S]*invitation_reservation_id = gen_random_uuid\(\)[\s\S]*invitation_source IS NOT NULL/u,
  );
  assert.match(
    invitationReservationMigration,
    /platform_users_invitation_reservation_check[\s\S]*invitation_source = 'platform_user_invite'[\s\S]*invitation_reservation_id IS NOT NULL[\s\S]*status = 'inactive'/u,
  );
  assert.match(
    invitationReservationMigration,
    /personnel_invitation_reservation_check[\s\S]*invitation_reservation_id IS NULL[\s\S]*user_id IS NULL[\s\S]*invite_sent_at IS NOT NULL/u,
  );
  assert.match(
    personnelActions,
    /function reservePersonnelActivationAuthorization[\s\S]*invitationReservationId: sql`gen_random_uuid\(\)`[\s\S]*function activatePersonnelAuthorizationReservation[\s\S]*invitationReservationId: null/u,
  );
  const updatePersonnelSource = sourceBetween(
    personnelActions,
    "export async function updatePersonnel",
    "export async function setPersonnelStatus",
  );
  const setPersonnelStatusSource = sourceBetween(
    personnelActions,
    "export async function setPersonnelStatus",
    "export async function bulkSetPersonnelStatus",
  );
  const bulkSetPersonnelStatusSource = sourceBetween(
    personnelActions,
    "export async function bulkSetPersonnelStatus",
    "export async function invitePersonnel",
  );
  const updatePersonnelEmailSource = sourceBetween(
    personnelActions,
    "export async function updatePersonnelEmail",
    "export async function setPersonnelAuthBan",
  );
  const deletePersonnelSource = personnelActions.slice(
    personnelActions.indexOf("export async function deletePersonnel"),
  );
  for (const genericPersonnelWrite of [
    updatePersonnelSource,
    setPersonnelStatusSource,
    bulkSetPersonnelStatusSource,
    updatePersonnelEmailSource,
  ]) {
    assert.doesNotMatch(
      genericPersonnelWrite,
      /invitationReservationId: null/u,
      "generic personnel writes must leave invitation reservations intact",
    );
  }
  assert.match(
    updatePersonnelSource,
    /email: nextEmail,[\s\S]*email: +personnelTable\.email,[\s\S]*invitationReservationId: personnelTable\.invitationReservationId[\s\S]*const emailChanged = existing\.email !== nextEmail[\s\S]*emailChanged && existing\.invitationReservationId !== null/u,
  );
  assert.match(
    updatePersonnelSource,
    /\.\.\.\(emailChanged \? \{ email: nextEmail \} : \{\}\)[\s\S]*eq\(personnelTable\.email, existing\.email\)[\s\S]*emailChanged[\s\S]*\? isNull\(personnelTable\.invitationReservationId\)[\s\S]*\.returning\(\{ id: personnelTable\.id \}\)/u,
  );
  assert.match(
    updatePersonnelEmailSource,
    /invitationReservationId: personnelTable\.invitationReservationId[\s\S]*person\.invitationReservationId !== null[\s\S]*isNull\(personnelTable\.userId\)[\s\S]*isNull\(personnelTable\.invitationReservationId\)[\s\S]*\.returning\(\{ id: personnelTable\.id \}\)/u,
  );
  assert.match(
    deletePersonnelSource,
    /invitationReservationId: personnelTable\.invitationReservationId[\s\S]*person\.invitationReservationId !== null[\s\S]*\.delete\(personnelTable\)[\s\S]*isNull\(personnelTable\.invitationReservationId\)[\s\S]*\.returning\(\{ id: personnelTable\.id \}\)/u,
  );
  assert.match(
    platformUserSeed,
    /db\.transaction\(async \(tx\)[\s\S]*const seeded = await tx[\s\S]*setWhere: and\([\s\S]*isNull\(platformUsersTable\.invitationSource\)[\s\S]*isNull\(platformUsersTable\.invitationReservationId\)[\s\S]*seeded\.length !== platformUsers\.length[\s\S]*return seeded/u,
  );
  assert.doesNotMatch(platformUserSeed, /invitationSource: null/u);
  assert.doesNotMatch(platformUserSeed, /invitationReservationId: null/u);

  for (const source of [
    tenantRoleActions,
    platformTenantActions,
    tenantProvisioning,
    platformActions,
    personnelActions,
  ]) {
    assert.doesNotMatch(
      source,
      /eq\(\s*[\w.]+\.updatedAt,\s*[\w.]+\.updatedAt\s*\)/u,
      "database timestamps must not be used as invitation CAS tokens",
    );
  }
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { assertPlatformPrivilegeMigrationFrontier } from "../../scripts/fieldgrid-staging-field-demo-owner-binding-repair.mts";
import {
  allowedHistoricalRecordedMigrations,
  allowedLegacyTimestampMigrations,
} from "../../scripts/fieldgrid-migration-order-check.mjs";

const script = readFileSync(
  "scripts/fieldgrid-staging-field-demo-owner-binding-repair.mts",
  "utf8",
).replaceAll("\r\n", "\n");
const workflow = readFileSync(
  ".github/workflows/fieldgrid-staging-field-demo-owner-binding-repair.yml",
  "utf8",
).replaceAll("\r\n", "\n");
const postgres17MigrationTest = readFileSync(
  "tests/fieldgrid-realtime-projection-migration.test.mjs",
  "utf8",
).replaceAll("\r\n", "\n");
const recipientHistoryMigration = readFileSync(
  "lib/db/migrations/20260913135353_preserve_deleted_platform_notification_recipient_history.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const platformOwnerContinuityMigration = readFileSync(
  "lib/db/migrations/20260913162000_harden_platform_authorization_continuity.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const platformPrivilegeRepairDeleteMigration = readFileSync(
  "lib/db/migrations/20260913163000_scope_platform_privilege_repair_delete.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const authSurfaceLockAclMigration = readFileSync(
  "lib/db/migrations/20260913164000_close_auth_surface_lock_acl.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const platformPrivilegeMigrationFrontier = {
  committed: [
    { name: "20260909120000_predecessor.sql", hash: "predecessor", sql: "" },
    { name: "20260913135353_recipient.sql", hash: "recipient", sql: "one" },
    { name: "20260913154500_guard.sql", hash: "guard", sql: "two" },
    { name: "20260913161000_barrier.sql", hash: "barrier", sql: "three" },
    { name: "20260913162000_continuity.sql", hash: "continuity", sql: "four" },
    { name: "20260913163000_delete.sql", hash: "delete", sql: "five" },
    { name: "20260913164000_lock_acl.sql", hash: "lock-acl", sql: "six" },
    { name: "20260914100000_successor.sql", hash: "successor", sql: "seven" },
  ],
  predecessors: [
    { name: "20260909120000_predecessor.sql", hash: "predecessor", sql: "" },
  ],
  required: [
    { name: "20260913135353_recipient.sql", hash: "recipient", sql: "one" },
    { name: "20260913154500_guard.sql", hash: "guard", sql: "two" },
    { name: "20260913161000_barrier.sql", hash: "barrier", sql: "three" },
    { name: "20260913162000_continuity.sql", hash: "continuity", sql: "four" },
    { name: "20260913163000_delete.sql", hash: "delete", sql: "five" },
    { name: "20260913164000_lock_acl.sql", hash: "lock-acl", sql: "six" },
  ],
  successors: new Set(["20260914100000_successor.sql"]),
  legacyNames: new Set(["20260909120000_predecessor.sql"]),
  historical: new Map(),
};

function migrationRecord(name, hash, baselined = false) {
  return {
    name,
    hash,
    baselined,
    appliedAt: "2026-09-13T12:00:00.000Z",
  };
}

test("owner-binding repair exposes one fixed staging-only contract", () => {
  assert.match(
    script,
    /FIELD_DEMO_OWNER_BINDING_VERSION\s*=\s*[\n\s]*"fieldgrid-staging-field-demo-owner-binding-repair-v1"/u,
  );
  assert.match(
    script,
    /FIELD_DEMO_OWNER_BINDING_CONFIRMATION\s*=\s*[\n\s]*"fieldgrid-staging-field-demo-owner-binding-repair-v1"/u,
  );
  assert.match(script, /olyfmekyqozxrbrwwszu/u);
  assert.match(script, /https:\/\/olyfmekyqozxrbrwwszu\.supabase\.co/u);

  for (const exportedName of [
    "FieldDemoOwnerBindingSnapshot",
    "FieldDemoOwnerBindingState",
    "FieldDemoOwnerBindingDecision",
    "FieldDemoOwnerBindingRepairResult",
    "FieldDemoOwnerBindingFailureReason",
    "FieldDemoOwnerPlatformPrivilegeSnapshot",
    "FieldDemoOwnerPlatformPrivilegeSummary",
    "FieldDemoPlatformPrivilegeRepairResult",
    "FieldDemoPlatformPrivilegeRepairTarget",
    "validateFieldDemoOwnerBindingConfig",
    "classifyFieldDemoOwnerBinding",
    "summarizeFieldDemoOwnerPlatformPrivilege",
    "projectFieldDemoOwnerBindingAfterPlatformPrivilegeRepair",
    "fieldDemoPlatformPrivilegeRepairPreconditionIsSafe",
    "fieldDemoOwnerAuthMetadataPatch",
    "fieldDemoOwnerAuthMetadataIsNormalized",
    "fieldDemoOwnerAuthUpdateOutcome",
    "repairFieldDemoOwnerBinding",
    "safeFieldDemoOwnerBindingErrorCode",
    "safeFieldDemoOwnerBindingFailureReason",
    "formatSafeFieldDemoOwnerBindingError",
    "FIELD_DEMO_OWNER_BINDING_SNAPSHOT_QUERY",
    "loadFieldDemoOwnerBindingSnapshot",
    "FIELD_DEMO_OWNER_PLATFORM_PRIVILEGE_QUERY",
    "loadFieldDemoOwnerPlatformPrivilegeSnapshot",
    "applyExactPlatformPrivilegePrerequisiteMigrations",
  ]) {
    assert.match(
      script,
      new RegExp(
        `export (?:async )?(?:const|type|function) ${exportedName}\\b`,
        "u",
      ),
      `${exportedName} must remain independently testable`,
    );
  }
});

test("snapshot and classification prove the exact owner and Management binding", () => {
  assert.match(script, /FROM public\.tenants AS/u);
  assert.match(script, /FROM auth\.users AS/u);
  assert.match(script, /FROM public\.tenant_users AS/u);
  assert.match(script, /FROM public\.tenant_roles AS/u);
  assert.match(script, /(?:FROM|JOIN) public\.roles AS/u);
  assert.match(script, /FROM public\.tenant_user_roles AS/u);
  assert.match(script, /role\.name = 'Management'/u);
  assert.match(script, /membership\.role = 'owner'/u);
  assert.match(script, /membership\.status = 'active'/u);
  assert.match(script, /auth_user\.email_confirmed_at IS NOT NULL/u);
  assert.match(
    script,
    /coalesce\(length\(auth_user\.encrypted_password\), 0\) > 0/u,
  );
  assert.match(script, /auth_user\.deleted_at IS NULL/u);
  assert.match(script, /FROM public\.platform_users AS/u);
  for (const diagnostic of [
    "auth_core_count",
    "auth_contract_count",
    "auth_environment_count",
    "auth_portal_count",
    "auth_tenant_portal_count",
    "auth_platform_portal_count",
    "email_identity_count",
    "platform_user_count",
    "platform_user_active_count",
    "platform_user_inactive_count",
    "platform_user_suspended_count",
    "platform_user_owner_role_count",
    "platform_user_admin_role_count",
    "platform_user_support_role_count",
    "other_active_platform_owner_count",
    "other_active_platform_admin_count",
    "configured_actor_provided_count",
    "configured_actor_matches_owner_count",
    "configured_actor_eligible_count",
    "platform_support_grant_count",
    "platform_current_support_grant_count",
    "platform_current_runtime_support_grant_count",
    "platform_future_support_grant_count",
    "platform_support_actor_audit_count",
    "platform_recipient_reference_count",
    "platform_recipient_snapshot_count",
    "platform_blocking_reference_count",
    "platform_nonrecipient_set_null_reference_count",
    "platform_set_null_reference_count",
    "platform_audit_event_count",
    "platform_invite_event_count",
    "platform_create_event_count",
    "direct_platform_fk_count",
    "exact_direct_platform_fk_count",
    "indirect_grant_fk_count",
    "exact_indirect_grant_fk_count",
    "exact_set_null_nullable_column_count",
    "recipient_scope_check_count",
    "platform_owner_continuity_trigger_count",
    "unexpected_set_null_check_count",
    "unexpected_deletion_path_trigger_count",
  ]) {
    assert.match(script, new RegExp(`AS ${diagnostic}\\b`, "u"));
  }
  for (const reason of [
    "auth-owner-email-invalid",
    "auth-owner-core-invalid",
    "auth-owner-email-identity-invalid",
    "auth-owner-platform-privilege-present",
    "auth-owner-contract-invalid",
    "auth-owner-environment-invalid",
    "auth-owner-portal-invalid",
  ]) {
    assert.match(script, new RegExp(reason, "u"));
  }

  const authIdentityEnd = script.indexOf("AS auth_exact_count");
  const authIdentityStart = script.lastIndexOf(
    "(SELECT COUNT(*)::integer FROM auth.users AS auth_user",
    authIdentityEnd,
  );
  assert.ok(
    authIdentityStart >= 0 && authIdentityEnd > authIdentityStart,
    "auth identity predicate must remain explicit",
  );
  const authIdentityPredicate = script.slice(
    authIdentityStart,
    authIdentityEnd,
  );
  assert.match(authIdentityPredicate, /fieldgrid_automation_contract/u);
  assert.match(authIdentityPredicate, /fieldgrid_environment/u);
  assert.match(authIdentityPredicate, /portal/u);
  assert.doesNotMatch(
    authIdentityPredicate,
    /credential_activation_pending|backoffice_profile_name_required/u,
  );

  assert.match(script, /public\.platform_notification_dispatches/u);
  assert.doesNotMatch(script, /public\.platform_notifications\b/u);
  assert.match(script, /pg_catalog\.pg_constraint/u);
  assert.match(script, /pg_catalog\.pg_trigger/u);
  assert.match(script, /WHERE 1 = \(\s*SELECT COUNT\(\*\)/u);
  assert.match(script, /pg_catalog\.pg_get_expr/u);
  assert.doesNotMatch(script, /pg_get_constraintdef[^\n]*\n?\s*LIKE/u);
  assert.match(script, /child_column\.attnotnull = false/u);
  assert.match(script, /trigger_row\.tgtype::integer & target\.event_mask/u);
  assert.match(
    script,
    /recipient\.recipient_type = 'platform_user'[\s\S]*?NOT EXISTS \([\s\S]*?owner_account[\s\S]*?AS platform_blocking_reference_count/u,
  );
  assert.match(
    script,
    /recipient\.recipient_type = 'platform_user'[\s\S]*?recipient\.recipient_user_id[\s\S]*?AS platform_set_null_reference_count/u,
  );
  const diagnoseStart = script.indexOf('if (operation === "diagnose")');
  const mutationStart = script.indexOf(
    "await acquireOwnerBindingLock(client)",
    diagnoseStart,
  );
  assert.ok(diagnoseStart >= 0 && mutationStart > diagnoseStart);
  assert.match(
    script.slice(diagnoseStart, mutationStart),
    /loadFieldDemoOwnerPlatformPrivilegeSnapshot/u,
  );
  assert.doesNotMatch(
    script.slice(mutationStart),
    /loadFieldDemoOwnerPlatformPrivilegeSnapshot/u,
  );
});

test("repair and owner reconciliation are locked singular transactions", () => {
  assert.match(script, /BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE/u);
  assert.match(
    script,
    /pg_try_advisory_xact_lock\(hashtextextended\(\$1,\s*0\)\)/u,
  );
  assert.ok(
    [...script.matchAll(/ORDER BY[\s\S]{0,500}?FOR UPDATE/gu)].length >= 2,
    "mutable identities and bindings must be locked in deterministic order",
  );
  assert.match(
    script,
    /INSERT INTO public\.tenant_users\s*\(\s*tenant_id,\s*user_id,\s*role,\s*status\s*\)\s*SELECT[\s\S]*?WHERE NOT EXISTS/u,
  );
  assert.match(
    script,
    /INSERT INTO public\.tenant_user_roles\s*\(\s*tenant_id,\s*user_id,\s*tenant_role_id\s*\)\s*SELECT[\s\S]*?\bNOT EXISTS/u,
  );

  const insertedTables = [
    ...script.matchAll(/\bINSERT INTO\s+((?:public|auth)\.[a-z_]+)/giu),
  ].map((match) => match[1].toLowerCase());
  assert.deepEqual(insertedTables.sort(), [
    "public.tenant_user_roles",
    "public.tenant_users",
  ]);
  assert.ok(
    [...script.matchAll(/\.rowCount !== 1/gu)].length >= 5,
    "each approved insert, update, or platform-role delete must be singular",
  );
  assert.match(
    script,
    /UPDATE public\.tenant_users[\s\S]*SET role = 'admin'[\s\S]*WHERE tenant_id = \$1[\s\S]*AND user_id = \$2[\s\S]*role = 'owner'[\s\S]*status = 'active'/u,
  );
  assert.equal(
    [...script.matchAll(/\bDELETE\s+FROM\s+public\.platform_users\b/giu)]
      .length,
    1,
  );
  assert.doesNotMatch(script, /\bDELETE\s+FROM\s+auth\./iu);
  assert.doesNotMatch(script, /\bON CONFLICT\b/iu);
  assert.doesNotMatch(script, /\bINSERT INTO\s+public\.audit_log\b/iu);
  assert.doesNotMatch(script, /\b(?:INSERT INTO|UPDATE)\s+auth\./iu);
  assert.match(script, /await client\.query\("COMMIT"\)/u);
  assert.match(
    script,
    /const freshSnapshot = await loadFieldDemoOwnerBindingSnapshot/u,
  );
  assert.equal(
    [...script.matchAll(/repairFieldDemoOwnerBinding\(/gu)].length,
    2,
    "repair must be invoked once after its exported definition",
  );
});

test("diagnosis and workflow evidence remain categorical and secret-free", () => {
  assert.match(
    script,
    /BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY/u,
  );
  assert.match(script, /await client\.query\("ROLLBACK"\)/u);
  assert.match(script, /"artifacts"[\s\S]*"field-demo-owner-binding-repair"/u);
  assert.match(script, /`\$\{operation\}-\$\{runId\}-\$\{runAttempt\}\.json`/u);
  assert.match(script, /mode: 0o700/u);
  assert.match(script, /mode: 0o600/u);
  assert.match(script, /await chmod\([^,]+, 0o600\)/u);
  assert.match(
    script,
    /console\.error\(formatSafeFieldDemoOwnerBindingError\(error\)\)/u,
  );
  assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*error\.message/u);
  assert.doesNotMatch(script, /JSON\.stringify\(error/u);

  const evidenceType = script.match(
    /type [A-Za-z]*Evidence = \{([\s\S]*?)\n\};/u,
  );
  assert.ok(evidenceType, "owner-binding evidence type must be explicit");
  assert.doesNotMatch(
    evidenceType[1],
    /^\s+(?:tenantId|tenant_id|userId|user_id|roleId|role_id|email|slug|domain|url|credential|metadata|details)\??:/gimu,
  );
  assert.match(evidenceType[1], /observedState/u);
  assert.match(evidenceType[1], /mutationAttempted/u);
  assert.match(evidenceType[1], /platformPrivilegeSummary/u);
  assert.match(script, /schemaVersion: 3/u);
  assert.doesNotMatch(
    evidenceType[1],
    /platform_(?:user|support|audit|set_null).*count/u,
  );
});

test("platform-role removal preserves recipient history and normalizes Auth safely", () => {
  assert.match(
    recipientHistoryMigration,
    /pg_get_expr\([\s\S]*platform_notification_recipients_scope_check/u,
  );
  assert.match(
    recipientHistoryMigration,
    /ADD CONSTRAINT platform_notification_recipients_scope_history_check_v2 CHECK/u,
  );
  assert.match(
    recipientHistoryMigration,
    /recipient_type = 'platform_user'[\s\S]*tenant_id IS NULL[\s\S]*tenant_owner_invite_id IS NULL[\s\S]*recipient_user_id IS NOT NULL[\s\S]*platform_user_id IS NOT NULL[\s\S]*delivery_status IN \('sent', 'skipped', 'failed'\)/u,
  );
  assert.match(
    recipientHistoryMigration,
    /recipient_type = 'tenant_owner'[\s\S]*platform_user_id IS NULL[\s\S]*tenant_slug IS NOT NULL[\s\S]*tenant_owner_invite_id IS NOT NULL[\s\S]*recipient_email IS NOT NULL[\s\S]*tenant_id IS NOT NULL[\s\S]*delivery_status IN \('sent', 'skipped', 'failed'\)/u,
  );
  assert.match(
    recipientHistoryMigration,
    /UPDATE public\.platform_notification_recipients[\s\S]*SET recipient_user_id = platform_user\.user_id/u,
  );
  assert.match(recipientHistoryMigration, /NOT VALID/u);
  assert.match(
    recipientHistoryMigration,
    /VALIDATE CONSTRAINT platform_notification_recipients_scope_history_check_v2/u,
  );
  assert.match(
    recipientHistoryMigration,
    /DROP CONSTRAINT platform_notification_recipients_scope_check[\s\S]*RENAME CONSTRAINT platform_notification_recipients_scope_history_check_v2[\s\S]*TO platform_notification_recipients_scope_check/u,
  );
  assert.doesNotMatch(
    recipientHistoryMigration,
    /DISABLE ROW LEVEL SECURITY|\bGRANT\b|\bREVOKE\b|\bauth\./iu,
  );

  assert.match(script, /session_revoked_at: revokedAt/u);
  assert.match(script, /fieldgrid_platform_privilege_repair/u);
  assert.match(
    script,
    /app_metadata: fieldDemoOwnerAuthMetadataPatch\(revokedAt\)/u,
  );
  assert.match(
    script,
    /function fieldDemoOwnerAuthMetadataPatch\([\s\S]*platform_role: null/u,
  );
  assert.doesNotMatch(
    script,
    /fieldDemoOwnerAuthMetadataPatch\([\s\S]{0,500}?\.\.\.current/u,
  );
  assert.doesNotMatch(script, /\.\.\.normalizedAppMetadata/u);
  assert.match(script, /method: "PUT"/u);
  assert.match(
    script,
    /\/auth\/v1\/admin\/users\/\$\{encodeURIComponent\(target\.userId\)\}/u,
  );
  assert.match(script, /redirect: "error"/u);
  assert.match(script, /AbortSignal\.timeout\(AUTH_REQUEST_TIMEOUT_MS\)/u);
  assert.match(script, /pg_try_advisory_lock\(hashtextextended\(\$1, 0\)\)/u);
  assert.match(
    script,
    /DELETE FROM public\.platform_users AS platform_user[\s\S]*platform_user\.id = \$1::uuid[\s\S]*platform_user\.user_id = \$2::uuid[\s\S]*platform_user\.role = 'owner'[\s\S]*platform_user\.status = 'suspended'/u,
  );
  assert.match(
    script,
    /UPDATE public\.platform_users AS platform_user[\s\S]*SET status = 'suspended'[\s\S]*platform_user\.id = \$1::uuid[\s\S]*platform_user\.user_id = \$2::uuid/u,
  );
  assert.match(
    script,
    /recipient\.platform_user_id IS NULL[\s\S]*recipient\.recipient_user_id = \$2::uuid/u,
  );
  assert.match(
    script,
    /fieldDemoPlatformPrivilegeRepairPreconditionIsSafe\([\s\S]*lockedPlatformSummary/u,
  );
  assert.match(
    script,
    /failureStage = "platform_privilege_mutation";\s+mutationAttempted = true;\s+await removeFieldDemoPlatformPrivilege\(/u,
  );
  assert.match(
    script,
    /PLATFORM_PRIVILEGE_REQUIRED_MIGRATION_NAMES[\s\S]*20260913135353_preserve_deleted_platform_notification_recipient_history\.sql[\s\S]*20260913154500_prevent_cross_portal_identity_reuse\.sql[\s\S]*20260913161000_serialize_auth_surface_bindings_across_snapshots\.sql[\s\S]*20260913162000_harden_platform_authorization_continuity\.sql[\s\S]*20260913163000_scope_platform_privilege_repair_delete\.sql[\s\S]*20260913164000_close_auth_surface_lock_acl\.sql/u,
  );
  assert.match(
    script,
    /readdir\(migrationsDir,[\s\S]*requiredNames = names\.slice[\s\S]*predecessors: migrations\.slice\(0, firstRequiredIndex\)[\s\S]*required: migrations\.slice\(\s*firstRequiredIndex,[\s\S]*finalRequiredIndex \+ 1[\s\S]*successors: new Set/u,
  );
  assert.match(
    script,
    /for \(const migration of frontier\.predecessors\)[\s\S]*record\.hash !== migration\.hash/u,
  );
  assert.match(
    script,
    /for \(const \[index, migration\] of frontier\.required\.entries\(\)\)[\s\S]*firstPendingIndex[\s\S]*record\.baselined/u,
  );
  assert.match(
    script,
    /records\.some\([\s\S]*?frontier\.successors\.has\(record\.name\)[\s\S]*?record\.name\.localeCompare\(finalRequiredMigration\.name\) > 0/u,
  );
  assert.match(
    script,
    /for \(const migration of pending\)[\s\S]*await queryable\.query\(migration\.sql\)[\s\S]*INSERT INTO drizzle\.veele_sql_migrations[\s\S]*migration\.name, migration\.hash/u,
  );
  assert.ok(
    [
      ...script.matchAll(
        /SELECT name, hash, baselined, applied_at AS "appliedAt"[\s\S]*?ORDER BY applied_at, name/gu,
      ),
    ].length >= 2,
    "migration state and its locked recheck must validate the complete frontier",
  );
  assert.match(script, /SQL migration history contains an unreviewed entry/u);
  assert.match(
    script,
    /SQL migration history is not a contiguous committed prefix/u,
  );
  assert.match(script, /evidence\.mutationAttempted = mutationAttempted/u);
  assert.match(
    script,
    /SELECT platform_user\.id\s+FROM public\.platform_users AS platform_user\s+ORDER BY platform_user\.id\s+FOR UPDATE/u,
  );
  assert.match(
    script,
    /postPlatformSummary\.automationActorState !== "single-admin-ready"[\s\S]*postPlatformSummary\.configuredActorState !==[\s\S]*"other-active-eligible"/u,
  );
  assert.match(
    script,
    /freshPlatformSnapshot\.other_active_platform_owner_count < 1[\s\S]*freshPlatformSummary\.automationActorState !== "single-admin-ready"[\s\S]*freshPlatformSummary\.configuredActorState !==[\s\S]*"other-active-eligible"/u,
  );
  const repairStart = script.indexOf(
    'if (operation === "repair-platform-privilege")',
  );
  const quarantineCall = script.indexOf(
    "await suspendFieldDemoPlatformPrivilege(",
    repairStart,
  );
  const authCall = script.indexOf(
    "await normalizeFieldDemoOwnerAuthMetadata(",
    repairStart,
  );
  const deleteCall = script.indexOf(
    "await removeFieldDemoPlatformPrivilege(",
    repairStart,
  );
  assert.ok(
    repairStart >= 0 &&
      quarantineCall > repairStart &&
      authCall > quarantineCall &&
      deleteCall > authCall,
    "repair must quarantine before Auth normalization and delete only afterward",
  );
  assert.doesNotMatch(
    script,
    /console\.(?:log|error)\([^\n]*(?:serviceCredential|appMetadata|userId|recipientIds)/u,
  );
});

test("database serializes active platform-owner removal and closes trigger ACLs", () => {
  assert.match(
    platformOwnerContinuityMigration,
    /LOCK TABLE public\.platform_users IN SHARE ROW EXCLUSIVE MODE/u,
  );
  assert.match(
    platformOwnerContinuityMigration,
    /CREATE TABLE public\.fieldgrid_platform_owner_continuity_lock \([\s\S]*singleton boolean PRIMARY KEY[\s\S]*revision bigint NOT NULL/u,
  );
  assert.match(
    platformOwnerContinuityMigration,
    /ENABLE ROW LEVEL SECURITY[\s\S]*REVOKE ALL ON TABLE public\.fieldgrid_platform_owner_continuity_lock/u,
  );
  assert.match(
    platformOwnerContinuityMigration,
    /CREATE FUNCTION public\.fieldgrid_enforce_platform_owner_continuity\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/u,
  );
  assert.match(
    platformOwnerContinuityMigration,
    /INSERT INTO public\.fieldgrid_platform_owner_continuity_lock AS continuity_lock[\s\S]*ON CONFLICT \(singleton\) DO UPDATE[\s\S]*continuity_lock\.revision \+ 1/u,
  );
  assert.match(
    platformOwnerContinuityMigration,
    /other_owner\.id <> OLD\.id[\s\S]*other_owner\.role = 'owner'[\s\S]*other_owner\.status = 'active'[\s\S]*CONSTRAINT = 'fieldgrid_platform_owner_continuity'/u,
  );
  assert.match(
    platformOwnerContinuityMigration,
    /CREATE TRIGGER platform_users_owner_continuity_update[\s\S]*CREATE TRIGGER platform_users_owner_continuity_delete/u,
  );
  assert.match(
    platformOwnerContinuityMigration,
    /REVOKE EXECUTE ON FUNCTION[\s\S]*fieldgrid_enforce_auth_surface_separation\(\)[\s\S]*fieldgrid_enforce_platform_owner_continuity\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role,[\s\S]*GRANT EXECUTE ON FUNCTION[\s\S]*TO fieldgrid_runtime_data/u,
  );
  assert.match(
    platformOwnerContinuityMigration,
    /fieldgrid_runtime_relation_capabilities[\s\S]*'fieldgrid_platform_owner_continuity_lock'[\s\S]*'function_only'[\s\S]*fieldgrid_runtime_function_capabilities[\s\S]*'fieldgrid_enforce_platform_owner_continuity'[\s\S]*'trigger_dependency'/u,
  );
  assert.match(
    postgres17MigrationTest,
    /platform owner continuity serializes concurrent last-owner removal/u,
  );
});

test("Auth surface lock revokes every named Supabase and runtime role", () => {
  assert.match(
    authSurfaceLockAclMigration,
    /REVOKE ALL ON TABLE public\.fieldgrid_auth_surface_locks[\s\S]*FROM PUBLIC, anon, authenticated, service_role,[\s\S]*fieldgrid_runtime_app, fieldgrid_runtime_data/u,
  );
  assert.match(
    authSurfaceLockAclMigration,
    /'SELECT'[\s\S]*'INSERT'[\s\S]*'UPDATE'[\s\S]*'DELETE'[\s\S]*'TRUNCATE'[\s\S]*'REFERENCES'[\s\S]*'TRIGGER'[\s\S]*'MAINTAIN'[\s\S]*has_table_privilege/u,
  );
  assert.match(
    authSurfaceLockAclMigration,
    /relation_name = 'fieldgrid_auth_surface_locks'[\s\S]*access_mode <> 'function_only'[\s\S]*privileges <> ARRAY\[\]::text\[\]/u,
  );
  assert.match(
    postgres17MigrationTest,
    /Auth surface lock denies direct access to named Supabase and runtime roles/u,
  );
});

test("migration admin can delete only the quarantined tenant-overlap row", () => {
  assert.match(
    platformPrivilegeRepairDeleteMigration,
    /configuration\.migration_admin[\s\S]*configured_migration_admin <> current_user/u,
  );
  assert.match(
    platformPrivilegeRepairDeleteMigration,
    /GRANT DELETE ON TABLE public\.platform_users TO %I/u,
  );
  assert.match(
    platformPrivilegeRepairDeleteMigration,
    /CREATE POLICY fieldgrid_migration_admin_platform_overlap_delete[\s\S]*FOR DELETE TO %I[\s\S]*role = ''owner''[\s\S]*status = ''suspended''[\s\S]*FROM public\.tenant_users AS tenant_membership[\s\S]*tenant_membership\.user_id = platform_users\.user_id[\s\S]*tenant_membership\.status = ''active''/u,
  );
  assert.match(
    platformPrivilegeRepairDeleteMigration,
    /policy_row\.polcmd = 'd'[\s\S]*policy_row\.polroles = ARRAY\[[\s\S]*configured_migration_admin/u,
  );
  assert.match(
    platformPrivilegeRepairDeleteMigration,
    /'anon'::name[\s\S]*'authenticated'::name[\s\S]*'service_role'::name[\s\S]*'fieldgrid_runtime_app'::name[\s\S]*'fieldgrid_runtime_data'::name[\s\S]*has_table_privilege\([\s\S]*'DELETE'/u,
  );
  assert.match(
    platformPrivilegeRepairDeleteMigration,
    /relation_name = 'platform_users'[\s\S]*'DELETE' = ANY\(capability\.privileges\)[\s\S]*must not expand runtime capabilities/u,
  );
  assert.doesNotMatch(
    platformPrivilegeRepairDeleteMigration,
    /TO (?:PUBLIC|anon|authenticated|service_role|fieldgrid_runtime_app|fieldgrid_runtime_data)/u,
  );
  assert.match(
    postgres17MigrationTest,
    /platform privilege repair has one scoped migration-admin DELETE policy/u,
  );
});

test("platform-privilege prerequisite frontier returns only one contiguous pending suffix", () => {
  const predecessor = migrationRecord(
    "20260909120000_predecessor.sql",
    "predecessor",
  );
  assert.deepEqual(
    assertPlatformPrivilegeMigrationFrontier(
      platformPrivilegeMigrationFrontier,
      [predecessor],
    ).map(({ name }) => name),
    platformPrivilegeMigrationFrontier.required.map(({ name }) => name),
  );
  assert.deepEqual(
    assertPlatformPrivilegeMigrationFrontier(
      platformPrivilegeMigrationFrontier,
      [
        predecessor,
        migrationRecord("20260913135353_recipient.sql", "recipient"),
      ],
    ).map(({ name }) => name),
    [
      "20260913154500_guard.sql",
      "20260913161000_barrier.sql",
      "20260913162000_continuity.sql",
      "20260913163000_delete.sql",
      "20260913164000_lock_acl.sql",
    ],
  );
  assert.deepEqual(
    assertPlatformPrivilegeMigrationFrontier(
      platformPrivilegeMigrationFrontier,
      [
        predecessor,
        migrationRecord("20260913135353_recipient.sql", "recipient"),
        migrationRecord("20260913154500_guard.sql", "guard"),
        migrationRecord("20260913161000_barrier.sql", "barrier"),
        migrationRecord("20260913162000_continuity.sql", "continuity"),
        migrationRecord("20260913163000_delete.sql", "delete"),
        migrationRecord("20260913164000_lock_acl.sql", "lock-acl"),
      ],
    ),
    [],
  );
});

test("platform-privilege history policy mirrors the canonical migration-order policy", () => {
  for (const name of allowedLegacyTimestampMigrations) {
    assert.ok(script.includes(name), `${name} must remain an approved legacy name`);
  }
  for (const [name, policy] of Object.entries(
    allowedHistoricalRecordedMigrations,
  )) {
    assert.ok(script.includes(name), `${name} must remain explicitly reviewed`);
    assert.ok(
      script.includes(policy.sqlSha256),
      `${name} must retain its frozen historical hash`,
    );
    if (policy.canonicalName) {
      assert.ok(
        script.includes(policy.canonicalName),
        `${name} must retain its canonical replacement`,
      );
    }
  }
});

test("platform-privilege prerequisite frontier rejects gaps, drift, baselines, and successors", () => {
  const predecessor = migrationRecord(
    "20260909120000_predecessor.sql",
    "predecessor",
  );
  assert.throws(
    () =>
      assertPlatformPrivilegeMigrationFrontier(
        platformPrivilegeMigrationFrontier,
        [
          predecessor,
          migrationRecord("20260913135353_recipient.sql", "recipient"),
          migrationRecord("20260913161000_barrier.sql", "barrier"),
        ],
      ),
    /not a contiguous committed prefix/u,
  );
  assert.throws(
    () =>
      assertPlatformPrivilegeMigrationFrontier(
        platformPrivilegeMigrationFrontier,
        [migrationRecord(predecessor.name, "drift")],
      ),
    /source-hash drift/u,
  );
  assert.throws(
    () =>
      assertPlatformPrivilegeMigrationFrontier(
        platformPrivilegeMigrationFrontier,
        [
          predecessor,
          migrationRecord("20260913135353_recipient.sql", "recipient", true),
        ],
      ),
    /baselined without execution/u,
  );
  assert.throws(
    () =>
      assertPlatformPrivilegeMigrationFrontier(
        platformPrivilegeMigrationFrontier,
        [
          predecessor,
          migrationRecord("20260914100000_successor.sql", "successor"),
        ],
      ),
    /not a contiguous committed prefix/u,
  );
});

test("workflow binds database credentials to an exact protected main operation", () => {
  assert.match(workflow, /^  workflow_dispatch:$/mu);
  assert.match(workflow, /^permissions:\n  contents: read$/mu);
  assert.match(
    workflow,
    /type: choice\n\s+options:\n\s+- diagnose\n\s+- repair\n\s+- reconcile\n\s+- repair-platform-privilege/u,
  );
  assert.match(workflow, /group: veele-staging/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.match(workflow, /^    environment: staging$/mu);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$EXPECTED_MAIN_SHA"/u);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /git\/ref\/heads\/main/u);
  assert.match(
    workflow,
    /Remote main advanced before owner-binding operation/u,
  );
  assert.match(workflow, /--moduleResolution Bundler/u);
  assert.match(workflow, /--strict/u);
  assert.match(
    workflow,
    /tsc[\s\\]+.*fieldgrid-staging-field-demo-owner-binding-repair\.mts/su,
  );

  const diagnoseStep = workflow.indexOf(
    "- name: Diagnose the exact staging owner-binding state",
  );
  const mutationStep = workflow.indexOf(
    "- name: Repair or reconcile the exact staging owner-binding state",
  );
  const platformPrivilegeStep = workflow.indexOf(
    "- name: Normalize and remove the exact field-demo platform privilege",
  );
  const uploadStep = workflow.indexOf(
    "- name: Upload secret-free owner-binding evidence",
  );
  const reverifyStep = workflow.indexOf(
    "- name: Reverify exact main immediately before owner-binding operation",
  );
  assert.ok(
    reverifyStep >= 0 &&
      diagnoseStep > reverifyStep &&
      mutationStep > diagnoseStep &&
      platformPrivilegeStep > mutationStep &&
      uploadStep > platformPrivilegeStep,
  );
  assert.doesNotMatch(
    workflow.slice(0, diagnoseStep),
    /FIELDGRID_(?:RUNTIME|MIGRATION)_DATABASE_URL:\s*\$\{\{|NEXT_PUBLIC_SUPABASE_URL:\s*\$\{\{/u,
  );
  const diagnoseSource = workflow.slice(diagnoseStep, mutationStep);
  const mutationSource = workflow.slice(mutationStep, platformPrivilegeStep);
  const platformPrivilegeSource = workflow.slice(
    platformPrivilegeStep,
    uploadStep,
  );
  for (const operationSource of [
    diagnoseSource,
    mutationSource,
    platformPrivilegeSource,
  ]) {
    assert.match(
      operationSource,
      /FIELDGRID_MIGRATION_DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/u,
    );
    assert.match(
      operationSource,
      /DATABASE_URL: \$\{\{ secrets\.FIELDGRID_RUNTIME_DATABASE_URL \}\}/u,
    );
    assert.match(
      operationSource,
      /NEXT_PUBLIC_SUPABASE_URL: \$\{\{ secrets\.NEXT_PUBLIC_SUPABASE_URL \}\}/u,
    );
  }
  assert.match(
    diagnoseSource,
    /FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID: \$\{\{ secrets\.FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID \}\}/u,
  );
  assert.match(mutationSource, /FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID/u);
  assert.match(
    platformPrivilegeSource,
    /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/u,
  );
  assert.match(platformPrivilegeSource, /--repair-platform-privilege/u);
  assert.match(
    platformPrivilegeSource,
    /FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID: \$\{\{ secrets\.FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID \}\}/u,
  );
  assert.equal(
    [...workflow.matchAll(/SUPABASE_SERVICE_ROLE_KEY:/gu)].length,
    1,
  );
  assert.doesNotMatch(workflow, /pnpm run db:migrate/u);
  assert.doesNotMatch(workflow, /systemctl|docker\s+(?:compose|run)|deploy/i);
  assert.match(workflow, /retention-days: 30/u);
  assert.match(
    workflow,
    /\*-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\.json/u,
  );
});

test("PostgreSQL 17 migration smoke executes the schema-dependent diagnostic", () => {
  assert.match(
    postgres17MigrationTest,
    /fieldgrid-staging-field-demo-owner-binding-diagnostic\.test\.mjs/u,
  );
  assert.match(
    postgres17MigrationTest,
    /verifyFieldDemoOwnerPlatformPrivilegeDiagnostic\(client\)/u,
  );
});

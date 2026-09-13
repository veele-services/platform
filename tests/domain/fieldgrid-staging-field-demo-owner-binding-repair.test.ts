import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIELD_DEMO_OWNER_BINDING_CONFIRMATION,
  FIELD_DEMO_OWNER_BINDING_PROJECT_REF,
  FIELD_DEMO_OWNER_BINDING_SNAPSHOT_QUERY,
  FIELD_DEMO_OWNER_BINDING_SUPABASE_URL,
  FIELD_DEMO_OWNER_BINDING_VERSION,
  FIELD_DEMO_OWNER_PLATFORM_PRIVILEGE_QUERY,
  FIELD_DEMO_PLATFORM_PRIVILEGE_REPAIR_CONFIRMATION,
  FIELD_DEMO_RETAINED_OWNER_ID,
  FIELD_DEMO_SUPERSEDED_OWNER_EMAIL,
  FIELD_DEMO_SUPERSEDED_OWNER_ID,
  assertPlatformPrivilegeMigrationFrontier,
  classifyFieldDemoOwnerBinding,
  fieldDemoOwnerAppMetadataMatches,
  fieldDemoOwnerAuthMetadataIsNormalized,
  fieldDemoOwnerAuthUpdateOutcome,
  fieldDemoPlatformPrivilegeRepairPreconditionIsSafe,
  formatSafeFieldDemoOwnerBindingError,
  loadFieldDemoOwnerBindingSnapshot,
  loadFieldDemoOwnerPlatformPrivilegeSnapshot,
  normalizedFieldDemoOwnerAppMetadata,
  projectFieldDemoOwnerBindingAfterPlatformPrivilegeRepair,
  repairFieldDemoOwnerBinding,
  reconcileFieldDemoOwnerBinding,
  safeFieldDemoOwnerBindingErrorCode,
  safeFieldDemoOwnerBindingFailureReason,
  summarizeFieldDemoOwnerPlatformPrivilege,
  validateFieldDemoOwnerBindingConfig,
  type FieldDemoOwnerBindingFailureReason,
  type FieldDemoOwnerBindingSnapshot,
  type FieldDemoOwnerPlatformPrivilegeSnapshot,
} from "../../scripts/fieldgrid-staging-field-demo-owner-binding-repair.mts";
import { FIELD_DEMO_OWNER_EMAIL } from "../../scripts/fieldgrid-staging-field-demo-domain-repair.mts";

const sha = "a".repeat(40);
const tenantId = "10000000-0000-4000-8000-000000000081";
const ownerUserId = FIELD_DEMO_RETAINED_OWNER_ID;
const automationUserId = "10000000-0000-4000-8000-000000000082";
const managementRoleId = "10000000-0000-4000-8000-000000000083";

const recipientHistoryFrontier = {
  predecessors: [
    { name: "001_before.sql", hash: "1".repeat(64), sql: "SELECT 1;" },
    { name: "002_before.sql", hash: "2".repeat(64), sql: "SELECT 2;" },
  ],
  required: [
    {
      name: "20260913135353_recipient_history.sql",
      hash: "3".repeat(64),
      sql: "SELECT 3;",
    },
    {
      name: "20260913154500_auth_guard.sql",
      hash: "4".repeat(64),
      sql: "SELECT 4;",
    },
  ],
  committed: [] as { name: string; hash: string; sql: string }[],
  successors: new Set(["20260914100000_after.sql"]),
  legacyNames: new Set(["001_before.sql", "002_before.sql"]),
  historical: new Map(),
};
const recipientHistoryCommitted = [
  ...recipientHistoryFrontier.predecessors,
  ...recipientHistoryFrontier.required,
  {
    name: "20260914100000_after.sql",
    hash: "5".repeat(64),
    sql: "SELECT 5;",
  },
];
Object.assign(recipientHistoryFrontier, {
  committed: recipientHistoryCommitted,
});

function migrationRecord(
  name: string,
  hash: string,
  index: number,
  baselined = false,
) {
  return {
    name,
    hash,
    baselined,
    appliedAt: new Date(Date.UTC(2026, 8, 13, 12, 0, index)),
  };
}

const validEnvironment = {
  APP_ENV: "staging",
  TARGET_ENVIRONMENT: "staging",
  GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_REF_NAME: "main",
  GITHUB_REPOSITORY: "veele-services/platform",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_RUN_ID: "123456789",
  GITHUB_SHA: sha,
  EXPECTED_SUPABASE_PROJECT_REF: FIELD_DEMO_OWNER_BINDING_PROJECT_REF,
  NEXT_PUBLIC_SUPABASE_URL: `${FIELD_DEMO_OWNER_BINDING_SUPABASE_URL}/`,
  DATABASE_URL: "postgresql://runtime:secret@example.invalid/db",
  FIELDGRID_MIGRATION_DATABASE_URL:
    "postgresql://migration:secret@example.invalid/db",
  FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
  FIELDGRID_FIELD_DEMO_OWNER_BINDING_CONFIRMATION:
    FIELD_DEMO_OWNER_BINDING_CONFIRMATION,
};

const exactSnapshot: FieldDemoOwnerBindingSnapshot = {
  tenant_id: tenantId,
  owner_user_id: ownerUserId,
  management_role_id: managementRoleId,
  slug_tenant_count: 1,
  target_tenant_core_valid_count: 1,
  exact_domain_global_count: 0,
  legacy_domain_global_count: 1,
  target_domain_count: 1,
  target_exact_domain_count: 0,
  target_legacy_domain_count: 1,
  target_primary_domain_count: 1,
  target_legacy_ready_count: 1,
  legacy_domain_check_count: 0,
  organization_settings_count: 1,
  active_subscription_count: 1,
  active_enterprise_subscription_count: 1,
  website_site_count: 0,
  website_binding_count: 0,
  exact_domain_binding_count: 0,
  legacy_domain_binding_count: 0,
  auth_email_count: 1,
  auth_core_count: 1,
  auth_contract_count: 1,
  auth_environment_count: 1,
  auth_portal_count: 1,
  auth_exact_count: 1,
  email_identity_count: 1,
  platform_user_count: 0,
  legacy_user_role_count: 0,
  management_template_role_count: 1,
  management_template_permission_count: 5,
  target_management_role_count: 1,
  target_management_permission_count: 5,
  management_missing_permission_count: 0,
  management_extra_permission_count: 0,
  owner_global_membership_count: 1,
  owner_target_membership_count: 1,
  owner_target_exact_active_count: 1,
  target_any_owner_count: 1,
  target_active_owner_count: 1,
  owner_global_role_link_count: 1,
  owner_target_role_link_count: 1,
  owner_target_management_link_count: 1,
  owner_target_nonmanagement_link_count: 0,
};

const exactPlatformPrivilegeSnapshot: FieldDemoOwnerPlatformPrivilegeSnapshot =
  {
    auth_email_count: 1,
    auth_contract_count: 1,
    auth_environment_count: 1,
    auth_tenant_portal_count: 1,
    auth_platform_portal_count: 0,
    platform_user_count: 0,
    platform_user_active_count: 0,
    platform_user_inactive_count: 0,
    platform_user_suspended_count: 0,
    platform_user_owner_role_count: 0,
    platform_user_admin_role_count: 0,
    platform_user_support_role_count: 0,
    other_active_platform_owner_count: 0,
    other_active_platform_admin_count: 1,
    configured_actor_provided_count: 1,
    configured_actor_matches_owner_count: 0,
    configured_actor_eligible_count: 1,
    platform_support_grant_count: 0,
    platform_current_support_grant_count: 0,
    platform_current_runtime_support_grant_count: 0,
    platform_future_support_grant_count: 0,
    platform_support_actor_audit_count: 0,
    platform_recipient_reference_count: 0,
    platform_recipient_snapshot_count: 0,
    platform_blocking_reference_count: 0,
    platform_nonrecipient_set_null_reference_count: 0,
    platform_set_null_reference_count: 0,
    platform_audit_event_count: 0,
    platform_invite_event_count: 0,
    platform_create_event_count: 0,
    direct_platform_fk_count: 9,
    exact_direct_platform_fk_count: 9,
    indirect_grant_fk_count: 2,
    exact_indirect_grant_fk_count: 2,
    exact_set_null_nullable_column_count: 9,
    recipient_scope_check_count: 1,
    platform_owner_continuity_trigger_count: 2,
    unexpected_set_null_check_count: 0,
    unexpected_deletion_path_trigger_count: 0,
  };

function snapshot(
  overrides: Partial<FieldDemoOwnerBindingSnapshot> = {},
): FieldDemoOwnerBindingSnapshot {
  return { ...exactSnapshot, ...overrides };
}

function platformPrivilegeSnapshot(
  overrides: Partial<FieldDemoOwnerPlatformPrivilegeSnapshot> = {},
): FieldDemoOwnerPlatformPrivilegeSnapshot {
  return { ...exactPlatformPrivilegeSnapshot, ...overrides };
}

const missingBothSnapshot = snapshot({
  owner_global_membership_count: 0,
  owner_target_membership_count: 0,
  owner_target_exact_active_count: 0,
  target_any_owner_count: 0,
  target_active_owner_count: 0,
  owner_global_role_link_count: 0,
  owner_target_role_link_count: 0,
  owner_target_management_link_count: 0,
});

const missingRoleSnapshot = snapshot({
  owner_global_role_link_count: 0,
  owner_target_role_link_count: 0,
  owner_target_management_link_count: 0,
});

function sequenceReader(
  sequence: FieldDemoOwnerBindingSnapshot[],
): () => Promise<FieldDemoOwnerBindingSnapshot> {
  let index = 0;
  return async () => {
    const value = sequence[Math.min(index, sequence.length - 1)];
    assert.ok(value, "snapshot sequence must not be empty");
    index += 1;
    return value;
  };
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  assert.fail("Expected owner-binding repair to fail.");
}

test("platform-privilege migrations require an exact contiguous history frontier", () => {
  const predecessorRecords = recipientHistoryFrontier.predecessors.map(
    ({ name, hash }, index) => migrationRecord(name, hash, index, index === 0),
  );
  assert.deepEqual(
    assertPlatformPrivilegeMigrationFrontier(
      recipientHistoryFrontier,
      predecessorRecords,
    ).map(({ name }) => name),
    recipientHistoryFrontier.required.map(({ name }) => name),
  );
  assert.deepEqual(
    assertPlatformPrivilegeMigrationFrontier(recipientHistoryFrontier, [
      ...predecessorRecords,
      ...recipientHistoryFrontier.required.map(({ name, hash }, index) =>
        migrationRecord(name, hash, index + predecessorRecords.length),
      ),
    ]),
    [],
  );
  const historicalAliasFrontier = {
    ...recipientHistoryFrontier,
    historical: new Map([
      [
        "099_recipient_history_alias.sql",
        {
          kind: "renamed" as const,
          canonicalName: recipientHistoryFrontier.required[0]!.name,
          hash: "a".repeat(64),
        },
      ],
    ]),
  };
  assert.deepEqual(
    assertPlatformPrivilegeMigrationFrontier(historicalAliasFrontier, [
      ...predecessorRecords,
      migrationRecord(
        "099_recipient_history_alias.sql",
        "a".repeat(64),
        2,
      ),
      ...recipientHistoryFrontier.required.map(({ name, hash }, index) =>
        migrationRecord(name, hash, index + predecessorRecords.length + 1),
      ),
    ]),
    [],
  );

  for (const records of [
    predecessorRecords.slice(1),
    [{ ...predecessorRecords[0]!, hash: "f".repeat(64) }],
    [
      ...predecessorRecords,
      migrationRecord("20260914100000_after.sql", "5".repeat(64), 2),
    ],
    [
      ...predecessorRecords,
      migrationRecord(
        recipientHistoryFrontier.required[0]!.name,
        recipientHistoryFrontier.required[0]!.hash,
        2,
        true,
      ),
    ],
    [
      ...predecessorRecords,
      migrationRecord("099_staging_only.sql", "9".repeat(64), 2),
    ],
    [predecessorRecords[1]!, predecessorRecords[0]!],
  ]) {
    assert.throws(
      () =>
        assertPlatformPrivilegeMigrationFrontier(
          recipientHistoryFrontier,
          records,
        ),
      /migration|frontier|history/iu,
    );
  }
});

test("owner-binding configuration is exact staging and exact main only", () => {
  for (const mode of ["diagnose", "repair", "reconcile"] as const) {
    assert.deepEqual(
      validateFieldDemoOwnerBindingConfig(
        { mode, expectedSha: sha },
        mode === "reconcile"
          ? {
              ...validEnvironment,
              FIELDGRID_FIELD_DEMO_OWNER_BINDING_CONFIRMATION:
                "fieldgrid-staging-field-demo-owner-reconcile-v1",
            }
          : validEnvironment,
      ),
      [],
    );
  }
  assert.deepEqual(
    validateFieldDemoOwnerBindingConfig({ mode: "check", expectedSha: "" }, {}),
    [],
  );

  for (const [key, value] of [
    ["APP_ENV", "production"],
    ["TARGET_ENVIRONMENT", "production"],
    ["GITHUB_ACTIONS", "false"],
    ["GITHUB_EVENT_NAME", "push"],
    ["GITHUB_REF", "refs/heads/staging"],
    ["GITHUB_REF_NAME", "staging"],
    ["GITHUB_REPOSITORY", "other/repository"],
    ["GITHUB_RUN_ATTEMPT", "0"],
    ["GITHUB_RUN_ID", "stale/path"],
    ["GITHUB_SHA", "b".repeat(40)],
    ["EXPECTED_SUPABASE_PROJECT_REF", "productionref"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://example.com/"],
    ["DATABASE_URL", ""],
    ["FIELDGRID_MIGRATION_DATABASE_URL", ""],
    ["FIELDGRID_DATABASE_CONNECTION_PURPOSE", "runtime"],
    ["FIELDGRID_FIELD_DEMO_OWNER_BINDING_CONFIRMATION", "wrong"],
  ] as const) {
    const errors = validateFieldDemoOwnerBindingConfig(
      { mode: "repair", expectedSha: sha },
      { ...validEnvironment, [key]: value },
    );
    assert.ok(errors.length > 0, `${key} must fail closed`);
  }

  const invalidActorEnvironment = {
    ...validEnvironment,
    FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID: "not-a-uuid",
  };
  assert.ok(
    validateFieldDemoOwnerBindingConfig(
      { mode: "diagnose", expectedSha: sha },
      invalidActorEnvironment,
    ).length > 0,
  );
  assert.deepEqual(
    validateFieldDemoOwnerBindingConfig(
      { mode: "repair", expectedSha: sha },
      invalidActorEnvironment,
    ),
    [],
  );

  const platformPrivilegeRepairEnvironment = {
    ...validEnvironment,
    FIELDGRID_FIELD_DEMO_OWNER_BINDING_CONFIRMATION:
      FIELD_DEMO_PLATFORM_PRIVILEGE_REPAIR_CONFIRMATION,
    FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID: automationUserId,
    SUPABASE_SERVICE_ROLE_KEY: "s".repeat(32),
  };
  assert.deepEqual(
    validateFieldDemoOwnerBindingConfig(
      { mode: "repair-platform-privilege", expectedSha: sha },
      platformPrivilegeRepairEnvironment,
    ),
    [],
  );
  for (const overrides of [
    { SUPABASE_SERVICE_ROLE_KEY: "" },
    { FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID: "" },
    { FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID: ownerUserId },
    { FIELDGRID_FIELD_DEMO_OWNER_BINDING_CONFIRMATION: "wrong" },
  ]) {
    assert.ok(
      validateFieldDemoOwnerBindingConfig(
        { mode: "repair-platform-privilege", expectedSha: sha },
        { ...platformPrivilegeRepairEnvironment, ...overrides },
      ).length > 0,
    );
  }
});

test("owner-binding constants remain exact and staging-scoped", () => {
  assert.equal(
    FIELD_DEMO_OWNER_BINDING_CONFIRMATION,
    FIELD_DEMO_OWNER_BINDING_VERSION,
  );
  assert.equal(FIELD_DEMO_OWNER_BINDING_PROJECT_REF, "olyfmekyqozxrbrwwszu");
  assert.equal(
    FIELD_DEMO_OWNER_BINDING_SUPABASE_URL,
    `https://${FIELD_DEMO_OWNER_BINDING_PROJECT_REF}.supabase.co`,
  );
  assert.equal(
    FIELD_DEMO_PLATFORM_PRIVILEGE_REPAIR_CONFIRMATION,
    "fieldgrid-staging-field-demo-platform-privilege-repair-v1",
  );
});

test("classifier accepts only the three exact owner-binding shapes", () => {
  assert.deepEqual(classifyFieldDemoOwnerBinding(exactSnapshot), {
    state: "already-valid",
    failureReason: null,
  });
  assert.deepEqual(classifyFieldDemoOwnerBinding(missingBothSnapshot), {
    state: "missing-membership-and-role",
    failureReason: null,
  });
  assert.deepEqual(classifyFieldDemoOwnerBinding(missingRoleSnapshot), {
    state: "missing-management-role",
    failureReason: null,
  });
});

test("platform privilege diagnosis is categorical and predicts a safe replacement actor", () => {
  assert.deepEqual(
    summarizeFieldDemoOwnerPlatformPrivilege(exactPlatformPrivilegeSnapshot),
    {
      accountState: "absent",
      continuityState: "not-applicable",
      automationActorState: "single-admin-ready",
      configuredActorState: "other-active-eligible",
      authMetadataState: "tenant-owner-compatible",
      supportGrantState: "none",
      effectiveSupportState: "none",
      foreignKeyContractState: "exact",
      recipientSnapshotState: "none",
      nonRecipientHistoryState: "none",
      deletionBlockState: "none",
      deletionImpactState: "none",
      provenanceState: "none",
    },
  );

  assert.deepEqual(
    summarizeFieldDemoOwnerPlatformPrivilege(
      platformPrivilegeSnapshot({
        auth_tenant_portal_count: 0,
        auth_platform_portal_count: 1,
        platform_user_count: 1,
        platform_user_active_count: 1,
        platform_user_owner_role_count: 1,
        other_active_platform_admin_count: 0,
        configured_actor_matches_owner_count: 1,
        platform_support_grant_count: 3,
        platform_current_support_grant_count: 1,
        platform_current_runtime_support_grant_count: 1,
        platform_future_support_grant_count: 1,
        platform_support_actor_audit_count: 3,
        platform_nonrecipient_set_null_reference_count: 2,
        platform_set_null_reference_count: 2,
        platform_audit_event_count: 2,
        platform_invite_event_count: 1,
      }),
    ),
    {
      accountState: "active-owner",
      continuityState: "sole-active-owner",
      automationActorState: "none",
      configuredActorState: "target-eligible",
      authMetadataState: "platform-admin-portal",
      supportGrantState: "current-and-future",
      effectiveSupportState: "active",
      foreignKeyContractState: "exact",
      recipientSnapshotState: "none",
      nonRecipientHistoryState: "present",
      deletionBlockState: "none",
      deletionImpactState: "cascade-and-set-null-history-present",
      provenanceState: "invite-event-present",
    },
  );

  assert.deepEqual(
    summarizeFieldDemoOwnerPlatformPrivilege(
      platformPrivilegeSnapshot({
        platform_user_count: 1,
        platform_user_inactive_count: 1,
        platform_user_admin_role_count: 1,
        other_active_platform_admin_count: 0,
        other_active_platform_owner_count: 1,
        platform_nonrecipient_set_null_reference_count: 1,
        platform_set_null_reference_count: 1,
        platform_audit_event_count: 1,
        platform_create_event_count: 1,
      }),
    ),
    {
      accountState: "inactive-admin",
      continuityState: "not-applicable",
      automationActorState: "single-owner-ready",
      configuredActorState: "other-active-eligible",
      authMetadataState: "tenant-owner-compatible",
      supportGrantState: "none",
      effectiveSupportState: "none",
      foreignKeyContractState: "exact",
      recipientSnapshotState: "none",
      nonRecipientHistoryState: "present",
      deletionBlockState: "none",
      deletionImpactState: "set-null-history-present",
      provenanceState: "create-event-present",
    },
  );

  const blockedDeletion = summarizeFieldDemoOwnerPlatformPrivilege(
    platformPrivilegeSnapshot({
      platform_user_count: 1,
      platform_user_suspended_count: 1,
      platform_user_support_role_count: 1,
      platform_support_grant_count: 1,
      platform_recipient_reference_count: 1,
      platform_blocking_reference_count: 1,
      platform_set_null_reference_count: 0,
    }),
  );
  assert.equal(
    blockedDeletion.deletionBlockState,
    "notification-recipient-reference",
  );
  assert.equal(blockedDeletion.deletionImpactState, "cascade-history-present");
  assert.equal(
    summarizeFieldDemoOwnerPlatformPrivilege(
      platformPrivilegeSnapshot({
        platform_user_count: 1,
        platform_user_inactive_count: 1,
        platform_user_support_role_count: 1,
        platform_support_grant_count: 1,
        platform_current_support_grant_count: 1,
        platform_current_runtime_support_grant_count: 1,
      }),
    ).effectiveSupportState,
    "blocked-by-platform-status",
  );
  assert.equal(
    summarizeFieldDemoOwnerPlatformPrivilege(
      platformPrivilegeSnapshot({
        platform_user_count: 1,
        platform_user_active_count: 1,
        platform_user_support_role_count: 1,
        other_active_platform_admin_count: 0,
        platform_support_grant_count: 1,
        platform_current_support_grant_count: 1,
      }),
    ).effectiveSupportState,
    "blocked-by-tenant-status",
  );
});

test("platform privilege diagnosis exposes schema drift as ambiguous delete impact", () => {
  for (const drift of [
    { exact_direct_platform_fk_count: 8 },
    { exact_set_null_nullable_column_count: 8 },
    { unexpected_set_null_check_count: 1 },
    { unexpected_deletion_path_trigger_count: 1 },
  ]) {
    const summary = summarizeFieldDemoOwnerPlatformPrivilege(
      platformPrivilegeSnapshot(drift),
    );
    assert.equal(summary.foreignKeyContractState, "drift");
    assert.equal(summary.deletionBlockState, "ambiguous");
    assert.equal(summary.deletionImpactState, "ambiguous");
  }
});

test("platform privilege diagnosis fails closed for inconsistent aggregates", () => {
  assert.deepEqual(
    summarizeFieldDemoOwnerPlatformPrivilege(
      platformPrivilegeSnapshot({ platform_support_grant_count: -1 }),
    ),
    {
      accountState: "ambiguous",
      continuityState: "ambiguous",
      automationActorState: "ambiguous",
      configuredActorState: "ambiguous",
      authMetadataState: "unavailable",
      supportGrantState: "ambiguous",
      effectiveSupportState: "ambiguous",
      foreignKeyContractState: "ambiguous",
      recipientSnapshotState: "ambiguous",
      nonRecipientHistoryState: "ambiguous",
      deletionBlockState: "ambiguous",
      deletionImpactState: "ambiguous",
      provenanceState: "ambiguous",
    },
  );
});

test("platform-privilege repair accepts only the exact removable owner shape", () => {
  const accidentalBinding = snapshot({
    platform_user_count: 1,
    auth_contract_count: 0,
    auth_portal_count: 0,
    auth_exact_count: 0,
  });
  const removablePrivilege = summarizeFieldDemoOwnerPlatformPrivilege(
    platformPrivilegeSnapshot({
      auth_contract_count: 0,
      auth_tenant_portal_count: 0,
      auth_platform_portal_count: 1,
      platform_user_count: 1,
      platform_user_active_count: 1,
      platform_user_owner_role_count: 1,
      other_active_platform_owner_count: 1,
      configured_actor_provided_count: 1,
      configured_actor_eligible_count: 1,
      platform_recipient_reference_count: 1,
      platform_recipient_snapshot_count: 1,
      platform_set_null_reference_count: 1,
      platform_audit_event_count: 1,
      platform_invite_event_count: 1,
    }),
  );

  assert.deepEqual(
    projectFieldDemoOwnerBindingAfterPlatformPrivilegeRepair(accidentalBinding),
    { state: "already-valid", failureReason: null },
  );
  assert.equal(
    fieldDemoPlatformPrivilegeRepairPreconditionIsSafe(
      accidentalBinding,
      removablePrivilege,
    ),
    true,
  );

  for (const unsafeSummary of [
    { ...removablePrivilege, continuityState: "sole-active-owner" as const },
    { ...removablePrivilege, automationActorState: "multiple-admins" as const },
    { ...removablePrivilege, supportGrantState: "historical-only" as const },
    { ...removablePrivilege, recipientSnapshotState: "incomplete" as const },
    { ...removablePrivilege, nonRecipientHistoryState: "present" as const },
    {
      ...removablePrivilege,
      deletionBlockState: "notification-recipient-reference" as const,
    },
    {
      ...removablePrivilege,
      deletionImpactState: "cascade-history-present" as const,
    },
    { ...removablePrivilege, provenanceState: "other-audit-history" as const },
    { ...removablePrivilege, foreignKeyContractState: "drift" as const },
  ]) {
    assert.equal(
      fieldDemoPlatformPrivilegeRepairPreconditionIsSafe(
        accidentalBinding,
        unsafeSummary,
      ),
      false,
    );
  }
  assert.equal(
    fieldDemoPlatformPrivilegeRepairPreconditionIsSafe(
      { ...accidentalBinding, target_any_owner_count: 2 },
      removablePrivilege,
    ),
    false,
  );
});

test("owner Auth normalization removes platform claims and revokes live sessions", () => {
  const revokedAt = "2026-09-13T13:50:00.000Z";
  const current = {
    portal: "platform-admin",
    platform_role: "owner",
    retained: "value",
  };
  const normalized = normalizedFieldDemoOwnerAppMetadata(current, revokedAt);
  assert.deepEqual(normalized, {
    portal: "tenant-admin",
    retained: "value",
    fieldgrid_automation_contract:
      "fieldgrid-staging-field-demo-owner-repair-v1",
    fieldgrid_environment: "staging",
    fieldgrid_platform_privilege_repair:
      "fieldgrid-staging-field-demo-platform-privilege-repair-v1",
    session_revoked_at: revokedAt,
  });
  assert.equal(current.portal, "platform-admin");
  assert.equal(
    fieldDemoOwnerAuthMetadataIsNormalized(
      {
        userId: ownerUserId,
        platformUserId: null,
        platformRole: null,
        platformStatus: null,
        appMetadata: normalized,
      },
      revokedAt,
    ),
    true,
  );
  assert.equal(
    fieldDemoOwnerAuthMetadataIsNormalized(
      {
        userId: ownerUserId,
        platformUserId: null,
        platformRole: null,
        platformStatus: null,
        appMetadata: { ...normalized, platform_role: "owner" },
      },
      revokedAt,
    ),
    false,
  );
  assert.equal(
    fieldDemoOwnerAppMetadataMatches(
      {
        userId: ownerUserId,
        platformUserId: null,
        platformRole: null,
        platformStatus: null,
        appMetadata: { nested: { b: 2, a: 1 }, ...normalized },
      },
      { ...normalized, nested: { a: 1, b: 2 } },
    ),
    true,
  );
  assert.throws(() => normalizedFieldDemoOwnerAppMetadata(current, "invalid"));

  assert.equal(
    fieldDemoOwnerAuthUpdateOutcome(new Response(null, { status: 200 })),
    "accepted",
  );
  assert.equal(
    fieldDemoOwnerAuthUpdateOutcome(new Response(null, { status: 422 })),
    "rejected",
  );
  assert.equal(
    fieldDemoOwnerAuthUpdateOutcome(new Response(null, { status: 429 })),
    "uncertain",
  );
  assert.equal(
    fieldDemoOwnerAuthUpdateOutcome(new Response(null, { status: 503 })),
    "uncertain",
  );
});

const failClosedCases: Array<
  [
    label: string,
    overrides: Partial<FieldDemoOwnerBindingSnapshot>,
    reason: FieldDemoOwnerBindingFailureReason,
  ]
> = [
  [
    "invalid aggregate count",
    { owner_target_role_link_count: -1 },
    "tenant-identity-invalid",
  ],
  [
    "tenant identity",
    { slug_tenant_count: 0, tenant_id: null },
    "tenant-identity-invalid",
  ],
  [
    "tenant runtime",
    { target_tenant_core_valid_count: 0 },
    "tenant-runtime-invalid",
  ],
  [
    "domain prerequisite",
    { exact_domain_global_count: 1 },
    "domain-prerequisite-invalid",
  ],
  [
    "domain history",
    { legacy_domain_check_count: 1 },
    "domain-history-present",
  ],
  [
    "organization settings",
    { organization_settings_count: 0 },
    "organization-settings-invalid",
  ],
  [
    "subscription",
    { active_enterprise_subscription_count: 0 },
    "subscription-invalid",
  ],
  ["website state", { website_site_count: 1 }, "website-state-present"],
  ["auth e-mail", { auth_email_count: 0 }, "auth-owner-email-invalid"],
  [
    "auth owner UUID",
    { owner_user_id: "not-a-uuid" },
    "auth-owner-email-invalid",
  ],
  ["auth core", { auth_core_count: 0 }, "auth-owner-core-invalid"],
  [
    "auth e-mail identity",
    { email_identity_count: 0 },
    "auth-owner-email-identity-invalid",
  ],
  [
    "auth platform privilege",
    { platform_user_count: 1 },
    "auth-owner-platform-privilege-present",
  ],
  ["auth contract", { auth_contract_count: 0 }, "auth-owner-contract-invalid"],
  [
    "auth environment",
    { auth_environment_count: 0 },
    "auth-owner-environment-invalid",
  ],
  ["auth portal", { auth_portal_count: 0 }, "auth-owner-portal-invalid"],
  ["auth aggregate", { auth_exact_count: 0 }, "auth-owner-invalid"],
  [
    "legacy global role",
    { legacy_user_role_count: 1 },
    "legacy-role-state-present",
  ],
  [
    "Management role",
    { target_management_role_count: 0, management_role_id: null },
    "management-role-invalid",
  ],
  [
    "Management permissions",
    {
      target_management_permission_count: 4,
      management_missing_permission_count: 1,
    },
    "management-permissions-invalid",
  ],
  [
    "cross-tenant membership",
    { owner_global_membership_count: 2 },
    "cross-tenant-owner-state",
  ],
  [
    "conflicting owner",
    { target_any_owner_count: 2, target_active_owner_count: 2 },
    "conflicting-owner-state",
  ],
  [
    "invalid owner membership",
    {
      owner_target_exact_active_count: 0,
      target_any_owner_count: 0,
      target_active_owner_count: 0,
    },
    "owner-membership-invalid",
  ],
  [
    "invalid owner role link",
    {
      owner_target_management_link_count: 0,
      owner_target_nonmanagement_link_count: 1,
    },
    "owner-role-link-invalid",
  ],
];

test("every bounded core category fails closed", () => {
  for (const [label, overrides, failureReason] of failClosedCases) {
    assert.deepEqual(
      classifyFieldDemoOwnerBinding(snapshot(overrides)),
      { state: "unsafe", failureReason },
      label,
    );
  }
});

test("cross-tenant, stale and conflicting identities are distinguished", () => {
  assert.deepEqual(
    classifyFieldDemoOwnerBinding(
      snapshot({
        owner_global_role_link_count: 2,
        owner_target_role_link_count: 1,
      }),
    ),
    { state: "unsafe", failureReason: "cross-tenant-owner-state" },
  );

  assert.deepEqual(
    classifyFieldDemoOwnerBinding(
      snapshot({
        owner_global_membership_count: 0,
        owner_target_membership_count: 0,
        owner_target_exact_active_count: 0,
        target_any_owner_count: 1,
        target_active_owner_count: 1,
        owner_global_role_link_count: 0,
        owner_target_role_link_count: 0,
        owner_target_management_link_count: 0,
      }),
    ),
    { state: "unsafe", failureReason: "conflicting-owner-state" },
  );

  assert.deepEqual(
    classifyFieldDemoOwnerBinding(
      snapshot({
        owner_global_membership_count: 0,
        owner_target_membership_count: 0,
        owner_target_exact_active_count: 0,
        target_any_owner_count: 0,
        target_active_owner_count: 0,
      }),
    ),
    { state: "unsafe", failureReason: "owner-role-link-invalid" },
  );
});

test("an exact owner binding is a read-once no-op", async () => {
  let reads = 0;
  let memberships = 0;
  let roleLinks = 0;
  const result = await repairFieldDemoOwnerBinding({
    readSnapshot: async () => {
      reads += 1;
      return exactSnapshot;
    },
    createMembership: async () => {
      memberships += 1;
    },
    createManagementRoleLink: async () => {
      roleLinks += 1;
    },
  });

  assert.equal(result, "already-valid");
  assert.equal(reads, 1);
  assert.equal(memberships, 0);
  assert.equal(roleLinks, 0);
});

test("owner reconciliation retains the exact info owner and demotes only the superseded owner", async () => {
  let demotions = 0;
  const result = await reconcileFieldDemoOwnerBinding({
    readTarget: async () => ({
      tenantId,
      retainedUser: {
        id: FIELD_DEMO_RETAINED_OWNER_ID,
        email: FIELD_DEMO_OWNER_EMAIL,
      },
      supersededUser: {
        id: FIELD_DEMO_SUPERSEDED_OWNER_ID,
        email: FIELD_DEMO_SUPERSEDED_OWNER_EMAIL,
      },
      ownerMemberships: [
        {
          userId: FIELD_DEMO_RETAINED_OWNER_ID,
          role: "owner",
          status: "active",
        },
        {
          userId: FIELD_DEMO_SUPERSEDED_OWNER_ID,
          role: "owner",
          status: "active",
        },
      ],
    }),
    demoteSupersededOwner: async (receivedTenantId, receivedUserId) => {
      assert.equal(receivedTenantId, tenantId);
      assert.equal(receivedUserId, FIELD_DEMO_SUPERSEDED_OWNER_ID);
      demotions += 1;
    },
    readSnapshot: async () => exactSnapshot,
  });

  assert.equal(result, "reconciled-retained-owner");
  assert.equal(demotions, 1);
});

test("owner reconciliation fails closed for any identity or owner-shape mismatch", async () => {
  let demotions = 0;
  const error = await captureError(() =>
    reconcileFieldDemoOwnerBinding({
      readTarget: async () => ({
        tenantId,
        retainedUser: {
          id: FIELD_DEMO_RETAINED_OWNER_ID,
          email: "wrong@example.invalid",
        },
        supersededUser: {
          id: FIELD_DEMO_SUPERSEDED_OWNER_ID,
          email: FIELD_DEMO_SUPERSEDED_OWNER_EMAIL,
        },
        ownerMemberships: [],
      }),
      demoteSupersededOwner: async () => {
        demotions += 1;
      },
      readSnapshot: async () => exactSnapshot,
    }),
  );

  assert.equal(demotions, 0);
  assert.equal(
    safeFieldDemoOwnerBindingErrorCode(error),
    "field_demo_owner_binding_precondition_invalid",
  );
  assert.equal(
    safeFieldDemoOwnerBindingFailureReason(error),
    "conflicting-owner-state",
  );
});

test("missing membership and role invokes both exact callbacks once", async () => {
  let reads = 0;
  const calls: Array<{ kind: string; ids: string[] }> = [];
  const readSnapshot = sequenceReader([missingBothSnapshot, exactSnapshot]);
  const result = await repairFieldDemoOwnerBinding({
    readSnapshot: async () => {
      reads += 1;
      return readSnapshot();
    },
    createMembership: async (receivedTenantId, receivedUserId) => {
      calls.push({
        kind: "membership",
        ids: [receivedTenantId, receivedUserId],
      });
    },
    createManagementRoleLink: async (
      receivedTenantId,
      receivedUserId,
      receivedRoleId,
    ) => {
      calls.push({
        kind: "role",
        ids: [receivedTenantId, receivedUserId, receivedRoleId],
      });
    },
  });

  assert.equal(result, "membership-and-role-created");
  assert.equal(reads, 2);
  assert.deepEqual(calls, [
    { kind: "membership", ids: [tenantId, ownerUserId] },
    { kind: "role", ids: [tenantId, ownerUserId, managementRoleId] },
  ]);
});

test("an exact membership with no role invokes only the Management callback", async () => {
  let reads = 0;
  let memberships = 0;
  const roleCalls: string[][] = [];
  const readSnapshot = sequenceReader([missingRoleSnapshot, exactSnapshot]);
  const result = await repairFieldDemoOwnerBinding({
    readSnapshot: async () => {
      reads += 1;
      return readSnapshot();
    },
    createMembership: async () => {
      memberships += 1;
    },
    createManagementRoleLink: async (...ids) => {
      roleCalls.push(ids);
    },
  });

  assert.equal(result, "management-role-created");
  assert.equal(reads, 2);
  assert.equal(memberships, 0);
  assert.deepEqual(roleCalls, [[tenantId, ownerUserId, managementRoleId]]);
});

test("unsafe snapshots never invoke a mutation callback", async () => {
  for (const [label, overrides, failureReason] of failClosedCases) {
    let memberships = 0;
    let roleLinks = 0;
    const error = await captureError(() =>
      repairFieldDemoOwnerBinding({
        readSnapshot: async () => snapshot(overrides),
        createMembership: async () => {
          memberships += 1;
        },
        createManagementRoleLink: async () => {
          roleLinks += 1;
        },
      }),
    );

    assert.equal(memberships, 0, label);
    assert.equal(roleLinks, 0, label);
    assert.equal(
      safeFieldDemoOwnerBindingErrorCode(error),
      "field_demo_owner_binding_precondition_invalid",
      label,
    );
    assert.equal(
      safeFieldDemoOwnerBindingFailureReason(error),
      failureReason,
      label,
    );
  }
});

test("membership and role insert failures remain bounded and stop immediately", async () => {
  let membershipCalls = 0;
  let roleCalls = 0;
  const membershipError = await captureError(() =>
    repairFieldDemoOwnerBinding({
      readSnapshot: sequenceReader([missingBothSnapshot]),
      createMembership: async () => {
        membershipCalls += 1;
        throw new Error("tenant UUID and database credential-shaped detail");
      },
      createManagementRoleLink: async () => {
        roleCalls += 1;
      },
    }),
  );
  assert.equal(membershipCalls, 1);
  assert.equal(roleCalls, 0);
  assert.equal(
    safeFieldDemoOwnerBindingErrorCode(membershipError),
    "field_demo_owner_binding_mutation_failed",
  );
  assert.equal(safeFieldDemoOwnerBindingFailureReason(membershipError), null);
  assert.doesNotMatch(
    formatSafeFieldDemoOwnerBindingError(membershipError),
    /credential|tenant UUID/u,
  );

  membershipCalls = 0;
  roleCalls = 0;
  const roleError = await captureError(() =>
    repairFieldDemoOwnerBinding({
      readSnapshot: sequenceReader([missingBothSnapshot]),
      createMembership: async () => {
        membershipCalls += 1;
      },
      createManagementRoleLink: async () => {
        roleCalls += 1;
        throw new Error("services@fieldgrid.nl private role detail");
      },
    }),
  );
  assert.equal(membershipCalls, 1);
  assert.equal(roleCalls, 1);
  assert.equal(
    safeFieldDemoOwnerBindingErrorCode(roleError),
    "field_demo_owner_binding_mutation_failed",
  );
  assert.doesNotMatch(
    formatSafeFieldDemoOwnerBindingError(roleError),
    /services@|private/u,
  );
});

test("a non-exact postcondition fails after one bounded mutation attempt", async () => {
  let reads = 0;
  let memberships = 0;
  let roleLinks = 0;
  const error = await captureError(() =>
    repairFieldDemoOwnerBinding({
      readSnapshot: async () => {
        reads += 1;
        return missingBothSnapshot;
      },
      createMembership: async () => {
        memberships += 1;
      },
      createManagementRoleLink: async () => {
        roleLinks += 1;
      },
    }),
  );

  assert.equal(reads, 2);
  assert.equal(memberships, 1);
  assert.equal(roleLinks, 1);
  assert.equal(
    safeFieldDemoOwnerBindingErrorCode(error),
    "field_demo_owner_binding_postcondition_invalid",
  );
  assert.equal(safeFieldDemoOwnerBindingFailureReason(error), null);
});

test("snapshot helper binds fixed identities and requires one aggregate row", async () => {
  let capturedSql = "";
  let capturedValues: unknown[] = [];
  const loaded = await loadFieldDemoOwnerBindingSnapshot({
    async query<T extends Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) {
      capturedSql = text;
      capturedValues = values ?? [];
      return { rows: [exactSnapshot as T], rowCount: 1 };
    },
  });

  assert.equal(loaded, exactSnapshot);
  assert.equal(capturedSql, FIELD_DEMO_OWNER_BINDING_SNAPSHOT_QUERY);
  assert.deepEqual(capturedValues, [
    "field-demo",
    FIELD_DEMO_RETAINED_OWNER_ID,
    FIELD_DEMO_OWNER_EMAIL,
    "field-demo.staging.fieldgrid.nl",
    "field-demo.fieldgrid.nl",
    "fieldgrid-staging-field-demo-owner-repair-v1",
  ]);
  assert.doesNotMatch(
    capturedSql,
    /services@fieldgrid\.nl|field-demo(?:\.staging)?\.fieldgrid\.nl/u,
  );
  for (const alias of [
    "auth_core_count",
    "auth_contract_count",
    "auth_environment_count",
    "auth_portal_count",
    "auth_exact_count",
    "management_missing_permission_count",
    "management_extra_permission_count",
    "owner_global_membership_count",
    "owner_target_management_link_count",
  ]) {
    assert.match(capturedSql, new RegExp(`AS ${alias}`, "u"));
  }
  const authIdentityEnd = capturedSql.indexOf("AS auth_exact_count");
  const authIdentityStart = capturedSql.lastIndexOf(
    "(SELECT COUNT(*)::integer FROM auth.users AS auth_user",
    authIdentityEnd,
  );
  assert.ok(
    authIdentityStart >= 0 && authIdentityEnd > authIdentityStart,
    "auth identity predicate must remain explicit",
  );
  const authIdentityPredicate = capturedSql.slice(
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

  for (const rows of [[], [exactSnapshot, exactSnapshot]]) {
    const error = await captureError(() =>
      loadFieldDemoOwnerBindingSnapshot({
        async query<T extends Record<string, unknown>>() {
          return { rows: rows as T[], rowCount: rows.length };
        },
      }),
    );
    assert.equal(
      safeFieldDemoOwnerBindingErrorCode(error),
      "field_demo_owner_binding_precondition_invalid",
    );
    assert.equal(
      safeFieldDemoOwnerBindingFailureReason(error),
      "tenant-identity-invalid",
    );
  }
});

test("platform privilege helper is isolated, schema-aware and singular", async () => {
  let capturedSql = "";
  let capturedValues: unknown[] = [];
  const loaded = await loadFieldDemoOwnerPlatformPrivilegeSnapshot(
    {
      async query<T extends Record<string, unknown>>(
        text: string,
        values?: unknown[],
      ) {
        capturedSql = text;
        capturedValues = values ?? [];
        return {
          rows: [exactPlatformPrivilegeSnapshot as T],
          rowCount: 1,
        };
      },
    },
    automationUserId,
  );

  assert.equal(loaded, exactPlatformPrivilegeSnapshot);
  assert.equal(capturedSql, FIELD_DEMO_OWNER_PLATFORM_PRIVILEGE_QUERY);
  assert.deepEqual(capturedValues, [
    FIELD_DEMO_RETAINED_OWNER_ID,
    FIELD_DEMO_OWNER_EMAIL,
    automationUserId,
    "fieldgrid-staging-field-demo-owner-repair-v1",
  ]);
  assert.doesNotMatch(capturedSql, /info@dgwebservices\.nl/u);
  assert.match(capturedSql, /public\.platform_notification_dispatches/u);
  assert.doesNotMatch(capturedSql, /public\.platform_notifications\b/u);
  assert.match(capturedSql, /pg_catalog\.pg_constraint/u);
  assert.match(capturedSql, /pg_catalog\.pg_trigger/u);
  for (const alias of [
    "auth_tenant_portal_count",
    "auth_platform_portal_count",
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
    assert.match(capturedSql, new RegExp(`AS ${alias}\\b`, "u"));
  }

  for (const rows of [
    [],
    [exactPlatformPrivilegeSnapshot, exactPlatformPrivilegeSnapshot],
  ]) {
    const error = await captureError(() =>
      loadFieldDemoOwnerPlatformPrivilegeSnapshot(
        {
          async query<T extends Record<string, unknown>>() {
            return { rows: rows as T[], rowCount: rows.length };
          },
        },
        null,
      ),
    );
    assert.equal(
      safeFieldDemoOwnerBindingErrorCode(error),
      "field_demo_owner_binding_precondition_invalid",
    );
    assert.equal(
      safeFieldDemoOwnerBindingFailureReason(error),
      "auth-owner-platform-privilege-present",
    );
  }
});

test("arbitrary external error fields never reach safe diagnostics", () => {
  const external = Object.assign(
    new Error("services@fieldgrid.nl and token-shaped private detail"),
    {
      code: "field_demo_owner_binding_precondition_invalid",
      failureReason: "auth-owner-invalid",
    },
  );
  assert.equal(
    safeFieldDemoOwnerBindingErrorCode(external),
    "field_demo_owner_binding_failed",
  );
  assert.equal(safeFieldDemoOwnerBindingFailureReason(external), null);
  assert.equal(
    formatSafeFieldDemoOwnerBindingError(external),
    `${FIELD_DEMO_OWNER_BINDING_VERSION}: field_demo_owner_binding_failed`,
  );
});

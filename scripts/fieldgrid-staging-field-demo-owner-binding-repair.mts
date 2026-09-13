#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { sqlForManagedMigrationTransaction } from "../lib/db/src/migration-transaction-retry.ts";

import {
  FIELD_DEMO_HOST,
  FIELD_DEMO_OWNER_EMAIL,
  FIELD_DEMO_SLUG,
  LEGACY_FIELD_DEMO_HOST,
} from "./fieldgrid-staging-field-demo-domain-repair.mts";

export const FIELD_DEMO_OWNER_BINDING_VERSION =
  "fieldgrid-staging-field-demo-owner-binding-repair-v1";
export const FIELD_DEMO_OWNER_BINDING_CONFIRMATION =
  "fieldgrid-staging-field-demo-owner-binding-repair-v1";
export const FIELD_DEMO_OWNER_RECONCILE_CONFIRMATION =
  "fieldgrid-staging-field-demo-owner-reconcile-v1";
export const FIELD_DEMO_PLATFORM_PRIVILEGE_REPAIR_CONFIRMATION =
  "fieldgrid-staging-field-demo-platform-privilege-repair-v1";
export const FIELD_DEMO_OWNER_BINDING_PROJECT_REF = "olyfmekyqozxrbrwwszu";
export const FIELD_DEMO_OWNER_BINDING_SUPABASE_URL =
  "https://olyfmekyqozxrbrwwszu.supabase.co";

const OWNER_BINDING_LOCK_KEY =
  "fieldgrid:staging:field-demo-owner-binding-repair:v1";
const PLATFORM_PRIVILEGE_REPAIR_LOCK_KEY =
  "fieldgrid:staging:field-demo-platform-privilege-repair:v1";
const DATABASE_MIGRATION_LOCK_KEY = "fieldgrid:database-migrations:v1";
const OWNER_AUTH_REPAIR_VERSION =
  "fieldgrid-staging-field-demo-owner-repair-v1";
const PLATFORM_PRIVILEGE_AUTH_REPAIR_VERSION =
  "fieldgrid-staging-field-demo-platform-privilege-repair-v1";
const PLATFORM_PRIVILEGE_REQUIRED_MIGRATION_NAMES = [
  "20260913135353_preserve_deleted_platform_notification_recipient_history.sql",
  "20260913154500_prevent_cross_portal_identity_reuse.sql",
  "20260913161000_serialize_auth_surface_bindings_across_snapshots.sql",
  "20260913162000_harden_platform_authorization_continuity.sql",
  "20260913163000_scope_platform_privilege_repair_delete.sql",
  "20260913164000_close_auth_surface_lock_acl.sql",
  "20260913165000_bind_tenant_invite_reservation_sources.sql",
  "20260913170000_bind_authorization_invitation_reservations.sql",
  "20260913171000_bind_active_tenant_invitation_reservations.sql",
] as const;
const PLATFORM_PRIVILEGE_LEGACY_TIMESTAMP_MIGRATION_NAMES = new Set([
  "20260618201212_assignment_monthly_codes.sql",
]);
const PLATFORM_PRIVILEGE_HISTORICAL_MIGRATIONS = new Map<
  string,
  {
    kind: "renamed" | "tombstone";
    canonicalName: string | null;
    hash: string;
  }
>([
  [
    "055_platform_users.sql",
    {
      kind: "tombstone",
      canonicalName: null,
      hash: "77b8c80d6fe9470da8d82cfe6c6338c584b396878dd322404bb445a96d2de37a",
    },
  ],
  [
    "102_cleanup_staging_demo_sector_descriptions.sql",
    {
      kind: "renamed",
      canonicalName:
        "20260708121000_cleanup_staging_demo_sector_descriptions.sql",
      hash: "7639dda641d69e0c1393ee36f97814fcc03f08f5e103aed3ed54d834e82bcd4a",
    },
  ],
  [
    "103_enterprise_whitelabel_theme.sql",
    {
      kind: "renamed",
      canonicalName: "20260708121100_enterprise_whitelabel_theme.sql",
      hash: "23059e1c093e3c2278270c2c9e34ca517505bdb27bd489f8bda97253b5b6eb05",
    },
  ],
]);
const AUTH_REQUEST_TIMEOUT_MS = 10_000;
export const FIELD_DEMO_RETAINED_OWNER_ID =
  "cafccef6-ba37-4fe0-879e-55c566b6136e";
export const FIELD_DEMO_SUPERSEDED_OWNER_EMAIL = "admin@veele-services.nl";
export const FIELD_DEMO_SUPERSEDED_OWNER_ID =
  "0095f960-d4f0-478b-b7d9-9cd483281e4e";
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const RUN_NUMBER_PATTERN = /^[1-9][0-9]{0,19}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type OwnerBindingMode =
  | "check"
  | "diagnose"
  | "repair"
  | "reconcile"
  | "repair-platform-privilege";

type OwnerBindingOptions = {
  mode: OwnerBindingMode;
  expectedSha: string;
};

type OwnerBindingEnvironment = Record<string, string | undefined> & {
  APP_ENV?: string;
  TARGET_ENVIRONMENT?: string;
  GITHUB_ACTIONS?: string;
  GITHUB_EVENT_NAME?: string;
  GITHUB_REF?: string;
  GITHUB_REF_NAME?: string;
  GITHUB_REPOSITORY?: string;
  GITHUB_RUN_ATTEMPT?: string;
  GITHUB_RUN_ID?: string;
  GITHUB_SHA?: string;
  EXPECTED_SUPABASE_PROJECT_REF?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  DATABASE_URL?: string;
  FIELDGRID_MIGRATION_DATABASE_URL?: string;
  FIELDGRID_DATABASE_CONNECTION_PURPOSE?: string;
  FIELDGRID_FIELD_DEMO_OWNER_BINDING_CONFIRMATION?: string;
  FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type FieldDemoOwnerBindingSnapshot = {
  tenant_id: string | null;
  owner_user_id: string | null;
  management_role_id: string | null;
  slug_tenant_count: number;
  target_tenant_core_valid_count: number;
  exact_domain_global_count: number;
  legacy_domain_global_count: number;
  target_domain_count: number;
  target_exact_domain_count: number;
  target_legacy_domain_count: number;
  target_primary_domain_count: number;
  target_legacy_ready_count: number;
  legacy_domain_check_count: number;
  organization_settings_count: number;
  active_subscription_count: number;
  active_enterprise_subscription_count: number;
  website_site_count: number;
  website_binding_count: number;
  exact_domain_binding_count: number;
  legacy_domain_binding_count: number;
  auth_email_count: number;
  auth_core_count: number;
  auth_contract_count: number;
  auth_environment_count: number;
  auth_portal_count: number;
  auth_exact_count: number;
  email_identity_count: number;
  platform_user_count: number;
  legacy_user_role_count: number;
  management_template_role_count: number;
  management_template_permission_count: number;
  target_management_role_count: number;
  target_management_permission_count: number;
  management_missing_permission_count: number;
  management_extra_permission_count: number;
  owner_global_membership_count: number;
  owner_target_membership_count: number;
  owner_target_exact_active_count: number;
  target_any_owner_count: number;
  target_active_owner_count: number;
  owner_global_role_link_count: number;
  owner_target_role_link_count: number;
  owner_target_management_link_count: number;
  owner_target_nonmanagement_link_count: number;
};

export type FieldDemoOwnerPlatformPrivilegeSnapshot = {
  auth_email_count: number;
  auth_contract_count: number;
  auth_environment_count: number;
  auth_tenant_portal_count: number;
  auth_platform_portal_count: number;
  platform_user_count: number;
  platform_user_active_count: number;
  platform_user_inactive_count: number;
  platform_user_suspended_count: number;
  platform_user_owner_role_count: number;
  platform_user_admin_role_count: number;
  platform_user_support_role_count: number;
  other_active_platform_owner_count: number;
  other_active_platform_admin_count: number;
  configured_actor_provided_count: number;
  configured_actor_matches_owner_count: number;
  configured_actor_eligible_count: number;
  platform_support_grant_count: number;
  platform_current_support_grant_count: number;
  platform_current_runtime_support_grant_count: number;
  platform_future_support_grant_count: number;
  platform_support_actor_audit_count: number;
  platform_recipient_reference_count: number;
  platform_recipient_snapshot_count: number;
  platform_blocking_reference_count: number;
  platform_nonrecipient_set_null_reference_count: number;
  platform_set_null_reference_count: number;
  platform_audit_event_count: number;
  platform_invite_event_count: number;
  platform_create_event_count: number;
  direct_platform_fk_count: number;
  exact_direct_platform_fk_count: number;
  indirect_grant_fk_count: number;
  exact_indirect_grant_fk_count: number;
  exact_set_null_nullable_column_count: number;
  recipient_scope_check_count: number;
  platform_owner_continuity_trigger_count: number;
  unexpected_set_null_check_count: number;
  unexpected_deletion_path_trigger_count: number;
};

export type FieldDemoOwnerPlatformPrivilegeSummary = {
  accountState:
    | "absent"
    | "active-owner"
    | "active-admin"
    | "active-support"
    | "inactive-owner"
    | "inactive-admin"
    | "inactive-support"
    | "suspended-owner"
    | "suspended-admin"
    | "suspended-support"
    | "ambiguous";
  continuityState:
    | "not-applicable"
    | "sole-active-owner"
    | "other-active-owner-present"
    | "ambiguous";
  automationActorState:
    | "single-admin-ready"
    | "single-owner-ready"
    | "none"
    | "multiple-admins"
    | "multiple-owners"
    | "ambiguous";
  configuredActorState:
    | "not-configured"
    | "target-eligible"
    | "target-ineligible"
    | "other-active-eligible"
    | "configured-ineligible"
    | "ambiguous";
  authMetadataState:
    | "tenant-owner-compatible"
    | "platform-admin-portal"
    | "incompatible"
    | "unavailable";
  supportGrantState:
    | "none"
    | "historical-only"
    | "current"
    | "future"
    | "current-and-future"
    | "ambiguous";
  effectiveSupportState:
    | "none"
    | "active"
    | "blocked-by-platform-status"
    | "blocked-by-tenant-status"
    | "blocked-by-platform-and-tenant-status"
    | "ambiguous";
  foreignKeyContractState: "exact" | "drift" | "ambiguous";
  recipientSnapshotState: "none" | "exact" | "incomplete" | "ambiguous";
  nonRecipientHistoryState: "none" | "present" | "ambiguous";
  deletionBlockState: "none" | "notification-recipient-reference" | "ambiguous";
  deletionImpactState:
    | "none"
    | "cascade-history-present"
    | "set-null-history-present"
    | "cascade-and-set-null-history-present"
    | "ambiguous";
  provenanceState:
    | "none"
    | "invite-event-present"
    | "create-event-present"
    | "mixed-events-present"
    | "other-audit-history"
    | "ambiguous";
};

export type FieldDemoOwnerBindingState =
  | "already-valid"
  | "missing-membership-and-role"
  | "missing-management-role"
  | "unsafe";

export type FieldDemoOwnerBindingFailureReason =
  | "tenant-identity-invalid"
  | "tenant-runtime-invalid"
  | "domain-prerequisite-invalid"
  | "organization-settings-invalid"
  | "subscription-invalid"
  | "website-state-present"
  | "domain-history-present"
  | "auth-owner-email-invalid"
  | "auth-owner-core-invalid"
  | "auth-owner-email-identity-invalid"
  | "auth-owner-platform-privilege-present"
  | "auth-owner-contract-invalid"
  | "auth-owner-environment-invalid"
  | "auth-owner-portal-invalid"
  | "auth-owner-invalid"
  | "legacy-role-state-present"
  | "management-role-invalid"
  | "management-permissions-invalid"
  | "cross-tenant-owner-state"
  | "conflicting-owner-state"
  | "owner-membership-invalid"
  | "owner-role-link-invalid";

export type FieldDemoOwnerBindingDecision = {
  state: FieldDemoOwnerBindingState;
  failureReason: FieldDemoOwnerBindingFailureReason | null;
};

export type FieldDemoOwnerBindingRepairResult =
  | "already-valid"
  | "membership-and-role-created"
  | "management-role-created";

export type FieldDemoPlatformPrivilegeRepairResult =
  | "already-removed"
  | "platform-privilege-removed";

type FieldDemoOwnerAuthUpdateOutcome = "accepted" | "rejected" | "uncertain";

type OwnerBindingErrorCode =
  | "field_demo_owner_binding_configuration_invalid"
  | "field_demo_owner_binding_lock_unavailable"
  | "field_demo_owner_binding_precondition_invalid"
  | "field_demo_owner_binding_mutation_failed"
  | "field_demo_owner_binding_postcondition_invalid"
  | "field_demo_owner_auth_update_rejected"
  | "field_demo_owner_auth_update_uncertain"
  | "field_demo_owner_binding_failed";

type OwnerBindingFailureStage =
  | "configuration"
  | "database_bootstrap"
  | "database_transaction"
  | "owner_binding_precondition"
  | "owner_binding_mutation"
  | "owner_binding_postcondition"
  | "owner_auth_normalization"
  | "platform_privilege_precondition"
  | "platform_privilege_mutation"
  | "platform_privilege_postcondition"
  | null;

class FieldDemoOwnerBindingError extends Error {
  readonly code: OwnerBindingErrorCode;
  readonly failureStage: OwnerBindingFailureStage;
  readonly failureReason: FieldDemoOwnerBindingFailureReason | null;

  constructor(
    code: OwnerBindingErrorCode,
    message: string,
    failureStage: OwnerBindingFailureStage,
    failureReason: FieldDemoOwnerBindingFailureReason | null = null,
  ) {
    super(message);
    this.name = "FieldDemoOwnerBindingError";
    this.code = code;
    this.failureStage = failureStage;
    this.failureReason = failureReason;
  }
}

type OwnerBindingEvidence = {
  schemaVersion: 3;
  contract: typeof FIELD_DEMO_OWNER_BINDING_VERSION;
  environment: "staging";
  operation: "diagnose" | "repair" | "reconcile" | "repair-platform-privilege";
  expectedMainSha: string;
  status: "passed" | "failed";
  observedState: FieldDemoOwnerBindingState | null;
  result:
    | "diagnosed"
    | "reconciled-retained-owner"
    | FieldDemoOwnerBindingRepairResult
    | FieldDemoPlatformPrivilegeRepairResult
    | null;
  mutationAttempted: boolean;
  errorCode: OwnerBindingErrorCode | null;
  failureStage: OwnerBindingFailureStage;
  failureReason: FieldDemoOwnerBindingFailureReason | null;
  platformPrivilegeSummary: FieldDemoOwnerPlatformPrivilegeSummary | null;
  platformPrivilegePhase:
    | "not-started"
    | "quarantined"
    | "auth-normalized"
    | "removed";
  startedAt: string;
  completedAt: string;
};

type Queryable = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};

export type FieldDemoPlatformPrivilegeRepairTarget = {
  userId: string;
  platformUserId: string | null;
  platformRole: string | null;
  platformStatus: string | null;
  appMetadata: Record<string, unknown>;
};

type DatabaseModule = {
  pool: {
    connect: () => Promise<
      Queryable & { release: (error?: Error | boolean) => void }
    >;
    end: () => Promise<void>;
  };
};

type OwnerBindingRepairDependencies = {
  readSnapshot: () => Promise<FieldDemoOwnerBindingSnapshot>;
  createMembership: (tenantId: string, userId: string) => Promise<void>;
  createManagementRoleLink: (
    tenantId: string,
    userId: string,
    managementRoleId: string,
  ) => Promise<void>;
};

type OwnerReconciliationDependencies = {
  readTarget: () => Promise<{
    tenantId: string;
    retainedUser: { id: string; email: string };
    supersededUser: { id: string; email: string };
    ownerMemberships: Array<{
      userId: string;
      role: string;
      status: string;
    }>;
  }>;
  demoteSupersededOwner: (tenantId: string, userId: string) => Promise<void>;
  readSnapshot: () => Promise<FieldDemoOwnerBindingSnapshot>;
};

export async function reconcileFieldDemoOwnerBinding(
  dependencies: OwnerReconciliationDependencies,
): Promise<"reconciled-retained-owner"> {
  const target = await dependencies.readTarget();
  if (
    target.retainedUser.email.toLowerCase() !== FIELD_DEMO_OWNER_EMAIL ||
    target.supersededUser.email.toLowerCase() !==
      FIELD_DEMO_SUPERSEDED_OWNER_EMAIL ||
    target.ownerMemberships.length !== 2 ||
    target.ownerMemberships.some(
      (membership) =>
        membership.role !== "owner" || membership.status !== "active",
    ) ||
    !target.ownerMemberships.some(
      (membership) => membership.userId === target.retainedUser.id,
    ) ||
    !target.ownerMemberships.some(
      (membership) => membership.userId === target.supersededUser.id,
    )
  ) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "The exact retained and superseded owners are not the expected field-demo state.",
      "owner_binding_precondition",
      "conflicting-owner-state",
    );
  }

  await dependencies.demoteSupersededOwner(
    target.tenantId,
    target.supersededUser.id,
  );
  const postcondition = classifyFieldDemoOwnerBinding(
    await dependencies.readSnapshot(),
  );
  if (postcondition.state !== "already-valid") {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_postcondition_invalid",
      "Owner reconciliation did not leave exactly one valid retained owner.",
      "owner_binding_postcondition",
      postcondition.failureReason,
    );
  }
  return "reconciled-retained-owner";
}

function parseArgs(argv: string[]): OwnerBindingOptions {
  let mode: OwnerBindingMode | null = null;
  let expectedSha = "";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (
      [
        "--check",
        "--diagnose",
        "--repair",
        "--reconcile",
        "--repair-platform-privilege",
      ].includes(argument ?? "")
    ) {
      if (mode) throw new Error("Choose exactly one owner-binding operation.");
      mode = argument!.slice(2) as OwnerBindingMode;
      continue;
    }
    if (argument === "--expected-sha") {
      expectedSha = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new Error(`Unknown owner-binding argument: ${argument}`);
  }
  if (!mode) throw new Error("Choose exactly one owner-binding operation.");
  if (mode !== "check" && !SHA_PATTERN.test(expectedSha)) {
    throw new Error("Owner-binding operation requires an exact main SHA.");
  }
  return { mode, expectedSha };
}

function exactStagingSupabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.origin === FIELD_DEMO_OWNER_BINDING_SUPABASE_URL &&
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

export function validateFieldDemoOwnerBindingConfig(
  options: OwnerBindingOptions,
  environment: OwnerBindingEnvironment,
): string[] {
  if (options.mode === "check") return [];
  const errors: string[] = [];
  if (environment.APP_ENV !== "staging") errors.push("APP_ENV must be staging");
  if (environment.TARGET_ENVIRONMENT !== "staging") {
    errors.push("TARGET_ENVIRONMENT must be staging");
  }
  if (environment.GITHUB_ACTIONS !== "true") {
    errors.push("owner-binding operation may run only in GitHub Actions");
  }
  if (environment.GITHUB_EVENT_NAME !== "workflow_dispatch") {
    errors.push("owner-binding operation requires workflow_dispatch");
  }
  if (environment.GITHUB_REPOSITORY !== "veele-services/platform") {
    errors.push("owner-binding operation repository is invalid");
  }
  if (!RUN_NUMBER_PATTERN.test(environment.GITHUB_RUN_ID ?? "")) {
    errors.push("owner-binding operation run id is invalid");
  }
  if (!RUN_NUMBER_PATTERN.test(environment.GITHUB_RUN_ATTEMPT ?? "")) {
    errors.push("owner-binding operation run attempt is invalid");
  }
  if (
    environment.GITHUB_REF !== "refs/heads/main" ||
    environment.GITHUB_REF_NAME !== "main"
  ) {
    errors.push("owner-binding operation must run from main");
  }
  if (
    !SHA_PATTERN.test(options.expectedSha) ||
    environment.GITHUB_SHA !== options.expectedSha
  ) {
    errors.push("checkout SHA differs from the expected main SHA");
  }
  if (
    environment.FIELDGRID_FIELD_DEMO_OWNER_BINDING_CONFIRMATION !==
    (options.mode === "reconcile"
      ? FIELD_DEMO_OWNER_RECONCILE_CONFIRMATION
      : options.mode === "repair-platform-privilege"
        ? FIELD_DEMO_PLATFORM_PRIVILEGE_REPAIR_CONFIRMATION
        : FIELD_DEMO_OWNER_BINDING_CONFIRMATION)
  ) {
    errors.push("confirmation does not authorize owner-binding operation");
  }
  if (
    environment.EXPECTED_SUPABASE_PROJECT_REF !==
    FIELD_DEMO_OWNER_BINDING_PROJECT_REF
  ) {
    errors.push("owner-binding operation project ref is invalid");
  }
  if (!exactStagingSupabaseUrl(environment.NEXT_PUBLIC_SUPABASE_URL)) {
    errors.push("owner-binding operation Supabase URL is invalid");
  }
  if (!environment.DATABASE_URL?.trim()) {
    errors.push("runtime database URL is required");
  }
  if (!environment.FIELDGRID_MIGRATION_DATABASE_URL?.trim()) {
    errors.push("migration database URL is required");
  }
  if (environment.FIELDGRID_DATABASE_CONNECTION_PURPOSE !== "migration") {
    errors.push(
      "owner-binding operation requires migration connection purpose",
    );
  }
  const configuredActor =
    environment.FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID?.trim() ?? "";
  if (
    ((options.mode === "diagnose" && configuredActor) ||
      options.mode === "repair-platform-privilege") &&
    (!UUID_PATTERN.test(configuredActor) ||
      configuredActor.toLowerCase() === FIELD_DEMO_RETAINED_OWNER_ID)
  ) {
    errors.push("configured website automation actor is invalid");
  }
  if (
    options.mode === "repair-platform-privilege" &&
    (environment.SUPABASE_SERVICE_ROLE_KEY?.trim().length ?? 0) < 32
  ) {
    errors.push("platform-privilege repair service credential is unavailable");
  }
  return errors;
}

const COUNT_FIELDS: ReadonlyArray<keyof FieldDemoOwnerBindingSnapshot> = [
  "slug_tenant_count",
  "target_tenant_core_valid_count",
  "exact_domain_global_count",
  "legacy_domain_global_count",
  "target_domain_count",
  "target_exact_domain_count",
  "target_legacy_domain_count",
  "target_primary_domain_count",
  "target_legacy_ready_count",
  "legacy_domain_check_count",
  "organization_settings_count",
  "active_subscription_count",
  "active_enterprise_subscription_count",
  "website_site_count",
  "website_binding_count",
  "exact_domain_binding_count",
  "legacy_domain_binding_count",
  "auth_email_count",
  "auth_core_count",
  "auth_contract_count",
  "auth_environment_count",
  "auth_portal_count",
  "auth_exact_count",
  "email_identity_count",
  "platform_user_count",
  "legacy_user_role_count",
  "management_template_role_count",
  "management_template_permission_count",
  "target_management_role_count",
  "target_management_permission_count",
  "management_missing_permission_count",
  "management_extra_permission_count",
  "owner_global_membership_count",
  "owner_target_membership_count",
  "owner_target_exact_active_count",
  "target_any_owner_count",
  "target_active_owner_count",
  "owner_global_role_link_count",
  "owner_target_role_link_count",
  "owner_target_management_link_count",
  "owner_target_nonmanagement_link_count",
];

function snapshotCountsAreValid(
  snapshot: FieldDemoOwnerBindingSnapshot,
): boolean {
  return COUNT_FIELDS.every(
    (field) =>
      Number.isInteger(snapshot[field]) && Number(snapshot[field]) >= 0,
  );
}

const PLATFORM_PRIVILEGE_COUNT_FIELDS: ReadonlyArray<
  keyof FieldDemoOwnerPlatformPrivilegeSnapshot
> = [
  "auth_email_count",
  "auth_contract_count",
  "auth_environment_count",
  "auth_tenant_portal_count",
  "auth_platform_portal_count",
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
];

function platformPrivilegeCountsAreValid(
  snapshot: FieldDemoOwnerPlatformPrivilegeSnapshot,
): boolean {
  return (
    PLATFORM_PRIVILEGE_COUNT_FIELDS.every(
      (field) =>
        Number.isInteger(snapshot[field]) && Number(snapshot[field]) >= 0,
    ) &&
    snapshot.platform_recipient_snapshot_count +
      snapshot.platform_blocking_reference_count ===
      snapshot.platform_recipient_reference_count &&
    snapshot.platform_nonrecipient_set_null_reference_count +
      snapshot.platform_recipient_snapshot_count ===
      snapshot.platform_set_null_reference_count
  );
}

export function summarizeFieldDemoOwnerPlatformPrivilege(
  snapshot: FieldDemoOwnerPlatformPrivilegeSnapshot,
): FieldDemoOwnerPlatformPrivilegeSummary {
  if (!platformPrivilegeCountsAreValid(snapshot)) {
    return {
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
    };
  }

  const statusCounts = {
    active: snapshot.platform_user_active_count,
    inactive: snapshot.platform_user_inactive_count,
    suspended: snapshot.platform_user_suspended_count,
  } as const;
  const roleCounts = {
    owner: snapshot.platform_user_owner_role_count,
    admin: snapshot.platform_user_admin_role_count,
    support: snapshot.platform_user_support_role_count,
  } as const;
  const status = Object.entries(statusCounts).find(
    ([, count]) => count === 1,
  )?.[0] as keyof typeof statusCounts | undefined;
  const role = Object.entries(roleCounts).find(
    ([, count]) => count === 1,
  )?.[0] as keyof typeof roleCounts | undefined;
  const accountStates = {
    active: {
      owner: "active-owner",
      admin: "active-admin",
      support: "active-support",
    },
    inactive: {
      owner: "inactive-owner",
      admin: "inactive-admin",
      support: "inactive-support",
    },
    suspended: {
      owner: "suspended-owner",
      admin: "suspended-admin",
      support: "suspended-support",
    },
  } as const;
  let accountState: FieldDemoOwnerPlatformPrivilegeSummary["accountState"] =
    "ambiguous";
  if (
    snapshot.platform_user_count === 0 &&
    Object.values(statusCounts).every((count) => count === 0) &&
    Object.values(roleCounts).every((count) => count === 0)
  ) {
    accountState = "absent";
  } else if (
    snapshot.platform_user_count === 1 &&
    Object.values(statusCounts).reduce((sum, count) => sum + count, 0) === 1 &&
    Object.values(roleCounts).reduce((sum, count) => sum + count, 0) === 1 &&
    status &&
    role
  ) {
    accountState = accountStates[status][role];
  }

  const continuityState: FieldDemoOwnerPlatformPrivilegeSummary["continuityState"] =
    accountState === "ambiguous"
      ? "ambiguous"
      : accountState !== "active-owner" && accountState !== "suspended-owner"
        ? "not-applicable"
        : snapshot.other_active_platform_owner_count === 0
          ? "sole-active-owner"
          : "other-active-owner-present";

  let automationActorState: FieldDemoOwnerPlatformPrivilegeSummary["automationActorState"];
  if (snapshot.other_active_platform_admin_count === 1) {
    automationActorState = "single-admin-ready";
  } else if (snapshot.other_active_platform_admin_count > 1) {
    automationActorState = "multiple-admins";
  } else if (snapshot.other_active_platform_owner_count === 1) {
    automationActorState = "single-owner-ready";
  } else if (snapshot.other_active_platform_owner_count > 1) {
    automationActorState = "multiple-owners";
  } else {
    automationActorState = "none";
  }

  let configuredActorState: FieldDemoOwnerPlatformPrivilegeSummary["configuredActorState"] =
    "ambiguous";
  if (
    snapshot.configured_actor_provided_count === 0 &&
    snapshot.configured_actor_matches_owner_count === 0 &&
    snapshot.configured_actor_eligible_count === 0
  ) {
    configuredActorState = "not-configured";
  } else if (
    snapshot.configured_actor_provided_count === 1 &&
    snapshot.configured_actor_matches_owner_count === 1 &&
    snapshot.configured_actor_eligible_count === 1
  ) {
    configuredActorState = "target-eligible";
  } else if (
    snapshot.configured_actor_provided_count === 1 &&
    snapshot.configured_actor_matches_owner_count === 1 &&
    snapshot.configured_actor_eligible_count === 0
  ) {
    configuredActorState = "target-ineligible";
  } else if (
    snapshot.configured_actor_provided_count === 1 &&
    snapshot.configured_actor_matches_owner_count === 0 &&
    snapshot.configured_actor_eligible_count === 1
  ) {
    configuredActorState = "other-active-eligible";
  } else if (
    snapshot.configured_actor_provided_count === 1 &&
    snapshot.configured_actor_matches_owner_count === 0 &&
    snapshot.configured_actor_eligible_count === 0
  ) {
    configuredActorState = "configured-ineligible";
  }

  let authMetadataState: FieldDemoOwnerPlatformPrivilegeSummary["authMetadataState"] =
    "incompatible";
  if (snapshot.auth_email_count !== 1) {
    authMetadataState = "unavailable";
  } else if (
    snapshot.auth_contract_count === 1 &&
    snapshot.auth_environment_count === 1 &&
    snapshot.auth_tenant_portal_count === 1 &&
    snapshot.auth_platform_portal_count === 0
  ) {
    authMetadataState = "tenant-owner-compatible";
  } else if (
    snapshot.auth_contract_count === 1 &&
    snapshot.auth_environment_count === 1 &&
    snapshot.auth_tenant_portal_count === 0 &&
    snapshot.auth_platform_portal_count === 1
  ) {
    authMetadataState = "platform-admin-portal";
  }

  let supportGrantState: FieldDemoOwnerPlatformPrivilegeSummary["supportGrantState"] =
    "ambiguous";
  if (
    snapshot.platform_current_support_grant_count +
      snapshot.platform_future_support_grant_count <=
      snapshot.platform_support_grant_count &&
    snapshot.platform_current_runtime_support_grant_count <=
      snapshot.platform_current_support_grant_count
  ) {
    if (snapshot.platform_support_grant_count === 0) {
      supportGrantState = "none";
    } else if (
      snapshot.platform_current_support_grant_count > 0 &&
      snapshot.platform_future_support_grant_count > 0
    ) {
      supportGrantState = "current-and-future";
    } else if (snapshot.platform_current_support_grant_count > 0) {
      supportGrantState = "current";
    } else if (snapshot.platform_future_support_grant_count > 0) {
      supportGrantState = "future";
    } else {
      supportGrantState = "historical-only";
    }
  }

  const hasCurrentSupportGrant =
    supportGrantState === "current" ||
    supportGrantState === "current-and-future";
  const hasCurrentRuntimeSupportGrant =
    snapshot.platform_current_runtime_support_grant_count > 0;
  const hasActivePlatformAccount = accountState.startsWith("active-");
  const effectiveSupportState: FieldDemoOwnerPlatformPrivilegeSummary["effectiveSupportState"] =
    supportGrantState === "ambiguous" || accountState === "ambiguous"
      ? "ambiguous"
      : !hasCurrentSupportGrant
        ? "none"
        : hasActivePlatformAccount && hasCurrentRuntimeSupportGrant
          ? "active"
          : !hasActivePlatformAccount && !hasCurrentRuntimeSupportGrant
            ? "blocked-by-platform-and-tenant-status"
            : hasActivePlatformAccount
              ? "blocked-by-tenant-status"
              : "blocked-by-platform-status";

  const foreignKeyContractState: FieldDemoOwnerPlatformPrivilegeSummary["foreignKeyContractState"] =
    snapshot.direct_platform_fk_count === 9 &&
    snapshot.exact_direct_platform_fk_count === 9 &&
    snapshot.indirect_grant_fk_count === 2 &&
    snapshot.exact_indirect_grant_fk_count === 2 &&
    snapshot.exact_set_null_nullable_column_count === 9 &&
    snapshot.recipient_scope_check_count === 1 &&
    snapshot.platform_owner_continuity_trigger_count === 2 &&
    snapshot.unexpected_set_null_check_count === 0 &&
    snapshot.unexpected_deletion_path_trigger_count === 0
      ? "exact"
      : "drift";
  const recipientSnapshotState: FieldDemoOwnerPlatformPrivilegeSummary["recipientSnapshotState"] =
    snapshot.platform_recipient_reference_count === 0 &&
    snapshot.platform_recipient_snapshot_count === 0
      ? "none"
      : snapshot.platform_recipient_reference_count > 0 &&
          snapshot.platform_recipient_snapshot_count ===
            snapshot.platform_recipient_reference_count
        ? "exact"
        : snapshot.platform_recipient_snapshot_count <=
            snapshot.platform_recipient_reference_count
          ? "incomplete"
          : "ambiguous";
  const nonRecipientHistoryState: FieldDemoOwnerPlatformPrivilegeSummary["nonRecipientHistoryState"] =
    snapshot.platform_nonrecipient_set_null_reference_count === 0
      ? "none"
      : "present";
  const hasCascadeHistory =
    snapshot.platform_support_grant_count > 0 ||
    snapshot.platform_support_actor_audit_count > 0;
  const hasSetNullHistory = snapshot.platform_set_null_reference_count > 0;
  const deletionBlockState: FieldDemoOwnerPlatformPrivilegeSummary["deletionBlockState"] =
    foreignKeyContractState !== "exact" || accountState === "ambiguous"
      ? "ambiguous"
      : snapshot.platform_blocking_reference_count > 0
        ? "notification-recipient-reference"
        : "none";
  const deletionImpactState: FieldDemoOwnerPlatformPrivilegeSummary["deletionImpactState"] =
    foreignKeyContractState !== "exact" || accountState === "ambiguous"
      ? "ambiguous"
      : hasCascadeHistory && hasSetNullHistory
        ? "cascade-and-set-null-history-present"
        : hasCascadeHistory
          ? "cascade-history-present"
          : hasSetNullHistory
            ? "set-null-history-present"
            : "none";

  let provenanceState: FieldDemoOwnerPlatformPrivilegeSummary["provenanceState"] =
    "ambiguous";
  if (
    snapshot.platform_invite_event_count <=
      snapshot.platform_audit_event_count &&
    snapshot.platform_create_event_count <=
      snapshot.platform_audit_event_count &&
    snapshot.platform_invite_event_count +
      snapshot.platform_create_event_count <=
      snapshot.platform_audit_event_count
  ) {
    if (snapshot.platform_audit_event_count === 0) {
      provenanceState = "none";
    } else if (
      snapshot.platform_invite_event_count > 0 &&
      snapshot.platform_create_event_count > 0
    ) {
      provenanceState = "mixed-events-present";
    } else if (snapshot.platform_invite_event_count > 0) {
      provenanceState = "invite-event-present";
    } else if (snapshot.platform_create_event_count > 0) {
      provenanceState = "create-event-present";
    } else {
      provenanceState = "other-audit-history";
    }
  }

  return {
    accountState,
    continuityState,
    automationActorState,
    configuredActorState,
    authMetadataState,
    supportGrantState,
    effectiveSupportState,
    foreignKeyContractState,
    recipientSnapshotState,
    nonRecipientHistoryState,
    deletionBlockState,
    deletionImpactState,
    provenanceState,
  };
}

export function classifyFieldDemoOwnerBinding(
  snapshot: FieldDemoOwnerBindingSnapshot,
): FieldDemoOwnerBindingDecision {
  if (
    !snapshotCountsAreValid(snapshot) ||
    snapshot.slug_tenant_count !== 1 ||
    !snapshot.tenant_id ||
    !UUID_PATTERN.test(snapshot.tenant_id)
  ) {
    return { state: "unsafe", failureReason: "tenant-identity-invalid" };
  }
  if (snapshot.target_tenant_core_valid_count !== 1) {
    return { state: "unsafe", failureReason: "tenant-runtime-invalid" };
  }
  if (
    snapshot.exact_domain_global_count !== 0 ||
    snapshot.legacy_domain_global_count !== 1 ||
    snapshot.target_domain_count !== 1 ||
    snapshot.target_exact_domain_count !== 0 ||
    snapshot.target_legacy_domain_count !== 1 ||
    snapshot.target_primary_domain_count !== 1 ||
    snapshot.target_legacy_ready_count !== 1
  ) {
    return { state: "unsafe", failureReason: "domain-prerequisite-invalid" };
  }
  if (snapshot.legacy_domain_check_count !== 0) {
    return { state: "unsafe", failureReason: "domain-history-present" };
  }
  if (snapshot.organization_settings_count !== 1) {
    return {
      state: "unsafe",
      failureReason: "organization-settings-invalid",
    };
  }
  if (
    snapshot.active_subscription_count !== 1 ||
    snapshot.active_enterprise_subscription_count !== 1
  ) {
    return { state: "unsafe", failureReason: "subscription-invalid" };
  }
  if (
    snapshot.website_site_count !== 0 ||
    snapshot.website_binding_count !== 0 ||
    snapshot.exact_domain_binding_count !== 0 ||
    snapshot.legacy_domain_binding_count !== 0
  ) {
    return { state: "unsafe", failureReason: "website-state-present" };
  }
  if (
    snapshot.auth_email_count !== 1 ||
    !snapshot.owner_user_id ||
    !UUID_PATTERN.test(snapshot.owner_user_id)
  ) {
    return { state: "unsafe", failureReason: "auth-owner-email-invalid" };
  }
  if (snapshot.auth_core_count !== 1) {
    return { state: "unsafe", failureReason: "auth-owner-core-invalid" };
  }
  if (snapshot.email_identity_count !== 1) {
    return {
      state: "unsafe",
      failureReason: "auth-owner-email-identity-invalid",
    };
  }
  if (snapshot.platform_user_count !== 0) {
    return {
      state: "unsafe",
      failureReason: "auth-owner-platform-privilege-present",
    };
  }
  if (snapshot.auth_contract_count !== 1) {
    return { state: "unsafe", failureReason: "auth-owner-contract-invalid" };
  }
  if (snapshot.auth_environment_count !== 1) {
    return {
      state: "unsafe",
      failureReason: "auth-owner-environment-invalid",
    };
  }
  if (snapshot.auth_portal_count !== 1) {
    return { state: "unsafe", failureReason: "auth-owner-portal-invalid" };
  }
  if (snapshot.auth_exact_count !== 1) {
    return { state: "unsafe", failureReason: "auth-owner-invalid" };
  }
  if (snapshot.legacy_user_role_count !== 0) {
    return { state: "unsafe", failureReason: "legacy-role-state-present" };
  }
  if (
    snapshot.management_template_role_count !== 1 ||
    snapshot.target_management_role_count !== 1 ||
    !snapshot.management_role_id ||
    !UUID_PATTERN.test(snapshot.management_role_id)
  ) {
    return { state: "unsafe", failureReason: "management-role-invalid" };
  }
  if (
    snapshot.management_template_permission_count < 1 ||
    snapshot.target_management_permission_count !==
      snapshot.management_template_permission_count ||
    snapshot.management_missing_permission_count !== 0 ||
    snapshot.management_extra_permission_count !== 0
  ) {
    return {
      state: "unsafe",
      failureReason: "management-permissions-invalid",
    };
  }
  if (
    snapshot.owner_global_membership_count !==
      snapshot.owner_target_membership_count ||
    snapshot.owner_global_role_link_count !==
      snapshot.owner_target_role_link_count
  ) {
    return { state: "unsafe", failureReason: "cross-tenant-owner-state" };
  }

  const exactMembership =
    snapshot.owner_global_membership_count === 1 &&
    snapshot.owner_target_membership_count === 1 &&
    snapshot.owner_target_exact_active_count === 1 &&
    snapshot.target_any_owner_count === 1 &&
    snapshot.target_active_owner_count === 1;
  const noMembership =
    snapshot.owner_global_membership_count === 0 &&
    snapshot.owner_target_membership_count === 0 &&
    snapshot.owner_target_exact_active_count === 0 &&
    snapshot.target_any_owner_count === 0 &&
    snapshot.target_active_owner_count === 0;
  const exactRoleLink =
    snapshot.owner_global_role_link_count === 1 &&
    snapshot.owner_target_role_link_count === 1 &&
    snapshot.owner_target_management_link_count === 1 &&
    snapshot.owner_target_nonmanagement_link_count === 0;
  const noRoleLink =
    snapshot.owner_global_role_link_count === 0 &&
    snapshot.owner_target_role_link_count === 0 &&
    snapshot.owner_target_management_link_count === 0 &&
    snapshot.owner_target_nonmanagement_link_count === 0;

  if (exactMembership && exactRoleLink) {
    return { state: "already-valid", failureReason: null };
  }
  if (noMembership && noRoleLink) {
    return { state: "missing-membership-and-role", failureReason: null };
  }
  if (exactMembership && noRoleLink) {
    return { state: "missing-management-role", failureReason: null };
  }
  if (
    snapshot.target_any_owner_count !==
      snapshot.owner_target_exact_active_count ||
    snapshot.target_active_owner_count !==
      snapshot.owner_target_exact_active_count
  ) {
    return { state: "unsafe", failureReason: "conflicting-owner-state" };
  }
  if (!exactMembership && !noMembership) {
    return { state: "unsafe", failureReason: "owner-membership-invalid" };
  }
  return { state: "unsafe", failureReason: "owner-role-link-invalid" };
}

export function projectFieldDemoOwnerBindingAfterPlatformPrivilegeRepair(
  snapshot: FieldDemoOwnerBindingSnapshot,
): FieldDemoOwnerBindingDecision {
  return classifyFieldDemoOwnerBinding({
    ...snapshot,
    platform_user_count: 0,
    auth_contract_count: 1,
    auth_environment_count: 1,
    auth_portal_count: 1,
    auth_exact_count: 1,
  });
}

export function fieldDemoPlatformPrivilegeRepairPreconditionIsSafe(
  snapshot: FieldDemoOwnerBindingSnapshot,
  summary: FieldDemoOwnerPlatformPrivilegeSummary,
): boolean {
  const current = classifyFieldDemoOwnerBinding(snapshot);
  const projected =
    projectFieldDemoOwnerBindingAfterPlatformPrivilegeRepair(snapshot);
  return (
    current.state === "unsafe" &&
    current.failureReason === "auth-owner-platform-privilege-present" &&
    snapshot.owner_user_id?.toLowerCase() === FIELD_DEMO_RETAINED_OWNER_ID &&
    snapshot.platform_user_count === 1 &&
    projected.state === "already-valid" &&
    ["active-owner", "suspended-owner"].includes(summary.accountState) &&
    summary.continuityState === "other-active-owner-present" &&
    summary.automationActorState === "single-admin-ready" &&
    summary.configuredActorState === "other-active-eligible" &&
    summary.authMetadataState !== "unavailable" &&
    summary.supportGrantState === "none" &&
    summary.effectiveSupportState === "none" &&
    summary.foreignKeyContractState === "exact" &&
    ["none", "exact"].includes(summary.recipientSnapshotState) &&
    summary.nonRecipientHistoryState === "none" &&
    summary.deletionBlockState === "none" &&
    ["none", "set-null-history-present"].includes(
      summary.deletionImpactState,
    ) &&
    summary.provenanceState === "invite-event-present"
  );
}

export function fieldDemoOwnerAuthMetadataPatch(
  revokedAt: string,
): Record<string, unknown> {
  if (
    !revokedAt ||
    !Number.isFinite(Date.parse(revokedAt)) ||
    new Date(revokedAt).toISOString() !== revokedAt
  ) {
    throw new Error("Owner session revocation timestamp is invalid.");
  }
  return {
    portal: "tenant-admin",
    fieldgrid_automation_contract: OWNER_AUTH_REPAIR_VERSION,
    fieldgrid_environment: "staging",
    fieldgrid_platform_privilege_repair: PLATFORM_PRIVILEGE_AUTH_REPAIR_VERSION,
    session_revoked_at: revokedAt,
    // GoTrue merges app_metadata patches; null removes only this obsolete key.
    platform_role: null,
  };
}

export function fieldDemoOwnerAuthUpdateOutcome(
  response: Pick<Response, "ok" | "status">,
): FieldDemoOwnerAuthUpdateOutcome {
  if (response.ok && response.status >= 200 && response.status < 300) {
    return "accepted";
  }
  if (
    response.status >= 400 &&
    response.status < 500 &&
    response.status !== 408 &&
    response.status !== 425 &&
    response.status !== 429
  ) {
    return "rejected";
  }
  return "uncertain";
}

export async function repairFieldDemoOwnerBinding(
  dependencies: OwnerBindingRepairDependencies,
): Promise<FieldDemoOwnerBindingRepairResult> {
  const before = await dependencies.readSnapshot();
  const decision = classifyFieldDemoOwnerBinding(before);
  if (decision.state === "unsafe") {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "Field-demo owner binding is unsafe for repair.",
      "owner_binding_precondition",
      decision.failureReason,
    );
  }
  if (decision.state === "already-valid") return "already-valid";
  const { tenant_id: tenantId, owner_user_id: userId } = before;
  const managementRoleId = before.management_role_id;
  if (!tenantId || !userId || !managementRoleId) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "Field-demo owner-binding identities are unavailable.",
      "owner_binding_precondition",
      "tenant-identity-invalid",
    );
  }
  try {
    if (decision.state === "missing-membership-and-role") {
      await dependencies.createMembership(tenantId, userId);
    }
    await dependencies.createManagementRoleLink(
      tenantId,
      userId,
      managementRoleId,
    );
  } catch {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_mutation_failed",
      "Field-demo owner-binding mutation failed.",
      "owner_binding_mutation",
    );
  }
  const after = await dependencies.readSnapshot();
  if (classifyFieldDemoOwnerBinding(after).state !== "already-valid") {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_postcondition_invalid",
      "Field-demo owner-binding postcondition is not exact.",
      "owner_binding_postcondition",
    );
  }
  return decision.state === "missing-membership-and-role"
    ? "membership-and-role-created"
    : "management-role-created";
}

export function safeFieldDemoOwnerBindingErrorCode(
  error: unknown,
): OwnerBindingErrorCode {
  return error instanceof FieldDemoOwnerBindingError
    ? error.code
    : "field_demo_owner_binding_failed";
}

export function safeFieldDemoOwnerBindingFailureReason(
  error: unknown,
): FieldDemoOwnerBindingFailureReason | null {
  return error instanceof FieldDemoOwnerBindingError
    ? error.failureReason
    : null;
}

export function formatSafeFieldDemoOwnerBindingError(error: unknown): string {
  const reason = safeFieldDemoOwnerBindingFailureReason(error);
  return `${FIELD_DEMO_OWNER_BINDING_VERSION}: ${safeFieldDemoOwnerBindingErrorCode(
    error,
  )}${reason ? `:${reason}` : ""}`;
}

// The activation/profile-name markers are deliberately absent from the
// durable owner predicate: normal backoffice onboarding consumes them.
export const FIELD_DEMO_OWNER_BINDING_SNAPSHOT_QUERY = `WITH target AS (
  SELECT id, plan_key, is_active, status
    FROM public.tenants
   WHERE slug = $1
), owner_account AS (
  SELECT auth_user.id
    FROM auth.users AS auth_user
   WHERE auth_user.id = $2::uuid
     AND lower(auth_user.email) = lower($3)
), management_template AS (
  SELECT role.id
    FROM public.roles AS role
   WHERE role.name = 'Management'
     AND role.is_system = true
), management_role AS (
  SELECT tenant_role.id, tenant_role.tenant_id, tenant_role.template_role_id
    FROM public.tenant_roles AS tenant_role
    JOIN target ON target.id = tenant_role.tenant_id
    JOIN management_template
      ON management_template.id = tenant_role.template_role_id
   WHERE tenant_role.name = 'Management'
     AND tenant_role.is_system = true
     AND tenant_role.is_custom = false
)
SELECT
  (SELECT id::text FROM target ORDER BY id LIMIT 1) AS tenant_id,
  (SELECT id::text FROM owner_account ORDER BY id LIMIT 1) AS owner_user_id,
  (SELECT id::text FROM management_role ORDER BY id LIMIT 1)
    AS management_role_id,
  (SELECT COUNT(*)::integer FROM target) AS slug_tenant_count,
  (SELECT COUNT(*)::integer FROM target
    WHERE plan_key = 'enterprise' AND is_active = true
      AND status IN ('trial', 'active')) AS target_tenant_core_valid_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains
    WHERE domain = $4) AS exact_domain_global_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains
    WHERE domain = $5) AS legacy_domain_global_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains AS domain
    JOIN target ON target.id = domain.tenant_id) AS target_domain_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains AS domain
    JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $4) AS target_exact_domain_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains AS domain
    JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $5) AS target_legacy_domain_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains AS domain
    JOIN target ON target.id = domain.tenant_id
    WHERE domain.is_primary = true) AS target_primary_domain_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains AS domain
    JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $5
      AND domain.type = 'fieldgrid_subdomain'
      AND domain.is_primary = true
      AND domain.verification_status IN ('verified', 'active')
      AND domain.verified_at IS NOT NULL
      AND domain.disabled_at IS NULL) AS target_legacy_ready_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domain_checks AS domain_check
    JOIN public.tenant_domains AS domain
      ON domain.id = domain_check.tenant_domain_id
    JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $5) AS legacy_domain_check_count,
  (SELECT COUNT(*)::integer FROM public.organization_settings AS settings
    JOIN target ON target.id = settings.tenant_id)
    AS organization_settings_count,
  (SELECT COUNT(*)::integer FROM public.tenant_subscriptions AS subscription
    JOIN target ON target.id = subscription.tenant_id
    WHERE subscription.status IN ('trial', 'active'))
    AS active_subscription_count,
  (SELECT COUNT(*)::integer FROM public.tenant_subscriptions AS subscription
    JOIN public.plans AS plan ON plan.id = subscription.plan_id
    JOIN target ON target.id = subscription.tenant_id
    WHERE subscription.status IN ('trial', 'active')
      AND plan.key = 'enterprise' AND plan.is_active = true)
    AS active_enterprise_subscription_count,
  (SELECT COUNT(*)::integer FROM public.website_sites AS site
    JOIN target ON target.id = site.tenant_id) AS website_site_count,
  (SELECT COUNT(*)::integer FROM public.website_domain_bindings AS binding
    JOIN target ON target.id = binding.tenant_id) AS website_binding_count,
  (SELECT COUNT(*)::integer FROM public.website_domain_bindings
    WHERE hostname = $4) AS exact_domain_binding_count,
  (SELECT COUNT(*)::integer FROM public.website_domain_bindings
    WHERE hostname = $5) AS legacy_domain_binding_count,
  (SELECT COUNT(*)::integer FROM owner_account) AS auth_email_count,
  (SELECT COUNT(*)::integer FROM auth.users AS auth_user
    WHERE auth_user.id = $2::uuid
      AND lower(auth_user.email) = lower($3)
      AND auth_user.email_confirmed_at IS NOT NULL
      AND coalesce(length(auth_user.encrypted_password), 0) > 0
      AND auth_user.is_anonymous = false
      AND auth_user.aud = 'authenticated'
      AND auth_user.role = 'authenticated'
      AND auth_user.deleted_at IS NULL
      AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= now()))
    AS auth_core_count,
  (SELECT COUNT(*)::integer FROM auth.users AS auth_user
    WHERE auth_user.id = $2::uuid
      AND lower(auth_user.email) = lower($3)
      AND auth_user.raw_app_meta_data ->> 'fieldgrid_automation_contract' = $6)
    AS auth_contract_count,
  (SELECT COUNT(*)::integer FROM auth.users AS auth_user
    WHERE auth_user.id = $2::uuid
      AND lower(auth_user.email) = lower($3)
      AND auth_user.raw_app_meta_data ->> 'fieldgrid_environment' = 'staging')
    AS auth_environment_count,
  (SELECT COUNT(*)::integer FROM auth.users AS auth_user
    WHERE auth_user.id = $2::uuid
      AND lower(auth_user.email) = lower($3)
      AND auth_user.raw_app_meta_data ->> 'portal' = 'tenant-admin')
    AS auth_portal_count,
  (SELECT COUNT(*)::integer FROM auth.users AS auth_user
    WHERE auth_user.id = $2::uuid
      AND lower(auth_user.email) = lower($3)
      AND auth_user.email_confirmed_at IS NOT NULL
      AND coalesce(length(auth_user.encrypted_password), 0) > 0
      AND auth_user.is_anonymous = false
      AND auth_user.aud = 'authenticated'
      AND auth_user.role = 'authenticated'
      AND auth_user.deleted_at IS NULL
      AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= now())
      AND auth_user.raw_app_meta_data ->> 'fieldgrid_automation_contract' = $6
      AND auth_user.raw_app_meta_data ->> 'fieldgrid_environment' = 'staging'
      AND auth_user.raw_app_meta_data ->> 'portal' = 'tenant-admin')
    AS auth_exact_count,
  (SELECT COUNT(*)::integer FROM auth.identities AS identity
    JOIN owner_account ON owner_account.id = identity.user_id
    WHERE identity.provider = 'email'
      AND lower(identity.identity_data ->> 'email') = lower($3))
    AS email_identity_count,
  (SELECT COUNT(*)::integer FROM public.platform_users AS platform_user
    JOIN owner_account ON owner_account.id = platform_user.user_id)
    AS platform_user_count,
  (SELECT COUNT(*)::integer FROM public.user_roles AS user_role
    JOIN owner_account ON owner_account.id = user_role.user_id)
    AS legacy_user_role_count,
  (SELECT COUNT(*)::integer FROM management_template)
    AS management_template_role_count,
  (SELECT COUNT(*)::integer FROM public.role_permissions AS permission
    JOIN management_template
      ON management_template.id = permission.role_id)
    AS management_template_permission_count,
  (SELECT COUNT(*)::integer FROM management_role)
    AS target_management_role_count,
  (SELECT COUNT(*)::integer FROM public.tenant_role_permissions AS permission
    JOIN management_role
      ON management_role.id = permission.tenant_role_id)
    AS target_management_permission_count,
  (SELECT COUNT(*)::integer FROM public.role_permissions AS expected
    JOIN management_template ON management_template.id = expected.role_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tenant_role_permissions AS actual
       JOIN management_role ON management_role.id = actual.tenant_role_id
       WHERE actual.permission_id = expected.permission_id
    )) AS management_missing_permission_count,
  (SELECT COUNT(*)::integer FROM public.tenant_role_permissions AS actual
    JOIN management_role ON management_role.id = actual.tenant_role_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.role_permissions AS expected
       JOIN management_template ON management_template.id = expected.role_id
       WHERE expected.permission_id = actual.permission_id
    )) AS management_extra_permission_count,
  (SELECT COUNT(*)::integer FROM public.tenant_users AS membership
    JOIN owner_account ON owner_account.id = membership.user_id)
    AS owner_global_membership_count,
  (SELECT COUNT(*)::integer FROM public.tenant_users AS membership
    JOIN owner_account ON owner_account.id = membership.user_id
    JOIN target ON target.id = membership.tenant_id)
    AS owner_target_membership_count,
  (SELECT COUNT(*)::integer FROM public.tenant_users AS membership
    JOIN owner_account ON owner_account.id = membership.user_id
    JOIN target ON target.id = membership.tenant_id
    WHERE membership.role = 'owner' AND membership.status = 'active')
    AS owner_target_exact_active_count,
  (SELECT COUNT(*)::integer FROM public.tenant_users AS membership
    JOIN target ON target.id = membership.tenant_id
    WHERE membership.role = 'owner') AS target_any_owner_count,
  (SELECT COUNT(*)::integer FROM public.tenant_users AS membership
    JOIN target ON target.id = membership.tenant_id
    WHERE membership.role = 'owner' AND membership.status = 'active')
    AS target_active_owner_count,
  (SELECT COUNT(*)::integer FROM public.tenant_user_roles AS user_role
    JOIN owner_account ON owner_account.id = user_role.user_id)
    AS owner_global_role_link_count,
  (SELECT COUNT(*)::integer FROM public.tenant_user_roles AS user_role
    JOIN owner_account ON owner_account.id = user_role.user_id
    JOIN target ON target.id = user_role.tenant_id)
    AS owner_target_role_link_count,
  (SELECT COUNT(*)::integer FROM public.tenant_user_roles AS user_role
    JOIN owner_account ON owner_account.id = user_role.user_id
    JOIN management_role
      ON management_role.id = user_role.tenant_role_id
     AND management_role.tenant_id = user_role.tenant_id)
    AS owner_target_management_link_count,
  (SELECT COUNT(*)::integer FROM public.tenant_user_roles AS user_role
    JOIN owner_account ON owner_account.id = user_role.user_id
    JOIN target ON target.id = user_role.tenant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM management_role
       WHERE management_role.id = user_role.tenant_role_id
         AND management_role.tenant_id = user_role.tenant_id
    )) AS owner_target_nonmanagement_link_count`;

export async function loadFieldDemoOwnerBindingSnapshot(
  queryable: Queryable,
): Promise<FieldDemoOwnerBindingSnapshot> {
  const result = await queryable.query<FieldDemoOwnerBindingSnapshot>(
    FIELD_DEMO_OWNER_BINDING_SNAPSHOT_QUERY,
    [
      FIELD_DEMO_SLUG,
      FIELD_DEMO_RETAINED_OWNER_ID,
      FIELD_DEMO_OWNER_EMAIL,
      FIELD_DEMO_HOST,
      LEGACY_FIELD_DEMO_HOST,
      OWNER_AUTH_REPAIR_VERSION,
    ],
  );
  if (result.rows.length !== 1) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "Field-demo owner-binding snapshot is not singular.",
      "owner_binding_precondition",
      "tenant-identity-invalid",
    );
  }
  return result.rows[0]!;
}

export const FIELD_DEMO_OWNER_PLATFORM_PRIVILEGE_QUERY = `WITH owner_account AS (
  SELECT auth_user.id
    FROM auth.users AS auth_user
   WHERE auth_user.id = $1::uuid
     AND lower(auth_user.email) = lower($2)
), owner_platform_user AS (
  SELECT platform_user.id, platform_user.role, platform_user.status
    FROM public.platform_users AS platform_user
    JOIN owner_account ON owner_account.id = platform_user.user_id
), owner_platform_grant AS (
  SELECT support_grant.id, support_grant.revoked_at,
         support_grant.starts_at, support_grant.expires_at,
         support_grant.tenant_id
    FROM public.support_access_grants AS support_grant
    JOIN owner_platform_user
      ON owner_platform_user.id = support_grant.platform_user_id
), owner_platform_audit AS (
  SELECT audit.action
    FROM public.audit_log AS audit
    JOIN owner_platform_user
      ON audit.resource_id = owner_platform_user.id::text
   WHERE audit.tenant_id IS NULL
     AND audit.resource = 'platform_users'
), expected_direct_fk(table_name, column_name, delete_action) AS (
  VALUES
    ('support_access_grants'::text, 'platform_user_id'::text, 'c'::text),
    ('support_access_audit_log', 'platform_user_id', 'c'),
    ('tenant_domains', 'created_by_platform_user_id', 'n'),
    ('tenant_domains', 'verified_by_platform_user_id', 'n'),
    ('platform_tickets', 'assignee_platform_user_id', 'n'),
    ('platform_tickets', 'created_by_platform_user_id', 'n'),
    ('platform_ticket_notes', 'author_platform_user_id', 'n'),
    ('platform_notification_dispatches', 'created_by_platform_user_id', 'n'),
    ('platform_notification_recipients', 'platform_user_id', 'n')
), expected_indirect_fk(table_name, column_name, delete_action) AS (
  VALUES
    ('support_access_audit_log'::text, 'grant_id'::text, 'n'::text),
    ('platform_tickets', 'support_grant_id', 'n')
), expected_set_null_fk(table_name, column_name) AS (
  SELECT table_name, column_name
    FROM expected_direct_fk
   WHERE delete_action = 'n'
  UNION ALL
  SELECT table_name, column_name
    FROM expected_indirect_fk
   WHERE delete_action = 'n'
), deletion_trigger_target(table_name, event_mask) AS (
  VALUES
    ('platform_users'::text, 8::integer),
    ('support_access_grants', 8),
    ('support_access_audit_log', 8),
    ('support_access_audit_log', 16),
    ('tenant_domains', 16),
    ('platform_tickets', 16),
    ('platform_ticket_notes', 16),
    ('platform_notification_dispatches', 16),
    ('platform_notification_recipients', 16)
)
SELECT
  (SELECT COUNT(*)::integer FROM owner_account) AS auth_email_count,
  (SELECT COUNT(*)::integer FROM auth.users AS auth_user
    WHERE auth_user.id = $1::uuid
      AND lower(auth_user.email) = lower($2)
      AND auth_user.raw_app_meta_data ->> 'fieldgrid_automation_contract' = $4)
    AS auth_contract_count,
  (SELECT COUNT(*)::integer FROM auth.users AS auth_user
    WHERE auth_user.id = $1::uuid
      AND lower(auth_user.email) = lower($2)
      AND auth_user.raw_app_meta_data ->> 'fieldgrid_environment' = 'staging')
    AS auth_environment_count,
  (SELECT COUNT(*)::integer FROM auth.users AS auth_user
    WHERE auth_user.id = $1::uuid
      AND lower(auth_user.email) = lower($2)
      AND auth_user.raw_app_meta_data ->> 'portal' = 'tenant-admin')
    AS auth_tenant_portal_count,
  (SELECT COUNT(*)::integer FROM auth.users AS auth_user
    WHERE auth_user.id = $1::uuid
      AND lower(auth_user.email) = lower($2)
      AND auth_user.raw_app_meta_data ->> 'portal' = 'platform-admin')
    AS auth_platform_portal_count,
  (SELECT COUNT(*)::integer FROM owner_platform_user) AS platform_user_count,
  (SELECT COUNT(*)::integer FROM owner_platform_user
    WHERE status = 'active') AS platform_user_active_count,
  (SELECT COUNT(*)::integer FROM owner_platform_user
    WHERE status = 'inactive') AS platform_user_inactive_count,
  (SELECT COUNT(*)::integer FROM owner_platform_user
    WHERE status = 'suspended') AS platform_user_suspended_count,
  (SELECT COUNT(*)::integer FROM owner_platform_user
    WHERE role = 'owner') AS platform_user_owner_role_count,
  (SELECT COUNT(*)::integer FROM owner_platform_user
    WHERE role = 'admin') AS platform_user_admin_role_count,
  (SELECT COUNT(*)::integer FROM owner_platform_user
    WHERE role = 'support') AS platform_user_support_role_count,
  (SELECT COUNT(*)::integer FROM public.platform_users AS platform_user
    WHERE platform_user.status = 'active'
      AND platform_user.role = 'owner'
      AND NOT EXISTS (
        SELECT 1 FROM owner_account
         WHERE owner_account.id = platform_user.user_id
      )) AS other_active_platform_owner_count,
  (SELECT COUNT(*)::integer FROM public.platform_users AS platform_user
    WHERE platform_user.status = 'active'
      AND platform_user.role = 'admin'
      AND NOT EXISTS (
        SELECT 1 FROM owner_account
         WHERE owner_account.id = platform_user.user_id
      )) AS other_active_platform_admin_count,
  (CASE WHEN $3::uuid IS NULL THEN 0 ELSE 1 END)::integer
    AS configured_actor_provided_count,
  (SELECT COUNT(*)::integer FROM owner_account
    WHERE owner_account.id = $3::uuid)
    AS configured_actor_matches_owner_count,
  (SELECT COUNT(*)::integer FROM public.platform_users AS platform_user
    WHERE platform_user.user_id = $3::uuid
      AND platform_user.status = 'active'
      AND platform_user.role IN ('owner', 'admin'))
    AS configured_actor_eligible_count,
  (SELECT COUNT(*)::integer FROM owner_platform_grant)
    AS platform_support_grant_count,
  (SELECT COUNT(*)::integer FROM owner_platform_grant
    WHERE revoked_at IS NULL AND starts_at <= now() AND expires_at > now())
    AS platform_current_support_grant_count,
  (SELECT COUNT(*)::integer FROM owner_platform_grant AS support_grant
    JOIN public.tenants AS tenant ON tenant.id = support_grant.tenant_id
    WHERE support_grant.revoked_at IS NULL
      AND support_grant.starts_at <= now()
      AND support_grant.expires_at > now()
      AND tenant.is_active IS TRUE
      AND tenant.status IN ('trial', 'active'))
    AS platform_current_runtime_support_grant_count,
  (SELECT COUNT(*)::integer FROM owner_platform_grant
    WHERE revoked_at IS NULL AND starts_at > now() AND expires_at > now())
    AS platform_future_support_grant_count,
  (SELECT COUNT(*)::integer FROM public.support_access_audit_log AS audit
    JOIN owner_platform_user
      ON owner_platform_user.id = audit.platform_user_id)
    AS platform_support_actor_audit_count,
  (SELECT COUNT(*)::integer
    FROM public.platform_notification_recipients AS recipient
    JOIN owner_platform_user
      ON owner_platform_user.id = recipient.platform_user_id)
    AS platform_recipient_reference_count,
  (SELECT COUNT(*)::integer
    FROM public.platform_notification_recipients AS recipient
    JOIN owner_platform_user
      ON owner_platform_user.id = recipient.platform_user_id
    JOIN owner_account
      ON owner_account.id = recipient.recipient_user_id
   WHERE recipient.recipient_type = 'platform_user'
     AND recipient.tenant_id IS NULL
     AND recipient.tenant_owner_invite_id IS NULL
     AND recipient.delivery_status IN ('sent', 'skipped', 'failed'))
    AS platform_recipient_snapshot_count,
  (SELECT COUNT(*)::integer
    FROM public.platform_notification_recipients AS recipient
    JOIN owner_platform_user
      ON owner_platform_user.id = recipient.platform_user_id
   WHERE recipient.recipient_type IS DISTINCT FROM 'platform_user'
      OR recipient.tenant_id IS NOT NULL
      OR recipient.tenant_owner_invite_id IS NOT NULL
      OR recipient.delivery_status NOT IN ('sent', 'skipped', 'failed')
      OR NOT EXISTS (
        SELECT 1 FROM owner_account
         WHERE owner_account.id = recipient.recipient_user_id
      ))
    AS platform_blocking_reference_count,
  ((SELECT COUNT(*)::integer FROM public.tenant_domains AS domain
      JOIN owner_platform_user ON owner_platform_user.id IN (
        domain.created_by_platform_user_id,
        domain.verified_by_platform_user_id
      )) +
   (SELECT COUNT(*)::integer FROM public.platform_tickets AS ticket
      JOIN owner_platform_user ON owner_platform_user.id IN (
        ticket.assignee_platform_user_id,
        ticket.created_by_platform_user_id
      )) +
   (SELECT COUNT(*)::integer FROM public.platform_ticket_notes AS note
      JOIN owner_platform_user
        ON owner_platform_user.id = note.author_platform_user_id) +
   (SELECT COUNT(*)::integer
      FROM public.platform_notification_dispatches AS notification
      JOIN owner_platform_user
        ON owner_platform_user.id = notification.created_by_platform_user_id) +
   (SELECT COUNT(*)::integer FROM public.support_access_audit_log AS audit
      JOIN owner_platform_grant ON owner_platform_grant.id = audit.grant_id
     WHERE NOT EXISTS (
       SELECT 1 FROM owner_platform_user
        WHERE owner_platform_user.id = audit.platform_user_id
     )) +
   (SELECT COUNT(*)::integer FROM public.platform_tickets AS ticket
      JOIN owner_platform_grant
        ON owner_platform_grant.id = ticket.support_grant_id) +
   (SELECT COUNT(*)::integer
      FROM public.platform_notification_recipients AS recipient
      JOIN owner_platform_user
        ON owner_platform_user.id = recipient.platform_user_id
     WHERE recipient.recipient_type IS DISTINCT FROM 'platform_user'))
    AS platform_nonrecipient_set_null_reference_count,
  ((SELECT COUNT(*)::integer FROM public.tenant_domains AS domain
      JOIN owner_platform_user ON owner_platform_user.id IN (
        domain.created_by_platform_user_id,
        domain.verified_by_platform_user_id
      )) +
   (SELECT COUNT(*)::integer FROM public.platform_tickets AS ticket
      JOIN owner_platform_user ON owner_platform_user.id IN (
        ticket.assignee_platform_user_id,
        ticket.created_by_platform_user_id
      )) +
   (SELECT COUNT(*)::integer FROM public.platform_ticket_notes AS note
      JOIN owner_platform_user
        ON owner_platform_user.id = note.author_platform_user_id) +
   (SELECT COUNT(*)::integer
      FROM public.platform_notification_dispatches AS notification
      JOIN owner_platform_user
        ON owner_platform_user.id = notification.created_by_platform_user_id) +
   (SELECT COUNT(*)::integer FROM public.support_access_audit_log AS audit
      JOIN owner_platform_grant ON owner_platform_grant.id = audit.grant_id
     WHERE NOT EXISTS (
       SELECT 1 FROM owner_platform_user
        WHERE owner_platform_user.id = audit.platform_user_id
     )) +
   (SELECT COUNT(*)::integer FROM public.platform_tickets AS ticket
      JOIN owner_platform_grant
        ON owner_platform_grant.id = ticket.support_grant_id) +
   (SELECT COUNT(*)::integer
      FROM public.platform_notification_recipients AS recipient
      JOIN owner_platform_user
        ON owner_platform_user.id = recipient.platform_user_id
     WHERE recipient.recipient_type IS DISTINCT FROM 'platform_user'
        OR (
          recipient.recipient_type = 'platform_user'
          AND recipient.tenant_id IS NULL
          AND recipient.tenant_owner_invite_id IS NULL
          AND recipient.delivery_status IN ('sent', 'skipped', 'failed')
          AND EXISTS (
            SELECT 1 FROM owner_account
             WHERE owner_account.id = recipient.recipient_user_id
          )
        )))
    AS platform_set_null_reference_count,
  (SELECT COUNT(*)::integer FROM owner_platform_audit)
    AS platform_audit_event_count,
  (SELECT COUNT(*)::integer FROM owner_platform_audit
    WHERE action = 'platform_user_invited') AS platform_invite_event_count,
  (SELECT COUNT(*)::integer FROM owner_platform_audit
    WHERE action = 'platform_user_created') AS platform_create_event_count,
  (SELECT COUNT(*)::integer FROM pg_catalog.pg_constraint AS fk
    WHERE fk.contype = 'f'
      AND fk.confrelid = 'public.platform_users'::regclass)
    AS direct_platform_fk_count,
  (SELECT COUNT(*)::integer
     FROM expected_direct_fk AS expected
    WHERE 1 = (
      SELECT COUNT(*)
        FROM pg_catalog.pg_namespace AS namespace
        JOIN pg_catalog.pg_class AS child_table
          ON child_table.relnamespace = namespace.oid
         AND child_table.relname = expected.table_name
        JOIN pg_catalog.pg_attribute AS child_column
          ON child_column.attrelid = child_table.oid
         AND child_column.attname = expected.column_name
         AND child_column.attisdropped = false
        JOIN pg_catalog.pg_constraint AS fk
          ON fk.contype = 'f'
         AND fk.convalidated = true
         AND fk.condeferrable = false
         AND fk.conrelid = child_table.oid
         AND fk.confrelid = 'public.platform_users'::regclass
         AND cardinality(fk.conkey) = 1
         AND fk.conkey[1] = child_column.attnum
         AND cardinality(fk.confkey) = 1
         AND fk.confmatchtype = 's'
         AND fk.confupdtype = 'a'
         AND fk.confdeltype::text = expected.delete_action
        JOIN pg_catalog.pg_attribute AS parent_column
          ON parent_column.attrelid = fk.confrelid
         AND parent_column.attnum = fk.confkey[1]
         AND parent_column.attname = 'id'
         AND parent_column.attisdropped = false
       WHERE namespace.nspname = 'public'))
    AS exact_direct_platform_fk_count,
  (SELECT COUNT(*)::integer FROM pg_catalog.pg_constraint AS fk
    WHERE fk.contype = 'f'
      AND fk.confrelid = 'public.support_access_grants'::regclass)
    AS indirect_grant_fk_count,
  (SELECT COUNT(*)::integer
     FROM expected_indirect_fk AS expected
    WHERE 1 = (
      SELECT COUNT(*)
        FROM pg_catalog.pg_namespace AS namespace
        JOIN pg_catalog.pg_class AS child_table
          ON child_table.relnamespace = namespace.oid
         AND child_table.relname = expected.table_name
        JOIN pg_catalog.pg_attribute AS child_column
          ON child_column.attrelid = child_table.oid
         AND child_column.attname = expected.column_name
         AND child_column.attisdropped = false
        JOIN pg_catalog.pg_constraint AS fk
          ON fk.contype = 'f'
         AND fk.convalidated = true
         AND fk.condeferrable = false
         AND fk.conrelid = child_table.oid
         AND fk.confrelid = 'public.support_access_grants'::regclass
         AND cardinality(fk.conkey) = 1
         AND fk.conkey[1] = child_column.attnum
         AND cardinality(fk.confkey) = 1
         AND fk.confmatchtype = 's'
         AND fk.confupdtype = 'a'
         AND fk.confdeltype::text = expected.delete_action
        JOIN pg_catalog.pg_attribute AS parent_column
          ON parent_column.attrelid = fk.confrelid
         AND parent_column.attnum = fk.confkey[1]
         AND parent_column.attname = 'id'
         AND parent_column.attisdropped = false
       WHERE namespace.nspname = 'public'))
    AS exact_indirect_grant_fk_count,
  (SELECT COUNT(*)::integer
     FROM expected_set_null_fk AS expected
    WHERE 1 = (
      SELECT COUNT(*)
        FROM pg_catalog.pg_namespace AS namespace
        JOIN pg_catalog.pg_class AS child_table
          ON child_table.relnamespace = namespace.oid
         AND child_table.relname = expected.table_name
        JOIN pg_catalog.pg_attribute AS child_column
          ON child_column.attrelid = child_table.oid
         AND child_column.attname = expected.column_name
         AND child_column.attisdropped = false
         AND child_column.attnotnull = false
       WHERE namespace.nspname = 'public'))
    AS exact_set_null_nullable_column_count,
  (SELECT COUNT(*)::integer FROM pg_catalog.pg_constraint AS check_constraint
    WHERE check_constraint.contype = 'c'
      AND check_constraint.convalidated = true
      AND check_constraint.conname =
        'platform_notification_recipients_scope_check'
      AND check_constraint.conrelid =
        'public.platform_notification_recipients'::regclass
      AND regexp_replace(
        lower(pg_catalog.pg_get_expr(
          check_constraint.conbin,
          check_constraint.conrelid,
          false
        )),
        '[[:space:]]+',
        '',
        'g'
      ) = $scope$((((recipient_type)::text='platform_user'::text)and(tenant_idisnull)and(tenant_owner_invite_idisnull)and(recipient_user_idisnotnull)and((platform_user_idisnotnull)or((delivery_status)::text=any((array['sent'::charactervarying,'skipped'::charactervarying,'failed'::charactervarying])::text[]))))or(((recipient_type)::text='tenant_owner'::text)and(platform_user_idisnull)and(tenant_slugisnotnull)and((tenant_owner_invite_idisnotnull)or(recipient_emailisnotnull))and((tenant_idisnotnull)or((delivery_status)::text=any((array['sent'::charactervarying,'skipped'::charactervarying,'failed'::charactervarying])::text[])))))$scope$)
    AS recipient_scope_check_count,
  (SELECT COUNT(*)::integer
     FROM (
       VALUES
         ('platform_users_owner_continuity_update'::name, 19::integer),
         ('platform_users_owner_continuity_delete'::name, 11::integer)
     ) AS expected_trigger(trigger_name, trigger_type)
     JOIN pg_catalog.pg_trigger AS trigger_row
       ON trigger_row.tgname = expected_trigger.trigger_name
      AND trigger_row.tgrelid = 'public.platform_users'::regclass
      AND trigger_row.tgfoid =
        'public.fieldgrid_enforce_platform_owner_continuity()'::regprocedure
      AND trigger_row.tgtype::integer = expected_trigger.trigger_type
      AND trigger_row.tgenabled = 'O'
      AND trigger_row.tgisinternal = false
     JOIN pg_catalog.pg_proc AS function_row
       ON function_row.oid = trigger_row.tgfoid
      AND function_row.prosecdef = true
      AND function_row.proconfig =
        ARRAY['search_path=pg_catalog, public']::text[])
    AS platform_owner_continuity_trigger_count,
  (SELECT COUNT(DISTINCT check_constraint.oid)::integer
     FROM expected_set_null_fk AS expected
     JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.nspname = 'public'
     JOIN pg_catalog.pg_class AS child_table
       ON child_table.relnamespace = namespace.oid
      AND child_table.relname = expected.table_name
     JOIN pg_catalog.pg_constraint AS check_constraint
       ON check_constraint.conrelid = child_table.oid
      AND check_constraint.contype = 'c'
    WHERE lower(pg_catalog.pg_get_expr(
            check_constraint.conbin,
            check_constraint.conrelid,
            false
          )) ~ (
            '(^|[^a-z0-9_])' || expected.column_name ||
            '([^a-z0-9_]|$)'
          )
      AND NOT (
        expected.table_name = 'platform_notification_recipients'
        AND expected.column_name = 'platform_user_id'
        AND check_constraint.conname =
          'platform_notification_recipients_scope_check'
      )) AS unexpected_set_null_check_count,
  (SELECT COUNT(DISTINCT trigger_row.oid)::integer
     FROM deletion_trigger_target AS target
     JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.nspname = 'public'
     JOIN pg_catalog.pg_class AS affected_table
       ON affected_table.relnamespace = namespace.oid
      AND affected_table.relname = target.table_name
     JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgrelid = affected_table.oid
      AND trigger_row.tgisinternal = false
      AND (trigger_row.tgtype::integer & target.event_mask) =
        target.event_mask
    WHERE NOT (
      affected_table.relname = 'platform_users'
      AND trigger_row.tgname = 'platform_users_owner_continuity_delete'
      AND trigger_row.tgfoid =
        'public.fieldgrid_enforce_platform_owner_continuity()'::regprocedure
      AND trigger_row.tgtype::integer = 11
      AND trigger_row.tgenabled = 'O'
    ))
    AS unexpected_deletion_path_trigger_count`;

export async function loadFieldDemoOwnerPlatformPrivilegeSnapshot(
  queryable: Queryable,
  configuredAutomationActor: string | null,
): Promise<FieldDemoOwnerPlatformPrivilegeSnapshot> {
  const result = await queryable.query<FieldDemoOwnerPlatformPrivilegeSnapshot>(
    FIELD_DEMO_OWNER_PLATFORM_PRIVILEGE_QUERY,
    [
      FIELD_DEMO_RETAINED_OWNER_ID,
      FIELD_DEMO_OWNER_EMAIL,
      configuredAutomationActor,
      OWNER_AUTH_REPAIR_VERSION,
    ],
  );
  if (result.rows.length !== 1) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "Field-demo owner platform-privilege snapshot is not singular.",
      "owner_binding_precondition",
      "auth-owner-platform-privilege-present",
    );
  }
  return result.rows[0]!;
}

function metadataRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function loadFieldDemoPlatformPrivilegeRepairTarget(
  queryable: Queryable,
): Promise<FieldDemoPlatformPrivilegeRepairTarget> {
  const result = await queryable.query<{
    user_id: string;
    platform_user_id: string | null;
    platform_role: string | null;
    platform_status: string | null;
    raw_app_meta_data: unknown;
  }>(
    `SELECT auth_user.id::text AS user_id,
            platform_user.id::text AS platform_user_id,
            platform_user.role AS platform_role,
            platform_user.status AS platform_status,
            auth_user.raw_app_meta_data
       FROM auth.users AS auth_user
       LEFT JOIN public.platform_users AS platform_user
         ON platform_user.user_id = auth_user.id
      WHERE auth_user.id = $1::uuid
        AND lower(auth_user.email) = lower($2)
      ORDER BY auth_user.id, platform_user.id`,
    [FIELD_DEMO_RETAINED_OWNER_ID, FIELD_DEMO_OWNER_EMAIL],
  );
  const row = result.rows[0];
  const appMetadata = metadataRecord(row?.raw_app_meta_data);
  const platformStateIsValid =
    row?.platform_user_id === null
      ? row.platform_role === null && row.platform_status === null
      : UUID_PATTERN.test(row?.platform_user_id ?? "") &&
        typeof row?.platform_role === "string" &&
        typeof row?.platform_status === "string";
  if (
    result.rowCount !== 1 ||
    result.rows.length !== 1 ||
    !row ||
    row.user_id.toLowerCase() !== FIELD_DEMO_RETAINED_OWNER_ID ||
    !platformStateIsValid ||
    !appMetadata
  ) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "Field-demo owner Auth metadata is not singular.",
      "platform_privilege_precondition",
      "auth-owner-invalid",
    );
  }
  return {
    userId: row.user_id,
    platformUserId: row.platform_user_id,
    platformRole: row.platform_role,
    platformStatus: row.platform_status,
    appMetadata,
  };
}

function exactIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

export function fieldDemoOwnerAuthMetadataIsNormalized(
  target: FieldDemoPlatformPrivilegeRepairTarget,
  revokedAt?: string,
): boolean {
  const actualRevokedAt = target.appMetadata["session_revoked_at"];
  return (
    target.userId.toLowerCase() === FIELD_DEMO_RETAINED_OWNER_ID &&
    target.appMetadata["portal"] === "tenant-admin" &&
    target.appMetadata["fieldgrid_automation_contract"] ===
      OWNER_AUTH_REPAIR_VERSION &&
    target.appMetadata["fieldgrid_environment"] === "staging" &&
    target.appMetadata["fieldgrid_platform_privilege_repair"] ===
      PLATFORM_PRIVILEGE_AUTH_REPAIR_VERSION &&
    exactIsoTimestamp(actualRevokedAt) &&
    (revokedAt === undefined || actualRevokedAt === revokedAt) &&
    !("platform_role" in target.appMetadata)
  );
}

async function fieldDemoOwnerAuthUpdateFetch(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  fetchImplementation: typeof fetch = fetch,
): Promise<Response> {
  try {
    return await fetchImplementation(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}

async function normalizeFieldDemoOwnerAuthMetadata(
  environment: OwnerBindingEnvironment,
  target: FieldDemoPlatformPrivilegeRepairTarget,
  revokedAt: string,
): Promise<FieldDemoOwnerAuthUpdateOutcome> {
  const serviceCredential = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const response = await fieldDemoOwnerAuthUpdateFetch(
    new URL(
      `/auth/v1/admin/users/${encodeURIComponent(target.userId)}`,
      FIELD_DEMO_OWNER_BINDING_SUPABASE_URL,
    ),
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        apikey: serviceCredential,
        authorization: `Bearer ${serviceCredential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        app_metadata: fieldDemoOwnerAuthMetadataPatch(revokedAt),
      }),
    },
  );
  return fieldDemoOwnerAuthUpdateOutcome(response);
}

async function waitForFieldDemoOwnerAuthPostimage(
  queryable: Queryable,
  revokedAt: string,
): Promise<FieldDemoPlatformPrivilegeRepairTarget | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const target = await loadFieldDemoPlatformPrivilegeRepairTarget(queryable);
    if (fieldDemoOwnerAuthMetadataIsNormalized(target, revokedAt)) {
      return target;
    }
    if (attempt < 4) await delay(250 * (attempt + 1));
  }
  return null;
}

type ReviewedSqlMigration = {
  name: string;
  hash: string;
  sql: string;
};

type SqlMigrationHistoryRecord = {
  name: string;
  hash: string;
  baselined: boolean;
  appliedAt: Date | string;
};

function reviewedSqlMigrationHash(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n/gu, "\n")).digest("hex");
}

async function loadPlatformPrivilegeMigrationFrontier(): Promise<{
  committed: ReviewedSqlMigration[];
  predecessors: ReviewedSqlMigration[];
  required: ReviewedSqlMigration[];
  successors: ReadonlySet<string>;
  legacyNames: ReadonlySet<string>;
  historical: ReadonlyMap<
    string,
    {
      kind: "renamed" | "tombstone";
      canonicalName: string | null;
      hash: string;
    }
  >;
}> {
  const migrationsDir = join(repoRoot, "lib", "db", "migrations");
  const names = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\d+.*\.sql$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const firstRequiredName = PLATFORM_PRIVILEGE_REQUIRED_MIGRATION_NAMES[0];
  const finalRequiredName = PLATFORM_PRIVILEGE_REQUIRED_MIGRATION_NAMES.at(-1);
  const firstRequiredIndex = names.indexOf(firstRequiredName);
  const finalRequiredIndex = finalRequiredName
    ? names.indexOf(finalRequiredName)
    : -1;
  if (firstRequiredIndex < 0 || finalRequiredIndex < firstRequiredIndex) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "Reviewed platform-privilege migrations are absent from the SQL frontier.",
      "platform_privilege_precondition",
    );
  }
  const requiredNames = names.slice(firstRequiredIndex, finalRequiredIndex + 1);
  if (
    requiredNames.length !==
      PLATFORM_PRIVILEGE_REQUIRED_MIGRATION_NAMES.length ||
    requiredNames.some(
      (name, index) =>
        name !== PLATFORM_PRIVILEGE_REQUIRED_MIGRATION_NAMES[index],
    )
  ) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "Reviewed platform-privilege migration frontier is ambiguous.",
      "platform_privilege_precondition",
    );
  }
  const migrations = await Promise.all(
    names.map(async (name) => {
      const sql = await readFile(join(migrationsDir, name), "utf8");
      return { name, hash: reviewedSqlMigrationHash(sql), sql };
    }),
  );
  return {
    committed: migrations,
    predecessors: migrations.slice(0, firstRequiredIndex),
    required: migrations.slice(firstRequiredIndex, finalRequiredIndex + 1),
    successors: new Set(names.slice(finalRequiredIndex + 1)),
    legacyNames: new Set(
      names.filter(
        (name) =>
          /^\d{3}_[a-z0-9][a-z0-9_]*\.sql$/u.test(name) ||
          PLATFORM_PRIVILEGE_LEGACY_TIMESTAMP_MIGRATION_NAMES.has(name),
      ),
    ),
    historical: PLATFORM_PRIVILEGE_HISTORICAL_MIGRATIONS,
  };
}

function migrationHistoryTimestamp(record: SqlMigrationHistoryRecord): number {
  const timestamp =
    record.appliedAt instanceof Date
      ? record.appliedAt.getTime()
      : Date.parse(record.appliedAt);
  if (!Number.isFinite(timestamp)) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "SQL migration history contains an invalid application timestamp.",
      "platform_privilege_precondition",
    );
  }
  return timestamp;
}

export function assertPlatformPrivilegeMigrationFrontier(
  frontier: Awaited<ReturnType<typeof loadPlatformPrivilegeMigrationFrontier>>,
  records: SqlMigrationHistoryRecord[],
): ReviewedSqlMigration[] {
  const duplicateNames = records
    .map((record) => record.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length > 0) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "SQL migration history contains duplicate entries.",
      "platform_privilege_precondition",
    );
  }

  const committedByName = new Map(
    frontier.committed.map((migration) => [migration.name, migration]),
  );
  const historicalCanonicalNames = new Set(
    [...frontier.historical.values()]
      .map((migration) => migration.canonicalName)
      .filter((name): name is string => name !== null),
  );
  const normalizedHistory: string[] = [];
  const canonicalEquivalents = new Set<string>();
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  let previousName = "";
  for (const record of records) {
    const appliedAt = migrationHistoryTimestamp(record);
    if (
      appliedAt < previousTimestamp ||
      (appliedAt === previousTimestamp &&
        record.name.localeCompare(previousName) < 0)
    ) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_precondition_invalid",
        "SQL migration history is not ordered by application time.",
        "platform_privilege_precondition",
      );
    }
    previousTimestamp = appliedAt;
    previousName = record.name;

    const committed = committedByName.get(record.name);
    const historical = frontier.historical.get(record.name);
    if (!committed && !historical) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_precondition_invalid",
        "SQL migration history contains an unreviewed entry.",
        "platform_privilege_precondition",
      );
    }
    if (record.hash !== (committed?.hash ?? historical?.hash)) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_precondition_invalid",
        "SQL migration history contains source-hash drift.",
        "platform_privilege_precondition",
      );
    }
    if (
      record.baselined &&
      (historical?.kind === "renamed" ||
        (committed && !frontier.legacyNames.has(record.name)))
    ) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_precondition_invalid",
        "A modern SQL migration was baselined without execution.",
        "platform_privilege_precondition",
      );
    }

    if (historical) {
      if (historical.kind === "tombstone") continue;
      if (
        historical.canonicalName &&
        !canonicalEquivalents.has(historical.canonicalName)
      ) {
        normalizedHistory.push(historical.canonicalName);
        canonicalEquivalents.add(historical.canonicalName);
      }
      continue;
    }
    if (
      historicalCanonicalNames.has(record.name) &&
      canonicalEquivalents.has(record.name)
    ) {
      continue;
    }
    normalizedHistory.push(record.name);
  }

  const recordsByName = new Map(records.map((record) => [record.name, record]));
  for (const legacyName of frontier.legacyNames) {
    if (!recordsByName.has(legacyName)) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_precondition_invalid",
        "SQL migration history is missing a required legacy entry.",
        "platform_privilege_precondition",
      );
    }
  }
  const expectedModern = frontier.committed
    .map((migration) => migration.name)
    .filter((name) => !frontier.legacyNames.has(name));
  const recordedModern = normalizedHistory.filter(
    (name) => !frontier.legacyNames.has(name),
  );
  if (
    recordedModern.length > expectedModern.length ||
    recordedModern.some((name, index) => name !== expectedModern[index])
  ) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "SQL migration history is not a contiguous committed prefix.",
      "platform_privilege_precondition",
    );
  }
  for (const migration of frontier.predecessors) {
    const record = recordsByName.get(migration.name);
    if (!record || record.hash !== migration.hash) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_precondition_invalid",
        "SQL migration history does not match the reviewed predecessor frontier.",
        "platform_privilege_precondition",
      );
    }
  }

  let firstPendingIndex = -1;
  for (const [index, migration] of frontier.required.entries()) {
    const record = recordsByName.get(migration.name);
    if (!record) {
      if (firstPendingIndex < 0) firstPendingIndex = index;
      continue;
    }
    if (record.hash !== migration.hash || record.baselined) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_precondition_invalid",
        "Platform-privilege migration record does not match reviewed source.",
        "platform_privilege_precondition",
      );
    }
    if (firstPendingIndex >= 0) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_precondition_invalid",
        "A platform-privilege migration is missing behind the recorded required frontier.",
        "platform_privilege_precondition",
      );
    }
  }

  if (firstPendingIndex < 0) return [];

  const finalRequiredMigration = frontier.required.at(-1);
  if (
    !finalRequiredMigration ||
    records.some(
      (record) =>
        frontier.successors.has(record.name) ||
        record.name.localeCompare(finalRequiredMigration.name) > 0,
    )
  ) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "A platform-privilege migration is missing behind the recorded SQL frontier.",
      "platform_privilege_precondition",
    );
  }
  return frontier.required.slice(firstPendingIndex);
}

export async function applyExactPlatformPrivilegePrerequisiteMigrations(
  queryable: Queryable,
): Promise<boolean> {
  const frontier = await loadPlatformPrivilegeMigrationFrontier();
  let migrationLockAcquired = false;
  let migrationTransactionStarted = false;
  try {
    const lock = await queryable.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired`,
      [DATABASE_MIGRATION_LOCK_KEY],
    );
    if (lock.rows.length !== 1 || lock.rows[0]?.acquired !== true) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_lock_unavailable",
        "Database migration lock is unavailable.",
        "database_transaction",
      );
    }
    migrationLockAcquired = true;

    const historyTable = await queryable.query<{
      history_table: string | null;
    }>(
      `SELECT to_regclass('drizzle.veele_sql_migrations')::text AS history_table`,
    );
    if (
      historyTable.rows.length !== 1 ||
      historyTable.rows[0]?.history_table !== "drizzle.veele_sql_migrations"
    ) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_precondition_invalid",
        "SQL migration history is unavailable.",
        "platform_privilege_precondition",
      );
    }

    const recorded = await queryable.query<SqlMigrationHistoryRecord>(
      `SELECT name, hash, baselined, applied_at AS "appliedAt"
         FROM drizzle.veele_sql_migrations
        ORDER BY applied_at, name`,
    );
    const initiallyPending = assertPlatformPrivilegeMigrationFrontier(
      frontier,
      recorded.rows,
    );
    if (initiallyPending.length === 0) return false;

    await queryable.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    migrationTransactionStarted = true;
    const recheck = await queryable.query<SqlMigrationHistoryRecord>(
      `SELECT name, hash, baselined, applied_at AS "appliedAt"
         FROM drizzle.veele_sql_migrations
        ORDER BY applied_at, name
        FOR UPDATE`,
    );
    const pending = assertPlatformPrivilegeMigrationFrontier(
      frontier,
      recheck.rows,
    );
    if (
      pending.length !== initiallyPending.length ||
      pending.some(
        (migration, index) => migration.name !== initiallyPending[index]?.name,
      )
    ) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_precondition_invalid",
        "Platform-privilege migration state changed under its lock.",
        "platform_privilege_precondition",
      );
    }
    for (const migration of pending) {
      await queryable.query(sqlForManagedMigrationTransaction(migration.sql));
      const inserted = await queryable.query(
        `INSERT INTO drizzle.veele_sql_migrations (name, hash, baselined)
         VALUES ($1, $2, false)
         RETURNING name`,
        [migration.name, migration.hash],
      );
      if (
        inserted.rowCount !== 1 ||
        inserted.rows.length !== 1 ||
        inserted.rows[0]?.name !== migration.name
      ) {
        throw new FieldDemoOwnerBindingError(
          "field_demo_owner_binding_mutation_failed",
          "A platform-privilege migration was not recorded exactly once.",
          "platform_privilege_mutation",
        );
      }
    }
    await queryable.query("COMMIT");
    migrationTransactionStarted = false;
    return true;
  } catch (error) {
    if (migrationTransactionStarted) {
      try {
        await queryable.query("ROLLBACK");
      } catch {
        // Releasing the dedicated connection below discards its transaction.
      }
    }
    throw error;
  } finally {
    if (migrationLockAcquired) {
      const unlocked = await queryable.query<{ released: boolean }>(
        `SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released`,
        [DATABASE_MIGRATION_LOCK_KEY],
      );
      if (unlocked.rows.length !== 1 || unlocked.rows[0]?.released !== true) {
        throw new Error("Database migration lock was not held.");
      }
    }
  }
}

async function acquirePlatformPrivilegeRepairLock(
  queryable: Queryable,
): Promise<void> {
  const result = await queryable.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired`,
    [PLATFORM_PRIVILEGE_REPAIR_LOCK_KEY],
  );
  if (result.rows.length !== 1 || result.rows[0]?.acquired !== true) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_lock_unavailable",
      "Field-demo platform-privilege repair lock is unavailable.",
      "database_transaction",
    );
  }
}

async function releasePlatformPrivilegeRepairLock(
  queryable: Queryable,
): Promise<void> {
  const result = await queryable.query<{ released: boolean }>(
    `SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released`,
    [PLATFORM_PRIVILEGE_REPAIR_LOCK_KEY],
  );
  if (result.rows.length !== 1 || result.rows[0]?.released !== true) {
    throw new Error("Platform-privilege repair lock was not held.");
  }
}

async function acquireOwnerBindingLock(queryable: Queryable): Promise<void> {
  const result = await queryable.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired`,
    [OWNER_BINDING_LOCK_KEY],
  );
  if (result.rows.length !== 1 || result.rows[0]?.acquired !== true) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_lock_unavailable",
      "Field-demo owner-binding repair lock is unavailable.",
      "database_transaction",
    );
  }
}

async function lockFieldDemoOwnerBindingRows(
  queryable: Queryable,
): Promise<void> {
  await queryable.query(
    `SELECT tenant.id FROM public.tenants AS tenant
      WHERE tenant.slug = $1 ORDER BY tenant.id FOR UPDATE`,
    [FIELD_DEMO_SLUG],
  );
  await queryable.query(
    `SELECT auth_user.id FROM auth.users AS auth_user
      WHERE auth_user.id = $1::uuid
        AND lower(auth_user.email) = lower($2)
      ORDER BY auth_user.id FOR UPDATE`,
    [FIELD_DEMO_RETAINED_OWNER_ID, FIELD_DEMO_OWNER_EMAIL],
  );
  await queryable.query(
    `SELECT role.id FROM public.roles AS role
      WHERE role.name = 'Management' ORDER BY role.id FOR UPDATE`,
  );
  await queryable.query(
    `SELECT tenant_role.id FROM public.tenant_roles AS tenant_role
      WHERE tenant_role.tenant_id IN (
        SELECT tenant.id FROM public.tenants AS tenant WHERE tenant.slug = $1
      ) ORDER BY tenant_role.id FOR UPDATE`,
    [FIELD_DEMO_SLUG],
  );
  await queryable.query(
    `SELECT permission.permission_id
       FROM public.role_permissions AS permission
      WHERE permission.role_id IN (
        SELECT role.id FROM public.roles AS role
         WHERE role.name = 'Management'
      ) ORDER BY permission.permission_id FOR UPDATE`,
  );
  await queryable.query(
    `SELECT permission.id
       FROM public.tenant_role_permissions AS permission
      WHERE permission.tenant_role_id IN (
        SELECT tenant_role.id FROM public.tenant_roles AS tenant_role
         WHERE tenant_role.tenant_id IN (
           SELECT tenant.id FROM public.tenants AS tenant WHERE tenant.slug = $1
         ) AND tenant_role.name = 'Management'
      ) ORDER BY permission.id FOR UPDATE`,
    [FIELD_DEMO_SLUG],
  );
  await queryable.query(
    `SELECT domain.id FROM public.tenant_domains AS domain
      WHERE domain.tenant_id IN (
        SELECT tenant.id FROM public.tenants AS tenant WHERE tenant.slug = $1
      ) OR domain.domain IN ($2, $3)
      ORDER BY domain.id FOR UPDATE`,
    [FIELD_DEMO_SLUG, FIELD_DEMO_HOST, LEGACY_FIELD_DEMO_HOST],
  );
  await queryable.query(
    `SELECT settings.id FROM public.organization_settings AS settings
      WHERE settings.tenant_id IN (
        SELECT tenant.id FROM public.tenants AS tenant WHERE tenant.slug = $1
      ) ORDER BY settings.id FOR UPDATE`,
    [FIELD_DEMO_SLUG],
  );
  await queryable.query(
    `SELECT subscription.id
       FROM public.tenant_subscriptions AS subscription
      WHERE subscription.tenant_id IN (
        SELECT tenant.id FROM public.tenants AS tenant WHERE tenant.slug = $1
      ) ORDER BY subscription.id FOR UPDATE`,
    [FIELD_DEMO_SLUG],
  );
  await queryable.query(
    `SELECT site.id FROM public.website_sites AS site
      WHERE site.tenant_id IN (
        SELECT tenant.id FROM public.tenants AS tenant WHERE tenant.slug = $1
      ) ORDER BY site.id FOR UPDATE`,
    [FIELD_DEMO_SLUG],
  );
  await queryable.query(
    `SELECT binding.id FROM public.website_domain_bindings AS binding
      WHERE binding.tenant_id IN (
        SELECT tenant.id FROM public.tenants AS tenant WHERE tenant.slug = $1
      ) OR binding.hostname IN ($2, $3)
      ORDER BY binding.id FOR UPDATE`,
    [FIELD_DEMO_SLUG, FIELD_DEMO_HOST, LEGACY_FIELD_DEMO_HOST],
  );
  await queryable.query(
    `SELECT membership.id FROM public.tenant_users AS membership
      WHERE membership.user_id IN (
        SELECT auth_user.id FROM auth.users AS auth_user
         WHERE auth_user.id = $2::uuid
           AND lower(auth_user.email) = lower($3)
      ) OR (membership.tenant_id IN (
        SELECT tenant.id FROM public.tenants AS tenant WHERE tenant.slug = $1
      ) AND membership.role = 'owner')
      ORDER BY membership.id FOR UPDATE`,
    [FIELD_DEMO_SLUG, FIELD_DEMO_RETAINED_OWNER_ID, FIELD_DEMO_OWNER_EMAIL],
  );
  await queryable.query(
    `SELECT user_role.id FROM public.tenant_user_roles AS user_role
      WHERE user_role.user_id IN (
        SELECT auth_user.id FROM auth.users AS auth_user
         WHERE auth_user.id = $1::uuid
           AND lower(auth_user.email) = lower($2)
      ) ORDER BY user_role.id FOR UPDATE`,
    [FIELD_DEMO_RETAINED_OWNER_ID, FIELD_DEMO_OWNER_EMAIL],
  );
}

async function lockFieldDemoPlatformPrivilegeRows(
  queryable: Queryable,
  platformUserId: string,
): Promise<void> {
  await queryable.query(
    `SELECT platform_user.id
       FROM public.platform_users AS platform_user
      ORDER BY platform_user.id
      FOR UPDATE`,
  );
  await queryable.query(
    `SELECT recipient.id
       FROM public.platform_notification_recipients AS recipient
      WHERE recipient.platform_user_id = $1::uuid
      ORDER BY recipient.id
      FOR UPDATE`,
    [platformUserId],
  );
}

async function loadFieldDemoPlatformRecipientIds(
  queryable: Queryable,
  platformUserId: string,
  ownerUserId: string,
): Promise<string[]> {
  const result = await queryable.query<{ id: string }>(
    `SELECT recipient.id::text AS id
       FROM public.platform_notification_recipients AS recipient
      WHERE recipient.platform_user_id = $1::uuid
        AND recipient.recipient_type = 'platform_user'
        AND recipient.recipient_user_id = $2::uuid
        AND recipient.tenant_id IS NULL
        AND recipient.tenant_owner_invite_id IS NULL
        AND recipient.delivery_status IN ('sent', 'skipped', 'failed')
      ORDER BY recipient.id`,
    [platformUserId, ownerUserId],
  );
  if (result.rows.some((row) => !UUID_PATTERN.test(row.id))) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "Platform-recipient history identity is invalid.",
      "platform_privilege_precondition",
      "auth-owner-platform-privilege-present",
    );
  }
  return result.rows.map((row) => row.id);
}

async function suspendFieldDemoPlatformPrivilege(
  queryable: Queryable,
  platformUserId: string,
  ownerUserId: string,
): Promise<void> {
  const result = await queryable.query(
    `UPDATE public.platform_users AS platform_user
        SET status = 'suspended', updated_at = now()
      WHERE platform_user.id = $1::uuid
        AND platform_user.user_id = $2::uuid
        AND platform_user.role = 'owner'
        AND platform_user.status = 'active'
      RETURNING platform_user.id`,
    [platformUserId, ownerUserId],
  );
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_mutation_failed",
      "Field-demo platform privilege was not quarantined exactly once.",
      "platform_privilege_mutation",
      "auth-owner-platform-privilege-present",
    );
  }
}

async function removeFieldDemoPlatformPrivilege(
  queryable: Queryable,
  platformUserId: string,
  ownerUserId: string,
): Promise<void> {
  const result = await queryable.query(
    `DELETE FROM public.platform_users AS platform_user
      WHERE platform_user.id = $1::uuid
        AND platform_user.user_id = $2::uuid
        AND platform_user.role = 'owner'
        AND platform_user.status = 'suspended'
      RETURNING platform_user.id`,
    [platformUserId, ownerUserId],
  );
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_mutation_failed",
      "Field-demo platform privilege was not removed exactly once.",
      "platform_privilege_mutation",
      "auth-owner-platform-privilege-present",
    );
  }
}

async function assertPlatformRecipientHistoryDetached(
  queryable: Queryable,
  recipientIds: string[],
  ownerUserId: string,
): Promise<void> {
  if (recipientIds.length === 0) return;
  const result = await queryable.query<{ detached_count: number }>(
    `SELECT COUNT(*)::integer AS detached_count
       FROM public.platform_notification_recipients AS recipient
      WHERE recipient.id = ANY($1::uuid[])
        AND recipient.recipient_type = 'platform_user'
        AND recipient.platform_user_id IS NULL
        AND recipient.recipient_user_id = $2::uuid`,
    [recipientIds, ownerUserId],
  );
  if (
    result.rows.length !== 1 ||
    result.rows[0]?.detached_count !== recipientIds.length
  ) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_postcondition_invalid",
      "Platform-recipient history was not preserved after role removal.",
      "platform_privilege_postcondition",
      "auth-owner-platform-privilege-present",
    );
  }
}

async function lockOwnerReconciliationRows(
  queryable: Queryable,
): Promise<void> {
  await queryable.query(
    `SELECT tenant.id FROM public.tenants AS tenant
      WHERE tenant.slug = $1 ORDER BY tenant.id FOR UPDATE`,
    [FIELD_DEMO_SLUG],
  );
  await queryable.query(
    `SELECT auth_user.id FROM auth.users AS auth_user
      WHERE lower(auth_user.email) IN (lower($1), lower($2))
      ORDER BY auth_user.id FOR UPDATE`,
    [FIELD_DEMO_OWNER_EMAIL, FIELD_DEMO_SUPERSEDED_OWNER_EMAIL],
  );
  await queryable.query(
    `SELECT membership.id FROM public.tenant_users AS membership
      WHERE membership.tenant_id IN (
        SELECT tenant.id FROM public.tenants AS tenant WHERE tenant.slug = $1
      ) ORDER BY membership.id FOR UPDATE`,
    [FIELD_DEMO_SLUG],
  );
  await queryable.query(
    `SELECT user_role.id FROM public.tenant_user_roles AS user_role
      WHERE user_role.tenant_id IN (
        SELECT tenant.id FROM public.tenants AS tenant WHERE tenant.slug = $1
      )
      ORDER BY user_role.id FOR UPDATE`,
    [FIELD_DEMO_SLUG],
  );
}

async function readOwnerReconciliationTarget(queryable: Queryable): Promise<{
  tenantId: string;
  retainedUser: { id: string; email: string };
  supersededUser: { id: string; email: string };
  ownerMemberships: Array<{
    userId: string;
    role: string;
    status: string;
  }>;
}> {
  const tenants = await queryable.query<{ tenant_id: string }>(
    `SELECT id::text AS tenant_id FROM public.tenants WHERE slug = $1`,
    [FIELD_DEMO_SLUG],
  );
  if (tenants.rowCount !== 1 || tenants.rows.length !== 1) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "Field-demo tenant identity is not singular.",
      "owner_binding_precondition",
      "tenant-identity-invalid",
    );
  }
  const tenantId = tenants.rows[0]!.tenant_id;
  const users = await queryable.query<{
    id: string;
    email: string | null;
    email_confirmed_at: string | null;
    deleted_at: string | null;
    is_anonymous: boolean | null;
    aud: string | null;
    role: string | null;
  }>(
    `SELECT id::text, email, email_confirmed_at, deleted_at,
            is_anonymous, aud, role
       FROM auth.users
      WHERE lower(email) IN (lower($1), lower($2))
      ORDER BY id`,
    [FIELD_DEMO_OWNER_EMAIL, FIELD_DEMO_SUPERSEDED_OWNER_EMAIL],
  );
  const retainedUser = users.rows.find(
    (user) => user.email?.toLowerCase() === FIELD_DEMO_OWNER_EMAIL,
  );
  const supersededUser = users.rows.find(
    (user) => user.email?.toLowerCase() === FIELD_DEMO_SUPERSEDED_OWNER_EMAIL,
  );
  if (
    users.rowCount !== 2 ||
    !retainedUser ||
    !supersededUser ||
    retainedUser.email?.toLowerCase() !== FIELD_DEMO_OWNER_EMAIL ||
    supersededUser.email?.toLowerCase() !== FIELD_DEMO_SUPERSEDED_OWNER_EMAIL ||
    [retainedUser, supersededUser].some(
      (user) =>
        !user.email_confirmed_at ||
        user.deleted_at !== null ||
        user.is_anonymous === true,
    )
  ) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_precondition_invalid",
      "The explicit owner identities do not match active authenticated users.",
      "owner_binding_precondition",
      "auth-owner-invalid",
    );
  }
  const memberships = await queryable.query<{
    user_id: string;
    role: string;
    status: string;
  }>(
    `SELECT user_id::text, role, status
       FROM public.tenant_users
      WHERE tenant_id = $1
      ORDER BY user_id`,
    [tenantId],
  );
  const ownerMemberships = memberships.rows
    .filter((membership) => membership.role === "owner")
    .map((membership) => ({
      userId: membership.user_id,
      role: membership.role,
      status: membership.status,
    }));
  return {
    tenantId,
    retainedUser: {
      id: retainedUser.id,
      email: retainedUser.email!,
    },
    supersededUser: {
      id: supersededUser.id,
      email: supersededUser.email!,
    },
    ownerMemberships,
  };
}

async function demoteSupersededOwner(
  queryable: Queryable,
  tenantId: string,
  userId: string,
): Promise<void> {
  const result = await queryable.query(
    `UPDATE public.tenant_users
        SET role = 'admin', updated_at = now()
      WHERE tenant_id = $1
        AND user_id = $2
        AND role = 'owner'
        AND status = 'active'
      RETURNING id`,
    [tenantId, userId],
  );
  if (result.rowCount !== 1) {
    throw new FieldDemoOwnerBindingError(
      "field_demo_owner_binding_mutation_failed",
      "The superseded owner membership was not updated exactly once.",
      "owner_binding_mutation",
    );
  }
}

async function createFieldDemoOwnerMembership(
  queryable: Queryable,
  tenantId: string,
  userId: string,
): Promise<void> {
  const result = await queryable.query<{
    membership_id: string;
    tenant_id: string;
    user_id: string;
  }>(
    `INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
     SELECT $1, $2, 'owner', 'active'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tenant_users AS membership
         WHERE membership.user_id = $2
            OR (membership.tenant_id = $1 AND membership.role = 'owner')
      )
     RETURNING id::text AS membership_id,
               tenant_id::text AS tenant_id,
               user_id::text AS user_id`,
    [tenantId, userId],
  );
  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    !row ||
    !UUID_PATTERN.test(row.membership_id) ||
    row.tenant_id !== tenantId ||
    row.user_id !== userId
  ) {
    throw new Error("owner membership insert was not singular");
  }
}

async function createFieldDemoManagementRoleLink(
  queryable: Queryable,
  tenantId: string,
  userId: string,
  managementRoleId: string,
): Promise<void> {
  const result = await queryable.query<{
    user_role_id: string;
    tenant_id: string;
    user_id: string;
    tenant_role_id: string;
  }>(
    `INSERT INTO public.tenant_user_roles (
       tenant_id, user_id, tenant_role_id
     )
     SELECT $1, $2, $3
      WHERE EXISTS (
        SELECT 1 FROM public.tenant_users AS membership
         WHERE membership.tenant_id = $1
           AND membership.user_id = $2
           AND membership.role = 'owner'
           AND membership.status = 'active'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.tenant_user_roles AS user_role
         WHERE user_role.user_id = $2
      )
     RETURNING id::text AS user_role_id,
               tenant_id::text AS tenant_id,
               user_id::text AS user_id,
               tenant_role_id::text AS tenant_role_id`,
    [tenantId, userId, managementRoleId],
  );
  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    !row ||
    !UUID_PATTERN.test(row.user_role_id) ||
    row.tenant_id !== tenantId ||
    row.user_id !== userId ||
    row.tenant_role_id !== managementRoleId
  ) {
    throw new Error("Management role link insert was not singular");
  }
}

function evidencePath(
  operation: "diagnose" | "repair" | "reconcile" | "repair-platform-privilege",
  environment: OwnerBindingEnvironment,
): string {
  const runId = environment.GITHUB_RUN_ID ?? "";
  const runAttempt = environment.GITHUB_RUN_ATTEMPT ?? "";
  if (!RUN_NUMBER_PATTERN.test(runId) || !RUN_NUMBER_PATTERN.test(runAttempt)) {
    throw new Error("Owner-binding evidence identity is invalid.");
  }
  return join(
    repoRoot,
    "artifacts",
    "field-demo-owner-binding-repair",
    `${operation}-${runId}-${runAttempt}.json`,
  );
}

async function writeEvidence(
  evidence: OwnerBindingEvidence,
  environment: OwnerBindingEnvironment,
): Promise<void> {
  const outputPath = evidencePath(evidence.operation, environment);
  const directory = dirname(outputPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(outputPath, 0o600);
}

async function runOwnerBindingOperation(
  options: OwnerBindingOptions,
  environment: OwnerBindingEnvironment,
): Promise<
  | "diagnosed"
  | "reconciled-retained-owner"
  | FieldDemoOwnerBindingRepairResult
  | FieldDemoPlatformPrivilegeRepairResult
> {
  if (options.mode === "check") {
    throw new Error("Static checks cannot access the database.");
  }
  const operation = options.mode;
  const configuredAutomationActor =
    environment.FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID?.trim() || null;
  const startedAt = new Date().toISOString();
  let failureStage: OwnerBindingFailureStage = "configuration";
  let mutationAttempted = false;
  let transactionStarted = false;
  let transactionFinished = false;
  let platformPrivilegeRepairLockAcquired = false;
  let platformPrivilegePhase: OwnerBindingEvidence["platformPrivilegePhase"] =
    "not-started";
  let observedState: FieldDemoOwnerBindingState | null = null;
  let dbModule: DatabaseModule | null = null;
  let client:
    | (Queryable & { release: (error?: Error | boolean) => void })
    | null = null;
  const evidence: OwnerBindingEvidence = {
    schemaVersion: 3,
    contract: FIELD_DEMO_OWNER_BINDING_VERSION,
    environment: "staging",
    operation,
    expectedMainSha: options.expectedSha,
    status: "failed",
    observedState: null,
    result: null,
    mutationAttempted: false,
    errorCode: null,
    failureStage: null,
    failureReason: null,
    platformPrivilegeSummary: null,
    platformPrivilegePhase,
    startedAt,
    completedAt: startedAt,
  };

  try {
    const errors = validateFieldDemoOwnerBindingConfig(options, environment);
    if (errors.length > 0) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_configuration_invalid",
        "Field-demo owner-binding operation configuration is invalid.",
        "configuration",
      );
    }
    failureStage = "database_bootstrap";
    const databaseModuleUrl = pathToFileURL(
      join(repoRoot, "lib", "db", "src", "index.ts"),
    ).href;
    dbModule = (await import(databaseModuleUrl)) as DatabaseModule;
    client = await dbModule.pool.connect();

    if (operation === "repair-platform-privilege") {
      failureStage = "platform_privilege_precondition";
      mutationAttempted =
        (await applyExactPlatformPrivilegePrerequisiteMigrations(client)) ||
        mutationAttempted;
      failureStage = "database_transaction";
      await acquirePlatformPrivilegeRepairLock(client);
      platformPrivilegeRepairLockAcquired = true;

      await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
      transactionStarted = true;
      transactionFinished = false;
      await lockFieldDemoOwnerBindingRows(client);
      failureStage = "platform_privilege_precondition";
      const beforeTarget =
        await loadFieldDemoPlatformPrivilegeRepairTarget(client);
      if (beforeTarget.platformUserId) {
        await lockFieldDemoPlatformPrivilegeRows(
          client,
          beforeTarget.platformUserId,
        );
      }
      const before = await loadFieldDemoOwnerBindingSnapshot(client);
      const beforeDecision = classifyFieldDemoOwnerBinding(before);
      observedState = beforeDecision.state;
      evidence.failureReason = beforeDecision.failureReason;
      const beforePlatformSnapshot =
        await loadFieldDemoOwnerPlatformPrivilegeSnapshot(
          client,
          configuredAutomationActor,
        );
      const beforePlatformSummary = summarizeFieldDemoOwnerPlatformPrivilege(
        beforePlatformSnapshot,
      );
      evidence.platformPrivilegeSummary = beforePlatformSummary;

      if (before.platform_user_count === 0) {
        if (
          beforeDecision.state !== "already-valid" ||
          before.owner_user_id?.toLowerCase() !==
            FIELD_DEMO_RETAINED_OWNER_ID ||
          beforeTarget.platformUserId !== null ||
          !fieldDemoOwnerAuthMetadataIsNormalized(beforeTarget) ||
          beforePlatformSummary.accountState !== "absent" ||
          beforePlatformSummary.automationActorState !== "single-admin-ready" ||
          beforePlatformSummary.configuredActorState !==
            "other-active-eligible" ||
          beforePlatformSummary.foreignKeyContractState !== "exact" ||
          beforePlatformSummary.nonRecipientHistoryState !== "none"
        ) {
          throw new FieldDemoOwnerBindingError(
            "field_demo_owner_binding_precondition_invalid",
            "Already-removed platform privilege is not an exact no-op.",
            "platform_privilege_precondition",
            beforeDecision.failureReason,
          );
        }
        await client.query("ROLLBACK");
        transactionFinished = true;
        evidence.status = "passed";
        evidence.observedState = beforeDecision.state;
        evidence.result = "already-removed";
        evidence.mutationAttempted = mutationAttempted;
        platformPrivilegePhase = "removed";
        evidence.platformPrivilegePhase = platformPrivilegePhase;
        evidence.failureReason = null;
        return "already-removed";
      }

      if (
        !beforeTarget.platformUserId ||
        beforeTarget.platformRole !== "owner" ||
        !["active", "suspended"].includes(beforeTarget.platformStatus ?? "") ||
        !fieldDemoPlatformPrivilegeRepairPreconditionIsSafe(
          before,
          beforePlatformSummary,
        )
      ) {
        throw new FieldDemoOwnerBindingError(
          "field_demo_owner_binding_precondition_invalid",
          "Field-demo platform privilege is not safe for bounded removal.",
          "platform_privilege_precondition",
          "auth-owner-platform-privilege-present",
        );
      }
      const platformUserId = beforeTarget.platformUserId;
      if (beforeTarget.platformStatus === "suspended") {
        platformPrivilegePhase = "quarantined";
        evidence.platformPrivilegePhase = platformPrivilegePhase;
      }
      if (beforeTarget.platformStatus === "active") {
        failureStage = "platform_privilege_mutation";
        mutationAttempted = true;
        await suspendFieldDemoPlatformPrivilege(
          client,
          platformUserId,
          beforeTarget.userId,
        );
        const quarantinedTarget =
          await loadFieldDemoPlatformPrivilegeRepairTarget(client);
        const quarantinedSummary = summarizeFieldDemoOwnerPlatformPrivilege(
          await loadFieldDemoOwnerPlatformPrivilegeSnapshot(
            client,
            configuredAutomationActor,
          ),
        );
        if (
          quarantinedTarget.platformUserId !== platformUserId ||
          quarantinedTarget.platformRole !== "owner" ||
          quarantinedTarget.platformStatus !== "suspended" ||
          quarantinedSummary.accountState !== "suspended-owner" ||
          !fieldDemoPlatformPrivilegeRepairPreconditionIsSafe(
            await loadFieldDemoOwnerBindingSnapshot(client),
            quarantinedSummary,
          )
        ) {
          throw new FieldDemoOwnerBindingError(
            "field_demo_owner_binding_postcondition_invalid",
            "Field-demo platform privilege was not quarantined safely.",
            "platform_privilege_postcondition",
            "auth-owner-platform-privilege-present",
          );
        }
        await client.query("COMMIT");
        platformPrivilegePhase = "quarantined";
        evidence.platformPrivilegePhase = platformPrivilegePhase;
      } else {
        await client.query("ROLLBACK");
      }
      transactionFinished = true;

      failureStage = "owner_auth_normalization";
      const freshPreimage =
        await loadFieldDemoPlatformPrivilegeRepairTarget(client);
      if (
        freshPreimage.platformUserId !== platformUserId ||
        freshPreimage.platformRole !== "owner" ||
        freshPreimage.platformStatus !== "suspended"
      ) {
        throw new FieldDemoOwnerBindingError(
          "field_demo_owner_binding_precondition_invalid",
          "Quarantined platform privilege changed before Auth normalization.",
          "owner_auth_normalization",
          "auth-owner-platform-privilege-present",
        );
      }
      let normalizedTarget = freshPreimage;
      let expectedRevokedAt: string;
      if (fieldDemoOwnerAuthMetadataIsNormalized(freshPreimage)) {
        const existingRevokedAt =
          freshPreimage.appMetadata["session_revoked_at"];
        if (!exactIsoTimestamp(existingRevokedAt)) {
          throw new FieldDemoOwnerBindingError(
            "field_demo_owner_binding_postcondition_invalid",
            "Normalized owner Auth metadata has no exact revocation timestamp.",
            "owner_auth_normalization",
            "auth-owner-platform-privilege-present",
          );
        }
        expectedRevokedAt = existingRevokedAt;
      } else {
        expectedRevokedAt = new Date().toISOString();
        mutationAttempted = true;
        const authUpdateOutcome = await normalizeFieldDemoOwnerAuthMetadata(
          environment,
          freshPreimage,
          expectedRevokedAt,
        );
        const observedPostimage = await waitForFieldDemoOwnerAuthPostimage(
          client,
          expectedRevokedAt,
        );
        if (!observedPostimage) {
          const errorCode: OwnerBindingErrorCode =
            authUpdateOutcome === "rejected"
              ? "field_demo_owner_auth_update_rejected"
              : authUpdateOutcome === "uncertain"
                ? "field_demo_owner_auth_update_uncertain"
                : "field_demo_owner_binding_postcondition_invalid";
          throw new FieldDemoOwnerBindingError(
            errorCode,
            "Field-demo owner Auth metadata was not normalized exactly.",
            "owner_auth_normalization",
            "auth-owner-platform-privilege-present",
          );
        }
        normalizedTarget = observedPostimage;
      }
      if (
        normalizedTarget.platformUserId !== platformUserId ||
        normalizedTarget.platformStatus !== "suspended" ||
        !fieldDemoOwnerAuthMetadataIsNormalized(
          normalizedTarget,
          expectedRevokedAt,
        )
      ) {
        throw new FieldDemoOwnerBindingError(
          "field_demo_owner_binding_postcondition_invalid",
          "Auth normalization did not preserve the quarantined repair target.",
          "owner_auth_normalization",
          "auth-owner-platform-privilege-present",
        );
      }
      platformPrivilegePhase = "auth-normalized";
      evidence.platformPrivilegePhase = platformPrivilegePhase;

      failureStage = "database_transaction";
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
      transactionStarted = true;
      transactionFinished = false;
      await lockFieldDemoOwnerBindingRows(client);
      await lockFieldDemoPlatformPrivilegeRows(client, platformUserId);

      failureStage = "platform_privilege_precondition";
      const lockedSnapshot = await loadFieldDemoOwnerBindingSnapshot(client);
      const lockedPlatformSnapshot =
        await loadFieldDemoOwnerPlatformPrivilegeSnapshot(
          client,
          configuredAutomationActor,
        );
      const lockedPlatformSummary = summarizeFieldDemoOwnerPlatformPrivilege(
        lockedPlatformSnapshot,
      );
      const lockedTarget =
        await loadFieldDemoPlatformPrivilegeRepairTarget(client);
      if (
        lockedTarget.platformUserId !== platformUserId ||
        lockedTarget.platformRole !== "owner" ||
        lockedTarget.platformStatus !== "suspended" ||
        lockedPlatformSummary.authMetadataState !== "tenant-owner-compatible" ||
        !fieldDemoOwnerAuthMetadataIsNormalized(
          lockedTarget,
          expectedRevokedAt,
        ) ||
        !fieldDemoPlatformPrivilegeRepairPreconditionIsSafe(
          lockedSnapshot,
          lockedPlatformSummary,
        )
      ) {
        throw new FieldDemoOwnerBindingError(
          "field_demo_owner_binding_precondition_invalid",
          "Field-demo platform privilege changed before bounded removal.",
          "platform_privilege_precondition",
          "auth-owner-platform-privilege-present",
        );
      }
      const recipientIds = await loadFieldDemoPlatformRecipientIds(
        client,
        platformUserId,
        lockedTarget.userId,
      );
      if (
        recipientIds.length !==
        lockedPlatformSnapshot.platform_recipient_reference_count
      ) {
        throw new FieldDemoOwnerBindingError(
          "field_demo_owner_binding_precondition_invalid",
          "Platform-recipient history is not exact for bounded removal.",
          "platform_privilege_precondition",
          "auth-owner-platform-privilege-present",
        );
      }

      failureStage = "platform_privilege_mutation";
      mutationAttempted = true;
      await removeFieldDemoPlatformPrivilege(
        client,
        platformUserId,
        lockedTarget.userId,
      );
      failureStage = "platform_privilege_postcondition";
      await assertPlatformRecipientHistoryDetached(
        client,
        recipientIds,
        lockedTarget.userId,
      );
      const postSnapshot = await loadFieldDemoOwnerBindingSnapshot(client);
      const postDecision = classifyFieldDemoOwnerBinding(postSnapshot);
      const postTarget =
        await loadFieldDemoPlatformPrivilegeRepairTarget(client);
      const postPlatformSnapshot =
        await loadFieldDemoOwnerPlatformPrivilegeSnapshot(
          client,
          configuredAutomationActor,
        );
      const postPlatformSummary =
        summarizeFieldDemoOwnerPlatformPrivilege(postPlatformSnapshot);
      if (
        postDecision.state !== "already-valid" ||
        postTarget.platformUserId !== null ||
        !fieldDemoOwnerAuthMetadataIsNormalized(
          postTarget,
          expectedRevokedAt,
        ) ||
        postPlatformSummary.accountState !== "absent" ||
        postPlatformSnapshot.other_active_platform_owner_count < 1 ||
        postPlatformSummary.automationActorState !== "single-admin-ready" ||
        postPlatformSummary.configuredActorState !== "other-active-eligible" ||
        postPlatformSummary.foreignKeyContractState !== "exact" ||
        postPlatformSummary.deletionBlockState !== "none"
      ) {
        throw new FieldDemoOwnerBindingError(
          "field_demo_owner_binding_postcondition_invalid",
          "Platform-privilege repair did not leave the exact owner binding.",
          "platform_privilege_postcondition",
          postDecision.failureReason,
        );
      }
      await client.query("COMMIT");
      transactionFinished = true;
      platformPrivilegePhase = "removed";
      evidence.platformPrivilegePhase = platformPrivilegePhase;

      const freshSnapshot = await loadFieldDemoOwnerBindingSnapshot(client);
      const freshTarget =
        await loadFieldDemoPlatformPrivilegeRepairTarget(client);
      const freshPlatformSnapshot =
        await loadFieldDemoOwnerPlatformPrivilegeSnapshot(
          client,
          configuredAutomationActor,
        );
      const freshPlatformSummary = summarizeFieldDemoOwnerPlatformPrivilege(
        freshPlatformSnapshot,
      );
      if (
        classifyFieldDemoOwnerBinding(freshSnapshot).state !==
          "already-valid" ||
        freshTarget.platformUserId !== null ||
        !fieldDemoOwnerAuthMetadataIsNormalized(
          freshTarget,
          expectedRevokedAt,
        ) ||
        freshPlatformSummary.accountState !== "absent" ||
        freshPlatformSnapshot.other_active_platform_owner_count < 1 ||
        freshPlatformSummary.automationActorState !== "single-admin-ready" ||
        freshPlatformSummary.configuredActorState !== "other-active-eligible" ||
        freshPlatformSummary.foreignKeyContractState !== "exact"
      ) {
        throw new FieldDemoOwnerBindingError(
          "field_demo_owner_binding_postcondition_invalid",
          "Committed platform-privilege repair failed fresh readback.",
          "platform_privilege_postcondition",
        );
      }
      evidence.status = "passed";
      evidence.observedState = observedState;
      evidence.result = "platform-privilege-removed";
      evidence.mutationAttempted = true;
      evidence.failureReason = null;
      return "platform-privilege-removed";
    }

    failureStage = "database_transaction";
    await client.query(
      operation === "diagnose"
        ? "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY"
        : "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE",
    );
    transactionStarted = true;

    if (operation === "diagnose") {
      failureStage = "owner_binding_precondition";
      const snapshot = await loadFieldDemoOwnerBindingSnapshot(client);
      const decision = classifyFieldDemoOwnerBinding(snapshot);
      observedState = decision.state;
      evidence.failureReason = decision.failureReason;
      if (decision.failureReason === "auth-owner-platform-privilege-present") {
        const platformSnapshot =
          await loadFieldDemoOwnerPlatformPrivilegeSnapshot(
            client,
            configuredAutomationActor,
          );
        evidence.platformPrivilegeSummary =
          summarizeFieldDemoOwnerPlatformPrivilege(platformSnapshot);
      }
      await client.query("ROLLBACK");
      transactionFinished = true;
      evidence.status = "passed";
      evidence.observedState = observedState;
      evidence.result = "diagnosed";
      return "diagnosed";
    }

    await acquireOwnerBindingLock(client);
    let result: "reconciled-retained-owner" | FieldDemoOwnerBindingRepairResult;
    if (operation === "reconcile") {
      await lockOwnerReconciliationRows(client);
      failureStage = "owner_binding_precondition";
      result = await reconcileFieldDemoOwnerBinding({
        readTarget: () => readOwnerReconciliationTarget(client!),
        demoteSupersededOwner: async (tenantId, userId) => {
          failureStage = "owner_binding_mutation";
          mutationAttempted = true;
          await demoteSupersededOwner(client!, tenantId, userId);
        },
        readSnapshot: async () => {
          const snapshot = await loadFieldDemoOwnerBindingSnapshot(client!);
          if (observedState === null) {
            observedState = classifyFieldDemoOwnerBinding(snapshot).state;
          }
          return snapshot;
        },
      });
    } else {
      await lockFieldDemoOwnerBindingRows(client);
      failureStage = "owner_binding_precondition";
      result = await repairFieldDemoOwnerBinding({
        readSnapshot: async () => {
          const snapshot = await loadFieldDemoOwnerBindingSnapshot(client!);
          if (observedState === null) {
            observedState = classifyFieldDemoOwnerBinding(snapshot).state;
          }
          return snapshot;
        },
        createMembership: async (tenantId, userId) => {
          failureStage = "owner_binding_mutation";
          mutationAttempted = true;
          await createFieldDemoOwnerMembership(client!, tenantId, userId);
        },
        createManagementRoleLink: async (
          tenantId,
          userId,
          managementRoleId,
        ) => {
          failureStage = "owner_binding_mutation";
          mutationAttempted = true;
          await createFieldDemoManagementRoleLink(
            client!,
            tenantId,
            userId,
            managementRoleId,
          );
        },
      });
    }
    failureStage = "owner_binding_postcondition";
    if (result === "already-valid") {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
    transactionFinished = true;
    const freshSnapshot = await loadFieldDemoOwnerBindingSnapshot(client);
    if (
      classifyFieldDemoOwnerBinding(freshSnapshot).state !== "already-valid"
    ) {
      throw new FieldDemoOwnerBindingError(
        "field_demo_owner_binding_postcondition_invalid",
        "Committed field-demo owner binding did not pass a fresh readback.",
        "owner_binding_postcondition",
      );
    }
    evidence.status = "passed";
    evidence.observedState = observedState;
    evidence.result = result;
    evidence.mutationAttempted = mutationAttempted;
    return result;
  } catch (error) {
    if (client && transactionStarted && !transactionFinished) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Releasing the dedicated connection below discards its transaction.
      }
    }
    evidence.errorCode = safeFieldDemoOwnerBindingErrorCode(error);
    evidence.failureStage =
      error instanceof FieldDemoOwnerBindingError
        ? error.failureStage
        : failureStage;
    evidence.failureReason =
      safeFieldDemoOwnerBindingFailureReason(error) ?? evidence.failureReason;
    evidence.observedState = observedState;
    evidence.mutationAttempted = mutationAttempted;
    evidence.platformPrivilegePhase = platformPrivilegePhase;
    throw error;
  } finally {
    if (client && platformPrivilegeRepairLockAcquired) {
      try {
        await releasePlatformPrivilegeRepairLock(client);
      } catch {
        // Releasing the dedicated connection below also releases session locks.
      }
    }
    client?.release();
    await dbModule?.pool.end();
    evidence.completedAt = new Date().toISOString();
    await writeEvidence(evidence, environment);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "check") {
    if (
      FIELD_DEMO_OWNER_BINDING_CONFIRMATION !==
        FIELD_DEMO_OWNER_BINDING_VERSION ||
      FIELD_DEMO_OWNER_RECONCILE_CONFIRMATION !==
        "fieldgrid-staging-field-demo-owner-reconcile-v1" ||
      FIELD_DEMO_PLATFORM_PRIVILEGE_REPAIR_CONFIRMATION !==
        "fieldgrid-staging-field-demo-platform-privilege-repair-v1" ||
      !FIELD_DEMO_HOST.endsWith(".staging.fieldgrid.nl") ||
      !LEGACY_FIELD_DEMO_HOST.endsWith(".fieldgrid.nl")
    ) {
      throw new Error("Field-demo owner-binding static contract is invalid.");
    }
    console.log(`${FIELD_DEMO_OWNER_BINDING_VERSION}: static checks passed`);
    return;
  }
  const result = await runOwnerBindingOperation(options, process.env);
  console.log(`${FIELD_DEMO_OWNER_BINDING_VERSION}: ${result}`);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(formatSafeFieldDemoOwnerBindingError(error));
    process.exitCode = 1;
  });
}

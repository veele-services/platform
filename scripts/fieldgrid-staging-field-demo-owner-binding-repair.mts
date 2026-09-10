#!/usr/bin/env node
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
export const FIELD_DEMO_OWNER_BINDING_PROJECT_REF = "olyfmekyqozxrbrwwszu";
export const FIELD_DEMO_OWNER_BINDING_SUPABASE_URL =
  "https://olyfmekyqozxrbrwwszu.supabase.co";

const OWNER_BINDING_LOCK_KEY =
  "fieldgrid:staging:field-demo-owner-binding-repair:v1";
const OWNER_AUTH_REPAIR_VERSION =
  "fieldgrid-staging-field-demo-owner-repair-v1";
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

type OwnerBindingMode = "check" | "diagnose" | "repair" | "reconcile";

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

type OwnerBindingErrorCode =
  | "field_demo_owner_binding_configuration_invalid"
  | "field_demo_owner_binding_lock_unavailable"
  | "field_demo_owner_binding_precondition_invalid"
  | "field_demo_owner_binding_mutation_failed"
  | "field_demo_owner_binding_postcondition_invalid"
  | "field_demo_owner_binding_failed";

type OwnerBindingFailureStage =
  | "configuration"
  | "database_bootstrap"
  | "database_transaction"
  | "owner_binding_precondition"
  | "owner_binding_mutation"
  | "owner_binding_postcondition"
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
  schemaVersion: 1;
  contract: typeof FIELD_DEMO_OWNER_BINDING_VERSION;
  environment: "staging";
  operation: "diagnose" | "repair" | "reconcile";
  expectedMainSha: string;
  status: "passed" | "failed";
  observedState: FieldDemoOwnerBindingState | null;
  result:
    | "diagnosed"
    | "reconciled-retained-owner"
    | FieldDemoOwnerBindingRepairResult
    | null;
  mutationAttempted: boolean;
  errorCode: OwnerBindingErrorCode | null;
  failureStage: OwnerBindingFailureStage;
  failureReason: FieldDemoOwnerBindingFailureReason | null;
  startedAt: string;
  completedAt: string;
};

type Queryable = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
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
    target.retainedUser.id !== FIELD_DEMO_RETAINED_OWNER_ID ||
    target.retainedUser.email.toLowerCase() !== FIELD_DEMO_OWNER_EMAIL ||
    target.supersededUser.id !== FIELD_DEMO_SUPERSEDED_OWNER_ID ||
    target.supersededUser.email.toLowerCase() !==
      FIELD_DEMO_SUPERSEDED_OWNER_EMAIL ||
    target.ownerMemberships.length !== 2 ||
    target.ownerMemberships.some(
      (membership) =>
        membership.role !== "owner" || membership.status !== "active",
    ) ||
    !target.ownerMemberships.some(
      (membership) => membership.userId === FIELD_DEMO_RETAINED_OWNER_ID,
    ) ||
    !target.ownerMemberships.some(
      (membership) => membership.userId === FIELD_DEMO_SUPERSEDED_OWNER_ID,
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
    FIELD_DEMO_SUPERSEDED_OWNER_ID,
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
      ["--check", "--diagnose", "--repair", "--reconcile"].includes(
        argument ?? "",
      )
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
    snapshot.auth_exact_count !== 1 ||
    snapshot.email_identity_count !== 1 ||
    snapshot.platform_user_count !== 0 ||
    !snapshot.owner_user_id ||
    !UUID_PATTERN.test(snapshot.owner_user_id)
  ) {
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

export const FIELD_DEMO_OWNER_BINDING_SNAPSHOT_QUERY = `WITH target AS (
  SELECT id, plan_key, is_active, status
    FROM public.tenants
   WHERE slug = $1
), owner_account AS (
  SELECT auth_user.id
    FROM auth.users AS auth_user
   WHERE lower(auth_user.email) = lower($2)
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
    WHERE domain = $3) AS exact_domain_global_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains
    WHERE domain = $4) AS legacy_domain_global_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains AS domain
    JOIN target ON target.id = domain.tenant_id) AS target_domain_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains AS domain
    JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $3) AS target_exact_domain_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains AS domain
    JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $4) AS target_legacy_domain_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains AS domain
    JOIN target ON target.id = domain.tenant_id
    WHERE domain.is_primary = true) AS target_primary_domain_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domains AS domain
    JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $4
      AND domain.type = 'fieldgrid_subdomain'
      AND domain.is_primary = true
      AND domain.verification_status IN ('verified', 'active')
      AND domain.verified_at IS NOT NULL
      AND domain.disabled_at IS NULL) AS target_legacy_ready_count,
  (SELECT COUNT(*)::integer FROM public.tenant_domain_checks AS domain_check
    JOIN public.tenant_domains AS domain
      ON domain.id = domain_check.tenant_domain_id
    JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $4) AS legacy_domain_check_count,
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
    WHERE hostname = $3) AS exact_domain_binding_count,
  (SELECT COUNT(*)::integer FROM public.website_domain_bindings
    WHERE hostname = $4) AS legacy_domain_binding_count,
  (SELECT COUNT(*)::integer FROM owner_account) AS auth_email_count,
  (SELECT COUNT(*)::integer FROM auth.users AS auth_user
    WHERE lower(auth_user.email) = lower($2)
      AND auth_user.email_confirmed_at IS NOT NULL
      AND coalesce(length(auth_user.encrypted_password), 0) > 0
      AND auth_user.is_anonymous = false
      AND auth_user.aud = 'authenticated'
      AND auth_user.role = 'authenticated'
      AND auth_user.deleted_at IS NULL
      AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= now())
      AND auth_user.raw_app_meta_data ->> 'fieldgrid_automation_contract' = $5
      AND auth_user.raw_app_meta_data ->> 'fieldgrid_environment' = 'staging'
      AND auth_user.raw_app_meta_data ->> 'portal' = 'tenant-admin'
      AND (auth_user.raw_app_meta_data -> 'credential_activation_pending')
        IS NOT DISTINCT FROM 'true'::jsonb
      AND (auth_user.raw_app_meta_data -> 'backoffice_profile_name_required')
        IS NOT DISTINCT FROM 'true'::jsonb) AS auth_exact_count,
  (SELECT COUNT(*)::integer FROM auth.identities AS identity
    JOIN owner_account ON owner_account.id = identity.user_id
    WHERE identity.provider = 'email'
      AND lower(identity.identity_data ->> 'email') = lower($2))
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
      WHERE lower(auth_user.email) = lower($1)
      ORDER BY auth_user.id FOR UPDATE`,
    [FIELD_DEMO_OWNER_EMAIL],
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
         WHERE lower(auth_user.email) = lower($2)
      ) OR (membership.tenant_id IN (
        SELECT tenant.id FROM public.tenants AS tenant WHERE tenant.slug = $1
      ) AND membership.role = 'owner')
      ORDER BY membership.id FOR UPDATE`,
    [FIELD_DEMO_SLUG, FIELD_DEMO_OWNER_EMAIL],
  );
  await queryable.query(
    `SELECT user_role.id FROM public.tenant_user_roles AS user_role
      WHERE user_role.user_id IN (
        SELECT auth_user.id FROM auth.users AS auth_user
         WHERE lower(auth_user.email) = lower($1)
      ) ORDER BY user_role.id FOR UPDATE`,
    [FIELD_DEMO_OWNER_EMAIL],
  );
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
      WHERE auth_user.id = ANY($1::uuid[]) ORDER BY auth_user.id FOR UPDATE`,
    [[FIELD_DEMO_RETAINED_OWNER_ID, FIELD_DEMO_SUPERSEDED_OWNER_ID]],
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
      ) AND user_role.user_id = ANY($2::uuid[])
      ORDER BY user_role.id FOR UPDATE`,
    [
      FIELD_DEMO_SLUG,
      [FIELD_DEMO_RETAINED_OWNER_ID, FIELD_DEMO_SUPERSEDED_OWNER_ID],
    ],
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
      WHERE id = ANY($1::uuid[])
      ORDER BY id`,
    [[FIELD_DEMO_RETAINED_OWNER_ID, FIELD_DEMO_SUPERSEDED_OWNER_ID]],
  );
  const retainedUser = users.rows.find(
    (user) => user.id === FIELD_DEMO_RETAINED_OWNER_ID,
  );
  const supersededUser = users.rows.find(
    (user) => user.id === FIELD_DEMO_SUPERSEDED_OWNER_ID,
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
  operation: "diagnose" | "repair" | "reconcile",
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
  "diagnosed" | "reconciled-retained-owner" | FieldDemoOwnerBindingRepairResult
> {
  if (options.mode === "check") {
    throw new Error("Static checks cannot access the database.");
  }
  const operation = options.mode;
  const startedAt = new Date().toISOString();
  let failureStage: OwnerBindingFailureStage = "configuration";
  let mutationAttempted = false;
  let transactionStarted = false;
  let transactionFinished = false;
  let observedState: FieldDemoOwnerBindingState | null = null;
  let dbModule: DatabaseModule | null = null;
  let client:
    | (Queryable & { release: (error?: Error | boolean) => void })
    | null = null;
  const evidence: OwnerBindingEvidence = {
    schemaVersion: 1,
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
    evidence.failureReason = safeFieldDemoOwnerBindingFailureReason(error);
    evidence.observedState = observedState;
    evidence.mutationAttempted = mutationAttempted;
    throw error;
  } finally {
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

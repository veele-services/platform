#!/usr/bin/env node
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FIELD_DEMO_DOMAIN_REPAIR_VERSION =
  "fieldgrid-staging-field-demo-domain-repair-v1";
export const FIELD_DEMO_DOMAIN_REPAIR_CONFIRMATION =
  "fieldgrid-staging-field-demo-domain-repair-v1";
export const FIELD_DEMO_DOMAIN_REPAIR_PROJECT_REF = "olyfmekyqozxrbrwwszu";
export const FIELD_DEMO_DOMAIN_REPAIR_SUPABASE_URL =
  "https://olyfmekyqozxrbrwwszu.supabase.co";
export const FIELD_DEMO_HOST = "field-demo.staging.fieldgrid.nl";
export const FIELD_DEMO_SLUG = "field-demo";
export const FIELD_DEMO_OWNER_EMAIL = "info@dgwebservices.nl";
export const LEGACY_FIELD_DEMO_HOST = "field-demo.fieldgrid.nl";

const DOMAIN_REPAIR_LOCK_KEY = "fieldgrid:staging:field-demo-domain-repair:v1";
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const RUN_NUMBER_PATTERN = /^[1-9][0-9]{0,19}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type DomainMode = "check" | "diagnose" | "repair";

type DomainOptions = {
  mode: DomainMode;
  expectedSha: string;
};

type DomainEnvironment = Record<string, string | undefined> & {
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
  FIELDGRID_FIELD_DEMO_DOMAIN_REPAIR_CONFIRMATION?: string;
};

export type FieldDemoDomainSnapshot = {
  tenant_id: string | null;
  slug_tenant_count: number;
  exact_domain_global_count: number;
  legacy_domain_global_count: number;
  target_domain_count: number;
  target_exact_domain_count: number;
  target_legacy_domain_count: number;
  target_primary_domain_count: number;
  target_exact_primary_count: number;
  target_exact_ready_count: number;
  target_exact_normalizable_count: number;
  target_legacy_ready_count: number;
  legacy_domain_check_count: number;
  target_tenant_core_valid_count: number;
  organization_settings_count: number;
  active_subscription_count: number;
  active_enterprise_subscription_count: number;
  expected_owner_count: number;
  expected_owner_management_role_count: number;
  website_site_count: number;
  active_website_site_count: number;
  website_binding_count: number;
  active_website_binding_count: number;
  exact_domain_binding_count: number;
  legacy_domain_binding_count: number;
};

export type FieldDemoDomainState =
  | "already-valid"
  | "missing-domain"
  | "exact-domain-needs-normalization"
  | "legacy-domain-needs-migration"
  | "unsafe";

export type FieldDemoDomainShape =
  | "ready"
  | "missing"
  | "normalizable-exact"
  | "legacy"
  | "collision"
  | "unsupported";

export type FieldDemoDomainFailureReason =
  | "tenant-identity-invalid"
  | "expected-domain-collision"
  | "tenant-runtime-invalid"
  | "organization-settings-invalid"
  | "subscription-invalid"
  | "owner-invalid"
  | "website-state-present"
  | "domain-history-present"
  | "domain-shape-unsupported";

export type FieldDemoDomainDecision = {
  state: FieldDemoDomainState;
  failureReason: FieldDemoDomainFailureReason | null;
};

export type FieldDemoDomainRepairResult =
  | "already-valid"
  | "legacy-migrated-and-verified";

type DomainErrorCode =
  | "field_demo_domain_configuration_invalid"
  | "field_demo_domain_lock_unavailable"
  | "field_demo_domain_precondition_invalid"
  | "field_demo_domain_mutation_failed"
  | "field_demo_domain_postcondition_invalid"
  | "field_demo_domain_failed";

type DomainFailureStage =
  | "configuration"
  | "database_bootstrap"
  | "database_transaction"
  | "domain_precondition"
  | "domain_mutation"
  | "domain_postcondition"
  | null;

class FieldDemoDomainError extends Error {
  readonly code: DomainErrorCode;
  readonly failureStage: DomainFailureStage;
  readonly failureReason: FieldDemoDomainFailureReason | null;

  constructor(
    code: DomainErrorCode,
    message: string,
    failureStage: DomainFailureStage,
    failureReason: FieldDemoDomainFailureReason | null = null,
  ) {
    super(message);
    this.name = "FieldDemoDomainError";
    this.code = code;
    this.failureStage = failureStage;
    this.failureReason = failureReason;
  }
}

type DomainEvidence = {
  schemaVersion: 1;
  contract: typeof FIELD_DEMO_DOMAIN_REPAIR_VERSION;
  environment: "staging";
  operation: "diagnose" | "repair";
  expectedMainSha: string;
  status: "passed" | "failed";
  observedState: FieldDemoDomainState | null;
  observedShape: FieldDemoDomainShape | null;
  result: "diagnosed" | FieldDemoDomainRepairResult | null;
  mutationAttempted: boolean;
  errorCode: DomainErrorCode | null;
  failureStage: DomainFailureStage;
  failureReason: FieldDemoDomainFailureReason | null;
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

type DomainRepairDependencies = {
  readSnapshot: () => Promise<FieldDemoDomainSnapshot>;
  migrateLegacyDomain: (tenantId: string) => Promise<void>;
};

type DomainAuditContext = {
  expectedSha: string;
  runId: string;
  runAttempt: string;
};

function parseArgs(argv: string[]): DomainOptions {
  let mode: DomainMode | null = null;
  let expectedSha = "";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["--check", "--diagnose", "--repair"].includes(argument ?? "")) {
      if (mode) throw new Error("Choose exactly one domain operation.");
      mode = argument!.slice(2) as DomainMode;
      continue;
    }
    if (argument === "--expected-sha") {
      expectedSha = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new Error(`Unknown domain-repair argument: ${argument}`);
  }
  if (!mode) throw new Error("Choose exactly one domain operation.");
  if (mode !== "check" && !SHA_PATTERN.test(expectedSha)) {
    throw new Error("Domain operation requires an exact main SHA.");
  }
  return { mode, expectedSha };
}

function exactStagingSupabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.origin === FIELD_DEMO_DOMAIN_REPAIR_SUPABASE_URL &&
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

export function validateFieldDemoDomainConfig(
  options: DomainOptions,
  environment: DomainEnvironment,
): string[] {
  if (options.mode === "check") return [];
  const errors: string[] = [];
  if (environment.APP_ENV !== "staging") errors.push("APP_ENV must be staging");
  if (environment.TARGET_ENVIRONMENT !== "staging") {
    errors.push("TARGET_ENVIRONMENT must be staging");
  }
  if (environment.GITHUB_ACTIONS !== "true") {
    errors.push("domain operation may run only in GitHub Actions");
  }
  if (environment.GITHUB_EVENT_NAME !== "workflow_dispatch") {
    errors.push("domain operation requires workflow_dispatch");
  }
  if (environment.GITHUB_REPOSITORY !== "veele-services/platform") {
    errors.push("domain operation repository is invalid");
  }
  if (!RUN_NUMBER_PATTERN.test(environment.GITHUB_RUN_ID ?? "")) {
    errors.push("domain operation run id is invalid");
  }
  if (!RUN_NUMBER_PATTERN.test(environment.GITHUB_RUN_ATTEMPT ?? "")) {
    errors.push("domain operation run attempt is invalid");
  }
  if (
    environment.GITHUB_REF !== "refs/heads/main" ||
    environment.GITHUB_REF_NAME !== "main"
  ) {
    errors.push("domain operation must run from main");
  }
  if (
    !SHA_PATTERN.test(options.expectedSha) ||
    environment.GITHUB_SHA !== options.expectedSha
  ) {
    errors.push("checkout SHA differs from the expected main SHA");
  }
  if (
    environment.FIELDGRID_FIELD_DEMO_DOMAIN_REPAIR_CONFIRMATION !==
    FIELD_DEMO_DOMAIN_REPAIR_CONFIRMATION
  ) {
    errors.push("confirmation does not authorize domain operation");
  }
  if (
    environment.EXPECTED_SUPABASE_PROJECT_REF !==
    FIELD_DEMO_DOMAIN_REPAIR_PROJECT_REF
  ) {
    errors.push("domain operation project ref is invalid");
  }
  if (!exactStagingSupabaseUrl(environment.NEXT_PUBLIC_SUPABASE_URL)) {
    errors.push("domain operation Supabase URL is invalid");
  }
  if (!environment.DATABASE_URL?.trim()) {
    errors.push("runtime database URL is required");
  }
  if (!environment.FIELDGRID_MIGRATION_DATABASE_URL?.trim()) {
    errors.push("migration database URL is required");
  }
  if (environment.FIELDGRID_DATABASE_CONNECTION_PURPOSE !== "migration") {
    errors.push("domain operation requires the migration connection purpose");
  }
  return errors;
}

const COUNT_FIELDS: ReadonlyArray<keyof FieldDemoDomainSnapshot> = [
  "slug_tenant_count",
  "exact_domain_global_count",
  "legacy_domain_global_count",
  "target_domain_count",
  "target_exact_domain_count",
  "target_legacy_domain_count",
  "target_primary_domain_count",
  "target_exact_primary_count",
  "target_exact_ready_count",
  "target_exact_normalizable_count",
  "target_legacy_ready_count",
  "legacy_domain_check_count",
  "target_tenant_core_valid_count",
  "organization_settings_count",
  "active_subscription_count",
  "active_enterprise_subscription_count",
  "expected_owner_count",
  "expected_owner_management_role_count",
  "website_site_count",
  "active_website_site_count",
  "website_binding_count",
  "active_website_binding_count",
  "exact_domain_binding_count",
  "legacy_domain_binding_count",
];

export function classifyFieldDemoDomainShape(
  snapshot: FieldDemoDomainSnapshot,
): FieldDemoDomainShape {
  if (
    snapshot.exact_domain_global_count > 1 ||
    snapshot.target_exact_domain_count > 1 ||
    snapshot.exact_domain_global_count !== snapshot.target_exact_domain_count ||
    snapshot.legacy_domain_global_count > 1 ||
    snapshot.target_legacy_domain_count > 1 ||
    snapshot.legacy_domain_global_count !== snapshot.target_legacy_domain_count
  ) {
    return "collision";
  }
  if (
    snapshot.exact_domain_global_count === 1 &&
    snapshot.legacy_domain_global_count === 0 &&
    snapshot.target_exact_domain_count === 1 &&
    snapshot.target_legacy_domain_count === 0 &&
    snapshot.target_primary_domain_count === 1 &&
    snapshot.target_exact_primary_count === 1 &&
    snapshot.target_exact_ready_count === 1
  ) {
    return "ready";
  }
  if (
    snapshot.exact_domain_global_count === 0 &&
    snapshot.legacy_domain_global_count === 0 &&
    snapshot.target_domain_count === 0 &&
    snapshot.target_exact_domain_count === 0 &&
    snapshot.target_legacy_domain_count === 0 &&
    snapshot.target_primary_domain_count === 0
  ) {
    return "missing";
  }
  if (
    snapshot.exact_domain_global_count === 1 &&
    snapshot.legacy_domain_global_count === 0 &&
    snapshot.target_domain_count === 1 &&
    snapshot.target_exact_domain_count === 1 &&
    snapshot.target_legacy_domain_count === 0 &&
    snapshot.target_primary_domain_count <= 1 &&
    snapshot.target_exact_normalizable_count === 1
  ) {
    return "normalizable-exact";
  }
  if (
    snapshot.exact_domain_global_count === 0 &&
    snapshot.legacy_domain_global_count === 1 &&
    snapshot.target_domain_count === 1 &&
    snapshot.target_exact_domain_count === 0 &&
    snapshot.target_legacy_domain_count === 1 &&
    snapshot.target_primary_domain_count === 1 &&
    snapshot.target_legacy_ready_count === 1 &&
    snapshot.legacy_domain_check_count === 0
  ) {
    return "legacy";
  }
  return "unsupported";
}

export function classifyFieldDemoDomain(
  snapshot: FieldDemoDomainSnapshot,
): FieldDemoDomainDecision {
  const shape = classifyFieldDemoDomainShape(snapshot);
  if (
    COUNT_FIELDS.some(
      (field) =>
        !Number.isInteger(snapshot[field]) || Number(snapshot[field]) < 0,
    ) ||
    snapshot.slug_tenant_count !== 1 ||
    !snapshot.tenant_id ||
    !UUID_PATTERN.test(snapshot.tenant_id)
  ) {
    return { state: "unsafe", failureReason: "tenant-identity-invalid" };
  }
  if (shape === "collision") {
    return { state: "unsafe", failureReason: "expected-domain-collision" };
  }
  if (snapshot.target_tenant_core_valid_count !== 1) {
    return { state: "unsafe", failureReason: "tenant-runtime-invalid" };
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
    snapshot.expected_owner_count !== 1 ||
    snapshot.expected_owner_management_role_count !== 1
  ) {
    return { state: "unsafe", failureReason: "owner-invalid" };
  }
  if (shape === "ready") {
    return { state: "already-valid", failureReason: null };
  }
  if (
    snapshot.website_site_count !== 0 ||
    snapshot.active_website_site_count !== 0 ||
    snapshot.website_binding_count !== 0 ||
    snapshot.active_website_binding_count !== 0 ||
    snapshot.exact_domain_binding_count !== 0 ||
    snapshot.legacy_domain_binding_count !== 0
  ) {
    return { state: "unsafe", failureReason: "website-state-present" };
  }
  if (shape === "missing") {
    return { state: "missing-domain", failureReason: null };
  }
  if (shape === "normalizable-exact") {
    return {
      state: "exact-domain-needs-normalization",
      failureReason: null,
    };
  }
  if (shape === "legacy") {
    return { state: "legacy-domain-needs-migration", failureReason: null };
  }
  if (
    snapshot.exact_domain_global_count === 0 &&
    snapshot.legacy_domain_global_count === 1 &&
    snapshot.target_domain_count === 1 &&
    snapshot.target_legacy_domain_count === 1 &&
    snapshot.target_primary_domain_count === 1 &&
    snapshot.target_legacy_ready_count === 1 &&
    snapshot.legacy_domain_check_count > 0
  ) {
    return { state: "unsafe", failureReason: "domain-history-present" };
  }
  return { state: "unsafe", failureReason: "domain-shape-unsupported" };
}

export async function repairFieldDemoDomain(
  dependencies: DomainRepairDependencies,
): Promise<FieldDemoDomainRepairResult> {
  const before = await dependencies.readSnapshot();
  const decision = classifyFieldDemoDomain(before);
  if (decision.state === "unsafe") {
    throw new FieldDemoDomainError(
      "field_demo_domain_precondition_invalid",
      "Field-demo domain state is unsafe for repair.",
      "domain_precondition",
      decision.failureReason,
    );
  }
  if (decision.state === "already-valid") return "already-valid";
  if (!before.tenant_id) {
    throw new FieldDemoDomainError(
      "field_demo_domain_precondition_invalid",
      "Field-demo tenant identity is unavailable.",
      "domain_precondition",
      "tenant-identity-invalid",
    );
  }
  if (decision.state !== "legacy-domain-needs-migration") {
    throw new FieldDemoDomainError(
      "field_demo_domain_precondition_invalid",
      "Only the dependency-free legacy staging domain can be repaired.",
      "domain_precondition",
      "domain-shape-unsupported",
    );
  }
  try {
    await dependencies.migrateLegacyDomain(before.tenant_id);
  } catch {
    throw new FieldDemoDomainError(
      "field_demo_domain_mutation_failed",
      "Field-demo domain mutation failed.",
      "domain_mutation",
    );
  }
  const after = await dependencies.readSnapshot();
  if (classifyFieldDemoDomain(after).state !== "already-valid") {
    throw new FieldDemoDomainError(
      "field_demo_domain_postcondition_invalid",
      "Field-demo domain postcondition is not exact.",
      "domain_postcondition",
    );
  }
  return "legacy-migrated-and-verified";
}

export function safeFieldDemoDomainErrorCode(error: unknown): DomainErrorCode {
  return error instanceof FieldDemoDomainError
    ? error.code
    : "field_demo_domain_failed";
}

export function safeFieldDemoDomainFailureReason(
  error: unknown,
): FieldDemoDomainFailureReason | null {
  return error instanceof FieldDemoDomainError ? error.failureReason : null;
}

export function formatSafeFieldDemoDomainError(error: unknown): string {
  const reason = safeFieldDemoDomainFailureReason(error);
  return `${FIELD_DEMO_DOMAIN_REPAIR_VERSION}: ${safeFieldDemoDomainErrorCode(
    error,
  )}${reason ? `:${reason}` : ""}`;
}

export const FIELD_DEMO_DOMAIN_SNAPSHOT_QUERY = `WITH target AS (
  SELECT id, plan_key, is_active, status
    FROM public.tenants
   WHERE slug = $1
)
SELECT
  (SELECT id::text FROM target ORDER BY id LIMIT 1) AS tenant_id,
  (SELECT COUNT(*)::integer FROM target) AS slug_tenant_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_domains AS domain
    WHERE domain.domain = $2) AS exact_domain_global_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_domains AS domain
    WHERE domain.domain = $4) AS legacy_domain_global_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_domains AS domain
     JOIN target ON target.id = domain.tenant_id) AS target_domain_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_domains AS domain
     JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $2) AS target_exact_domain_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_domains AS domain
     JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $4) AS target_legacy_domain_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_domains AS domain
     JOIN target ON target.id = domain.tenant_id
    WHERE domain.is_primary = true) AS target_primary_domain_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_domains AS domain
     JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $2 AND domain.is_primary = true)
    AS target_exact_primary_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_domains AS domain
     JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $2
      AND domain.type = 'fieldgrid_subdomain'
      AND domain.is_primary = true
      AND domain.verification_status IN ('verified', 'active')
      AND domain.verified_at IS NOT NULL
      AND domain.disabled_at IS NULL) AS target_exact_ready_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_domains AS domain
     JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $2
      AND domain.type = 'fieldgrid_subdomain'
      AND domain.verification_status IN (
        'pending', 'pending_dns', 'dns_seen', 'verified', 'tls_pending', 'active'
      )
      AND domain.disabled_at IS NULL) AS target_exact_normalizable_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_domains AS domain
     JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $4
      AND domain.type = 'fieldgrid_subdomain'
      AND domain.is_primary = true
      AND domain.verification_status IN ('verified', 'active')
      AND domain.verified_at IS NOT NULL
      AND domain.disabled_at IS NULL) AS target_legacy_ready_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_domain_checks AS domain_check
     JOIN public.tenant_domains AS domain
       ON domain.id = domain_check.tenant_domain_id
     JOIN target ON target.id = domain.tenant_id
    WHERE domain.domain = $4) AS legacy_domain_check_count,
  (SELECT COUNT(*)::integer
     FROM target
    WHERE target.plan_key = 'enterprise'
      AND target.is_active = true
      AND target.status IN ('trial', 'active')) AS target_tenant_core_valid_count,
  (SELECT COUNT(*)::integer
     FROM public.organization_settings AS settings
     JOIN target ON target.id = settings.tenant_id)
    AS organization_settings_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_subscriptions AS subscription
     JOIN target ON target.id = subscription.tenant_id
    WHERE subscription.status IN ('trial', 'active'))
    AS active_subscription_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_subscriptions AS subscription
     JOIN public.plans AS plan ON plan.id = subscription.plan_id
     JOIN target ON target.id = subscription.tenant_id
    WHERE subscription.status IN ('trial', 'active')
      AND plan.key = 'enterprise'
      AND plan.is_active = true) AS active_enterprise_subscription_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_users AS membership
     JOIN auth.users AS owner ON owner.id = membership.user_id
     JOIN target ON target.id = membership.tenant_id
    WHERE membership.role = 'owner'
      AND membership.status = 'active'
      AND lower(owner.email) = lower($3)
      AND owner.email_confirmed_at IS NOT NULL
      AND length(owner.encrypted_password) > 0
      AND owner.is_anonymous = false
      AND owner.aud = 'authenticated'
      AND owner.role = 'authenticated'
      AND owner.deleted_at IS NULL
      AND (owner.banned_until IS NULL OR owner.banned_until <= now()))
    AS expected_owner_count,
  (SELECT COUNT(*)::integer
     FROM public.tenant_users AS membership
     JOIN auth.users AS owner ON owner.id = membership.user_id
     JOIN target ON target.id = membership.tenant_id
    WHERE membership.role = 'owner'
      AND membership.status = 'active'
      AND lower(owner.email) = lower($3)
      AND owner.email_confirmed_at IS NOT NULL
      AND length(owner.encrypted_password) > 0
      AND owner.is_anonymous = false
      AND owner.aud = 'authenticated'
      AND owner.role = 'authenticated'
      AND owner.deleted_at IS NULL
      AND (owner.banned_until IS NULL OR owner.banned_until <= now())
      AND EXISTS (
        SELECT 1
          FROM public.tenant_user_roles AS user_role
          JOIN public.tenant_roles AS tenant_role
            ON tenant_role.id = user_role.tenant_role_id
           AND tenant_role.tenant_id = user_role.tenant_id
          JOIN public.roles AS template_role
            ON template_role.id = tenant_role.template_role_id
           AND template_role.name = 'Management'
         WHERE user_role.tenant_id = membership.tenant_id
           AND user_role.user_id = membership.user_id
           AND EXISTS (
             SELECT 1 FROM public.role_permissions AS expected_permission
              WHERE expected_permission.role_id = template_role.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM public.role_permissions AS expected_permission
              WHERE expected_permission.role_id = template_role.id
                AND NOT EXISTS (
                  SELECT 1
                    FROM public.tenant_role_permissions AS actual_permission
                   WHERE actual_permission.tenant_role_id = tenant_role.id
                     AND actual_permission.permission_id =
                       expected_permission.permission_id
                )
           )
      )) AS expected_owner_management_role_count,
  (SELECT COUNT(*)::integer
     FROM public.website_sites AS site
     JOIN target ON target.id = site.tenant_id) AS website_site_count,
  (SELECT COUNT(*)::integer
     FROM public.website_sites AS site
     JOIN target ON target.id = site.tenant_id
    WHERE site.status = 'active') AS active_website_site_count,
  (SELECT COUNT(*)::integer
     FROM public.website_domain_bindings AS binding
     JOIN target ON target.id = binding.tenant_id) AS website_binding_count,
  (SELECT COUNT(*)::integer
     FROM public.website_domain_bindings AS binding
     JOIN target ON target.id = binding.tenant_id
    WHERE binding.status = 'active') AS active_website_binding_count,
  (SELECT COUNT(*)::integer
     FROM public.website_domain_bindings AS binding
    WHERE binding.hostname = $2) AS exact_domain_binding_count,
  (SELECT COUNT(*)::integer
     FROM public.website_domain_bindings AS binding
    WHERE binding.hostname = $4) AS legacy_domain_binding_count`;

export async function loadFieldDemoDomainSnapshot(
  queryable: Queryable,
): Promise<FieldDemoDomainSnapshot> {
  const result = await queryable.query<FieldDemoDomainSnapshot>(
    FIELD_DEMO_DOMAIN_SNAPSHOT_QUERY,
    [
      FIELD_DEMO_SLUG,
      FIELD_DEMO_HOST,
      FIELD_DEMO_OWNER_EMAIL,
      LEGACY_FIELD_DEMO_HOST,
    ],
  );
  if (result.rows.length !== 1) {
    throw new FieldDemoDomainError(
      "field_demo_domain_precondition_invalid",
      "Field-demo domain snapshot is not singular.",
      "domain_precondition",
      "tenant-identity-invalid",
    );
  }
  return result.rows[0]!;
}

async function acquireDomainRepairLock(queryable: Queryable): Promise<void> {
  const result = await queryable.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired`,
    [DOMAIN_REPAIR_LOCK_KEY],
  );
  if (result.rows.length !== 1 || result.rows[0]?.acquired !== true) {
    throw new FieldDemoDomainError(
      "field_demo_domain_lock_unavailable",
      "Field-demo domain repair lock is unavailable.",
      "database_transaction",
    );
  }
}

async function lockFieldDemoDomainRows(queryable: Queryable): Promise<void> {
  await queryable.query(
    `SELECT tenant.id
       FROM public.tenants AS tenant
      WHERE tenant.slug = $1
      ORDER BY tenant.id
      FOR UPDATE`,
    [FIELD_DEMO_SLUG],
  );
  await queryable.query(
    `SELECT domain.id
       FROM public.tenant_domains AS domain
      WHERE domain.tenant_id IN (
              SELECT tenant.id FROM public.tenants AS tenant WHERE tenant.slug = $1
            )
         OR domain.domain IN ($2, $3)
      ORDER BY domain.id
      FOR UPDATE`,
    [FIELD_DEMO_SLUG, FIELD_DEMO_HOST, LEGACY_FIELD_DEMO_HOST],
  );
}

async function migrateLegacyFieldDemoDomain(
  queryable: Queryable,
  tenantId: string,
  audit: DomainAuditContext,
): Promise<void> {
  const migrated = await queryable.query<{
    domain_id: string;
    tenant_id: string;
  }>(
    `UPDATE public.tenant_domains
        SET domain = $2,
            updated_at = now()
      WHERE tenant_id = $1
        AND domain = $3
        AND type = 'fieldgrid_subdomain'
        AND is_primary = true
        AND verification_status IN ('verified', 'active')
        AND verified_at IS NOT NULL
        AND disabled_at IS NULL
     RETURNING id::text AS domain_id, tenant_id::text AS tenant_id`,
    [tenantId, FIELD_DEMO_HOST, LEGACY_FIELD_DEMO_HOST],
  );
  const domain = migrated.rows[0];
  if (
    migrated.rowCount !== 1 ||
    !domain ||
    !UUID_PATTERN.test(domain.domain_id) ||
    domain.tenant_id !== tenantId
  ) {
    throw new Error("legacy domain migration was not singular");
  }
  await recordDomainRepairCheck(
    queryable,
    tenantId,
    domain.domain_id,
    "legacy-domain-renamed",
    audit,
  );
}

async function recordDomainRepairCheck(
  queryable: Queryable,
  tenantId: string,
  tenantDomainId: string,
  action: "legacy-domain-renamed",
  audit: DomainAuditContext,
): Promise<void> {
  const details = JSON.stringify({
    contract: FIELD_DEMO_DOMAIN_REPAIR_VERSION,
    environment: "staging",
    action,
    expectedMainSha: audit.expectedSha,
    workflowRunId: audit.runId,
    workflowRunAttempt: audit.runAttempt,
  });
  const result = await queryable.query(
    `INSERT INTO public.tenant_domain_checks (
       tenant_domain_id, tenant_id, check_type, status, details
     ) VALUES ($1, $2, 'automation_repair', 'passed', $3::jsonb)`,
    [tenantDomainId, tenantId, details],
  );
  if (result.rowCount !== 1) throw new Error("domain audit was not singular");
}

function evidencePath(
  operation: "diagnose" | "repair",
  environment: DomainEnvironment,
): string {
  const runId = environment.GITHUB_RUN_ID ?? "";
  const runAttempt = environment.GITHUB_RUN_ATTEMPT ?? "";
  if (!RUN_NUMBER_PATTERN.test(runId) || !RUN_NUMBER_PATTERN.test(runAttempt)) {
    throw new Error("Domain evidence identity is invalid.");
  }
  return join(
    repoRoot,
    "artifacts",
    "field-demo-domain-repair",
    `${operation}-${runId}-${runAttempt}.json`,
  );
}

async function writeEvidence(
  evidence: DomainEvidence,
  environment: DomainEnvironment,
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

async function runDomainOperation(
  options: DomainOptions,
  environment: DomainEnvironment,
): Promise<"diagnosed" | FieldDemoDomainRepairResult> {
  if (options.mode === "check") {
    throw new Error("Static checks cannot access the database.");
  }
  const operation = options.mode;
  const startedAt = new Date().toISOString();
  let failureStage: DomainFailureStage = "configuration";
  let mutationAttempted = false;
  let transactionStarted = false;
  let transactionFinished = false;
  let observedState: FieldDemoDomainState | null = null;
  let observedShape: FieldDemoDomainShape | null = null;
  let dbModule: DatabaseModule | null = null;
  let client:
    | (Queryable & { release: (error?: Error | boolean) => void })
    | null = null;
  const evidence: DomainEvidence = {
    schemaVersion: 1,
    contract: FIELD_DEMO_DOMAIN_REPAIR_VERSION,
    environment: "staging",
    operation,
    expectedMainSha: options.expectedSha,
    status: "failed",
    observedState: null,
    observedShape: null,
    result: null,
    mutationAttempted: false,
    errorCode: null,
    failureStage: null,
    failureReason: null,
    startedAt,
    completedAt: startedAt,
  };

  try {
    const errors = validateFieldDemoDomainConfig(options, environment);
    if (errors.length > 0) {
      throw new FieldDemoDomainError(
        "field_demo_domain_configuration_invalid",
        "Field-demo domain operation configuration is invalid.",
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
      failureStage = "domain_precondition";
      const snapshot = await loadFieldDemoDomainSnapshot(client);
      const decision = classifyFieldDemoDomain(snapshot);
      observedState = decision.state;
      observedShape = classifyFieldDemoDomainShape(snapshot);
      evidence.failureReason = decision.failureReason;
      await client.query("ROLLBACK");
      transactionFinished = true;
      evidence.status = "passed";
      evidence.observedState = observedState;
      evidence.observedShape = observedShape;
      evidence.result = "diagnosed";
      return "diagnosed";
    }

    await acquireDomainRepairLock(client);
    await lockFieldDemoDomainRows(client);
    failureStage = "domain_precondition";
    const audit: DomainAuditContext = {
      expectedSha: options.expectedSha,
      runId: environment.GITHUB_RUN_ID!,
      runAttempt: environment.GITHUB_RUN_ATTEMPT!,
    };
    const result = await repairFieldDemoDomain({
      readSnapshot: async () => {
        const snapshot = await loadFieldDemoDomainSnapshot(client!);
        if (observedState === null) {
          observedState = classifyFieldDemoDomain(snapshot).state;
          observedShape = classifyFieldDemoDomainShape(snapshot);
        }
        return snapshot;
      },
      migrateLegacyDomain: async (tenantId) => {
        failureStage = "domain_mutation";
        mutationAttempted = true;
        await migrateLegacyFieldDemoDomain(client!, tenantId, audit);
      },
    });
    failureStage = "domain_postcondition";
    await client.query("COMMIT");
    transactionFinished = true;
    const freshSnapshot = await loadFieldDemoDomainSnapshot(client);
    if (classifyFieldDemoDomain(freshSnapshot).state !== "already-valid") {
      throw new FieldDemoDomainError(
        "field_demo_domain_postcondition_invalid",
        "Committed field-demo domain did not pass a fresh readback.",
        "domain_postcondition",
      );
    }
    evidence.status = "passed";
    evidence.observedState = observedState;
    evidence.observedShape = observedShape;
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
    evidence.errorCode = safeFieldDemoDomainErrorCode(error);
    evidence.failureStage =
      error instanceof FieldDemoDomainError ? error.failureStage : failureStage;
    evidence.failureReason = safeFieldDemoDomainFailureReason(error);
    evidence.observedState = observedState;
    evidence.observedShape = observedShape;
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
      FIELD_DEMO_DOMAIN_REPAIR_CONFIRMATION !==
        FIELD_DEMO_DOMAIN_REPAIR_VERSION ||
      !FIELD_DEMO_HOST.endsWith(".staging.fieldgrid.nl")
    ) {
      throw new Error("Field-demo domain static contract is invalid.");
    }
    console.log(`${FIELD_DEMO_DOMAIN_REPAIR_VERSION}: static checks passed`);
    return;
  }
  const result = await runDomainOperation(options, process.env);
  console.log(`${FIELD_DEMO_DOMAIN_REPAIR_VERSION}: ${result}`);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(formatSafeFieldDemoDomainError(error));
    process.exitCode = 1;
  });
}

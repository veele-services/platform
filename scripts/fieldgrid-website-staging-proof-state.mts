#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const WEBSITE_STAGING_PROOF_STATE_VERSION =
  "fieldgrid-website-staging-proof-state-v1";
export const WEBSITE_STAGING_PROOF_MARKER =
  "FIELDGRID_WEBSITE_STAGING_PROOF_W00_V2";
export const MANAGED_PROOF_HOST = "managed-proof-w00-v2.staging.fieldgrid.nl";
export const MANAGED_PROOF_URL = `https://${MANAGED_PROOF_HOST}/`;
export const MANAGED_PROOF_SLUG = "managed-proof-w00-v2";
export const FIELD_DEMO_HOST = "field-demo.staging.fieldgrid.nl";
export const FIELD_DEMO_SLUG = "field-demo";
export const FIELD_DEMO_OWNER_EMAIL = "services@fieldgrid.nl";
export const FIELD_DEMO_FIXTURE_VERSION =
  "fieldgrid-staging-field-demo-fixture-v1";
export const FIELD_DEMO_FIXTURE_MARKER =
  "FIELDGRID_STAGING_FIELD_DEMO_FIXTURE_V1";
export const CUSTOM_PROOF_HOST = "veeleservices.staging.fieldgrid.nl";
export const CUSTOM_PROOF_URL = `https://${CUSTOM_PROOF_HOST}/`;

const PROVIDER_KEY = "fieldgrid_vps";
const HEALTH_PATH = "/api/health";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const CORE_STAGING_BASE_DIR = "/var/www/veele/staging";
const WEBSITE_STACK_STAGING_BASE_DIR = "/var/www/veele/website-stack-staging";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const CHANGE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/# -]{2,159}$/u;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type ProofMode =
  | "check"
  | "prepare-managed"
  | "complete-custom"
  | "verify"
  | "rollback-custom";

type ProofOptions = {
  mode: ProofMode;
  expectedSha: string;
  changeReference: string;
  evidenceDir: string;
};

type ProofEnvironment = Record<string, string | undefined> & {
  APP_ENV?: string;
  TARGET_ENVIRONMENT?: string;
  GITHUB_REF_NAME?: string;
  GITHUB_SHA?: string;
  FIELDGRID_WEBSITE_STAGING_PROOF_CONFIRMATION?: string;
  FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID?: string;
  FIELDGRID_DATABASE_CONNECTION_PURPOSE?: string;
  FIELDGRID_MIGRATION_DATABASE_URL?: string;
  FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON?: string;
  FIELDGRID_CUSTOM_ROUTE_KEY?: string;
  FIELDGRID_CUSTOM_EXPECTED_HOST?: string;
  WEBSITE_MANAGED_ACCEPTANCE_URL?: string;
  WEBSITE_CUSTOM_ACCEPTANCE_URL?: string;
  DATABASE_URL?: string;
};

type Queryable = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};

type DatabaseModule = typeof import("../lib/db/src/index.ts");

type RuntimeTenant = {
  tenantId: string;
  host: string;
  slug: string;
  planKey: string;
};

type ManagedProofSiteDomain = {
  canonicalHostname: string | null;
  canonicalDomainStatus: string | null;
};

type ManagedProofCandidate = {
  tenant_id: string;
  slug: string;
  plan_key: string;
  domain: string | null;
  marker: string | null;
  environment: string | null;
  provisioned_slug: string | null;
  provisioned_plan_key: string | null;
  provisioned_primary_domain: string | null;
  provisioned_owner_email: string | null;
  provisioned_requested_by: string | null;
  tenant_created_by: string | null;
};

export type FieldDemoFixtureCandidate = {
  tenant_id: string;
  slug: string;
  plan_key: string;
  is_active: boolean;
  tenant_status: string;
  primary_domain_count: number;
  primary_domain: string | null;
  primary_domain_type: string | null;
  primary_domain_verification_status: string | null;
  primary_domain_disabled_count: number;
  exact_domain_count: number;
  organization_settings_count: number;
  active_subscription_count: number;
  active_enterprise_subscription_count: number;
  expected_owner_count: number;
  expected_owner_management_role_count: number;
};

export type FieldDemoFixturePresence = {
  slug_match_count: number;
  domain_match_count: number;
};

type FieldDemoFixtureErrorCode =
  | "field_demo_identity_ambiguous"
  | "field_demo_identity_collision"
  | "field_demo_primary_domain_mismatch"
  | "field_demo_plan_mismatch"
  | "field_demo_subscription_invalid"
  | "field_demo_owner_invalid"
  | "field_demo_binding_invalid"
  | "field_demo_settings_invalid"
  | "field_demo_runtime_state_invalid"
  | "field_demo_provisioning_failed"
  | "field_demo_provisioning_verification_failed"
  | "field_demo_rollback_failed";

export type FieldDemoOwnerFailureReason =
  | "field_demo_owner_not_found"
  | "field_demo_owner_ambiguous"
  | "field_demo_owner_deleted"
  | "field_demo_owner_banned"
  | "field_demo_owner_anonymous"
  | "field_demo_owner_email_unconfirmed"
  | "field_demo_owner_password_unset"
  | "field_demo_owner_audience_invalid"
  | "field_demo_owner_role_invalid"
  | "field_demo_owner_id_invalid";

export type FieldDemoOwnerCandidate = {
  user_id: string;
  is_deleted: boolean;
  is_banned: boolean;
  is_anonymous: boolean;
  email_confirmed: boolean;
  password_set: boolean;
  authenticated_audience: boolean;
  authenticated_role: boolean;
};

export type FieldDemoProvisioningRunCandidate = {
  run_id: string;
  tenant_id: string;
  status: string;
  marker: string | null;
  automation_contract: string | null;
  environment: string | null;
  staging_only: string | null;
  expected_sha: string | null;
  change_reference: string | null;
  slug: string;
  plan_key: string;
  primary_domain: string | null;
  owner_email: string | null;
  owner_user_id: string | null;
  owner_invite_status: string;
  current_step: string;
  requested_by: string | null;
  tenant_created_by: string | null;
};

export type FieldDemoFixtureDecision =
  | { action: "provision" }
  | { action: "use-existing" }
  | { action: "reject"; errorCode: FieldDemoFixtureErrorCode };

type ManagedProofCandidateErrorCode =
  | "managed_proof_identity_ambiguous"
  | "managed_proof_identity_mismatch"
  | "managed_proof_plan_mismatch"
  | "managed_proof_ownership_mismatch";

type ProofStateErrorCode =
  | ManagedProofCandidateErrorCode
  | FieldDemoFixtureErrorCode
  | "runtime_host_binding_invalid"
  | "runtime_host_settings_invalid";

type ProofFailureStage =
  | "configuration"
  | "database_bootstrap"
  | "automation_actor"
  | "field_demo_owner"
  | "field_demo_candidate"
  | "field_demo_provision"
  | "field_demo_post_provision"
  | "field_demo_fixture_recheck"
  | "managed_candidate"
  | "managed_post_provision"
  | "managed_final"
  | "managed_public"
  | "release_verification"
  | "custom_operation"
  | "public_verification";

type ProofHostRole = "field_demo" | "managed_proof" | "custom_proof" | null;
type ProofFailureReason = FieldDemoOwnerFailureReason;

class ProofStateError extends Error {
  readonly code: ProofStateErrorCode;
  readonly failureStage: ProofFailureStage | null;
  readonly hostRole: ProofHostRole;
  readonly failureReason: ProofFailureReason | null;

  constructor(
    code: ProofStateErrorCode,
    message: string,
    failureStage: ProofFailureStage | null = null,
    hostRole: ProofHostRole = null,
    failureReason: ProofFailureReason | null = null,
  ) {
    super(message);
    this.name = "ProofStateError";
    this.code = code;
    this.failureStage = failureStage;
    this.hostRole = hostRole;
    this.failureReason = failureReason;
  }
}

type ProofEvidence = {
  schemaVersion: 1;
  contract: typeof WEBSITE_STAGING_PROOF_STATE_VERSION;
  environment: "staging";
  mode: Exclude<ProofMode, "check">;
  expectedSha: string;
  status: "passed" | "failed";
  startedAt: string;
  completedAt: string;
  managed: {
    host: typeof MANAGED_PROOF_HOST;
    deliveryMode: "managed_cms" | null;
    active: boolean;
  };
  custom: {
    host: typeof CUSTOM_PROOF_HOST;
    releaseId: string | null;
    deliveryMode: "custom_nextjs" | null;
    active: boolean;
  };
  errorCode: string | null;
  failureStage: ProofFailureStage | null;
  hostRole: ProofHostRole;
  failureReason: ProofFailureReason | null;
};

function parseArgs(argv: string[]): ProofOptions {
  const options: ProofOptions = {
    mode: "check",
    expectedSha: "",
    changeReference: "",
    evidenceDir: join(repoRoot, "artifacts", "website-staging-proof-state"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.mode = "check";
    else if (argument === "--prepare-managed") options.mode = "prepare-managed";
    else if (argument === "--complete-custom") options.mode = "complete-custom";
    else if (argument === "--verify") options.mode = "verify";
    else if (argument === "--rollback-custom") options.mode = "rollback-custom";
    else if (argument === "--expected-sha")
      options.expectedSha = argv[++index] ?? "";
    else if (argument === "--change-reference")
      options.changeReference = argv[++index] ?? "";
    else if (argument === "--evidence-dir")
      options.evidenceDir = resolve(argv[++index] ?? "");
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function expectedConfirmation(mode: ProofMode): string | null {
  if (mode === "prepare-managed") return "website-staging-prepare-managed";
  if (mode === "complete-custom") return "website-staging-complete-custom";
  if (mode === "rollback-custom") return "website-staging-rollback-custom";
  if (mode === "verify") return "website-staging-read-only";
  return null;
}

function exactHttpsRoot(value: string | undefined, expected: string): boolean {
  try {
    const url = new URL(value ?? "");
    return (
      url.href === expected &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function validateWebsiteStagingProofStateConfig(
  options: ProofOptions,
  environment: ProofEnvironment = process.env,
): string[] {
  if (options.mode === "check") return [];
  const errors: string[] = [];
  if (!SHA_PATTERN.test(options.expectedSha))
    errors.push("expected SHA must be an exact lowercase commit SHA");
  if (!CHANGE_REFERENCE_PATTERN.test(options.changeReference))
    errors.push("change reference is missing or invalid");
  if (environment.APP_ENV !== "staging") errors.push("APP_ENV must be staging");
  if (environment.TARGET_ENVIRONMENT !== "staging")
    errors.push("TARGET_ENVIRONMENT must be staging");
  const expectedRef = options.mode === "prepare-managed" ? "main" : "staging";
  if (environment.GITHUB_REF_NAME !== expectedRef)
    errors.push(`${options.mode} must run from ${expectedRef}`);
  if (environment.GITHUB_SHA !== options.expectedSha)
    errors.push("checkout SHA differs from the expected SHA");
  if (
    environment.FIELDGRID_WEBSITE_STAGING_PROOF_CONFIRMATION !==
    expectedConfirmation(options.mode)
  ) {
    errors.push(`confirmation does not authorize ${options.mode}`);
  }
  if (!environment.DATABASE_URL?.trim())
    errors.push("DATABASE_URL is required");
  const connectionPurpose =
    environment.FIELDGRID_DATABASE_CONNECTION_PURPOSE?.trim();
  if (options.mode === "prepare-managed") {
    if (connectionPurpose !== "migration") {
      errors.push("prepare-managed requires the migration connection purpose");
    }
    if (!environment.FIELDGRID_MIGRATION_DATABASE_URL?.trim()) {
      errors.push("prepare-managed requires the migration database URL");
    }
  } else if (connectionPurpose && connectionPurpose !== "runtime") {
    errors.push(`${options.mode} requires the runtime connection purpose`);
  }
  if (
    !exactHttpsRoot(
      environment.WEBSITE_MANAGED_ACCEPTANCE_URL,
      MANAGED_PROOF_URL,
    )
  ) {
    errors.push(`managed acceptance URL must be ${MANAGED_PROOF_URL}`);
  }
  if (
    !exactHttpsRoot(environment.WEBSITE_CUSTOM_ACCEPTANCE_URL, CUSTOM_PROOF_URL)
  ) {
    errors.push(`custom acceptance URL must be ${CUSTOM_PROOF_URL}`);
  }

  const actor =
    environment.FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID?.trim() ?? "";
  if (actor && !UUID_PATTERN.test(actor)) {
    errors.push("automation actor must be a UUID");
  }
  if (options.mode !== "prepare-managed" && !UUID_PATTERN.test(actor)) {
    errors.push("automation actor is required after prepare-managed");
  }

  if (["complete-custom", "verify", "rollback-custom"].includes(options.mode)) {
    if (environment.FIELDGRID_CUSTOM_EXPECTED_HOST !== CUSTOM_PROOF_HOST) {
      errors.push("custom expected host differs from the reviewed proof host");
    }
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{1,239}$/u.test(
        environment.FIELDGRID_CUSTOM_ROUTE_KEY ?? "",
      )
    ) {
      errors.push("custom route key is missing or invalid");
    }
    try {
      const routes = JSON.parse(
        environment.FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON ?? "",
      ) as unknown;
      if (!Array.isArray(routes)) throw new Error("not an array");
      const exact = routes.filter(
        (route) =>
          route &&
          typeof route === "object" &&
          (route as Record<string, unknown>)["providerKey"] === PROVIDER_KEY &&
          (route as Record<string, unknown>)["routeKey"] ===
            environment.FIELDGRID_CUSTOM_ROUTE_KEY &&
          (route as Record<string, unknown>)["releaseId"] ===
            `git-commit:${options.expectedSha}` &&
          (route as Record<string, unknown>)["healthPath"] === HEALTH_PATH &&
          (route as Record<string, unknown>)["status"] === "routable" &&
          Array.isArray((route as Record<string, unknown>)["expectedHosts"]) &&
          (
            (route as Record<string, unknown>)["expectedHosts"] as unknown[]
          ).includes(CUSTOM_PROOF_HOST),
      );
      if (exact.length !== 1)
        errors.push("exact custom route identity is missing or ambiguous");
    } catch {
      errors.push("custom route registry is invalid");
    }
  }
  return errors;
}

export function safeErrorCode(error: unknown): string {
  if (error instanceof ProofStateError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  if (/collision/iu.test(message)) return "proof_state_collision";
  if (/actor/iu.test(message)) return "automation_actor_invalid";
  if (/health/iu.test(message)) return "custom_health_invalid";
  if (/public/iu.test(message)) return "public_verification_failed";
  if (/database|principal|credential|certificate|\btls\b/iu.test(message))
    return "database_configuration_invalid";
  return "proof_state_failed";
}

export function safeFailureReason(error: unknown): ProofFailureReason | null {
  return error instanceof ProofStateError ? error.failureReason : null;
}

export function formatSafeProofStateError(error: unknown): string {
  const reason = safeFailureReason(error);
  return `${WEBSITE_STAGING_PROOF_STATE_VERSION}: ${safeErrorCode(error)}${
    reason ? `:${reason}` : ""
  }`;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(path, 0o600);
}

async function resolveAutomationActor(
  queryable: Queryable,
  configuredActor: string | undefined,
): Promise<string> {
  const requested = configuredActor?.trim() ?? "";
  const result = await queryable.query<{
    user_id: string;
    role: string;
    status: string;
  }>(
    `SELECT user_id, role, status
     FROM public.platform_users
     WHERE status = 'active' AND role IN ('owner', 'admin')
       AND ($1::uuid IS NULL OR user_id = $1::uuid)
     ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, user_id`,
    [requested || null],
  );
  return selectAutomationActor(result.rows, requested);
}

export function selectAutomationActor(
  candidates: ReadonlyArray<{ user_id: string; role: string }>,
  requested: string,
): string {
  if (requested) {
    if (candidates.length !== 1 || candidates[0]?.user_id !== requested) {
      throw new Error(
        "Configured automation actor is not an active platform owner/admin",
      );
    }
    return requested;
  }
  return selectDefaultAutomationActor(candidates);
}

export function selectDefaultAutomationActor(
  candidates: ReadonlyArray<{ user_id: string; role: string }>,
): string {
  const admins = candidates.filter((candidate) => candidate.role === "admin");
  if (admins.length === 1) return admins[0]!.user_id;
  if (admins.length > 1) {
    throw new Error(
      "Prepare-managed requires exactly one active platform admin when no actor is configured",
    );
  }
  const owners = candidates.filter((candidate) => candidate.role === "owner");
  if (owners.length !== 1) {
    throw new Error(
      "Prepare-managed requires exactly one active platform owner when no admin or actor is configured",
    );
  }
  return owners[0]!.user_id;
}

async function resolveRuntimeTenant(
  queryable: Queryable,
  host: string,
): Promise<RuntimeTenant> {
  const result = await queryable.query<{
    tenant_id: string;
    slug: string;
    plan_key: string;
    is_active: boolean;
    tenant_status: string;
    domain_type: string;
    is_primary: boolean;
    verification_status: string;
    disabled_at: Date | string | null;
  }>(
    `SELECT tenant.id AS tenant_id, tenant.slug, tenant.plan_key,
            tenant.is_active, tenant.status AS tenant_status,
            domain.type AS domain_type, domain.is_primary,
            domain.verification_status, domain.disabled_at
     FROM public.tenant_domains AS domain
     JOIN public.tenants AS tenant ON tenant.id = domain.tenant_id
     WHERE domain.domain = $1`,
    [host],
  );
  if (result.rows.length !== 1) {
    throw new ProofStateError(
      "runtime_host_binding_invalid",
      `Runtime host collision or missing binding: ${host}`,
    );
  }
  const row = result.rows[0]!;
  if (
    !row.is_active ||
    !["trial", "active"].includes(row.tenant_status) ||
    row.domain_type !== "fieldgrid_subdomain" ||
    !row.is_primary ||
    !["verified", "active"].includes(row.verification_status) ||
    row.disabled_at
  ) {
    throw new ProofStateError(
      "runtime_host_settings_invalid",
      `Runtime host settings are not active and verified: ${host}`,
    );
  }
  return {
    tenantId: row.tenant_id,
    host,
    slug: row.slug,
    planKey: row.plan_key,
  };
}

export function fieldDemoOwnerFailureReason(
  candidates: ReadonlyArray<FieldDemoOwnerCandidate>,
): FieldDemoOwnerFailureReason | null {
  if (candidates.length === 0) return "field_demo_owner_not_found";
  if (candidates.length !== 1) return "field_demo_owner_ambiguous";
  const candidate = candidates[0]!;
  if (candidate.is_deleted) return "field_demo_owner_deleted";
  if (candidate.is_banned) return "field_demo_owner_banned";
  if (candidate.is_anonymous) return "field_demo_owner_anonymous";
  if (!candidate.email_confirmed) return "field_demo_owner_email_unconfirmed";
  if (!candidate.password_set) return "field_demo_owner_password_unset";
  if (!candidate.authenticated_audience)
    return "field_demo_owner_audience_invalid";
  if (!candidate.authenticated_role) return "field_demo_owner_role_invalid";
  if (!UUID_PATTERN.test(candidate.user_id))
    return "field_demo_owner_id_invalid";
  return null;
}

export function selectFieldDemoOwnerUser(
  candidates: ReadonlyArray<FieldDemoOwnerCandidate>,
): string {
  const failureReason = fieldDemoOwnerFailureReason(candidates);
  if (failureReason) {
    throw new ProofStateError(
      "field_demo_owner_invalid",
      "Field-demo requires exactly one valid reserved pilot owner",
      "field_demo_owner",
      "field_demo",
      failureReason,
    );
  }
  return candidates[0]!.user_id;
}

async function resolveFieldDemoOwnerUser(
  queryable: Queryable,
): Promise<string> {
  const result = await queryable.query<FieldDemoOwnerCandidate>(
    `SELECT id::text AS user_id,
            deleted_at IS NOT NULL AS is_deleted,
            (banned_until IS NOT NULL AND banned_until > now()) AS is_banned,
            is_anonymous IS NOT FALSE AS is_anonymous,
            email_confirmed_at IS NOT NULL AS email_confirmed,
            coalesce(length(encrypted_password), 0) > 0 AS password_set,
            aud IS NOT DISTINCT FROM 'authenticated'
              AS authenticated_audience,
            role IS NOT DISTINCT FROM 'authenticated'
              AS authenticated_role
     FROM auth.users
     WHERE lower(email) = lower($1)
     ORDER BY id`,
    [FIELD_DEMO_OWNER_EMAIL],
  );
  return selectFieldDemoOwnerUser(result.rows);
}

export function decideFieldDemoFixture(
  presence: FieldDemoFixturePresence,
  candidates: ReadonlyArray<FieldDemoFixtureCandidate>,
): FieldDemoFixtureDecision {
  const counts = [presence.slug_match_count, presence.domain_match_count];
  if (
    counts.some((count) => !Number.isInteger(count) || count < 0) ||
    counts.some((count) => count > 1) ||
    candidates.length > 1
  ) {
    return {
      action: "reject",
      errorCode: "field_demo_identity_ambiguous",
    };
  }
  if (presence.slug_match_count === 0 && presence.domain_match_count === 0) {
    return candidates.length === 0
      ? { action: "provision" }
      : {
          action: "reject",
          errorCode: "field_demo_identity_ambiguous",
        };
  }
  if (candidates.length !== 1) {
    return {
      action: "reject",
      errorCode: "field_demo_binding_invalid",
    };
  }
  if (presence.slug_match_count === 0) {
    return {
      action: "reject",
      errorCode: "field_demo_identity_collision",
    };
  }
  if (presence.domain_match_count === 0) {
    return {
      action: "reject",
      errorCode: "field_demo_primary_domain_mismatch",
    };
  }

  const candidate = candidates[0]!;
  if (candidate.slug !== FIELD_DEMO_SLUG) {
    return {
      action: "reject",
      errorCode: "field_demo_identity_collision",
    };
  }
  if (candidate.primary_domain_count > 1 || candidate.exact_domain_count > 1) {
    return {
      action: "reject",
      errorCode: "field_demo_identity_ambiguous",
    };
  }
  if (
    candidate.primary_domain_count !== 1 ||
    candidate.exact_domain_count !== 1 ||
    candidate.primary_domain !== FIELD_DEMO_HOST
  ) {
    return {
      action: "reject",
      errorCode: "field_demo_primary_domain_mismatch",
    };
  }
  if (candidate.plan_key !== "enterprise") {
    return {
      action: "reject",
      errorCode: "field_demo_plan_mismatch",
    };
  }
  if (
    candidate.active_subscription_count !== 1 ||
    candidate.active_enterprise_subscription_count !== 1
  ) {
    return {
      action: "reject",
      errorCode: "field_demo_subscription_invalid",
    };
  }
  if (candidate.expected_owner_count !== 1) {
    return {
      action: "reject",
      errorCode: "field_demo_owner_invalid",
    };
  }
  if (candidate.expected_owner_management_role_count !== 1) {
    return {
      action: "reject",
      errorCode: "field_demo_owner_invalid",
    };
  }
  if (candidate.organization_settings_count !== 1) {
    return {
      action: "reject",
      errorCode: "field_demo_settings_invalid",
    };
  }
  if (
    !candidate.is_active ||
    !["trial", "active"].includes(candidate.tenant_status) ||
    candidate.primary_domain_type !== "fieldgrid_subdomain" ||
    !["verified", "active"].includes(
      candidate.primary_domain_verification_status ?? "",
    ) ||
    candidate.primary_domain_disabled_count !== 0
  ) {
    return {
      action: "reject",
      errorCode: "field_demo_runtime_state_invalid",
    };
  }
  return { action: "use-existing" };
}

async function assertFieldDemoPrerequisite(
  queryable: Queryable,
  failureStage: Extract<
    ProofFailureStage,
    | "field_demo_candidate"
    | "field_demo_post_provision"
    | "field_demo_fixture_recheck"
  >,
  expectedTenantId?: string,
): Promise<RuntimeTenant> {
  let runtime: RuntimeTenant;
  try {
    runtime = await resolveRuntimeTenant(queryable, FIELD_DEMO_HOST);
  } catch (error) {
    if (
      error instanceof ProofStateError &&
      error.code === "runtime_host_settings_invalid"
    ) {
      throw new ProofStateError(
        "field_demo_runtime_state_invalid",
        "Field-demo runtime settings are not exact",
        failureStage,
        "field_demo",
      );
    }
    if (
      error instanceof ProofStateError &&
      error.code === "runtime_host_binding_invalid"
    ) {
      throw new ProofStateError(
        "field_demo_binding_invalid",
        "Field-demo runtime binding is not exact",
        failureStage,
        "field_demo",
      );
    }
    throw error;
  }
  if (
    runtime.slug !== FIELD_DEMO_SLUG ||
    (expectedTenantId !== undefined && runtime.tenantId !== expectedTenantId)
  ) {
    throw new ProofStateError(
      "field_demo_binding_invalid",
      "Field-demo runtime identity is not exact",
      failureStage,
      "field_demo",
    );
  }
  if (runtime.planKey !== "enterprise") {
    throw new ProofStateError(
      "field_demo_plan_mismatch",
      "Field-demo runtime plan is not exact",
      failureStage,
      "field_demo",
    );
  }
  const invariants = await queryable.query<{
    organization_settings_count: number;
    active_subscription_count: number;
    active_enterprise_subscription_count: number;
    expected_owner_count: number;
    expected_owner_management_role_count: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::integer
          FROM public.organization_settings AS settings
         WHERE settings.tenant_id = $1) AS organization_settings_count,
       (SELECT COUNT(*)::integer
          FROM public.tenant_subscriptions AS subscription
         WHERE subscription.tenant_id = $1
           AND subscription.status IN ('trial', 'active'))
         AS active_subscription_count,
       (SELECT COUNT(*)::integer
          FROM public.tenant_subscriptions AS subscription
          JOIN public.plans AS plan ON plan.id = subscription.plan_id
         WHERE subscription.tenant_id = $1
           AND subscription.status IN ('trial', 'active')
           AND plan.key = 'enterprise'
           AND plan.is_active = true)
         AS active_enterprise_subscription_count,
       (SELECT COUNT(*)::integer
          FROM public.tenant_users AS membership
          JOIN auth.users AS owner ON owner.id = membership.user_id
         WHERE membership.tenant_id = $1
           AND membership.role = 'owner'
           AND membership.status = 'active'
           AND lower(owner.email) = lower($2)
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
         WHERE membership.tenant_id = $1
           AND membership.role = 'owner'
           AND membership.status = 'active'
           AND lower(owner.email) = lower($2)
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
                 SELECT 1
                 FROM public.role_permissions AS expected_permission
                 WHERE expected_permission.role_id = template_role.id
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM public.role_permissions AS expected_permission
                 WHERE expected_permission.role_id = template_role.id
                   AND NOT EXISTS (
                     SELECT 1
                     FROM public.tenant_role_permissions AS actual_permission
                     WHERE actual_permission.tenant_role_id = tenant_role.id
                       AND actual_permission.permission_id =
                         expected_permission.permission_id
                   )
               )
           )) AS expected_owner_management_role_count`,
    [runtime.tenantId, FIELD_DEMO_OWNER_EMAIL],
  );
  if (invariants.rows.length !== 1) {
    throw new ProofStateError(
      "field_demo_runtime_state_invalid",
      "Field-demo invariants are ambiguous",
      failureStage,
      "field_demo",
    );
  }
  const invariant = invariants.rows[0]!;
  if (
    invariant.active_subscription_count !== 1 ||
    invariant.active_enterprise_subscription_count !== 1
  ) {
    throw new ProofStateError(
      "field_demo_subscription_invalid",
      "Field-demo active Enterprise subscription is not exact",
      failureStage,
      "field_demo",
    );
  }
  if (invariant.expected_owner_count !== 1) {
    throw new ProofStateError(
      "field_demo_owner_invalid",
      "Field-demo reserved pilot owner is not exact",
      failureStage,
      "field_demo",
    );
  }
  if (invariant.expected_owner_management_role_count !== 1) {
    throw new ProofStateError(
      "field_demo_owner_invalid",
      "Field-demo reserved pilot owner permissions are not exact",
      failureStage,
      "field_demo",
    );
  }
  if (invariant.organization_settings_count !== 1) {
    throw new ProofStateError(
      "field_demo_settings_invalid",
      "Field-demo organization settings are not exact",
      failureStage,
      "field_demo",
    );
  }
  return runtime;
}

async function findFieldDemoFixture(
  queryable: Queryable,
  failureStage: Extract<
    ProofFailureStage,
    "field_demo_candidate" | "field_demo_post_provision"
  >,
): Promise<RuntimeTenant | null> {
  const presenceResult = await queryable.query<FieldDemoFixturePresence>(
    `SELECT
       (SELECT COUNT(*)::integer
          FROM public.tenants
         WHERE slug = $1) AS slug_match_count,
       (SELECT COUNT(*)::integer
          FROM public.tenant_domains
         WHERE domain = $2) AS domain_match_count`,
    [FIELD_DEMO_SLUG, FIELD_DEMO_HOST],
  );
  if (presenceResult.rows.length !== 1) {
    throw new ProofStateError(
      "field_demo_identity_ambiguous",
      "Field-demo identity presence is ambiguous",
      failureStage,
      "field_demo",
    );
  }

  const result = await queryable.query<FieldDemoFixtureCandidate>(
    `SELECT tenant.id AS tenant_id, tenant.slug, tenant.plan_key,
            tenant.is_active, tenant.status AS tenant_status,
            domains.primary_domain_count, domains.primary_domain,
            domains.primary_domain_type,
            domains.primary_domain_verification_status,
            domains.primary_domain_disabled_count,
            domains.exact_domain_count,
            (SELECT COUNT(*)::integer
               FROM public.organization_settings AS settings
              WHERE settings.tenant_id = tenant.id)
              AS organization_settings_count,
            (SELECT COUNT(*)::integer
               FROM public.tenant_subscriptions AS subscription
              WHERE subscription.tenant_id = tenant.id
                AND subscription.status IN ('trial', 'active'))
              AS active_subscription_count,
            (SELECT COUNT(*)::integer
               FROM public.tenant_subscriptions AS subscription
               JOIN public.plans AS plan ON plan.id = subscription.plan_id
              WHERE subscription.tenant_id = tenant.id
                AND subscription.status IN ('trial', 'active')
                AND plan.key = 'enterprise'
                AND plan.is_active = true)
              AS active_enterprise_subscription_count,
            (SELECT COUNT(*)::integer
               FROM public.tenant_users AS membership
               JOIN auth.users AS owner ON owner.id = membership.user_id
              WHERE membership.tenant_id = tenant.id
                AND membership.role = 'owner'
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
              WHERE membership.tenant_id = tenant.id
                AND membership.role = 'owner'
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
                      SELECT 1
                      FROM public.role_permissions AS expected_permission
                      WHERE expected_permission.role_id = template_role.id
                    )
                    AND NOT EXISTS (
                      SELECT 1
                      FROM public.role_permissions AS expected_permission
                      WHERE expected_permission.role_id = template_role.id
                        AND NOT EXISTS (
                          SELECT 1
                          FROM public.tenant_role_permissions AS actual_permission
                          WHERE actual_permission.tenant_role_id = tenant_role.id
                            AND actual_permission.permission_id =
                              expected_permission.permission_id
                        )
                    )
                )) AS expected_owner_management_role_count
     FROM public.tenants AS tenant
     LEFT JOIN LATERAL (
       SELECT
         (COUNT(*) FILTER (WHERE domain.is_primary = true))::integer
           AS primary_domain_count,
         MIN(domain.domain) FILTER (WHERE domain.is_primary = true)
           AS primary_domain,
         MIN(domain.type::text) FILTER (WHERE domain.is_primary = true)
           AS primary_domain_type,
         MIN(domain.verification_status::text)
           FILTER (WHERE domain.is_primary = true)
           AS primary_domain_verification_status,
         (COUNT(*) FILTER (
           WHERE domain.is_primary = true AND domain.disabled_at IS NOT NULL
         ))::integer AS primary_domain_disabled_count,
         (COUNT(*) FILTER (WHERE domain.domain = $2))::integer
           AS exact_domain_count
       FROM public.tenant_domains AS domain
       WHERE domain.tenant_id = tenant.id
     ) AS domains ON true
     WHERE tenant.slug = $1 OR domains.exact_domain_count > 0
     ORDER BY tenant.id`,
    [FIELD_DEMO_SLUG, FIELD_DEMO_HOST, FIELD_DEMO_OWNER_EMAIL],
  );
  const decision = decideFieldDemoFixture(presenceResult.rows[0]!, result.rows);
  if (decision.action === "provision") return null;
  if (decision.action === "reject") {
    throw new ProofStateError(
      decision.errorCode,
      "Field-demo fixture state is not exact",
      failureStage,
      "field_demo",
    );
  }

  const candidate = result.rows[0]!;
  return assertFieldDemoPrerequisite(
    queryable,
    failureStage,
    candidate.tenant_id,
  );
}

type FieldDemoProvisioningIdentity = {
  tenantId: string;
  runId: string;
  requestedBy: string;
  ownerUserId: string;
  expectedSha: string;
  changeReference: string;
};

export function fieldDemoProvisioningRunOwnershipIsExact(
  candidate: FieldDemoProvisioningRunCandidate | null,
  expected: FieldDemoProvisioningIdentity,
): boolean {
  return Boolean(
    candidate &&
    candidate.run_id === expected.runId &&
    candidate.tenant_id === expected.tenantId &&
    candidate.status === "succeeded" &&
    candidate.marker === FIELD_DEMO_FIXTURE_MARKER &&
    candidate.automation_contract === FIELD_DEMO_FIXTURE_VERSION &&
    candidate.environment === "staging" &&
    candidate.staging_only === "true" &&
    candidate.requested_by === expected.requestedBy &&
    candidate.tenant_created_by === expected.requestedBy,
  );
}

export function fieldDemoProvisioningRunIsExact(
  candidate: FieldDemoProvisioningRunCandidate | null,
  expected: FieldDemoProvisioningIdentity,
): boolean {
  return (
    fieldDemoProvisioningRunOwnershipIsExact(candidate, expected) &&
    candidate?.slug === FIELD_DEMO_SLUG &&
    candidate.plan_key === "enterprise" &&
    candidate.primary_domain === FIELD_DEMO_HOST &&
    candidate.owner_email === FIELD_DEMO_OWNER_EMAIL &&
    candidate.owner_user_id === expected.ownerUserId &&
    candidate.owner_invite_status === "accepted" &&
    candidate.current_step === "completed" &&
    candidate.expected_sha === expected.expectedSha &&
    candidate.change_reference === expected.changeReference
  );
}

async function findFieldDemoProvisioningRun(
  queryable: Queryable,
  expected: FieldDemoProvisioningIdentity,
): Promise<FieldDemoProvisioningRunCandidate | null> {
  const result = await queryable.query<FieldDemoProvisioningRunCandidate>(
    `SELECT run.id AS run_id, run.tenant_id, run.status,
            run.metadata ->> 'automationMarker' AS marker,
            run.metadata ->> 'automationContract' AS automation_contract,
            run.metadata ->> 'environment' AS environment,
            run.metadata ->> 'stagingOnly' AS staging_only,
            run.metadata ->> 'expectedSha' AS expected_sha,
            run.metadata ->> 'changeReference' AS change_reference,
            run.slug, run.plan_key, run.primary_domain, run.owner_email,
            run.owner_user_id, run.owner_invite_status, run.current_step,
            run.requested_by, tenant.created_by AS tenant_created_by
     FROM public.tenant_provisioning_runs AS run
     JOIN public.tenants AS tenant ON tenant.id = run.tenant_id
     WHERE run.id = $1 AND run.tenant_id = $2`,
    [expected.runId, expected.tenantId],
  );
  return result.rows.length === 1 ? result.rows[0]! : null;
}

export async function ensureFieldDemoFixture(
  dbModule: DatabaseModule,
  actorUserId: string,
  expectedSha: string,
  changeReference: string,
): Promise<RuntimeTenant> {
  const ownerUserId = await resolveFieldDemoOwnerUser(dbModule.pool);
  const existing = await findFieldDemoFixture(
    dbModule.pool,
    "field_demo_candidate",
  );
  if (existing) return existing;

  let provisioned: FieldDemoProvisioningIdentity;
  try {
    const result = await dbModule.provisionTenant({
      name: "Fieldgrid Staging Demo",
      slug: FIELD_DEMO_SLUG,
      planKey: "enterprise",
      primaryDomain: FIELD_DEMO_HOST,
      requestedBy: actorUserId,
      ownerEmail: FIELD_DEMO_OWNER_EMAIL,
      metadata: {
        automationMarker: FIELD_DEMO_FIXTURE_MARKER,
        automationContract: FIELD_DEMO_FIXTURE_VERSION,
        environment: "staging",
        stagingOnly: true,
        expectedSha,
        changeReference,
      },
    });
    provisioned = {
      tenantId: result.tenantId,
      runId: result.runId,
      requestedBy: actorUserId,
      ownerUserId,
      expectedSha,
      changeReference,
    };
  } catch {
    throw new ProofStateError(
      "field_demo_provisioning_failed",
      "Field-demo fixture provisioning failed",
      "field_demo_provision",
      "field_demo",
    );
  }

  let provisioningRun: FieldDemoProvisioningRunCandidate | null = null;
  try {
    provisioningRun = await findFieldDemoProvisioningRun(
      dbModule.pool,
      provisioned,
    );
    if (
      !fieldDemoProvisioningRunOwnershipIsExact(provisioningRun, provisioned)
    ) {
      throw new ProofStateError(
        "field_demo_provisioning_verification_failed",
        "Field-demo provisioning ownership is not exact",
        "field_demo_post_provision",
        "field_demo",
      );
    }
    await dbModule.completeProvisionedTenantOwnerInvite({
      tenantId: provisioned.tenantId,
      runId: provisioned.runId,
      ownerEmail: FIELD_DEMO_OWNER_EMAIL,
      ownerUserId,
      invitedBy: actorUserId,
      ownerInviteStatus: "accepted",
    });
    provisioningRun = await findFieldDemoProvisioningRun(
      dbModule.pool,
      provisioned,
    );
    if (!fieldDemoProvisioningRunIsExact(provisioningRun, provisioned)) {
      throw new ProofStateError(
        "field_demo_provisioning_verification_failed",
        "Field-demo provisioning evidence is not exact",
        "field_demo_post_provision",
        "field_demo",
      );
    }
    const resolved = await findFieldDemoFixture(
      dbModule.pool,
      "field_demo_post_provision",
    );
    if (!resolved || resolved.tenantId !== provisioned.tenantId) {
      throw new ProofStateError(
        "field_demo_provisioning_verification_failed",
        "Field-demo fixture did not resolve after provisioning",
        "field_demo_post_provision",
        "field_demo",
      );
    }
    return resolved;
  } catch (error) {
    if (
      !fieldDemoProvisioningRunOwnershipIsExact(provisioningRun, provisioned)
    ) {
      throw new ProofStateError(
        "field_demo_rollback_failed",
        "Field-demo rollback ownership could not be proven",
        "field_demo_post_provision",
        "field_demo",
      );
    }
    try {
      await dbModule.rollbackProvisionedTenant({
        tenantId: provisioned.tenantId,
        runId: provisioned.runId,
        requestedBy: actorUserId,
        reason: "Automatische rollback van de staging-only field-demo fixture.",
      });
    } catch {
      throw new ProofStateError(
        "field_demo_rollback_failed",
        "Field-demo rollback failed",
        "field_demo_post_provision",
        "field_demo",
      );
    }
    if (error instanceof ProofStateError) throw error;
    throw new ProofStateError(
      "field_demo_provisioning_verification_failed",
      "Field-demo post-provision verification failed",
      "field_demo_post_provision",
      "field_demo",
    );
  }
}

export function managedProofCandidateErrorCode(
  candidates: ReadonlyArray<ManagedProofCandidate>,
): ManagedProofCandidateErrorCode | null {
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) return "managed_proof_identity_ambiguous";
  const candidate = candidates[0]!;
  if (
    candidate.slug !== MANAGED_PROOF_SLUG ||
    candidate.domain !== MANAGED_PROOF_HOST
  ) {
    return "managed_proof_identity_mismatch";
  }
  if (candidate.plan_key !== "enterprise") {
    return "managed_proof_plan_mismatch";
  }
  if (candidate.marker !== WEBSITE_STAGING_PROOF_MARKER) {
    return "managed_proof_ownership_mismatch";
  }
  if (
    candidate.environment !== "staging" ||
    candidate.provisioned_slug !== MANAGED_PROOF_SLUG ||
    candidate.provisioned_plan_key !== "enterprise" ||
    candidate.provisioned_primary_domain !== MANAGED_PROOF_HOST ||
    candidate.provisioned_owner_email !== null ||
    !candidate.provisioned_requested_by ||
    candidate.provisioned_requested_by !== candidate.tenant_created_by
  ) {
    return "managed_proof_ownership_mismatch";
  }
  return null;
}

async function findManagedProofTenant(
  queryable: Queryable,
  failureStage: Extract<
    ProofFailureStage,
    "managed_candidate" | "managed_post_provision" | "managed_final"
  > = "managed_candidate",
): Promise<RuntimeTenant | null> {
  const result = await queryable.query<ManagedProofCandidate>(
    `SELECT tenant.id AS tenant_id, tenant.slug, tenant.plan_key,
            domain.domain, tenant.created_by AS tenant_created_by,
            provisioning.metadata ->> 'automationMarker' AS marker,
            provisioning.metadata ->> 'environment' AS environment,
            provisioning.slug AS provisioned_slug,
            provisioning.plan_key AS provisioned_plan_key,
            provisioning.primary_domain AS provisioned_primary_domain,
            provisioning.owner_email AS provisioned_owner_email,
            provisioning.requested_by AS provisioned_requested_by
     FROM public.tenants AS tenant
     LEFT JOIN public.tenant_domains AS domain
       ON domain.tenant_id = tenant.id AND domain.is_primary = true
     LEFT JOIN LATERAL (
       SELECT run.metadata, run.slug, run.plan_key, run.primary_domain,
              run.owner_email, run.requested_by
       FROM public.tenant_provisioning_runs AS run
       WHERE run.tenant_id = tenant.id
         AND run.status = 'succeeded'
         AND run.metadata ->> 'automationMarker' = $3
       ORDER BY run.completed_at DESC NULLS LAST, run.id
       LIMIT 1
     ) AS provisioning ON true
     WHERE tenant.slug = $1 OR domain.domain = $2`,
    [MANAGED_PROOF_SLUG, MANAGED_PROOF_HOST, WEBSITE_STAGING_PROOF_MARKER],
  );
  if (result.rows.length === 0) return null;
  const errorCode = managedProofCandidateErrorCode(result.rows);
  if (errorCode) {
    throw new ProofStateError(
      errorCode,
      "Managed proof candidate is not the exact automation-owned identity",
      failureStage,
      "managed_proof",
    );
  }
  const candidate = result.rows[0]!;
  const runtime = await resolveRuntimeTenant(queryable, MANAGED_PROOF_HOST);
  if (
    runtime.tenantId !== candidate.tenant_id ||
    runtime.slug !== candidate.slug ||
    runtime.planKey !== candidate.plan_key
  ) {
    throw new ProofStateError(
      "managed_proof_identity_mismatch",
      "Managed proof runtime binding changed during identity validation",
      failureStage,
      "managed_proof",
    );
  }
  return runtime;
}

function reviewedProofSection(
  section: Record<string, unknown>,
  isHomepage: boolean,
): Record<string, unknown> {
  const isProofHero = isHomepage && section["type"] === "hero";
  const rawContent = section["content"];
  const content =
    rawContent && typeof rawContent === "object" && !Array.isArray(rawContent)
      ? { ...(rawContent as Record<string, unknown>) }
      : rawContent;
  if (isProofHero && content && typeof content === "object") {
    Object.assign(content, {
      eyebrow: "Fieldgrid website-module",
      title: "Een heldere website, veilig beheerd vanuit Fieldgrid",
      subtitle:
        "Deze acceptatiesite toont de beheerde publicatieroute met rustige vormgeving, duidelijke navigatie en een veilige technische basis.",
      badges: ["Veilig gepubliceerd", "Geschikt voor mobiel"],
    });
  }
  return {
    id: section["id"],
    type: section["type"],
    schemaVersion: section["schemaVersion"],
    variant: section["variant"],
    visible: isProofHero,
    requiresReview: false,
    content,
  };
}

function sectionNeedsUpdate(
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
): boolean {
  return (
    current["visible"] !== desired["visible"] ||
    current["requiresReview"] === true ||
    JSON.stringify(current["content"]) !== JSON.stringify(desired["content"])
  );
}

export function managedProofDomainBindingRequired(
  site: ManagedProofSiteDomain,
): boolean {
  if (
    site.canonicalHostname !== null &&
    site.canonicalHostname !== MANAGED_PROOF_HOST
  ) {
    throw new Error("Managed proof website is bound to a different domain");
  }
  return (
    site.canonicalHostname !== MANAGED_PROOF_HOST ||
    site.canonicalDomainStatus !== "active"
  );
}

async function ensureManagedProof(
  dbModule: DatabaseModule,
  actorUserId: string,
  expectedSha: string,
  changeReference: string,
): Promise<RuntimeTenant> {
  const { pool } = dbModule;
  let tenant = await findManagedProofTenant(pool);
  let createdTenant: { tenantId: string; runId: string } | null = null;
  let siteCreated = false;
  try {
    if (!tenant) {
      const provisioned = await dbModule.provisionTenant({
        name: "Fieldgrid Managed Website Acceptatie",
        slug: MANAGED_PROOF_SLUG,
        planKey: "enterprise",
        primaryDomain: MANAGED_PROOF_HOST,
        requestedBy: actorUserId,
        ownerEmail: null,
        moduleKeys: ["website"],
        metadata: {
          automationMarker: WEBSITE_STAGING_PROOF_MARKER,
          environment: "staging",
          expectedSha,
          changeReference,
        },
      });
      createdTenant = {
        tenantId: provisioned.tenantId,
        runId: provisioned.runId,
      };
      tenant = await findManagedProofTenant(pool, "managed_post_provision");
      if (!tenant || tenant.tenantId !== provisioned.tenantId) {
        throw new ProofStateError(
          "managed_proof_identity_mismatch",
          "Managed proof tenant did not resolve after provisioning",
          "managed_post_provision",
          "managed_proof",
        );
      }
    }

    let overview = await dbModule.getWebsiteAdminOverview(tenant.tenantId);
    if (!overview.site) {
      const settings = dbModule.createInitialWebsiteSettings(
        "Fieldgrid Managed Website Acceptatie",
      );
      settings.defaultSeo.title = "Fieldgrid managed website acceptatie";
      settings.defaultSeo.description =
        "Controleerbare staging-publicatie van de beheerde Fieldgrid website-module.";
      await dbModule.initializeManagedWebsite({
        tenantId: tenant.tenantId,
        actorUserId,
        templateKey: "trust_conversion",
        settings,
      });
      siteCreated = true;
      overview = await dbModule.getWebsiteAdminOverview(tenant.tenantId);
    }
    if (!overview.site) {
      throw new Error("Managed proof website initialization is missing");
    }
    if (managedProofDomainBindingRequired(overview.site)) {
      await dbModule.bindPrimaryTenantDomainToWebsite({
        tenantId: tenant.tenantId,
        siteId: overview.site.id,
        expectedAuthoringRevision: overview.site.authoringRevision,
        actorUserId,
        reason: "Staging acceptatie koppelt het beheerde proof-domein.",
      });
      overview = await dbModule.getWebsiteAdminOverview(tenant.tenantId);
    }
    if (
      !overview.site ||
      overview.site.canonicalHostname !== MANAGED_PROOF_HOST ||
      overview.site.canonicalDomainStatus !== "active"
    ) {
      throw new Error("Managed proof website domain is not exactly active");
    }

    let pages = await dbModule.listWebsitePages(tenant.tenantId);
    if (!pages || pages.siteId !== overview.site.id) {
      throw new Error("Managed proof website pages are missing");
    }
    for (const pageSummary of pages.pages) {
      let page = await dbModule.getWebsitePage(tenant.tenantId, pageSummary.id);
      if (!page) throw new Error("Managed proof page disappeared");
      for (const section of page.sections) {
        const current = section as unknown as Record<string, unknown>;
        const desired = reviewedProofSection(current, page.isHomepage);
        if (!sectionNeedsUpdate(current, desired)) continue;
        const updated = await dbModule.updateWebsiteSection({
          tenantId: tenant.tenantId,
          siteId: page.siteId,
          pageId: page.id,
          actorUserId,
          expectedAuthoringRevision: page.siteAuthoringRevision,
          expectedPageRevision: page.authoringRevision,
          expectedSectionRevision: section.authoringRevision,
          section: desired as never,
        });
        page = {
          ...page,
          siteAuthoringRevision: updated.siteAuthoringRevision,
          authoringRevision: updated.pageAuthoringRevision,
          sections: page.sections.map((candidate) =>
            candidate.id === section.id
              ? ({
                  ...candidate,
                  ...desired,
                  authoringRevision: updated.sectionAuthoringRevision!,
                } as typeof candidate)
              : candidate,
          ),
        };
      }
      if (page.status === "draft") {
        await dbModule.includeWebsitePageInPublication({
          tenantId: tenant.tenantId,
          siteId: page.siteId,
          pageId: page.id,
          actorUserId,
          expectedAuthoringRevision: page.siteAuthoringRevision,
          expectedPageRevision: page.authoringRevision,
        });
      }
    }

    const review = await dbModule.getWebsitePublicationReview({
      tenantId: tenant.tenantId,
      siteId: overview.site.id,
    });
    const errorCodes = review.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code);
    if (!review.canPreparePublication || errorCodes.length > 0) {
      throw new Error(
        `Managed proof publication review failed: ${errorCodes.join(",")}`,
      );
    }

    overview = await dbModule.getWebsiteAdminOverview(tenant.tenantId);
    if (
      !overview.site ||
      overview.site.deliveryMode !== "managed_cms" ||
      overview.site.status !== "active" ||
      review.activePublication?.sourceRevision !== review.authoringRevision
    ) {
      const ready =
        review.readyPublication &&
        review.readyPublication.sourceRevision === review.authoringRevision &&
        review.readyPublication.targetDeliveryRevision ===
          review.deliveryRevision + 1
          ? review.readyPublication
          : await dbModule.createManagedWebsitePublication({
              tenantId: tenant.tenantId,
              siteId: review.siteId,
              actorUserId,
              expectedAuthoringRevision: review.authoringRevision,
              reason:
                "Staging acceptatie bereidt de beheerde proof-publicatie voor.",
            });
      await dbModule.activateManagedWebsitePublication({
        tenantId: tenant.tenantId,
        siteId: review.siteId,
        publicationId: ready.id,
        actorUserId,
        expectedAuthoringRevision: review.authoringRevision,
        expectedDeliveryRevision: review.deliveryRevision,
        reason: "Staging acceptatie activeert de gereviewde proof-publicatie.",
      });
    }

    overview = await dbModule.getWebsiteAdminOverview(tenant.tenantId);
    if (
      !overview.site ||
      overview.site.status !== "active" ||
      overview.site.deliveryMode !== "managed_cms" ||
      overview.site.canonicalHostname !== MANAGED_PROOF_HOST ||
      !overview.site.activePublicationHash ||
      overview.site.draftPageCount !== 0
    ) {
      throw new Error("Managed proof website is not fully active");
    }
    return assertManagedProof(dbModule);
  } catch (error) {
    if (createdTenant && !siteCreated) {
      await dbModule
        .rollbackProvisionedTenant({
          tenantId: createdTenant.tenantId,
          runId: createdTenant.runId,
          requestedBy: actorUserId,
          reason: "Automatische rollback vóór website-initialisatie.",
        })
        .catch(() => undefined);
    }
    throw error;
  }
}

async function assertManagedProof(
  dbModule: DatabaseModule,
): Promise<RuntimeTenant> {
  const tenant = await findManagedProofTenant(dbModule.pool, "managed_final");
  if (!tenant) throw new Error("Managed proof tenant is missing");
  const overview = await dbModule.getWebsiteAdminOverview(tenant.tenantId);
  if (
    !overview.site ||
    overview.site.status !== "active" ||
    overview.site.deliveryMode !== "managed_cms" ||
    overview.site.canonicalHostname !== MANAGED_PROOF_HOST ||
    overview.site.canonicalDomainStatus !== "active" ||
    !overview.site.activePublicationHash ||
    overview.site.draftPageCount !== 0
  ) {
    throw new Error("Managed proof website settings are not exact");
  }
  const review = await dbModule.getWebsitePublicationReview({
    tenantId: tenant.tenantId,
    siteId: overview.site.id,
  });
  if (
    review.activePublication?.sourceRevision !== review.authoringRevision ||
    review.diagnostics.some((diagnostic) => diagnostic.severity === "error")
  ) {
    throw new Error(
      "Managed proof publication is not the current authoring state",
    );
  }
  const pages = await dbModule.listWebsitePages(tenant.tenantId);
  if (!pages || pages.siteId !== overview.site.id || pages.pages.length === 0) {
    throw new Error("Managed proof pages are missing");
  }
  let visibleHomepageHeroes = 0;
  for (const summary of pages.pages) {
    const page = await dbModule.getWebsitePage(tenant.tenantId, summary.id);
    if (!page || page.status !== "published") {
      throw new Error("Managed proof pages are not all published");
    }
    for (const section of page.sections) {
      const current = section as unknown as Record<string, unknown>;
      const desired = reviewedProofSection(current, page.isHomepage);
      if (sectionNeedsUpdate(current, desired)) {
        throw new Error(
          "Managed proof sections differ from reviewed proof content",
        );
      }
      if (page.isHomepage && section.type === "hero" && section.visible) {
        visibleHomepageHeroes += 1;
      }
    }
  }
  if (visibleHomepageHeroes !== 1) {
    throw new Error("Managed proof requires exactly one visible homepage hero");
  }
  return tenant;
}

async function fetchMode(url: string, expectedMode: string): Promise<void> {
  const response = await fetch(url, {
    redirect: "error",
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (
    response.status !== 200 ||
    response.headers.get("x-fieldgrid-website-delivery") !== expectedMode
  ) {
    await response.body?.cancel();
    throw new Error(`Public proof did not resolve as ${expectedMode}`);
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("Public proof response exceeds the bounded size");
  }
  if (!response.body) throw new Error("Public proof response has no body");
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Public proof response exceeds the bounded size");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function assertExactReleaseMarkers(expectedSha: string): Promise<void> {
  for (const baseDirectory of [
    CORE_STAGING_BASE_DIR,
    WEBSITE_STACK_STAGING_BASE_DIR,
  ]) {
    const actual = (
      await readFile(
        join(baseDirectory, "current", ".fieldgrid-release-sha"),
        "utf8",
      )
    ).trim();
    if (actual !== expectedSha) {
      throw new Error(
        "Core and website stack must both run the exact staging SHA",
      );
    }
  }
}

async function resolveCustomSite(dbModule: DatabaseModule): Promise<{
  tenant: RuntimeTenant;
  siteId: string;
}> {
  const tenant = await resolveRuntimeTenant(dbModule.pool, CUSTOM_PROOF_HOST);
  const delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
  if (
    !delivery.site ||
    delivery.site.canonicalHostname !== CUSTOM_PROOF_HOST ||
    !delivery.site.canonicalDomainActive ||
    !delivery.site.tenantActive ||
    delivery.site.tenantPlanKey !== "enterprise" ||
    !delivery.site.websiteEntitled
  ) {
    throw new Error("Custom proof tenant/site settings are not exact");
  }
  return { tenant, siteId: delivery.site.id };
}

function exactCustomRegistration(
  dbModule: DatabaseModule,
  expectedSha: string,
  environment: ProofEnvironment,
) {
  const registry =
    dbModule.configuredFieldgridCustomWebsiteRouteRegistry(environment);
  const releaseId = `git-commit:${expectedSha}`;
  const registrations = registry.registrations.filter(
    (candidate) =>
      candidate.status === "routable" &&
      candidate.providerKey === PROVIDER_KEY &&
      candidate.routeKey === environment.FIELDGRID_CUSTOM_ROUTE_KEY &&
      candidate.releaseId === releaseId &&
      candidate.healthPath === HEALTH_PATH &&
      candidate.expectedHosts.includes(CUSTOM_PROOF_HOST),
  );
  if (registrations.length !== 1) {
    throw new Error("Exact custom proof registration is missing or ambiguous");
  }
  return registrations[0]!;
}

async function ensureCustomProof(
  dbModule: DatabaseModule,
  actorUserId: string,
  expectedSha: string,
  changeReference: string,
  environment: ProofEnvironment,
): Promise<{ releaseId: string; activated: boolean }> {
  await assertManagedProof(dbModule);
  const { tenant, siteId } = await resolveCustomSite(dbModule);
  const registration = exactCustomRegistration(
    dbModule,
    expectedSha,
    environment,
  );
  const releaseId = registration.releaseId;
  let delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
  let deployment = delivery.deployments.find(
    (candidate) =>
      candidate.providerKey === registration.providerKey &&
      candidate.routeKey === registration.routeKey &&
      candidate.releaseId === registration.releaseId &&
      candidate.expectedHost === CUSTOM_PROOF_HOST &&
      candidate.healthPath === registration.healthPath,
  );
  if (!deployment) {
    const registered = await dbModule.registerPlatformWebsiteDeployment({
      tenantId: tenant.tenantId,
      siteId,
      actorUserId,
      providerKey: registration.providerKey,
      routeKey: registration.routeKey,
      releaseId: registration.releaseId,
      expectedHost: CUSTOM_PROOF_HOST,
      healthPath: registration.healthPath,
      changeReference,
    });
    delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
    deployment = delivery.deployments.find(
      (candidate) => candidate.id === registered.id,
    );
  }
  if (!deployment)
    throw new Error("Custom deployment registration disappeared");

  const alreadyActive =
    delivery.site?.deliveryMode === "custom_nextjs" &&
    delivery.site.activeTargetId === deployment.id &&
    deployment.releaseId === releaseId;
  if (alreadyActive) {
    await assertCustomProof(dbModule, expectedSha, environment);
    await fetchMode(CUSTOM_PROOF_URL, "custom_nextjs");
    return { releaseId, activated: false };
  }

  const checkedAt = deployment.lastCheckedAt
    ? new Date(deployment.lastCheckedAt).getTime()
    : 0;
  if (
    deployment?.healthStatus !== "healthy" ||
    !Number.isFinite(checkedAt) ||
    Date.now() - checkedAt > 4 * 60 * 1_000
  ) {
    await dbModule.checkPlatformWebsiteDeploymentHealth({
      tenantId: tenant.tenantId,
      siteId,
      deploymentId: deployment.id,
      actorUserId,
      changeReference,
      reason: "Staging acceptatie controleert de exacte custom release.",
    });
    delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
    deployment = delivery.deployments.find(
      (candidate) => candidate.id === deployment!.id,
    )!;
  }
  if (!deployment.approvedAt) {
    await dbModule.approvePlatformWebsiteDeployment({
      tenantId: tenant.tenantId,
      siteId,
      deploymentId: deployment.id,
      actorUserId,
      changeReference,
      reason: "Staging acceptatie keurt de exact gecontroleerde release goed.",
    });
  }

  delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
  if (!delivery.site) throw new Error("Custom website site disappeared");
  const activation = await dbModule.activatePlatformWebsiteDeployment({
    tenantId: tenant.tenantId,
    siteId,
    deploymentId: deployment.id,
    actorUserId,
    expectedDeliveryRevision: delivery.site.deliveryRevision,
    expectedMode: delivery.site.deliveryMode,
    expectedTargetId: delivery.site.activeTargetId,
    changeReference,
    reason: "Staging acceptatie activeert de exacte custom Next.js release.",
  });
  if (activation.status !== "succeeded" || !activation.deliveryRevision) {
    throw new Error("Custom website activation preflight was blocked");
  }

  try {
    await fetchMode(CUSTOM_PROOF_URL, "custom_nextjs");
  } catch (error) {
    const rollback = await dbModule.rollbackPlatformWebsiteDelivery({
      tenantId: tenant.tenantId,
      siteId,
      expectedDeliveryRevision: activation.deliveryRevision,
      expectedMode: "custom_nextjs",
      expectedTargetId: deployment.id,
      actorUserId,
      changeReference,
      reason: "Automatische rollback na mislukte publieke custom verificatie.",
    });
    if (rollback.status !== "succeeded") {
      throw new Error("Custom public verification and exact rollback failed");
    }
    throw error;
  }
  return { releaseId, activated: true };
}

async function assertCustomProof(
  dbModule: DatabaseModule,
  expectedSha: string,
  environment: ProofEnvironment,
): Promise<string> {
  const { tenant } = await resolveCustomSite(dbModule);
  const registration = exactCustomRegistration(
    dbModule,
    expectedSha,
    environment,
  );
  const delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
  const deployment = delivery.deployments.find(
    (candidate) =>
      candidate.releaseId === registration.releaseId &&
      candidate.routeKey === registration.routeKey &&
      candidate.expectedHost === CUSTOM_PROOF_HOST,
  );
  const checkedAt = deployment?.lastCheckedAt
    ? new Date(deployment.lastCheckedAt).getTime()
    : 0;
  if (
    !delivery.site ||
    delivery.site.deliveryMode !== "custom_nextjs" ||
    delivery.site.activeTargetId !== deployment?.id ||
    deployment?.status !== "active" ||
    deployment.healthStatus !== "healthy" ||
    !Number.isFinite(checkedAt) ||
    Date.now() - checkedAt > 5 * 60 * 1_000
  ) {
    throw new Error("Exact custom proof delivery is not active and fresh");
  }
  return registration.releaseId;
}

async function rollbackCustomProof(
  dbModule: DatabaseModule,
  actorUserId: string,
  expectedSha: string,
  changeReference: string,
  environment: ProofEnvironment,
): Promise<void> {
  const { tenant, siteId } = await resolveCustomSite(dbModule);
  const registration = exactCustomRegistration(
    dbModule,
    expectedSha,
    environment,
  );
  const delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
  if (!delivery.site) throw new Error("Custom website site is missing");
  if (delivery.site.deliveryMode !== "custom_nextjs") return;
  const deployment = delivery.deployments.find(
    (candidate) =>
      candidate.id === delivery.site?.activeTargetId &&
      candidate.providerKey === registration.providerKey &&
      candidate.routeKey === registration.routeKey &&
      candidate.releaseId === registration.releaseId &&
      candidate.expectedHost === CUSTOM_PROOF_HOST &&
      candidate.healthPath === registration.healthPath,
  );
  if (!deployment) {
    throw new Error("Refusing to rollback a different custom release");
  }
  const rollback = await dbModule.rollbackPlatformWebsiteDelivery({
    tenantId: tenant.tenantId,
    siteId,
    expectedDeliveryRevision: delivery.site.deliveryRevision,
    expectedMode: "custom_nextjs",
    expectedTargetId: deployment.id,
    actorUserId,
    changeReference,
    reason: "Expliciete staging-only rollback van de custom proof-delivery.",
  });
  if (rollback.status !== "succeeded") {
    throw new Error("Explicit custom proof rollback was blocked");
  }
}

async function writePrincipalFixtures(
  dbModule: DatabaseModule,
  managed: RuntimeTenant,
  actorUserId: string,
  expectedSha: string,
  evidenceDir: string,
): Promise<void> {
  const demo = await assertFieldDemoPrerequisite(
    dbModule.pool,
    "field_demo_fixture_recheck",
  );
  if (demo.tenantId === managed.tenantId) {
    throw new Error("Principal fixture tenants must be distinct");
  }
  await writeJson(join(evidenceDir, "w00-principal-fixtures.json"), {
    schemaVersion: 1,
    contract: "fieldgrid-w00-principal-fixtures-v1",
    environment: "staging",
    expectedMainSha: expectedSha,
    automationActorUserId: actorUserId,
    tenants: [
      { host: FIELD_DEMO_HOST, tenantId: demo.tenantId },
      { host: MANAGED_PROOF_HOST, tenantId: managed.tenantId },
    ],
  });
}

async function run(options: ProofOptions, environment: ProofEnvironment) {
  const startedAt = new Date().toISOString();
  let dbModule: DatabaseModule | null = null;
  let failureStage: ProofFailureStage = "configuration";
  let hostRole: ProofHostRole = null;
  const evidence: ProofEvidence = {
    schemaVersion: 1,
    contract: WEBSITE_STAGING_PROOF_STATE_VERSION,
    environment: "staging",
    mode: options.mode as Exclude<ProofMode, "check">,
    expectedSha: options.expectedSha,
    status: "failed",
    startedAt,
    completedAt: startedAt,
    managed: {
      host: MANAGED_PROOF_HOST,
      deliveryMode: null,
      active: false,
    },
    custom: {
      host: CUSTOM_PROOF_HOST,
      releaseId: null,
      deliveryMode: null,
      active: false,
    },
    errorCode: null,
    failureStage: null,
    hostRole: null,
    failureReason: null,
  };
  try {
    const errors = validateWebsiteStagingProofStateConfig(options, environment);
    if (errors.length > 0) throw new Error(errors.join("\n"));
    failureStage = "database_bootstrap";
    dbModule = await import("../lib/db/src/index.ts");
    failureStage = "automation_actor";
    const actorUserId = await resolveAutomationActor(
      dbModule.pool,
      environment.FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID,
    );
    if (options.mode === "prepare-managed") {
      failureStage = "field_demo_candidate";
      hostRole = "field_demo";
      await ensureFieldDemoFixture(
        dbModule,
        actorUserId,
        options.expectedSha,
        options.changeReference,
      );
      failureStage = "managed_final";
      hostRole = "managed_proof";
      const managed = await ensureManagedProof(
        dbModule,
        actorUserId,
        options.expectedSha,
        options.changeReference,
      );
      failureStage = "managed_public";
      await fetchMode(MANAGED_PROOF_URL, "managed_cms");
      failureStage = "automation_actor";
      hostRole = null;
      await resolveAutomationActor(dbModule.pool, actorUserId);
      failureStage = "field_demo_fixture_recheck";
      hostRole = "field_demo";
      await writePrincipalFixtures(
        dbModule,
        managed,
        actorUserId,
        options.expectedSha,
        options.evidenceDir,
      );
      evidence.managed = {
        host: MANAGED_PROOF_HOST,
        deliveryMode: "managed_cms",
        active: true,
      };
    } else if (options.mode === "complete-custom") {
      failureStage = "managed_public";
      hostRole = "managed_proof";
      await fetchMode(MANAGED_PROOF_URL, "managed_cms");
      failureStage = "release_verification";
      hostRole = null;
      await assertExactReleaseMarkers(options.expectedSha);
      failureStage = "custom_operation";
      hostRole = "custom_proof";
      const custom = await ensureCustomProof(
        dbModule,
        actorUserId,
        options.expectedSha,
        options.changeReference,
        environment,
      );
      evidence.managed = {
        host: MANAGED_PROOF_HOST,
        deliveryMode: "managed_cms",
        active: true,
      };
      evidence.custom = {
        host: CUSTOM_PROOF_HOST,
        releaseId: custom.releaseId,
        deliveryMode: "custom_nextjs",
        active: true,
      };
    } else if (options.mode === "verify") {
      failureStage = "release_verification";
      hostRole = null;
      await assertExactReleaseMarkers(options.expectedSha);
      failureStage = "managed_final";
      hostRole = "managed_proof";
      await assertManagedProof(dbModule);
      failureStage = "custom_operation";
      hostRole = "custom_proof";
      const releaseId = await assertCustomProof(
        dbModule,
        options.expectedSha,
        environment,
      );
      failureStage = "public_verification";
      hostRole = null;
      await Promise.all([
        fetchMode(MANAGED_PROOF_URL, "managed_cms"),
        fetchMode(CUSTOM_PROOF_URL, "custom_nextjs"),
      ]);
      evidence.managed = {
        host: MANAGED_PROOF_HOST,
        deliveryMode: "managed_cms",
        active: true,
      };
      evidence.custom = {
        host: CUSTOM_PROOF_HOST,
        releaseId,
        deliveryMode: "custom_nextjs",
        active: true,
      };
    } else if (options.mode === "rollback-custom") {
      failureStage = "custom_operation";
      hostRole = "custom_proof";
      await rollbackCustomProof(
        dbModule,
        actorUserId,
        options.expectedSha,
        options.changeReference,
        environment,
      );
      evidence.managed = {
        host: MANAGED_PROOF_HOST,
        deliveryMode: "managed_cms",
        active: true,
      };
    }
    evidence.status = "passed";
    return evidence;
  } catch (error) {
    evidence.errorCode = safeErrorCode(error);
    evidence.failureStage =
      error instanceof ProofStateError && error.failureStage
        ? error.failureStage
        : failureStage;
    evidence.hostRole =
      error instanceof ProofStateError && error.hostRole
        ? error.hostRole
        : hostRole;
    evidence.failureReason = safeFailureReason(error);
    throw error;
  } finally {
    evidence.completedAt = new Date().toISOString();
    try {
      await writeJson(
        join(options.evidenceDir, `${options.mode}.json`),
        evidence,
      );
    } finally {
      await dbModule?.pool.end();
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "check") {
    const managedHost: string = MANAGED_PROOF_HOST;
    const customHost: string = CUSTOM_PROOF_HOST;
    const managedSlug: string = MANAGED_PROOF_SLUG;
    if (
      managedHost === customHost ||
      managedSlug === "managed" ||
      !managedHost.startsWith(`${managedSlug}.`)
    ) {
      throw new Error("Website staging proof constants are unsafe");
    }
    console.log(`${WEBSITE_STAGING_PROOF_STATE_VERSION}: contract valid`);
    return;
  }
  const evidence = await run(options, process.env);
  console.log(
    JSON.stringify({
      status: evidence.status,
      mode: evidence.mode,
      expectedSha: evidence.expectedSha,
      managed: evidence.managed.active,
      custom: evidence.custom.active,
    }),
  );
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(formatSafeProofStateError(error));
    process.exitCode = 1;
  });
}

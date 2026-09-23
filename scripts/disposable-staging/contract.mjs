import { createHash } from "node:crypto";

export const CONTRACT = "fieldgrid-disposable-staging-rebuild-v1";
export const REPOSITORY = "veele-services/platform";
export const WORKFLOW =
  ".github/workflows/fieldgrid-disposable-staging-rebuild.yml";
export const STAGING_PROJECT_REF = "olyfmekyqozxrbrwwszu";
export const PRODUCTION_PROJECT_REF = "ckdtiuemeygrnujjibnw";
export const COMPATIBILITY_TENANT_ID = "00000000-0000-0000-0000-000000000010";
export const APP_SCHEMAS = Object.freeze(["app_private", "drizzle", "public"]);
export const MANAGED_SCHEMAS = Object.freeze([
  "auth",
  "extensions",
  "graphql",
  "graphql_public",
  "realtime",
  "storage",
  "supabase_functions",
  "vault",
]);
export const STORAGE_BUCKETS = Object.freeze([
  "assignment-photos",
  "documents",
  "knowledgebase-media",
  "news-hero",
  "org-assets",
  "personnel-avatars",
  "release-media",
]);
export const WRITER_UNITS = Object.freeze([
  "veele-staging-scheduler.timer",
  "veele-staging-scheduler.service",
  "veele-staging-notification-worker.service",
  "veele-staging-notifications.service",
  "veele-staging-api.service",
  "veele-staging-klant.service",
  "veele-staging-personeel.service",
  "veele-staging.service",
  "veele-staging-marketing.service",
  "veele-staging-website.service",
]);
export const PHASES = Object.freeze([
  "PREFLIGHT",
  "QUIESCED",
  "STORAGE_EMPTY",
  "SCHEMAS_CLEAN",
  "AUTH_EMPTY",
  "MIGRATED",
  "BOOTSTRAPPED",
  "VERIFIED",
  "ACTIVATED",
  "COMPLETE",
  "SAFE_STOPPED",
]);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA = /^[0-9a-f]{40}$/u;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export class RebuildError extends Error {
  constructor(code, phase = "PREFLIGHT", destructiveBoundaryPassed = false) {
    super(code);
    this.name = "RebuildError";
    this.code = code;
    this.phase = phase;
    this.destructiveBoundaryPassed = destructiveBoundaryPassed;
  }
}

export function fail(code, phase, destructiveBoundaryPassed) {
  throw new RebuildError(code, phase, destructiveBoundaryPassed);
}

export function requireThat(condition, code, phase, destructiveBoundaryPassed) {
  if (condition !== true) fail(code, phase, destructiveBoundaryPassed);
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

export function digest(value) {
  return sha256(JSON.stringify(stable(value)));
}

export function safeFailure(error, fallbackPhase = "PREFLIGHT") {
  if (error instanceof RebuildError) {
    return {
      code: error.code,
      phase: error.phase,
      destructiveBoundaryPassed: error.destructiveBoundaryPassed,
    };
  }
  return {
    code: "OPERATION_FAILED",
    phase: fallbackPhase,
    destructiveBoundaryPassed: false,
  };
}

function required(env, name) {
  const value = env[name]?.trim();
  requireThat(Boolean(value), "CONFIGURATION_MISSING");
  return value;
}

function assertEmail(value) {
  requireThat(
    value.length <= 320 && EMAIL.test(value),
    "BOOTSTRAP_EMAIL_INVALID",
  );
  return value.toLowerCase();
}

function assertPassword(value) {
  requireThat(
    value.length >= 16 && value.length <= 128,
    "BOOTSTRAP_PASSWORD_INVALID",
  );
  return value;
}

function assertTenant(env, suffix) {
  const id = required(env, `FIELDGRID_W00_STAGING_TENANT_${suffix}_ID`);
  const host = required(
    env,
    `FIELDGRID_W00_STAGING_TENANT_${suffix}_HOST`,
  ).toLowerCase();
  const slug = required(
    env,
    `FIELDGRID_REBUILD_TENANT_${suffix}_SLUG`,
  ).toLowerCase();
  const name = required(env, `FIELDGRID_REBUILD_TENANT_${suffix}_NAME`);
  const managerEmail = assertEmail(
    required(env, `FIELDGRID_REBUILD_TENANT_${suffix}_MANAGER_EMAIL`),
  );
  const managerPassword = assertPassword(
    required(env, `FIELDGRID_REBUILD_TENANT_${suffix}_MANAGER_PASSWORD`),
  );
  const managerName = required(
    env,
    `FIELDGRID_REBUILD_TENANT_${suffix}_MANAGER_NAME`,
  );
  requireThat(
    UUID.test(id) || (suffix === "A" && id === COMPATIBILITY_TENANT_ID),
    "BOOTSTRAP_TENANT_ID_INVALID",
  );
  requireThat(
    SLUG.test(slug) && host === `${slug}.staging.fieldgrid.nl`,
    "BOOTSTRAP_TENANT_HOST_INVALID",
  );
  requireThat(
    name.length <= 200 && managerName.length <= 200,
    "BOOTSTRAP_NAME_INVALID",
  );
  return { id, host, slug, name, managerEmail, managerPassword, managerName };
}

export function validateBootstrapConfiguration(env = process.env) {
  const platformEmail = assertEmail(
    required(env, "FIELDGRID_REBUILD_PLATFORM_ADMIN_EMAIL"),
  );
  const platformPassword = assertPassword(
    required(env, "FIELDGRID_REBUILD_PLATFORM_ADMIN_PASSWORD"),
  );
  const platformName = required(env, "FIELDGRID_REBUILD_PLATFORM_ADMIN_NAME");
  const tenantA = assertTenant(env, "A");
  const tenantB = assertTenant(env, "B");
  requireThat(
    tenantA.id === COMPATIBILITY_TENANT_ID,
    "BOOTSTRAP_TENANT_A_ID_INVALID",
  );
  requireThat(
    tenantA.id !== tenantB.id &&
      tenantA.host !== tenantB.host &&
      tenantA.slug !== tenantB.slug,
    "BOOTSTRAP_TENANTS_NOT_DISTINCT",
  );
  requireThat(
    new Set([platformEmail, tenantA.managerEmail, tenantB.managerEmail])
      .size === 3,
    "BOOTSTRAP_IDENTITIES_NOT_DISTINCT",
  );
  requireThat(platformName.length <= 200, "BOOTSTRAP_NAME_INVALID");
  return {
    platform: {
      email: platformEmail,
      password: platformPassword,
      name: platformName,
    },
    tenants: [tenantA, tenantB],
  };
}

export function validateDispatchEnvironment(env = process.env, { mode } = {}) {
  requireThat(
    ["plan", "rebuild", "finalize", "safe-stop"].includes(mode),
    "MODE_INVALID",
  );
  requireThat(
    env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_EVENT_NAME === "workflow_dispatch",
    "DISPATCH_INVALID",
  );
  requireThat(
    env.GITHUB_REPOSITORY === REPOSITORY &&
      env.GITHUB_REF === "refs/heads/main",
    "DISPATCH_INVALID",
  );
  const expectedMain = required(env, "EXPECTED_MAIN_SHA");
  const expectedStaging = required(env, "EXPECTED_STAGING_SHA");
  requireThat(
    SHA.test(expectedMain) && SHA.test(expectedStaging),
    "SHA_INVALID",
  );
  requireThat(env.GITHUB_SHA === expectedMain, "CHECKOUT_MISMATCH");
  requireThat(
    env.APP_ENV === "staging" && env.TARGET_ENVIRONMENT === "staging",
    "ENVIRONMENT_INVALID",
  );
  requireThat(
    env.EXPECTED_SUPABASE_PROJECT_REF === STAGING_PROJECT_REF,
    "PROJECT_INVALID",
  );
  requireThat(
    env.FORBIDDEN_SUPABASE_PROJECT_REF === PRODUCTION_PROJECT_REF,
    "PRODUCTION_GUARD_INVALID",
  );
  requireThat(
    env.NEXT_PUBLIC_SUPABASE_URL ===
      `https://${STAGING_PROJECT_REF}.supabase.co`,
    "SUPABASE_ORIGIN_INVALID",
  );
  if (mode === "rebuild") {
    requireThat(
      env.REBUILD_CONFIRMATION ===
        `${CONTRACT}:${STAGING_PROJECT_REF}:${expectedMain}`,
      "CONFIRMATION_INVALID",
    );
  }
  const runId = required(env, "GITHUB_RUN_ID");
  const attempt = required(env, "GITHUB_RUN_ATTEMPT");
  requireThat(
    /^[1-9][0-9]{0,19}$/u.test(runId) && /^[1-9][0-9]{0,4}$/u.test(attempt),
    "RUN_ID_INVALID",
  );
  return {
    mode,
    expectedMain,
    expectedStaging,
    runId: Number(runId),
    attempt: Number(attempt),
  };
}

export function publicPlan(config, bootstrap, inventory) {
  return {
    contract: CONTRACT,
    mode: "plan",
    repository: REPOSITORY,
    environment: "staging",
    project: STAGING_PROJECT_REF,
    candidateSha: config.expectedMain,
    expectedStagingSha: config.expectedStaging,
    destructive: false,
    mutationsPerformed: false,
    applicationSchemas: [...APP_SCHEMAS],
    managedSchemasPreserved: [...MANAGED_SCHEMAS],
    storageBuckets: [...STORAGE_BUCKETS],
    writerUnits: [...WRITER_UNITS],
    bootstrap: {
      tenantCount: bootstrap.tenants.length,
      distinctIdentityCount: 1 + bootstrap.tenants.length,
      tenantHosts: bootstrap.tenants.map(({ host }) => host).sort(),
      credentialsConfigured: true,
    },
    inventory,
  };
}

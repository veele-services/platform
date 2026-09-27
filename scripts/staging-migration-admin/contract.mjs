import { digest, requireThat } from "../disposable-staging/contract.mjs";

export { digest, requireThat };

export const CONTRACT = "fieldgrid-staging-migration-admin-bootstrap-v1";
export const RECOVERY_CONTRACT =
  "fieldgrid-staging-migration-admin-bootstrap-recover-v1";
export const REPOSITORY = "veele-services/platform";
export const STAGING_PROJECT_REF = "olyfmekyqozxrbrwwszu";
export const PRODUCTION_PROJECT_REF = "ckdtiuemeygrnujjibnw";
export const MIGRATION_ROLE = "fieldgrid_migration_admin";
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

const SHA = /^[0-9a-f]{40}$/u;
const CATALOG_DIGEST = /^[0-9a-f]{64}$/u;
const PASSWORD = /^[0-9a-f]{64}$/u;

function required(env, name) {
  const value = env[name]?.trim();
  requireThat(Boolean(value), "CONFIGURATION_MISSING");
  return value;
}

export function validateBootstrapDispatch(env = process.env, { mode } = {}) {
  requireThat(
    mode === "plan" || mode === "apply" || mode === "recover",
    "MODE_INVALID",
  );
  requireThat(
    env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
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
    env.APP_ENV === "staging" &&
      env.TARGET_ENVIRONMENT === "staging" &&
      env.EXPECTED_SUPABASE_PROJECT_REF === STAGING_PROJECT_REF &&
      env.FORBIDDEN_SUPABASE_PROJECT_REF === PRODUCTION_PROJECT_REF,
    "ENVIRONMENT_INVALID",
  );
  let recoverySourceMain;
  let expectedManagedCatalogDigest;
  let expectedActiveStagingRelease;
  if (mode === "apply" || mode === "recover") {
    recoverySourceMain =
      mode === "recover"
        ? required(env, "RECOVERY_SOURCE_MAIN_SHA")
        : undefined;
    expectedManagedCatalogDigest =
      mode === "recover"
        ? required(env, "EXPECTED_MANAGED_CATALOG_DIGEST")
        : undefined;
    expectedActiveStagingRelease = required(
      env,
      "EXPECTED_ACTIVE_STAGING_RELEASE_SHA",
    );
    requireThat(
      mode === "apply"
        ? env.BOOTSTRAP_CONFIRMATION ===
            `${CONTRACT}:${STAGING_PROJECT_REF}:${expectedMain}:${expectedStaging}:${expectedActiveStagingRelease}`
        : SHA.test(recoverySourceMain) &&
            CATALOG_DIGEST.test(expectedManagedCatalogDigest) &&
            env.BOOTSTRAP_CONFIRMATION ===
              `${RECOVERY_CONTRACT}:${STAGING_PROJECT_REF}:${recoverySourceMain}:${expectedMain}:${expectedStaging}:${expectedActiveStagingRelease}:${expectedManagedCatalogDigest}`,
      "CONFIRMATION_INVALID",
    );
    requireThat(
      SHA.test(expectedActiveStagingRelease),
      "ACTIVE_RELEASE_SHA_INVALID",
    );
    requireThat(
      PASSWORD.test(required(env, "FIELDGRID_MIGRATION_DATABASE_PASSWORD")),
      "MIGRATION_PASSWORD_INVALID",
    );
  }
  return {
    mode,
    expectedMain,
    expectedStaging,
    recoverySourceMain,
    expectedManagedCatalogDigest,
    expectedActiveStagingRelease,
  };
}

export function publicResult(config, status, additions = {}) {
  return {
    contract: CONTRACT,
    repository: REPOSITORY,
    environment: "staging",
    project: STAGING_PROJECT_REF,
    operation: config.mode,
    expectedMainSha: config.expectedMain,
    expectedStagingSha: config.expectedStaging,
    ...(config.expectedActiveStagingRelease
      ? {
          expectedActiveStagingReleaseSha: config.expectedActiveStagingRelease,
        }
      : {}),
    destructive: config.mode !== "plan",
    status,
    ...additions,
  };
}

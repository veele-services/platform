import { digest, requireThat } from "../disposable-staging/contract.mjs";

export { digest, requireThat };

export const CONTRACT = "fieldgrid-staging-migration-admin-bootstrap-v1";
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
const PASSWORD = /^[0-9a-f]{64}$/u;

function required(env, name) {
  const value = env[name]?.trim();
  requireThat(Boolean(value), "CONFIGURATION_MISSING");
  return value;
}

export function validateBootstrapDispatch(env = process.env, { mode } = {}) {
  requireThat(mode === "plan" || mode === "apply", "MODE_INVALID");
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
  if (mode === "apply") {
    requireThat(
      env.BOOTSTRAP_CONFIRMATION ===
        `${CONTRACT}:${STAGING_PROJECT_REF}:${expectedMain}`,
      "CONFIRMATION_INVALID",
    );
    requireThat(
      PASSWORD.test(required(env, "FIELDGRID_MIGRATION_DATABASE_PASSWORD")),
      "MIGRATION_PASSWORD_INVALID",
    );
  }
  return { mode, expectedMain, expectedStaging };
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
    destructive: config.mode === "apply",
    status,
    ...additions,
  };
}

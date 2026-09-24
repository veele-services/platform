import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("bootstrap workflow is manual, exact-ref verified before checkout and staging locked", () => {
  const workflow = read(
    ".github/workflows/fieldgrid-staging-migration-admin-bootstrap.yml",
  );
  assert.match(
    workflow,
    /^name: Fieldgrid Staging Migration Admin Bootstrap$/mu,
  );
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /\n\s+(?:push|schedule|pull_request):/u);
  assert.match(workflow, /default: plan/u);
  assert.match(workflow, /permissions:\n\s+actions: read\n\s+contents: read/u);
  assert.match(workflow, /group: veele-staging/u);
  assert.match(workflow, /runs-on: \[self-hosted, linux, x64, veele\]/u);
  assert.match(workflow, /environment: staging/u);
  const verify = workflow.indexOf(
    "- name: Verify exact dispatch before repository code",
  );
  const checkout = workflow.indexOf("- name: Checkout exact main candidate");
  assert.ok(verify >= 0 && checkout > verify);
  const preCheckout = workflow.slice(verify, checkout);
  assert.match(
    preCheckout,
    /test "\$GITHUB_REPOSITORY" = veele-services\/platform/u,
  );
  assert.match(preCheckout, /test "\$GITHUB_REF" = refs\/heads\/main/u);
  assert.match(preCheckout, /test "\$GITHUB_SHA" = "\$EXPECTED_MAIN_SHA"/u);
  assert.match(preCheckout, /\["main", "staging"\]\.map/u);
  assert.match(
    preCheckout,
    /Authorization: `Bearer \$\{process\.env\.GITHUB_TOKEN\}`/u,
  );
  assert.match(preCheckout, /if \(!response\.ok\)/u);
  assert.match(preCheckout, /!\/\^\[0-9a-f\]\{40\}\$\/u\.test\(sha\)/u);
  assert.match(preCheckout, /test "\$live_main" = "\$EXPECTED_MAIN_SHA"/u);
  assert.match(
    preCheckout,
    /test "\$live_staging" = "\$EXPECTED_STAGING_SHA"/u,
  );
  assert.doesNotMatch(workflow.slice(0, checkout), /uses: actions\/checkout@/u);
  assert.doesNotMatch(workflow, /(?:^|\s)(?:gh|curl|jq)(?:\s|$)/mu);
  const jobEnvironment = workflow.slice(
    workflow.indexOf("    env:"),
    workflow.indexOf("    steps:"),
  );
  assert.doesNotMatch(jobEnvironment, /secrets\.DATABASE_URL/u);
});

test("plan has only the legacy credential and apply receives the new password step-locally", () => {
  const workflow = read(
    ".github/workflows/fieldgrid-staging-migration-admin-bootstrap.yml",
  );
  const plan = workflow.slice(
    workflow.indexOf("- name: Produce read-only bootstrap plan"),
    workflow.indexOf("- name: Reverify exact refs immediately before apply"),
  );
  const apply = workflow.slice(
    workflow.indexOf("- name: Apply one-time migration-admin bootstrap"),
    workflow.indexOf("- name: Upload secret-free bootstrap evidence"),
  );
  assert.match(plan, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/u);
  assert.match(apply, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/u);
  assert.doesNotMatch(plan, /FIELDGRID_MIGRATION_DATABASE_PASSWORD/u);
  assert.match(
    apply,
    /FIELDGRID_MIGRATION_DATABASE_PASSWORD: \$\{\{ secrets\.FIELDGRID_MIGRATION_DATABASE_PASSWORD \}\}/u,
  );
  assert.match(workflow, /--plan/u);
  assert.match(workflow, /--apply/u);
  assert.match(
    workflow,
    /fieldgrid-staging-migration-admin-bootstrap-v1:olyfmekyqozxrbrwwszu:\$EXPECTED_MAIN_SHA/u,
  );
  assert.doesNotMatch(workflow, /secrets\.(?:create|update)|gh secret/u);
});

test("bootstrap implementation is least-privilege, scoped and secret-safe", () => {
  const contract = read("scripts/staging-migration-admin/contract.mjs");
  const database = read("scripts/staging-migration-admin/database.mjs");
  const runner = read("scripts/staging-migration-admin/runner.mjs");
  const environment = read("scripts/staging-migration-admin/environment.mjs");
  const health = read("scripts/staging-migration-admin/health.mjs");
  assert.match(contract, /MIGRATION_ROLE = "fieldgrid_migration_admin"/u);
  assert.match(contract, /\^\[0-9a-f\]\{64\}\$/u);
  assert.match(contract, /FORBIDDEN_SUPABASE_PROJECT_REF/u);
  assert.match(database, /NOSUPERUSER NOBYPASSRLS NOREPLICATION NOINHERIT/u);
  assert.match(database, /GRANT CONNECT,CREATE ON DATABASE postgres/u);
  assert.match(database, /GRANT USAGE ON SCHEMA auth/u);
  assert.match(database, /SELECT \(id,email,raw_app_meta_data\)/u);
  assert.match(database, /ALTER PUBLICATION supabase_realtime OWNER TO/u);
  assert.match(database, /authorizedProviderCompatibility/u);
  assert.match(database, /prosecdef/u);
  assert.match(database, /WITH INHERIT FALSE, SET FALSE, ADMIN TRUE/u);
  assert.match(database, /WITH INHERIT TRUE, SET FALSE, ADMIN FALSE/u);
  assert.match(database, /REVOKE[\s\S]*FROM postgres GRANTED BY postgres/u);
  assert.match(database, /TARGET_ROLE_MEMBERSHIP_INVALID/u);
  assert.match(database, /bootstrapCommitAttempted/u);
  assert.match(database, /has_function_privilege/u);
  const planImplementation = database.slice(
    database.indexOf("export async function bootstrapPlan"),
    database.indexOf("async function runtimeMembership"),
  );
  assert.match(planImplementation, /BEGIN READ ONLY/u);
  assert.doesNotMatch(
    planImplementation,
    /\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\b/u,
  );
  assert.doesNotMatch(database, /REASSIGN OWNED/iu);
  assert.doesNotMatch(
    database,
    /ALTER (?:SCHEMA|TABLE) (?:auth|storage|extensions)/iu,
  );
  assert.match(
    database,
    /set_config\('fieldgrid\.bootstrap\.verifier',\$1,true\)/u,
  );
  assert.doesNotMatch(
    database,
    /PASSWORD \$\{password\}|PASSWORD '.*password/iu,
  );
  assert.match(runner, /mode: 0o600/u);
  assert.match(runner, /stateMayHaveCommitted/u);
  assert.match(runner, /WRITER_SAFE_STOP_FAILED/u);
  assert.match(runner, /RECOVERY_REQUIRED/u);
  assert.match(runner, /servicesSafeStopped = true/u);
  assert.match(runner, /originalServices: baseline\.map/u);
  assert.match(
    runner,
    /requireThat\(servicesRestored, "WRITER_RESTORE_FAILED"\)/u,
  );
  assert.match(runner, /verifyRestoredStagingHealth/u);
  assert.match(health, /staging\.fieldgrid\.nl\/admin\/healthz/u);
  assert.match(health, /staging\.fieldgrid\.nl\/personeel\/healthz/u);
  assert.match(health, /staging\.fieldgrid\.nl\/klant\/healthz/u);
  assert.match(health, /staging\.fieldgrid\.nl\/api\/healthz/u);
  assert.match(environment, /\$\{MIGRATION_ROLE\}\.\$\{STAGING_PROJECT_REF\}/u);
  assert.match(environment, /:5432\/postgres/u);
  assert.doesNotMatch(environment, /console\.(?:log|error)/u);
});

test("PostgreSQL 17 regression covers absent role, wrong attributes, rollback, retry and real target inventory", () => {
  const workflow = read(".github/workflows/main-exact-head-validation.yml");
  const regression = read(
    "scripts/fieldgrid-staging-migration-admin-bootstrap-postgres17.mjs",
  );
  assert.match(workflow, /^  staging-migration-admin-bootstrap-postgres17:$/mu);
  assert.match(workflow, /image: postgres:17/u);
  const required = workflow.slice(workflow.indexOf("  required:"));
  assert.match(required, /- staging-migration-admin-bootstrap-postgres17/u);
  const bootstrapJob = workflow.slice(
    workflow.indexOf("  staging-migration-admin-bootstrap-postgres17:"),
    workflow.indexOf("\n  runtime-entrypoint:"),
  );
  assert.match(
    bootstrapJob,
    /node --test[\s\S]*tests\/fieldgrid-staging-migration-admin-bootstrap\.test\.mjs[\s\S]*tests\/security\/fieldgrid-staging-migration-admin-bootstrap-source\.test\.mjs/u,
  );
  assert.match(regression, /pg_database_owner/u);
  assert.match(regression, /EXISTING_TARGET_ROLE_PRIVILEGED/u);
  assert.match(regression, /injectFailure: "after-objects"/u);
  assert.match(regression, /assert\.rejects/u);
  assert.match(regression, /const first = await applyBootstrap/u);
  assert.match(regression, /const second = await applyBootstrap/u);
  assert.match(regression, /verifyTargetLogin\(target, before\.digest\)/u);
  assert.match(regression, /assertNoExternalWriters\(target\)/u);
  assert.match(regression, /const plan = await bootstrapPlan\(legacy\)/u);
  assert.match(regression, /fixture_unknown_writer/u);
  assert.match(regression, /internal_note: false/u);
  assert.match(regression, /retry: true, rollback: true/u);
});

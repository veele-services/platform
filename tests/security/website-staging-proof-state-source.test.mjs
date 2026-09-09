import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("health refresh capability is private, exact and transition-only", () => {
  const migration = read(
    "lib/db/migrations/20260909121000_custom_website_health_refresh.sql",
  );
  const service = read("lib/db/src/website-custom-health-refresh-service.ts");

  assert.match(
    migration,
    /FUNCTION app_private\.fieldgrid_claim_custom_website_health_refresh/u,
  );
  assert.match(
    migration,
    /FUNCTION app_private\.fieldgrid_record_custom_website_health_refresh/u,
  );
  assert.doesNotMatch(
    migration,
    /FUNCTION public\.fieldgrid_(?:claim|record)_custom_website_health_refresh/u,
  );
  assert.equal(
    (migration.match(/SET search_path TO pg_catalog$/gmu) ?? []).length,
    2,
  );
  assert.match(
    migration,
    /FROM PUBLIC, anon, authenticated, service_role,[\s\S]*fieldgrid_runtime_app, fieldgrid_runtime_data/u,
  );
  assert.match(migration, /TO fieldgrid_runtime_data/u);
  assert.match(
    migration,
    /source_migration[\s\S]*20260909121000_custom_website_health_refresh\.sql/u,
  );
  assert.match(migration, /v_previous_checked_at IS NOT NULL/u);
  assert.match(migration, /FOR UPDATE OF deployment SKIP LOCKED/u);
  assert.match(
    migration,
    /deployment\.last_checked_at <= p_attempt_started_at/u,
  );
  assert.match(
    service,
    /FROM app_private\.fieldgrid_claim_custom_website_health_refresh/u,
  );
  assert.match(
    service,
    /FROM app_private\.fieldgrid_record_custom_website_health_refresh/u,
  );
});

test("background refresher is bounded, non-overlapping and SSRF-safe", () => {
  const checker = read("lib/db/src/website-custom-health.ts");
  const refresher = read(
    "artifacts/api-server/src/lib/custom-website-health-refresher.ts",
  );

  assert.match(checker, /AbortController/u);
  assert.match(checker, /customWebsiteOriginAddressesArePublic/u);
  assert.match(checker, /rejectUnauthorized: true/u);
  assert.match(checker, /servername: origin\.hostname/u);
  assert.match(checker, /lookup\(_hostname, _lookupOptions, callback\)/u);
  assert.match(checker, /CUSTOM_WEBSITE_HEALTH_RESPONSE_MAX_BYTES = 32_768/u);
  assert.match(
    refresher,
    /CUSTOM_WEBSITE_HEALTH_REFRESH_INTERVAL_MS = 60_000/u,
  );
  assert.match(refresher, /CUSTOM_WEBSITE_HEALTH_REFRESH_CONCURRENCY = 10/u);
  assert.match(refresher, /CUSTOM_WEBSITE_HEALTH_REFRESH_MAX_BATCHES = 4/u);
  assert.match(refresher, /currentRun/u);
  assert.match(
    read("lib/db/src/website-custom-health-refresh-service.ts"),
    /pg_try_advisory_lock/u,
  );
});

test("core staging deploy persists the exact health refresh and pooler bindings", () => {
  const deploy = read(".github/workflows/deploy.yml");

  assert.match(
    deploy,
    /FIELDGRID_CUSTOM_WEBSITE_HEALTH_REFRESH_ENABLED: \$\{\{ vars\.FIELDGRID_CUSTOM_WEBSITE_HEALTH_REFRESH_ENABLED \|\| 'false' \}\}/u,
  );
  assert.match(
    deploy,
    /FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID: \$\{\{ secrets\.FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID \}\}/u,
  );
  assert.match(
    deploy,
    /FIELDGRID_STAGING_DATABASE_POOLER_HOST: \$\{\{ vars\.FIELDGRID_STAGING_DATABASE_POOLER_HOST \}\}/u,
  );
  assert.match(deploy, /test "\$GITHUB_REF" = "refs\/heads\/staging"/u);
  for (const name of [
    "FIELDGRID_CUSTOM_WEBSITE_HEALTH_REFRESH_ENABLED",
    "FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID",
    "FIELDGRID_STAGING_DATABASE_POOLER_HOST",
  ]) {
    assert.match(deploy, new RegExp(`printf '${name}=%s\\\\n'`, "u"));
  }
  assert.match(
    deploy,
    /FIELDGRID_RUNTIME_PRINCIPAL_CONFIRM \\\n+            FIELDGRID_STAGING_DATABASE_POOLER_HOST; do/u,
  );
});

test("proof-state workflow is two-phase, exact-SHA and short-lived", () => {
  const script = read("scripts/fieldgrid-website-staging-proof-state.mts");
  const provisioning = read("lib/db/src/tenant-provisioning.ts");
  const workflow = read(".github/workflows/website-staging-proof-state.yml");
  const operations = read("docs/website-module-enterprise-activation.md");

  assert.match(script, /managed-proof-w00-v2\.staging\.fieldgrid\.nl/u);
  assert.doesNotMatch(script, /["'`]managed\.staging\.fieldgrid\.nl/u);
  assert.doesNotMatch(operations, /managed\.staging\.fieldgrid\.nl/u);
  assert.match(script, /FIELDGRID_WEBSITE_STAGING_PROOF_W00_V2/u);
  for (const code of [
    "field_demo_identity_ambiguous",
    "field_demo_identity_collision",
    "field_demo_primary_domain_mismatch",
    "field_demo_plan_mismatch",
    "field_demo_subscription_invalid",
    "field_demo_owner_invalid",
    "field_demo_binding_invalid",
    "field_demo_settings_invalid",
    "field_demo_runtime_state_invalid",
    "field_demo_provisioning_failed",
    "field_demo_provisioning_verification_failed",
    "field_demo_rollback_failed",
    "managed_proof_identity_ambiguous",
    "managed_proof_identity_mismatch",
    "managed_proof_plan_mismatch",
    "managed_proof_ownership_mismatch",
    "runtime_host_binding_invalid",
    "runtime_host_settings_invalid",
  ]) {
    assert.match(script, new RegExp(code, "u"));
  }
  assert.match(script, /reader\.read\(\)/u);
  assert.match(script, /await reader\.cancel\(\)/u);
  assert.match(script, /\.fieldgrid-release-sha/u);
  assert.match(
    script,
    /options\.mode !== "prepare-managed" && !UUID_PATTERN\.test\(actor\)/u,
  );
  assert.match(
    script,
    /WHERE status = 'active' AND role IN \('owner', 'admin'\)/u,
  );
  const actorResolver = script.slice(
    script.indexOf("async function resolveAutomationActor"),
    script.indexOf("async function resolveRuntimeTenant"),
  );
  assert.match(
    actorResolver,
    /return selectAutomationActor\(result\.rows, requested\)/u,
  );
  assert.match(actorResolver, /candidates\.length !== 1/u);
  assert.match(actorResolver, /const admins = candidates\.filter/u);
  assert.match(actorResolver, /if \(admins\.length === 1\)/u);
  assert.match(actorResolver, /if \(admins\.length > 1\)/u);
  assert.match(actorResolver, /if \(owners\.length !== 1\)/u);
  assert.doesNotMatch(actorResolver, /\bLIMIT\s+1\b/iu);
  assert.doesNotMatch(actorResolver, /auth\.users|email/iu);
  assert.match(
    script,
    /await resolveAutomationActor\(dbModule\.pool, actorUserId\);/u,
  );
  const runFunction = script.slice(script.indexOf("async function run("));
  const prepareManagedBranch = runFunction.slice(
    runFunction.indexOf('if (options.mode === "prepare-managed")'),
    runFunction.indexOf('} else if (options.mode === "complete-custom")'),
  );
  assert.ok(
    prepareManagedBranch.indexOf("await ensureFieldDemoFixture(") <
      prepareManagedBranch.indexOf("await ensureManagedProof("),
    "field-demo must be ensured before managed-proof mutation",
  );
  assert.ok(
    prepareManagedBranch.indexOf("await ensureManagedProof(") <
      prepareManagedBranch.indexOf("await writePrincipalFixtures("),
    "principal fixtures must revalidate field-demo after managed-proof mutation",
  );
  const fieldDemoBootstrap = script.slice(
    script.indexOf("async function ensureFieldDemoFixture"),
    script.indexOf("export function managedProofCandidateErrorCode"),
  );
  assert.match(fieldDemoBootstrap, /if \(existing\) return existing;/u);
  assert.match(fieldDemoBootstrap, /await dbModule\.provisionTenant\(/u);
  assert.match(fieldDemoBootstrap, /ownerEmail: FIELD_DEMO_OWNER_EMAIL/u);
  assert.match(
    fieldDemoBootstrap,
    /await dbModule\.completeProvisionedTenantOwnerInvite\(/u,
  );
  assert.ok(
    fieldDemoBootstrap.indexOf("fieldDemoProvisioningRunOwnershipIsExact") <
      fieldDemoBootstrap.indexOf(
        "await dbModule.completeProvisionedTenantOwnerInvite(",
      ),
    "owner completion must follow exact automation ownership verification",
  );
  assert.doesNotMatch(fieldDemoBootstrap, /moduleKeys/u);
  for (const metadata of [
    "automationMarker",
    "automationContract",
    "environment",
    "stagingOnly",
    "expectedSha",
    "changeReference",
  ]) {
    assert.match(fieldDemoBootstrap, new RegExp(`${metadata}[:,]`, "u"));
  }
  assert.match(fieldDemoBootstrap, /fieldDemoProvisioningRunIsExact/u);
  assert.match(fieldDemoBootstrap, /rollbackProvisionedTenant/u);
  assert.match(fieldDemoBootstrap, /field_demo_rollback_failed/u);
  assert.doesNotMatch(fieldDemoBootstrap, /\.catch\(\(\) => undefined\)/u);
  assert.match(script, /FROM public\.tenant_subscriptions AS subscription/u);
  assert.match(script, /subscription\.status IN \('trial', 'active'\)/u);
  assert.match(script, /plan\.key = 'enterprise'/u);
  assert.match(script, /plan\.is_active = true/u);
  assert.match(script, /FROM auth\.users/u);
  assert.match(script, /email_confirmed_at IS NOT NULL/u);
  assert.match(script, /length\(owner\.encrypted_password\) > 0/u);
  assert.match(script, /owner\.is_anonymous = false/u);
  assert.match(script, /owner\.aud = 'authenticated'/u);
  assert.match(script, /owner\.role = 'authenticated'/u);
  assert.match(script, /deleted_at IS NULL/u);
  assert.match(script, /banned_until IS NULL/u);
  assert.match(script, /membership\.role = 'owner'/u);
  assert.match(script, /membership\.status = 'active'/u);
  assert.match(script, /FROM public\.tenant_user_roles AS user_role/u);
  assert.match(script, /template_role\.name = 'Management'/u);
  assert.match(
    script,
    /FROM public\.tenant_role_permissions AS actual_permission/u,
  );
  assert.match(fieldDemoBootstrap, /ownerInviteStatus: "accepted"/u);
  assert.match(provisioning, /ownerInviteStatus\?: "sent" \| "accepted"/u);
  assert.match(
    provisioning,
    /const ownerInviteStatus = input\.ownerInviteStatus \?\? "sent"/u,
  );
  assert.match(
    provisioning,
    /inviteSentAt: ownerInviteStatus === "sent" \? new Date\(\) : null/u,
  );
  assert.match(script, /failureStage: ProofFailureStage \| null/u);
  assert.match(script, /hostRole: ProofHostRole/u);
  assert.match(workflow, /prepare-managed/u);
  assert.match(workflow, /complete-custom/u);
  assert.match(workflow, /sleep 370/u);
  assert.match(workflow, /retention-days: 1/u);
  assert.match(
    workflow,
    /secrets\.FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID/u,
  );
  assert.match(
    workflow,
    /Prepare managed proof with migration-admin connection[\s\S]*secrets\.DATABASE_URL/u,
  );
  assert.match(
    workflow,
    /Complete, verify or rollback with runtime connection[\s\S]*secrets\.FIELDGRID_RUNTIME_DATABASE_URL/u,
  );
  const runtimeStep = workflow.slice(
    workflow.indexOf(
      "- name: Complete, verify or rollback with runtime connection",
    ),
    workflow.indexOf(
      "- name: Prove durable custom health after six-minute soak",
    ),
  );
  const prepareStep = workflow.slice(
    workflow.indexOf(
      "- name: Prepare managed proof with migration-admin connection",
    ),
    workflow.indexOf(
      "- name: Complete, verify or rollback with runtime connection",
    ),
  );
  assert.match(
    prepareStep,
    /DATABASE_URL: \$\{\{ secrets\.FIELDGRID_RUNTIME_DATABASE_URL \}\}/u,
  );
  assert.match(
    prepareStep,
    /FIELDGRID_MIGRATION_DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/u,
  );
  assert.match(
    prepareStep,
    /FIELDGRID_DATABASE_CONNECTION_PURPOSE: migration/u,
  );
  assert.equal(
    (workflow.match(/FIELDGRID_DATABASE_CONNECTION_PURPOSE/gu) ?? []).length,
    1,
  );
  assert.match(workflow, /fieldgrid-database-connection-purpose\.test\.ts/u);
  assert.doesNotMatch(
    prepareStep,
    /\n\s+DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/u,
  );
  assert.doesNotMatch(runtimeStep, /secrets\.DATABASE_URL/u);
  assert.doesNotMatch(runtimeStep, /FIELDGRID_MIGRATION_DATABASE_URL/u);
  assert.doesNotMatch(runtimeStep, /FIELDGRID_DATABASE_CONNECTION_PURPOSE/u);
  assert.doesNotMatch(
    read(".github/workflows/deploy.yml"),
    /FIELDGRID_DATABASE_CONNECTION_PURPOSE/u,
  );
  assert.ok(
    script.indexOf("const evidence: ProofEvidence") <
      script.indexOf('await import("../lib/db/src/index.ts")'),
    "proof evidence must be initialized before the database bootstrap",
  );
  assert.match(workflow, /scripts\/fieldgrid-database-root-cert\.mjs/u);
  assert.match(workflow, /DB_SSL_REJECT_UNAUTHORIZED: "true"/u);
  assert.match(workflow, /PGSSLMODE: verify-full/u);
  assert.match(
    workflow,
    /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/u,
  );
  assert.equal(
    (
      workflow.match(
        /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/gu,
      ) ?? []
    ).length,
    2,
  );
  assert.doesNotMatch(workflow, /uses:\s+[^\s#]+@v\d+/u);
  assert.match(
    workflow,
    /EXPECTED_SUPABASE_PROJECT_REF: olyfmekyqozxrbrwwszu/u,
  );
  assert.match(
    workflow,
    /NEXT_PUBLIC_SUPABASE_URL: \$\{\{ secrets\.NEXT_PUBLIC_SUPABASE_URL \}\}/u,
  );
});

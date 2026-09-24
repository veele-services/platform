import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("disposable workflow is manual, main-bound, staging-locked and plan-default", () => {
  const workflow = read(
    ".github/workflows/fieldgrid-disposable-staging-rebuild.yml",
  );
  assert.match(workflow, /^name: Fieldgrid Disposable Staging Rebuild$/mu);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /\n\s+(push|schedule):/u);
  assert.match(workflow, /default: plan/u);
  assert.match(workflow, /group: veele-staging/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.match(workflow, /test "\$GITHUB_REF" = refs\/heads\/main/u);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$EXPECTED_MAIN_SHA"/u);
  assert.match(
    workflow,
    /FORBIDDEN_SUPABASE_PROJECT_REF: ckdtiuemeygrnujjibnw/u,
  );
  assert.match(workflow, /deployment_mode: disposable-rebuild/u);
  assert.match(workflow, /disposable-staging-plan-/u);
});

test("disposable plan verifies live refs with authenticated built-in fetch before checkout", () => {
  const workflow = read(
    ".github/workflows/fieldgrid-disposable-staging-rebuild.yml",
  );
  const verification = workflow.indexOf(
    "- name: Verify exact read-only dispatch before repository code",
  );
  const checkout = workflow.indexOf("- name: Checkout exact main candidate");
  assert.ok(verification >= 0 && checkout > verification);
  const preCheckout = workflow.slice(verification, checkout);

  assert.match(workflow, /permissions:\n\s+actions: read\n\s+contents: read/u);
  assert.doesNotMatch(workflow, /(?:^|\s)(?:gh|curl|jq)(?:\s|$)/mu);
  assert.doesNotMatch(preCheckout, /gh api/u);
  assert.match(preCheckout, /set -euo pipefail/u);
  assert.match(preCheckout, /test "\$GITHUB_EVENT_NAME" = workflow_dispatch/u);
  assert.match(
    preCheckout,
    /test "\$GITHUB_REPOSITORY" = veele-services\/platform/u,
  );
  assert.match(preCheckout, /test "\$GITHUB_REF" = refs\/heads\/main/u);
  assert.match(preCheckout, /test "\$GITHUB_SHA" = "\$EXPECTED_MAIN_SHA"/u);
  assert.match(preCheckout, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/u);
  assert.match(preCheckout, /node --input-type=module -e/u);
  assert.match(preCheckout, /read -r live_main live_staging < <\(/u);
  assert.match(preCheckout, /const refs = await Promise\.all/u);
  assert.match(preCheckout, /\["main", "staging"\]\.map/u);
  assert.match(
    preCheckout,
    /https:\/\/api\.github\.com\/repos\/\$\{process\.env\.GITHUB_REPOSITORY\}\/git\/ref\/heads\/\$\{branch\}/u,
  );
  assert.match(
    preCheckout,
    /Authorization: `Bearer \$\{process\.env\.GITHUB_TOKEN\}`/u,
  );
  assert.match(preCheckout, /Accept: "application\/vnd\.github\+json"/u);
  assert.match(preCheckout, /"X-GitHub-Api-Version": "2022-11-28"/u);
  assert.match(preCheckout, /if \(!response\.ok\)/u);
  assert.match(
    preCheckout,
    /const sha = \(await response\.json\(\)\)\.object\?\.sha \?\? ""/u,
  );
  assert.match(preCheckout, /!\/\^\[0-9a-f\]\{40\}\$\/u\.test\(sha\)/u);
  assert.match(
    preCheckout,
    /process\.stdout\.write\(`\$\{refs\[0\]\} \$\{refs\[1\]\}\\n`\)/u,
  );
  assert.match(
    preCheckout,
    /\[\[ "\$EXPECTED_MAIN_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/u,
  );
  assert.match(
    preCheckout,
    /\[\[ "\$EXPECTED_STAGING_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/u,
  );
  assert.match(preCheckout, /test "\$live_main" = "\$EXPECTED_MAIN_SHA"/u);
  assert.match(
    preCheckout,
    /test "\$live_staging" = "\$EXPECTED_STAGING_SHA"/u,
  );
  assert.doesNotMatch(workflow.slice(0, checkout), /uses: actions\/checkout@/u);
});

test("every hosted staging migration writer shares the canonical admission lock", () => {
  const stagingOnlyWriters = [
    ".github/workflows/database-autofix.yml",
    ".github/workflows/fieldgrid-disposable-staging-rebuild.yml",
    ".github/workflows/fieldgrid-staging-catalog-normalization.yml",
    ".github/workflows/fieldgrid-staging-document-storage-backfill.yml",
    ".github/workflows/fieldgrid-staging-field-demo-domain-repair.yml",
    ".github/workflows/fieldgrid-staging-field-demo-owner-binding-repair.yml",
    ".github/workflows/fieldgrid-staging-field-demo-owner-repair.yml",
    ".github/workflows/fieldgrid-staging-tenant-management-authorization.yml",
    ".github/workflows/fieldgrid-v1-wp1-clean-base.yml",
    ".github/workflows/fieldgrid-w00-runtime-principal.yml",
    ".github/workflows/seed-staging-demo.yml",
    ".github/workflows/website-staging-proof-state.yml",
  ];
  for (const path of stagingOnlyWriters) {
    assert.match(
      read(path),
      /concurrency:\n\s+group: veele-staging\n\s+cancel-in-progress: false/u,
      path,
    );
  }
  assert.match(
    read(".github/workflows/database-baseline.yml"),
    /group: \$\{\{ inputs\.target == 'production' && 'veele-production' \|\| 'veele-staging' \}\}/u,
  );
  assert.match(
    read(".github/workflows/deploy.yml"),
    /github\.workflow == 'Fieldgrid Disposable Staging Rebuild'[\s\S]*'veele-staging'/u,
  );
});

test("deploy builds before rebuilding and never rolls old code back after the destructive boundary", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const build = deploy.indexOf("- name: Build");
  const rebuild = deploy.indexOf("- name: Rebuild disposable staging data");
  assert.ok(build >= 0 && rebuild > build);
  assert.match(
    deploy,
    /if \[ "\$DEPLOYMENT_MODE" != "disposable-rebuild" \]; then\n\s+health_args\+=\(--rollback-on-failure\)/u,
  );
  assert.match(deploy, /Recover disposable staging safely after failure/u);
  assert.match(deploy, /\(failure\(\) \|\| cancelled\(\)\)/u);
  assert.match(deploy, /--safe-stop/u);
  assert.match(deploy, /--finalize/u);
  assert.doesNotMatch(deploy, /FIELDGRID_REBUILD_TENANT_[AB]_/u);
  assert.match(deploy, /--strict-platform-only/u);
  assert.match(deploy, /--strict-w00-principal-platform-only/u);
  assert.match(
    deploy,
    /fieldgrid-w00-staging-principal-platform-only-read-only-v1/u,
  );
  assert.match(
    deploy,
    /disposable-staging-rebuild-\$\{\{ github\.run_id \}\}-\$\{\{ github\.sha \}\}/u,
  );
});

test("rebuild code uses provider APIs, canonical migration and fixed application schemas", () => {
  const providers = read("scripts/disposable-staging/providers.mjs");
  const database = read("scripts/disposable-staging/database.mjs");
  const contract = read("scripts/disposable-staging/contract.mjs");
  assert.match(providers, /admin\.storage\s*\.from\(bucket\)\s*\.remove/u);
  assert.match(providers, /admin\.auth\.admin\.deleteUser\(id, false\)/u);
  assert.doesNotMatch(providers, /DELETE FROM (auth|storage)\./iu);
  assert.match(database, /@workspace\/db", "run", "db:migrate"/u);
  assert.doesNotMatch(database, /db:baseline|supabase db reset/u);
  assert.match(database, /ALTER ROLE fieldgrid_runtime_app NOLOGIN/u);
  assert.match(database, /has_function_privilege/u);
  assert.match(database, /FROM PUBLIC, anon, authenticated, service_role/u);
  assert.match(database, /usename=current_user/u);
  assert.match(database, /rebuild_role_password/u);
  assert.match(database, /randomBytes\(32\)/u);
  assert.match(database, /allowedSamePrincipalPids/u);
  assert.doesNotMatch(database, /'public\.tenants'/u);
  assert.match(contract, /\["app_private", "drizzle", "public"\]/u);
  assert.match(contract, /"realtime"/u);
});

test("rebuilt administrators match stored metadata and existing activation routes", () => {
  const runner = read("scripts/disposable-staging/runner.mjs");
  const providers = read("scripts/disposable-staging/providers.mjs");
  const acceptance = read("scripts/disposable-staging/acceptance.mjs");
  const invites = read("artifacts/backoffice/src/lib/auth/portal-invites.ts");
  const platformActions = read(
    "artifacts/backoffice/src/app/actions/platform.ts",
  );
  const tenantActions = read(
    "artifacts/backoffice/src/app/actions/tenant-roles.ts",
  );
  assert.match(runner, /portal: "platform-admin"/u);
  assert.doesNotMatch(runner, /portal: "tenant-admin"/u);
  assert.doesNotMatch(runner, /portal: "(?:platform|backoffice)"/u);
  assert.match(providers, /getUserById\(id\)/u);
  assert.match(providers, /AUTH_METADATA_PERSISTENCE_FAILED/u);
  assert.match(acceptance, /app_metadata\?\.portal === expectedPortal/u);
  assert.match(acceptance, /acceptanceRun/u);
  assert.match(acceptance, /temporaryTenantCount: 2/u);
  assert.match(acceptance, /deleteAcceptanceIdentities/u);
  assert.match(acceptance, /cleanupTemporaryDatabaseFixtures/u);
  assert.match(providers, /acceptance_fixture: true/u);
  assert.match(invites, /existingPortal !== opts\.portal/u);
  assert.match(platformActions, /portal: "platform-admin"/u);
  assert.match(tenantActions, /portal: "tenant-admin"/u);
});

test("main exact-head gate executes a real PostgreSQL 17 clean migrate/bootstrap twice", () => {
  const workflow = read(".github/workflows/main-exact-head-validation.yml");
  assert.match(workflow, /lane: disposable-rebuild-postgres17-twice/u);
  assert.match(workflow, /image: postgres:17/u);
  assert.match(
    workflow,
    /command: node scripts\/fieldgrid-disposable-staging-postgres17-twice\.mjs/u,
  );
  const runner = read(
    "scripts/fieldgrid-disposable-staging-postgres17-twice.mjs",
  );
  assert.match(runner, /fieldgrid_disposable_rebuild_one/u);
  assert.match(runner, /fieldgrid_disposable_rebuild_two/u);
  assert.match(
    runner,
    /for \(const \{ databaseName, faults \} of scenarios\)/u,
  );
  assert.match(runner, /fieldgrid:runtime-safety:setup/u);
  assert.match(runner, /fieldgrid-disposable-staging-postgres17\.mjs/u);
  assert.match(runner, /fault-after-schema-reset/u);
  assert.match(runner, /fault-during-migrations/u);
  assert.match(runner, /fault-during-bootstrap/u);
  assert.match(runner, /secondaryWriter/u);
  assert.match(runner, /reentry-after-admission/u);
  assert.match(runner, /assert\.rejects\(reentrantWriter\.connect\(\)\)/u);
});

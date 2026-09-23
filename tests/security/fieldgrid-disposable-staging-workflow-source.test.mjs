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
  assert.match(deploy, /FIELDGRID_REBUILD_TENANT_A_MANAGER_PASSWORD/u);
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
  assert.match(contract, /\["app_private", "drizzle", "public"\]/u);
  assert.match(contract, /"realtime"/u);
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
  assert.match(runner, /for \(const databaseName of databaseNames\)/u);
  assert.match(runner, /fieldgrid:runtime-safety:setup/u);
  assert.match(runner, /fieldgrid-disposable-staging-postgres17\.mjs/u);
});

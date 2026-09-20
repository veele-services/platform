import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { activeDatabaseUrlFromDotenv, assertRuntimeCredentialContinuity, readActiveProductionEnvironment, verifyProductionRuntimeHandoff } from '../../scripts/fieldgrid-production-runtime-handoff.mjs';

const project = 'ckdtiuemeygrnujjibnw';
const stagingProject = 'olyfmekyqozxrbrwwszu';
const password = randomBytes(32).toString('hex');
const changedPassword = randomBytes(32).toString('hex');
const runtime = (secret = password, ref = project) => `postgresql://fieldgrid_runtime_app.${ref}:${secret}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
const candidate = { candidateUrl: runtime(), candidatePassword: password };
const sha = randomBytes(20).toString('hex');
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'veele-services/platform', GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch', APP_ENV: 'production', TARGET_ENVIRONMENT: 'production', TARGET: 'production',
  DEPLOYMENT_MODE: 'production', BASE_DIR: '/var/www/veele/production', DEPLOY_CONFIRMATION: 'fieldgrid-production-deploy-exact-sha',
  EXPECTED_MAIN_SHA: sha, GITHUB_SHA: sha, STAGING_DEPLOY_RUN_ID: '1234',
  FIELDGRID_RUNTIME_DATABASE_URL: runtime(), FIELDGRID_RUNTIME_DATABASE_PASSWORD: password };

test('unchanged runtime credentials are idempotent and candidate secret drift fails before mutation', () => {
  for (let i = 0; i < 2; i++) assert.equal(assertRuntimeCredentialContinuity({ ...candidate, activeUrl: runtime() }).transition, 'unchanged-runtime');
  let mutations = 0;
  const provision = (settings, active) => {
    verifyProductionRuntimeHandoff(settings, { readActive: () => active });
    mutations += 1;
  };
  assert.throws(() => provision({ ...env, FIELDGRID_RUNTIME_DATABASE_URL: runtime(changedPassword), FIELDGRID_RUNTIME_DATABASE_PASSWORD: changedPassword }, runtime()));
  assert.equal(mutations, 0);
  assert.throws(() => provision({ ...env, FIELDGRID_RUNTIME_DATABASE_PASSWORD: changedPassword }, runtime()));
  assert.equal(mutations, 0);
  provision(env, runtime());
  assert.equal(mutations, 1);
  // The second check immediately before provisioning also detects intervening active-env drift.
  assert.throws(() => provision(env, runtime(changedPassword)));
  assert.equal(mutations, 1);
});

test('initial legacy administrator or independently identified project keeps rollback credentials untouched', () => {
  for (const ref of [project, 'abcdefghijklmnopqrst']) {
    for (const activeUrl of [
      `postgresql://postgres:${changedPassword}@db.${ref}.supabase.co:5432/postgres`,
      `postgresql://supabase_admin.${ref}:${changedPassword}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
    ]) {
      assert.equal(assertRuntimeCredentialContinuity({ ...candidate, activeUrl }).transition, 'legacy-administrator-to-runtime');
    }
  }
  assert.equal(assertRuntimeCredentialContinuity({ ...candidate, activeUrl: runtime(changedPassword, 'abcdefghijklmnopqrst') }).transition, 'independent-project-to-runtime');
  assert.equal(assertRuntimeCredentialContinuity({ ...candidate,
    activeUrl: `postgresql://fieldgrid_runtime_app:${password}@db.${project}.supabase.co:5432/postgres` }).transition, 'unchanged-runtime');
});

test('ambiguous identity, URL overrides and a non-production candidate fail closed without leaking credentials', () => {
  for (const activeUrl of ['$(touch /tmp/should-not-exist)', runtime() + '?sslmode=disable', runtime() + '#fragment',
    runtime().replace('.pooler.supabase.com', '.example.org'), runtime().replace('fieldgrid_runtime_app.', 'other_role.'),
    runtime().replace(`.${project}:`, ':')]) {
    assert.throws(() => assertRuntimeCredentialContinuity({ ...candidate, activeUrl }), error => {
      assert.ok(!error.message.includes(password)); assert.ok(!error.message.includes(changedPassword)); return true;
    });
  }
  assert.throws(() => assertRuntimeCredentialContinuity({ ...candidate, candidateUrl: runtime(password, stagingProject), activeUrl: runtime() }));
  assert.throws(() => verifyProductionRuntimeHandoff({ ...env, BASE_DIR: '/var/www/veele/staging' }, { readActive: () => runtime() }));
});

test('dotenv is parsed as data with one bounded, non-symlink active environment', t => {
  const directory = mkdtempSync(join(tmpdir(), 'fieldgrid-handoff-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, '.env');
  for (const line of [`DATABASE_URL=${runtime()}`, `export DATABASE_URL='${runtime()}'`, `DATABASE_URL="${runtime()}" # saved`]) {
    const text = `OTHER=$(never-execute-this)\n${line}\n`;
    writeFileSync(file, text, { mode: 0o600 });
    assert.equal(activeDatabaseUrlFromDotenv(text), runtime());
    assert.equal(readActiveProductionEnvironment(file), runtime());
  }
  for (const text of ['', `DATABASE_URL=${runtime()}\nDATABASE_URL=${runtime()}`, `DATABASE_URL="${runtime()}`, 'x'.repeat(1024 * 1024 + 1)]) {
    writeFileSync(file, text); assert.throws(() => readActiveProductionEnvironment(file));
  }
  writeFileSync(file, `DATABASE_URL=${runtime()}`);
  const link = join(directory, 'linked.env'); symlinkSync(file, link);
  assert.throws(() => readActiveProductionEnvironment(link));
  assert.throws(() => readActiveProductionEnvironment(directory));
});

test('workflow checks active credential continuity early and immediately before ALTER ROLE helper', () => {
  const workflow = readFileSync('.github/workflows/fieldgrid-production-deploy.yml', 'utf8');
  const calls = [...workflow.matchAll(/node scripts\/fieldgrid-production-runtime-handoff\.mjs/gu)];
  assert.equal(calls.length, 2);
  assert.ok(calls[0].index < workflow.indexOf('- name: Prepare isolated candidate release'));
  const provision = workflow.indexOf('node scripts/fieldgrid-w00-runtime-principal.mjs --apply');
  assert.ok(calls[1].index < provision);
  assert.equal(workflow.slice(calls[1].index, provision).trim(), 'node scripts/fieldgrid-production-runtime-handoff.mjs');
});

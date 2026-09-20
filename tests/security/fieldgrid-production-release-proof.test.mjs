import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { assertProductionDispatch, assertSuccessfulStagingDeployment, verifyProductionRelease } from '../../scripts/fieldgrid-production-release-proof.mjs';

const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const now = Date.now();
const repo = 'veele-services/platform';
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: repo, GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch', APP_ENV: 'production', TARGET_ENVIRONMENT: 'production',
  DEPLOY_CONFIRMATION: 'fieldgrid-production-deploy-exact-sha', EXPECTED_MAIN_SHA: sha,
  GITHUB_SHA: sha, STAGING_DEPLOY_RUN_ID: '1234' };
const run = { id: 1234, repository: { full_name: repo }, path: '.github/workflows/deploy.yml',
  head_branch: 'staging', head_sha: sha, event: 'workflow_dispatch', status: 'completed',
  conclusion: 'success', updated_at: new Date(now - 10000).toISOString() };
const jobs = { jobs: [{ name: 'deploy', conclusion: 'success', steps:
  ['Activate staging release', 'Run staging deploy health gate', 'Upload staging deploy diagnostics']
    .map(name => ({ name, status: 'completed', conclusion: 'success' })) }] };
const validation = { head_sha: sha, head_branch: 'main', event: 'push', repository: { full_name: repo },
  status: 'completed', conclusion: 'success', path: '.github/workflows/main-exact-head-validation.yml' };
const routes = () => ({ '/git/ref/heads/main': { object: { sha } }, '/git/ref/heads/staging': { object: { sha } },
  '/actions/runs/1234': structuredClone(run), '/actions/runs/1234/jobs?per_page=100': structuredClone(jobs),
  [`/actions/workflows/main-exact-head-validation.yml/runs?head_sha=${sha}&per_page=100`]: { workflow_runs: [structuredClone(validation)] } });
const verify = (data = routes(), activeSha = sha) => verifyProductionRelease(env, {
  fetchApi: async route => { assert.ok(Object.hasOwn(data, route)); return data[route]; }, readActiveSha: () => activeSha,
});

test('production source validation rejects other branches, projects and unchecked input', () => {
  assert.doesNotThrow(() => assertProductionDispatch(env));
  for (const [key, value] of Object.entries({ GITHUB_ACTIONS: 'false', GITHUB_REPOSITORY: 'other/platform',
    GITHUB_REF: 'refs/heads/staging', GITHUB_EVENT_NAME: 'push', APP_ENV: 'staging', TARGET_ENVIRONMENT: 'staging',
    DEPLOY_CONFIRMATION: 'staging-only', EXPECTED_MAIN_SHA: otherSha, GITHUB_SHA: otherSha, STAGING_DEPLOY_RUN_ID: '../1234' })) {
    assert.throws(() => assertProductionDispatch({ ...env, [key]: value }), undefined, key);
  }
});

test('staging proof rejects stale, unrelated, failed, duplicate and incomplete jobs', () => {
  assert.doesNotThrow(() => assertSuccessfulStagingDeployment(run, jobs, sha, now));
  for (const override of [{ head_sha: otherSha }, { head_branch: 'main' }, { conclusion: 'failure' },
    { status: 'in_progress' }, { path: '.github/workflows/other.yml' },
    { updated_at: new Date(now - 86400001).toISOString() }, { updated_at: new Date(now + 60001).toISOString() }]) {
    assert.throws(() => assertSuccessfulStagingDeployment({ ...run, ...override }, jobs, sha, now));
  }
  assert.throws(() => assertSuccessfulStagingDeployment(run, { jobs: [jobs.jobs[0], jobs.jobs[0]] }, sha, now));
  for (const i of [0, 1, 2]) {
    const broken = structuredClone(jobs);
    broken.jobs[0].steps[i].conclusion = 'skipped';
    assert.throws(() => assertSuccessfulStagingDeployment(run, broken, sha, now));
  }
});

test('production requires matching active staging, both Git refs, and exact-main validation', async () => {
  assert.deepEqual(await verify(), { environment: 'production', sourceSha: sha, stagingRunId: '1234', verified: true });
  await assert.rejects(verify(routes(), otherSha), /rolled back/u);
  for (const route of ['/git/ref/heads/main', '/git/ref/heads/staging']) {
    const data = routes(); data[route].object.sha = otherSha;
    await assert.rejects(verify(data), /one exact commit/u);
  }
  for (const override of [{ event: 'pull_request' }, { conclusion: 'failure' }, { head_sha: otherSha },
    { repository: { full_name: 'other/platform' } }]) {
    const data = routes();
    Object.assign(data[`/actions/workflows/main-exact-head-validation.yml/runs?head_sha=${sha}&per_page=100`].workflow_runs[0], override);
    await assert.rejects(verify(data), /validation has not passed/u);
  }
});

test('production workflow enforces backup and role gates before activation and keeps credentials private', () => {
  const workflow = readFileSync('.github/workflows/fieldgrid-production-deploy.yml', 'utf8');
  const order = ['Verify protected source before checkout', 'Checkout exact main',
    'Verify successful same-SHA staging deployment', 'Prove private backup',
    'Validate production runtime credentials', 'Verify and identify legacy rollback release',
    'Prepare isolated candidate release', 'Write isolated runtime environment', 'Build candidate',
    'Validate production activation', 'Apply forward-only production migrations',
    'Provision and verify least-privileged production runtime', 'Reverify source and staging before activation',
    'Atomically activate production', 'Verify production services, routes and automatic rollback'];
  let last = -1;
  for (const step of order) { const index = workflow.indexOf(`- name: ${step}`); assert.ok(index > last, step); last = index; }
  assert.match(workflow, /DATABASE_URL: \$\{\{ secrets\.FIELDGRID_RUNTIME_DATABASE_URL \}\}/u);
  assert.doesNotMatch(workflow, /^      DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}$/mu);
  assert.doesNotMatch(workflow, /db:baseline|continue-on-error|set -x|secrets: write/u);
  assert.match(workflow, /\} > "\$RELEASE\/\.env"/u);
  assert.doesNotMatch(workflow, /> "\$BASE_DIR\/shared\/\.env"/u);
  assert.match(workflow, /--rollback-on-failure --restart-before-check/u);
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/fieldgrid-production-evidence-\$\{\{ github\.run_id \}\}\/\*\.json/u);
  for (const [, revision] of workflow.matchAll(/uses: [^@\n]+@([^\s]+)/gu)) assert.match(revision, /^[a-f0-9]{40}$/u);
});

test('production inventory restricts host/project/context and never weakens TLS', async () => {
  const { validateProductionInventoryConfig } = await import('../../scripts/fieldgrid-production-db-inventory.mjs');
  const fixtureUrl = (host, username = 'postgres', search = '') => {
    const url = new URL(`postgresql://${host}:5432/postgres`);
    url.username = username;
    url.password = randomBytes(24).toString('hex');
    url.search = search;
    return url.href;
  };
  const inventoryEnv = { ...env, FIELDGRID_MIGRATION_DATABASE_URL: fixtureUrl('db.ckdtiuemeygrnujjibnw.supabase.co') };
  assert.equal(validateProductionInventoryConfig(inventoryEnv).projectRef, 'ckdtiuemeygrnujjibnw');
  for (const url of [fixtureUrl('db.olyfmekyqozxrbrwwszu.supabase.co'),
    fixtureUrl('localhost'),
    fixtureUrl('db.ckdtiuemeygrnujjibnw.supabase.co', 'postgres', 'sslmode=disable'),
    fixtureUrl('db.ckdtiuemeygrnujjibnw.supabase.co', 'fieldgrid_runtime_app')]) {
    assert.throws(() => validateProductionInventoryConfig({ ...inventoryEnv, FIELDGRID_MIGRATION_DATABASE_URL: url }));
  }
  assert.throws(() => validateProductionInventoryConfig({ ...inventoryEnv, APP_ENV: 'staging' }));
  const source = readFileSync('scripts/fieldgrid-production-db-inventory.mjs', 'utf8');
  assert.match(source, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/u);
  assert.match(source, /databaseNodePostgresSslConfig\(env\)/u);
  assert.doesNotMatch(source, /rejectUnauthorized:\s*false|SELECT \*/u);
});


test('proxy inventory emits only routing metadata and never configuration credentials', () => {
  const workflow = readFileSync('.github/workflows/fieldgrid-production-inventory.yml', 'utf8');
  const embedded = workflow.split("python3 - <<'PYROUTES'")[1].split('\n').slice(1);
  const end = embedded.findIndex(line => line.trim() === 'PYROUTES');
  assert.ok(end > 0);
  const source = embedded.slice(0, end).map(line => line.slice(10)).join('\n');
  const fixture = { apps: { http: { servers: { srv0: { routes: [{ match: [{ host: ['platform.fieldgrid.nl'], path: ['/admin/*'] }],
    handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: '127.0.0.1:3300' }, { dial: 'secret.example:80' }],
      headers: { request: { set: { Authorization: ['super-private-token'] } } } }],
    credentials: 'another-private-value' }] } } } }, dns: { token: 'never-output-this' } };
  const prefix = `import json, urllib.request\nfixture = json.loads(${JSON.stringify(JSON.stringify(fixture))})\n`
    + 'class Response:\n    status = 200\n    def __enter__(self): return self\n    def __exit__(self, *args): pass\n    def read(self, *args): return json.dumps(fixture).encode()\n'
    + 'class Opener:\n    def open(self, *args, **kwargs): return Response()\n'
    + 'urllib.request.urlopen = lambda *args, **kwargs: Response()\n'
    + 'urllib.request.build_opener = lambda *args, **kwargs: Opener()\n';
  const result = spawnSync('python3', ['-c', prefix + source], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.proxyMetadata.routes, [{ hosts: ['platform.fieldgrid.nl'], paths: ['/admin/*'], upstreams: ['127.0.0.1:3300'] }]);
  assert.ok(report.probes.length >= 10);
  assert.doesNotMatch(result.stdout, /super-private-token|another-private-value|never-output-this|secret\.example|Authorization/u);
});


test('administrative gates keep a private CA while the saved runtime uses its readable copy', () => {
  const workflow = readFileSync('.github/workflows/fieldgrid-production-deploy.yml', 'utf8');
  const installation = workflow.split('- name: Install pinned database certificate')[1].split('- name: Set up pinned')[0];
  const preparation = workflow.split('- name: Prepare isolated candidate release')[1].split('- name: Write isolated runtime environment')[0];
  const runtime = workflow.split('- name: Write isolated runtime environment')[1].split('- name: Build candidate')[0];
  assert.ok(installation.includes('FIELDGRID_DATABASE_SSL_ROOT_CERT=%s'));
  assert.ok(preparation.includes('install -D -m 640 "$FIELDGRID_DATABASE_SSL_ROOT_CERT" "$certificate_destination"'));
  assert.ok(preparation.includes('FIELDGRID_RUNTIME_DATABASE_SSL_ROOT_CERT=%s'));
  assert.ok(!preparation.includes('\\nFIELDGRID_DATABASE_SSL_ROOT_CERT=%s'));
  assert.ok(runtime.includes('printf \'FIELDGRID_DATABASE_SSL_ROOT_CERT=%s\\n\' "$FIELDGRID_RUNTIME_DATABASE_SSL_ROOT_CERT"'));
});

test('production generic hosts are fixed, validated before persistence and inherited by the build', () => {
  const workflow = readFileSync('.github/workflows/fieldgrid-production-deploy.yml', 'utf8');
  const expected = 'admin.fieldgrid.nl,platform.fieldgrid.nl,app.fieldgrid.nl,fieldgrid.nl';
  assert.equal(/^      PLATFORM_HOSTS: (.+)$/mu.exec(workflow)?.[1], expected);
  assert.equal((workflow.match(/^\s+PLATFORM_HOSTS:/gmu) ?? []).length, 1);
  const validation = workflow.split('- name: Validate production runtime credentials and environment isolation')[1]
    .split('- name: Verify and identify legacy rollback release')[0];
  const guard = validation.split('\n').map(line => line.trim()).find(line => line.startsWith('test "$PLATFORM_HOSTS"'));
  assert.equal(guard, `test "$PLATFORM_HOSTS" = '${expected}'`);
  const runtime = workflow.split('- name: Write isolated runtime environment')[1].split('- name: Build candidate')[0];
  const persistence = runtime.split('\n').map(line => line.trim()).find(line => line.startsWith("printf 'PLATFORM_HOSTS="));
  assert.equal(persistence, 'printf \'PLATFORM_HOSTS=%s\\n\' "$PLATFORM_HOSTS"');
  assert.ok(workflow.indexOf(guard) < workflow.indexOf(persistence));
  const build = workflow.split('- name: Build candidate')[1].split('- name: Validate production activation')[0];
  assert.doesNotMatch(build, /PLATFORM_HOSTS|env -i|unset/u);
  for (const hosts of [expected, '', 'staging.fieldgrid.nl', `${expected},unknown.fieldgrid.nl`,
    `${expected}\nAPP_ENV=staging`, `app.fieldgrid.nl,$(printf injected)`]) {
    const result = spawnSync('bash', ['-c', `set -euo pipefail\n${guard}\n${persistence}`], {
      encoding: 'utf8', env: { PATH: process.env.PATH, PLATFORM_HOSTS: hosts },
    });
    if (hosts === expected) {
      assert.equal(result.status, 0);
      assert.equal(result.stdout, `PLATFORM_HOSTS=${expected}\n`);
    } else {
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, '');
    }
  }
});

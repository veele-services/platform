import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(file, 'utf8');
const start = () => read('e2e/fieldgrid/start-real-apps.mjs');
const seam = () => read('lib/db/src/e2e-auth-adapter.ts');
const workflow = () => read('.github/workflows/fieldgrid-playwright.yml');
const browserSpec = () => read('e2e/fieldgrid/tests/golden-path.spec.ts');
const playwrightConfig = () => read('playwright.config.ts');

test('runner starts real Fieldgrid apps and does not serve mock application HTML', () => {
  const source = start();
  assert.doesNotMatch(source, /<!doctype html>|Backoffice dashboard|Personnel assigned Tenant A work visible|Customer Tenant A assignments|Runtime Tenant A Customer/);
  assert.match(source, /'pnpm', \['--filter', '@workspace\/backoffice', 'exec', 'next', 'dev', '-H', '127\.0\.0\.1', '-p', String\(ports\.backoffice\)\]/);
  assert.match(source, /'pnpm', \['--filter', '@workspace\/personeel-pwa', 'exec', 'next', 'dev', '--turbopack', '-H', '0\.0\.0\.0', '-p', String\(ports\.personnel\)\]/);
  assert.match(source, /'pnpm', \['--filter', '@workspace\/klant-pwa', 'exec', 'next', 'dev', '--turbopack', '-H', '0\.0\.0\.0', '-p', String\(ports\.customer\)\]/);
  assert.doesNotMatch(source, /fixture\s*:/);
  assert.doesNotMatch(source, /listen\(ports\.postgrest/);
  assert.match(source, /delete appBaseEnvironment\.SUPABASE_SERVICE_ROLE_KEY/);
});

test('browser scenarios use real runtime hostnames instead of forbidden Host header spoofing', () => {
  const spec = browserSpec();
  const config = playwrightConfig();
  assert.match(config, /--host-resolver-rules=MAP tenant-a\.runtime\.fieldgrid\.test 127\.0\.0\.1/);
  assert.match(config, /MAP platform\.fieldgrid\.nl 127\.0\.0\.1/);
  assert.match(spec, /http:\/\/\$\{host\}:9321/);
  assert.match(spec, /domain: host/);
  assert.doesNotMatch(spec, /setExtraHTTPHeaders\(\{[\s\S]*host/);
  assert.doesNotMatch(spec, /http:\/\/127\.0\.0\.1:932[123]/);
});

test('gateway is strict and strips /rest/v1 before proxying to real PostgREST', () => {
  const source = start();
  assert.match(source, /req\.url\?\.startsWith\('\/rest\/v1\/'\)/);
  assert.match(source, /const incoming = new URL\(requestUrl, 'http:\/\/fieldgrid-e2e\.local'\)/);
  assert.match(source, /incoming\.pathname\.slice\('\/rest\/v1'\.length\)/);
  assert.match(source, /`\$\{postgrestPath\}\$\{incoming\.search\}`/);
  assert.match(source, /postgrestUrlForGatewayRequest\(req\.url\)/);
  assert.doesNotMatch(source, /new URL\(req\.url, `http:\/\/127\.0\.0\.1:\$\{ports\.postgrest\}`\)/);
  assert.match(source, /method: req\.method/);
  assert.match(source, /const body = \[\'GET\', \'HEAD\'\]\.includes/);
  assert.match(source, /authorization/);
  assert.match(source, /apikey/);
  assert.match(source, /content-range/);
  assert.match(source, /json\(res, 404, \{ error: 'unknown route' \}\)/);
  assert.doesNotMatch(source, /\{\s*fixture\s*[,}]/);
  assert.doesNotMatch(source, /\{\s*ok:\s*true\s*\}/);
});

test('gateway translation contract maps Supabase /rest/v1 requests to PostgREST table paths', async () => {
  const { postgrestUrlForGatewayRequest } = await import('../e2e/fieldgrid/start-real-apps.mjs');
  const upstream = postgrestUrlForGatewayRequest('/rest/v1/assignments?id=eq.abc&select=id');
  assert.equal(`${upstream.pathname}${upstream.search}`, '/assignments?id=eq.abc&select=id');
});

test('E2E auth seam is production-disabled, identity-only, and delegates bound client methods', () => {
  const source = seam();
  assert.match(source, /NODE_ENV === "production"/);
  assert.match(source, /FIELDGRID_E2E_AUTH_ENABLED !== "true"/);
  assert.match(source, /FIELDGRID_E2E_FIXTURE_IDENTITIES/);
  assert.match(source, /FIELDGRID_E2E_FIXTURE_USERS = new Set/);
  for (const email of [
    'admin@tenant-a.runtime.fieldgrid.test',
    'admin@tenant-b.runtime.fieldgrid.test',
    'personnel@tenant-a.runtime.fieldgrid.test',
    'personnel@tenant-b.runtime.fieldgrid.test',
    'customer@tenant-a.runtime.fieldgrid.test',
    'customer@tenant-b.runtime.fieldgrid.test',
  ]) {
    assert.match(source, new RegExp(email));
  }
  assert.match(source, /email: identity\.email/);
  assert.doesNotMatch(source, /tenant_id/);
  assert.match(source, /property === "getUser"/);
  assert.match(source, /value\.bind\(target\)/);
  assert.doesNotMatch(source, /property === "from"|property === "rpc"|property === "storage"|if \(table ===/);
  assert.doesNotMatch(source, /about:blank|generic fake RPC|global\.fetch|globalThis\.fetch/);
});

test('authenticated data fetch injects local JWT only for local gateway requests', () => {
  const source = seam();
  assert.match(source, /createFieldgridE2EFetch/);
  assert.match(source, /Authorization", `Bearer \$\{await createFieldgridE2EJwt\(userId\)\}`/);
  assert.match(source, /LOCAL_GATEWAY_ORIGIN/);
  assert.match(source, /apikey/);
  assert.doesNotMatch(source, /service_role/);
});

test('middleware continues normal guard flow and does not E2E short-circuit', () => {
  for (const file of ['artifacts/backoffice/src/middleware.ts','artifacts/klant-pwa/src/middleware.ts','artifacts/personeel-pwa/src/middleware.ts']) {
    const source = read(file);
    assert.match(source, /createFieldgridE2EAuthClient/);
    assert.match(source, /authClient\.auth\.getUser\(\)/);
    assert.doesNotMatch(source, /FIELDGRID_E2E_AUTH_ENABLED[\s\S]{0,160}NextResponse\.next\(\)/);
  }
});


test('Playwright fixture loader reuses customer_users natural key and proves idempotency', () => {
  const fixtureSource = read('e2e/fieldgrid/fixtures/seed-e2e-fixtures.mjs');
  const workflowSource = workflow();
  assert.match(fixtureSource, /where customer_id = \$1\s+and lower\(email\) = lower\(\$2\)\s+for update/s);
  assert.match(fixtureSource, /where customer_id = \$1\s+and user_id = \$2\s+for update/s);
  assert.match(fixtureSource, /update customer_users\s+set tenant_id = \$2/s);
  assert.match(fixtureSource, /where id = \$1/);
  assert.match(fixtureSource, /actualId: naturalKeyRow\.id/);
  assert.match(fixtureSource, /actualId: userCustomerRow\.id/);
  assert.match(fixtureSource, /customerUserFinalRow\.id === customerUserByUserFinalRow\.id/);
  assert.match(fixtureSource, /customerUserCount === 1/);
  assert.match(fixtureSource, /customerUserByUserCount === 1/);
  assert.doesNotMatch(fixtureSource, /insert into customer_users[\s\S]{0,220}on conflict \(id\)/i);
  assert.ok(workflowSource.indexOf('Seed Playwright fixtures') < workflowSource.indexOf('Prove Playwright fixture idempotency'), 'workflow must seed fixtures once before the idempotency proof');
  assert.equal([...workflowSource.matchAll(/pnpm fieldgrid:playwright:fixtures/g)].length, 2);
});

test('Playwright fixtures seed only canonical tenant Admin roles and exact permissions', () => {
  const fixtureSource = read('e2e/fieldgrid/fixtures/seed-e2e-fixtures.mjs');
  assert.match(fixtureSource, /const CANONICAL_ADMIN_ROLE = 'Admin'/);
  assert.match(fixtureSource, /seedCanonicalAdminRoles/);
  assert.match(fixtureSource, /\['planning', 'read'\]/);
  assert.match(fixtureSource, /\['planning', 'write'\]/);
  assert.match(fixtureSource, /delete from tenant_user_roles\s+where user_id = any\(\$1::uuid\[\]\)/s);
  assert.match(fixtureSource, /canonicalAdminPermissionCountTenantA === CANONICAL_ADMIN_PERMISSIONS\.length/);
  assert.match(fixtureSource, /canonicalAdminPermissionCountTenantB === CANONICAL_ADMIN_PERMISSIONS\.length/);
  assert.match(fixtureSource, /tenantAAdminAllRoleLinkCount === 1/);
  assert.match(fixtureSource, /tenantBAdminAllRoleLinkCount === 1/);
  assert.match(fixtureSource, /crossTenantRoleLeakCount === 0/);
});

test('personnel profile lookup treats query errors as denials before first-login linking', () => {
  const source = read('artifacts/personeel-pwa/src/actions/personnel.ts');
  const primaryLookup = source.indexOf('error: primaryLookupError');
  const adminClient = source.indexOf('const admin = createAdminClient()');
  assert.ok(primaryLookup >= 0 && adminClient > primaryLookup, 'primary lookup must happen before the privileged first-login client');
  assert.match(source, /\.maybeSingle\(\)/);
  assert.match(source, /if \(primaryLookupError\) \{[\s\S]*personnelLookupDiagnostic\(primaryLookupError\)[\s\S]*return null;/);
  assert.match(source, /"is_active"/);
  assert.match(source, /if \(byId\) \{[\s\S]*const linkedProfile = byId as \{ is_active\?: boolean \| null \};[\s\S]*if \(!linkedProfile\.is_active\) return null;[\s\S]*return mapProfile\(byId\);[\s\S]*\}/);
  assert.match(source, /if \(firstLoginLookupError\) \{[\s\S]*return null;/);
  assert.match(source, /if \(linkedLookupError\) \{[\s\S]*return null;/);
  assert.match(source, /Active, already-linked personnel return above and never require a service/);
});

test('runtime safety setup grants embedded personnel profile lookup tables to authenticated', () => {
  const source = read('scripts/fieldgrid-runtime-safety-setup.mjs');
  assert.match(source, /drop schema if exists app_private cascade;/);
  assert.match(source, /current_setting\('request\.jwt\.claim\.sub', true\)/);
  assert.match(source, /current_setting\('request\.jwt\.claims', true\), ''\)::jsonb ->> 'sub'/);
  assert.match(source, /public\.personnel,\s+public\.roles,\s+public\.sectors\s+to authenticated;/);
  assert.match(source, /PostgREST embedded personnel profile lookups/);
});

test('liveness is unauthenticated and authenticated acceptance runs exactly once before browser execution', () => {
  const stack = start();
  const runner = read('e2e/fieldgrid/run-playwright.mjs');
  const livenessBlock = stack.slice(stack.indexOf('async function liveness()'), stack.indexOf('async function authenticatedPreflight()'));
  assert.match(livenessBlock, /probeLivenessApp/);
  assert.doesNotMatch(livenessBlock, /proveDataPath|fieldgrid_e2e_auth_user/);
  assert.match(stack, /preflight\.json/);
  assert.match(stack, /async function authenticatedPreflight\(\)/);
  assert.match(stack, /tenant-a-admin-backoffice/);
  assert.match(stack, /tenant-a-personnel/);
  assert.match(stack, /tenant-a-customer/);
  assert.match(stack, /if \(!check\.ok\) \{/);
  assert.match(stack, /error: redact\(error instanceof Error \? error\.message : String\(error\)\)/);
  assert.match(runner, /await runAuthenticatedPreflight\(\);/);
  assert.ok(runner.indexOf('await runAuthenticatedPreflight()') < runner.indexOf('await runPlaywright()'), 'browser execution must follow preflight');
});

test('E2E source files are conflict-marker free', () => {
  for (const file of [
    'e2e/fieldgrid/fixtures/seed-e2e-fixtures.mjs',
    'e2e/fieldgrid/start-real-apps.mjs',
    'e2e/fieldgrid/run-playwright.mjs',
    'e2e/fieldgrid/validate-runtime-evidence.mjs',
    'e2e/fieldgrid/tests/golden-path.spec.ts',
    'lib/db/src/e2e-auth-adapter.ts',
  ]) {
    assert.doesNotMatch(read(file), /^(<<<<<<<|=======|>>>>>>>)/m, file);
  }
});

test('workflow provisions PostgreSQL 17, Runtime Safety fixtures, real PostgREST, cleanup, and artifacts', () => {
  const source = workflow();
  assert.match(source, /image: postgres:17/);
  assert.match(source, /fieldgrid:runtime-safety:setup/);
  assert.match(source, /fieldgrid:runtime-safety:fixtures/);
  assert.match(source, /test -z "\$\{SUPABASE_SERVICE_ROLE_KEY:-\}"/);
  assert.match(source, /Check for conflict markers before static tests/);
  assert.match(source, /Run Playwright after conflict-marker guard/);
  assert.match(source, /git grep -n -E '\^\(<<<<<<<\|=======\|>>>>>>>\)'/);
  assert.match(source, /Seed Playwright fixtures/);
  assert.match(source, /Prove Playwright fixture idempotency/);
  assert.match(source, /fieldgrid:playwright:evidence/);
  assert.match(source, /postgrest\/postgrest:v12\.2\.8/);
  assert.doesNotMatch(source, /postgrest\/postgrest:latest/);
  assert.match(source, /docker logs fieldgrid-e2e-postgrest/);
  assert.match(source, /if: always\(\)/);
  assert.match(source, /artifacts\/fieldgrid-playwright\/\*\*/);
  assert.match(source, /artifacts\/runtime-safety-harness\/\*\*\/\*\.json/);
  assert.match(source, /artifacts\/runtime-safety-harness\/\*\*\/\*\.log/);
  assert.ok(source.indexOf('pnpm/action-setup@v4') < source.indexOf('actions/setup-node@v4'), 'pnpm must be installed before setup-node cache: pnpm');
  assert.ok(source.indexOf('Tear down disposable database') < source.indexOf('Upload Fieldgrid Playwright artifacts'), 'artifact upload must run after teardown and log capture');
});

test('exactly five browser scenarios exist and forbidden files/tooling are absent', () => {
  const spec = read('e2e/fieldgrid/tests/golden-path.spec.ts');
  assert.equal([...spec.matchAll(/\ntest\('/g)].length, 5);
  assert.equal(existsSync('scripts/fieldgrid-runtime-entrypoints-check.mjs'), false);
  assert.doesNotMatch(spec, /Fieldgrid E2E.*toContainText|Backoffice dashboard|Customer Tenant A assignments/);
});


test('Playwright uses explicit stack runner instead of config.webServer recursion', () => {
  const config = read('playwright.config.ts');
  const pkg = JSON.parse(read('package.json'));
  const runner = read('e2e/fieldgrid/run-playwright.mjs');
  assert.doesNotMatch(config, /webServer/);
  assert.equal(pkg.scripts['fieldgrid:playwright'], 'node --test tests/fieldgrid-playwright-e2e-auth-sourceguard.test.mjs && node e2e/fieldgrid/run-playwright.mjs');
  assert.match(runner, /pnpm', \['exec', 'playwright', 'test'\]/);
  assert.doesNotMatch(runner, /fieldgrid:playwright/);
  assert.match(runner, /startupTimeoutMs = 180_000/);
  assert.match(runner, /orchestrator\.stderr\.log/);
});

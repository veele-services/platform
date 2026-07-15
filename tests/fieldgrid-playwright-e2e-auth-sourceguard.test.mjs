import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const files = {
  seam: 'lib/db/src/e2e-auth-adapter.ts',
  start: 'e2e/fieldgrid/start-real-apps.mjs',
  spec: 'e2e/fieldgrid/tests/golden-path.spec.ts',
  workflow: '.github/workflows/fieldgrid-playwright.yml',
};
const read = (f) => readFileSync(f, 'utf8');

test('E2E auth seam is flag-gated, allowlisted, production-disabled, and identity-only', () => {
  const seam = read(files.seam);
  assert.match(seam, /FIELDGRID_E2E_AUTH_ENABLED !== "true"/);
  assert.match(seam, /NODE_ENV === "production"/);
  assert.match(seam, /FIELDGRID_E2E_FIXTURE_USERS = new Set/);
  assert.match(seam, /prop === "getUser"/);
  assert.doesNotMatch(seam, /prop === "from"|\.from\s*=|from\(/);
  assert.doesNotMatch(seam, /prop === "rpc"|\.rpc\s*=|generic fake RPC/i);
  assert.doesNotMatch(seam, /prop === "storage"|fake Storage URL/i);
  assert.match(seam, /Reflect\.get\(target, prop, receiver\)/);
});

test('middleware uses seam only for getUser and does not early-bypass normal guards', () => {
  for (const file of ['artifacts/backoffice/src/middleware.ts','artifacts/klant-pwa/src/middleware.ts','artifacts/personeel-pwa/src/middleware.ts']) {
    const source = read(file);
    assert.match(source, /createFieldgridE2EAuthClient/);
    assert.match(source, /authClient\.auth\.getUser\(\)/);
    assert.doesNotMatch(source, /FIELDGRID_E2E_AUTH_ENABLED[\s\S]{0,120}NextResponse\.next\(\)/);
  }
});

test('local data path keeps PostgREST and gateway strict', () => {
  const start = read(files.start);
  assert.match(start, /postgrest\/postgrest:v12\.2\.8/);
  assert.match(start, /disposable PostgreSQL 17/);
  assert.match(start, /\/healthz/);
  assert.match(start, /\/rest\/v1\//);
  assert.match(start, /authorization:Boolean\(req\.headers\.authorization\)/);
  assert.match(start, /json\(res,404/);
});

test('five scenario groups exist and CI publishes artifacts', () => {
  const spec = read(files.spec);
  const count = [...spec.matchAll(/test\('/g)].length;
  assert.equal(count, 5);
  assert.ok(existsSync(files.workflow));
  const workflow = read(files.workflow);
  assert.match(workflow, /fieldgrid:playwright/);
  assert.match(workflow, /artifacts\/fieldgrid-playwright/);
});

test('service-role browser bypass and historical forbidden tooling are absent', () => {
  for (const file of [files.start, files.spec, files.seam]) {
    assert.doesNotMatch(read(file), /service_role/);
  }
  assert.equal(existsSync('scripts/fieldgrid-runtime-entrypoints-check.mjs'), false);
});

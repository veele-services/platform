import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const authAdapter = 'lib/db/src/e2e-auth-adapter.ts';
const serverFiles = [
  'artifacts/backoffice/src/lib/supabase/server.ts',
  'artifacts/personeel-pwa/src/lib/supabase/server.ts',
  'artifacts/klant-pwa/src/lib/supabase/server.ts',
];
const middlewareFiles = [
  'artifacts/backoffice/src/middleware.ts',
  'artifacts/personeel-pwa/src/middleware.ts',
  'artifacts/klant-pwa/src/middleware.ts',
];

test('local E2E auth seam is explicit, centralized, and fails closed in production', async () => {
  const adapterSource = await readFile(authAdapter, 'utf8');
  assert.match(adapterSource, /FIELDGRID_E2E_AUTH_ENABLED/iu, 'adapter must require explicit E2E env flag');
  assert.match(adapterSource, /NODE_ENV\s*!==\s*["']production["']/u, 'adapter must reject production runtime');
  assert.match(adapterSource, /FIELDGRID_E2E_AUTH_USERS/u, 'adapter must centralize the deterministic allowlist');
  assert.match(adapterSource, /fieldgrid_e2e_user_id/u, 'adapter must define the narrow E2E auth cookie');
  assert.match(adapterSource, /fallbackClient/u, 'adapter must preserve the real Supabase client surface');
  assert.match(adapterSource, /from: fallbackClient\.from\?\.bind\(fallbackClient\)/u, 'adapter must preserve the real Supabase from() implementation for exercised routes');
  assert.match(adapterSource, /rpc:/u, 'adapter must preserve rpc on the client surface');
  assert.match(adapterSource, /storage:/u, 'adapter must preserve storage on the client surface');

  for (const file of [...serverFiles, ...middlewareFiles]) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /@workspace\/db\/e2e-auth-adapter/u, `${file} must use the shared adapter`);
    assert.equal(source.includes('return NextResponse.next({ request });\n  }\n  const url'), false, `${file} must not bypass middleware before normal auth/tenant guards`);
    assert.doesNotMatch(source, /FIELDGRID_E2E_AUTH_USERS\s*:/u, `${file} must not duplicate the fixture allowlist`);
    assert.doesNotMatch(source, /createFieldgridE2eSupabaseClient\([^,\n)]+\)\s*\?\?/u, `${file} must pass the full Supabase client into the E2E adapter`);
  }
});

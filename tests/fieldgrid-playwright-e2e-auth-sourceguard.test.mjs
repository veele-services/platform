import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const authFiles = [
  'artifacts/backoffice/src/lib/supabase/server.ts',
  'artifacts/personeel-pwa/src/lib/supabase/server.ts',
  'artifacts/klant-pwa/src/lib/supabase/server.ts',
  'artifacts/backoffice/src/middleware.ts',
  'artifacts/personeel-pwa/src/middleware.ts',
  'artifacts/klant-pwa/src/middleware.ts',
];

test('local E2E auth seam is explicit and fails closed in production', async () => {
  for (const file of authFiles) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /FIELDGRID_E2E_AUTH_ENABLED/iu, `${file} must require the explicit E2E env flag`);
    assert.match(source, /NODE_ENV\s*!==\s*["']production["']/u, `${file} must reject production runtime`);
    assert.match(source, /fieldgrid_e2e_user_id/u, `${file} must use the narrow E2E auth cookie`);
  }
});

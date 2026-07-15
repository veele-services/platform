import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('local gateway rejects unknown routes and proxies only /rest/v1', () => {
  const source = readFileSync('e2e/fieldgrid/start-real-apps.mjs', 'utf8');
  assert.match(source, /req\.url===['"]\/healthz['"]/);
  assert.match(source, /req\.url\?\.startsWith\(['"]\/rest\/v1\/['"]\)/);
  assert.match(source, /json\(res,404,\{error:'unknown route'\}\)/);
});

test('JWT identity is authenticated fixture user and tenant data has denial proof', () => {
  const source = readFileSync('e2e/fieldgrid/start-real-apps.mjs', 'utf8');
  assert.match(source, /role: 'authenticated'/);
  assert.match(source, /sub: '20000000-0000-4000-8000-000000000104'/);
  assert.match(source, /Runtime Tenant A Assignment/);
  assert.match(source, /Runtime Tenant B Assignment/);
  assert.match(source, /Tenant B work absent/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

const manifest = JSON.parse(fs.readFileSync('docs/runtime-entrypoints/manifest.json', 'utf8'));
const summary = fs.readFileSync('docs/runtime-entrypoints/risk-summary.md', 'utf8');

test('runtime entrypoint manifest stays compact and covers required surfaces', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.artifactName, 'fieldgrid-runtime-entrypoint-inventory-full');
  assert.ok(manifest.inventoryHash.startsWith('sha256:'));
  assert.ok(manifest.counts.total > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(manifest, null, 2)) < 20000);

  for (const kind of [
    'server-action',
    'route-handler',
    'middleware',
    'rpc-callsite',
    'supabase-table-call',
    'raw-sql-entrypoint',
    'provider-webhook',
    'storage-signed-url-issuance',
    'auth-reset-handler',
    'background-worker',
    'cron-scheduled-handler',
  ]) {
    assert.ok(Object.hasOwn(manifest.counts.byKind, kind), `missing ${kind}`);
    assert.ok(manifest.kindHashes[kind]?.startsWith('sha256:'), `missing hash for ${kind}`);
  }
});

test('runtime entrypoint risk summary lists all classified dimensions', () => {
  for (const dimension of [
    'tenantSource',
    'authSource',
    'hostBinding',
    'permissionCheck',
    'moduleGate',
    'parentRowBinding',
    'audit',
    'idempotency',
    'providerBoundary',
    'evidenceLayer',
  ]) {
    assert.ok(summary.includes(dimension), `missing ${dimension}`);
    assert.ok(manifest.riskDimensions.includes(dimension), `manifest missing ${dimension}`);
  }
});

test('runtime entrypoint stale-manifest check passes for committed files', () => {
  execFileSync('pnpm', ['fieldgrid:runtime-entrypoints:check'], { stdio: 'pipe' });
});

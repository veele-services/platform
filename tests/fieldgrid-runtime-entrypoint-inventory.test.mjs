import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

const script = path.resolve('scripts/fieldgrid-runtime-entrypoint-inventory.mjs');
const manifest = JSON.parse(fs.readFileSync('docs/runtime-entrypoints/manifest.json', 'utf8'));
const summary = fs.readFileSync('docs/runtime-entrypoints/risk-summary.md', 'utf8');

function writeFixture(root, file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function fixtureInventory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fieldgrid-entrypoints-'));
  writeFixture(root, 'app/src/actions/accounts.ts', `'use server';
    export async function saveAccount(form) {
      const client = createSupabaseServiceRoleClient();
      await client.from('accounts').update({ name: form.name }).eq('tenant_id', form.tenantId);
      await audit('account_saved');
    }
  `);
  writeFixture(root, 'app/src/app/api/invoices/route.ts', `
    export async function POST(request) {
      const session = await requireUser(request);
      return Response.json({ ok: Boolean(session) });
    }
  `);
  writeFixture(root, 'app/src/app/api/mollie/webhook/route.ts', `
    export async function POST(request) {
      const signature = request.headers.get('x-mollie-signature');
      await dedupeWebhook(signature);
      return Response.json({ ok: true });
    }
  `);
  writeFixture(root, 'app/src/middleware.ts', `
    export default function middleware(request) {
      const host = request.headers.get('host');
      const session = request.cookies.get('session');
      return session && host;
    }
  `);
  writeFixture(root, 'app/src/lib/data.ts', `
    const tenantId = 'tenant-a';
    const customerId = 'customer-a';
    const aliased = createSupabaseServiceRoleClient();
    const database = getDb();
    const sql = String.raw;
    export async function runData() {
      await aliased.from('customers').select('*').eq('tenant_id', tenantId);
      await aliased.rpc('refresh_customer_rollup', { tenant_id: tenantId });
      await database.execute(sql\`SELECT * FROM customers WHERE tenant_id = \${tenantId}\`);
      await mollieClient.payments.create({ metadata: { tenantId } });
      await resend.emails.send({ to: 'ops@example.test', subject: 'Hi' });
      await fetch('https://api.mollie.com/v2/payments', { method: 'POST' });
      await googleMapsClient.routes.computeRoutes({ origin: 'A', destination: 'B' });
      logger.info('Mollie webhook ontvangen');
      metrics.increment('google_maps_request');
      providerNames.includes('resend');
      metadata.set('twilio', true);
      formatMollieStatus(status);
      await aliased.storage.from('documents').createSignedUrl(
        tenantId + '/' + customerId + '/invoice.pdf',
        60,
      );
    }
  `);
  writeFixture(root, 'app/src/workers/billing-worker.ts', `
    export async function startBillingWorker() {
      await audit('billing_worker_started');
      await processOnce('billing');
    }
  `);
  writeFixture(root, 'app/src/cron/nightly-scheduler.ts', `
    export async function scheduleNightly() {
      await audit('nightly_schedule_started');
      await runIdempotentJob('nightly');
    }
  `);
  writeFixture(root, 'app/tests/actions.test.ts', `'use server'; export async function ignoredTestAction() {}`);
  writeFixture(root, 'app/docs/route.ts', `export async function GET() {}`);
  writeFixture(root, 'app/scripts/tooling-worker.ts', `export function workerResetAuthScheduleNameOnly() {}`);
  writeFixture(root, 'app/src/lib/names-only.ts', `export function authWorkerScheduleResetHelper() { return true; }`);
  const output = execFileSync('node', [script, '--root', root, '--runtime-roots', 'app/src', '--full-json'], { encoding: 'utf8' });
  return JSON.parse(output);
}

test('runtime entrypoint manifest stays compact and separates runtime concepts', () => {
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.artifactName, 'fieldgrid-runtime-entrypoint-inventory-full');
  assert.ok(manifest.inventoryHash.startsWith('sha256:'));
  assert.ok(manifest.counts.total > 0);
  assert.ok(manifest.counts.externalEntrypoints > 0);
  assert.ok(manifest.counts.internalDbCallsites > 0);
  assert.equal(manifest.counts.total, manifest.counts.classifications);
  assert.ok(manifest.counts.uniqueRuntimeNodes <= manifest.counts.classifications);
  assert.ok(Buffer.byteLength(JSON.stringify(manifest, null, 2)) < 30000);
  for (const root of ['artifacts/backoffice/src', 'artifacts/personeel-pwa/src', 'artifacts/klant-pwa/src', 'artifacts/website-runtime/src', 'artifacts/api-server/src', 'lib/db/src']) {
    assert.ok(manifest.runtimeRoots.includes(root), `missing runtime root ${root}`);
  }
});

test('scanner fixtures prove representative detections and exclusions', () => {
  const inventory = fixtureInventory();
  const pairs = inventory.entries.map((entry) => `${entry.kind}:${entry.file}:${entry.name}`);
  assert.ok(pairs.some((pair) => pair.includes('server-action:app/src/actions/accounts.ts:accounts.ts')));
  assert.ok(pairs.some((pair) => pair.includes('route-handler:app/src/app/api/invoices/route.ts:POST')));
  assert.ok(pairs.some((pair) => pair.includes('database-callsite:app/src/lib/data.ts:customers')));
  assert.ok(pairs.some((pair) => pair.includes('rpc-callsite:app/src/lib/data.ts:refresh_customer_rollup')));
  assert.ok(pairs.some((pair) => pair.includes('storage-signed-url-issuance:app/src/lib/data.ts:createSignedUrl')));
  assert.ok(pairs.some((pair) => pair.includes('webhook-handler:app/src/app/api/mollie/webhook/route.ts:POST')));
  assert.ok(pairs.some((pair) => pair.includes('worker-entrypoint:app/src/workers/billing-worker.ts:billing-worker.ts')));
  assert.ok(pairs.some((pair) => pair.includes('scheduled-entrypoint:app/src/cron/nightly-scheduler.ts:nightly-scheduler.ts')));
  assert.ok(pairs.some((pair) => pair.includes('raw-sql-callsite:app/src/lib/data.ts:database.execute')));
  assert.ok(pairs.some((pair) => pair.includes('provider-boundary:app/src/lib/data.ts:create')));
  assert.ok(pairs.some((pair) => pair.includes('provider-boundary:app/src/lib/data.ts:send')));
  assert.ok(pairs.some((pair) => pair.includes('provider-boundary:app/src/lib/data.ts:fetch')));
  assert.ok(pairs.some((pair) => pair.includes('provider-boundary:app/src/lib/data.ts:computeRoutes')));
  assert.ok(!pairs.some((pair) => pair.includes('provider-boundary:app/src/lib/data.ts:info')));
  assert.ok(!pairs.some((pair) => pair.includes('provider-boundary:app/src/lib/data.ts:increment')));
  assert.ok(!pairs.some((pair) => pair.includes('provider-boundary:app/src/lib/data.ts:includes')));
  assert.ok(!pairs.some((pair) => pair.includes('provider-boundary:app/src/lib/data.ts:set')));
  assert.ok(!pairs.some((pair) => pair.includes('provider-boundary:app/src/lib/data.ts:formatMollieStatus')));
  assert.ok(!pairs.some((pair) => pair.includes('tests/')));
  assert.ok(!pairs.some((pair) => pair.includes('docs/')));
  assert.ok(!pairs.some((pair) => pair.includes('scripts/')));
  assert.ok(!pairs.some((pair) => pair.includes('migrations/')));
  assert.ok(!pairs.some((pair) => pair.includes('names-only')));
});

test('scanner fixtures prove kind-specific risk severity', () => {
  const inventory = fixtureInventory();
  assert.equal(inventory.counts.total, inventory.counts.classifications);
  assert.ok(inventory.counts.uniqueRuntimeNodes <= inventory.counts.classifications);
  assert.equal(inventory.counts.providerBoundaries, inventory.entries.filter((entry) => entry.kind === 'provider-boundary').length);
  const byKind = new Map(inventory.entries.map((entry) => [`${entry.kind}:${entry.name}`, entry]));
  assert.equal(byKind.get('webhook-handler:POST').risk.severity, 'medium');
  assert.equal(byKind.get('storage-signed-url-issuance:createSignedUrl').risk.severity, 'medium');
  assert.notEqual(byKind.get('raw-sql-callsite:database.execute').risk.severity, 'high');
  assert.equal(byKind.get('provider-boundary:create')?.risk.severity, 'informational');
});

test('runtime entrypoint risk summary lists all classified dimensions', () => {
  for (const dimension of manifest.riskDimensions) {
    assert.ok(summary.includes(dimension), `summary missing ${dimension}`);
  }
  assert.ok(summary.includes('External entrypoints'));
  assert.ok(summary.includes('Internal DB callsites'));
});

test('runtime entrypoint stale-manifest check passes for committed files', () => {
  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm fieldgrid:runtime-entrypoints:check'], { stdio: 'pipe' });
    return;
  }

  execFileSync('pnpm', ['fieldgrid:runtime-entrypoints:check'], { stdio: 'pipe' });
});

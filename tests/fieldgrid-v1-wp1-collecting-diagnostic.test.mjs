import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Collector, ReadOnlySession, DiagnosticError, markdown } from '../scripts/wp1/diagnostic-core.mjs';
import { inspectPayments, paymentKind } from '../scripts/wp1/diagnostic-inspection.mjs';
import { providerReader, inspectAuth, inspectStorage, inspectWriters } from '../scripts/wp1/diagnostic-external.mjs';
import { inspectCopyHost, launchCopy, assertDisposable } from '../scripts/wp1/diagnostic-copy.mjs';

const tenant = '10000000-0000-4000-8000-000000000001';
const user = '20000000-0000-4000-8000-000000000001';
const ready = collector => {
  for (const id of ['table.payment_allocations', 'table.customer_payment_batch_items', 'table.invoices', 'provider.client', 'access.manager', 'private.directory', 'private.storage_directory']) collector.add(id, 'PASS');
};

test('multiple independent failures are collected and dependency skips are not passes', async () => {
  const c = new Collector({}), ran = [];
  for (const [name, error] of [['payments', true], ['auth', true], ['backup', false]]) {
    await c.run(name, async () => { ran.push(name); if (error) throw new Error('secret@example.com postgres://password'); });
  }
  await c.run('restore', async () => ran.push('restore'), ['backup']);
  await c.run('blocked', async () => assert.fail('dependent must not execute'), ['payments']);
  assert.deepEqual(ran, ['payments', 'auth', 'backup', 'restore']);
  const report = c.report();
  assert.equal(report.totals.failures, 2);
  assert.equal(report.totals.untested, 1);
  assert.equal(report.diagnosticComplete, false);
  assert.equal(report.resetAuthorized, false);
  assert.equal(report.readyForReset, false);
  assert.ok(!JSON.stringify(report).includes('password'));
  assert.match(markdown(report), /No reset is authorized/);
});
test('even an entirely passing diagnostic cannot become reset evidence', async () => {
  const c = new Collector({ contract: 'fieldgrid-wp1-reset-v2', readyForReset: true, resetAuthorized: true });
  await c.run('check', async () => {});
  const report = c.report();
  assert.equal(report.contract, 'fieldgrid-wp1-collecting-diagnostic-v1');
  assert.equal(report.readyForReset, false);
  assert.equal(report.resetAuthorized, false);
  assert.equal(report.diagnosticComplete, true);
  assert.throws(() => c.add('unsafe|<script>', 'PASS'));
});
test('SQL failure recovers a savepoint before the next independent query', async () => {
  const calls = [], client = { async query(text) {
    calls.push(text);
    if (text === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'on' }] };
    if (text === 'SELECT broken') throw new Error('private SQL error');
    return { rows: [{ value: 1 }] };
  } };
  const session = new ReadOnlySession(client);
  await session.start();
  await assert.rejects(session.read(c => c.query('SELECT broken')));
  assert.deepEqual(await session.read(c => c.query('SELECT 1')), { rows: [{ value: 1 }] });
  await assert.rejects(session.read(c => c.query('DELETE FROM anything')), error => error.code === 'SOURCE_WRITE_REJECTED');
  assert.ok(!calls.includes('DELETE FROM anything'));
  assert.ok(calls.indexOf('ROLLBACK TO SAVEPOINT diagnostic_read') < calls.indexOf('SELECT 1'));
  await session.close();
  assert.equal(calls.at(-1), 'ROLLBACK');
});
test('snapshot export runs outside diagnostic savepoints', async () => {
  const calls = [];
  let inSavepoint = false;
  const client = { async query(text) {
    calls.push(text);
    if (text === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'on' }] };
    if (text === 'SAVEPOINT diagnostic_read') { inSavepoint = true; return { rows: [] }; }
    if (text === 'RELEASE SAVEPOINT diagnostic_read') { inSavepoint = false; return { rows: [] }; }
    if (text === 'SELECT pg_export_snapshot() AS snapshot') {
      assert.equal(inSavepoint, false);
      return { rows: [{ snapshot: '00000003-0000001B-1' }] };
    }
    return { rows: [{ value: 1 }] };
  } };
  const session = new ReadOnlySession(client);
  await session.start();
  await session.read(async read => read.query('SELECT 1'));
  assert.equal(await session.exportSnapshot(), '00000003-0000001B-1');
  assert.notEqual(calls.at(-1), 'SAVEPOINT diagnostic_read');
  await session.close();
});

test('failed SQL cleanup poisons the session rather than falsely continuing', async () => {
  const session = new ReadOnlySession({ async query(text) {
    if (text === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'on' }] };
    if (text === 'SELECT bad' || text.startsWith('ROLLBACK TO')) throw new Error('private');
    return { rows: [] };
  } });
  await session.start();
  await assert.rejects(session.read(c => c.query('SELECT bad')), e => e.code === 'SOURCE_SAVEPOINT_RECOVERY_FAILED');
  await assert.rejects(session.read(() => assert.fail('poisoned connection')), e => e.code === 'SOURCE_SESSION_UNAVAILABLE');
  await session.close();
});
test('every payment is inspected despite earlier provider/local failures', async () => {
  const c = new Collector({}); ready(c);
  const visited = [];
  const rows = [1, 2, 3].map(n => ({ id: String(n), tenant_id: tenant, mollie_payment_id: `tr_Test${n}`, payment_method: 'mollie' }));
  await inspectPayments(c, { data: { payments: rows, invoices: [], payment_allocations: [], customer_payment_batches: [{ tenant_id: tenant, mollie_payment_id: 'tr_Orphan' }], customer_payment_batch_items: [] } }, 'test_abc', undefined, {
    paymentBlockers: data => data.payments[0].id === '1' ? 1 : 0,
    verifyTestPayments: async data => {
      const row = data.data.payments[0]; visited.push(row.id);
      if (row.id !== '3') { const e = new Error('raw provider token'); e.code = 'PAYMENT_PROVIDER_ACTIVE'; throw e; }
    },
  });
  assert.deepEqual(visited, ['1', '2', '3']);
  assert.equal(c.status('payment.0003.provider'), 'PASS');
  assert.equal(c.status('batch.0001'), 'FAIL');
  assert.equal(c.report().totals.failures, 4);
  assert.ok(!JSON.stringify(c.report()).includes('raw provider'));
});
test('terminal test-payment metadata drift is an observation, not a blocker', async () => {
  const c = new Collector({}); ready(c);
  const row = { id: '1', tenant_id: tenant, mollie_payment_id: 'tr_Test1', payment_method: 'mollie' };
  await inspectPayments(c, { data: { payments: [row], invoices: [], payment_allocations: [], customer_payment_batches: [], customer_payment_batch_items: [] } }, 'test_abc', undefined, {
    paymentBlockers: () => 0,
    verifyResetSafeTestPayments: async () => ({ count: 1, metadataMismatches: 1 }),
  });
  assert.equal(c.status('payment.0001.provider'), 'PASS');
  assert.equal(c.status('payment.0001.metadata'), 'NOT_APPLICABLE');
  assert.equal(c.checks.find(item => item.id === 'payment.0001.metadata')?.code, 'PAYMENT_METADATA_DRIFT_OBSERVED');
  assert.equal(c.report().totals.failures, 0);
});

test('historical paid seed signature is observed, not declared cleanup-safe', () => {
  const invoice = { id: tenant, tenant_id: tenant, notes: 'VEELE_STAGING_DEMO_DEN_HAAG: demo' };
  const row = { tenant_id: tenant, invoice_id: tenant, mollie_payment_id: 'tr_staging_demo_10000000_paid', checkout_url: `https://www.mollie.com/checkout/staging-demo/${tenant}`, paid_at: '2026-01-01' };
  assert.equal(paymentKind(row, { invoices: [invoice] }), 'seed_signature');
  assert.equal(paymentKind(row, { invoices: [] }), 'unresolved_reference');
});
test('provider read capability excludes mutation methods; Auth paginates', async () => {
  let pages = 0;
  const admin = { auth: { admin: {
    listUsers: async ({ page }) => { pages++; return { data: { users: page === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}` })) : [{ id: user }] } }; },
    deleteUser: () => assert.fail('Auth mutation'),
  } }, storage: { from: () => ({ remove: () => assert.fail('Storage mutation'), upload: () => assert.fail('Storage mutation') }) } };
  const reader = providerReader(admin), c = new Collector({}); ready(c);
  assert.deepEqual(Object.keys(reader), ['listUsers', 'list', 'download']);
  await inspectAuth(c, reader, { adminId: user });
  assert.equal(pages, 2);
  assert.equal(c.status('auth.manager_continuity'), 'PASS');
});
test('one failing bucket does not hide pagination/downloads in another bucket', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wp1-storage-test-'));
  const c = new Collector({}); ready(c); const calls = [];
  try {
    await inspectStorage(c, {
      list: async (bucket, prefix, { offset }) => {
        calls.push([bucket, offset]);
        if (bucket === 'documents') return { error: { status: 403, message: 'private name' } };
        if (bucket !== 'assignment-photos') return { data: [] };
        return { data: Array.from({ length: offset === 0 ? 100 : 1 }, (_, i) => ({ id: `id-${offset + i}`, name: `object-${offset + i}`, metadata: { size: 1 } })) };
      },
      download: async () => ({ data: new Blob(['x']) }),
    }, directory);
    assert.equal(c.status('storage.documents.inventory'), 'FAIL');
    assert.equal(c.status('storage.personnel-avatars.inventory'), 'PASS');
    assert.ok(calls.some(([bucket, offset]) => bucket === 'assignment-photos' && offset === 100));
    assert.equal(c.status('storage.assignment-photos.object_100'), 'PASS');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('writer checks only inspect systemctl state and sudo -l permissions', async () => {
  const c = new Collector({}), calls = [];
  await inspectWriters(c, '', async (binary, args) => {
    calls.push([binary, args]);
    if (binary.endsWith('sudo')) { assert.deepEqual(args.slice(0, 3), ['-n', '-l', '/usr/bin/systemctl']); if (args.at(-1).includes('personeel')) throw new Error('private'); }
    else assert.ok(['show', 'list-units', 'list-unit-files'].includes(args[0]));
    return { stdout: '' };
  }, { parseWriterUnits: () => ['veele-staging.service', 'veele-staging-personeel.service'], parseUnitState: () => ({ active: true }) });
  assert.equal(c.status('writer.1.stop_permission'), 'FAIL');
  assert.equal(c.status('writer.0.stop_permission'), 'PASS');
  assert.equal(calls.filter(([bin]) => bin.endsWith('sudo')).length, 4);
});
test('copy host chooses helper when unprivileged user namespaces are unavailable', async () => {
  const c = new Collector({}), calls = [];
  const strategy = await inspectCopyHost(c, '/tmp/wp1-copy-host-test', { PATH: process.env.PATH }, async (binary, args, options) => {
    calls.push([binary, args]);
    assert.deepEqual(Object.keys(options.env).sort(), ['HOME', 'LANG', 'PATH']);
    if (binary === 'ip') return { stdout: 'ip utility' };
    if (binary === 'unshare') throw new Error('user namespace denied');
    if (binary === '/usr/bin/sudo') return { stdout: '' };
    throw new Error('unexpected command');
  });
  assert.equal(strategy, 'helper');
  assert.equal(c.status('copy.host.ip'), 'PASS');
  assert.equal(c.status('copy.host.user_namespace'), 'NOT_APPLICABLE');
  assert.equal(c.status('copy.host.network_namespace'), 'NOT_APPLICABLE');
  assert.equal(c.status('copy.host.pid_namespace'), 'NOT_APPLICABLE');
  assert.equal(c.status('copy.host.combined_namespace'), 'NOT_APPLICABLE');
  assert.equal(c.status('copy.host.helper_permission'), 'PASS');
  assert.equal(c.status('copy.host.helper_probe'), 'PASS');
  assert.equal(c.status('copy.host.isolation_strategy'), 'PASS');
  assert.ok(calls.some(([binary, args]) => binary === '/usr/bin/sudo' && args.includes('probe')));
  assert.ok(!JSON.stringify(c.report()).includes('user namespace denied'));
});

test('copy host fails only the final isolation strategy when neither safe path exists', async () => {
  const c = new Collector({});
  const strategy = await inspectCopyHost(c, '/tmp/wp1-copy-host-test', { PATH: process.env.PATH }, async (binary) => {
    if (binary === 'ip') return { stdout: 'ip utility' };
    throw new Error('unavailable');
  });
  assert.equal(strategy, null);
  assert.equal(c.status('copy.host.user_namespace'), 'NOT_APPLICABLE');
  assert.equal(c.status('copy.host.helper_permission'), 'NOT_APPLICABLE');
  assert.equal(c.status('copy.host.isolation_strategy'), 'FAIL');
  assert.equal(c.report().totals.failures, 1);
});

test('copy launch strips credentials for both unprivileged and helper strategies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wp1-copy-test-'));
  const output = join(directory, 'output.json');
  try {
    let calls = 0;
    await launchCopy(join(directory, 'input.json'), output, directory,
      { PATH: process.env.PATH, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_TOKEN: 'secret', MOLLIE_API_KEY: 'live_secret', DATABASE_URL: 'private' },
      'unprivileged', async (binary, args, options) => {
        calls++;
        assert.equal(binary, 'unshare');
        for (const flag of ['--net', '--pid', '--fork', '--kill-child=SIGKILL', '--mount-proc']) assert.ok(args.includes(flag));
        assert.deepEqual(Object.keys(options.env).sort(), ['HOME', 'LANG', 'PATH']);
        await writeFile(output, JSON.stringify(new Collector({}).report()));
      });
    assert.equal(calls, 1);

    await rm(output, { force: true });
    calls = 0;
    await launchCopy(join(directory, 'input.json'), output, directory,
      { PATH: process.env.PATH, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_TOKEN: 'secret', MOLLIE_API_KEY: 'live_secret', DATABASE_URL: 'private' },
      'helper', async (binary, args, options) => {
        calls++;
        assert.equal(binary, '/usr/bin/sudo');
        assert.deepEqual(args.slice(0, 4), ['-n', '/usr/local/sbin/fieldgrid-wp1-copy-sandbox', 'run', '123']);
        assert.equal(args[4], '1');
        assert.equal(args[5], process.execPath);
        assert.deepEqual(Object.keys(options.env).sort(), ['LANG', 'PATH']);
        await writeFile(output, JSON.stringify(new Collector({}).report()));
      });
    assert.equal(calls, 1);

    await assert.rejects(launchCopy('unused', 'unused', directory, { PATH: process.env.PATH }, 'unsafe', async () => assert.fail('must not execute')),
      error => error.code === 'COPY_ISOLATION_STRATEGY_INVALID');
    await assert.rejects(assertDisposable({ query: () => assert.fail('must not touch remote') }, { pgEnv: { PGHOST: 'remote.supabase.co' } }, directory));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

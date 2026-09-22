import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { Collector, ReadOnlySession } from '../../scripts/wp1/diagnostic-core.mjs';
import { inspectDatabase } from '../../scripts/wp1/diagnostic-inspection.mjs';

const require = createRequire(new URL('../../lib/db/package.json', import.meta.url));
const { Client } = require('pg');

test('collecting diagnostic recovers multiple SQL faults on real migrated PostgreSQL 17', async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/fieldgrid_runtime_safety');
  assert.equal(process.env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET, '1');
  const client = new Client({ connectionString: url.toString(), ssl: false });
  const session = new ReadOnlySession(client), collector = new Collector({});
  try {
    await client.connect();
    assert.match((await client.query('SHOW server_version')).rows[0].server_version, /^17\./);
    await session.start();
    collector.add('source.snapshot', 'PASS');
    await collector.run('injected.division', () => session.read(read => read.query('SELECT 1/0')));
    await collector.run('injected.missing_relation', () => session.read(read => read.query('SELECT * FROM public.fieldgrid_diagnostic_missing_relation')));
    await collector.run('injected.read_only_enforcement', () => session.read(read => read.query('WITH changed AS (DELETE FROM public.tenants WHERE false RETURNING id) SELECT count(*) FROM changed')));
    assert.equal(collector.status('injected.read_only_enforcement'), 'FAIL');
    const database = await inspectDatabase(session, collector, { tenantId: randomUUID(), adminId: null, operationId: randomUUID() });
    assert.equal(collector.status('catalog.tables'), 'PASS');
    assert.equal(collector.status('table.payments'), 'PASS');
    assert.equal(collector.status('table.customers'), 'PASS');
    assert.equal(collector.status('access.manager'), 'FAIL'); // missing manager must not hide the above evidence
    assert.ok(Array.isArray(database.data.tenants));
    assert.ok(collector.report().totals.failures >= 4);
    assert.equal(collector.report().resetAuthorized, false);
    await session.close();
    assert.equal((await client.query('SELECT 1 AS alive')).rows[0].alive, 1);
  } finally {
    if (session.started) await session.close();
    await client.end();
  }
});

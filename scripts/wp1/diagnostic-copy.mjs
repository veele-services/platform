/** Runs ONLY in a fresh, egress-isolated, unprivileged PostgreSQL 17 copy. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, readlink, realpath, lstat, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Collector, ReadOnlySession, check, DiagnosticError } from './diagnostic-core.mjs';
import { CATALOG_SQL } from './diagnostic-inspection.mjs';

const exec = promisify(execFile);
const FILE = fileURLToPath(import.meta.url);
const SANDBOX_HELPER = '/usr/local/sbin/fieldgrid-wp1-copy-sandbox';
const safeSql = error => ({ '23503': 'FOREIGN_KEY_REFERENCE', '42501': 'DATABASE_PERMISSION', '42P01': 'RELATION_MISSING', '42703': 'COLUMN_MISSING', 'P0001': 'BUSINESS_TRIGGER_BLOCK' }[error?.code] ?? 'COPY_SQL_FAILED');
async function sqlStep(client, operation) {
  await client.query('SAVEPOINT diagnostic_mutation');
  try {
    const result = await operation();
    await client.query('RELEASE SAVEPOINT diagnostic_mutation');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK TO SAVEPOINT diagnostic_mutation');
      await client.query('RELEASE SAVEPOINT diagnostic_mutation');
    } catch { throw new DiagnosticError('COPY_SAVEPOINT_RECOVERY_FAILED'); }
    throw error instanceof DiagnosticError ? error : new DiagnosticError(safeSql(error));
  }
}
export async function assertDisposable(client, target, directory) {
  check(target?.pgEnv?.PGHOST === '127.0.0.1' && target.database === 'fieldgrid_phase2e_staging_copy' &&
    Number.isInteger(target.port) && target.port >= 1024, 'COPY_TARGET_INVALID');
  const root = await realpath(directory), expected = await realpath(target.dataDir);
  check(expected === join(root, 'restore-data'), 'COPY_PATH_INVALID');
  const row = (await client.query(`SELECT current_database() AS database,inet_server_addr()::text AS host,
    inet_server_port() AS port,current_setting('data_directory') AS directory,current_setting('server_version') AS version`)).rows[0];
  check(row?.database === target.database && row.host === '127.0.0.1' && row.port === target.port &&
    await realpath(row.directory) === expected && /^17\./.test(row.version), 'COPY_IDENTITY_MISMATCH');
}
async function snapshot(client) {
  const { ALL_TABLES, JOURNALS, PRESERVE_TABLES } = await import('./relations.mjs');
  const { identifier, rowsDigest, hash, MAX_ROWS, MAX_BYTES } = await import('./contract.mjs');
  const session = new ReadOnlySession(client), rows = {}, catalogs = {}, journals = {}, preservedRows = {};
  let bytes = 0, count = 0;
  try {
    await session.start();
    for (const table of ALL_TABLES) {
      const data = await session.read(async read => (await read.query(`SELECT to_jsonb(t) AS row FROM public.${identifier(table)} t LIMIT ${MAX_ROWS + 1}`)).rows.map(row => row.row));
      count += data.length; bytes += Buffer.byteLength(JSON.stringify(data));
      check(count <= MAX_ROWS && bytes <= MAX_BYTES, 'COPY_SNAPSHOT_LIMIT');
      rows[table] = rowsDigest(data);
      if (PRESERVE_TABLES.includes(table)) preservedRows[table] = data;
    }
    for (const [name, text] of Object.entries(CATALOG_SQL)) catalogs[name] = await session.read(async read => hash((await read.query(text)).rows));
    for (const name of JOURNALS) {
      const relation = name.split('.').map(identifier).join('.');
      journals[name] = await session.read(async read => hash((await read.query(`SELECT to_jsonb(t) AS row FROM ${relation} t ORDER BY to_jsonb(t)::text`)).rows.map(row => row.row)));
    }
    return { rowDigests: rows, catalogDigests: catalogs, journalDigests: journals, preservedRows };
  } finally { await session.close(); }
}
function sameObserved(expected, current) {
  for (const category of ['rowDigests', 'catalogDigests', 'journalDigests']) {
    for (const [name, value] of Object.entries(expected[category] ?? {})) {
      check(current[category]?.[name] === value, 'COPY_RESTORE_MISMATCH');
    }
  }
}

/** No skip-payments flag is added to resetDatabase or the live apply runner. */
export async function rehearseCopy(client, target, directory, expected, collector) {
  const { ALL_TABLES, DELETE_TABLES, PRESERVE_TABLES, HISTORY_DELETE_GUARDS, assertCatalogCoverage, deletionOrder, JOURNALS } = await import('./relations.mjs');
  const { identifier, rowsDigest, hash } = await import('./contract.mjs');
  const { bootstrapCanonical, verifyCanonical } = await import('./bootstrap.mjs');
  await assertDisposable(client, target, directory); // Before any DDL or DML.
  const baseline = await collector.run('copy.restored_snapshot', async () => ({ value: await snapshot(client) }));
  await collector.run('copy.matches_source', async () => sameObserved(expected, baseline), ['copy.restored_snapshot']);
  const catalog = {};
  for (const [name, query] of Object.entries(CATALOG_SQL)) {
    catalog[name] = await collector.run(`copy.catalog.${name}`, async () => ({ value: (await client.query(query)).rows }));
  }
  await collector.run('copy.coverage', async () => assertCatalogCoverage(catalog.tables.map(row => row.name)), ['copy.catalog.tables'], 'COPY_CATALOG_COVERAGE');
  const order = await collector.run('copy.delete_order', async () => ({ value: deletionOrder(catalog.fks) }), ['copy.catalog.fks'], 'COPY_FK_ORDER');
  const prerequisites = ['copy.matches_source', 'copy.coverage', 'copy.delete_order', 'copy.catalog.triggers'];
  let transactionOpen = false;
  const started = await collector.run('copy.transaction', async () => {
    await assertDisposable(client, target, directory);
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    return { value: true };
  }, prerequisites);
  const restoredGuards = [], removed = [];
  try {
    for (const [index, [table, name, fn]] of HISTORY_DELETE_GUARDS.entries()) {
      const trigger = await collector.run(`copy.guard.${index}`, () => sqlStep(client, async () => {
        const actual = catalog.triggers.find(row => row.table === table && row.name === name);
        check(actual?.function === fn && actual.functionSchema === 'public' && ['O', 'A', 'R'].includes(actual.enabled) && (actual.type & 8) === 8, 'COPY_HISTORY_GUARD_DRIFT');
        await client.query(`ALTER TABLE public.${identifier(table)} DISABLE TRIGGER ${identifier(name)}`);
        return { value: actual };
      }), ['copy.transaction']);
      if (trigger) restoredGuards.push(trigger);
    }
    for (const table of order ?? DELETE_TABLES) {
      const id = `copy.delete.${table}`;
      await collector.run(id, () => sqlStep(client, async () => {
        const result = await client.query(`DELETE FROM public.${identifier(table)}`);
        return { counts: { deleted_rows: result.rowCount ?? 0 } };
      }), ['copy.transaction']);
      removed.push(id);
    }
    // Match the existing reset's second queue pass, without dispatching anything.
    const queues = ['notification_delivery_attempts', 'notification_delivery_queue', 'notification_dispatches', 'domain_events', 'portal_realtime_events', 'personnel_notifications', 'customer_notifications'];
    for (const table of (order ?? []).filter(name => queues.includes(name))) {
      await collector.run(`copy.queue.${table}`, () => sqlStep(client, async () => { await client.query(`DELETE FROM public.${identifier(table)}`); }), ['copy.transaction']);
    }
    for (const [index, trigger] of restoredGuards.entries()) {
      const id = `copy.restore_guard.${index}`;
      await collector.run(id, () => sqlStep(client, async () => {
        const action = trigger.enabled === 'A' ? 'ENABLE ALWAYS' : trigger.enabled === 'R' ? 'ENABLE REPLICA' : 'ENABLE';
        await client.query(`ALTER TABLE public.${identifier(trigger.table)} ${action} TRIGGER ${identifier(trigger.name)}`);
      }), ['copy.transaction']);
      removed.push(id);
    }
    await collector.run('copy.cleaned', async () => {
      for (const table of DELETE_TABLES) {
        const rows = (await client.query(`SELECT 1 FROM public.${identifier(table)} LIMIT 1`)).rows;
        check(rows.length === 0, 'COPY_TEST_ROWS_REMAIN');
      }
    }, ['copy.transaction', ...removed]);
    await collector.run('copy.bootstrap', () => sqlStep(client, async () => {
      check(typeof expected.context?.adminId === 'string', 'COPY_MANAGER_UNRESOLVED');
      await bootstrapCanonical(client, expected.context);
    }), ['copy.cleaned']);
    await collector.run('copy.verify', () => sqlStep(client, async () => {
      const proof = await verifyCanonical(client, expected.context);
      check(proof.tenantIsolationVerified === true, 'COPY_ISOLATION_FAILED');
    }), ['copy.bootstrap']);
    await collector.run('copy.verify_repeat', () => sqlStep(client, async () => {
      const proof = await verifyCanonical(client, expected.context);
      check(proof.ready === true, 'COPY_REPEAT_VERIFY_FAILED');
    }), ['copy.verify']);
    for (const table of PRESERVE_TABLES) {
      await collector.run(`copy.preserved.${table}`, () => sqlStep(client, async () => {
        const before = baseline.preservedRows[table];
        const after = (await client.query(`SELECT to_jsonb(t) AS row FROM public.${identifier(table)} t LIMIT 20001`)).rows.map(row => row.row);
        const observed = new Set(after.map(row => rowsDigest([row])));
        check(before.every(row => observed.has(rowsDigest([row]))), 'COPY_PRESERVED_ROWS_CHANGED');
      }), ['copy.transaction']);
    }
    await collector.run('copy.catalog_unchanged', () => sqlStep(client, async () => {
      for (const [name, query] of Object.entries(CATALOG_SQL)) check(hash((await client.query(query)).rows) === baseline.catalogDigests[name], 'COPY_CATALOG_CHANGED');
    }), ['copy.transaction', 'copy.restored_snapshot']);
    await collector.run('copy.journals_unchanged', () => sqlStep(client, async () => {
      for (const name of JOURNALS) {
        const relation = name.split('.').map(identifier).join('.');
        const data = (await client.query(`SELECT to_jsonb(t) AS row FROM ${relation} t ORDER BY to_jsonb(t)::text`)).rows.map(row => row.row);
        check(hash(data) === expected.journalDigests[name], 'COPY_JOURNAL_CHANGED');
      }
    }), ['copy.transaction']);
  } finally {
    await collector.run('copy.rollback', async () => {
      if (transactionOpen) { await client.query('ROLLBACK'); transactionOpen = false; }
    });
  }
  await collector.run('copy.rollback_equality', async () => {
    sameObserved(baseline, await snapshot(client));
  }, ['copy.restored_snapshot', 'copy.rollback']);
}

function copyProcessEnv(directory, runtime) {
  const env = { PATH: runtime.PATH, HOME: directory, LANG: 'C.UTF-8' };
  for (const key of ['FIELDGRID_POSTGRESQL_SHAREDIR', 'LD_LIBRARY_PATH']) if (runtime[key]) env[key] = runtime[key];
  return env;
}

async function optionalHostProbe(collector, id, operation, code, dependencies = []) {
  const blocked = dependencies.some(item => collector.status(item) !== 'PASS');
  if (blocked) {
    collector.add(id, 'NOT_APPLICABLE', 'OPTIONAL_STRATEGY_PREREQUISITE_UNAVAILABLE', {}, dependencies);
    return false;
  }
  try {
    await operation();
    collector.add(id, 'PASS');
    return true;
  } catch {
    collector.add(id, 'NOT_APPLICABLE', code);
    return false;
  }
}

export async function inspectCopyHost(collector, directory, runtime, command = exec) {
  const env = copyProcessEnv(directory, runtime);
  const options = { env, timeout: 15000, maxBuffer: 16384 };
  await collector.run('copy.host.ip', async () => {
    await command('ip', ['-Version'], options);
  }, [], 'COPY_IP_UNAVAILABLE');

  const userNamespace = await optionalHostProbe(collector, 'copy.host.user_namespace', async () => {
    await command('unshare', ['--user', '--map-current-user', 'true'], options);
  }, 'COPY_USER_NAMESPACE_UNAVAILABLE');

  let combinedNamespace = false;
  if (userNamespace) {
    const networkNamespace = await optionalHostProbe(collector, 'copy.host.network_namespace', async () => {
      await command('unshare', ['--user', '--map-current-user', '--net', 'ip', 'link', 'set', 'lo', 'up'], options);
    }, 'COPY_NETWORK_NAMESPACE_UNAVAILABLE', ['copy.host.ip', 'copy.host.user_namespace']);
    const pidNamespace = await optionalHostProbe(collector, 'copy.host.pid_namespace', async () => {
      await command('unshare', ['--user', '--map-current-user', '--pid', '--fork', '--mount-proc', 'true'], options);
    }, 'COPY_PID_NAMESPACE_UNAVAILABLE', ['copy.host.user_namespace']);
    if (networkNamespace && pidNamespace) {
      combinedNamespace = await optionalHostProbe(collector, 'copy.host.combined_namespace', async () => {
        await command('unshare', ['--user', '--map-current-user', '--net', '--pid', '--fork', '--kill-child=SIGKILL', '--mount-proc',
          'sh', '-c', 'ip link set lo up && ip -json link show >/dev/null'], options);
      }, 'COPY_COMBINED_NAMESPACE_UNAVAILABLE', ['copy.host.network_namespace', 'copy.host.pid_namespace']);
    } else {
      collector.add('copy.host.combined_namespace', 'NOT_APPLICABLE', 'OPTIONAL_STRATEGY_PREREQUISITE_UNAVAILABLE', {},
        ['copy.host.network_namespace', 'copy.host.pid_namespace']);
    }
  } else {
    for (const id of ['copy.host.network_namespace', 'copy.host.pid_namespace', 'copy.host.combined_namespace']) {
      collector.add(id, 'NOT_APPLICABLE', 'OPTIONAL_STRATEGY_PREREQUISITE_UNAVAILABLE', {}, ['copy.host.user_namespace']);
    }
  }

  const helperPermission = await optionalHostProbe(collector, 'copy.host.helper_permission', async () => {
    await command('/usr/bin/sudo', ['-n', '-l', SANDBOX_HELPER, 'probe'], options);
  }, 'COPY_SANDBOX_HELPER_PERMISSION_UNAVAILABLE');
  const helperProbe = helperPermission && await optionalHostProbe(collector, 'copy.host.helper_probe', async () => {
    await command('/usr/bin/sudo', ['-n', SANDBOX_HELPER, 'probe'], options);
  }, 'COPY_SANDBOX_HELPER_PROBE_FAILED', ['copy.host.helper_permission']);
  if (!helperPermission) collector.add('copy.host.helper_probe', 'NOT_APPLICABLE', 'OPTIONAL_STRATEGY_PREREQUISITE_UNAVAILABLE', {}, ['copy.host.helper_permission']);

  if (combinedNamespace) {
    collector.add('copy.host.isolation_strategy', 'PASS', null, { unprivileged: 1 });
    return 'unprivileged';
  }
  if (helperProbe) {
    collector.add('copy.host.isolation_strategy', 'PASS', null, { helper: 1 });
    return 'helper';
  }
  collector.add('copy.host.isolation_strategy', 'FAIL', 'COPY_ISOLATION_STRATEGY_UNAVAILABLE');
  return null;
}

export async function launchCopy(inputFile, outputFile, directory, runtime, strategy, command = exec) {
  check(strategy === 'unprivileged' || strategy === 'helper', 'COPY_ISOLATION_STRATEGY_INVALID');
  if (strategy === 'unprivileged') {
    const parentNamespace = await readlink('/proc/self/ns/net');
    const env = copyProcessEnv(directory, runtime);
    await command('unshare', ['--user', '--map-current-user', '--net', '--pid', '--fork', '--kill-child=SIGKILL', '--mount-proc', process.execPath, FILE, inputFile, outputFile, parentNamespace], {
      env, timeout: 900000, maxBuffer: 65536,
    });
  } else {
    check(/^\\d{1,20}$/.test(runtime.GITHUB_RUN_ID ?? '') && /^\\d{1,5}$/.test(runtime.GITHUB_RUN_ATTEMPT ?? ''), 'COPY_HELPER_RUN_ID');
    await command('/usr/bin/sudo', ['-n', SANDBOX_HELPER, 'run', runtime.GITHUB_RUN_ID, runtime.GITHUB_RUN_ATTEMPT, process.execPath], {
      env: { PATH: runtime.PATH, LANG: 'C.UTF-8' }, timeout: 900000, maxBuffer: 65536,
    });
  }
  const result = JSON.parse(await readFile(outputFile, 'utf8'));
  check(result.contract === 'fieldgrid-wp1-collecting-diagnostic-v1' && result.resetAuthorized === false && Array.isArray(result.checks), 'COPY_REPORT_INVALID');
  return result;
}
async function worker() {
  check(process.argv.length === 5 && process.getuid() !== 0 && process.pid === 1, 'COPY_WORKER_INVOCATION');
  const [inputFile, outputFile, parentNamespace] = process.argv.slice(2);
  check(await readlink('/proc/self/ns/net') !== parentNamespace, 'COPY_NETWORK_NOT_ISOLATED');
  check(!Object.keys(process.env).some(key => /TOKEN|SECRET|DATABASE_URL|MOLLIE|SUPABASE|^PG/.test(key)), 'COPY_CREDENTIAL_LEAK');
  await exec('ip', ['link', 'set', 'lo', 'up'], { timeout: 5000 });
  const links = JSON.parse((await exec('ip', ['-json', 'link', 'show'], { timeout: 5000 })).stdout);
  check(links.length === 1 && links[0].ifname === 'lo', 'COPY_NETWORK_INTERFACE');
  const info = await lstat(inputFile), root = await realpath(dirname(inputFile));
  check(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid() && (info.mode & 0o077) === 0, 'COPY_INPUT_PERMISSIONS');
  check(await realpath(inputFile) === resolve(inputFile) && dirname(outputFile) === root, 'COPY_INPUT_PATH');
  const input = JSON.parse(await readFile(inputFile, 'utf8'));
  check(await realpath(input.dump) === join(root, 'database.dump'), 'COPY_DUMP_PATH');
  const collector = new Collector({ environment: 'isolated-copy' });
  collector.add('copy.network_isolation', 'PASS');
  const { startRestoreTarget, stopRestoreTarget } = await import('../fieldgrid-phase2e-staging-preflight.mjs');
  const temp = await mkdtemp(join(root, 'copy-'));
  let target, client;
  try {
    target = await collector.run('copy.cluster', async () => ({ value: await startRestoreTarget(temp) }), [], 'COPY_CLUSTER_FAILED');
    await collector.run('copy.restore', async () => {
      check(target.pgEnv.PGHOST === '127.0.0.1' && target.database === 'fieldgrid_phase2e_staging_copy', 'COPY_TARGET_INVALID');
      await exec('pg_restore', ['--exit-on-error', '--no-owner', '--no-subscriptions', '--dbname', target.database, input.dump], {
        env: { ...process.env, ...target.pgEnv, PGOPTIONS: '-c timezone=UTC' }, timeout: 300000, maxBuffer: 65536,
      });
    }, ['copy.cluster'], 'COPY_RESTORE_FAILED');
    await collector.run('copy.connect', async () => {
      const require = createRequire(new URL('../../lib/db/package.json', import.meta.url));
      const { Client } = require('pg');
      client = new Client({ host: '127.0.0.1', port: target.port, database: target.database, user: target.pgEnv.PGUSER, password: target.pgEnv.PGPASSWORD, ssl: false, options: '-c timezone=UTC', query_timeout: 45000 });
      await client.connect();
      await assertDisposable(client, target, temp);
    }, ['copy.restore'], 'COPY_CONNECTION_FAILED');
    if (collector.status('copy.connect') === 'PASS') {
      await collector.run('copy.mechanical', async () => { await rehearseCopy(client, target, temp, input.expected, collector);
        check(!collector.checks.some(item => item.status === 'FAIL' || item.status === 'NOT_TESTED'), 'COPY_REHEARSAL_FINDINGS');
      });
    } else {
      for (const name of ['restored_snapshot', 'delete', 'bootstrap', 'verify', 'rollback_equality']) collector.skip(`copy.${name}`, ['copy.connect']);
    }
  } finally {
    await collector.run('copy.connection_cleanup', async () => { if (client) await client.end(); });
    await collector.run('copy.cluster_cleanup', async () => {
      if (target) await stopRestoreTarget(target);
      else {
        // startRestoreTarget can fail after starting postgres but before returning.
        const dataDir = join(temp, 'restore-data');
        try {
          await lstat(join(dataDir, 'postmaster.pid'));
          await exec('pg_ctl', ['--pgdata', dataDir, '--mode', 'immediate', '--wait', 'stop'], { timeout: 30000, maxBuffer: 65536 });
        } catch (error) { if (error.code !== 'ENOENT') throw new DiagnosticError('COPY_CLUSTER_CLEANUP_FAILED'); }
      }
    });
    if (collector.status('copy.cluster_cleanup') === 'PASS') await rm(temp, { recursive: true, force: true });
    await writeFile(outputFile, JSON.stringify(collector.report()), { mode: 0o600, flag: 'wx' });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === FILE) {
  worker().catch(() => { console.error('COPY_WORKER_FAILED'); process.exitCode = 1; });
}

#!/usr/bin/env node
/** Independent collecting diagnostic. It has NO apply entrypoint. */
import { mkdir, mkdtemp, writeFile, appendFile, readFile, rm, chmod, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { Collector, DiagnosticError, ReadOnlySession, check, DIAGNOSTIC_CONFIRMATION, DIAGNOSTIC_WORKFLOW, markdown } from './wp1/diagnostic-core.mjs';
import { inspectDatabase, inspectPayments } from './wp1/diagnostic-inspection.mjs';
import { REQUIRED_UNITS, inspectWriters, inspectAuth, inspectStorage, providerReader } from './wp1/diagnostic-external.mjs';
import { inspectCopyHost, launchCopy } from './wp1/diagnostic-copy.mjs';

const exec = promisify(execFile);
const OUTPUT = 'artifacts/fieldgrid-wp1-diagnostic';
const ROOT = '/var/www/veele/staging/shared/wp1-diagnostic';
const GROUPS = ['source.snapshot', 'database.scan', 'payments.scan', 'auth.inventory', 'storage.inventory', 'writers.inventory', 'backup.database', 'copy.restore', 'copy.bootstrap', 'copy.verify'];

export async function main(env = process.env) {
  const identity = {
    environment: 'staging', repository: 'veele-services/platform', workflow: DIAGNOSTIC_WORKFLOW,
    sha: /^[a-f0-9]{40}$/.test(env.EXPECTED_MAIN_SHA ?? '') ? env.EXPECTED_MAIN_SHA : null,
    runId: /^\d{1,20}$/.test(env.GITHUB_RUN_ID ?? '') ? env.GITHUB_RUN_ID : null,
    attempt: /^\d{1,5}$/.test(env.GITHUB_RUN_ATTEMPT ?? '') ? env.GITHUB_RUN_ATTEMPT : null,
  };
  const collector = new Collector(identity);
  let client, session, directory, config, copyReport;
  try {
    config = await collector.run('safety.environment', async () => {
      check(env.DIAGNOSTIC_CONFIRMATION === DIAGNOSTIC_CONFIRMATION, 'DIAGNOSTIC_CONFIRMATION');
      check(env.GITHUB_WORKFLOW_REF === `veele-services/platform/${DIAGNOSTIC_WORKFLOW}@refs/heads/main`, 'DIAGNOSTIC_WORKFLOW');
      check(!env.RESET_MODE && !env.RESET_CONFIRMATION && !env.WP1_DIAGNOSE_RUN_ID, 'RESET_INPUT_FORBIDDEN');
      const { validateEnvironment } = await import('./wp1/environment.mjs');
      // Reuse all target/TLS/principal/ref guards. Writer configuration is measured
      // separately: it is not permission to mutate and cannot hide independent reads.
      const result = validateEnvironment({ ...env, RESET_MODE: 'diagnose', RESET_CONFIRMATION: 'fieldgrid-v1-wp1-clean-reset-v1', FIELDGRID_WP1_WRITER_UNITS: REQUIRED_UNITS.join(',') });
      return { value: result };
    }, [], 'ENVIRONMENT_VALIDATION_FAILED');
    await collector.run('safety.exact_main_ci', async () => {
      const { githubEvidence } = await import('./wp1/evidence.mjs');
      const evidence = githubEvidence(env.GITHUB_TOKEN);
      await evidence.assertMain(config.sha);
      await evidence.assertValidation(config.sha);
    }, ['safety.environment'], 'EXACT_MAIN_CI_REQUIRED');
    if (collector.status('safety.exact_main_ci') !== 'PASS') {
      for (const id of GROUPS) collector.skip(id, ['safety.exact_main_ci']);
      return;
    }

    directory = await collector.run('private.directory', async () => {
      const { secureDirectory } = await import('./wp1/backup.mjs');
      await secureDirectory(ROOT);
      const path = await mkdtemp(join(ROOT, `collect-${identity.runId}-${identity.attempt}-`));
      await chmod(path, 0o700);
      return { value: path };
    }, [], 'PRIVATE_DIRECTORY_FAILED');

    await collector.run('source.connection', async () => {
      const require = createRequire(new URL('../lib/db/package.json', import.meta.url));
      const { Client } = require('pg');
      client = new Client({ connectionString: config.migration, ssl: config.ssl,
        connectionTimeoutMillis: 15000, query_timeout: 45000,
        application_name: 'fieldgrid-wp1-diagnostic-read-only',
        options: '-c timezone=UTC -c default_transaction_read_only=on' });
      client.on('error', () => {}); // driver details must never enter public logs
      await client.connect();
      session = new ReadOnlySession(client);
    }, [], 'SOURCE_CONNECTION_FAILED');
    await collector.run('source.snapshot', async () => { await session.start(); }, ['source.connection'], 'SOURCE_SNAPSHOT_FAILED');
    let database = { data: {}, rowDigests: {}, catalogDigests: {}, journalDigests: {}, context: config.context };
    await collector.run('database.scan', async () => {
      database = await inspectDatabase(session, collector, config.context);
    }, [], 'DATABASE_SCAN_FAILED');

    await collector.run('payments.scan', async () => { await inspectPayments(collector, database, env.MOLLIE_API_KEY); }, [], 'PAYMENT_SCAN_FAILED');
    await collector.run('writers.inventory', async () => { await inspectWriters(collector, env.FIELDGRID_WP1_WRITER_UNITS); }, [], 'WRITER_SCAN_FAILED');

    const reader = await collector.run('provider.client', async () => {
      const { providerClient } = await import('./wp1/environment.mjs');
      return { value: providerReader(providerClient(config, env)) };
    }, [], 'PROVIDER_CONFIGURATION_FAILED');
    await inspectAuth(collector, reader, config.context);
    const storageDir = await collector.run('private.storage_directory', async () => {
      const path = join(directory, 'storage'); await mkdir(path, { mode: 0o700 }); return { value: path };
    }, ['private.directory']);
    await inspectStorage(collector, reader, storageDir);

    await collector.run('backup.runtime', async () => {
      const { ensurePostgresRuntime } = await import('./fieldgrid-phase2e-staging-preflight.mjs');
      await ensurePostgresRuntime(env);
    }, [], 'POSTGRES17_RUNTIME_UNAVAILABLE');
    const dump = await collector.run('backup.database', async () => {
      const { postgresProcessEnv } = await import('./wp1/environment.mjs');
      const { hashFile } = await import('./wp1/backup.mjs');
      const snapshot = await session.exportSnapshot();
      const bindir = env.FIELDGRID_POSTGRESQL_BINDIR;
      check(typeof bindir === 'string' && bindir.length > 0, 'POSTGRES17_BINDIR_MISSING');
      const pgDump = join(bindir, 'pg_dump'), pgRestore = join(bindir, 'pg_restore');
      const path = join(directory, 'database.dump');
      const pgEnv = { ...postgresProcessEnv(config, env), HOME: directory, PGOPTIONS: '-c timezone=UTC' };
      try {
        await exec(pgDump, ['--format=custom', '--compress=6', '--large-objects', '--no-owner', '--strict-names', '--lock-wait-timeout=15s', `--snapshot=${snapshot}`,
          ...['public', 'auth', 'storage', 'drizzle', 'app_private'].flatMap(schema => ['--schema', schema]), '--file', path], { env: pgEnv, timeout: 300000, maxBuffer: 65536 });
      } catch { throw new DiagnosticError('DATABASE_DUMP_COMMAND_FAILED'); }
      await chmod(path, 0o600);
      const info = await lstat(path);
      check(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= 512 * 1024 * 1024 && (info.mode & 0o077) === 0, 'BACKUP_INVALID');
      let listing;
      try {
        listing = await exec(pgRestore, ['--list', path], { env: { PATH: env.PATH, HOME: directory, LANG: 'C.UTF-8' }, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
      } catch { throw new DiagnosticError('DATABASE_DUMP_LIST_FAILED'); }
      check(listing.stdout.includes('TABLE DATA'), 'BACKUP_CONTENTS');
      return { value: { path, sha256: await hashFile(path) }, counts: { bytes: info.size } };
    }, ['source.snapshot', 'private.directory', 'backup.runtime'], 'DATABASE_BACKUP_FAILED');
    // End the live read snapshot before the potentially lengthy copy rehearsal.
    await collector.run('source.rollback', async () => { if (session) await session.close(); }, [], 'SOURCE_ROLLBACK_FAILED');

    const copyStrategy = await inspectCopyHost(collector, directory, env);

    await collector.run('copy.launch', async () => {
      const input = join(directory, 'copy-input.json'), output = join(directory, 'copy-output.json');
      const expected = {
        context: config.context, rowDigests: database.rowDigests, catalogDigests: database.catalogDigests,
        journalDigests: database.journalDigests,
        counts: Object.fromEntries(Object.entries(database.data).map(([name, rows]) => [name, rows.length])),
      };
      await writeFile(input, JSON.stringify({ dump: dump.path, expected }), { mode: 0o600, flag: 'wx' });
      copyReport = await launchCopy(input, output, directory, env, copyStrategy);
      for (const item of copyReport.checks) collector.add(item.id, item.status, item.code, item.counts, item.dependencies);
    }, ['backup.database', 'source.rollback', 'copy.host.isolation_strategy'], 'COPY_NAMESPACE_OR_WORKER_UNAVAILABLE');
    if (!copyReport) {
      for (const stage of ['restore', 'delete', 'bootstrap', 'verify', 'rollback_equality']) collector.skip(`copy.${stage}`, ['copy.launch']);
    }
  } catch {
    collector.add('diagnostic.unexpected_failure', 'FAIL', 'DIAGNOSTIC_EXECUTION_FAILED');
    for (const id of GROUPS) if (!collector.status(id)) collector.skip(id, ['diagnostic.unexpected_failure']);
  } finally {
    if (session?.started && !collector.status('source.rollback')) {
      await collector.run('source.rollback', () => session.close(), [], 'SOURCE_ROLLBACK_FAILED');
    }
    await collector.run('source.connection_cleanup', async () => { if (client) await client.end(); }, [], 'SOURCE_CONNECTION_CLEANUP_FAILED');
    await collector.run('private.cleanup', async () => {
      if (directory) {
        // Child runs in a PID namespace: all copy processes die with namespace init.
        await rm(directory, { recursive: true, force: true });
      }
    }, [], 'PRIVATE_CLEANUP_FAILED');
    const report = collector.report();
    await mkdir(OUTPUT, { recursive: true, mode: 0o700 });
    await writeFile(join(OUTPUT, 'result.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await writeFile(join(OUTPUT, 'summary.md'), markdown(report), { mode: 0o600 });
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, markdown(report));
    console.log(`WP1 diagnostic: ${report.totals.checks} checks; ${report.totals.failures} failures; ${report.totals.untested} not tested; resetAuthorized=false`);
    if (!report.diagnosticComplete) process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('DIAGNOSTIC_REPORT_FAILED'); process.exitCode = 1; });
}

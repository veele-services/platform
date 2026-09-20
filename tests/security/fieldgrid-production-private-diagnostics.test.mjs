import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { classifyPrivateLog, diagnosePrivateRun, readPrivateLogDiagnostics } from '../../scripts/fieldgrid-production-private-diagnostics.mjs';

test('private migration logs yield only fixed categories, codes and known migration names', () => {
  const secret = randomBytes(32).toString('hex');
  const migration = '20260920131458_reconcile_hosted_policy_contract.sql';
  const result = classifyPrivateLog(`password=${secret}\n[db:migrate] Applying Drizzle generated migrations.\n[db:migrate] SQL applying: ${migration}\npermission denied for table private_customer\ncode: '42501'\nERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY\n[db:migrate] SQL applying: 20260920150000_unknown_payload.sql`, [migration]);
  assert.equal(result.categories.permissionDenied, true);
  assert.equal(result.categories.generatedMigrationStarted, true);
  assert.equal(result.lastKnownMigration, migration);
  assert.deepEqual(result.sqlStates, ['42501']);
  assert.deepEqual(result.processCodes, ['ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY']);
  for (const value of [secret, 'private_customer', 'unknown_payload']) assert.ok(!JSON.stringify(result).includes(value));
  assert.deepEqual(classifyPrivateLog("code: 'ALICE'").sqlStates, []);
});

test('diagnostics bind one private regular file to the exact numeric run and reject ambiguous or linked paths', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'fieldgrid-private-diagnostics-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const migrations = path.join(root, 'migrations'); mkdirSync(migrations);
  const directory = path.join(root, 'a'.repeat(12) + '-12345-Ab123x'); mkdirSync(directory);
  const file = path.join(directory, 'private-operations.log'); writeFileSync(file, "code: '42P01'\nrelation private_payload does not exist", { mode: 0o600 });
  const options = { root, migrationDirectory: migrations };
  const result = diagnosePrivateRun('12345', options);
  assert.equal(result.categories.missingRelation, true);
  assert.deepEqual(result.sqlStates, ['42P01']);
  assert.throws(() => diagnosePrivateRun('../12345', options));
  assert.throws(() => diagnosePrivateRun('12346', options));
  const link = path.join(directory, 'linked.log'); symlinkSync(file, link);
  assert.throws(() => readPrivateLogDiagnostics(link));
  const parentLink = path.join(root, 'linked-directory'); symlinkSync(directory, parentLink);
  assert.throws(() => readPrivateLogDiagnostics(path.join(parentLink, 'private-operations.log')));
  chmodSync(file, 0o640); assert.throws(() => readPrivateLogDiagnostics(file)); chmodSync(file, 0o600);
  writeFileSync(file, 'x'.repeat(1024 * 1024 + 1));
  assert.equal(readPrivateLogDiagnostics(file).tailTruncated, true);
  mkdirSync(path.join(root, 'b'.repeat(12) + '-12345-Ab123x'));
  assert.throws(() => diagnosePrivateRun('12345', options));
});

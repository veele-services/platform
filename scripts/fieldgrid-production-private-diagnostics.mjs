#!/usr/bin/env node
import { constants, closeSync, fstatSync, openSync, readdirSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backupRoot = '/var/www/veele/production/shared/preflight-backups';
const maximumBytes = 1024 * 1024;
const codes = ['ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY', 'ERR_PNPM_OUTDATED_LOCKFILE',
  'ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND', 'ERR_PNPM_VERIFY_DEPS_BEFORE_RUN',
  'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'];
const knownSqlStates = new Set(['42501', '42P01', '42704', '42883', '42P07', '42710', '42701',
  '23502', '23503', '23505', '23514', '25001', '25P02', '28000', '28P01', '3D000', '3F000',
  '0A000', '42601', '42703', '42804', '42809', '55000', '57014', '58P01', 'P0001', 'XX000',
  '08001', '08003', '08006', '53300', '53400', '54000']);
const categories = {
  generatedMigrationStarted: /\[db:migrate\] Applying Drizzle generated migrations\./u,
  migrationComplete: /\[db:migrate\] Complete\./u,
  permissionDenied: /permission denied/iu,
  missingRelation: /relation [^\r\n]{1,180} does not exist/iu,
  missingRole: /role [^\r\n]{1,100} does not exist/iu,
  missingFunction: /function [^\r\n]{1,240} does not exist/iu,
  missingExtension: /extension [^\r\n]{1,100} is not available/iu,
  alreadyExists: /already exists/iu,
  unsupportedTransaction: /transaction control|managed migration transaction/iu,
  hostedPolicyDrift: /tenant_management_legacy_policy_consumer_drift|hosted.policy.*(?:unknown|mismatch|drift)/iu,
};

// Return only fixed categories, standard error codes and names present in the
// reviewed migration manifest. Never return a log line, SQL text or stack trace.
export function classifyPrivateLog(contents, migrationNames = []) {
  const known = new Set(migrationNames);
  const applied = [...contents.matchAll(/\[db:migrate\] SQL (?:applying|applied|skipped): ([0-9]{14}_[a-z0-9_]+\.sql)/gu)]
    .map(match => match[1]).filter(name => known.has(name));
  const sqlStates = [...new Set([...contents.matchAll(/\bcode:\s*['"]([0-9A-Z]{5})['"]/gu)].map(match => match[1]).filter(code => knownSqlStates.has(code)))].slice(-10);
  return { categories: Object.fromEntries(Object.entries(categories).map(([name, pattern]) => [name, pattern.test(contents)])),
    processCodes: codes.filter(code => contents.includes(code)), sqlStates,
    lastKnownMigration: applied.at(-1) ?? null };
}

export function readPrivateLogDiagnostics(file, migrationNames = []) {
  let fd;
  try {
    if (realpathSync(path.dirname(file)) !== path.resolve(path.dirname(file))) throw new Error('Invalid private directory');
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fd);
    if (!before.isFile() || (before.mode & 0o7777) !== 0o600) throw new Error('Invalid private file');
    const bytes = Buffer.alloc(Math.min(before.size, maximumBytes));
    const count = readSync(fd, bytes, 0, bytes.length, Math.max(0, before.size - bytes.length));
    const after = fstatSync(fd);
    if (count !== bytes.length || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Private log changed');
    return { status: 'available', tailTruncated: before.size > maximumBytes, ...classifyPrivateLog(bytes.toString('utf8'), migrationNames) };
  } finally { if (fd !== undefined) closeSync(fd); }
}

export function diagnosePrivateRun(runId, { root = backupRoot, migrationDirectory = fileURLToPath(new URL('../lib/db/migrations/', import.meta.url)) } = {}) {
  if (!/^[1-9][0-9]{0,19}$/u.test(runId ?? '') || realpathSync(root) !== path.resolve(root)) throw new Error('Invalid private run');
  const pattern = new RegExp(`^[a-f0-9]{12}-${runId}-[a-zA-Z0-9]{6}$`, 'u');
  const entries = readdirSync(root, { withFileTypes: true }).filter(entry => pattern.test(entry.name) && entry.isDirectory());
  if (entries.length !== 1) throw new Error('Private run is missing or ambiguous');
  const migrations = readdirSync(migrationDirectory).filter(name => /^[0-9]{14}_[a-z0-9_]+\.sql$/u.test(name));
  return { version: 1, runId, ...readPrivateLogDiagnostics(path.join(root, entries[0].name, 'private-operations.log'), migrations) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.env.GITHUB_REPOSITORY !== 'veele-services/platform' || process.env.GITHUB_REF !== 'refs/heads/main'
        || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.argv.length !== 4 || process.argv[2] !== '--run-id') throw new Error('Invalid dispatch');
    console.log(JSON.stringify(diagnosePrivateRun(process.argv[3]), null, 2));
  } catch { console.error('Private diagnostics unavailable; raw logs and credentials remain private.'); process.exitCode = 1; }
}

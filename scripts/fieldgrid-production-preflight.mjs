#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseNodePostgresSslConfig, SUPABASE_ROOT_2021_CA_SHA256 } from "./fieldgrid-database-root-cert.mjs";
import {
  BACKUP_SCHEMAS,
  DURABLE_MIGRATION_RELATIONS,
  assertMatchingMigrationHistory,
  assertRecordedHistoricalMigrationHashes,
  committedMigrationManifest,
  ensurePostgresRuntime,
  parsePostgresEnv,
  startRestoreTarget,
  stopRestoreTarget,
} from "./fieldgrid-phase2e-staging-preflight.mjs";

export const PRODUCTION_PROJECT_REF = "ckdtiuemeygrnujjibnw";
export const PRODUCTION_PREFLIGHT_CONFIRMATION = "production-backup-rehearsal-only-v1";
export const PRODUCTION_BACKUP_ROOT = "/var/www/veele/production/shared/preflight-backups";
const root = fileURLToPath(new URL("..", import.meta.url));
const shaPattern = /^[a-f0-9]{40}$/u;
const identifierPattern = /^[a-z_][a-z0-9_]{0,62}$/u;

function fail(code) { throw Object.assign(new Error(code), { safeCode: code }); }
function identifier(value) {
  if (!identifierPattern.test(value)) fail("UNSUPPORTED_METADATA_IDENTIFIER");
  return `"${value}"`;
}
function qualifiedName(value) {
  const parts = value.split(".");
  if (parts.length !== 2 || !BACKUP_SCHEMAS.includes(parts[0])) fail("INVALID_RELATION_SCOPE");
  return parts.map(identifier).join(".");
}

export function validateProductionPreflightConfig(env) {
  const expectedSha = env.EXPECTED_MAIN_SHA;
  if (!shaPattern.test(expectedSha ?? "") || env.GITHUB_SHA !== expectedSha
      || env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "veele-services/platform"
      || env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_EVENT_NAME !== "workflow_dispatch"
      || env.APP_ENV !== "production" || env.TARGET_ENVIRONMENT !== "production"
      || env.FIELDGRID_PRODUCTION_PREFLIGHT_CONFIRM !== PRODUCTION_PREFLIGHT_CONFIRMATION
      || !env.GITHUB_TOKEN || !/^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ID ?? "")) {
    fail("INVALID_PRODUCTION_DISPATCH");
  }
  let url;
  try { url = new URL(env.FIELDGRID_MIGRATION_DATABASE_URL); } catch { fail("INVALID_PRODUCTION_DATABASE"); }
  const direct = url.hostname === `db.${PRODUCTION_PROJECT_REF}.supabase.co` && url.username === "postgres";
  const pooler = /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/u.test(url.hostname)
    && decodeURIComponent(url.username) === `postgres.${PRODUCTION_PROJECT_REF}`;
  if ((!direct && !pooler) || !["postgres:", "postgresql:"].includes(url.protocol)
      || url.port !== "5432" || url.pathname !== "/postgres" || !url.password
      || url.search || url.hash || /[\r\n]/u.test(decodeURIComponent(url.password))) {
    fail("INVALID_PRODUCTION_DATABASE");
  }
  return { expectedSha, connectionString: url.toString() };
}

export function localProcessEnvironment(env) {
  const allowed = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR", "LD_LIBRARY_PATH",
    "PNPM_HOME", "COREPACK_HOME", "XDG_CACHE_HOME", "FIELDGRID_POSTGRESQL_BINDIR", "FIELDGRID_POSTGRESQL_SHAREDIR"];
  return Object.fromEntries(allowed.filter(name => typeof env[name] === "string").map(name => [name, env[name]]));
}

export function assertLocalRestoreTarget(target) {
  if (target?.pgEnv?.PGHOST !== "127.0.0.1" || target.pgEnv.PGUSER !== "postgres"
      || target.pgEnv.PGSSLMODE !== "disable" || !/^[a-f0-9]{64}$/u.test(target.pgEnv.PGPASSWORD ?? "")
      || !Number.isInteger(target.port) || target.port < 1024 || target.port > 65535
      || target.pgEnv.PGPORT !== String(target.port)
      || target.database !== "fieldgrid_phase2e_staging_copy" || target.pgEnv.PGDATABASE !== target.database) {
    fail("RESTORE_TARGET_NOT_ISOLATED");
  }
}

export function migrationEnvironment(target, env) {
  assertLocalRestoreTarget(target);
  const localUrl = `postgresql://postgres:${target.pgEnv.PGPASSWORD}@127.0.0.1:${target.port}/${target.database}`;
  return { ...localProcessEnvironment(env), APP_ENV: "local", TARGET_ENVIRONMENT: "local",
    DATABASE_URL: localUrl, FIELDGRID_MIGRATION_DATABASE_URL: localUrl,
    DB_SSL: "false", PGSSLMODE: "disable" };
}

async function withEnvironment(env, callback) {
  const previous = process.env;
  process.env = env;
  try { return await callback(); } finally { process.env = previous; }
}

async function createClient(config) {
  const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
  const { Client } = require("pg");
  return new Client({ ...config, connectionTimeoutMillis: 15000 });
}

async function verifySource(config, env) {
  const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (actual !== config.expectedSha) fail("CHECKOUT_SHA_MISMATCH");
  const response = await fetch("https://api.github.com/repos/veele-services/platform/git/ref/heads/main", {
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || (await response.json()).object?.sha !== config.expectedSha) fail("MAIN_SHA_MISMATCH");
}

export async function runPrivateCommand(command, args, options) {
  const log = await open(options.logPath, "a", 0o600);
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: root, env: options.env, shell: false,
        detached: process.platform !== "win32", stdio: ["ignore", log.fd, log.fd] });
      const timer = setTimeout(() => {
        try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); }
        catch { child.kill("SIGKILL"); }
      }, options.timeoutMs ?? 15 * 60 * 1000);
      child.once("error", () => { clearTimeout(timer); reject(Object.assign(new Error("PRIVATE_COMMAND_FAILED"), { safeCode: "PRIVATE_COMMAND_FAILED" })); });
      child.once("close", code => { clearTimeout(timer); resolve({ code }); });
    });
    if (result.code !== 0 && !options.allowFailure) fail("PRIVATE_COMMAND_FAILED");
    return result;
  } finally { await log.close(); }
}

export async function fingerprintBackup(file) {
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size === 0 || (metadata.mode & 0o077) !== 0) fail("INVALID_PRIVATE_BACKUP");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { sizeBytes: metadata.size, sha256: hash.digest("hex") };
}

export async function verifyBackupFingerprint(file, expected) {
  const actual = await fingerprintBackup(file);
  if (actual.sizeBytes !== expected.sizeBytes || actual.sha256 !== expected.sha256) fail("BACKUP_HASH_MISMATCH");
}

export async function captureDatabaseMetadata(client) {
  const schemas = (await client.query("SELECT nspname FROM pg_namespace WHERE nspname = ANY($1::text[]) ORDER BY nspname", [BACKUP_SCHEMAS])).rows.map(row => row.nspname);
  if (!schemas.includes("public") || schemas.some(name => !BACKUP_SCHEMAS.includes(name))) fail("INVALID_SOURCE_SCHEMAS");
  const tables = (await client.query(`SELECT n.nspname AS schema, c.relname AS name FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname = ANY($1::text[])
    AND c.relkind IN ('r','p') ORDER BY n.nspname,c.relname`, [schemas])).rows;
  if (tables.length > 2000) fail("SOURCE_METADATA_LIMIT");
  const counts = {};
  for (const table of tables) {
    const name = `${table.schema}.${table.name}`;
    const count = Number((await client.query(`SELECT count(*)::text AS count FROM ${qualifiedName(name)}`)).rows[0].count);
    if (!Number.isSafeInteger(count) || count < 0) fail("INVALID_ROW_COUNT");
    counts[name] = count;
  }
  const sqlHistory = Object.hasOwn(counts, "drizzle.veele_sql_migrations")
    ? (await client.query("SELECT name, hash, baselined, applied_at AS \"appliedAt\" FROM drizzle.veele_sql_migrations ORDER BY applied_at,name")).rows.map(row => ({ ...row, appliedAt: new Date(row.appliedAt).toISOString() })) : [];
  const drizzleHistory = Object.hasOwn(counts, "drizzle.__drizzle_migrations")
    ? (await client.query("SELECT hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id")).rows : [];
  if (sqlHistory.length > 2000 || drizzleHistory.length > 2000) fail("SOURCE_METADATA_LIMIT");
  assertRecordedHistoricalMigrationHashes(sqlHistory);
  const publication = (await client.query("SELECT puballtables, pubinsert, pubupdate, pubdelete, pubtruncate FROM pg_publication WHERE pubname='supabase_realtime'")).rows[0] ?? null;
  const publicationTables = publication ? (await client.query("SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY schemaname,tablename")).rows : [];
  if (publicationTables.length > 2000) fail("SOURCE_METADATA_LIMIT");
  for (const table of publicationTables) {
    qualifiedName(`${table.schemaname}.${table.tablename}`);
    if (!Object.hasOwn(counts, `${table.schemaname}.${table.tablename}`)) fail("PUBLICATION_OUTSIDE_BACKUP");
  }
  const unsupported = Number((await client.query(`SELECT
    (SELECT count(*) FROM pg_publication_rel r JOIN pg_publication p ON p.oid=r.prpubid
      WHERE p.pubname='supabase_realtime' AND (r.prattrs IS NOT NULL OR r.prqual IS NOT NULL))
    + (SELECT count(*) FROM pg_publication_namespace n JOIN pg_publication p ON p.oid=n.pnpubid
      WHERE p.pubname='supabase_realtime') AS count`)).rows[0].count);
  if (unsupported !== 0) fail("UNSUPPORTED_PUBLICATION_FILTER");
  return { schemas, counts, sqlHistory, drizzleHistory, publication, publicationTables };
}

export function assertRestoredMetadata(source, restored) {
  try { assert.deepEqual(restored, source); } catch { fail("RESTORE_METADATA_MISMATCH"); }
}

async function restorePublication(client, metadata) {
  await client.query("DROP PUBLICATION IF EXISTS supabase_realtime");
  if (!metadata.publication) return;
  const flags = metadata.publication;
  const operations = ["insert", "update", "delete", "truncate"].filter(name => flags[`pub${name}`]);
  const scope = flags.puballtables ? " FOR ALL TABLES" : metadata.publicationTables.length
    ? ` FOR TABLE ${metadata.publicationTables.map(row => qualifiedName(`${row.schemaname}.${row.tablename}`)).join(", ")}` : "";
  await client.query(`CREATE PUBLICATION supabase_realtime${scope} WITH (publish = '${operations.join(", ")}')`);
}

async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (await realpath(directory) !== path.resolve(directory)) fail("PRIVATE_PATH_NOT_CANONICAL");
  await chmod(directory, 0o700);
}

export async function runProductionPreflight(options = {}, env = process.env, dependencies = {}) {
  const services = { createClient, verifySource, command: runPrivateCommand, capture: captureDatabaseMetadata,
    ensureRuntime: ensurePostgresRuntime, startTarget: startRestoreTarget, stopTarget: stopRestoreTarget,
    manifest: committedMigrationManifest, ...dependencies };
  const evidence = { version: 1, environment: "production", sourceSha: null, status: "fail", errorCode: null,
    phases: {}, liveSchemaMutated: false, secretsRecorded: false, backupUploaded: false,
    permissionCompatibilityProven: false, startedAt: new Date().toISOString() };
  let source, local, target, tempDir, logPath, backupDir;
  let phase = "configuration";
  const localEnv = localProcessEnvironment(env);
  const enter = name => { phase = name; evidence.phases[name] = "running"; };
  const pass = () => { evidence.phases[phase] = "pass"; };
  const privateRoot = dependencies.backupRoot ?? PRODUCTION_BACKUP_ROOT;
  try {
    enter("configuration");
    const config = validateProductionPreflightConfig(env);
    evidence.sourceSha = config.expectedSha;
    const ssl = databaseNodePostgresSslConfig(env);
    const sourcePgEnv = parsePostgresEnv(config.connectionString, "FIELDGRID_MIGRATION_DATABASE_URL", env);
    await services.verifySource(config, env);
    pass();
    enter("runtime");
    await withEnvironment(localEnv, () => services.ensureRuntime(localEnv));
    await privateDirectory(privateRoot);
    backupDir = await mkdtemp(path.join(privateRoot, `${config.expectedSha.slice(0, 12)}-${env.GITHUB_RUN_ID}-`));
    await chmod(backupDir, 0o700);
    logPath = path.join(backupDir, "private-operations.log");
    const backupPath = path.join(backupDir, "production.dump");
    // Create privately before pg_dump opens it; never rely on the runner umask.
    await writeFile(backupPath, "", { mode: 0o600, flag: "wx" });
    tempDir = await mkdtemp(path.join(tmpdir(), "fieldgrid-production-preflight-"));
    await chmod(tempDir, 0o700);
    pass();
    enter("source_snapshot");
    source = await services.createClient({ connectionString: config.connectionString, ssl,
      options: "-c default_transaction_read_only=on" });
    await source.connect();
    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await source.query("SET LOCAL statement_timeout = '30s'");
    await source.query("SET LOCAL idle_in_transaction_session_timeout = '20min'");
    await source.query("SET LOCAL search_path = pg_catalog");
    await source.query("SET LOCAL row_security = off");
    const major = Math.floor(Number((await source.query("SHOW server_version_num")).rows[0].server_version_num) / 10000);
    if (![15, 16, 17].includes(major)) fail("UNSUPPORTED_SOURCE_POSTGRES");
    const snapshot = (await source.query("SELECT pg_export_snapshot() AS snapshot")).rows[0].snapshot;
    if (!/^[0-9a-f-]{1,128}$/iu.test(snapshot ?? "")) fail("INVALID_EXPORTED_SNAPSHOT");
    const metadata = await services.capture(source);
    pass();
    enter("backup");
    await services.command("pg_dump", ["--format=custom", "--compress=6", "--large-objects",
      "--no-publications", "--no-subscriptions", "--strict-names", "--lock-wait-timeout=30s", "--snapshot", snapshot,
      ...metadata.schemas.flatMap(schema => ["--schema", schema]), "--file", backupPath],
    { env: { ...localEnv, ...sourcePgEnv, PGOPTIONS: "-c default_transaction_read_only=on", PGCONNECT_TIMEOUT: "15" }, logPath });
    const fingerprint = await fingerprintBackup(backupPath);
    // The snapshot's publication data accompanies the dump privately.
    const metadataPath = path.join(backupDir, "metadata.json");
    await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`, { mode: 0o600, flag: "wx" });
    const metadataFingerprint = await fingerprintBackup(metadataPath);
    await services.command("pg_restore", ["--list", backupPath], { env: localEnv, logPath });
    await source.query("ROLLBACK");
    await source.end(); source = null;
    evidence.backup = { name: `${path.basename(backupDir)}/production.dump`, ...fingerprint,
      schemas: metadata.schemas, metadataSha256: metadataFingerprint.sha256,
      tlsCertificateSha256: SUPABASE_ROOT_2021_CA_SHA256, sourcePostgresMajor: major };
    pass();
    enter("restore");
    target = await withEnvironment(localEnv, () => services.startTarget(tempDir));
    assertLocalRestoreTarget(target);
    if (target.dataDir !== path.join(tempDir, "restore-data")) fail("RESTORE_TARGET_NOT_ISOLATED");
    await verifyBackupFingerprint(backupPath, fingerprint);
    await verifyBackupFingerprint(metadataPath, metadataFingerprint);
    const restoreEnv = { ...localEnv, ...target.pgEnv };
    await services.command("pg_restore", ["--exit-on-error", "--no-owner", "--dbname", target.database, backupPath], { env: restoreEnv, logPath });
    local = await services.createClient({ host: "127.0.0.1", port: target.port, user: "postgres",
      password: target.pgEnv.PGPASSWORD, database: target.database, ssl: false });
    await local.connect();
    await local.query("SET statement_timeout = '30s'");
    await local.query("SET search_path = pg_catalog");
    await restorePublication(local, metadata);
    const restored = await services.capture(local);
    assertRestoredMetadata(metadata, restored);
    evidence.restore = { isolated: true, allSourceCountsMatched: true, allSourceHistoryMatched: true,
      relationCount: Object.keys(metadata.counts).length, ownerMapping: "local-superuser" };
    pass();
    enter("migration");
    if (Object.keys(metadata.counts).some(name => name.startsWith("public.")) && metadata.drizzleHistory.length === 0) {
      fail("LEGACY_SCHEMA_REQUIRES_REVIEW");
    }
    const migrationEnv = migrationEnvironment(target, localEnv);
    await services.command("pnpm", ["--filter", "@workspace/db", "run", "db:migrate"], { env: migrationEnv, logPath });
    const migrated = await services.capture(local);
    assertMatchingMigrationHistory(migrated.sqlHistory, await services.manifest());
    for (const name of DURABLE_MIGRATION_RELATIONS) {
      if (Object.hasOwn(metadata.counts, name)
          && (!Object.hasOwn(migrated.counts, name) || migrated.counts[name] < metadata.counts[name])) fail("DURABLE_ROW_COUNT_DECREASED");
    }
    pass();
    enter("idempotence");
    await services.command("pnpm", ["--filter", "@workspace/db", "run", "db:migrate"], { env: migrationEnv, logPath });
    assertRestoredMetadata(migrated, await services.capture(local));
    evidence.migration = { completeHistory: true, durableCountsDidNotDecrease: true, repeatRunUnchanged: true };
    pass();
    evidence.status = "pass";
  } catch (error) {
    evidence.phases[phase] = "fail";
    evidence.errorCode = /^[A-Z_]{1,80}$/u.test(error?.safeCode ?? "") ? error.safeCode : "PREFLIGHT_PHASE_FAILED";
  } finally {
    enter("cleanup");
    let cleanupSucceeded = true;
    for (const client of [source, local]) {
      if (!client) continue;
      try { await client.query("ROLLBACK"); } catch { /* End still releases the connection. */ }
      try { await client.end(); } catch { cleanupSucceeded = false; }
    }
    const localDataDir = tempDir ? path.join(tempDir, "restore-data") : null;
    const partialTarget = localDataDir && (existsSync(localDataDir) || target?.dataDir === localDataDir)
      ? { dataDir: localDataDir } : null;
    if (partialTarget) {
      try {
        await withEnvironment(localEnv, () => services.stopTarget(partialTarget));
        const status = await services.command("pg_ctl", ["--pgdata", partialTarget.dataDir, "status"],
          { env: localEnv, logPath, allowFailure: true, timeoutMs: 15000 });
        if (status.code !== 3 && status.code !== 4) cleanupSucceeded = false;
      } catch { cleanupSucceeded = false; }
    }
    if (tempDir && cleanupSucceeded) {
      try { await rm(tempDir, { recursive: true, force: true }); } catch { cleanupSucceeded = false; }
    }
    evidence.phases.cleanup = cleanupSucceeded ? "pass" : "fail";
    evidence.localRestoreDisposed = cleanupSucceeded;
    if (!cleanupSucceeded) { evidence.status = "fail"; evidence.errorCode = "CLEANUP_FAILED"; }
    evidence.finishedAt = new Date().toISOString();
    const outDir = path.resolve(options.outDir ?? path.join(root, "artifacts/production-preflight"));
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "report.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  }
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== "--run") {
    process.stderr.write("Usage: node scripts/fieldgrid-production-preflight.mjs --run\n");
    process.exitCode = 1;
  } else runProductionPreflight().then(report => {
    process.stdout.write(`Production preflight: ${report.status}${report.errorCode ? ` (${report.errorCode})` : ""}\n`);
    if (report.status !== "pass") process.exitCode = 1;
  }).catch(() => {
    process.stderr.write("Production preflight failed without publishing private diagnostics.\n");
    process.exitCode = 1;
  });
}

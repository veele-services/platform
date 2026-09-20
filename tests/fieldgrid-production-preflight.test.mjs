import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SUPABASE_ROOT_2021_CA_PEM } from "./fixtures/fieldgrid-supabase-root-2021-ca.mjs";
import {
  PRODUCTION_PREFLIGHT_CONFIRMATION,
  PRODUCTION_PROJECT_REF,
  assertLocalRestoreTarget,
  assertRestoredMetadata,
  captureDatabaseMetadata,
  fingerprintBackup,
  localProcessEnvironment,
  migrationEnvironment,
  runPrivateCommand,
  runProductionPreflight,
  validateProductionPreflightConfig,
  verifyBackupFingerprint,
} from "../scripts/fieldgrid-production-preflight.mjs";

const sourcePassword = "source-password-never-publish";
const githubToken = "github-token-never-publish";
const localPassword = "b".repeat(64);
const expectedSha = "a".repeat(40);
const sourceUrl = `postgresql://postgres:${sourcePassword}@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`;

function environment(overrides = {}) {
  return {
    PATH: process.env.PATH,
    EXPECTED_MAIN_SHA: expectedSha,
    GITHUB_SHA: expectedSha,
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "veele-services/platform",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_RUN_ID: "12345",
    GITHUB_TOKEN: githubToken,
    APP_ENV: "production",
    TARGET_ENVIRONMENT: "production",
    FIELDGRID_PRODUCTION_PREFLIGHT_CONFIRM: PRODUCTION_PREFLIGHT_CONFIRMATION,
    FIELDGRID_MIGRATION_DATABASE_URL: sourceUrl,
    PGSSLMODE: "verify-full",
    DB_SSL: "true",
    DB_SSL_REJECT_UNAUTHORIZED: "true",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-never-publish",
    ...overrides,
  };
}

function restoreTarget(directory = "/tmp/isolated-preflight") {
  return {
    dataDir: path.join(directory, "restore-data"),
    port: 15432,
    database: "fieldgrid_phase2e_staging_copy",
    pgEnv: {
      PGHOST: "127.0.0.1", PGPORT: "15432", PGUSER: "postgres",
      PGPASSWORD: localPassword, PGDATABASE: "fieldgrid_phase2e_staging_copy", PGSSLMODE: "disable",
    },
  };
}

// A new hosted Supabase project has platform tables, but no application schema/history.
function emptyHostedMetadata() {
  return {
    schemas: ["auth", "public", "storage"],
    counts: { "auth.users": 0, "storage.buckets": 0, "storage.objects": 0 },
    sqlHistory: [], drizzleHistory: [],
    publication: { puballtables: false, pubinsert: true, pubupdate: true, pubdelete: true, pubtruncate: true },
    publicationTables: [],
  };
}

function migratedMetadata() {
  const metadata = emptyHostedMetadata();
  metadata.schemas = ["auth", "drizzle", "public", "storage"];
  metadata.counts["public.tenants"] = 0;
  metadata.sqlHistory = [{ name: "20260920120000_test.sql", hash: "c".repeat(64), baselined: false, appliedAt: "2026-09-20T12:00:00.000Z" }];
  metadata.drizzleHistory = [{ hash: "d".repeat(64), created_at: "1" }];
  return metadata;
}

test("production dispatch accepts only pinned main and the production direct/session endpoint", () => {
  assert.equal(validateProductionPreflightConfig(environment()).connectionString, sourceUrl);
  const pooler = `postgresql://postgres.${PRODUCTION_PROJECT_REF}:${sourcePassword}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
  assert.equal(validateProductionPreflightConfig(environment({ FIELDGRID_MIGRATION_DATABASE_URL: pooler })).connectionString, pooler);
  for (const overrides of [
    { EXPECTED_MAIN_SHA: "main" }, { GITHUB_SHA: "f".repeat(40) }, { GITHUB_ACTIONS: "false" },
    { GITHUB_REPOSITORY: "untrusted/fork" }, { GITHUB_REF: "refs/heads/staging" },
    { GITHUB_EVENT_NAME: "pull_request" }, { GITHUB_TOKEN: "" }, { GITHUB_RUN_ID: "0" },
    { APP_ENV: "staging" }, { TARGET_ENVIRONMENT: "local" }, { FIELDGRID_PRODUCTION_PREFLIGHT_CONFIRM: "yes" },
  ]) {
    assert.throws(() => validateProductionPreflightConfig(environment(overrides)), { safeCode: "INVALID_PRODUCTION_DISPATCH" });
  }
  for (const url of [
    sourceUrl.replace(PRODUCTION_PROJECT_REF, "anotherproject"),
    pooler.replace(`postgres.${PRODUCTION_PROJECT_REF}`, "postgres.anotherproject"),
    sourceUrl.replace(":5432/", ":6543/"), sourceUrl.replace("/postgres", "/template1"),
    sourceUrl.replace("postgresql:", "https:"), sourceUrl.replace(sourcePassword, ""),
    `${sourceUrl}?sslmode=disable`, `${sourceUrl}#override`, sourceUrl.replace(sourcePassword, encodeURIComponent(`${sourcePassword}\n`)),
    sourceUrl.replace(".supabase.co", ".supabase.co.evil.example"),
  ]) {
    assert.throws(() => validateProductionPreflightConfig(environment({ FIELDGRID_MIGRATION_DATABASE_URL: url })), { safeCode: "INVALID_PRODUCTION_DATABASE" });
  }
});

test("local migration environment strips live credentials and rejects nonlocal restore targets", () => {
  const env = environment({ DATABASE_URL: sourceUrl, PGHOST: "production", PGPASSWORD: sourcePassword, NODE_OPTIONS: "--require=untrusted" });
  assert.deepEqual(localProcessEnvironment(env), { PATH: process.env.PATH });
  const migration = migrationEnvironment(restoreTarget(), env);
  assert.equal(migration.APP_ENV, "local");
  assert.equal(migration.PGSSLMODE, "disable");
  assert.equal(migration.DB_SSL, "false");
  assert.equal(migration.DATABASE_URL, migration.FIELDGRID_MIGRATION_DATABASE_URL);
  assert.equal(new URL(migration.DATABASE_URL).hostname, "127.0.0.1");
  assert.equal(new URL(migration.DATABASE_URL).password, localPassword);
  for (const secret of [sourcePassword, githubToken, "service-role-never-publish", "NODE_OPTIONS"]) {
    assert.ok(!JSON.stringify(migration).includes(secret));
  }
  for (const mutate of [
    target => { target.pgEnv.PGHOST = "localhost"; },
    target => { target.pgEnv.PGHOST = `db.${PRODUCTION_PROJECT_REF}.supabase.co`; },
    target => { target.pgEnv.PGUSER = "authenticated"; },
    target => { target.pgEnv.PGSSLMODE = "require"; },
    target => { target.pgEnv.PGPASSWORD = localPassword.slice(0, 5); },
    target => { target.pgEnv.PGPORT = "5432"; },
    target => { target.port = 80; target.pgEnv.PGPORT = "80"; },
    target => { target.database = "postgres"; target.pgEnv.PGDATABASE = "postgres"; },
  ]) {
    const target = restoreTarget(); mutate(target);
    assert.throws(() => assertLocalRestoreTarget(target), { safeCode: "RESTORE_TARGET_NOT_ISOLATED" });
  }
});

test("backup proof requires a nonempty private regular file and detects tampering", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "fieldgrid-production-backup-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "production.dump");
  await writeFile(file, "private snapshot", { mode: 0o600 });
  const fingerprint = await fingerprintBackup(file);
  assert.deepEqual(fingerprint, { sizeBytes: 16, sha256: createHash("sha256").update("private snapshot").digest("hex") });
  await verifyBackupFingerprint(file, fingerprint);
  await writeFile(file, "changed snapshot");
  await assert.rejects(verifyBackupFingerprint(file, fingerprint), { safeCode: "BACKUP_HASH_MISMATCH" });
  await chmod(file, 0o644);
  await assert.rejects(fingerprintBackup(file), { safeCode: "INVALID_PRIVATE_BACKUP" });
  await chmod(file, 0o600);
  const link = path.join(directory, "link.dump");
  await symlink(file, link);
  await assert.rejects(fingerprintBackup(link), { safeCode: "INVALID_PRIVATE_BACKUP" });
  await writeFile(file, "");
  await assert.rejects(fingerprintBackup(file), { safeCode: "INVALID_PRIVATE_BACKUP" });
  await assert.rejects(fingerprintBackup(directory), { safeCode: "INVALID_PRIVATE_BACKUP" });
});

test("failing subprocess output stays in a private log and never becomes the thrown message", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "fieldgrid-production-private-command-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const logPath = path.join(directory, "operations.log");
  let failure;
  try {
    await runPrivateCommand(process.execPath, ["-e", "process.stderr.write(process.env.TEST_PRIVATE_VALUE); process.exit(7)"], {
      env: { TEST_PRIVATE_VALUE: sourcePassword }, logPath, timeoutMs: 5000,
    });
  } catch (error) { failure = error; }
  assert.equal(failure?.safeCode, "PRIVATE_COMMAND_FAILED");
  assert.ok(!String(failure).includes(sourcePassword));
  assert.equal(await readFile(logPath, "utf8"), sourcePassword);
  assert.equal((await lstat(logPath)).mode & 0o777, 0o600);
});

test("restore proof includes schemas, every table count, both histories and publication flags", () => {
  const original = migratedMetadata();
  assertRestoredMetadata(original, structuredClone(original));
  for (const mutate of [
    metadata => { metadata.schemas.pop(); }, metadata => { metadata.counts["auth.users"] = 1; },
    metadata => { delete metadata.counts["storage.objects"]; },
    metadata => { metadata.sqlHistory[0].hash = "e".repeat(64); },
    metadata => { metadata.drizzleHistory[0].created_at = "2"; },
    metadata => { metadata.publication.pubdelete = false; },
    metadata => { metadata.publicationTables.push({ schemaname: "public", tablename: "tenants" }); },
  ]) {
    const altered = structuredClone(original); mutate(altered);
    assert.throws(() => assertRestoredMetadata(original, altered), { safeCode: "RESTORE_METADATA_MISMATCH" });
  }
});

function metadataClient({ schemas = ["auth", "public", "storage"], tables = [{ schema: "auth", name: "users" }], count = "0", publicationTables = [], unsupported = "0" } = {}) {
  const queries = [];
  return { queries, async query(sql, params) {
    queries.push({ sql, params });
    if (sql.startsWith("SELECT nspname")) return { rows: schemas.map(nspname => ({ nspname })) };
    if (sql.startsWith("SELECT n.nspname")) return { rows: tables };
    if (sql.startsWith("SELECT count(*)")) return { rows: [{ count }] };
    if (sql.startsWith("SELECT puballtables")) return { rows: [emptyHostedMetadata().publication] };
    if (sql.startsWith("SELECT schemaname")) return { rows: publicationTables };
    if (sql.includes("pg_publication_rel")) return { rows: [{ count: unsupported }] };
    assert.fail(`Unexpected metadata query: ${sql}`);
  } };
}

test("metadata capture handles a new hosted project without Drizzle history", async () => {
  const client = metadataClient();
  const metadata = await captureDatabaseMetadata(client);
  assert.deepEqual(metadata.counts, { "auth.users": 0 });
  assert.deepEqual(metadata.sqlHistory, []);
  assert.deepEqual(metadata.drizzleHistory, []);
  assert.ok(client.queries.some(query => query.sql === 'SELECT count(*)::text AS count FROM "auth"."users"'));
  assert.ok(client.queries.every(query => query.sql.startsWith("SELECT")));
});

test("metadata capture rejects unsafe identifiers, unbacked publications and invalid counts", async () => {
  for (const [options, safeCode] of [
    [{ schemas: ["auth"] }, "INVALID_SOURCE_SCHEMAS"],
    [{ tables: [{ schema: "auth", name: 'users";DROP TABLE tenants;--' }] }, "UNSUPPORTED_METADATA_IDENTIFIER"],
    [{ tables: [{ schema: "private", name: "secrets" }] }, "INVALID_RELATION_SCOPE"],
    [{ count: "9007199254740992" }, "INVALID_ROW_COUNT"], [{ count: "-1" }, "INVALID_ROW_COUNT"],
    [{ publicationTables: [{ schemaname: "public", tablename: "missing" }] }, "PUBLICATION_OUTSIDE_BACKUP"],
    [{ unsupported: "1" }, "UNSUPPORTED_PUBLICATION_FILTER"],
    [{ tables: Array.from({ length: 2001 }, () => ({ schema: "auth", name: "users" })) }, "SOURCE_METADATA_LIMIT"],
  ]) await assert.rejects(captureDatabaseMetadata(metadataClient(options)), { safeCode });
});

async function harness(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "fieldgrid-production-preflight-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const certificate = path.join(directory, "root.crt");
  await writeFile(certificate, SUPABASE_ROOT_2021_CA_PEM, { mode: 0o600 });
  const events = []; const commands = []; const clientConfigurations = [];
  const initial = options.initial ?? emptyHostedMetadata();
  const migrated = options.migrated ?? migratedMetadata();
  let captures = 0; let target; let dumpPath;
  const source = { async connect() { events.push("source.connect"); }, async query(sql) {
    events.push(`source:${sql}`);
    if (sql === "SHOW server_version_num") return { rows: [{ server_version_num: "170004" }] };
    if (sql.includes("pg_export_snapshot")) return { rows: [{ snapshot: "00000003-0000001B-1" }] };
    return { rows: [] };
  }, async end() { events.push("source.end"); } };
  const local = { async connect() { events.push("local.connect"); }, async query(sql) {
    events.push(`local:${sql}`); return { rows: [] };
  }, async end() { events.push("local.end"); } };
  const dependencies = {
    backupRoot: path.join(directory, "backups"),
    async verifySource() { events.push("verifySource"); },
    async ensureRuntime() { events.push("ensureRuntime"); assert.equal(process.env.GITHUB_TOKEN, undefined); },
    async createClient(config) { clientConfigurations.push(config); return config.connectionString ? source : local; },
    async capture(client) {
      events.push(client === source ? "capture.source" : "capture.local");
      const result = captures++ < 2 ? initial : migrated;
      return structuredClone(options.metadataAt?.(captures, result) ?? result);
    },
    async manifest() { return ["20260920120000_test.sql"]; },
    async startTarget(tempDirectory) {
      events.push("startTarget"); target = restoreTarget(tempDirectory);
      t.after(() => rm(tempDirectory, { recursive: true, force: true }));
      await mkdir(target.dataDir);
      if (options.tamperBackup) await writeFile(dumpPath, "tampered backup");
      if (options.partialStartFailure) throw new Error(`cannot start: ${sourcePassword}`);
      return target;
    },
    async stopTarget() { events.push("stopTarget"); },
    async command(command, args, commandOptions) {
      commands.push({ command, args, options: commandOptions });
      const name = command === "pg_restore" ? (args.includes("--list") ? "list" : "restore") : command;
      events.push(`command:${name}`);
      if (command === "pg_dump") {
        dumpPath = args[args.indexOf("--file") + 1];
        assert.equal((await lstat(dumpPath)).mode & 0o777, 0o600);
        await writeFile(dumpPath, "private production snapshot");
      }
      if (options.failCommand === name) throw new Error(`command failed with ${sourcePassword} ${githubToken}`);
      return { code: command === "pg_ctl" ? options.cleanupStatus ?? 3 : 0 };
    },
  };
  const env = environment({ FIELDGRID_DATABASE_SSL_ROOT_CERT: certificate, ...options.environment });
  const report = await runProductionPreflight({ outDir: path.join(directory, "evidence") }, env, dependencies);
  const evidence = await readFile(path.join(directory, "evidence/report.json"), "utf8");
  assert.deepEqual(JSON.parse(evidence), report);
  for (const secret of [sourcePassword, githubToken, localPassword, "service-role-never-publish", sourceUrl]) {
    assert.ok(!evidence.includes(secret), "Public preflight evidence must not disclose credentials");
  }
  return { report, events, commands, clientConfigurations, directory, target, dumpPath };
}

test("full empty-production rehearsal snapshots read-only, restores locally, migrates twice and disposes", async t => {
  const before = process.env;
  const result = await harness(t);
  const { report, events, commands, clientConfigurations, target, dumpPath } = result;
  assert.equal(process.env, before);
  assert.equal(report.status, "pass");
  assert.equal(report.permissionCompatibilityProven, false);
  assert.equal(report.liveSchemaMutated, false);
  assert.equal(report.localRestoreDisposed, true);
  assert.equal(report.migration.repeatRunUnchanged, true);
  assert.equal(existsSync(target.dataDir), false);
  assert.equal(existsSync(dumpPath), true, "Private production backup must survive disposable target cleanup");
  assert.equal((await lstat(path.dirname(dumpPath))).mode & 0o777, 0o700);
  const sourceConfig = clientConfigurations[0];
  assert.equal(sourceConfig.options, "-c default_transaction_read_only=on");
  assert.equal(sourceConfig.ssl.rejectUnauthorized, true);
  assert.equal(sourceConfig.ssl.ca, SUPABASE_ROOT_2021_CA_PEM);
  assert.equal(clientConfigurations[1].host, "127.0.0.1");
  assert.equal(clientConfigurations[1].ssl, false);
  const dump = commands.find(row => row.command === "pg_dump");
  assert.equal(dump.options.env.PGSSLMODE, "verify-full");
  assert.equal(dump.options.env.PGOPTIONS, "-c default_transaction_read_only=on");
  assert.equal(dump.options.env.PGPASSWORD, sourcePassword);
  assert.equal(dump.options.env.GITHUB_TOKEN, undefined);
  assert.ok(dump.args.includes("--snapshot"));
  assert.ok(dump.args.includes("--no-publications"));
  for (const row of commands.filter(row => row.command === "pnpm")) {
    assert.equal(new URL(row.options.env.FIELDGRID_MIGRATION_DATABASE_URL).hostname, "127.0.0.1");
    assert.equal(row.options.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.ok(!JSON.stringify(row).includes(sourcePassword));
  }
  assert.deepEqual(events.filter(event => event.startsWith("command:")), ["command:pg_dump", "command:list", "command:restore", "command:pnpm", "command:pnpm", "command:pg_ctl"]);
  assert.ok(events.indexOf("source:BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY") < events.indexOf("capture.source"));
  assert.ok(events.indexOf("command:list") < events.indexOf("source:ROLLBACK"));
  assert.ok(events.indexOf("source.end") < events.indexOf("startTarget"));
  assert.ok(events.indexOf("local.end") < events.indexOf("stopTarget"));
});

test("unsafe TLS fails before a database client or command is created", async t => {
  for (const environment of [{ PGSSLMODE: "require" }, { DB_SSL: "false" }, { DB_SSL_REJECT_UNAUTHORIZED: "false" }]) {
    const result = await harness(t, { environment });
    assert.equal(result.report.status, "fail");
    assert.equal(result.report.phases.configuration, "fail");
    assert.equal(result.commands.length, 0);
    assert.equal(result.clientConfigurations.length, 0);
  }
});

test("backup failure closes the read-only source transaction and suppresses private error details", async t => {
  const result = await harness(t, { failCommand: "pg_dump" });
  assert.equal(result.report.status, "fail");
  assert.equal(result.report.errorCode, "PREFLIGHT_PHASE_FAILED");
  assert.equal(result.report.phases.backup, "fail");
  assert.ok(result.events.includes("source:ROLLBACK"));
  assert.ok(result.events.includes("source.end"));
  assert.ok(!result.events.includes("startTarget"));
});

test("a partially started target is stopped even when startTarget throws", async t => {
  const result = await harness(t, { partialStartFailure: true });
  assert.equal(result.report.status, "fail");
  assert.equal(result.report.localRestoreDisposed, true);
  assert.ok(result.events.includes("stopTarget"));
  assert.equal(existsSync(result.target.dataDir), false);
  assert.ok(!result.events.includes("command:restore"));
});

test("changed backup fails before restore and still disposes the target", async t => {
  const result = await harness(t, { tamperBackup: true });
  assert.equal(result.report.errorCode, "BACKUP_HASH_MISMATCH");
  assert.equal(result.report.localRestoreDisposed, true);
  assert.ok(!result.events.includes("command:restore"));
});

test("mismatched restored metadata blocks migrations", async t => {
  const result = await harness(t, { metadataAt(index, metadata) {
    return index === 2 ? { ...metadata, counts: { ...metadata.counts, "auth.users": 1 } } : metadata;
  } });
  assert.equal(result.report.errorCode, "RESTORE_METADATA_MISMATCH");
  assert.ok(!result.events.includes("command:pnpm"));
  assert.equal(result.report.localRestoreDisposed, true);
});

test("legacy application tables without Drizzle history require review", async t => {
  const initial = emptyHostedMetadata(); initial.counts["public.tenants"] = 0;
  const result = await harness(t, { initial });
  assert.equal(result.report.errorCode, "LEGACY_SCHEMA_REQUIRES_REVIEW");
  assert.ok(!result.events.includes("command:pnpm"));
});

test("migration failure disposes the restore target without touching production", async t => {
  const result = await harness(t, { failCommand: "pnpm" });
  assert.equal(result.report.status, "fail");
  assert.equal(result.report.phases.migration, "fail");
  assert.equal(result.report.localRestoreDisposed, true);
  assert.equal(result.commands.filter(command => command.command === "pnpm").length, 1);
});

test("missing migration history and decreased durable rows fail the first rehearsal", async t => {
  const missingHistory = migratedMetadata(); missingHistory.sqlHistory = [];
  const missing = await harness(t, { migrated: missingHistory });
  assert.equal(missing.report.phases.migration, "fail");
  const initial = emptyHostedMetadata(); initial.counts["auth.users"] = 1;
  const decreased = await harness(t, { initial });
  assert.equal(decreased.report.errorCode, "DURABLE_ROW_COUNT_DECREASED");
  assert.equal(decreased.commands.filter(command => command.command === "pnpm").length, 1);
});

test("second migration must leave counts, history and publication metadata unchanged", async t => {
  const result = await harness(t, { metadataAt(index, metadata) {
    return index === 4 ? { ...metadata, counts: { ...metadata.counts, "public.tenants": 1 } } : metadata;
  } });
  assert.equal(result.report.status, "fail");
  assert.equal(result.report.phases.idempotence, "fail");
  assert.equal(result.report.errorCode, "RESTORE_METADATA_MISMATCH");
  assert.equal(result.report.localRestoreDisposed, true);
});

test("cleanup failure overrides a successful rehearsal and retains target files for recovery", async t => {
  const result = await harness(t, { cleanupStatus: 0 });
  assert.equal(result.report.status, "fail");
  assert.equal(result.report.errorCode, "CLEANUP_FAILED");
  assert.equal(result.report.localRestoreDisposed, false);
  assert.equal(existsSync(result.target.dataDir), true);
});

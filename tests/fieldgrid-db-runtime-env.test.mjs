import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("db package and cli entrypoints load deployment env before DATABASE_URL", () => {
  const runtimeEnv = read("lib/db/src/runtime-env.ts");

  const dbIndex = read("lib/db/src/index.ts");

  const connection = read("lib/db/src/connection.ts");

  const migrate = read("lib/db/src/migrate.ts");

  const stagingSeed = read("lib/db/src/seed/staging-demo.ts");

  const drizzleConfig = read("lib/db/drizzle.config.ts");

  assertContains(
    runtimeEnv,
    [
      "ENV_FILE_NAMES",
      '".env"',
      '".env.production"',
      "process.cwd()",
      "fileURLToPath(import.meta.url)",
      "if (!process.env[rawKey]) process.env[rawKey] = value",
    ],
    "db runtime env loader",
  );

  assertContains(dbIndex, ['export * from "./connection";'], "db index");

  assertContains(
    connection,
    [
      'import { loadDbRuntimeEnv } from "./runtime-env";',
      "loadDbRuntimeEnv();",
      "DATABASE_URL",
    ],
    "db connection",
  );

  assert.ok(
    connection.indexOf("loadDbRuntimeEnv();") <
      connection.indexOf("DATABASE_URL"),
    "db connection should load runtime env before DATABASE_URL validation",
  );
  assertContains(
    connection,
    [
      "configuredDatabaseConnectionPurpose()",
      "databaseConnectionConfig(",
      "new Pool",
    ],
    "db connection isolation guard",
  );
  assert.ok(
    connection.indexOf("databaseConnectionConfig(") <
      connection.indexOf("new Pool"),
    "db connection should build the guarded purpose-specific config before creating a pool",
  );

  for (const [label, content, guardedConfig] of [
    ["migration runner", migrate, 'databaseConnectionConfig("migration")'],
    ["staging seed", stagingSeed, 'databaseConnectionConfig("migration")'],
    ["drizzle config", drizzleConfig, 'databaseConnectionConfig("migration")'],
  ]) {
    assertContains(content, ["loadDbRuntimeEnv();", guardedConfig], label);
    assert.ok(
      content.indexOf("loadDbRuntimeEnv();") < content.indexOf(guardedConfig),
      `${label} should load runtime env before building guarded database config`,
    );
  }
});

test("migration runner installs legacy updated-at helper before SQL migrations", () => {
  const migrate = read("lib/db/src/migrate.ts");

  assertContains(
    migrate,
    [
      "const legacySqlPrerequisites",
      "to_regprocedure('public.set_updated_at()') IS NULL",
      "CREATE FUNCTION public.set_updated_at()",
      "RETURNS trigger",
      "NEW.updated_at = now();",
      "async function ensureLegacySqlPrerequisites",
      "await ensureLegacySqlPrerequisites(client);",
      "await runSqlMigrations(client, sqlMigrations);",
    ],
    "migration runner legacy SQL prerequisites",
  );

  assert.ok(
    migrate.indexOf("await ensureLegacySqlPrerequisites(client);") <
      migrate.indexOf("await runSqlMigrations(client, sqlMigrations);"),
    "legacy SQL prerequisites should run before hand-written SQL migrations",
  );

  assert.doesNotMatch(migrate, /SECURITY\s+DEFINER/iu);
});

test("migration runner retries only a fully rolled-back SQL deadlock", () => {
  const migrate = read("lib/db/src/migrate.ts");
  const retry = read("lib/db/src/migration-transaction-retry.ts");
  const migrateFunctionStart = migrate.indexOf(
    "async function migrate(): Promise<void> {",
  );
  const migrateFunctionEnd = migrate.indexOf(
    '\nif (mode === "baseline") {',
    migrateFunctionStart,
  );
  assert.ok(
    migrateFunctionStart >= 0,
    "migration runner should define migrate()",
  );
  assert.ok(
    migrateFunctionEnd > migrateFunctionStart,
    "migration runner should expose a bounded migrate() source region",
  );
  const migrateFunction = migrate.slice(
    migrateFunctionStart,
    migrateFunctionEnd,
  );

  assertContains(
    migrate,
    [
      "runSqlMigrationTransaction,",
      "withMigrationSessionLock,",
      'const databaseMigrationSessionLock = "fieldgrid:database-migrations:v1";',
      "pg_catalog.pg_advisory_lock",
      "pg_catalog.pg_advisory_unlock",
      "await withDatabaseMigrationLock(client, async () => {",
      "await runSqlMigrationTransaction(",
      "() => client.query(migration.sql)",
      "() => recordSqlMigration(client, migration, false)",
      "prepareMigration: async () =>",
      "await sqlMigrationIsRecorded(client, migration)",
      "SQL deadlock retry:",
    ],
    "migration retry integration",
  );
  assertContains(
    retry,
    [
      'const migrationDeadlockSqlState = "40P01";',
      'await client.query("rollback");',
      "await options.prepareMigration?.()",
      "if (!isDeadlock(error) || delayMs === undefined)",
      "await wait(delayMs);",
      "await recordMigration();",
      'await client.query("commit");',
      "throw new AggregateError(",
      "export async function withMigrationSessionLock",
    ],
    "migration deadlock retry",
  );
  assertContains(
    migrateFunction,
    [
      "await withDatabaseMigrationLock(client, async () => {",
      "await ensureHistoryTables(client);",
      "await assertNoUnbaselinedExistingSchema(client, expectedTables);",
      'console.log("[db:migrate] Applying Drizzle generated migrations.");',
      "await runDrizzleGeneratedMigrations(client);",
      "await runSqlMigrations(client, sqlMigrations);",
    ],
    "migrate function session-lock scope",
  );
  assert.ok(
    retry.indexOf('await client.query("rollback");') <
      retry.indexOf("if (!isDeadlock(error) || delayMs === undefined)"),
    "a deadlocked transaction must be rolled back before retry classification",
  );
  assert.ok(
    migrateFunction.indexOf(
      "await withDatabaseMigrationLock(client, async () => {",
    ) < migrateFunction.indexOf("await ensureHistoryTables(client);") &&
      migrateFunction.indexOf("await ensureHistoryTables(client);") <
        migrateFunction.indexOf(
          "await assertNoUnbaselinedExistingSchema(client, expectedTables);",
        ) &&
      migrateFunction.indexOf(
        "await assertNoUnbaselinedExistingSchema(client, expectedTables);",
      ) <
        migrateFunction.indexOf(
          'console.log("[db:migrate] Applying Drizzle generated migrations.");',
        ) &&
      migrateFunction.indexOf(
        'console.log("[db:migrate] Applying Drizzle generated migrations.");',
      ) <
        migrateFunction.indexOf(
          "await runSqlMigrations(client, sqlMigrations);",
        ),
    "the session lock should cover generated and hand-written migrations",
  );
  assertContains(
    migrate,
    [
      "async function runDrizzleGeneratedMigrations(",
      "client: pg.Client,",
      "const db = drizzle(client);",
    ],
    "single-session Drizzle migration",
  );
  assert.doesNotMatch(
    migrate,
    /new Pool\(connectionConfig\(\)\)/u,
    "the lock-holding migration runner must not require a second database connection",
  );
});

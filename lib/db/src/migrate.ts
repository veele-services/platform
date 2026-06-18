/**
 * Database migration runner.
 *
 * Modes:
 *   migrate   Apply generated Drizzle migrations and hand-written SQL migrations.
 *   baseline  Mark the current database as already matching committed migrations.
 *
 * Baseline mode is intentionally strict: it refuses to mark an empty database as
 * migrated. Use it once for existing staging/production databases that were
 * created before migration history was tracked.
 */

import crypto from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as migrateDrizzle } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Client, Pool } = pg;

type Mode = "migrate" | "baseline";

type JournalEntry = {
  tag: string;
  when: number;
  breakpoints: boolean;
};

type DrizzleMigration = {
  tag: string;
  createdAt: number;
  hash: string;
  sql: string;
};

type SqlMigration = {
  name: string;
  hash: string;
  sql: string;
};

type BaselineManifest = {
  drizzle: string[];
  sql: string[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database migrations.");
}

const mode = parseMode(process.argv[2] ?? process.env.DB_MIGRATION_MODE ?? "migrate");
const packageRoot = path.join(__dirname, "..");
const generatedMigrationsDir = path.join(packageRoot, "migrations", "generated");
const sqlMigrationsDir = path.join(packageRoot, "migrations");
const baselineManifestPath = path.join(sqlMigrationsDir, "baseline.json");
const drizzleSchema = "drizzle";
const drizzleMigrationsTable = "__drizzle_migrations";
const sqlMigrationsTable = "veele_sql_migrations";

function parseMode(value: string): Mode {
  if (value === "migrate" || value === "baseline") {
    return value;
  }

  throw new Error(`Unknown migration mode "${value}". Use "migrate" or "baseline".`);
}

function connectionConfig(): pg.ClientConfig {
  const config: pg.ClientConfig = { connectionString: databaseUrl };
  const sslMode = process.env.DB_SSL ?? process.env.PGSSLMODE;

  if (sslMode && !["0", "false", "disable"].includes(sslMode.toLowerCase())) {
    config.ssl = {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
    };
  }

  return config;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function readDrizzleMigrations(): DrizzleMigration[] {
  const journalPath = path.join(generatedMigrationsDir, "meta", "_journal.json");

  if (!existsSync(journalPath)) {
    return [];
  }

  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: JournalEntry[];
  };

  return journal.entries.map((entry) => {
    const migrationPath = path.join(generatedMigrationsDir, `${entry.tag}.sql`);
    const sql = readFileSync(migrationPath, "utf8");

    return {
      tag: entry.tag,
      createdAt: entry.when,
      hash: sha256(sql),
      sql,
    };
  });
}

function readSqlMigrations(): SqlMigration[] {
  if (!existsSync(sqlMigrationsDir)) {
    return [];
  }

  return readdirSync(sqlMigrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d+.*\.sql$/u.test(entry.name))
    .map((entry) => {
      const sql = readFileSync(path.join(sqlMigrationsDir, entry.name), "utf8");
      return {
        name: entry.name,
        hash: sha256(sql),
        sql,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function readBaselineManifest(): BaselineManifest {
  if (!existsSync(baselineManifestPath)) {
    throw new Error(`Missing baseline manifest: ${baselineManifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(baselineManifestPath, "utf8")) as BaselineManifest;
  if (!Array.isArray(manifest.drizzle) || !Array.isArray(manifest.sql)) {
    throw new Error("Baseline manifest must contain drizzle and sql arrays.");
  }

  return manifest;
}

function filterBaselineMigrations(
  drizzleMigrations: DrizzleMigration[],
  sqlMigrations: SqlMigration[],
  manifest: BaselineManifest,
): {
  drizzleMigrations: DrizzleMigration[];
  sqlMigrations: SqlMigration[];
} {
  const drizzleByTag = new Map(drizzleMigrations.map((migration) => [migration.tag, migration]));
  const sqlByName = new Map(sqlMigrations.map((migration) => [migration.name, migration]));

  const missingDrizzle = manifest.drizzle.filter((tag) => !drizzleByTag.has(tag));
  const missingSql = manifest.sql.filter((name) => !sqlByName.has(name));

  if (missingDrizzle.length > 0 || missingSql.length > 0) {
    throw new Error(
      [
        "Baseline manifest references migrations that do not exist.",
        missingDrizzle.length > 0 ? `Missing Drizzle: ${missingDrizzle.join(", ")}` : "",
        missingSql.length > 0 ? `Missing SQL: ${missingSql.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return {
    drizzleMigrations: manifest.drizzle.map((tag) => drizzleByTag.get(tag)!),
    sqlMigrations: manifest.sql.map((name) => sqlByName.get(name)!),
  };
}

function expectedTablesFromGeneratedMigrations(migrations: DrizzleMigration[]): string[] {
  const tables = new Set<string>();

  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(/CREATE\s+TABLE\s+"([^"]+)"/giu)) {
      tables.add(match[1]);
    }
  }

  return [...tables].sort();
}

async function createClient(): Promise<pg.Client> {
  const client = new Client(connectionConfig());
  await client.connect();
  return client;
}

async function ensureHistoryTables(client: pg.Client): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${drizzleSchema}`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${drizzleSchema}.${drizzleMigrationsTable} (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${drizzleSchema}.${sqlMigrationsTable} (
      name text PRIMARY KEY,
      hash text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      baselined boolean NOT NULL DEFAULT false
    )
  `);
}

async function existingPublicTables(client: pg.Client, tableNames: string[]): Promise<Set<string>> {
  if (tableNames.length === 0) {
    return new Set();
  }

  const result = await client.query<{ table_name: string }>(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
        and table_name = any($1::text[])
    `,
    [tableNames],
  );

  return new Set(result.rows.map((row) => row.table_name));
}

async function assertCanBaseline(client: pg.Client, expectedTables: string[]): Promise<void> {
  const existingTables = await existingPublicTables(client, expectedTables);
  const missingTables = expectedTables.filter((table) => !existingTables.has(table));

  if (missingTables.length > 0) {
    throw new Error(
      [
        "Refusing to baseline this database because it does not match the committed schema.",
        `Missing public tables: ${missingTables.join(", ")}`,
      ].join(" "),
    );
  }
}

async function assertNoUnbaselinedExistingSchema(
  client: pg.Client,
  expectedTables: string[],
): Promise<void> {
  const existingTables = await existingPublicTables(client, expectedTables);
  if (existingTables.size === 0) {
    return;
  }

  const result = await client.query<{ count: string }>(
    `select count(*)::text as count from ${drizzleSchema}.${drizzleMigrationsTable}`,
  );
  const historyCount = Number(result.rows[0]?.count ?? 0);

  if (historyCount === 0) {
    throw new Error(
      [
        "This database already contains app tables but has no Drizzle migration history.",
        "Run `pnpm --filter @workspace/db run db:baseline` once for this environment before enabling deploy migrations.",
      ].join(" "),
    );
  }
}

async function baselineDrizzleMigrations(
  client: pg.Client,
  migrations: DrizzleMigration[],
): Promise<void> {
  for (const migration of migrations) {
    const existing = await client.query<{ id: number; hash: string }>(
      `
        select id, hash
        from ${drizzleSchema}.${drizzleMigrationsTable}
        where created_at = $1
        order by id
      `,
      [migration.createdAt],
    );

    if (existing.rows.length > 0) {
      const mismatch = existing.rows.find((row) => row.hash !== migration.hash);
      if (mismatch) {
        throw new Error(
          `Drizzle migration ${migration.tag} is already recorded with a different hash.`,
        );
      }

      console.log(`[db:baseline] Drizzle already recorded: ${migration.tag}`);
      continue;
    }

    await client.query(
      `
        insert into ${drizzleSchema}.${drizzleMigrationsTable} (hash, created_at)
        values ($1, $2)
      `,
      [migration.hash, migration.createdAt],
    );
    console.log(`[db:baseline] Drizzle marked: ${migration.tag}`);
  }
}

async function baselineSqlMigrations(
  client: pg.Client,
  migrations: SqlMigration[],
): Promise<void> {
  for (const migration of migrations) {
    await recordSqlMigration(client, migration, true);
    console.log(`[db:baseline] SQL marked: ${migration.name}`);
  }
}

async function recordSqlMigration(
  client: pg.Client,
  migration: SqlMigration,
  baselined: boolean,
): Promise<void> {
  const existing = await client.query<{ hash: string }>(
    `select hash from ${drizzleSchema}.${sqlMigrationsTable} where name = $1`,
    [migration.name],
  );

  if (existing.rows.length > 0) {
    if (existing.rows[0].hash !== migration.hash) {
      throw new Error(
        `SQL migration ${migration.name} is already recorded with a different hash.`,
      );
    }

    return;
  }

  await client.query(
    `
      insert into ${drizzleSchema}.${sqlMigrationsTable} (name, hash, baselined)
      values ($1, $2, $3)
    `,
    [migration.name, migration.hash, baselined],
  );
}

async function runDrizzleGeneratedMigrations(): Promise<void> {
  const pool = new Pool(connectionConfig());
  const db = drizzle(pool);

  try {
    await migrateDrizzle(db, {
      migrationsFolder: generatedMigrationsDir,
      migrationsSchema: drizzleSchema,
      migrationsTable: drizzleMigrationsTable,
    });
  } finally {
    await pool.end();
  }
}

async function runSqlMigrations(client: pg.Client, migrations: SqlMigration[]): Promise<void> {
  for (const migration of migrations) {
    const existing = await client.query<{ hash: string }>(
      `select hash from ${drizzleSchema}.${sqlMigrationsTable} where name = $1`,
      [migration.name],
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].hash !== migration.hash) {
        throw new Error(
          `SQL migration ${migration.name} is already recorded with a different hash.`,
        );
      }

      console.log(`[db:migrate] SQL skipped: ${migration.name}`);
      continue;
    }

    console.log(`[db:migrate] SQL applying: ${migration.name}`);
    await client.query("begin");
    try {
      await client.query(migration.sql);
      await recordSqlMigration(client, migration, false);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
}

async function baseline(): Promise<void> {
  const allDrizzleMigrations = readDrizzleMigrations();
  const allSqlMigrations = readSqlMigrations();
  const baselineManifest = readBaselineManifest();
  const { drizzleMigrations, sqlMigrations } = filterBaselineMigrations(
    allDrizzleMigrations,
    allSqlMigrations,
    baselineManifest,
  );
  const expectedTables = expectedTablesFromGeneratedMigrations(drizzleMigrations);
  const client = await createClient();

  try {
    await ensureHistoryTables(client);
    await assertCanBaseline(client, expectedTables);
    await baselineDrizzleMigrations(client, drizzleMigrations);
    await baselineSqlMigrations(client, sqlMigrations);
  } finally {
    await client.end();
  }

  console.log("[db:baseline] Complete.");
}

async function migrate(): Promise<void> {
  const drizzleMigrations = readDrizzleMigrations();
  const sqlMigrations = readSqlMigrations();
  const expectedTables = expectedTablesFromGeneratedMigrations(drizzleMigrations);

  const preflightClient = await createClient();
  try {
    await ensureHistoryTables(preflightClient);
    await assertNoUnbaselinedExistingSchema(preflightClient, expectedTables);
  } finally {
    await preflightClient.end();
  }

  console.log("[db:migrate] Applying Drizzle generated migrations.");
  await runDrizzleGeneratedMigrations();

  const client = await createClient();
  try {
    await ensureHistoryTables(client);
    await runSqlMigrations(client, sqlMigrations);
  } finally {
    await client.end();
  }

  console.log("[db:migrate] Complete.");
}

if (mode === "baseline") {
  await baseline();
} else {
  await migrate();
}

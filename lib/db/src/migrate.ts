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
import {
  HOSTED_POLICY_REPLACEMENT,
  HOSTED_POLICY_SUPERSEDED,
} from "./hosted-policy-compatibility-identity";
import { loadDbRuntimeEnv } from "./runtime-env";
import { databaseConnectionConfig } from "./database-environment";
import {
  runSqlMigrationTransaction,
  sqlForManagedMigrationTransaction,
  sqlMigrationHashState,
  withMigrationSessionLock,
} from "./migration-transaction-retry";

const { Client } = pg;

type Mode = "migrate" | "baseline";

type MigrationFailureStage =
  | "prepare-bridge"
  | "ensure-history"
  | "schema-guard"
  | "drizzle"
  | "legacy-prerequisites"
  | "sql"
  | "finalize-bridge"
  | "abort-bridge-cleanup";

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

loadDbRuntimeEnv();

const mode = parseMode(
  process.argv[2] ?? process.env.DB_MIGRATION_MODE ?? "migrate",
);
const packageRoot = path.join(__dirname, "..");
const generatedMigrationsDir = path.join(
  packageRoot,
  "migrations",
  "generated",
);
const sqlMigrationsDir = path.join(packageRoot, "migrations");
const baselineManifestPath = path.join(sqlMigrationsDir, "baseline.json");
const drizzleSchema = "drizzle";
const drizzleMigrationsTable = "__drizzle_migrations";
const sqlMigrationsTable = "veele_sql_migrations";
const databaseMigrationSessionLock = "fieldgrid:database-migrations:v1";
const hostedMigrationBridgeFlag = "disposable-rebuild-v1";
const hostedMigrationBridgeSchema = "fieldgrid_migration_bridge";
const hostedAuthMigrationHashes = new Map([
  [
    "001_rbac_rls.sql",
    "c4c1124fb7f40d2b99380596ea9c9e262616a6e7ce28d85f637d727be7483ec3",
  ],
  [
    "002_sprint1_rls.sql",
    "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238",
  ],
  [
    "023_invite_trigger.sql",
    "1e2f4b23c6b136649d59c8f48db20ebcb8d5f0b897f0cdb1b667aa6f14be6b71",
  ],
  [
    "024_harden_invite_trigger.sql",
    "b18cabca3286e0485db2f52f7a8ab1c09924d472bfd2f70f92d1d509cd7c9fbf",
  ],
  [
    "028_assignment_report_notes.sql",
    "c9fbf65dd64b027dbca3f791314bb393ec0a1eb3848b81489b2ee157dc1c61c7",
  ],
  [
    "030_news_system.sql",
    "4862a158e302ba4dba9d0130dc7005783d42a0652c08e1f2b5923ae8f5af9c8c",
  ],
  [
    "031_personnel_availability_days.sql",
    "bbc82dd53361aed86d6e8c5b4fae3846bb2dad5b1e563139a30350783f8576ed",
  ],
  [
    "032_personnel_profile_settings.sql",
    "94766ca52654f9be9ad3edf0d64e1c885dc6674c5ca308de53a1a2f958e1dc3a",
  ],
  [
    "033_personnel_notifications_and_tickets.sql",
    "3f00ed97be84586358dbb698ed2be84dfed0f7586b12144e17b5094188b3be07",
  ],
  [
    "034_customer_portal_foundation.sql",
    "6425d7a4934a9d0717806588605055b2c187bab98d03585b6a1c7ae55fd18a62",
  ],
  [
    "035_customer_object_management.sql",
    "62e421bdf1ed9336f53be3fd7775239dc1c4dade2dfc7030491f5b099969f8dd",
  ],
  [
    "036_notification_center.sql",
    "2226ec3cd4296cafc27f6967d576a9d399bce6529e1b611ffcb8675be8bdd118",
  ],
  [
    "037_tenant_customer_users_events_hardening.sql",
    "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e",
  ],
  [
    "038_customer_ticketing_backoffice.sql",
    "7c9d32e9d4a908b0e45f544af7ab966b3535eabbdffcd73f42b200fbcb37996d",
  ],
  [
    "040_smart_planning.sql",
    "37e071dcd94bd76ef7f1c933a9bde54497ad3704f6f1654f0fc6dd8c0bedb8b4",
  ],
  [
    "041_portal_realtime_events.sql",
    "5f7070a329b4cf0f04afbd01f093b1891a7ab779b72e32cd1980c260ff93a826",
  ],
  [
    "043_native_push_device_tokens.sql",
    "cda3d48037dc92f976fdb2296462fb77fd5a168f23944df6c8060d4550a542bd",
  ],
  [
    "044_personnel_offline_queue.sql",
    "5687377b3d60cc7988aa6f05f3032dc8c18cd8c6ecc11d568788812339265c42",
  ],
  [
    "045_qualifications_management.sql",
    "f73d447434454af426ef8b7f4a798e37038c4f9112a7023981cae79efb5d91d3",
  ],
  [
    "050_storage_upload_hardening.sql",
    "aa51edb1925afbe7feed993267bdd48685da9fa49299ded3bf6c08147e13810e",
  ],
  [
    "051_final_security_boundaries.sql",
    "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff",
  ],
  [
    "063_assignment_media_news_storage.sql",
    "e013ad9309b5623c7805d9b225f843c1066b9362abc0146e14a7ce352b3d2052",
  ],
  [
    "064_assignment_storage_policy_guards.sql",
    "af9645e79af672faf995aadb06c07bc60b384a0b5e97508a3710c4158f742fc9",
  ],
  [
    "066_material_inventory_foundation.sql",
    "0db85456697df9a5d53fac53901d1a994e9c0b89631c3d9d3293be8b2e76584d",
  ],
  [
    "067_material_inventory_assignment_usage_rls.sql",
    "233681ce3df6ae541f518324b0530497499e11b1e35dbad94757af04d4f393f4",
  ],
  [
    "082_knowledgebase_media_storage.sql",
    "74283c84d60a85ed346be6e3b0ad31512c2254fca4e991c96365a2245d00076c",
  ],
  [
    "086_knowledgebase_media_privacy_hardening.sql",
    "13d940881aa352685293459d16f6f1abe541cfb5d299d1d3f662ff4ab3e7dcf0",
  ],
  [
    "090_release_media_storage.sql",
    "97499790f23c2c07986c58509324f00a586459282fe2526abad63ef4f0de1e53",
  ],
  [
    "20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
    "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574",
  ],
  [
    "20260716160000_realtime_projection_delivery.sql",
    "6b746abf6f9f99691ccd97020fc0a0824bc05aec1f5c81e81c191a56934358df",
  ],
  [
    "20260718180000_complete_credential_recovery.sql",
    "d65a5db2b0b6895d01801ebf6273f0158708a6951d2206777daa90978e911a3f",
  ],
  [
    "20260718190000_phase2_security_reconciliation.sql",
    "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964",
  ],
  [
    "20260721120000_quality_checklists_foundation.sql",
    "abd4829bdf5b76b02a4d803464feedaba21c1247faf70a993dd5dad15e99e219",
  ],
  [
    "20260909120000_runtime_least_privilege_principals.sql",
    "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066",
  ],
  [
    "20260914125400_reconcile_legacy_global_rbac_policies.sql",
    "421fde7810185af215b46b733bcf09878c78812a6a151850bb52536ddcc7ba5c",
  ],
  [
    "20260914125503_scope_tenant_management_authorization.sql",
    "23b1aa33b626a114694a748e3e2d391ea02460071c865d2b20df2ec582df9902",
  ],
  [
    "20260919220633_repair_tenant_management_policy_consumers.sql",
    "89bb90be5003c58085edb2688cfc8c9793e682e159edc0f3a656703bd86c3929",
  ],
  [
    "20260920131458_reconcile_hosted_policy_contract.sql",
    "402aa3c738aa67d3b0346a0ea9a2f01eec119238b445ded0f74239876101e6ae",
  ],
  [
    "20260920145343_close_legacy_personnel_browser_updates.sql",
    "59bd5605f54dfd2cdd4f20b6e664936d4de25236d007bf39fb6ca39aff6e2d92",
  ],
  [
    "20260920150424_close_hosted_clean_customer_helper_grants.sql",
    "f157d0d133282770bd37d573899cd035686b99d4244ece45019a95eea240155c",
  ],
]);
const hostedAuthReferencePattern =
  /\bauth\.(?:uid|jwt|role)\(\)|\bauth\.users\b|\bstorage\.(?:buckets|objects|foldername)\b/u;
const hostedAuthFunctionPattern = /\bauth\.(uid|jwt|role)\(\)/gu;
const hostedStorageProviderReferencePattern =
  /\bstorage\.(?:buckets|objects|foldername)\b/u;

const hostedStoragePathFunctionsSql = `
CREATE OR REPLACE FUNCTION public.fieldgrid_storage_assignment_id_from_path(p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO pg_catalog, public, pg_temp
AS $body$
  WITH folders AS (
    SELECT ${hostedMigrationBridgeSchema}.foldername(p_name) AS parts
  )
  SELECT CASE
    WHEN parts[1] = 'tenant'
      AND parts[3] = 'assignments'
      AND parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN parts[4]::uuid
    WHEN parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN parts[1]::uuid
    ELSE NULL
  END
  FROM folders
$body$;

CREATE OR REPLACE FUNCTION public.fieldgrid_storage_tenant_id_from_path(p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO pg_catalog, public, pg_temp
AS $body$
  WITH folders AS (
    SELECT ${hostedMigrationBridgeSchema}.foldername(p_name) AS parts
  )
  SELECT CASE
    WHEN parts[1] = 'tenant'
      AND parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN parts[2]::uuid
    ELSE NULL
  END
  FROM folders
$body$;

REVOKE ALL ON FUNCTION public.fieldgrid_storage_assignment_id_from_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fieldgrid_storage_assignment_id_from_path(text) TO authenticated;
REVOKE ALL ON FUNCTION public.fieldgrid_storage_tenant_id_from_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fieldgrid_storage_tenant_id_from_path(text) TO authenticated;
`;

function omitHostedStorageProviderMutations(
  source: string,
  migrationName: string,
): string {
  const doBlockPattern = /DO\s+\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$;/giu;
  let sql = source.replace(doBlockPattern, (block) => {
    if (!hostedStorageProviderReferencePattern.test(block)) return block;
    return migrationName === "064_assignment_storage_policy_guards.sql"
      ? hostedStoragePathFunctionsSql
      : "-- Provider-owned Storage mutation is installed by the fixed hosted bridge.";
  });
  sql = sql.replace(
    /DROP\s+POLICY\s+IF\s+EXISTS\s+(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s+ON\s+storage\.objects\s*;/giu,
    "-- Provider-owned Storage policy drop is installed by the fixed hosted bridge.",
  );
  sql = sql.replace(
    /CREATE\s+POLICY\s+(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s+ON\s+storage\.objects\b[\s\S]*?;/giu,
    "-- Provider-owned Storage policy is installed by the fixed hosted bridge.",
  );
  if (hostedStorageProviderReferencePattern.test(sql)) {
    throw new Error(
      `Hosted Storage migration compatibility replacement failed: ${migrationName}`,
    );
  }
  return sql;
}

function replaceHostedAuthStatement(
  source: string,
  statement: string,
  replacement: string,
): string {
  if (source.split(statement).length !== 2) {
    throw new Error("Hosted auth migration compatibility source drifted.");
  }
  return source.replace(statement, replacement);
}

export function hostedAuthCompatibleSql(migration: SqlMigration): string {
  const expectedHash = hostedAuthMigrationHashes.get(migration.name);
  if (!expectedHash) {
    if (hostedAuthReferencePattern.test(migration.sql)) {
      throw new Error(
        `Hosted auth migration compatibility manifest is missing: ${migration.name}`,
      );
    }
    return migration.sql;
  }
  if (migration.hash !== expectedHash) {
    throw new Error(
      `Hosted auth migration compatibility hash drifted: ${migration.name}`,
    );
  }
  let sql = migration.sql;
  if (migration.name === "002_sprint1_rls.sql") {
    for (const statement of [
      "ALTER TABLE personnel ADD CONSTRAINT personnel_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;",
      "ALTER TABLE customers ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;",
      "ALTER TABLE objects ADD CONSTRAINT objects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;",
      "ALTER TABLE customer_notes ADD CONSTRAINT customer_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;",
    ]) {
      sql = replaceHostedAuthStatement(
        sql,
        statement,
        "-- Provider-owned auth FK is installed by the fixed hosted bridge.",
      );
    }
  } else if (
    migration.name === "023_invite_trigger.sql" ||
    migration.name === "024_harden_invite_trigger.sql"
  ) {
    const triggerFunction =
      migration.name === "023_invite_trigger.sql"
        ? "public.link_personnel_on_signup()"
        : "app_private.link_personnel_on_signup()";
    sql = replaceHostedAuthStatement(
      sql,
      `DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;\n\nCREATE TRIGGER on_auth_user_created\n  AFTER INSERT ON auth.users\n  FOR EACH ROW\n  EXECUTE FUNCTION ${triggerFunction};`,
      "-- Obsolete provider-owned auth trigger intentionally omitted by the fixed hosted bridge.",
    );
  } else if (
    migration.name === "20260718180000_complete_credential_recovery.sql"
  ) {
    sql = replaceHostedAuthStatement(
      sql,
      `ALTER TABLE public.credential_recovery_challenges\n      ADD CONSTRAINT credential_recovery_challenges_subject_fk\n      FOREIGN KEY (subject_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;`,
      "NULL; -- Provider-owned auth FK is installed by the fixed hosted bridge.",
    );
  } else if (
    migration.name === "20260718190000_phase2_security_reconciliation.sql"
  ) {
    sql = replaceHostedAuthStatement(
      sql,
      "DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;",
      "-- The fixed hosted bridge proves that the obsolete auth trigger is absent.",
    );
  } else if (
    migration.name === "20260909120000_runtime_least_privilege_principals.sql"
  ) {
    sql = replaceHostedAuthStatement(
      sql,
      `AS $fieldgrid_auth_user_snapshot$
  SELECT
    auth_user.id,
    auth_user.email::text,
    auth_user.raw_app_meta_data
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_user_id
  LIMIT 1
$fieldgrid_auth_user_snapshot$;`,
      `AS $fieldgrid_auth_user_snapshot$
  SELECT NULL::uuid, NULL::text, NULL::jsonb
  WHERE false
$fieldgrid_auth_user_snapshot$;`,
    );
    sql = replaceHostedAuthStatement(
      sql,
      `pg_catalog.has_table_privilege(
      'fieldgrid_runtime_app',
      'auth.users',
      privilege.operation
    )`,
      `pg_catalog.has_table_privilege(
      'fieldgrid_runtime_app',
      (
        SELECT relation.oid
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace_row
          ON namespace_row.oid = relation.relnamespace
        WHERE namespace_row.nspname = 'auth'
          AND relation.relname = 'users'
      ),
      privilege.operation
    )`,
    );
    sql = replaceHostedAuthStatement(
      sql,
      "REVOKE USAGE ON SCHEMA auth FROM fieldgrid_runtime_data, fieldgrid_runtime_app;",
      `DO $fieldgrid_hosted_auth_runtime_acl$
BEGIN
  IF pg_catalog.has_schema_privilege(
       'fieldgrid_runtime_data','auth','USAGE'
     ) OR pg_catalog.has_schema_privilege(
       'fieldgrid_runtime_app','auth','USAGE'
     ) THEN
    RAISE EXCEPTION 'Hosted runtime role has direct auth schema access';
  END IF;
END;
$fieldgrid_hosted_auth_runtime_acl$;`,
    );
  }
  sql = omitHostedStorageProviderMutations(sql, migration.name);
  sql = sql.replace(
    hostedAuthFunctionPattern,
    `${hostedMigrationBridgeSchema}.$1()`,
  );
  if (/\bauth\.(?:uid|jwt|role)\(\)/u.test(sql)) {
    throw new Error(
      `Hosted auth migration compatibility replacement failed: ${migration.name}`,
    );
  }
  return sql;
}

const legacySqlPrerequisites = `
  DO $$
  BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NULL THEN
      CREATE FUNCTION public.set_updated_at()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $function$;
    END IF;
  END;
  $$;
`;

function parseMode(value: string): Mode {
  if (value === "migrate" || value === "baseline") {
    return value;
  }

  throw new Error(
    `Unknown migration mode "${value}". Use "migrate" or "baseline".`,
  );
}

function connectionConfig(): pg.ClientConfig {
  return databaseConnectionConfig("migration");
}

function sha256(input: string): string {
  return crypto
    .createHash("sha256")
    .update(input.replace(/\r\n/gu, "\n"))
    .digest("hex");
}

function readDrizzleMigrations(): DrizzleMigration[] {
  const journalPath = path.join(
    generatedMigrationsDir,
    "meta",
    "_journal.json",
  );

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

  const maximumMigrationName =
    process.env.FIELDGRID_SQL_MIGRATION_MAX_NAME?.trim() || null;
  return readdirSync(sqlMigrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d+.*\.sql$/u.test(entry.name))
    .filter(
      (entry) => !maximumMigrationName || entry.name <= maximumMigrationName,
    )
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

  const manifest = JSON.parse(
    readFileSync(baselineManifestPath, "utf8"),
  ) as BaselineManifest;
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
  const drizzleByTag = new Map(
    drizzleMigrations.map((migration) => [migration.tag, migration]),
  );
  const sqlByName = new Map(
    sqlMigrations.map((migration) => [migration.name, migration]),
  );

  const missingDrizzle = manifest.drizzle.filter(
    (tag) => !drizzleByTag.has(tag),
  );
  const missingSql = manifest.sql.filter((name) => !sqlByName.has(name));

  if (missingDrizzle.length > 0 || missingSql.length > 0) {
    throw new Error(
      [
        "Baseline manifest references migrations that do not exist.",
        missingDrizzle.length > 0
          ? `Missing Drizzle: ${missingDrizzle.join(", ")}`
          : "",
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

function expectedTablesFromGeneratedMigrations(
  migrations: DrizzleMigration[],
): string[] {
  const tables = new Set<string>();

  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(
      /CREATE\s+TABLE\s+"([^"]+)"/giu,
    )) {
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

async function ensureLegacySqlPrerequisites(client: pg.Client): Promise<void> {
  await client.query(legacySqlPrerequisites);
}

async function withDatabaseMigrationLock<T>(
  client: pg.Client,
  run: () => Promise<T>,
): Promise<T> {
  return withMigrationSessionLock({
    acquire: () =>
      client.query(
        "select pg_catalog.pg_advisory_lock(pg_catalog.hashtextextended($1::text, 0))",
        [databaseMigrationSessionLock],
      ),
    release: async () => {
      const result = await client.query<{ unlocked: boolean }>(
        "select pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended($1::text, 0)) as unlocked",
        [databaseMigrationSessionLock],
      );
      return result.rows[0]?.unlocked === true;
    },
    run,
  });
}

async function existingPublicTables(
  client: pg.Client,
  tableNames: string[],
): Promise<Set<string>> {
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

async function columnExists(
  client: pg.Client,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      select exists(
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = $1
          and column_name = $2
      ) as exists
    `,
    [tableName, columnName],
  );

  return result.rows[0]?.exists ?? false;
}

async function compatibilitySkipReason(
  client: pg.Client,
  migration: SqlMigration,
): Promise<string | null> {
  if (migration.name !== "055_tenant_scoped_rbac.sql") {
    return null;
  }

  const hasCanonicalUserRoles = await columnExists(
    client,
    "tenant_user_roles",
    "tenant_role_id",
  );
  const hasCanonicalRolePermissions = await columnExists(
    client,
    "tenant_role_permissions",
    "tenant_role_id",
  );

  if (hasCanonicalUserRoles && hasCanonicalRolePermissions) {
    return "canonical tenant_role_id RBAC tables already exist";
  }

  return null;
}

async function assertCanBaseline(
  client: pg.Client,
  expectedTables: string[],
): Promise<void> {
  const existingTables = await existingPublicTables(client, expectedTables);
  const missingTables = expectedTables.filter(
    (table) => !existingTables.has(table),
  );

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
  if (await sqlMigrationIsRecorded(client, migration)) {
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

async function sqlMigrationIsRecorded(
  client: pg.Client,
  migration: SqlMigration,
): Promise<boolean> {
  const existing = await client.query<{ hash: string; baselined: boolean }>(
    `select hash, baselined from ${drizzleSchema}.${sqlMigrationsTable} where name = $1`,
    [migration.name],
  );

  if (existing.rows.length > 0) {
    if (
      migration.name === HOSTED_POLICY_SUPERSEDED.name &&
      existing.rows[0]?.baselined
    ) {
      const compatibilityPath = new URL(
        "../../../scripts/fieldgrid-hosted-policy-compatibility.mts",
        import.meta.url,
      ).href;
      const { runHostedPolicyCompatibility } = (await import(
        compatibilityPath
      )) as {
        runHostedPolicyCompatibility(
          client: pg.Client,
          operation: "diagnose",
        ): Promise<{ replacementRecorded: boolean }>;
      };
      if (
        !(await runHostedPolicyCompatibility(client, "diagnose"))
          .replacementRecorded
      ) {
        throw new Error(
          "Hosted policy compatibility baseline has no verified replacement.",
        );
      }
    }
    const recordedHash = existing.rows[0]?.hash;
    const hashState = recordedHash
      ? sqlMigrationHashState(migration.name, migration.hash, recordedHash)
      : "drift";
    if (hashState === "drift") {
      throw new Error(
        `SQL migration ${migration.name} is already recorded with a different hash.`,
      );
    }
    if (hashState === "reconcilable") {
      const reconciled = await client.query<{ name: string; hash: string }>(
        `
          update ${drizzleSchema}.${sqlMigrationsTable}
             set hash = $2
           where name = $1
             and hash = $3
          returning name, hash
        `,
        [migration.name, migration.hash, recordedHash],
      );
      if (
        reconciled.rowCount !== 1 ||
        reconciled.rows.length !== 1 ||
        reconciled.rows[0]?.name !== migration.name ||
        reconciled.rows[0]?.hash !== migration.hash
      ) {
        throw new Error(
          `SQL migration ${migration.name} history hash could not be reconciled.`,
        );
      }
      console.log(
        `[db:migrate] SQL history hash reconciled: ${migration.name}`,
      );
    }

    return true;
  }

  return false;
}

async function runDrizzleGeneratedMigrations(client: pg.Client): Promise<void> {
  const db = drizzle(client);
  await migrateDrizzle(db, {
    migrationsFolder: generatedMigrationsDir,
    migrationsSchema: drizzleSchema,
    migrationsTable: drizzleMigrationsTable,
  });
}

async function runSqlMigrations(
  client: pg.Client,
  migrations: SqlMigration[],
  { hostedAuthCompatibility = false } = {},
): Promise<void> {
  for (const migration of migrations) {
    if (await sqlMigrationIsRecorded(client, migration)) {
      console.log(`[db:migrate] SQL skipped: ${migration.name}`);
      continue;
    }

    // An immutable historical repair assumed a provider-owned direct ACL that
    // hosted Supabase no longer supplies. The exact replacement narrows app
    // permissions, preserves auth helpers and journals its supersession honestly.
    if (
      !hostedAuthCompatibility &&
      [
        "20260914125400_reconcile_legacy_global_rbac_policies.sql",
        HOSTED_POLICY_SUPERSEDED.name,
      ].includes(migration.name) &&
      migrations.some(
        (entry) =>
          entry.name === HOSTED_POLICY_REPLACEMENT.name &&
          entry.hash === HOSTED_POLICY_REPLACEMENT.hash,
      )
    ) {
      const compatibilityPath = new URL(
        "../../../scripts/fieldgrid-hosted-policy-compatibility.mts",
        import.meta.url,
      ).href;
      const { runHostedPolicyCompatibility } = (await import(
        compatibilityPath
      )) as {
        runHostedPolicyCompatibility(
          client: pg.Client,
          operation: "apply",
          name: string,
        ): Promise<{ changed: boolean }>;
      };
      const compatibility = await runHostedPolicyCompatibility(
        client,
        "apply",
        migration.name,
      );
      if (compatibility.changed) {
        console.log(
          `[db:migrate] SQL exact hosted-policy compatibility applied: ${HOSTED_POLICY_REPLACEMENT.name}`,
        );
        continue;
      }
    }

    const skipReason = await compatibilitySkipReason(client, migration);
    if (skipReason) {
      await recordSqlMigration(client, migration, true);
      console.log(
        `[db:migrate] SQL compatibility skipped: ${migration.name} (${skipReason})`,
      );
      continue;
    }

    console.log(`[db:migrate] SQL applying: ${migration.name}`);
    const migrationSql = hostedAuthCompatibility
      ? hostedAuthCompatibleSql(migration)
      : migration.sql;
    let result;
    try {
      result = await runSqlMigrationTransaction(
        client,
        () => client.query(sqlForManagedMigrationTransaction(migrationSql)),
        () => recordSqlMigration(client, migration, false),
        {
          prepareMigration: async () =>
            (await sqlMigrationIsRecorded(client, migration))
              ? "already-applied"
              : "apply",
          onDeadlockRetry: ({
            sqlState,
            nextAttempt,
            maxAttempts,
            delayMs,
          }) => {
            console.warn(
              `[db:migrate] SQL deadlock retry: ${migration.name} (SQLSTATE ${sqlState}, attempt ${nextAttempt}/${maxAttempts}, delay ${delayMs}ms).`,
            );
          },
        },
      );
    } catch (error) {
      if (error && typeof error === "object" && Object.isExtensible(error)) {
        Object.defineProperty(error, "migrationFailureName", {
          configurable: false,
          enumerable: false,
          value: migration.name,
          writable: false,
        });
      }
      throw error;
    }
    if (result === "already-applied") {
      console.log(
        `[db:migrate] SQL skipped after transaction recheck: ${migration.name}`,
      );
    }
  }
}

async function prepareHostedMigrationBridge(
  client: pg.Client,
): Promise<boolean> {
  const requested = process.env.FIELDGRID_HOSTED_MIGRATION_BRIDGE?.trim();
  if (!requested) return false;
  if (requested !== hostedMigrationBridgeFlag) {
    throw new Error("Hosted migration bridge mode is invalid.");
  }
  const bridge = await client.query<{ bridge: string | null }>(
    `SELECT pg_catalog.to_regprocedure($1)::text AS bridge`,
    [`${hostedMigrationBridgeSchema}.prepare_disposable_rebuild()`],
  );
  if (!bridge.rows[0]?.bridge) {
    throw new Error("Hosted migration bridge is missing.");
  }
  await client.query(
    `SELECT ${hostedMigrationBridgeSchema}.prepare_disposable_rebuild()`,
  );
  return true;
}

async function abortHostedMigrationBridge(client: pg.Client): Promise<void> {
  await client.query(
    `SELECT ${hostedMigrationBridgeSchema}.abort_disposable_rebuild()`,
  );
}

async function finalizeHostedMigrationBridge(client: pg.Client): Promise<void> {
  await client.query(
    `SELECT ${hostedMigrationBridgeSchema}.finalize_disposable_rebuild()`,
  );
}

async function runMigrationStage<T>(
  stage: MigrationFailureStage,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      Object.isExtensible(error) &&
      !("migrationFailureStage" in error)
    ) {
      Object.defineProperty(error, "migrationFailureStage", {
        configurable: false,
        enumerable: false,
        value: stage,
        writable: false,
      });
    }
    throw error;
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
  const expectedTables =
    expectedTablesFromGeneratedMigrations(drizzleMigrations);
  const client = await createClient();

  try {
    await withDatabaseMigrationLock(client, async () => {
      await ensureHistoryTables(client);
      await assertCanBaseline(client, expectedTables);
      await baselineDrizzleMigrations(client, drizzleMigrations);
      await baselineSqlMigrations(client, sqlMigrations);
    });
  } finally {
    await client.end();
  }

  console.log("[db:baseline] Complete.");
}

export async function migrateWithClient(client: pg.Client): Promise<void> {
  const drizzleMigrations = readDrizzleMigrations();
  const sqlMigrations = readSqlMigrations();
  const expectedTables =
    expectedTablesFromGeneratedMigrations(drizzleMigrations);

  await withDatabaseMigrationLock(client, async () => {
    const hostedAuthCompatibility = await runMigrationStage(
      "prepare-bridge",
      () => prepareHostedMigrationBridge(client),
    );
    try {
      await runMigrationStage("ensure-history", () =>
        ensureHistoryTables(client),
      );
      await runMigrationStage("schema-guard", () =>
        assertNoUnbaselinedExistingSchema(client, expectedTables),
      );

      console.log("[db:migrate] Applying Drizzle generated migrations.");
      await runMigrationStage("drizzle", () =>
        runDrizzleGeneratedMigrations(client),
      );

      await runMigrationStage("ensure-history", () =>
        ensureHistoryTables(client),
      );
      await runMigrationStage("legacy-prerequisites", () =>
        ensureLegacySqlPrerequisites(client),
      );
      await runMigrationStage("sql", () =>
        runSqlMigrations(client, sqlMigrations, {
          hostedAuthCompatibility,
        }),
      );
      if (hostedAuthCompatibility) {
        await runMigrationStage("finalize-bridge", () =>
          finalizeHostedMigrationBridge(client),
        );
      }
    } catch (error) {
      if (hostedAuthCompatibility) {
        try {
          await abortHostedMigrationBridge(client);
        } catch (abortError) {
          const aggregate = new AggregateError(
            [error, abortError],
            "Hosted migration failed and bridge cleanup could not be proven.",
            { cause: error },
          );
          Object.defineProperty(aggregate, "migrationFailureStage", {
            configurable: false,
            enumerable: false,
            value: "abort-bridge-cleanup",
            writable: false,
          });
          throw aggregate;
        }
      }
      throw error;
    }
  });
}

async function migrate(): Promise<void> {
  const client = await createClient();
  try {
    await migrateWithClient(client);
  } finally {
    await client.end();
  }

  console.log("[db:migrate] Complete.");
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (mode === "baseline") {
  if (invokedDirectly) {
    await baseline();
  }
} else {
  if (invokedDirectly) {
    await migrate();
  }
}

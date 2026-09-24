import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { assertNoExternalWriters } from "./disposable-staging/database.mjs";
import {
  applyBootstrap,
  applicationOwnershipInventory,
  bootstrapPlan,
  drainApplicationWriters,
  managedCatalogSnapshot,
  verifyTargetLogin,
} from "./staging-migration-admin/database.mjs";

const require = createRequire(
  new URL("../lib/db/package.json", import.meta.url),
);
const { Client } = require("pg");
const source = new URL(process.env.DATABASE_URL ?? "");
const rootSource = new URL(
  process.env.FIELDGRID_BOOTSTRAP_ROOT_DATABASE_URL ?? "",
);
if (
  !["127.0.0.1", "localhost"].includes(source.hostname) ||
  source.pathname !== "/postgres" ||
  decodeURIComponent(source.username) !== "postgres" ||
  !["127.0.0.1", "localhost"].includes(rootSource.hostname) ||
  rootSource.pathname !== "/postgres" ||
  decodeURIComponent(rootSource.username) !== "supabase_admin" ||
  process.env.FIELDGRID_BOOTSTRAP_POSTGRES17_TEST !== "1"
) {
  throw new Error(
    "bootstrap PostgreSQL 17 test requires its explicit guarded local database",
  );
}

const PASSWORD = "0123456789abcdef".repeat(4);

function connectionString(username, password) {
  const value = new URL(source);
  value.username = username;
  value.password = password;
  return value.toString();
}

async function connected(username, password, applicationName) {
  const client = new Client({
    connectionString: connectionString(username, password),
    application_name: applicationName,
  });
  await client.connect();
  return client;
}

const rootBootstrap = new Client({
  connectionString: rootSource.toString(),
  application_name: "fieldgrid-bootstrap-pg17-root",
});
await rootBootstrap.connect();
await rootBootstrap.query(
  "CREATE ROLE postgres LOGIN SUPERUSER PASSWORD 'postgres'",
);
await rootBootstrap.query("ALTER DATABASE postgres OWNER TO postgres");
const admin = await connected(
  "postgres",
  decodeURIComponent(source.password),
  "fieldgrid-bootstrap-pg17-fixture",
);
let root;
let legacy;
let target;
try {
  await admin.query("DROP PUBLICATION IF EXISTS supabase_realtime");
  await admin.query("DROP SCHEMA IF EXISTS app_private CASCADE");
  await admin.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await admin.query("DROP SCHEMA IF EXISTS auth CASCADE");
  for (const schema of [
    "storage",
    "extensions",
    "realtime",
    "graphql",
    "graphql_public",
    "supabase_functions",
    "vault",
  ]) {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
  await admin.query("DROP ROLE IF EXISTS fieldgrid_migration_admin");
  await admin.query("DROP ROLE IF EXISTS fieldgrid_runtime_app");
  await admin.query("DROP ROLE IF EXISTS fieldgrid_runtime_data");
  root = rootBootstrap;
  await admin.query(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(
      id uuid PRIMARY KEY,
      email text,
      raw_app_meta_data jsonb,
      internal_note text
    );
    CREATE SCHEMA app_private;
    CREATE SCHEMA drizzle;
    CREATE TABLE public.tenants(id uuid PRIMARY KEY);
    CREATE TABLE public.tenant_users(id uuid PRIMARY KEY,tenant_id uuid);
    CREATE TABLE public.platform_users(user_id uuid PRIMARY KEY,role text,status text);
    CREATE SEQUENCE public.fixture_sequence;
    CREATE VIEW public.fixture_view AS SELECT id FROM public.tenants;
    CREATE MATERIALIZED VIEW public.fixture_materialized AS SELECT id FROM public.tenants;
    CREATE TYPE public.fixture_status AS ENUM ('ready');
    CREATE FUNCTION public.fixture_function() RETURNS integer LANGUAGE sql AS 'SELECT 1';
    CREATE FUNCTION app_private.fieldgrid_runtime_principal_configuration()
      RETURNS text LANGUAGE sql SECURITY DEFINER AS 'SELECT current_user::text';
    CREATE TABLE drizzle.__drizzle_migrations(id integer PRIMARY KEY);
    CREATE PUBLICATION supabase_realtime;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE ROLE fieldgrid_runtime_data NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    CREATE ROLE fieldgrid_runtime_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
    GRANT fieldgrid_runtime_data TO fieldgrid_runtime_app WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
  `);
  for (const schema of [
    "storage",
    "extensions",
    "realtime",
    "graphql",
    "graphql_public",
    "supabase_functions",
    "vault",
  ]) {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".fixture(id integer)`);
  }
  await rootBootstrap.query(
    "GRANT fieldgrid_runtime_app TO postgres WITH INHERIT FALSE, SET FALSE, ADMIN TRUE",
  );
  await rootBootstrap.query(
    "GRANT fieldgrid_runtime_data TO postgres WITH INHERIT FALSE, SET FALSE, ADMIN TRUE",
  );
  const publicOwner = await admin.query(
    "SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='public'",
  );
  assert.equal(publicOwner.rows[0].owner, "pg_database_owner");
  await admin.query(
    "ALTER ROLE postgres NOSUPERUSER BYPASSRLS CREATEROLE CREATEDB REPLICATION LOGIN",
  );
  await admin.end();

  legacy = await connected(
    "postgres",
    decodeURIComponent(source.password),
    "fieldgrid-bootstrap-pg17-legacy",
  );
  const legacyIdentity = await legacy.query(`
    SELECT current_user::text AS current_user,session_user::text AS session_user,
      current_database() AS database_name,rolsuper,rolbypassrls,rolcreaterole,
      rolcreatedb,rolreplication,rolinherit,rolcanlogin
    FROM pg_roles WHERE rolname=current_user
  `);
  assert.deepEqual(legacyIdentity.rows, [
    {
      current_user: "postgres",
      session_user: "postgres",
      database_name: "postgres",
      rolsuper: false,
      rolbypassrls: true,
      rolcreaterole: true,
      rolcreatedb: true,
      rolreplication: true,
      rolinherit: true,
      rolcanlogin: true,
    },
  ]);

  const beforePlan = await managedCatalogSnapshot(legacy);
  const plan = await bootstrapPlan(legacy);
  assert.equal(plan.principal.name, "postgres");
  assert.equal(plan.targetRoleExists, false);
  assert.equal(plan.managedCatalogDigest, beforePlan.digest);
  assert.equal(
    (await managedCatalogSnapshot(legacy)).digest,
    beforePlan.digest,
  );

  await root.query(
    "CREATE ROLE fieldgrid_migration_admin LOGIN CREATEDB CREATEROLE PASSWORD 'unsafe-fixture-password'",
  );
  await assert.rejects(
    applyBootstrap(legacy, PASSWORD),
    /EXISTING_TARGET_ROLE_PRIVILEGED/u,
  );
  await root.query("DROP ROLE fieldgrid_migration_admin");

  const before = await managedCatalogSnapshot(legacy);
  await assert.rejects(
    applyBootstrap(legacy, PASSWORD, { injectFailure: "after-objects" }),
    /INJECTED_FAILURE/u,
  );
  assert.equal(
    (
      await legacy.query(
        "SELECT count(*)::int AS count FROM pg_roles WHERE rolname='fieldgrid_migration_admin'",
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await legacy.query(
        "SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='public.tenants'::regclass",
      )
    ).rows[0].owner,
    "postgres",
  );
  assert.equal((await managedCatalogSnapshot(legacy)).digest, before.digest);

  const first = await applyBootstrap(legacy, PASSWORD);
  assert.equal(first.managedCatalogDigest, before.digest);
  const afterFirst = await applicationOwnershipInventory(legacy);
  assert.equal(afterFirst.targetRoleExists, true);
  assert.equal(afterFirst.targetRole.rolsuper, false);
  assert.equal(afterFirst.targetRole.rolbypassrls, false);
  assert.equal(afterFirst.targetRole.rolcreatedb, false);
  assert.equal(afterFirst.targetRole.rolreplication, false);
  assert.equal(afterFirst.targetRole.rolinherit, false);
  assert.equal(afterFirst.targetRole.rolcanlogin, true);

  target = await connected(
    "fieldgrid_migration_admin",
    PASSWORD,
    "fieldgrid-bootstrap-pg17-target",
  );
  const targetSchemas = await target.query(
    `
    SELECT nspname,pg_get_userbyid(nspowner) AS owner,
      has_schema_privilege(current_user,oid,'USAGE') AS usage
    FROM pg_namespace WHERE nspname=ANY($1::text[]) ORDER BY nspname
  `,
    [["app_private", "drizzle", "public"]],
  );
  assert.deepEqual(
    targetSchemas.rows,
    ["app_private", "drizzle", "public"].map((nspname) => ({
      nspname,
      owner: "fieldgrid_migration_admin",
      usage: nspname === "public",
    })),
  );
  const writerFence = await assertNoExternalWriters(target);
  assert.equal(writerFence.runtimeLoginDisabled, true);
  assert.equal(writerFence.publicDmlRevoked, true);
  assert.equal(writerFence.appFunctionExecuteRevoked, true);
  assert.equal(writerFence.targetTransactionsDrained, true);
  assert.deepEqual(
    (
      await target.query(
        `SELECT nspname,has_schema_privilege(current_user,oid,'USAGE') AS usage
         FROM pg_namespace WHERE nspname=ANY($1::text[]) ORDER BY nspname`,
        [["app_private", "drizzle", "public"]],
      )
    ).rows,
    ["app_private", "drizzle", "public"].map((nspname) => ({
      nspname,
      usage: true,
    })),
  );
  const proof = await verifyTargetLogin(target, before.digest);
  assert.equal(proof.principal, "fieldgrid_migration_admin");
  assert.equal(proof.dryRebuildCapability, true);
  await target.end();
  target = undefined;

  const second = await applyBootstrap(legacy, PASSWORD);
  assert.equal(second.managedCatalogDigest, before.digest);
  assert.equal((await managedCatalogSnapshot(legacy)).digest, before.digest);
  const definer = await legacy.query(`
    SELECT pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app_private'
      AND p.proname='fieldgrid_runtime_principal_configuration'
  `);
  assert.equal(definer.rows[0].owner, "postgres");
  const authPrivileges = await legacy.query(`
    SELECT has_schema_privilege('fieldgrid_migration_admin','auth','USAGE') AS usage,
      has_column_privilege('fieldgrid_migration_admin','auth.users','id','SELECT') AS id,
      has_column_privilege('fieldgrid_migration_admin','auth.users','email','SELECT') AS email,
      has_column_privilege('fieldgrid_migration_admin','auth.users','raw_app_meta_data','SELECT') AS metadata,
      has_column_privilege('fieldgrid_migration_admin','auth.users','internal_note','SELECT') AS internal_note
  `);
  assert.deepEqual(authPrivileges.rows[0], {
    usage: true,
    id: true,
    email: true,
    metadata: true,
    internal_note: false,
  });
  await legacy.query("CREATE ROLE fixture_unknown_writer LOGIN");
  try {
    await assert.rejects(
      drainApplicationWriters(legacy),
      /UNKNOWN_DATABASE_WRITER/u,
    );
  } finally {
    await legacy.query("DROP ROLE fixture_unknown_writer");
  }
  process.stdout.write(
    `${JSON.stringify({ status: "passed", postgresMajor: 17, retry: true, rollback: true })}\n`,
  );
} finally {
  await target?.end().catch(() => {});
  await legacy?.end().catch(() => {});
  await root?.end().catch(() => {});
  if (root !== rootBootstrap) await rootBootstrap.end().catch(() => {});
  await admin.end().catch(() => {});
}

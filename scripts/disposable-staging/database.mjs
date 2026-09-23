import { spawn } from "node:child_process";
import { once } from "node:events";

import {
  APP_SCHEMAS,
  MANAGED_SCHEMAS,
  digest,
  fail,
  requireThat,
} from "./contract.mjs";

const MIGRATION_LOCK = "fieldgrid:database-migrations:v1";

export async function managedCatalogSnapshot(client) {
  const schemas = await client.query(
    `
    SELECT n.nspname AS schema_name,c.relname,c.relkind,
      COALESCE(jsonb_agg(jsonb_build_array(a.attname,a.atttypid::text,a.attnotnull)
        ORDER BY a.attnum) FILTER (WHERE a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb) AS columns
    FROM pg_namespace n
    LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relkind IN ('r','p','v','m','S')
    LEFT JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname=ANY($1::text[])
    GROUP BY n.nspname,c.relname,c.relkind
    ORDER BY n.nspname,c.relname,c.relkind
  `,
    [[...MANAGED_SCHEMAS]],
  );
  const extensions = await client.query(`
    SELECT e.extname,e.extversion,n.nspname AS schema_name
    FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
    ORDER BY e.extname
  `);
  return {
    schemas: schemas.rows,
    extensions: extensions.rows,
    digest: digest({ schemas: schemas.rows, extensions: extensions.rows }),
  };
}

export async function databaseInventory(client) {
  const identity = await client.query(`
    SELECT current_user::text AS current_user,session_user::text AS session_user,
      r.rolsuper,r.rolbypassrls,r.rolcreaterole,current_database() AS database_name
    FROM pg_roles r WHERE r.rolname=current_user
  `);
  const row = identity.rows[0];
  requireThat(
    Boolean(row) &&
      row.current_user === row.session_user &&
      row.rolsuper === false &&
      row.rolbypassrls === false &&
      row.rolcreaterole === true &&
      row.database_name === "postgres",
    "MIGRATION_PRINCIPAL_INVALID",
  );
  const schemas = await client.query(
    `
    SELECT nspname FROM pg_namespace
    WHERE nspname=ANY($1::text[]) ORDER BY nspname
  `,
    [[...APP_SCHEMAS]],
  );
  const managed = await managedCatalogSnapshot(client);
  return {
    principal: row.current_user,
    applicationSchemas: schemas.rows.map(({ nspname }) => nspname),
    managedCatalogDigest: managed.digest,
  };
}

export async function assertNoExternalWriters(client) {
  const unknown = await client.query(
    `
    SELECT role.rolname AS effective_writer
    FROM pg_roles role
    WHERE role.rolcanlogin
      AND role.rolname<>current_user
      AND role.rolname<>ALL($2::text[])
      AND (
        EXISTS (
          SELECT 1
          FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
          WHERE namespace.nspname=ANY($1::text[])
            AND relation.relkind IN ('r','p')
            AND (
              has_table_privilege(role.rolname,relation.oid,'INSERT')
              OR has_table_privilege(role.rolname,relation.oid,'UPDATE')
              OR has_table_privilege(role.rolname,relation.oid,'DELETE')
              OR has_table_privilege(role.rolname,relation.oid,'TRUNCATE')
            )
        )
        OR EXISTS (
          SELECT 1
          FROM pg_proc function_row
          JOIN pg_namespace namespace ON namespace.oid=function_row.pronamespace
          WHERE namespace.nspname=ANY($1::text[])
            AND has_function_privilege(role.rolname,function_row.oid,'EXECUTE')
        )
      )
    ORDER BY role.rolname
  `,
    [
      [...APP_SCHEMAS],
      [
        "anon",
        "authenticated",
        "authenticator",
        "dashboard_user",
        "fieldgrid_runtime_app",
        "postgres",
        "pgbouncer",
        "service_role",
        "supabase_admin",
        "supabase_auth_admin",
        "supabase_etl_admin",
        "supabase_functions_admin",
        "supabase_read_only_user",
        "supabase_replication_admin",
        "supabase_storage_admin",
      ],
    ],
  );
  requireThat(
    unknown.rows.length === 0,
    "UNKNOWN_DATABASE_WRITER",
    "QUIESCED",
    true,
  );

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='15s'");
    await client.query("ALTER ROLE fieldgrid_runtime_app NOLOGIN");
    for (const schema of APP_SCHEMAS) {
      await client.query(
        `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA ${schema} FROM anon, authenticated, service_role`,
      );
      await client.query(
        `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} FROM PUBLIC, anon, authenticated, service_role`,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }

  const terminated = await client.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname=current_database()
      AND pid<>pg_backend_pid()
      AND backend_type='client backend'
      AND usename=ANY(ARRAY[
        'fieldgrid_runtime_app','authenticator','anon','authenticated','service_role'
      ]::text[])
  `);
  requireThat(
    terminated.rows.every(
      ({ pg_terminate_backend: stopped }) => stopped === true,
    ),
    "DATABASE_WRITER_TERMINATION_FAILED",
    "QUIESCED",
    true,
  );
  const proof = await client.query(
    `
    SELECT
      NOT runtime.rolcanlogin AS runtime_login_disabled,
      NOT has_table_privilege('anon','public.tenants','INSERT')
        AND NOT has_table_privilege('anon','public.tenants','UPDATE')
        AND NOT has_table_privilege('anon','public.tenants','DELETE')
        AND NOT has_table_privilege('anon','public.tenants','TRUNCATE')
        AND NOT has_table_privilege('authenticated','public.tenants','INSERT')
        AND NOT has_table_privilege('authenticated','public.tenants','UPDATE')
        AND NOT has_table_privilege('authenticated','public.tenants','DELETE')
        AND NOT has_table_privilege('authenticated','public.tenants','TRUNCATE')
        AND NOT has_table_privilege('service_role','public.tenants','INSERT')
        AND NOT has_table_privilege('service_role','public.tenants','UPDATE')
        AND NOT has_table_privilege('service_role','public.tenants','DELETE')
        AND NOT has_table_privilege('service_role','public.tenants','TRUNCATE')
        AS public_dml_revoked,
      NOT EXISTS (
        SELECT 1
        FROM pg_proc function_row
        JOIN pg_namespace namespace ON namespace.oid=function_row.pronamespace
        WHERE namespace.nspname=ANY($1::text[])
          AND (
            has_function_privilege('anon',function_row.oid,'EXECUTE')
            OR has_function_privilege('authenticated',function_row.oid,'EXECUTE')
            OR has_function_privilege('service_role',function_row.oid,'EXECUTE')
          )
      ) AS app_function_execute_revoked,
      NOT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE datname=current_database()
          AND pid<>pg_backend_pid()
          AND backend_type='client backend'
          AND usename=ANY(ARRAY[
            'fieldgrid_runtime_app','authenticator','anon','authenticated','service_role'
          ]::text[])
          AND (state<>'idle' OR xact_start IS NOT NULL)
      ) AS target_transactions_drained
    FROM pg_roles runtime
    WHERE runtime.rolname='fieldgrid_runtime_app'
  `,
    [[...APP_SCHEMAS]],
  );
  requireThat(
    proof.rows.length === 1 &&
      proof.rows[0].runtime_login_disabled === true &&
      proof.rows[0].public_dml_revoked === true &&
      proof.rows[0].app_function_execute_revoked === true &&
      proof.rows[0].target_transactions_drained === true,
    "DATABASE_WRITER_FENCE_FAILED",
    "QUIESCED",
    true,
  );
  return {
    runtimeLoginDisabled: true,
    publicDmlRevoked: true,
    appFunctionExecuteRevoked: true,
    targetTransactionsDrained: true,
  };
}

export async function resetApplicationSchemas(client) {
  const before = await managedCatalogSnapshot(client);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='120s'");
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",
      [MIGRATION_LOCK],
    );
    requireThat(
      lock.rows[0]?.acquired === true,
      "MIGRATION_LOCK_UNAVAILABLE",
      "AUTH_EMPTY",
      true,
    );
    await client.query("DROP SCHEMA IF EXISTS app_private CASCADE");
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public AUTHORIZATION CURRENT_USER");
    await client.query(
      "GRANT USAGE ON SCHEMA public TO postgres,anon,authenticated,service_role",
    );
    await client.query("GRANT ALL ON SCHEMA public TO postgres,service_role");
    const after = await managedCatalogSnapshot(client);
    requireThat(
      after.digest === before.digest,
      "MANAGED_CATALOG_CHANGED",
      "AUTH_EMPTY",
      true,
    );
    await client.query("COMMIT");
    return { before: before.digest, after: after.digest };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function runCommand(
  command,
  args,
  { cwd, env, timeoutMs = 15 * 60 * 1000 } = {},
) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout = `${stdout}${chunk}`.slice(-32768);
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-32768);
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
  const [code, signal] = await once(child, "exit");
  clearTimeout(timer);
  if (code !== 0) {
    const error = new Error("REBUILD_CHILD_PROCESS_FAILED");
    error.code = "REBUILD_CHILD_PROCESS_FAILED";
    error.command = command;
    error.exitCode = code;
    error.signal = signal;
    // Deliberately do not attach child output; SQL/provider errors may contain data.
    throw error;
  }
  return { stdout, stderr };
}

export async function runCanonicalMigrations({
  repoRoot,
  env = process.env,
  command = runCommand,
} = {}) {
  const childEnv = {
    PATH: env.PATH,
    HOME: env.HOME,
    LANG: "C.UTF-8",
    APP_ENV: env.APP_ENV,
    TARGET_ENVIRONMENT: env.TARGET_ENVIRONMENT,
    EXPECTED_SUPABASE_PROJECT_REF: env.EXPECTED_SUPABASE_PROJECT_REF,
    FORBIDDEN_SUPABASE_PROJECT_REF: env.FORBIDDEN_SUPABASE_PROJECT_REF,
    DATABASE_URL: env.DATABASE_URL,
    FIELDGRID_MIGRATION_DATABASE_URL: env.FIELDGRID_MIGRATION_DATABASE_URL,
    FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
    FIELDGRID_DATABASE_SSL_ROOT_CERT: env.FIELDGRID_DATABASE_SSL_ROOT_CERT,
    FIELDGRID_DB_RUNTIME_ENV_FILE_LOADING: "disabled",
    DB_SSL: "true",
    DB_SSL_REJECT_UNAUTHORIZED: "true",
    PGSSLMODE: "verify-full",
  };
  await command("pnpm", ["--filter", "@workspace/db", "run", "db:migrate"], {
    cwd: repoRoot,
    env: childEnv,
  });
  await command(
    "pnpm",
    ["--filter", "@workspace/db", "exec", "tsx", "src/seed/rbac.ts"],
    { cwd: repoRoot, env: childEnv },
  );
  await command(
    "pnpm",
    ["--filter", "@workspace/db", "exec", "tsx", "src/seed/sectors.ts"],
    { cwd: repoRoot, env: childEnv },
  );
}

export async function verifyRebuiltDatabase(client) {
  const missingRls = await client.query(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity
    ORDER BY c.relname
  `);
  requireThat(
    missingRls.rows.length === 0,
    "PUBLIC_RLS_INCOMPLETE",
    "BOOTSTRAPPED",
    true,
  );
  const journals = await client.query(`
    SELECT
      (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS drizzle_count,
      (SELECT count(*)::int FROM drizzle.veele_sql_migrations) AS sql_count,
      (SELECT count(*)::int FROM drizzle.veele_sql_migrations WHERE baselined) AS baselined_count,
      (SELECT COALESCE(jsonb_agg(name ORDER BY name),'[]'::jsonb)
         FROM drizzle.veele_sql_migrations WHERE baselined) AS baselined_names
  `);
  const history = journals.rows[0];
  // The canonical migrate command marks one superseded historical RBAC file as
  // compatibility-baselined after applying its canonical predecessors. This is
  // not baseline mode; any other baseline marker is rejected.
  requireThat(
    history?.drizzle_count > 0 &&
      history?.sql_count > 0 &&
      JSON.stringify(history?.baselined_names) ===
        JSON.stringify(["055_tenant_scoped_rbac.sql"]),
    "MIGRATION_JOURNAL_INVALID",
    "BOOTSTRAPPED",
    true,
  );
  const realtime = await client.query(`
    SELECT count(*)::int AS count FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='portal_realtime_events'
  `);
  requireThat(
    realtime.rows[0]?.count === 1,
    "REALTIME_CONFIGURATION_INVALID",
    "BOOTSTRAPPED",
    true,
  );
  const queues = await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.notification_delivery_queue) AS delivery_queue,
      (SELECT count(*)::int FROM public.notification_dispatches) AS dispatches,
      (SELECT count(*)::int FROM public.domain_events) AS domain_events
  `);
  requireThat(
    Object.values(queues.rows[0] ?? {}).every((value) => value === 0),
    "OPERATIONAL_QUEUE_NOT_EMPTY",
    "BOOTSTRAPPED",
    true,
  );
  return {
    migrationJournal: history,
    realtimePublication: true,
    operationalQueuesEmpty: true,
    publicRls: true,
  };
}

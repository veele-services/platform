import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { join } from "node:path";

import {
  APP_SCHEMAS,
  MANAGED_SCHEMAS,
  digest,
  fail,
  requireThat,
} from "./contract.mjs";
import {
  STORAGE_POLICIES,
  SUPERSEDED_STORAGE_POLICIES,
  verifyHostedMigrationBridgeFinalState,
} from "../staging-migration-admin/bridge-contract.mjs";

const MIGRATION_LOCK = "fieldgrid:database-migrations:v1";
const INVENTORY_APPLICATION_TABLES = Object.freeze([
  "tenants",
  "tenant_users",
  "platform_users",
]);

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

async function applicationTableInventory(client) {
  const relations = await client.query(
    `
    WITH requested(table_name) AS (
      SELECT unnest($1::text[])
    )
    SELECT requested.table_name,
      relation.oid IS NOT NULL AS present
    FROM requested
    LEFT JOIN pg_catalog.pg_class relation
      ON relation.oid=pg_catalog.to_regclass(pg_catalog.format('%I.%I','public',requested.table_name))
      AND relation.relkind IN ('r','p')
    ORDER BY requested.table_name
  `,
    [[...INVENTORY_APPLICATION_TABLES]],
  );
  const presence = new Map(
    relations.rows.map(({ table_name: tableName, present }) => [
      tableName,
      present,
    ]),
  );
  requireThat(
    presence.size === INVENTORY_APPLICATION_TABLES.length &&
      INVENTORY_APPLICATION_TABLES.every(
        (tableName) => typeof presence.get(tableName) === "boolean",
      ),
    "DATABASE_INVENTORY_CATALOG_INVALID",
  );

  const inventory = {};
  for (const tableName of INVENTORY_APPLICATION_TABLES) {
    const present = presence.get(tableName);
    let count = 0;
    if (present) {
      const result = await client.query(
        `SELECT count(*)::int AS count FROM public.${quoteIdentifier(tableName)}`,
      );
      count = result.rows[0]?.count;
      requireThat(
        Number.isInteger(count) && count >= 0,
        "DATABASE_INVENTORY_COUNT_INVALID",
      );
    }
    inventory[tableName] = { present, count };
  }
  return inventory;
}

export async function databaseInventory(
  client,
  { expectedDatabaseName = "postgres", expectedPrincipalName } = {},
) {
  const identity = await client.query(`
    SELECT current_user::text AS current_user,session_user::text AS session_user,
      r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,
      r.rolinherit,r.rolcanlogin,current_database() AS database_name
    FROM pg_roles r WHERE r.rolname=current_user
  `);
  const row = identity.rows[0];
  requireThat(
    Boolean(row) &&
      row.current_user === row.session_user &&
      row.rolsuper === false &&
      row.rolbypassrls === false &&
      row.rolcreaterole === true &&
      (expectedPrincipalName === undefined ||
        (row.current_user === expectedPrincipalName &&
          row.rolcreatedb === false &&
          row.rolreplication === false &&
          row.rolinherit === false &&
          row.rolcanlogin === true)) &&
      row.database_name === expectedDatabaseName,
    "MIGRATION_PRINCIPAL_INVALID",
  );
  const schemas = await client.query(
    `
    SELECT nspname FROM pg_namespace
    WHERE nspname=ANY($1::text[]) ORDER BY nspname
  `,
    [[...APP_SCHEMAS]],
  );
  const applicationTables = await applicationTableInventory(client);
  const tenantScoped = await tenantScopedInventory(client);
  const managed = await managedCatalogSnapshot(client);
  return {
    principal: row.current_user,
    applicationSchemas: schemas.rows.map(({ nspname }) => nspname),
    applicationTables,
    managedCatalogDigest: managed.digest,
    currentTenantCount: applicationTables.tenants.count,
    currentTenantUserCount: applicationTables.tenant_users.count,
    currentPlatformUserCount: applicationTables.platform_users.count,
    currentTenantScopedTableCount: tenantScoped.tableCount,
    currentTenantScopedRowCount: tenantScoped.rowCount,
    currentTenantScopedDigest: tenantScoped.digest,
  };
}

export async function resetRuntimePrincipalsForCanonicalRebuild(client) {
  const roles = ["fieldgrid_runtime_app", "fieldgrid_runtime_data"];
  const unsafeOwnership = await client.query(
    `
    SELECT role.rolname,namespace.nspname AS schema_name,relation.relname
    FROM pg_roles role
    JOIN pg_class relation ON relation.relowner=role.oid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE role.rolname=ANY($1::text[])
    UNION ALL
    SELECT role.rolname,namespace.nspname AS schema_name,NULL::name AS relname
    FROM pg_roles role
    JOIN pg_namespace namespace ON namespace.nspowner=role.oid
    WHERE role.rolname=ANY($1::text[])
    UNION ALL
    SELECT role.rolname,namespace.nspname AS schema_name,routine.proname AS relname
    FROM pg_roles role
    JOIN pg_proc routine ON routine.proowner=role.oid
    JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
    WHERE role.rolname=ANY($1::text[])
    ORDER BY 1,2,3
  `,
    [roles],
  );
  requireThat(
    unsafeOwnership.rows.length === 0,
    "RUNTIME_ROLE_OWNERSHIP_REMAINS",
    "SCHEMAS_CLEAN",
    true,
  );
  const principal = await client.query(
    "SELECT current_user::text AS current_user",
  );
  const hostedMigrationPrincipal =
    principal.rows[0]?.current_user === "fieldgrid_migration_admin";
  if (hostedMigrationPrincipal) {
    const bridge = await verifyHostedMigrationBridgeFinalState(client, {
      includeStorage: false,
      allowRuntimeAdaptersAbsent: true,
    }).catch(() => null);
    requireThat(
      bridge?.functionCount === 9,
      "HOSTED_MIGRATION_BRIDGE_INVALID",
      "SCHEMAS_CLEAN",
      true,
    );
  }
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    if (hostedMigrationPrincipal) {
      await client.query(
        "SELECT fieldgrid_migration_bridge.prepare_disposable_rebuild()",
      );
    }
    await client.query("DROP ROLE IF EXISTS fieldgrid_runtime_app");
    await client.query("DROP ROLE IF EXISTS fieldgrid_runtime_data");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
  return { rolesReset: roles };
}

export async function assertNoExternalWriters(
  client,
  { allowedSamePrincipalPids = [] } = {},
) {
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

  async function terminateWriterSessions() {
    const result = await client.query(
      `
      SELECT pid,pg_terminate_backend(pid) AS stopped
      FROM pg_stat_activity
      WHERE datname=current_database()
        AND pid<>pg_backend_pid()
        AND NOT (pid=ANY($1::int[]))
        AND backend_type='client backend'
        AND (
          usename=current_user
          OR usename=ANY(ARRAY[
            'fieldgrid_runtime_app','authenticator','anon','authenticated','service_role'
          ]::text[])
        )
      ORDER BY pid
    `,
      [allowedSamePrincipalPids],
    );
    requireThat(
      result.rows.every(({ stopped }) => stopped === true),
      "DATABASE_WRITER_TERMINATION_FAILED",
      "QUIESCED",
      true,
    );
    return result.rows.length;
  }

  let terminatedSessionCount = await terminateWriterSessions();
  const existingSchemas = await client.query(
    `SELECT nspname FROM pg_namespace WHERE nspname=ANY($1::text[]) ORDER BY nspname`,
    [[...APP_SCHEMAS]],
  );

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='15s'");
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fieldgrid_runtime_app') THEN
          ALTER ROLE fieldgrid_runtime_app NOLOGIN;
        END IF;
      END
      $$
    `);
    for (const { nspname: schema } of existingSchemas.rows) {
      await client.query(`GRANT USAGE ON SCHEMA ${schema} TO CURRENT_USER`);
      await client.query(
        `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA ${schema} FROM anon, authenticated, service_role`,
      );
      await client.query(
        `REVOKE USAGE ON SCHEMA ${schema} FROM PUBLIC, anon, authenticated, service_role`,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }

  // Close a same-principal session that arrived while privileges were fenced.
  // Known hosted migration-admin writers are additionally serialized by the
  // canonical veele-staging workflow concurrency group.
  terminatedSessionCount += await terminateWriterSessions();
  const proof = await client.query(
    `
    SELECT
      COALESCE((
        SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='fieldgrid_runtime_app'
      ),true) AS runtime_login_disabled,
      NOT EXISTS (
        SELECT 1
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname=ANY($1::text[])
          AND relation.relkind IN ('r','p')
          AND (
            has_table_privilege('anon',relation.oid,'INSERT')
            OR has_table_privilege('anon',relation.oid,'UPDATE')
            OR has_table_privilege('anon',relation.oid,'DELETE')
            OR has_table_privilege('anon',relation.oid,'TRUNCATE')
            OR has_table_privilege('authenticated',relation.oid,'INSERT')
            OR has_table_privilege('authenticated',relation.oid,'UPDATE')
            OR has_table_privilege('authenticated',relation.oid,'DELETE')
            OR has_table_privilege('authenticated',relation.oid,'TRUNCATE')
            OR has_table_privilege('service_role',relation.oid,'INSERT')
            OR has_table_privilege('service_role',relation.oid,'UPDATE')
            OR has_table_privilege('service_role',relation.oid,'DELETE')
            OR has_table_privilege('service_role',relation.oid,'TRUNCATE')
          )
      ) AS public_dml_revoked,
      NOT EXISTS (
        SELECT 1
        FROM pg_proc function_row
        JOIN pg_namespace namespace ON namespace.oid=function_row.pronamespace
        WHERE namespace.nspname=ANY($1::text[])
          AND (
            (
              has_schema_privilege('anon',namespace.oid,'USAGE')
              AND has_function_privilege('anon',function_row.oid,'EXECUTE')
            )
            OR (
              has_schema_privilege('authenticated',namespace.oid,'USAGE')
              AND has_function_privilege('authenticated',function_row.oid,'EXECUTE')
            )
            OR (
              has_schema_privilege('service_role',namespace.oid,'USAGE')
              AND has_function_privilege('service_role',function_row.oid,'EXECUTE')
            )
          )
      ) AS app_function_execute_revoked,
      NOT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE datname=current_database()
          AND pid<>pg_backend_pid()
          AND NOT (pid=ANY($2::int[]))
          AND backend_type='client backend'
          AND (
            usename=current_user
            OR usename=ANY(ARRAY[
              'fieldgrid_runtime_app','authenticator','anon','authenticated','service_role'
            ]::text[])
          )
      ) AS target_transactions_drained
  `,
    [[...APP_SCHEMAS], allowedSamePrincipalPids],
  );
  requireThat(
    proof.rows.length === 1,
    "DATABASE_WRITER_FENCE_PROOF_INVALID",
    "QUIESCED",
    true,
  );
  requireThat(
    proof.rows[0].runtime_login_disabled === true,
    "DATABASE_RUNTIME_LOGIN_FENCE_FAILED",
    "QUIESCED",
    true,
  );
  requireThat(
    proof.rows[0].public_dml_revoked === true,
    "DATABASE_DML_FENCE_FAILED",
    "QUIESCED",
    true,
  );
  requireThat(
    proof.rows[0].app_function_execute_revoked === true,
    "DATABASE_FUNCTION_FENCE_FAILED",
    "QUIESCED",
    true,
  );
  requireThat(
    proof.rows[0].target_transactions_drained === true,
    "DATABASE_SESSION_FENCE_FAILED",
    "QUIESCED",
    true,
  );
  return {
    runtimeLoginDisabled: true,
    publicDmlRevoked: true,
    appFunctionExecuteRevoked: true,
    targetTransactionsDrained: true,
    terminatedSessionCount,
  };
}

function migrationChildEnvironment(env) {
  return {
    PATH: env.PATH,
    HOME: env.HOME,
    LANG: "C.UTF-8",
    APP_ENV: env.APP_ENV,
    TARGET_ENVIRONMENT: env.TARGET_ENVIRONMENT,
    EXPECTED_SUPABASE_PROJECT_REF: env.EXPECTED_SUPABASE_PROJECT_REF,
    FORBIDDEN_SUPABASE_PROJECT_REF: env.FORBIDDEN_SUPABASE_PROJECT_REF,
    DATABASE_URL: env.DATABASE_URL,
    FIELDGRID_MIGRATION_DATABASE_URL: env.FIELDGRID_MIGRATION_DATABASE_URL,
    FIELDGRID_HOSTED_MIGRATION_BRIDGE: env.FIELDGRID_HOSTED_MIGRATION_BRIDGE,
    FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
    FIELDGRID_DATABASE_SSL_ROOT_CERT: env.FIELDGRID_DATABASE_SSL_ROOT_CERT,
    FIELDGRID_DB_RUNTIME_ENV_FILE_LOADING: "disabled",
    FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET:
      env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET,
    FIELDGRID_RUNTIME_SAFETY_RESET_CONFIRM:
      env.FIELDGRID_RUNTIME_SAFETY_RESET_CONFIRM,
    DB_SSL: env.DB_SSL ?? "true",
    DB_SSL_REJECT_UNAUTHORIZED: env.DB_SSL_REJECT_UNAUTHORIZED ?? "true",
    PGSSLMODE: env.PGSSLMODE ?? "verify-full",
  };
}

async function startMigrationWorker({ repoRoot, env }) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      join(repoRoot, "scripts/disposable-staging/migration-worker.mts"),
    ],
    {
      cwd: join(repoRoot, "lib/db"),
      env: migrationChildEnvironment(env),
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let buffer = "";
  let settled = false;
  const exited = once(child, "exit");
  const waiters = new Map();
  const messages = new Map();

  function rejectWaiters(error) {
    for (const { reject } of waiters.values()) reject(error);
    waiters.clear();
  }

  function receive(message) {
    const state = message?.state;
    if (typeof state !== "string") return;
    if (state === "failed") {
      const localSuffix =
        env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET === "1" &&
        typeof message.localCode === "string"
          ? `:${message.localCode}`
          : "";
      const failureStage =
        typeof message.failureStage === "string" &&
        /^(?:prepare-bridge|ensure-history|schema-guard|drizzle|legacy-prerequisites|sql|finalize-bridge|abort-bridge-cleanup|seed-rbac|seed-sectors|migrate|command)$/u.test(
          message.failureStage,
        )
          ? message.failureStage
          : "unknown";
      const sqlState =
        typeof message.sqlState === "string" &&
        /^[0-9A-Z]{5}$/u.test(message.sqlState)
          ? `:${message.sqlState}`
          : "";
      const migrationName =
        typeof message.migrationName === "string" &&
        /^[0-9A-Za-z][0-9A-Za-z._-]{0,127}\.sql$/u.test(message.migrationName)
          ? `:${message.migrationName}`
          : "";
      const failureCode =
        typeof message.failureCode === "string" &&
        /^HOSTED_MIGRATION_BRIDGE_[A-Z0-9_]+$/u.test(message.failureCode)
          ? `:${message.failureCode}`
          : "";
      rejectWaiters(
        new Error(
          `MIGRATION_WORKER_FAILED:${failureStage}${sqlState}${migrationName}${failureCode}${localSuffix}`,
        ),
      );
      return;
    }
    const waiter = waiters.get(state);
    if (waiter) {
      waiters.delete(state);
      waiter.resolve(message);
    } else {
      messages.set(state, message);
    }
  }

  child.stdout.on("data", (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("FIELDGRID_WORKER:")) {
        if (env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET === "1" && line) {
          process.stdout.write(`[fieldgrid:worker] ${line}\n`);
        }
        continue;
      }
      try {
        receive(JSON.parse(line.slice("FIELDGRID_WORKER:".length)));
      } catch {
        rejectWaiters(new Error("MIGRATION_WORKER_PROTOCOL_INVALID"));
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    if (env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET === "1") {
      process.stderr.write(chunk);
    }
  });
  child.on("message", receive);
  child.once("error", (error) => rejectWaiters(error));
  child.once("exit", (code, signal) => {
    settled = true;
    if (code !== 0) {
      const error = new Error("MIGRATION_WORKER_FAILED");
      error.code = "MIGRATION_WORKER_FAILED";
      error.exitCode = code;
      error.signal = signal;
      rejectWaiters(error);
    }
  });

  function waitFor(state) {
    const existing = messages.get(state);
    if (existing) {
      messages.delete(state);
      return Promise.resolve(existing);
    }
    if (settled) return Promise.reject(new Error("MIGRATION_WORKER_EXITED"));
    return new Promise((resolve, reject) => {
      waiters.set(state, { resolve, reject });
    });
  }

  const ready = await waitFor("ready");
  return {
    pid: ready.pid,
    role: ready.role,
    async arm(originalPassword) {
      child.send({ command: "arm", originalPassword });
      await waitFor("armed");
    },
    async migrate() {
      child.send({ command: "run" });
      await waitFor("migrated");
    },
    async release({ restoreCredential = false } = {}) {
      if (!settled)
        child.send({
          command: restoreCredential ? "recover-release" : "release",
        });
      await exited.catch(() => {});
    },
  };
}

export async function createWriterAdmissionGuard(
  client,
  { repoRoot, env = process.env, startWorker = startMigrationWorker } = {},
) {
  const worker = await startWorker({ repoRoot, env });
  let admissionApplied = false;
  const configuredUrl =
    env.APP_ENV === "staging" || env.APP_ENV === "production"
      ? env.FIELDGRID_MIGRATION_DATABASE_URL
      : (env.DATABASE_URL ?? env.FIELDGRID_MIGRATION_DATABASE_URL);
  let originalPassword;
  try {
    originalPassword = decodeURIComponent(new URL(configuredUrl).password);
  } catch {
    originalPassword = "";
  }

  async function setCurrentRolePassword(password) {
    await client.query(
      "SELECT set_config('fieldgrid.rebuild_role_password',$1,false)",
      [password],
    );
    try {
      await client.query(`
        DO $$
        BEGIN
          EXECUTE format(
            'ALTER ROLE %I PASSWORD %L',
            current_user,
            current_setting('fieldgrid.rebuild_role_password')
          );
        END
        $$
      `);
    } finally {
      await client
        .query("RESET fieldgrid.rebuild_role_password")
        .catch(() => {});
    }
  }

  try {
    const identity = await client.query(`
      SELECT pg_backend_pid()::int AS pid,current_user::text AS role_name
      FROM pg_roles WHERE rolname=current_user
    `);
    const current = identity.rows[0];
    requireThat(
      current &&
        worker.role === current.role_name &&
        Number.isInteger(worker.pid) &&
        worker.pid > 0 &&
        worker.pid !== current.pid &&
        typeof originalPassword === "string" &&
        originalPassword.length > 0,
      "MIGRATION_ADMISSION_IDENTITY_INVALID",
      "QUIESCED",
      true,
    );
    const terminateUnadmitted = () =>
      client.query(
        `
        SELECT pid,pg_terminate_backend(pid) AS stopped
        FROM pg_stat_activity
        WHERE usename=current_user
          AND backend_type='client backend'
          AND NOT (pid=ANY($1::int[]))
        ORDER BY pid
      `,
        [[current.pid, worker.pid]],
      );
    let terminated = await terminateUnadmitted();
    requireThat(
      terminated.rows.every(({ stopped }) => stopped === true),
      "MIGRATION_ADMISSION_TERMINATION_FAILED",
      "QUIESCED",
      true,
    );
    await worker.arm(originalPassword);
    await setCurrentRolePassword(randomBytes(32).toString("base64url"));
    admissionApplied = true;
    const lateSessions = await terminateUnadmitted();
    terminated = { rows: [...terminated.rows, ...lateSessions.rows] };
    requireThat(
      terminated.rows.every(({ stopped }) => stopped === true),
      "MIGRATION_ADMISSION_TERMINATION_FAILED",
      "QUIESCED",
      true,
    );
    const proof = await client.query(
      `
        SELECT COALESCE(array_agg(pid ORDER BY pid),'{}'::int[])
          AS admitted_pids
        FROM pg_stat_activity
        WHERE usename=current_user
          AND backend_type='client backend'
      `,
    );
    requireThat(
      JSON.stringify(proof.rows[0]?.admitted_pids) ===
        JSON.stringify([current.pid, worker.pid].sort((a, b) => a - b)),
      "MIGRATION_ADMISSION_PROOF_FAILED",
      "QUIESCED",
      true,
    );
    let released = false;
    return {
      allowedSamePrincipalPids: [worker.pid],
      async migrate() {
        await worker.migrate();
      },
      async release() {
        if (released) return;
        released = true;
        await setCurrentRolePassword(originalPassword);
        await worker.release();
      },
    };
  } catch (error) {
    let credentialRestored = !admissionApplied;
    if (admissionApplied) {
      await setCurrentRolePassword(originalPassword)
        .then(() => {
          credentialRestored = true;
        })
        .catch(() => {});
    }
    await worker
      .release({ restoreCredential: !credentialRestored })
      .catch(() => {});
    throw error;
  }
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
    const unknownStoragePolicies = await client.query(
      `SELECT policyname
       FROM pg_catalog.pg_policies
       WHERE schemaname='storage' AND tablename='objects'
         AND policyname<>ALL($1::text[])
       ORDER BY policyname`,
      [[...STORAGE_POLICIES, ...SUPERSEDED_STORAGE_POLICIES]],
    );
    requireThat(
      unknownStoragePolicies.rows.length === 0,
      "HOSTED_MIGRATION_BRIDGE_UNKNOWN_STORAGE_POLICY",
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
  const childEnv = migrationChildEnvironment(env);
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

function quoteIdentifier(value) {
  requireThat(
    typeof value === "string" && value.length > 0 && value.length <= 63,
    "TENANT_SCOPED_CATALOG_INVALID",
    "ACTIVATED",
    true,
  );
  return `"${value.replaceAll('"', '""')}"`;
}

export async function tenantScopedInventory(client) {
  const catalog = await client.query(`
    SELECT DISTINCT relation.relname AS table_name
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    JOIN pg_attribute column_row ON column_row.attrelid=relation.oid
    WHERE namespace.nspname='public'
      AND relation.relkind IN ('r','p')
      AND column_row.attname='tenant_id'
      AND column_row.attnum>0
      AND NOT column_row.attisdropped
    ORDER BY relation.relname
  `);
  const counts = {};
  for (const { table_name: tableName } of catalog.rows) {
    const result = await client.query(
      `SELECT count(*)::int AS count FROM public.${quoteIdentifier(tableName)} WHERE tenant_id IS NOT NULL`,
    );
    requireThat(
      Number.isInteger(result.rows[0]?.count) && result.rows[0].count >= 0,
      "TENANT_SCOPED_COUNT_INVALID",
      "ACTIVATED",
      true,
    );
    counts[tableName] = result.rows[0].count;
  }
  return {
    tableCount: Object.keys(counts).length,
    rowCount: Object.values(counts).reduce((sum, count) => sum + count, 0),
    digest: digest(counts),
  };
}

export async function verifyPlatformOnlyDatabaseState(
  client,
  expectedPlatformUserId,
) {
  const counts = await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.tenants) AS tenants,
      (SELECT count(*)::int FROM public.tenant_users) AS tenant_users,
      (SELECT count(*)::int FROM public.tenant_user_roles) AS tenant_user_roles,
      (SELECT count(*)::int FROM public.tenant_roles) AS tenant_roles,
      (SELECT count(*)::int FROM public.tenant_domains) AS tenant_domains,
      (SELECT count(*)::int FROM public.organization_settings) AS organization_settings,
      (SELECT count(*)::int FROM public.notification_delivery_queue) AS delivery_queue,
      (SELECT count(*)::int FROM public.notification_dispatches) AS dispatches,
      (SELECT count(*)::int FROM public.domain_events) AS domain_events
  `);
  const state = counts.rows[0] ?? {};
  requireThat(
    Object.values(state).every((count) => count === 0),
    "PLATFORM_ONLY_DATABASE_STATE_INVALID",
    "ACTIVATED",
    true,
  );
  const tenantScoped = await tenantScopedInventory(client);
  requireThat(
    tenantScoped.rowCount === 0,
    "PLATFORM_ONLY_TENANT_DATA_REMAINS",
    "ACTIVATED",
    true,
  );
  const platform = await client.query(`
    SELECT user_id,role,status
    FROM public.platform_users
    ORDER BY user_id
  `);
  requireThat(
    platform.rows.length === 1 &&
      platform.rows[0].user_id === expectedPlatformUserId &&
      platform.rows[0].role === "owner" &&
      platform.rows[0].status === "active",
    "PLATFORM_ONLY_OWNER_INVALID",
    "ACTIVATED",
    true,
  );
  return {
    tenantCount: 0,
    tenantUserCount: 0,
    tenantRoleMembershipCount: 0,
    tenantRoleCount: 0,
    tenantDomainCount: 0,
    organizationSettingsCount: 0,
    operationalQueueCount: 0,
    tenantScopedRowCount: 0,
    tenantScopedTableCount: tenantScoped.tableCount,
    tenantScopedDigest: tenantScoped.digest,
    platformUserCount: 1,
    activePlatformOwnerCount: 1,
    platformIdentityMatches: true,
  };
}

export async function verifyRebuiltDatabase(
  client,
  { requireHostedMigrationBridge = false } = {},
) {
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
  const hostedAuth = await client.query(`
    WITH required(table_name,constraint_name,definition) AS (VALUES
      ('personnel','personnel_user_id_fkey','FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('customers','customers_created_by_fkey','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('objects','objects_created_by_fkey','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('customer_notes','customer_notes_updated_by_fkey','FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('credential_recovery_challenges','credential_recovery_challenges_subject_fk','FOREIGN KEY (subject_user_id) REFERENCES auth.users(id) ON DELETE CASCADE')
    )
    SELECT required.table_name,required.constraint_name,
      pg_get_constraintdef(constraint_row.oid,true) AS definition
    FROM required
    LEFT JOIN pg_class relation ON relation.oid=to_regclass('public.' || required.table_name)
    LEFT JOIN pg_constraint constraint_row
      ON constraint_row.conrelid=relation.oid
     AND constraint_row.conname=required.constraint_name
    ORDER BY required.table_name,required.constraint_name
  `);
  requireThat(
    hostedAuth.rows.length === 5 &&
      hostedAuth.rows.every((row) => row.definition != null) &&
      hostedAuth.rows.every((row) => {
        const expected = {
          credential_recovery_challenges_subject_fk:
            "FOREIGN KEY (subject_user_id) REFERENCES auth.users(id) ON DELETE CASCADE",
          customer_notes_updated_by_fkey:
            "FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL",
          customers_created_by_fkey:
            "FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL",
          objects_created_by_fkey:
            "FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL",
          personnel_user_id_fkey:
            "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL",
        }[row.constraint_name];
        return row.definition === expected;
      }),
    "HOSTED_AUTH_FOREIGN_KEY_INVALID",
    "BOOTSTRAPPED",
    true,
  );
  let exactHostedBridge = null;
  if (requireHostedMigrationBridge) {
    const hostedBridge = await client.query(`
      SELECT
        (SELECT pg_get_userbyid(p.proowner)
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='app_private'
            AND p.oid=to_regprocedure('app_private.fieldgrid_auth_user_snapshot(uuid)')) AS snapshot_owner,
        (SELECT p.prosecdef
           FROM pg_proc p
          WHERE p.oid=to_regprocedure('app_private.fieldgrid_auth_user_snapshot(uuid)')) AS snapshot_security_definer,
        has_schema_privilege('fieldgrid_migration_admin','auth','USAGE') AS auth_usage,
        (SELECT count(*)::int
           FROM pg_auth_members membership
           JOIN pg_roles role_row ON role_row.oid=membership.roleid
           JOIN pg_roles member_row ON member_row.oid=membership.member
           JOIN pg_roles grantor_row ON grantor_row.oid=membership.grantor
          WHERE role_row.rolname='fieldgrid_migration_admin'
            AND member_row.rolname='postgres'
            AND grantor_row.rolname='postgres') AS temporary_membership_count,
        (SELECT count(*)::int
           FROM pg_trigger trigger_row
           JOIN pg_class relation ON relation.oid=trigger_row.tgrelid
           JOIN pg_namespace namespace_row ON namespace_row.oid=relation.relnamespace
          WHERE namespace_row.nspname='auth' AND relation.relname='users'
            AND trigger_row.tgname='on_auth_user_created'
            AND NOT trigger_row.tgisinternal) AS obsolete_trigger_count
    `);
    requireThat(
      hostedBridge.rows.length === 1 &&
        hostedBridge.rows[0]?.snapshot_owner === "postgres" &&
        hostedBridge.rows[0]?.snapshot_security_definer === true &&
        hostedBridge.rows[0]?.auth_usage === false &&
        hostedBridge.rows[0]?.temporary_membership_count === 0 &&
        hostedBridge.rows[0]?.obsolete_trigger_count === 0,
      "HOSTED_MIGRATION_BRIDGE_FINAL_STATE_INVALID",
      "BOOTSTRAPPED",
      true,
    );
    exactHostedBridge = await verifyHostedMigrationBridgeFinalState(
      client,
    ).catch(() => null);
    requireThat(
      exactHostedBridge !== null &&
        exactHostedBridge.functionCount === 9 &&
        exactHostedBridge.runtimeAdaptersInstalled === true &&
        exactHostedBridge.authSnapshot !== null &&
        exactHostedBridge.storage?.policyCount === 21 &&
        exactHostedBridge.storage?.bucketCount === 7 &&
        exactHostedBridge.storage?.objectCount === 0,
      "HOSTED_MIGRATION_BRIDGE_FINAL_STATE_INVALID",
      "BOOTSTRAPPED",
      true,
    );
  }
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
    hostedAuthForeignKeys: hostedAuth.rows.length,
    hostedMigrationBridgeFinalized: requireHostedMigrationBridge,
    hostedMigrationBridge: exactHostedBridge,
  };
}

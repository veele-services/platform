#!/usr/bin/env node

import {
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FIELDGRID_DATABASE_SSL_ROOT_CERT_ENV,
  SUPABASE_ROOT_2021_CA_SHA256,
  databaseNodePostgresSslConfig,
} from "./fieldgrid-database-root-cert.mjs";

export const RUNTIME_ROLE = "fieldgrid_runtime_app";
export const CAPABILITY_ROLE = "fieldgrid_runtime_data";
export const STAGING_PROJECT_REF = "olyfmekyqozxrbrwwszu";
export const STAGING_POOLER_PORT = "5432";
export const STAGING_DATABASE = "postgres";
export const CONFIRMATION = "fieldgrid-w00-runtime-principal-staging-v1";
export const MIGRATION_NAME =
  "20260909120000_runtime_least_privilege_principals.sql";

const runtimeUsername = `${RUNTIME_ROLE}.${STAGING_PROJECT_REF}`;
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const POOLER_HOST_ENV = "FIELDGRID_STAGING_DATABASE_POOLER_HOST";

export function describeRuntimeEndpoint(env = process.env) {
  assertStagingBindings(env, { requireConfirmation: false });
  const exactSha = assertExactCheckoutSha(env);
  const adminUrl = requireEnv(env, "FIELDGRID_MIGRATION_DATABASE_URL");
  const poolerHost = resolveStagingPoolerHost(adminUrl, env);
  databaseNodePostgresSslConfig(env);
  return {
    schemaVersion: 1,
    environment: "staging",
    exactSha,
    projectRef: STAGING_PROJECT_REF,
    connectionMode: "Supavisor session pooler",
    host: poolerHost,
    port: Number(STAGING_POOLER_PORT),
    database: STAGING_DATABASE,
    username: runtimeUsername,
    tls: "verify-full with pinned Supabase Root 2021 CA",
    rootCertificateSha256: SUPABASE_ROOT_2021_CA_SHA256,
    passwordGeneration: "Run locally: openssl rand -hex 32",
    requiredSecrets: [
      "FIELDGRID_RUNTIME_DATABASE_PASSWORD",
      "FIELDGRID_RUNTIME_DATABASE_URL",
      FIELDGRID_DATABASE_SSL_ROOT_CERT_ENV,
    ],
    runtimeUrlTemplate:
      `postgresql://${runtimeUsername}:<GENERATED_HEX_PASSWORD>`
      + `@${poolerHost}:${STAGING_POOLER_PORT}/${STAGING_DATABASE}`,
    note: "Generate once locally; store the same value in both runtime secrets. Never paste it into logs or workflow inputs.",
  };
}

export function buildScramVerifier(password, salt = randomBytes(16)) {
  assertRuntimePassword(password);
  if (!Buffer.isBuffer(salt) || salt.length !== 16) {
    throw new Error("SCRAM salt must be exactly 16 bytes.");
  }
  const iterations = 4096;
  const saltedPassword = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", saltedPassword)
    .update("Client Key")
    .digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", saltedPassword)
    .update("Server Key")
    .digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}`
    + `$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

export async function applyRuntimePassword(client, password) {
  const verifier = buildScramVerifier(password);
  const literal = quoteLiteral(verifier);
  await client.query("begin");
  try {
    await client.query("set local lock_timeout = '5s'");
    await client.query(
      `ALTER ROLE ${quoteIdentifier(RUNTIME_ROLE)} LOGIN PASSWORD ${literal}`,
    );
    const result = await client.query(
      `select rolcanlogin
       from pg_catalog.pg_roles
       where rolname = $1`,
      [RUNTIME_ROLE],
    );
    if (
      result.rows.length !== 1
      || result.rows[0].rolcanlogin !== true
    ) {
      throw new Error("The runtime role was not provisioned as LOGIN.");
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

export function assertRuntimePassword(password) {
  if (!/^[A-Za-z0-9_-]{32,128}$/u.test(password)) {
    throw new Error(
      "The runtime password must be 32-128 URL-safe ASCII characters.",
    );
  }
}

export function assertRuntimeUrl(value, password, expectedPoolerHost) {
  const parsed = assertRuntimeUrlDescriptor(value, expectedPoolerHost);
  if (
    decodeURIComponent(parsed.password) !== password
  ) {
    throw new Error("The runtime URL password does not match the generated secret.");
  }
  return value;
}

export function assertRuntimeUrlDescriptor(value, expectedPoolerHost) {
  assertStagingPoolerHost(expectedPoolerHost);
  const parsed = parseBoundPostgresUrl(value, "runtime");
  if (
    parsed.hostname !== expectedPoolerHost
    || parsed.port !== STAGING_POOLER_PORT
    || databaseName(parsed) !== STAGING_DATABASE
    || decodeURIComponent(parsed.username) !== runtimeUsername
  ) {
    throw new Error("The runtime URL does not match the canonical staging descriptor.");
  }
  return parsed;
}

export function assertMigrationAdminUrl(value) {
  const parsed = parseBoundPostgresUrl(value, "migration-admin");
  const username = decodeURIComponent(parsed.username);
  const directHost = `db.${STAGING_PROJECT_REF}.supabase.co`;
  if (
    isStagingPoolerHost(parsed.hostname)
    && parsed.port !== STAGING_POOLER_PORT
  ) {
    throw new Error(
      "The migration-admin URL must use the Supavisor session pooler on port 5432.",
    );
  }
  const poolerBound = isStagingPoolerHost(parsed.hostname)
    && username.endsWith(`.${STAGING_PROJECT_REF}`)
    && parsed.port === STAGING_POOLER_PORT;
  const directBound = parsed.hostname === directHost
    && username === "postgres"
    && parsed.port === "5432";
  if (
    databaseName(parsed) !== STAGING_DATABASE
    || (!poolerBound && !directBound)
    || username === runtimeUsername
  ) {
    throw new Error("The migration-admin URL is not bound to the staging project.");
  }
  return value;
}

export function resolveStagingPoolerHost(adminUrl, env = process.env) {
  assertMigrationAdminUrl(adminUrl);
  const parsed = parseBoundPostgresUrl(adminUrl, "migration-admin");
  const configuredHost = env[POOLER_HOST_ENV]?.trim();
  if (isStagingPoolerHost(parsed.hostname)) {
    if (configuredHost && configuredHost !== parsed.hostname) {
      throw new Error(
        "Configured pooler host conflicts with the migration-admin endpoint.",
      );
    }
    return parsed.hostname;
  }
  if (!configuredHost) {
    throw new Error(
      `${POOLER_HOST_ENV} is required when migration admin uses the direct endpoint.`,
    );
  }
  assertStagingPoolerHost(configuredHost);
  return configuredHost;
}

export function assertStagingPoolerHost(value) {
  if (!isStagingPoolerHost(value)) {
    throw new Error("The database pooler host is not in the staging Supabase region.");
  }
  return value;
}

function isStagingPoolerHost(value) {
  return /^aws-[0-9]+-eu-central-1\.pooler\.supabase\.com$/u.test(value ?? "");
}

function parseBoundPostgresUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`The ${label} database URL is invalid.`);
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol)
    || !parsed.hostname
    || !parsed.port
    || !parsed.username
    || !parsed.password
    || !databaseName(parsed)
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(
      `The ${label} URL must bind protocol, host, port, database, and credentials without overrides.`,
    );
  }
  return parsed;
}

function databaseName(parsed) {
  return parsed.pathname.startsWith("/") ? parsed.pathname.slice(1) : "";
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function normalizedSha256(value) {
  return createHash("sha256")
    .update(value.replaceAll("\r\n", "\n"))
    .digest("hex");
}

export function requireEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment binding: ${name}`);
  return value;
}

export function assertStagingBindings(
  env,
  { requireConfirmation = true } = {},
) {
  if (
    env.APP_ENV !== "staging"
    || env.TARGET_ENVIRONMENT !== "staging"
    || env.EXPECTED_SUPABASE_PROJECT_REF !== STAGING_PROJECT_REF
    || env.NEXT_PUBLIC_SUPABASE_URL !== `https://${STAGING_PROJECT_REF}.supabase.co`
    || (
      requireConfirmation
      && env.FIELDGRID_RUNTIME_PRINCIPAL_CONFIRM !== CONFIRMATION
    )
  ) {
    throw new Error("Runtime provisioning accepts only the exact staging bindings.");
  }
  if (env.PGOPTIONS?.trim()) {
    throw new Error("Ambient PostgreSQL session options are forbidden.");
  }
}

export function assertExactCheckoutSha(env) {
  const expectedSha = requireEnv(env, "FIELDGRID_RUNTIME_EXPECTED_SHA");
  if (!/^[0-9a-f]{40}$/u.test(expectedSha)) {
    throw new Error("FIELDGRID_RUNTIME_EXPECTED_SHA must be a full commit SHA.");
  }
  const actualSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (actualSha !== expectedSha) {
    throw new Error("Runtime provisioning checkout does not match the exact SHA.");
  }
  return expectedSha;
}

export function assertExactStagingEnvironment(env) {
  assertStagingBindings(env);
  return assertExactCheckoutSha(env);
}

async function assertAdminTopology(client) {
  await client.query("begin transaction read only");
  try {
    await client.query("set local statement_timeout = '10s'");
    await client.query("set local row_security = on");
    const identity = await client.query(`
      select
        current_user::text as current_user,
        session_user::text as session_user,
        role_row.rolsuper,
        role_row.rolbypassrls,
        role_row.rolcreaterole,
        pg_catalog.pg_has_role(
          current_user,
          'fieldgrid_runtime_app',
          'SET'
        ) as can_set_runtime,
        pg_catalog.pg_has_role(
          current_user,
          'fieldgrid_runtime_data',
          'SET'
        ) as can_set_data
      from pg_catalog.pg_roles role_row
      where role_row.rolname = current_user
    `);
    const row = identity.rows[0];
    if (
      !row
      || row.current_user !== row.session_user
      || row.rolsuper
      || row.rolbypassrls
      || !row.rolcreaterole
      || row.can_set_runtime
      || row.can_set_data
    ) {
      throw new Error("Migration-admin identity/topology is not exact.");
    }

    const topology = await client.query(`
      select
        configuration.migration_admin::text as expected_admin,
        configuration.app_admin_grantor::text as expected_app_grantor,
        configuration.data_admin_grantor::text as expected_data_grantor,
        parent.rolname::text as parent_role,
        member.rolname::text as member_role,
        grantor.rolname::text as grantor_role,
        membership.admin_option,
        membership.inherit_option,
        membership.set_option
      from app_private.fieldgrid_runtime_principal_configuration configuration
      cross join pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles parent on parent.oid = membership.roleid
      join pg_catalog.pg_roles member on member.oid = membership.member
      join pg_catalog.pg_roles grantor on grantor.oid = membership.grantor
      where configuration.singleton
        and parent.rolname in (
          'fieldgrid_runtime_app', 'fieldgrid_runtime_data'
        )
      order by parent.rolname, member.rolname, grantor.rolname
    `);
    const topologyRow = topology.rows[0];
    const appEdges = topology.rows.filter(
      (edge) => edge.parent_role === RUNTIME_ROLE,
    );
    const dataEdges = topology.rows.filter(
      (edge) => edge.parent_role === CAPABILITY_ROLE,
    );
    const appAdminEdge = appEdges[0];
    const dataAdminEdge = dataEdges.find(
      (edge) => edge.member_role === row.current_user,
    );
    const appCapabilityEdge = dataEdges.find(
      (edge) => edge.member_role === RUNTIME_ROLE,
    );
    if (
      !topologyRow
      || topologyRow.expected_admin !== row.current_user
      || appEdges.length !== 1
      || dataEdges.length !== 2
      || appAdminEdge.member_role !== row.current_user
      || !appAdminEdge.admin_option
      || appAdminEdge.inherit_option
      || appAdminEdge.set_option
      || appAdminEdge.grantor_role !== topologyRow.expected_app_grantor
      || !dataAdminEdge?.admin_option
      || dataAdminEdge.inherit_option
      || dataAdminEdge.set_option
      || dataAdminEdge.grantor_role !== topologyRow.expected_data_grantor
      || appCapabilityEdge?.admin_option
      || !appCapabilityEdge?.inherit_option
      || appCapabilityEdge?.set_option
    ) {
      throw new Error("Runtime role administrator membership has drifted.");
    }

    const owners = await client.query(`
      select count(*)::integer as exact_owner_rows
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = relation.relnamespace
      where namespace_row.nspname = 'public'
        and relation.relname in ('organization_settings', 'tenant_domains')
        and relation.relowner = current_user::pg_catalog.regrole::oid
        and relation.relrowsecurity
        and not relation.relforcerowsecurity
    `);
    if (owners.rows[0]?.exact_owner_rows !== 2) {
      throw new Error("Migration admin is not the non-forced RLS owner for both W00 targets.");
    }

    const migrationPath = new URL(`../lib/db/migrations/${MIGRATION_NAME}`, import.meta.url);
    const expectedHash = normalizedSha256(readFileSync(migrationPath, "utf8"));
    const history = await client.query(
      `select hash from drizzle.veele_sql_migrations where name = $1`,
      [MIGRATION_NAME],
    );
    if (history.rows.length !== 1 || history.rows[0].hash !== expectedHash) {
      throw new Error("The exact runtime-principal migration is not applied.");
    }
  } finally {
    await client.query("rollback").catch(() => {});
  }
}

async function proveRuntimeHandshake(Client, runtimeUrl, ssl) {
  const client = new Client({
    connectionString: runtimeUrl,
    ssl,
    application_name: "fieldgrid-w00-runtime-principal-provision-proof",
  });
  await client.connect();
  try {
    const identity = await client.query(`
      select current_user::text as current_user,
             session_user::text as session_user,
             role_row.rolcanlogin,
             role_row.rolsuper,
             role_row.rolcreatedb,
             role_row.rolcreaterole,
             role_row.rolreplication,
             role_row.rolbypassrls
      from pg_catalog.pg_roles role_row
      where role_row.rolname = current_user
    `);
    const row = identity.rows[0];
    if (
      !row
      || row.current_user !== RUNTIME_ROLE
      || row.session_user !== RUNTIME_ROLE
      || !row.rolcanlogin
      || row.rolsuper
      || row.rolcreatedb
      || row.rolcreaterole
      || row.rolreplication
      || row.rolbypassrls
    ) {
      throw new Error("The pre-set runtime URL did not prove the exact runtime identity.");
    }
  } finally {
    await client.end().catch(() => {});
  }
}

async function apply(env) {
  const exactSha = assertExactStagingEnvironment(env);
  const password = requireEnv(env, "FIELDGRID_RUNTIME_DATABASE_PASSWORD");
  assertRuntimePassword(password);
  const adminUrl = assertMigrationAdminUrl(
    requireEnv(env, "FIELDGRID_MIGRATION_DATABASE_URL"),
  );
  const poolerHost = resolveStagingPoolerHost(adminUrl, env);
  const runtimeUrl = assertRuntimeUrl(
    requireEnv(env, "FIELDGRID_RUNTIME_DATABASE_URL"),
    password,
    poolerHost,
  );
  const ssl = databaseNodePostgresSslConfig(env);
  const dbRequire = createRequire(
    new URL("../lib/db/package.json", import.meta.url),
  );
  const { Client } = dbRequire("pg");
  const admin = new Client({
    connectionString: adminUrl,
    ssl,
    application_name: "fieldgrid-w00-runtime-principal-provision",
  });
  await admin.connect();
  try {
    await assertAdminTopology(admin);
    await applyRuntimePassword(admin, password);
  } finally {
    await admin.end().catch(() => {});
  }
  await proveRuntimeHandshake(Client, runtimeUrl, ssl);
  return {
    status: "passed",
    action: "apply",
    exactSha,
    role: RUNTIME_ROLE,
    passwordFormat: "SCRAM-SHA-256",
    runtimeHandshake: true,
    deployed: false,
    restarted: false,
  };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.length !== 1 || !["--describe", "--apply"].includes(argv[0])) {
    throw new Error(
      "Usage: fieldgrid-w00-runtime-principal.mjs --describe|--apply",
    );
  }
  if (argv[0] === "--describe") {
    process.stdout.write(`${JSON.stringify(describeRuntimeEndpoint(env), null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await apply(env))}\n`);
}

if (
  process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((error) => {
    const failure = {
      status: "failed",
      code: typeof error?.code === "string" ? error.code : null,
      kind: typeof error?.name === "string" ? error.name : "UnknownError",
    };
    process.stderr.write(`${JSON.stringify(failure)}\n`);
    process.exitCode = 1;
  });
}

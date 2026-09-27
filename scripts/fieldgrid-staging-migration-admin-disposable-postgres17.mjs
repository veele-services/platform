import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import {
  bootstrapDatabase,
  verifyBootstrap,
} from "./disposable-staging/bootstrap.mjs";
import {
  databaseInventory,
  resetApplicationSchemas,
  resetRuntimePrincipalsForCanonicalRebuild,
  verifyPlatformOnlyDatabaseState,
  verifyRebuiltDatabase,
} from "./disposable-staging/database.mjs";

const require = createRequire(
  new URL("../lib/db/package.json", import.meta.url),
);
const { Client } = require("pg");

const migrationSource = new URL(
  process.env.FIELDGRID_MIGRATION_DATABASE_URL ?? "",
);
const providerSource = new URL(
  process.env.FIELDGRID_BOOTSTRAP_ROOT_DATABASE_URL ?? "",
);
const loopback = new Set(["127.0.0.1", "localhost"]);
if (
  process.env.FIELDGRID_BOOTSTRAP_POSTGRES17_TEST !== "1" ||
  !loopback.has(migrationSource.hostname) ||
  !loopback.has(providerSource.hostname) ||
  migrationSource.pathname !== "/postgres" ||
  providerSource.pathname !== "/postgres" ||
  decodeURIComponent(migrationSource.username) !==
    "fieldgrid_migration_admin" ||
  decodeURIComponent(providerSource.username) !== "supabase_admin"
) {
  throw new Error(
    "hosted disposable PostgreSQL 17 test requires its explicit guarded local database",
  );
}

const platformId = "30000000-0000-4000-8000-000000000001";
const bootstrap = {
  platform: {
    email: "platform@example.invalid",
    password: "platform-password-123",
    name: "Platform beheerder",
  },
};

function migrationEnvironment(extra = {}) {
  return {
    ...process.env,
    APP_ENV: "test",
    TARGET_ENVIRONMENT: "test",
    DATABASE_URL: migrationSource.toString(),
    FIELDGRID_MIGRATION_DATABASE_URL: migrationSource.toString(),
    FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
    FIELDGRID_DB_RUNTIME_ENV_FILE_LOADING: "disabled",
    FIELDGRID_HOSTED_MIGRATION_BRIDGE: "disposable-rebuild-v1",
    DB_SSL: "false",
    PGSSLMODE: "disable",
    ...extra,
  };
}

function run(
  command,
  args,
  env,
  { expectFailure = false, failurePattern } = {},
) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    timeout: 15 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (expectFailure) {
    assert.notEqual(result.status, 0, "fault injection must fail closed");
    if (failurePattern) {
      assert.match(
        `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
        failurePattern,
      );
    }
    return;
  }
  if (result.status !== 0) {
    const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
      .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/giu, "postgresql://[redacted]")
      .slice(-4_000);
    throw new Error(
      `${command} failed with status ${result.status}\n${diagnostic}`,
    );
  }
}

async function temporaryPrivileges(client) {
  const result = await client.query(`
    SELECT
      has_schema_privilege('fieldgrid_migration_admin','auth','USAGE') AS auth_usage,
      has_schema_privilege('fieldgrid_migration_admin','storage','USAGE') AS storage_usage,
      (SELECT count(*)::int
         FROM pg_auth_members membership
         JOIN pg_roles role_row ON role_row.oid=membership.roleid
         JOIN pg_roles member_row ON member_row.oid=membership.member
         JOIN pg_roles grantor_row ON grantor_row.oid=membership.grantor
        WHERE role_row.rolname='fieldgrid_migration_admin'
          AND member_row.rolname='postgres'
          AND grantor_row.rolname='postgres') AS temporary_membership_count
  `);
  return result.rows[0];
}

const migration = new Client({
  connectionString: migrationSource.toString(),
  application_name: "fieldgrid-hosted-disposable-pg17-migration",
});
const provider = new Client({
  connectionString: providerSource.toString(),
  application_name: "fieldgrid-hosted-disposable-pg17-provider",
});
await migration.connect();
await provider.connect();

try {
  await resetApplicationSchemas(migration);
  await resetRuntimePrincipalsForCanonicalRebuild(migration);
  await provider.query("DELETE FROM auth.users");

  run(
    "pnpm",
    ["--filter", "@workspace/db", "run", "db:migrate"],
    migrationEnvironment({
      FIELDGRID_SQL_MIGRATION_MAX_NAME: "024_harden_invite_trigger.sql",
    }),
    { expectFailure: true },
  );

  assert.deepEqual(await temporaryPrivileges(migration), {
    auth_usage: false,
    storage_usage: false,
    temporary_membership_count: 0,
  });
  const partial = await databaseInventory(migration, {
    expectedDatabaseName: "postgres",
    expectedPrincipalName: "fieldgrid_migration_admin",
  });
  assert.equal(partial.applicationSchemas.includes("public"), true);
  assert.equal(partial.applicationSchemas.includes("drizzle"), true);
  assert.ok(partial.currentTenantScopedTableCount >= 0);

  await migration.query(`
    CREATE FUNCTION public.fieldgrid_unexpected_storage_policy_guard()
    RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT true'
  `);
  await provider.query(`
    CREATE POLICY fieldgrid_unexpected_fixture_policy
      ON storage.objects FOR SELECT TO PUBLIC
      USING (public.fieldgrid_unexpected_storage_policy_guard())
  `);
  await assert.rejects(
    resetApplicationSchemas(migration),
    /HOSTED_MIGRATION_BRIDGE_UNKNOWN_STORAGE_POLICY/u,
  );
  const retainedUnknownPolicy = await provider.query(`
    SELECT count(*)::int AS count
    FROM pg_catalog.pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='fieldgrid_unexpected_fixture_policy'
  `);
  assert.equal(retainedUnknownPolicy.rows[0]?.count, 1);
  assert.deepEqual(await temporaryPrivileges(migration), {
    auth_usage: false,
    storage_usage: false,
    temporary_membership_count: 0,
  });
  await provider.query(
    "DROP POLICY fieldgrid_unexpected_fixture_policy ON storage.objects",
  );
  await migration.query(
    "DROP FUNCTION public.fieldgrid_unexpected_storage_policy_guard()",
  );
  await provider.query(
    `INSERT INTO storage.buckets(
       id,name,owner,owner_id,public,file_size_limit,allowed_mime_types
     ) VALUES (
       'documents','documents',$1::uuid,$2::text,false,1,ARRAY['text/plain']::text[]
     )
     ON CONFLICT(id) DO UPDATE SET
       owner=excluded.owner,owner_id=excluded.owner_id,
       file_size_limit=excluded.file_size_limit,
       allowed_mime_types=excluded.allowed_mime_types`,
    [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000001",
    ],
  );

  await resetApplicationSchemas(migration);
  await resetRuntimePrincipalsForCanonicalRebuild(migration);
  run(
    "pnpm",
    ["--filter", "@workspace/db", "run", "db:migrate"],
    migrationEnvironment(),
  );
  run(
    "pnpm",
    ["--filter", "@workspace/db", "exec", "tsx", "src/seed/rbac.ts"],
    migrationEnvironment(),
  );
  run(
    "pnpm",
    ["--filter", "@workspace/db", "exec", "tsx", "src/seed/sectors.ts"],
    migrationEnvironment(),
  );

  assert.deepEqual(await temporaryPrivileges(migration), {
    auth_usage: false,
    storage_usage: false,
    temporary_membership_count: 0,
  });
  await provider.query(
    "INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES ($1,$2,$3::jsonb)",
    [
      platformId,
      bootstrap.platform.email,
      JSON.stringify({ portal: "platform-admin", platform_role: "owner" }),
    ],
  );
  await bootstrapDatabase(migration, bootstrap, { platform: platformId });
  const database = await verifyRebuiltDatabase(migration, {
    requireHostedMigrationBridge: true,
  });
  const bootstrapProof = await verifyBootstrap(migration, bootstrap, {
    platform: platformId,
  });
  const firstFinalState = await verifyPlatformOnlyDatabaseState(
    migration,
    platformId,
  );
  const canonicalBucketOwnership = await provider.query(`
    SELECT owner,owner_id FROM storage.buckets
    WHERE id='documents'
  `);
  assert.deepEqual(canonicalBucketOwnership.rows, [
    { owner: null, owner_id: null },
  ]);
  const authState = await provider.query(
    "SELECT id,email,raw_app_meta_data FROM auth.users ORDER BY id",
  );
  assert.deepEqual(authState.rows, [
    {
      id: platformId,
      email: bootstrap.platform.email,
      raw_app_meta_data: {
        portal: "platform-admin",
        platform_role: "owner",
      },
    },
  ]);
  assert.equal(firstFinalState.tenantCount, 0);
  assert.equal(firstFinalState.tenantScopedRowCount, 0);
  assert.equal(firstFinalState.platformUserCount, 1);
  assert.equal(firstFinalState.activePlatformOwnerCount, 1);

  // A completed rebuild leaves runtime adapter ACLs on the persistent bridge.
  // Prove that the next rebuild revokes those ACLs before dropping/recreating
  // runtime principals, then reaches the same canonical final state again.
  await resetApplicationSchemas(migration);
  await resetRuntimePrincipalsForCanonicalRebuild(migration);
  const resetRoles = await migration.query(`
    SELECT count(*)::int AS count FROM pg_roles
    WHERE rolname IN ('fieldgrid_runtime_app','fieldgrid_runtime_data')
  `);
  assert.equal(resetRoles.rows[0]?.count, 0);
  run(
    "pnpm",
    ["--filter", "@workspace/db", "run", "db:migrate"],
    migrationEnvironment(),
  );
  run(
    "pnpm",
    ["--filter", "@workspace/db", "exec", "tsx", "src/seed/rbac.ts"],
    migrationEnvironment(),
  );
  run(
    "pnpm",
    ["--filter", "@workspace/db", "exec", "tsx", "src/seed/sectors.ts"],
    migrationEnvironment(),
  );
  await bootstrapDatabase(migration, bootstrap, { platform: platformId });
  const retryDatabase = await verifyRebuiltDatabase(migration, {
    requireHostedMigrationBridge: true,
  });
  const finalState = await verifyPlatformOnlyDatabaseState(
    migration,
    platformId,
  );
  assert.equal(finalState.tenantCount, 0);
  assert.equal(finalState.tenantScopedRowCount, 0);
  assert.equal(finalState.platformUserCount, 1);
  assert.equal(finalState.activePlatformOwnerCount, 1);
  process.stdout.write(
    `${JSON.stringify({ status: "passed", postgresMajor: 17, faultRetry: true, completedRetry: true, hostedMigrationBridge: database.hostedMigrationBridgeFinalized && retryDatabase.hostedMigrationBridgeFinalized, bootstrap: bootstrapProof, finalState })}\n`,
  );
} finally {
  await provider.end().catch(() => {});
  await migration.end().catch(() => {});
}

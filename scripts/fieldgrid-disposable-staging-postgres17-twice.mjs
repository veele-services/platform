import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { runPostRebuildAcceptance } from "./disposable-staging/acceptance.mjs";
import { bootstrapDatabase } from "./disposable-staging/bootstrap.mjs";
import {
  assertNoExternalWriters,
  createWriterAdmissionGuard,
  databaseInventory,
  resetApplicationSchemas,
  resetRuntimePrincipalsForCanonicalRebuild,
} from "./disposable-staging/database.mjs";
import { verifyPostgres17Rebuild } from "./fieldgrid-disposable-staging-postgres17.mjs";

const require = createRequire(
  new URL("../lib/db/package.json", import.meta.url),
);
const { Client } = require("pg");
const source = new URL(process.env.DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(source.hostname) ||
  source.pathname !== "/fieldgrid_runtime_safety"
) {
  throw new Error(
    "twice-clean test requires the guarded local fieldgrid_runtime_safety database",
  );
}

const scenarios = [
  {
    databaseName: "fieldgrid_disposable_rebuild_one",
    faults: ["fault-after-schema-reset", "fault-during-migrations"],
  },
  {
    databaseName: "fieldgrid_disposable_rebuild_two",
    faults: ["fault-during-bootstrap"],
  },
];
const PLATFORM_ID = "30000000-0000-4000-8000-000000000001";

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed with status ${result.status}`);
}

function expectedDatabaseName(connectionString) {
  return decodeURIComponent(new URL(connectionString).pathname.slice(1));
}

async function inspectDatabase(client, connectionString) {
  return databaseInventory(client, {
    expectedDatabaseName: expectedDatabaseName(connectionString),
  });
}

async function runLocalAcceptance(
  { bootstrap, database },
  { env, runId, attempt },
) {
  const identitiesByEmail = new Map([
    [
      bootstrap.platform.email,
      {
        id: PLATFORM_ID,
        email: bootstrap.platform.email,
        password: bootstrap.platform.password,
        appMetadata: { portal: "platform-admin", platform_role: "owner" },
      },
    ],
  ]);
  const storageObjects = new Map();
  const provider = {
    async createIdentity(identity) {
      const id = randomUUID();
      const email = identity.email.toLowerCase();
      await database.query(
        `
        INSERT INTO auth.users(
          id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data
        )
        VALUES ($1,$2,now(),$3::jsonb,$4::jsonb)
      `,
        [
          id,
          email,
          JSON.stringify({ portal: identity.portal }),
          JSON.stringify({ acceptance_run: identity.acceptanceRun }),
        ],
      );
      identitiesByEmail.set(email, {
        id,
        email,
        password: identity.password,
        acceptanceRun: identity.acceptanceRun,
        appMetadata: { portal: identity.portal },
      });
      return id;
    },
    async removeStorageObject(bucket, path) {
      assert.equal(bucket, "documents");
      storageObjects.delete(path);
    },
    async deleteAcceptanceIdentities(acceptanceRun) {
      await database.query(
        "DELETE FROM auth.users WHERE raw_user_meta_data->>'acceptance_run'=$1",
        [acceptanceRun],
      );
      for (const [email, identity] of identitiesByEmail) {
        if (identity.acceptanceRun === acceptanceRun) {
          identitiesByEmail.delete(email);
        }
      }
    },
  };

  function createClient() {
    let signedIn;
    async function canAccess(path) {
      if (!signedIn) return false;
      const [prefix, tenantId] = path.split("/");
      if (prefix !== "tenant" || !tenantId) return false;
      const membership = await database.query(
        `
        SELECT 1 FROM public.tenant_users
        WHERE user_id=$1 AND tenant_id=$2 AND status='active'
      `,
        [signedIn.id, tenantId],
      );
      return membership.rows.length === 1;
    }
    return {
      auth: {
        async signInWithPassword({ email, password }) {
          const identity = identitiesByEmail.get(email.toLowerCase());
          if (!identity || identity.password !== password) {
            return { data: {}, error: new Error("invalid credentials") };
          }
          signedIn = identity;
          return {
            data: {
              user: {
                id: identity.id,
                email: identity.email,
                app_metadata: identity.appMetadata,
              },
            },
            error: null,
          };
        },
        async signOut() {
          signedIn = undefined;
          return { error: null };
        },
      },
      from(table) {
        assert.equal(table, "tenant_users");
        return {
          select() {
            return {
              async in(column, tenantIds) {
                assert.equal(column, "tenant_id");
                if (!signedIn) return { data: [], error: null };
                const membership = await database.query(
                  `
                  SELECT tenant_id,user_id,status
                  FROM public.tenant_users
                  WHERE user_id=$1 AND tenant_id=ANY($2::uuid[])
                  ORDER BY tenant_id
                `,
                  [signedIn.id, tenantIds],
                );
                return { data: membership.rows, error: null };
              },
            };
          },
        };
      },
      storage: {
        from(bucket) {
          assert.equal(bucket, "documents");
          return {
            async upload(path, body) {
              if (!(await canAccess(path)) || storageObjects.has(path)) {
                return { error: new Error("storage upload denied") };
              }
              storageObjects.set(path, Buffer.from(body));
              return { data: { path }, error: null };
            },
            async download(path) {
              if (!(await canAccess(path)) || !storageObjects.has(path)) {
                return { data: null, error: new Error("storage read denied") };
              }
              return {
                data: new Blob([storageObjects.get(path)]),
                error: null,
              };
            },
            async remove(paths) {
              for (const path of paths) {
                if (!(await canAccess(path))) {
                  return { error: new Error("storage delete denied") };
                }
                storageObjects.delete(path);
              }
              return { error: null };
            },
          };
        },
      },
    };
  }

  const proof = await runPostRebuildAcceptance({
    env,
    bootstrap,
    candidateSha: "c".repeat(40),
    runId,
    attempt,
    database,
    provider,
    createClient,
  });
  const remainingAuth = await database.query(
    "SELECT id FROM auth.users ORDER BY id",
  );
  assert.deepEqual(remainingAuth.rows, [{ id: PLATFORM_ID }]);
  assert.equal(storageObjects.size, 0);
  return proof;
}

async function fullRebuild(env, { initial = false } = {}) {
  if (initial) {
    run("pnpm", ["fieldgrid:runtime-safety:setup"], env);
    run(
      "pnpm",
      ["--filter", "@workspace/db", "exec", "tsx", "src/seed/rbac.ts"],
      env,
    );
    run(
      "pnpm",
      ["--filter", "@workspace/db", "exec", "tsx", "src/seed/sectors.ts"],
      env,
    );
    return;
  }

  const client = new Client({
    connectionString: env.DATABASE_URL,
    application_name: "fieldgrid-disposable-full-retry",
  });
  await client.connect();
  let admission;
  try {
    const preflight = await inspectDatabase(client, env.DATABASE_URL);
    assert.deepEqual(Object.keys(preflight.applicationTables).sort(), [
      "platform_users",
      "tenant_users",
      "tenants",
    ]);
    assert.equal(preflight.currentTenantScopedRowCount >= 0, true);
    await assertNoExternalWriters(client);
    admission = await createWriterAdmissionGuard(client, {
      repoRoot: process.cwd(),
      env,
    });

    const reentrantWriter = new Client({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 2000,
      application_name: "fieldgrid-disposable-reentry-after-admission",
    });
    await assert.rejects(reentrantWriter.connect());
    await reentrantWriter.end().catch(() => {});

    await resetApplicationSchemas(client);
    await resetRuntimePrincipalsForCanonicalRebuild(client);
    await client.query("DELETE FROM auth.users");
    await admission.migrate();
    const proof = await verifyPostgres17Rebuild(client, {
      allowedSamePrincipalPids: admission.allowedSamePrincipalPids,
      runAcceptance: (context) =>
        runLocalAcceptance(context, {
          env,
          runId: "pg17-retry",
          attempt: "1",
        }),
    });
    assert.equal(proof.acceptance.fixtureCleanupComplete, true);
    assert.equal(proof.finalState.tenantCount, 0);
    assert.equal(proof.finalState.tenantScopedRowCount, 0);
    assert.equal(proof.finalState.platformUserCount, 1);
    assert.equal(proof.finalState.activePlatformOwnerCount, 1);
    process.stdout.write(`${JSON.stringify(proof)}\n`);
  } finally {
    await admission?.release().catch(() => {});
    await client.end();
  }
}

async function proveSamePrincipalFence(connectionString) {
  const primary = new Client({
    connectionString,
    application_name: "fieldgrid-disposable-primary",
  });
  const secondaryWriter = new Client({
    connectionString,
    application_name: "fieldgrid-disposable-secondary-writer",
  });
  secondaryWriter.on("error", () => {});
  await primary.connect();
  await secondaryWriter.connect();
  try {
    await secondaryWriter.query("BEGIN");
    const proof = await assertNoExternalWriters(primary);
    assert.ok(proof.terminatedSessionCount >= 1);
    await assert.rejects(secondaryWriter.query("SELECT 1"));

    const reentrantWriter = new Client({
      connectionString,
      application_name: "fieldgrid-disposable-reentrant-writer",
    });
    reentrantWriter.on("error", () => {});
    await reentrantWriter.connect();
    try {
      const secondProof = await assertNoExternalWriters(primary);
      assert.ok(secondProof.terminatedSessionCount >= 1);
      await assert.rejects(reentrantWriter.query("SELECT 1"));
    } finally {
      await reentrantWriter.end().catch(() => {});
    }
  } finally {
    await secondaryWriter.end().catch(() => {});
    await primary.end();
  }
}

async function injectFault(connectionString, env, fault) {
  const client = new Client({
    connectionString,
    application_name: `fieldgrid-disposable-${fault}`,
  });
  await client.connect();
  try {
    // Match hosted Supabase's provider-owned extension schema.
    await client.query("CREATE SCHEMA IF NOT EXISTS extensions");
    await assertNoExternalWriters(client);
    await resetApplicationSchemas(client);
    if (fault === "fault-during-migrations") {
      await client.query("CREATE SCHEMA drizzle");
      await client.query(`
        CREATE TABLE public.disposable_partial_migration_probe(
          id bigint PRIMARY KEY
        )
      `);
    }
  } finally {
    await client.end();
  }

  if (fault === "fault-during-bootstrap") {
    run("pnpm", ["--filter", "@workspace/db", "run", "db:migrate"], env);
  }
  if (fault === "fault-during-bootstrap") {
    run(
      "pnpm",
      ["--filter", "@workspace/db", "exec", "tsx", "src/seed/rbac.ts"],
      env,
    );
    run(
      "pnpm",
      ["--filter", "@workspace/db", "exec", "tsx", "src/seed/sectors.ts"],
      env,
    );
    const bootstrapClient = new Client({
      connectionString,
      application_name: "fieldgrid-disposable-bootstrap-fault",
    });
    await bootstrapClient.connect();
    try {
      await bootstrapClient.query("DELETE FROM auth.users");
      await bootstrapClient.query(
        "INSERT INTO auth.users(id,email) VALUES ($1,$2)",
        [PLATFORM_ID, "platform@example.invalid"],
      );
      const injectedClient = {
        query(sql, values) {
          if (String(sql).includes("INSERT INTO public.platform_users")) {
            throw new Error("synthetic fault during bootstrap");
          }
          return bootstrapClient.query(sql, values);
        },
      };
      await assert.rejects(
        bootstrapDatabase(
          injectedClient,
          { platform: { email: "platform@example.invalid" } },
          { platform: PLATFORM_ID },
        ),
        /synthetic fault during bootstrap/u,
      );
    } finally {
      await bootstrapClient.end();
    }
  }
  process.stdout.write(`[fieldgrid:postgres17] injected ${fault}\n`);

  // A new attempt must inventory and fence safely when the prior attempt
  // stopped after reset or after only part of the schema was reconstructed.
  const retryGuard = new Client({
    connectionString,
    application_name: "fieldgrid-disposable-retry-guard",
  });
  await retryGuard.connect();
  try {
    const inventory = await inspectDatabase(retryGuard, connectionString);
    if (
      ["fault-after-schema-reset", "fault-during-migrations"].includes(fault)
    ) {
      assert.deepEqual(inventory.applicationTables, {
        tenants: { present: false, count: 0 },
        tenant_users: { present: false, count: 0 },
        platform_users: { present: false, count: 0 },
      });
      assert.equal(inventory.applicationSchemas.includes("public"), true);
      assert.equal(inventory.applicationSchemas.includes("app_private"), false);
      assert.equal(inventory.currentTenantScopedTableCount, 0);
      assert.equal(inventory.currentTenantScopedRowCount, 0);
    }
    await assertNoExternalWriters(retryGuard);
  } finally {
    await retryGuard.end();
  }
}

const admin = new Client({ connectionString: source.toString() });
await admin.connect();
const migrationRole = "fieldgrid_disposable_rebuild_admin";

async function assertMigrationRoleAbsent() {
  const existing = await admin.query(
    "SELECT 1 FROM pg_roles WHERE rolname=$1",
    [migrationRole],
  );
  assert.equal(
    existing.rows.length,
    0,
    `Disposable PostgreSQL 17 harness requires a fresh cluster without role ${migrationRole}`,
  );
}
try {
  await admin.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
    END
    $$
  `);
  await assertMigrationRoleAbsent();
  await admin.query(
    `CREATE ROLE ${migrationRole} LOGIN CREATEROLE CREATEDB PASSWORD 'fieldgrid-rebuild-test'`,
  );
  for (const { databaseName, faults } of scenarios) {
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1",
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.query(`CREATE DATABASE ${databaseName} OWNER ${migrationRole}`);
    const target = new URL(source);
    target.pathname = `/${databaseName}`;
    const providerAdmin = new Client({ connectionString: target.toString() });
    await providerAdmin.connect();
    try {
      await providerAdmin.query("CREATE SCHEMA extensions");
      await providerAdmin.query("CREATE EXTENSION pgcrypto SCHEMA extensions");
    } finally {
      await providerAdmin.end();
    }
    target.username = migrationRole;
    target.password = "fieldgrid-rebuild-test";
    const env = {
      ...process.env,
      DATABASE_URL: target.toString(),
      FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET: "1",
      FIELDGRID_RUNTIME_SAFETY_RESET_CONFIRM: databaseName,
    };

    await fullRebuild(env, { initial: true });
    await proveSamePrincipalFence(target.toString());
    for (const fault of faults) {
      await injectFault(target.toString(), env, fault);
      await fullRebuild(env);
    }

    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1",
      [databaseName],
    );
    await admin.query(`DROP DATABASE ${databaseName}`);
  }
} finally {
  for (const { databaseName } of scenarios) {
    await admin
      .query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1",
        [databaseName],
      )
      .catch(() => {});
    await admin
      .query(`DROP DATABASE IF EXISTS ${databaseName}`)
      .catch(() => {});
  }
  await admin.end();
}

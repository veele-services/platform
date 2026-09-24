import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import { bootstrapDatabase } from "./disposable-staging/bootstrap.mjs";
import {
  assertNoExternalWriters,
  createWriterAdmissionGuard,
  resetApplicationSchemas,
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
    await client.query("DELETE FROM auth.users");
    await admission.migrate();
    const proof = await verifyPostgres17Rebuild(client, {
      allowedSamePrincipalPids: admission.allowedSamePrincipalPids,
    });
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
  } finally {
    await client.end();
  }

  if (["fault-during-migrations", "fault-during-bootstrap"].includes(fault)) {
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

  // A new attempt must be able to fence writers even when the prior attempt
  // stopped after dropping app_private/drizzle and before recreating tables.
  const retryGuard = new Client({
    connectionString,
    application_name: "fieldgrid-disposable-retry-guard",
  });
  await retryGuard.connect();
  try {
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

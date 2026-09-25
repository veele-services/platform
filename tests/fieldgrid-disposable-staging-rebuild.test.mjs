import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  CONTRACT,
  RebuildError,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  validateDispatchEnvironment,
} from "../scripts/disposable-staging/contract.mjs";
import { runPostRebuildAcceptance } from "../scripts/disposable-staging/acceptance.mjs";
import {
  assertNoExternalWriters,
  createWriterAdmissionGuard,
  databaseInventory,
} from "../scripts/disposable-staging/database.mjs";
import { validateConnections } from "../scripts/disposable-staging/environment.mjs";
import { createProviderControl } from "../scripts/disposable-staging/providers.mjs";
import {
  finalizeRebuild,
  runPlan,
  runRebuild,
  safeStopRebuild,
} from "../scripts/disposable-staging/runner.mjs";
import { createServiceControl } from "../scripts/disposable-staging/services.mjs";
import { SUPABASE_ROOT_2021_CA_PEM } from "./fixtures/fieldgrid-supabase-root-2021-ca.mjs";

const MAIN = "a".repeat(40);
const STAGING = "b".repeat(40);

function environment(mode = "rebuild") {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: "veele-services/platform",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: MAIN,
    GITHUB_RUN_ID: "42",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_TOKEN: "test-token",
    EXPECTED_MAIN_SHA: MAIN,
    EXPECTED_STAGING_SHA: STAGING,
    APP_ENV: "staging",
    TARGET_ENVIRONMENT: "staging",
    EXPECTED_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    FORBIDDEN_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
    REBUILD_CONFIRMATION: `${CONTRACT}:${STAGING_PROJECT_REF}:${MAIN}`,
    FIELDGRID_REBUILD_PLATFORM_ADMIN_EMAIL: "platform@example.test",
    FIELDGRID_REBUILD_PLATFORM_ADMIN_PASSWORD: "platform-password-123",
    FIELDGRID_REBUILD_PLATFORM_ADMIN_NAME: "Platform beheerder",
    MODE: mode,
  };
}

function fixtures({
  states = [
    { unit: "veele-staging.service", active: true, pid: 1 },
    { unit: "veele-staging-api.service", active: true, pid: 2 },
  ],
} = {}) {
  const calls = [];
  const createdIdentities = [];
  const services = {
    async inventory() {
      calls.push("services.inventory");
      return states;
    },
    async stop() {
      calls.push("services.stop");
    },
    async assertStopped() {
      calls.push("services.assertStopped");
    },
    async restore() {
      calls.push("services.restore");
    },
    async safeStop() {
      calls.push("services.safeStop");
    },
  };
  const provider = {
    async preflight() {
      calls.push("provider.preflight");
      return {
        storage: {
          configured: [],
          objects: {},
          count: 0,
          digest: "storage-before",
        },
        auth: { ids: [], count: 0, digest: "auth-before" },
      };
    },
    async emptyStorage() {
      calls.push("provider.emptyStorage");
      return { count: 0, digest: "storage-empty" };
    },
    async emptyAuth() {
      calls.push("provider.emptyAuth");
      return { count: 0, digest: "auth-empty" };
    },
    async createIdentity(identity) {
      calls.push("provider.createIdentity");
      createdIdentities.push(identity);
      return "platform";
    },
    async verifyPlatformOnlyState() {
      calls.push("provider.verifyPlatformOnlyState");
      return {
        authAccountCount: 1,
        platformAdminCount: 1,
        temporaryTenantAdminCount: 0,
        canonicalMetadata: true,
        authDigest: "a".repeat(64),
        storageObjectCount: 0,
        storageDigest: "b".repeat(64),
      };
    },
  };
  const database = {
    async connect() {
      calls.push("db.connect");
    },
    async end() {
      calls.push("db.end");
    },
  };
  const deps = {
    evidence: {
      async assertMain() {
        calls.push("github.main");
      },
      async assertValidation() {
        calls.push("github.ci");
      },
    },
    validateConnections() {
      return {};
    },
    createDatabaseClient() {
      return database;
    },
    databaseInventory: async () => ({
      principal: "migration",
      applicationSchemas: ["public"],
      applicationTables: {
        tenants: { present: true, count: 0 },
        tenant_users: { present: true, count: 0 },
        platform_users: { present: true, count: 1 },
      },
      managedCatalogDigest: "managed",
      currentTenantScopedTableCount: 0,
    }),
    provider,
    services,
    assertNoExternalWriters: async () => calls.push("db.noWriters"),
    createWriterAdmissionGuard: async () => ({
      allowedSamePrincipalPids: [4242],
      async migrate() {},
      async release() {},
    }),
    resetApplicationSchemas: async () => {
      calls.push("db.reset");
      return { after: "managed" };
    },
    resetRuntimePrincipalsForCanonicalRebuild: async () =>
      calls.push("db.resetRuntimeRoles"),
    runCanonicalMigrations: async () => calls.push("db.migrate"),
    bootstrapDatabase: async () => calls.push("db.bootstrap"),
    verifyRebuiltDatabase: async () => ({ migrationJournal: true }),
    verifyBootstrap: async () => ({ tenants: 0 }),
    verifyPlatformOnlyDatabaseState: async () => ({
      tenantCount: 0,
      tenantUserCount: 0,
      tenantRoleMembershipCount: 0,
      tenantRoleCount: 0,
      tenantDomainCount: 0,
      organizationSettingsCount: 0,
      operationalQueueCount: 0,
      tenantScopedRowCount: 0,
      tenantScopedTableCount: 42,
      tenantScopedDigest: "c".repeat(64),
      platformUserCount: 1,
      activePlatformOwnerCount: 1,
      platformIdentityMatches: true,
    }),
    now: () => Date.parse("2026-09-23T10:00:00Z"),
  };
  return { calls, createdIdentities, deps, services };
}

test("database inventory treats absent and partially rebuilt application tables as empty", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      const statement = String(sql);
      queries.push(statement);
      if (statement.includes("FROM pg_roles r")) {
        return {
          rows: [
            {
              current_user: "fieldgrid_disposable_rebuild_admin",
              session_user: "fieldgrid_disposable_rebuild_admin",
              rolsuper: false,
              rolbypassrls: false,
              rolcreaterole: true,
              database_name: "postgres",
            },
          ],
        };
      }
      if (statement.includes("SELECT nspname FROM pg_namespace")) {
        return { rows: [{ nspname: "public" }] };
      }
      if (statement.includes("WITH requested(table_name)")) {
        return {
          rows: [
            { table_name: "platform_users", present: false },
            { table_name: "tenant_users", present: false },
            { table_name: "tenants", present: true },
          ],
        };
      }
      if (statement.includes('FROM public."tenants"')) {
        return { rows: [{ count: 2 }] };
      }
      if (statement.includes("column_row.attname='tenant_id'")) {
        return { rows: [] };
      }
      if (statement.includes("FROM pg_namespace n")) {
        return { rows: [] };
      }
      if (statement.includes("FROM pg_extension e")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected inventory query: ${statement}`);
    },
  };

  const inventory = await databaseInventory(client);
  assert.deepEqual(inventory.applicationTables, {
    tenants: { present: true, count: 2 },
    tenant_users: { present: false, count: 0 },
    platform_users: { present: false, count: 0 },
  });
  assert.equal(inventory.currentTenantCount, 2);
  assert.equal(inventory.currentTenantUserCount, 0);
  assert.equal(inventory.currentPlatformUserCount, 0);
  assert.equal(inventory.currentTenantScopedTableCount, 0);
  assert.equal(inventory.currentTenantScopedRowCount, 0);
  assert.equal(
    queries.some((statement) =>
      statement.includes('FROM public."tenant_users"'),
    ),
    false,
  );
  assert.equal(
    queries.some((statement) =>
      statement.includes('FROM public."platform_users"'),
    ),
    false,
  );
});

test("dispatch is bound to exact main, staging project and confirmation", () => {
  assert.equal(
    validateDispatchEnvironment(environment(), { mode: "rebuild" })
      .expectedMain,
    MAIN,
  );
  for (const [field, value] of [
    ["EXPECTED_SUPABASE_PROJECT_REF", PRODUCTION_PROJECT_REF],
    ["GITHUB_REF", "refs/heads/staging"],
    ["REBUILD_CONFIRMATION", "wrong"],
  ]) {
    const env = environment();
    env[field] = value;
    assert.throws(() => validateDispatchEnvironment(env, { mode: "rebuild" }));
  }
});

test("connection preflight accepts distinct canonical staging principals with pinned TLS", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-rebuild-tls-"));
  const certificate = join(directory, "supabase-root.crt");
  await writeFile(certificate, SUPABASE_ROOT_2021_CA_PEM, { mode: 0o600 });
  await chmod(certificate, 0o600);
  const host = "aws-1-eu-central-1.pooler.supabase.com";
  const config = validateConnections({
    FIELDGRID_MIGRATION_DATABASE_URL:
      `postgresql://supabase_admin.${STAGING_PROJECT_REF}:admin-password` +
      `@${host}:5432/postgres`,
    DATABASE_URL:
      `postgresql://fieldgrid_runtime_app.${STAGING_PROJECT_REF}:runtime-password` +
      `@${host}:5432/postgres`,
    FIELDGRID_DATABASE_SSL_ROOT_CERT: certificate,
    PGSSLMODE: "verify-full",
    DB_SSL: "true",
    DB_SSL_REJECT_UNAUTHORIZED: "true",
  });
  assert.equal(config.poolerHost, host);
  assert.equal(config.ssl.rejectUnauthorized, true);
});

test("plan performs inventories but zero mutations and redacts credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-plan-"));
  const { calls, deps } = fixtures();
  const report = await runPlan({
    env: environment("plan"),
    outputDir: directory,
    deps,
  });
  assert.equal(report.destructive, false);
  assert.equal(report.mutationsPerformed, false);
  assert.equal(
    calls.some((value) => /stop|empty|reset|migrate|bootstrap/u.test(value)),
    false,
  );
  const output = await readFile(join(directory, "result.json"), "utf8");
  assert.doesNotMatch(
    output,
    /password|platform@example|alpha@example|bravo@example/iu,
  );
});

test("rebuild preserves the destructive order and produces promotable evidence only after finalize", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-rebuild-"));
  const { calls, createdIdentities, deps } = fixtures();
  deps.receiptPath = join(directory, "private", "receipt.json");
  const prepared = await runRebuild({
    env: environment(),
    outputDir: directory,
    baseDir: "/var/www/veele/staging",
    deps,
  });
  assert.equal(prepared.status, "prepared");
  assert.deepEqual(
    calls.filter((value) =>
      [
        "services.stop",
        "db.noWriters",
        "provider.emptyStorage",
        "db.reset",
        "db.resetRuntimeRoles",
        "provider.emptyAuth",
        "db.migrate",
        "db.bootstrap",
      ].includes(value),
    ),
    [
      "services.stop",
      "db.noWriters",
      "provider.emptyStorage",
      "db.noWriters",
      "db.reset",
      "db.resetRuntimeRoles",
      "provider.emptyAuth",
      "db.migrate",
      "db.noWriters",
      "db.bootstrap",
      "db.noWriters",
    ],
  );
  assert.deepEqual(
    createdIdentities.map(({ portal }) => portal),
    ["platform-admin"],
  );
  const final = await finalizeRebuild({
    env: environment("finalize"),
    outputDir: directory,
    deps: {
      ...deps,
      readActiveSha: async () => `${MAIN}\n`,
      runPostRebuildAcceptance: async () => ({
        accepted: true,
        fixtureCleanupComplete: true,
      }),
      services: {
        async restore() {},
        async inventory() {
          return [
            { unit: "veele-staging.service", active: true },
            { unit: "veele-staging-api.service", active: true },
          ];
        },
      },
    },
  });
  assert.equal(final.status, "passed");
  assert.equal(final.releaseActive, true);
  assert.equal(final.smokePassed, true);
  assert.equal(final.acceptancePassed, true);
});

test("fixture cleanup failure safe-stops without COMPLETE and a full retry succeeds", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "fieldgrid-rebuild-cleanup-fail-"),
  );
  const receiptPath = join(directory, "private", "receipt.json");
  const first = fixtures();
  first.deps.receiptPath = receiptPath;
  await runRebuild({
    env: environment(),
    outputDir: directory,
    deps: first.deps,
  });

  await assert.rejects(
    finalizeRebuild({
      env: environment("finalize"),
      outputDir: directory,
      deps: {
        ...first.deps,
        readActiveSha: async () => `${MAIN}\n`,
        runPostRebuildAcceptance: async () => {
          throw new RebuildError(
            "POST_REBUILD_FIXTURE_CLEANUP_FAILED",
            "ACTIVATED",
            true,
          );
        },
      },
    }),
    /POST_REBUILD_FIXTURE_CLEANUP_FAILED/u,
  );
  assert.ok(first.calls.includes("services.safeStop"));
  const failedReceipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.equal(failedReceipt.phase, "SAFE_STOPPED");
  assert.equal(failedReceipt.acceptancePassed, false);
  assert.notEqual(failedReceipt.phase, "COMPLETE");

  const retry = fixtures();
  retry.deps.receiptPath = receiptPath;
  await runRebuild({
    env: environment(),
    outputDir: directory,
    deps: retry.deps,
  });
  const final = await finalizeRebuild({
    env: environment("finalize"),
    outputDir: directory,
    deps: {
      ...retry.deps,
      readActiveSha: async () => `${MAIN}\n`,
      runPostRebuildAcceptance: async () => ({
        accepted: true,
        fixtureCleanupComplete: true,
      }),
    },
  });
  const completeReceipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.equal(final.status, "passed");
  assert.equal(completeReceipt.phase, "COMPLETE");
  assert.equal(completeReceipt.acceptancePassed, true);
});

test("a retry preserves the service baseline captured before the destructive boundary", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-rebuild-retry-"));
  const receiptPath = join(directory, "private", "receipt.json");
  const first = fixtures();
  first.deps.receiptPath = receiptPath;
  first.deps.resetApplicationSchemas = async () => {
    throw new Error("synthetic failure");
  };
  await assert.rejects(runRebuild({ env: environment(), deps: first.deps }));

  const second = fixtures({
    states: [
      { unit: "veele-staging.service", active: false, pid: 0 },
      { unit: "veele-staging-api.service", active: false, pid: 0 },
    ],
  });
  second.deps.receiptPath = receiptPath;
  await runRebuild({ env: environment(), deps: second.deps });
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.deepEqual(receipt.originalServices, [
    { unit: "veele-staging.service", active: true },
    { unit: "veele-staging-api.service", active: true },
  ]);
});

test("migration and bootstrap retries preserve the original mixed service state", async (t) => {
  for (const fault of ["migration", "bootstrap"]) {
    await t.test(fault, async () => {
      const directory = await mkdtemp(
        join(tmpdir(), `fieldgrid-rebuild-${fault}-retry-`),
      );
      const path = join(directory, "private", "receipt.json");
      const first = fixtures({
        states: [
          { unit: "veele-staging.service", active: true, pid: 1 },
          { unit: "veele-staging-api.service", active: false, pid: 0 },
        ],
      });
      first.deps.receiptPath = path;
      first.deps[
        fault === "migration" ? "runCanonicalMigrations" : "bootstrapDatabase"
      ] = async () => {
        throw new Error(`synthetic ${fault} fault`);
      };
      await assert.rejects(
        runRebuild({ env: environment(), deps: first.deps }),
      );

      const second = fixtures({
        states: [
          { unit: "veele-staging.service", active: false, pid: 0 },
          { unit: "veele-staging-api.service", active: false, pid: 0 },
        ],
      });
      second.deps.receiptPath = path;
      await runRebuild({ env: environment(), deps: second.deps });
      const receipt = JSON.parse(await readFile(path, "utf8"));
      assert.deepEqual(receipt.originalServices, [
        { unit: "veele-staging.service", active: true },
        { unit: "veele-staging-api.service", active: false },
      ]);
    });
  }
});

test("workflow failure recovery restores the baseline before the destructive boundary", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "fieldgrid-rebuild-pre-fail-"),
  );
  const receiptPath = join(directory, "private", "receipt.json");
  const { calls, deps } = fixtures();
  deps.receiptPath = receiptPath;
  let validations = 0;
  deps.evidence = {
    async assertMain() {
      validations += 1;
      if (validations > 1) throw new Error("main advanced");
    },
    async assertValidation() {},
  };
  await assert.rejects(runRebuild({ env: environment(), deps }));
  await safeStopRebuild({ env: environment("safe-stop"), deps });
  assert.equal(calls.includes("services.safeStop"), false);
  assert.equal(calls.filter((call) => call === "services.restore").length, 2);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.equal(receipt.destructiveBoundaryPassed, false);
  assert.equal(receipt.failureCode, "PRE_DESTRUCTIVE_FAILURE");
});

test("failure cleanup rejects a receipt from an earlier workflow attempt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-rebuild-attempt-"));
  const receiptPath = join(directory, "private", "receipt.json");
  const first = fixtures();
  first.deps.receiptPath = receiptPath;
  await runRebuild({ env: environment(), deps: first.deps });

  const staleAttempt = environment("safe-stop");
  staleAttempt.GITHUB_RUN_ATTEMPT = "2";
  const calls = [];
  await assert.rejects(
    safeStopRebuild({
      env: staleAttempt,
      deps: {
        receiptPath,
        services: {
          async safeStop() {
            calls.push("safeStop");
          },
          async restore() {
            calls.push("restore");
          },
        },
      },
    }),
    /RECEIPT_RUN_MISMATCH/u,
  );
  assert.deepEqual(calls, []);
});

test("a post-boundary failure leaves every writer stopped and never restores old services", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-rebuild-fail-"));
  const { calls, deps } = fixtures();
  deps.receiptPath = join(directory, "private", "receipt.json");
  deps.resetApplicationSchemas = async () => {
    throw new Error("synthetic database failure with secret@example.test");
  };
  await assert.rejects(
    runRebuild({ env: environment(), outputDir: directory, deps }),
  );
  assert.ok(calls.includes("services.safeStop"));
  assert.equal(calls.includes("services.restore"), false);
  const output = await readFile(join(directory, "result.json"), "utf8");
  assert.doesNotMatch(output, /secret@example/u);
  assert.match(output, /OPERATION_FAILED/u);
});

test("provider pagination deletes all pages in bounded batches and verifies empty", async () => {
  let users = Array.from({ length: 205 }, (_, index) => ({
    id: `user-${index}`,
  }));
  const removed = [];
  const admin = {
    storage: {
      async listBuckets() {
        return { data: [] };
      },
      from() {
        return {
          async list() {
            return { data: [] };
          },
          async remove(paths) {
            removed.push(paths);
            return { data: paths };
          },
        };
      },
    },
    auth: {
      admin: {
        async listUsers({ page, perPage }) {
          return {
            data: { users: users.slice((page - 1) * perPage, page * perPage) },
          };
        },
        async deleteUser(id) {
          users = users.filter((user) => user.id !== id);
          return { data: {} };
        },
      },
    },
  };
  const provider = createProviderControl(admin, { sleep: async () => {} });
  const before = await provider.authInventory();
  assert.equal(before.count, 205);
  await provider.emptyAuth(before);
  assert.equal((await provider.authInventory()).count, 0);
  assert.deepEqual(removed, []);
});

test("provider persists canonical portal metadata and reads it back", async () => {
  const stored = new Map();
  const admin = {
    auth: {
      admin: {
        async createUser(input) {
          const user = {
            id: `user-${stored.size + 1}`,
            app_metadata: input.app_metadata,
            user_metadata: input.user_metadata,
          };
          stored.set(user.id, user);
          return { data: { user }, error: null };
        },
        async getUserById(id) {
          return { data: { user: stored.get(id) }, error: null };
        },
      },
    },
  };
  const provider = createProviderControl(admin, { sleep: async () => {} });
  await provider.createIdentity({
    email: "platform@example.test",
    password: "secret",
    name: "Platform beheerder",
    portal: "platform-admin",
    role: "owner",
  });
  await provider.createIdentity({
    email: "tenant@example.test",
    password: "secret",
    name: "Tenant beheerder",
    portal: "tenant-admin",
    role: "owner",
  });
  assert.deepEqual(stored.get("user-1").app_metadata, {
    portal: "platform-admin",
    platform_role: "owner",
    rebuilt_by: "disposable-staging-v1",
  });
  assert.deepEqual(stored.get("user-2").app_metadata, {
    portal: "tenant-admin",
    rebuilt_by: "disposable-staging-v1",
  });
});

test("database writer fence disables runtime login and effective app writes", async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(String(sql));
      if (String(sql).includes("effective_writer")) return { rows: [] };
      if (String(sql).includes("SELECT nspname FROM pg_namespace")) {
        return { rows: [{ nspname: "public" }] };
      }
      if (String(sql).includes("pg_terminate_backend")) {
        return { rows: [{ pid: 99, stopped: true }] };
      }
      if (String(sql).includes("runtime_login_disabled")) {
        return {
          rows: [
            {
              runtime_login_disabled: true,
              public_dml_revoked: true,
              app_function_execute_revoked: true,
              target_transactions_drained: true,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };
  const proof = await assertNoExternalWriters(client);
  assert.equal(proof.runtimeLoginDisabled, true);
  assert.equal(proof.terminatedSessionCount, 2);
  assert.ok(
    statements.some((statement) =>
      statement.includes("ALTER ROLE fieldgrid_runtime_app NOLOGIN"),
    ),
  );
  assert.ok(
    statements.some((statement) =>
      statement.includes("FROM PUBLIC, anon, authenticated, service_role"),
    ),
  );
});

test("writer admission guard rotates the migration credential until release", async () => {
  const statements = [];
  const parameters = [];
  let migrated = false;
  let armed = false;
  let workerReleased = false;
  const client = {
    async query(sql, values) {
      statements.push(String(sql));
      parameters.push(values);
      if (String(sql).includes("AS role_name")) {
        return {
          rows: [
            {
              pid: 101,
              role_name: "migration_admin",
            },
          ],
        };
      }
      if (String(sql).includes("pg_terminate_backend")) return { rows: [] };
      if (String(sql).includes("AS admitted_pids")) {
        return { rows: [{ admitted_pids: [101, 202] }] };
      }
      return { rows: [] };
    },
  };
  const guard = await createWriterAdmissionGuard(client, {
    repoRoot: process.cwd(),
    env: {
      DATABASE_URL: "postgresql://migration_admin:original@localhost/db",
    },
    startWorker: async () => ({
      pid: 202,
      role: "migration_admin",
      async arm(password) {
        armed = password === "original";
      },
      async migrate() {
        migrated = true;
      },
      async release() {
        workerReleased = true;
      },
    }),
  });
  assert.deepEqual(guard.allowedSamePrincipalPids, [202]);
  await guard.migrate();
  await guard.release();
  assert.equal(migrated, true);
  assert.equal(armed, true);
  assert.equal(workerReleased, true);
  assert.ok(
    statements.some((statement) =>
      statement.includes("ALTER ROLE %I PASSWORD %L"),
    ),
  );
  assert.equal(
    parameters.filter((values) => values?.[0] === "original").length,
    1,
  );
});

test("service discovery includes the exact root unit and rejects unknown wildcard matches", async () => {
  const required = [
    "veele-staging.service",
    "veele-staging-personeel.service",
    "veele-staging-klant.service",
    "veele-staging-api.service",
    "veele-staging-website.service",
    "veele-staging-marketing.service",
  ];
  const discoveryArguments = [];
  const services = createServiceControl({
    command: async (_binary, args) => {
      if (args[0] === "list-units" || args[0] === "list-unit-files") {
        discoveryArguments.push(args);
        return { stdout: required.map((unit) => `${unit} loaded`).join("\n") };
      }
      if (args[0] === "show") {
        return {
          stdout:
            `Id=${args[1]}\nLoadState=loaded\nActiveState=inactive\n` +
            "SubState=dead\nMainPID=0\n",
        };
      }
      return { stdout: "" };
    },
  });
  assert.equal((await services.inventory()).length, required.length);
  for (const args of discoveryArguments) {
    assert.ok(args.includes("veele-staging.service"));
    assert.ok(args.includes("veele-staging-*"));
  }

  const unknown = createServiceControl({
    command: async (_binary, args) => {
      if (args[0] === "list-units" || args[0] === "list-unit-files") {
        return {
          stdout: [...required, "veele-staging-rogue.service"]
            .map((unit) => `${unit} loaded`)
            .join("\n"),
        };
      }
      return { stdout: "" };
    },
  });
  await assert.rejects(unknown.inventory(), /UNKNOWN_STAGING_WRITER/u);
});

test("service restoration returns inactive and active units to the captured baseline", async () => {
  const states = new Map([
    ["veele-staging.service", true],
    ["veele-staging-api.service", false],
  ]);
  const mutations = [];
  const services = createServiceControl({
    command: async (_binary, args) => {
      if (args[0] === "show") {
        const unit = args[1];
        const active = states.get(unit);
        return {
          stdout:
            `Id=${unit}\nLoadState=loaded\nActiveState=${active ? "active" : "inactive"}\n` +
            `SubState=${active ? "running" : "dead"}\nMainPID=${active ? 99 : 0}\n`,
        };
      }
      const operation = args[2];
      const unit = args[3];
      mutations.push(`${operation}:${unit}`);
      states.set(unit, operation === "start");
      return { stdout: "" };
    },
  });
  await services.restore([
    { unit: "veele-staging.service", active: false },
    { unit: "veele-staging-api.service", active: true },
  ]);
  assert.deepEqual(mutations, [
    "stop:veele-staging.service",
    "start:veele-staging-api.service",
  ]);
});

test("post-rebuild acceptance proves login, tenant isolation and storage denial", async () => {
  const objects = new Map();
  const tenants = [
    { id: "11111111-1111-4111-8111-111111111111" },
    { id: "22222222-2222-4222-8222-222222222222" },
  ];
  const identities = [
    { label: "platform", id: "platform-user", tenant: null },
    { label: "tenant-a", id: "tenant-a-user", tenant: tenants[0].id },
    { label: "tenant-b", id: "tenant-b-user", tenant: tenants[1].id },
    { label: "anonymous", id: null, tenant: null },
  ];
  let index = 0;
  const createClient = () => {
    const identity = identities[index++];
    return {
      auth: {
        async signInWithPassword({ email }) {
          return {
            data: {
              user: {
                id: identity.id,
                email,
                app_metadata: {
                  portal:
                    identity.label === "platform"
                      ? "platform-admin"
                      : "tenant-admin",
                  ...(identity.label === "platform"
                    ? { platform_role: "owner" }
                    : {}),
                },
              },
            },
            error: null,
          };
        },
        async signOut() {
          return { error: null };
        },
      },
      from() {
        return {
          select() {
            return {
              async in() {
                return {
                  data: [
                    {
                      tenant_id: identity.tenant,
                      user_id: identity.id,
                      status: "active",
                    },
                  ],
                  error: null,
                };
              },
            };
          },
        };
      },
      storage: {
        from() {
          return {
            async upload(path, body) {
              objects.set(path, Buffer.from(body));
              return { error: null };
            },
            async download(path) {
              if (identity.label !== "tenant-a" || !objects.has(path)) {
                return { data: null, error: { status: 403 } };
              }
              return { data: new Blob([objects.get(path)]), error: null };
            },
            async remove(paths) {
              for (const path of paths) objects.delete(path);
              return { error: null };
            },
          };
        },
      },
    };
  };
  const createdFixtures = [];
  const provider = {
    async createIdentity(input) {
      createdFixtures.push(input);
      return createdFixtures.length === 1 ? "tenant-a-user" : "tenant-b-user";
    },
    async removeStorageObject(_bucket, path) {
      objects.delete(path);
      return { removed: true };
    },
    async deleteAcceptanceIdentities() {
      return { deletedCount: 2, remainingCount: 0 };
    },
  };
  const database = {
    async query(sql) {
      const statement = String(sql);
      if (statement.includes("INSERT INTO public.tenant_user_roles")) {
        return { rows: [], rowCount: 1 };
      }
      if (
        statement.includes("SELECT count(*)::int FROM public.tenants WHERE")
      ) {
        return {
          rows: [{ tenants: 0, tenant_users: 0, tenant_user_roles: 0 }],
        };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const generatedTenantIds = tenants.map(({ id }) => id);
  const result = await runPostRebuildAcceptance({
    env: {},
    candidateSha: MAIN,
    runId: 42,
    attempt: 1,
    database,
    provider,
    createClient,
    randomUuid: () => generatedTenantIds.shift(),
    randomSecret: () => Buffer.alloc(32, 7),
    bootstrap: {
      platform: { email: "platform@example.test", password: "platform-pass" },
    },
  });
  assert.equal(result.temporaryTenantCount, 2);
  assert.equal(result.reciprocalTenantIsolation, true);
  assert.equal(result.portalMetadata, true);
  assert.equal(result.unauthorizedStorageDenied, true);
  assert.equal(result.fixtureCleanupComplete, true);
  assert.equal(createdFixtures.length, 2);
  assert.ok(createdFixtures.every(({ acceptanceRun }) => acceptanceRun));
  assert.equal(objects.size, 0);
});

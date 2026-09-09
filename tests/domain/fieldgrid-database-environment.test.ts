import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  assertDatabaseEnvironmentIsolation,
  databaseConnectionConfig,
  databaseProjectRef,
  publicSupabaseProjectRef,
} from "../../lib/db/src/database-environment";
import { SUPABASE_ROOT_2021_CA_PEM } from "../fixtures/fieldgrid-supabase-root-2021-ca.mjs";

const stagingProject = "olyfmekyqozxrbrwwszu";
const productionProject = "abcdefghijklmnopqrst";
const certificateDirectory = mkdtempSync(
  join(tmpdir(), "fieldgrid-database-environment-cert-"),
);
const certificatePath = join(certificateDirectory, "supabase-root.crt");
writeFileSync(certificatePath, SUPABASE_ROOT_2021_CA_PEM, { mode: 0o600 });
after(() => rmSync(certificateDirectory, { recursive: true, force: true }));

function deploymentEnvironment(
  environment: "staging" | "production",
  projectRef: string,
) {
  return {
    APP_ENV: environment,
    TARGET_ENVIRONMENT: environment,
    EXPECTED_SUPABASE_PROJECT_REF: projectRef,
    DATABASE_URL: `postgresql://fieldgrid_runtime_app:password@db.${projectRef}.supabase.co:5432/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    FIELDGRID_DATABASE_SSL_ROOT_CERT: certificatePath,
  };
}

test("database identity is parsed structurally", () => {
  assert.equal(
    databaseProjectRef(
      `postgresql://postgres:password@db.${stagingProject}.supabase.co:5432/postgres`,
    ),
    stagingProject,
  );
  assert.equal(
    databaseProjectRef(
      `postgresql://postgres.${stagingProject}:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
    ),
    stagingProject,
  );
  assert.equal(
    databaseProjectRef(
      `postgresql://fieldgrid_runtime_app.${stagingProject}:password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    ),
    stagingProject,
  );
  assert.equal(
    publicSupabaseProjectRef(`https://${stagingProject}.supabase.co`),
    stagingProject,
  );
});

test("staging and production require exact project configuration", () => {
  assert.equal(
    assertDatabaseEnvironmentIsolation(
      deploymentEnvironment("staging", stagingProject),
    ).environment,
    "staging",
  );
  assert.equal(
    assertDatabaseEnvironmentIsolation(
      deploymentEnvironment("production", productionProject),
    ).environment,
    "production",
  );

  assert.throws(
    () =>
      assertDatabaseEnvironmentIsolation({
        ...deploymentEnvironment("staging", stagingProject),
        EXPECTED_SUPABASE_PROJECT_REF: productionProject,
      }),
    /does not match/u,
  );
  assert.throws(
    () =>
      assertDatabaseEnvironmentIsolation({
        ...deploymentEnvironment("staging", stagingProject),
        TARGET_ENVIRONMENT: "production",
      }),
    /target and APP_ENV/u,
  );
});

test("project references in credentials or query strings are rejected", () => {
  const fixture = {
    ...deploymentEnvironment("staging", stagingProject),
    DATABASE_URL: `postgresql://postgres:${stagingProject}@db.${productionProject}.supabase.co:5432/postgres?application_name=${stagingProject}`,
  };
  assert.throws(
    () => assertDatabaseEnvironmentIsolation(fixture),
    /overrides|does not match/u,
  );
});

test("live runtime and migration connections are distinct and TLS verified", () => {
  const environment = {
    ...deploymentEnvironment("staging", stagingProject),
    FIELDGRID_MIGRATION_DATABASE_URL: `postgresql://supabase_admin.${stagingProject}:migration-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
  };
  const runtime = databaseConnectionConfig("runtime", environment);
  assert.equal(runtime.connectionString, environment.DATABASE_URL);
  assert.equal(runtime.ssl && runtime.ssl.rejectUnauthorized, true);
  assert.match(runtime.ssl && runtime.ssl.ca, /BEGIN CERTIFICATE/u);

  const migration = databaseConnectionConfig("migration", environment);
  assert.equal(
    migration.connectionString,
    environment.FIELDGRID_MIGRATION_DATABASE_URL,
  );
  assert.equal(migration.ssl && migration.ssl.rejectUnauthorized, true);
  assert.match(migration.ssl && migration.ssl.ca, /BEGIN CERTIFICATE/u);

  const directMigrationUrl = `postgresql://postgres:migration-password@db.${stagingProject}.supabase.co:5432/postgres`;
  assert.equal(
    databaseConnectionConfig("migration", {
      ...environment,
      FIELDGRID_MIGRATION_DATABASE_URL: directMigrationUrl,
    }).connectionString,
    directMigrationUrl,
  );
  assert.throws(
    () =>
      databaseConnectionConfig("migration", {
        ...environment,
        FIELDGRID_MIGRATION_DATABASE_URL: `postgresql://supabase_admin.${stagingProject}:migration-password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
      }),
    /session-affine on port 5432/u,
  );
  assert.throws(
    () =>
      databaseConnectionConfig("migration", {
        ...environment,
        FIELDGRID_MIGRATION_DATABASE_URL: `postgresql://postgres:migration-password@db.${stagingProject}.supabase.co:6543/postgres`,
      }),
    /session-affine on port 5432/u,
  );

  const missingMigration = { ...environment };
  delete missingMigration.FIELDGRID_MIGRATION_DATABASE_URL;
  assert.throws(
    () => databaseConnectionConfig("migration", missingMigration),
    /FIELDGRID_MIGRATION_DATABASE_URL/u,
  );
  assert.throws(
    () =>
      databaseConnectionConfig("migration", {
        ...environment,
        FIELDGRID_MIGRATION_DATABASE_URL: environment.DATABASE_URL,
      }),
    /must be distinct/u,
  );
  assert.throws(
    () =>
      databaseConnectionConfig("migration", {
        ...environment,
        FIELDGRID_MIGRATION_DATABASE_URL: `postgresql://fieldgrid_runtime_app.${stagingProject}:different-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
      }),
    /principals and secrets must be distinct/u,
  );
  assert.throws(
    () =>
      databaseConnectionConfig("migration", {
        ...environment,
        FIELDGRID_MIGRATION_DATABASE_URL: `postgresql://migration_role.${stagingProject}:password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
      }),
    /principals and secrets must be distinct/u,
  );
  assert.throws(
    () =>
      databaseConnectionConfig("migration", {
        ...environment,
        DATABASE_URL: `postgresql://fieldgrid_runtime_app.${productionProject}:runtime-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
      }),
    /does not match/u,
  );
});

test("live runtime connections require the exact least-privilege role", () => {
  const environment = deploymentEnvironment("staging", stagingProject);
  for (const DATABASE_URL of [
    `postgresql://supabase_admin:runtime-secret@db.${stagingProject}.supabase.co:5432/postgres`,
    `postgresql://supabase_admin.${stagingProject}:runtime-secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    `postgresql://FIELDGRID_RUNTIME_APP:runtime-secret@db.${stagingProject}.supabase.co:5432/postgres`,
    `postgresql://FIELDGRID_RUNTIME_APP.${stagingProject}:runtime-secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
  ]) {
    assert.throws(
      () =>
        databaseConnectionConfig("runtime", { ...environment, DATABASE_URL }),
      /runtime database principal is not permitted/u,
    );
  }

  const poolerRuntime = databaseConnectionConfig("runtime", {
    ...environment,
    DATABASE_URL: `postgresql://fieldgrid_runtime_app.${stagingProject}:runtime-secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
  });
  assert.equal(poolerRuntime.ssl && poolerRuntime.ssl.rejectUnauthorized, true);
});

test("live connection overrides and TLS opt-outs fail closed", () => {
  const environment = deploymentEnvironment("staging", stagingProject);
  for (const DATABASE_URL of [
    `${environment.DATABASE_URL}?sslmode=disable`,
    `${environment.DATABASE_URL}#sslmode=disable`,
  ]) {
    assert.throws(
      () =>
        databaseConnectionConfig("runtime", { ...environment, DATABASE_URL }),
      /overrides|safely configured/u,
    );
  }
  assert.throws(
    () =>
      databaseConnectionConfig("runtime", {
        ...environment,
        DB_SSL: "false",
      }),
    /cannot be disabled/u,
  );
  assert.throws(
    () =>
      databaseConnectionConfig("runtime", {
        ...environment,
        DB_SSL_REJECT_UNAUTHORIZED: "false",
      }),
    /verification is required/u,
  );
  assert.throws(
    () =>
      databaseConnectionConfig("runtime", {
        ...environment,
        FIELDGRID_DATABASE_SSL_ROOT_CERT: "",
      }),
    /FIELDGRID_DATABASE_SSL_ROOT_CERT/u,
  );
  chmodSync(certificatePath, 0o644);
  assert.throws(
    () => databaseConnectionConfig("runtime", environment),
    /permissions must be 0600/u,
  );
  chmodSync(certificatePath, 0o600);

  writeFileSync(
    certificatePath,
    `${SUPABASE_ROOT_2021_CA_PEM}${SUPABASE_ROOT_2021_CA_PEM}`,
    { mode: 0o600 },
  );
  assert.throws(
    () => databaseConnectionConfig("runtime", environment),
    /exactly one canonical PEM certificate/u,
  );
  writeFileSync(certificatePath, SUPABASE_ROOT_2021_CA_PEM, { mode: 0o600 });
});

test("guard errors never expose database credentials or project refs", () => {
  const fixture = {
    ...deploymentEnvironment("production", productionProject),
    EXPECTED_SUPABASE_PROJECT_REF: stagingProject,
  };
  let message = "";
  try {
    assertDatabaseEnvironmentIsolation(fixture);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert.ok(message);
  assert.doesNotMatch(message, /password/u);
  assert.doesNotMatch(message, new RegExp(stagingProject, "u"));
  assert.doesNotMatch(message, new RegExp(productionProject, "u"));
});

test("implicit local mode accepts only loopback databases", () => {
  assert.equal(
    assertDatabaseEnvironmentIsolation({
      DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:5432/fieldgrid_test",
    }).environment,
    "local",
  );
  assert.throws(
    () =>
      assertDatabaseEnvironmentIsolation({
        DATABASE_URL: `postgresql://postgres:password@db.${stagingProject}.supabase.co:5432/postgres`,
      }),
    /Remote databases require explicit/u,
  );
  assert.deepEqual(
    databaseConnectionConfig("runtime", {
      DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:5432/fieldgrid_test",
      DB_SSL: "false",
    }).ssl,
    false,
  );
});

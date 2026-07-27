import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertDatabaseEnvironmentIsolation,
  databaseProjectRef,
  publicSupabaseProjectRef,
} from "../../lib/db/src/database-environment";

const stagingProject = "olyfmekyqozxrbrwwszu";
const productionProject = "abcdefghijklmnopqrst";

function deploymentEnvironment(
  environment: "staging" | "production",
  projectRef: string,
) {
  return {
    APP_ENV: environment,
    TARGET_ENVIRONMENT: environment,
    EXPECTED_SUPABASE_PROJECT_REF: projectRef,
    DATABASE_URL: `postgresql://postgres:password@db.${projectRef}.supabase.co:5432/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
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
    /does not match/u,
  );
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
});

import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { configuredDatabaseConnectionPurpose } from "../../lib/db/src/database-environment";
import { SUPABASE_ROOT_2021_CA_PEM } from "../fixtures/fieldgrid-supabase-root-2021-ca.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const projectRef = "olyfmekyqozxrbrwwszu";
const certificateDirectory = mkdtempSync(
  join(tmpdir(), "fieldgrid-connection-purpose-cert-"),
);
const certificatePath = join(certificateDirectory, "supabase-root.crt");
writeFileSync(certificatePath, SUPABASE_ROOT_2021_CA_PEM, { mode: 0o600 });
chmodSync(certificatePath, 0o600);
after(() => rmSync(certificateDirectory, { recursive: true, force: true }));

function bootstrap(purpose: string | undefined, databaseUrl: string) {
  const migrationUrl =
    `postgresql://supabase_admin.${projectRef}:migration-password@` +
    "aws-1-eu-central-1.pooler.supabase.com:5432/postgres";
  const environment = {
    ...process.env,
    APP_ENV: "staging",
    TARGET_ENVIRONMENT: "staging",
    EXPECTED_SUPABASE_PROJECT_REF: projectRef,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    DATABASE_URL: databaseUrl,
    FIELDGRID_MIGRATION_DATABASE_URL: migrationUrl,
    FIELDGRID_DATABASE_SSL_ROOT_CERT: certificatePath,
    FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
    FIELDGRID_TEST_EXPECTED_CONNECTION_URL: migrationUrl,
  };
  if (purpose === undefined) {
    delete environment.FIELDGRID_DATABASE_CONNECTION_PURPOSE;
  } else {
    environment.FIELDGRID_DATABASE_CONNECTION_PURPOSE = purpose;
  }
  return spawnSync(
    join(repoRoot, "lib/db/node_modules/.bin/tsx"),
    [
      "--eval",
      '(async () => { const db = await import("./lib/db/src/index.ts"); if (db.pool.options.connectionString !== process.env.FIELDGRID_TEST_EXPECTED_CONNECTION_URL) throw new Error("Selected database connection differs"); await db.pool.end(); })();',
    ],
    { cwd: repoRoot, env: environment, encoding: "utf8" },
  );
}

test("database connection purpose defaults to runtime and rejects unknown values", () => {
  assert.equal(configuredDatabaseConnectionPurpose({}), "runtime");
  assert.equal(
    configuredDatabaseConnectionPurpose({
      FIELDGRID_DATABASE_CONNECTION_PURPOSE: " runtime ",
    }),
    "runtime",
  );
  assert.equal(
    configuredDatabaseConnectionPurpose({
      FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
    }),
    "migration",
  );
  assert.throws(
    () =>
      configuredDatabaseConnectionPurpose({
        FIELDGRID_DATABASE_CONNECTION_PURPOSE: "admin",
      }),
    /purpose is invalid/u,
  );
});

test("database bootstrap uses migration only with the explicit split-purpose contract", () => {
  const adminUrl =
    `postgresql://supabase_admin.${projectRef}:migration-password@` +
    "aws-1-eu-central-1.pooler.supabase.com:5432/postgres";
  const runtimeUrl =
    `postgresql://fieldgrid_runtime_app.${projectRef}:runtime-password@` +
    "aws-1-eu-central-1.pooler.supabase.com:5432/postgres";

  const rejectedAdminRuntime = bootstrap(undefined, adminUrl);
  assert.notEqual(rejectedAdminRuntime.status, 0);
  assert.match(
    `${rejectedAdminRuntime.stderr}${rejectedAdminRuntime.stdout}`,
    /Live runtime database principal is not permitted/u,
  );

  const migration = bootstrap("migration", runtimeUrl);
  assert.equal(migration.status, 0, `${migration.stderr}${migration.stdout}`);

  const unknown = bootstrap("admin", runtimeUrl);
  assert.notEqual(unknown.status, 0);
  assert.match(
    `${unknown.stderr}${unknown.stdout}`,
    /Database connection purpose is invalid/u,
  );
});

test("proof CLI writes sanitized evidence when database bootstrap fails", () => {
  const sha = "a".repeat(40);
  const evidenceDirectory = join(certificateDirectory, "proof-evidence");
  const adminUrl =
    `postgresql://supabase_admin.${projectRef}:migration-password@` +
    "aws-1-eu-central-1.pooler.supabase.com:5432/postgres";
  const environment = {
    ...process.env,
    APP_ENV: "staging",
    TARGET_ENVIRONMENT: "staging",
    EXPECTED_SUPABASE_PROJECT_REF: projectRef,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: sha,
    DATABASE_URL: adminUrl,
    FIELDGRID_MIGRATION_DATABASE_URL: adminUrl,
    FIELDGRID_DATABASE_SSL_ROOT_CERT: certificatePath,
    FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
    FIELDGRID_WEBSITE_STAGING_PROOF_CONFIRMATION:
      "website-staging-prepare-managed",
    WEBSITE_MANAGED_ACCEPTANCE_URL:
      "https://managed-proof.staging.fieldgrid.nl/",
    WEBSITE_CUSTOM_ACCEPTANCE_URL:
      "https://veeleservices.staging.fieldgrid.nl/",
  };

  const result = spawnSync(
    join(repoRoot, "lib/db/node_modules/.bin/tsx"),
    [
      "scripts/fieldgrid-website-staging-proof-state.mts",
      "--prepare-managed",
      "--expected-sha",
      sha,
      "--change-reference",
      "PR #460",
      "--evidence-dir",
      evidenceDirectory,
    ],
    { cwd: repoRoot, env: environment, encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stderr}${result.stdout}`,
    /database_configuration_invalid/u,
  );
  const evidence = JSON.parse(
    readFileSync(join(evidenceDirectory, "prepare-managed.json"), "utf8"),
  ) as Record<string, unknown>;
  assert.equal(evidence.status, "failed");
  assert.equal(evidence.errorCode, "database_configuration_invalid");
  assert.equal(evidence.expectedSha, sha);
  assert.equal(JSON.stringify(evidence).includes("migration-password"), false);
});

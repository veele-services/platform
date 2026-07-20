import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONFIRMATION,
  BACKUP_SCHEMAS,
  CRITICAL_RELATIONS,
  EXPECTED_STAGING_PROJECT_REF,
  REQUIRED_SECRET_NAMES,
  REQUIRED_VARIABLE_NAMES,
  assertMatchingCounts,
  isAllowedRouteStatus,
  isFullSha,
  parseArgs,
  parsePostgresEnv,
  sanitizePublicUrl,
  validateRuntimeConfig,
} from "../scripts/fieldgrid-phase2e-staging-preflight.mjs";

const repoRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(join(repoRoot, path), "utf8");
const mainSha = "a".repeat(40);
const stagingSha = "b".repeat(40);

function validEnvironment() {
  const env = {
    APP_ENV: "staging",
    TARGET_ENVIRONMENT: "staging",
    PHASE2E_CONFIRM: CONFIRMATION,
    GITHUB_REF_NAME: "main",
    GITHUB_REPOSITORY: "veele-services/platform",
    GITHUB_TOKEN: "test-token",
    APP_URL: "https://staging.fieldgrid.nl/",
    DATABASE_URL: `postgresql://postgres:test@db.${EXPECTED_STAGING_PROJECT_REF}.supabase.co:5432/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${EXPECTED_STAGING_PROJECT_REF}.supabase.co`,
  };
  for (const name of REQUIRED_SECRET_NAMES)
    env[name] ||= `${name.toLowerCase()}-configured`;
  for (const name of REQUIRED_VARIABLE_NAMES)
    env[name] ||= `${name.toLowerCase()}-configured`;
  Object.assign(env, {
    APP_URL: "https://staging.fieldgrid.nl/",
    BACKOFFICE_PUBLIC_LOGIN_URL: "https://staging.fieldgrid.nl/login",
    PERSONEEL_PUBLIC_HEALTH_URL:
      "https://staging.fieldgrid.nl/personeel/healthz",
    KLANT_PUBLIC_HEALTH_URL: "https://staging.fieldgrid.nl/klant/healthz",
    API_PUBLIC_HEALTH_URL: "https://staging.fieldgrid.nl/api/healthz",
    API_PUBLIC_ROOT_URL: "https://staging.fieldgrid.nl/rest/v1/",
    PILOT_TENANT_LOGIN_URL: "https://field-demo.fieldgrid.nl/login",
  });
  return env;
}

test("Phase 2E arguments and immutable SHAs are fail closed", () => {
  const options = parseArgs([
    "--run",
    "--expected-main",
    mainSha,
    "--expected-staging",
    stagingSha,
  ]);
  assert.equal(options.run, true);
  assert.equal(options.expectedMain, mainSha);
  assert.equal(options.expectedStaging, stagingSha);
  assert.equal(isFullSha(mainSha), true);
  assert.equal(isFullSha("A".repeat(40)), false);
  assert.equal(isFullSha("abc"), false);

  assert.deepEqual(
    validateRuntimeConfig(
      { expectedMain: mainSha, expectedStaging: stagingSha },
      validEnvironment(),
    ),
    [],
  );
  const moved = validEnvironment();
  moved.GITHUB_REF_NAME = "staging";
  assert.match(
    validateRuntimeConfig(
      { expectedMain: mainSha, expectedStaging: stagingSha },
      moved,
    ).join(" "),
    /dispatched from main/u,
  );
});

test("secret and routing preflight lists every required deployment dependency by name only", () => {
  assert.ok(
    REQUIRED_SECRET_NAMES.includes("FIELDGRID_CREDENTIAL_RECOVERY_SECRET"),
  );
  assert.ok(REQUIRED_SECRET_NAMES.includes("MOLLIE_WEBHOOK_SECRET"));
  assert.ok(REQUIRED_VARIABLE_NAMES.includes("PILOT_TENANT_LOGIN_URL"));

  const env = validEnvironment();
  delete env.FIELDGRID_CREDENTIAL_RECOVERY_SECRET;
  const errors = validateRuntimeConfig(
    { expectedMain: mainSha, expectedStaging: stagingSha },
    env,
  );
  assert.match(errors.join(" "), /FIELDGRID_CREDENTIAL_RECOVERY_SECRET/u);
  assert.doesNotMatch(errors.join(" "), /test-token/u);
});

test("database URL parsing creates libpq fields without retaining a URL", () => {
  assert.deepEqual(
    parsePostgresEnv(
      "postgresql://runner:p%40ss@db.example.test:6543/staging_copy?sslmode=verify-full",
    ),
    {
      PGHOST: "db.example.test",
      PGPORT: "6543",
      PGUSER: "runner",
      PGPASSWORD: "p@ss",
      PGDATABASE: "staging_copy",
      PGSSLMODE: "verify-full",
    },
  );
  assert.throws(() => parsePostgresEnv("https://example.test/db"), /postgres/u);
  assert.deepEqual(BACKUP_SCHEMAS, [
    "public",
    "auth",
    "storage",
    "drizzle",
    "app_private",
  ]);
});

test("routing policies accept only explicit healthy outcomes", () => {
  assert.equal(
    sanitizePublicUrl("https://staging.fieldgrid.nl/login?token=ignored"),
    "https://staging.fieldgrid.nl/login",
  );
  assert.equal(isAllowedRouteStatus("exact-200", 200), true);
  assert.equal(isAllowedRouteStatus("exact-200", 302), false);
  assert.equal(isAllowedRouteStatus("login", 307), true);
  assert.equal(isAllowedRouteStatus("api-root", 401), true);
  assert.equal(isAllowedRouteStatus("api-root", 404), false);
  assert.equal(isAllowedRouteStatus("api-root", 500), false);
});

test("restored critical data must be exactly count-equal", () => {
  const counts = Object.fromEntries(
    CRITICAL_RELATIONS.map((relation, index) => [relation, index]),
  );
  assert.equal(assertMatchingCounts(counts, { ...counts }), true);
  assert.throws(
    () =>
      assertMatchingCounts(counts, { ...counts, [CRITICAL_RELATIONS[0]]: 999 }),
    /critical row counts differ/u,
  );
});

test("manual workflow is staging-only and never promotes or uploads the database dump", () => {
  const workflow = read(".github/workflows/phase2e-staging-preflight.yml");
  for (const marker of [
    "workflow_dispatch:",
    "if: github.ref_name == 'main'",
    "environment: staging",
    "group: veele-staging",
    "persist-credentials: false",
    "phase2e-staging-only",
    "fieldgrid:phase2e-staging-preflight",
    "artifacts/phase2e-staging-preflight/",
  ])
    assert.match(
      workflow,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
    );
  const postgresSetup = workflow.indexOf(
    "scripts/fieldgrid-setup-postgresql17.sh",
  );
  const runtimeCheck = workflow.indexOf("Check staging preflight runtime");
  const proofStep = workflow.indexOf(
    "Prove backup, isolated restore, migrations, secrets, routes and rollback target",
  );
  assert.ok(
    postgresSetup >= 0,
    "the self-hosted runner must provision unprivileged PostgreSQL 17",
  );
  assert.ok(
    postgresSetup < runtimeCheck,
    "PostgreSQL 17 must be available before the preflight runtime check",
  );
  for (const secretName of REQUIRED_SECRET_NAMES) {
    const secretBinding = workflow.indexOf(`secrets.${secretName}`);
    assert.ok(secretBinding > proofStep, `${secretName} must be step-scoped`);
  }
  assert.doesNotMatch(
    workflow,
    /docker\/setup-docker-action|git push|refs\/heads\/staging|\.dump/u,
  );

  const script = read("scripts/fieldgrid-phase2e-staging-preflight.mjs");
  assert.match(script, /pg_dump/u);
  assert.match(script, /pg_restore/u);
  assert.match(script, /--serializable-deferrable/u);
  assert.match(script, /postgresql:17\.10-unprivileged-local/u);
  assert.match(script, /pg_ctl/u);
  assert.match(script, /"--auth-host",\s*"scram-sha-256"/u);
  assert.match(script, /randomBytes\(32\)/u);
  assert.match(
    script,
    /async function restoreBackup[\s\S]*?"--dbname",\s*target\.database/u,
  );
  const dropDefaultPublic = script.indexOf(
    'await psql(pgEnv, "drop schema public;")',
  );
  const createRestoreRoles = script.indexOf(
    "await psql(pgEnv, restoreRoleSql())",
  );
  assert.ok(dropDefaultPublic >= 0);
  assert.ok(dropDefaultPublic < createRestoreRoles);
  assert.doesNotMatch(script, /runCommand\("docker"|postgres:17/u);
  assert.match(script, /fieldgrid-backfill-release-sha-marker\.sh/u);
  assert.match(script, /FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL/u);
  assert.match(script, /promotionPerformed: false/u);
  assert.doesNotMatch(script, /git", \["push"|gh pr merge|production/u);
});

test("runner setup uses checksum-pinned PostgreSQL 17 packages without host privilege", () => {
  const setup = read("scripts/fieldgrid-setup-postgresql17.sh");
  assert.match(setup, /POSTGRES_VERSION="17\.10"/u);
  assert.match(setup, /postgresql-client-17_/u);
  assert.match(setup, /postgresql-17_/u);
  assert.match(setup, /sha256sum --check --status/u);
  assert.match(setup, /apt\.postgresql\.org/u);
  assert.doesNotMatch(setup, /\bsudo\b|apt-get install|docker/u);
});

test("deployment receives the mandatory credential recovery secret", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const occurrences =
    deploy.match(/FIELDGRID_CREDENTIAL_RECOVERY_SECRET/gu) ?? [];
  assert.ok(occurrences.length >= 2);
  assert.match(deploy, /secrets\.FIELDGRID_CREDENTIAL_RECOVERY_SECRET/u);
  assert.match(deploy, /printf 'FIELDGRID_CREDENTIAL_RECOVERY_SECRET=%s\\n'/u);

  const packageJson = JSON.parse(read("package.json"));
  assert.equal(
    packageJson.scripts["fieldgrid:phase2e-staging-preflight:check"],
    "node scripts/fieldgrid-phase2e-staging-preflight.mjs --check",
  );
});

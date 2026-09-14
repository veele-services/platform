import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION,
  TENANT_MANAGEMENT_AUTHORIZATION_PROJECT_REF,
  assertSuccessfulTenantManagementValidationRun,
  assertTenantManagementAuthorizationHistory,
  formatSafeTenantManagementAuthorizationError,
  parseTenantManagementAuthorizationArgs,
  runTenantManagementAuthorization,
  sanitizeTenantManagementAuthorizationImpact,
  tenantManagementAuthorizationFrontier,
  validateTenantManagementAuthorizationConfig,
  verifyTenantManagementAuthorizationMainHead,
  type AuthorizationImpact,
  type AuthorizationQueryable,
} from "../../scripts/fieldgrid-staging-tenant-management-authorization.mts";
import { TENANT_MANAGEMENT_MIGRATION_NAME } from "../../scripts/fieldgrid-tenant-management-authorization-contract.mts";

const sha = "a".repeat(40);
const hash = (sql: string) => createHash("sha256").update(sql).digest("hex");
const source = { name: TENANT_MANAGEMENT_MIGRATION_NAME, sql: "SELECT 42;", hash: hash("SELECT 42;") };
const legacy = { name: "001_fixture.sql", sql: "SELECT 1;", hash: hash("SELECT 1;") };
const predecessor = { name: "20260101000000_fixture.sql", sql: "SELECT 2;", hash: hash("SELECT 2;") };
const successor = { name: "29990101000000_fixture.sql", sql: "SELECT 3;", hash: hash("SELECT 3;") };
const base = {
  committed: [legacy, predecessor, source, successor],
  predecessors: [legacy],
  required: [predecessor],
  successors: new Set([source.name, successor.name]),
  legacyNames: new Set([legacy.name]),
  historical: new Map<string, { kind: "renamed" | "tombstone"; canonicalName: string | null; hash: string }>(),
};
const historyRecord = (entry: typeof source, index: number) => ({
  name: entry.name, hash: entry.hash, baselined: false,
  appliedAt: new Date(Date.UTC(2026, 0, index + 1)),
});
const initialHistory = () => [historyRecord(legacy, 0), historyRecord(predecessor, 1)];
const preserved: AuthorizationImpact = { legacy_pairs: 2, preserved_pairs: 2, missing_pairs: 0, scoped_pairs: 3 };
const missing: AuthorizationImpact = { legacy_pairs: 2, preserved_pairs: 1, missing_pairs: 1, scoped_pairs: 3 };
const validEnvironment = {
  APP_ENV: "staging", TARGET_ENVIRONMENT: "staging", GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_REF_NAME: "main",
  GITHUB_REPOSITORY: "veele-services/platform", GITHUB_RUN_ID: "1234", GITHUB_RUN_ATTEMPT: "1",
  GITHUB_SHA: sha, GITHUB_TOKEN: "fixture-github-token",
  EXPECTED_SUPABASE_PROJECT_REF: TENANT_MANAGEMENT_AUTHORIZATION_PROJECT_REF,
  NEXT_PUBLIC_SUPABASE_URL: `https://${TENANT_MANAGEMENT_AUTHORIZATION_PROJECT_REF}.supabase.co`,
  DATABASE_URL: `postgresql://fieldgrid_runtime_app:runtime-fixture@db.${TENANT_MANAGEMENT_AUTHORIZATION_PROJECT_REF}.supabase.co:5432/postgres`,
  FIELDGRID_MIGRATION_DATABASE_URL: `postgresql://postgres:migration-fixture@db.${TENANT_MANAGEMENT_AUTHORIZATION_PROJECT_REF}.supabase.co:5432/postgres`,
  FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
  FIELDGRID_TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION: TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION,
  FIELDGRID_DATABASE_SSL_ROOT_CERT: "/tmp/fixture-root.crt",
  DB_SSL: "true", DB_SSL_REJECT_UNAUTHORIZED: "true", PGSSLMODE: "verify-full",
};

test("CLI accepts only dedicated operations and a single exact main SHA", () => {
  assert.deepEqual(parseTenantManagementAuthorizationArgs(["--check"]), { mode: "check", expectedSha: "" });
  for (const mode of ["diagnose", "apply"] as const) {
    assert.deepEqual(parseTenantManagementAuthorizationArgs([`--${mode}`, "--expected-sha", sha]), { mode, expectedSha: sha });
  }
  for (const args of [[], ["--apply"], ["--repair"], ["--apply", "--diagnose"],
    ["--apply", "--expected-sha", sha, "--expected-sha", sha],
    ["--apply", "--expected-sha", "bad"], ["--check", "--sql", "secret-payload"],
    ["--check", "--expected-sha"]]) {
    assert.throws(() => parseTenantManagementAuthorizationArgs(args), /configuration_invalid/u);
  }
});

test("live configuration pins staging, main, purpose, TLS, project and separate credentials", () => {
  for (const mode of ["diagnose", "apply"] as const) {
    assert.deepEqual(validateTenantManagementAuthorizationConfig({ mode, expectedSha: sha }, validEnvironment), []);
  }
  for (const [key, value] of [
    ["APP_ENV", "production"], ["TARGET_ENVIRONMENT", "local"], ["GITHUB_ACTIONS", "false"],
    ["GITHUB_EVENT_NAME", "push"], ["GITHUB_REF", "refs/heads/staging"], ["GITHUB_REF_NAME", "staging"],
    ["GITHUB_REPOSITORY", "foreign/repository"], ["GITHUB_RUN_ID", "../../file"], ["GITHUB_RUN_ATTEMPT", "0"],
    ["GITHUB_SHA", "b".repeat(40)], ["EXPECTED_SUPABASE_PROJECT_REF", "otherproject"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid"], ["DATABASE_URL", ""],
    ["FIELDGRID_MIGRATION_DATABASE_URL", ""], ["FIELDGRID_DATABASE_CONNECTION_PURPOSE", "runtime"],
    ["FIELDGRID_TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION", "wrong"],
    ["FIELDGRID_DATABASE_SSL_ROOT_CERT", "relative.crt"], ["DB_SSL", "false"],
    ["DB_SSL_REJECT_UNAUTHORIZED", "false"], ["PGSSLMODE", "require"],
    ["FIELDGRID_MIGRATION_DATABASE_URL", validEnvironment.FIELDGRID_MIGRATION_DATABASE_URL.replace(":5432", ":6543")],
    ["FIELDGRID_MIGRATION_DATABASE_URL", validEnvironment.FIELDGRID_MIGRATION_DATABASE_URL + "?sslmode=disable"],
    ["FIELDGRID_MIGRATION_DATABASE_URL", validEnvironment.DATABASE_URL],
  ]) {
    assert.ok(validateTenantManagementAuthorizationConfig({ mode: "apply", expectedSha: sha },
      { ...validEnvironment, [key!]: value }).length > 0, key);
  }
  assert.deepEqual(validateTenantManagementAuthorizationConfig({ mode: "check", expectedSha: "" }, {}), []);
});

test("frontier permits only the source-owned migration after every exact predecessor", () => {
  const frontier = tenantManagementAuthorizationFrontier(base, source);
  assert.deepEqual(frontier.required, [source]);
  assert.deepEqual(frontier.predecessors, [legacy, predecessor]);
  assert.deepEqual(frontier.successors, new Set([successor.name]));
  assert.deepEqual(base.required, [predecessor]);
  assert.deepEqual(assertTenantManagementAuthorizationHistory(frontier, initialHistory()), [source]);
  assert.deepEqual(assertTenantManagementAuthorizationHistory(frontier,
    [...initialHistory(), historyRecord(source, 2)]), []);
  for (const records of [
    [historyRecord(legacy, 0)],
    [...initialHistory(), historyRecord(successor, 3)],
    [...initialHistory(), { ...historyRecord(source, 2), baselined: true }],
    [...initialHistory(), { ...historyRecord(source, 2), hash: "b".repeat(64) }],
    [...initialHistory(), historyRecord(predecessor, 2)],
    [...initialHistory(), { ...historyRecord(source, 2), name: "20260101000001_unreviewed.sql" }],
    [{ ...historyRecord(legacy, 0), hash: "c".repeat(64) }, historyRecord(predecessor, 1)],
    [historyRecord(legacy, 0), { ...historyRecord(predecessor, 1), baselined: true }],
  ]) assert.throws(() => assertTenantManagementAuthorizationHistory(frontier, records), /history_invalid/u);
  assert.throws(() => tenantManagementAuthorizationFrontier(base, { ...source, sql: "SELECT 43;" }), /source_invalid/u);
  assert.throws(() => tenantManagementAuthorizationFrontier(base, { ...source, name: successor.name }), /source_invalid/u);
});

test("impact exports only consistent, nonnegative safe integer counts", () => {
  assert.deepEqual(sanitizeTenantManagementAuthorizationImpact({ ...preserved, email: "must-not-leak" }), preserved);
  for (const impact of [null, {}, { ...preserved, legacy_pairs: "2" },
    { ...preserved, missing_pairs: -1 }, { ...preserved, missing_pairs: 1 },
    { ...preserved, scoped_pairs: 1 }, { ...preserved, scoped_pairs: Infinity },
    { ...preserved, legacy_pairs: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => sanitizeTenantManagementAuthorizationImpact(impact), /impact_invalid/u);
  }
});

function fixture(options: {
  applied?: boolean;
  impacts?: readonly AuthorizationImpact[];
  contract?: readonly boolean[];
  lock?: boolean;
  failSql?: string;
  invalidJournal?: boolean;
  records?: Readonly<ReturnType<typeof initialHistory>>;
} = {}) {
  const calls: string[] = [];
  let installed = options.applied ?? false;
  let recorded = installed;
  let impactReads = 0;
  let contractReads = 0;
  const records = options.records ?? [...initialHistory(), ...(recorded ? [historyRecord(source, 2)] : [])];
  const queryable = {
    async query(sql: string, values?: unknown[]) {
      calls.push(sql);
      if (options.failSql && sql.startsWith(options.failSql)) throw new Error("sensitive database error: fixture-secret");
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: options.lock ?? true }], rowCount: 1 };
      if (sql.includes("pg_advisory_unlock")) return { rows: [{ released: true }], rowCount: 1 };
      if (sql.includes('applied_at AS "appliedAt"')) return { rows: records, rowCount: records.length };
      if (sql === source.sql) installed = true;
      if (sql.startsWith("INSERT INTO drizzle.veele_sql_migrations")) {
        assert.deepEqual(values, [source.name, source.hash]);
        recorded = true;
        return { rows: [{ name: source.name, hash: source.hash, baselined: false }], rowCount: options.invalidJournal ? 0 : 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as AuthorizationQueryable;
  const dependencies = {
    loadFrontier: async () => base,
    loadSource: async () => source,
    verifyContract: async () => {
      calls.push("VERIFY CONTRACT");
      return options.contract?.[contractReads++] ?? (installed && recorded);
    },
    readImpact: async () => {
      calls.push("READ IMPACT");
      const impacts = options.impacts ?? [preserved];
      return impacts[Math.min(impactReads++, impacts.length - 1)]!;
    },
  };
  return { calls, queryable, dependencies };
}

test("diagnose uses a read-only repeatable snapshot and reports missing entitlements without writes", async () => {
  const f = fixture({ impacts: [missing] });
  const result = await runTenantManagementAuthorization(f.queryable, "diagnose", f.dependencies);
  assert.deepEqual(result, { result: "diagnosed", migrationRecorded: false, contractVerified: false, impact: missing });
  assert.ok(f.calls.includes("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"));
  assert.ok(f.calls.includes("ROLLBACK"));
  assert.ok(!f.calls.some((sql) => /^(?:LOCK TABLE|INSERT|UPDATE|DELETE|COMMIT)/u.test(sql)));
  assert.ok(f.calls.at(-1)?.includes("pg_advisory_unlock"));
});

test("apply locks in migration order, preserves counts, and verifies catalog after atomic journal insertion", async () => {
  const f = fixture();
  const result = await runTenantManagementAuthorization(f.queryable, "apply", f.dependencies);
  assert.equal(result.result, "applied");
  const locks = f.calls.findIndex((sql) => sql.startsWith("LOCK TABLE\n"));
  assert.match(f.calls[locks]!, /public\.platform_users, public\.role_permissions, public\.roles/u);
  assert.ok(locks < f.calls.indexOf("READ IMPACT"));
  assert.ok(f.calls.includes("BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE"));
  const migrationIndex = f.calls.indexOf(source.sql);
  const journalIndex = f.calls.findIndex((sql) => sql.startsWith("INSERT INTO drizzle.veele_sql_migrations"));
  assert.ok(migrationIndex < journalIndex);
  assert.ok(journalIndex < f.calls.lastIndexOf("VERIFY CONTRACT"));
  assert.ok(f.calls.lastIndexOf("VERIFY CONTRACT") < f.calls.indexOf("COMMIT"));
  assert.equal(f.calls.filter((sql) => sql === source.sql).length, 1);
  assert.ok(!f.calls.some((sql) => /^(?:UPDATE|DELETE)/u.test(sql)));
});

test("already-applied requires exact catalog but allows subsequent legitimate scoped revocation", async () => {
  const f = fixture({ applied: true, impacts: [missing] });
  assert.equal((await runTenantManagementAuthorization(f.queryable, "apply", f.dependencies)).result, "already-applied");
  assert.ok(!f.calls.includes(source.sql));
  assert.ok(!f.calls.some((sql) => sql.startsWith("INSERT")));
  const drift = fixture({ applied: true, contract: [false] });
  await assert.rejects(runTenantManagementAuthorization(drift.queryable, "apply", drift.dependencies), /catalog_invalid/u);
  assert.ok(drift.calls.includes("ROLLBACK"));
});

test("missing access, history drift and unavailable locks prevent migration execution", async () => {
  for (const [options, error] of [
    [{ impacts: [missing] }, /access_preservation_failed/u],
    [{ records: [historyRecord(legacy, 0)] }, /history_invalid/u],
    [{ lock: false }, /lock_unavailable/u],
    [{ contract: [true] }, /catalog_invalid/u],
  ] as const) {
    const f = fixture(options);
    await assert.rejects(runTenantManagementAuthorization(f.queryable, "apply", f.dependencies), error);
    assert.ok(!f.calls.includes(source.sql));
    assert.ok(!f.calls.includes("COMMIT"));
  }
});

test("SQL, journal, preservation, postcondition and commit failures roll back without retries or raw errors", async () => {
  for (const options of [
    { failSql: source.sql }, { failSql: "INSERT INTO drizzle.veele_sql_migrations" },
    { invalidJournal: true }, { contract: [false, false] },
    { impacts: [preserved, { ...preserved, scoped_pairs: 4 }] }, { failSql: "COMMIT" },
  ]) {
    const f = fixture(options);
    await assert.rejects(runTenantManagementAuthorization(f.queryable, "apply", f.dependencies), (error: unknown) => {
      assert.doesNotMatch(formatSafeTenantManagementAuthorizationError(error), /fixture-secret|sensitive database/u);
      return true;
    });
    assert.ok(f.calls.includes("ROLLBACK"));
    assert.ok(f.calls.at(-1)?.includes("pg_advisory_unlock"));
    assert.ok(f.calls.filter((sql) => sql === source.sql).length <= 1);
  }
  assert.doesNotMatch(formatSafeTenantManagementAuthorizationError(new Error("secret")), /secret/u);
});

const successfulRun = {
  id: 12, head_sha: sha, head_branch: "main", name: "Main Exact Head Validation",
  path: ".github/workflows/main-exact-head-validation.yml", event: "push",
  head_repository: { full_name: "veele-services/platform" }, status: "completed", conclusion: "success",
};

test("apply CI evidence must be the newest exact-main validation run, completed successfully", () => {
  assert.doesNotThrow(() => assertSuccessfulTenantManagementValidationRun({ total_count: 1, workflow_runs: [successfulRun] }, sha));
  for (const change of [{ head_sha: "b".repeat(40) }, { head_branch: "feature" },
    { event: "pull_request" }, { path: ".github/workflows/other.yml" }, { name: "Other validation" },
    { head_repository: { full_name: "foreign/repository" } }, { status: "in_progress" },
    { conclusion: "failure" }]) {
    assert.throws(() => assertSuccessfulTenantManagementValidationRun({ total_count: 1, workflow_runs: [{ ...successfulRun, ...change }] }, sha), /main_validation_failed/u);
  }
  assert.throws(() => assertSuccessfulTenantManagementValidationRun({ total_count: 2, workflow_runs: [
    successfulRun, { ...successfulRun, id: 13, conclusion: "failure" },
  ] }, sha), /main_validation_failed/u);
  assert.throws(() => assertSuccessfulTenantManagementValidationRun({ total_count: 101, workflow_runs: [successfulRun] }, sha));
});

test("remote verification binds main and exact workflow runs; diagnosis needs no successful CI", async () => {
  for (const operation of ["diagnose", "apply"] as const) {
    const requested: string[] = [];
    const request = (async (url: string | URL | Request) => {
      requested.push(String(url));
      return new Response(JSON.stringify(String(url).includes("/git/ref/")
        ? { object: { sha } } : { total_count: 1, workflow_runs: [successfulRun] }), { status: 200 });
    }) as typeof fetch;
    await verifyTenantManagementAuthorizationMainHead(sha, operation, validEnvironment, request);
    assert.equal(requested.length, operation === "apply" ? 2 : 1);
    if (operation === "apply") assert.match(requested[1]!, /main-exact-head-validation\.yml\/runs\?branch=main&head_sha=/u);
  }
  const rejected = (async () => { throw new Error("secret-token"); }) as typeof fetch;
  await assert.rejects(verifyTenantManagementAuthorizationMainHead(sha, "apply", validEnvironment, rejected), /main_validation_failed/u);
});

test("workflow runs source checks before credentials and exposes only bounded diagnose/apply with one-day evidence", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/fieldgrid-staging-tenant-management-authorization.yml", import.meta.url), "utf8");
  assert.match(workflow, /group: veele-staging\s+cancel-in-progress: false/u);
  assert.match(workflow, /environment: staging/u);
  assert.match(workflow, /actions: read/u);
  assert.match(workflow, /retention-days: 1\b/u);
  assert.match(workflow, /verifyTenantManagementAuthorizationMainHead/u);
  assert.match(workflow, /fieldgrid-staging-tenant-management-authorization\.test\.ts/u);
  const sourceContractCommand = "node --test tests/security/fieldgrid-tenant-management-authorization-source.test.mjs";
  assert.ok(workflow.includes(sourceContractCommand));
  assert.ok(workflow.indexOf(sourceContractCommand) < workflow.indexOf("FIELDGRID_MIGRATION_DATABASE_URL:"));
  assert.match(workflow, /--noEmit/u);
  assert.match(workflow, /--check/u);
  assert.ok(workflow.indexOf("Validate bounded runner") < workflow.indexOf("FIELDGRID_MIGRATION_DATABASE_URL:"));
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_AUTH|fieldDemoExistingOwnerQuery|db:migrate|repair-platform-privilege/u);
  assert.doesNotMatch(workflow, /\$\{\{\s*inputs\.[^}]+\}\}(?:[^\n]*\n)?\s*--/u);
});

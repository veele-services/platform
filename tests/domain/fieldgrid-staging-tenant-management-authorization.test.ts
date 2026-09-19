import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION,
  TENANT_MANAGEMENT_AUTHORIZATION_PROJECT_REF,
  TENANT_MANAGEMENT_POLICY_RECONCILIATION_MIGRATION_HASH,
  TENANT_MANAGEMENT_POLICY_RECONCILIATION_MIGRATION_NAME,
  TENANT_MANAGEMENT_POLICY_REPAIR_MIGRATION_NAME,
  assertSuccessfulTenantManagementValidationRun,
  assertTenantManagementAuthorizationHistory,
  formatSafeTenantManagementAuthorizationError,
  parseTenantManagementAuthorizationArgs,
  runTenantManagementAuthorization,
  runTenantManagementAuthorizationSession,
  sanitizeTenantManagementAuthorizationImpact,
  tenantManagementAuthorizationFrontier,
  validateTenantManagementAuthorizationConfig,
  verifyTenantManagementAuthorizationMainHead,
  type AuthorizationImpact,
  type AuthorizationDependencies,
  type AuthorizationQueryable,
} from "../../scripts/fieldgrid-staging-tenant-management-authorization.mts";
import { TENANT_MANAGEMENT_MIGRATION_NAME } from "../../scripts/fieldgrid-tenant-management-authorization-contract.mts";

const sha = "a".repeat(40);
const hash = (sql: string) => createHash("sha256").update(sql).digest("hex");
const source = { name: TENANT_MANAGEMENT_MIGRATION_NAME, sql: "SELECT 42;", hash: hash("SELECT 42;") };
const policyReconciliation = {
  name: TENANT_MANAGEMENT_POLICY_RECONCILIATION_MIGRATION_NAME,
  sql: "SELECT 41;",
  hash: TENANT_MANAGEMENT_POLICY_RECONCILIATION_MIGRATION_HASH,
};
const repair = { name: TENANT_MANAGEMENT_POLICY_REPAIR_MIGRATION_NAME, sql: "SELECT 43;", hash: hash("SELECT 43;") };
const legacy = { name: "001_fixture.sql", sql: "SELECT 1;", hash: hash("SELECT 1;") };
const predecessor = { name: "20260101000000_fixture.sql", sql: "SELECT 2;", hash: hash("SELECT 2;") };
const successor = { name: "29990101000000_fixture.sql", sql: "SELECT 3;", hash: hash("SELECT 3;") };
const base = {
  committed: [legacy, predecessor, policyReconciliation, source, repair],
  predecessors: [legacy],
  required: [predecessor],
  successors: new Set([source.name, repair.name]),
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

test("frontier pins the exact three-source suffix and accepts only complete pair states", () => {
  const frontier = tenantManagementAuthorizationFrontier(base, source, repair);
  assert.deepEqual(frontier.required, [policyReconciliation, source, repair]);
  assert.deepEqual(frontier.predecessors, [legacy, predecessor]);
  assert.deepEqual(frontier.successors, new Set());
  assert.deepEqual(base.required, [predecessor]);
  assert.deepEqual(assertTenantManagementAuthorizationHistory(frontier, initialHistory()), [policyReconciliation, source, repair]);
  const pairHistory = [...initialHistory(), historyRecord(policyReconciliation, 2), historyRecord(source, 3)];
  assert.deepEqual(assertTenantManagementAuthorizationHistory(frontier, pairHistory), [repair]);
  assert.deepEqual(assertTenantManagementAuthorizationHistory(frontier, [...pairHistory, historyRecord(repair, 4)]), []);
  for (const records of [
    [historyRecord(legacy, 0)],
    [...initialHistory(), historyRecord(successor, 4)],
    [...initialHistory(), historyRecord(policyReconciliation, 2)],
    [...initialHistory(), historyRecord(source, 3)],
    [...initialHistory(), historyRecord(repair, 4)],
    [...pairHistory, { ...historyRecord(repair, 4), baselined: true }],
    [...pairHistory, { ...historyRecord(repair, 4), hash: "b".repeat(64) }],
    [...initialHistory(), historyRecord(predecessor, 2)],
    [...pairHistory, { ...historyRecord(repair, 4), name: "20260101000001_unreviewed.sql" }],
    [{ ...historyRecord(legacy, 0), hash: "c".repeat(64) }, historyRecord(predecessor, 1)],
    [historyRecord(legacy, 0), { ...historyRecord(predecessor, 1), baselined: true }],
  ]) assert.throws(() => assertTenantManagementAuthorizationHistory(frontier, records), /history_invalid/u);
  for (const candidate of [
    { ...base, committed: [...base.committed, successor] },
    { ...base, committed: [legacy, predecessor, policyReconciliation, source, successor, repair] },
    { ...base, committed: [legacy, predecessor, policyReconciliation, source] },
  ]) assert.throws(() => tenantManagementAuthorizationFrontier(candidate, source, repair), /source_invalid/u);
  assert.throws(() => tenantManagementAuthorizationFrontier(base, { ...source, sql: "SELECT 99;" }, repair), /source_invalid/u);
  assert.throws(() => tenantManagementAuthorizationFrontier(base, source, { ...repair, sql: "SELECT 99;" }), /source_invalid/u);
  assert.throws(() => tenantManagementAuthorizationFrontier(base, source, { ...repair, name: successor.name }), /source_invalid/u);
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
  scopeApplied?: boolean;
  repaired?: boolean;
  clean?: boolean;
  impacts?: readonly AuthorizationImpact[];
  scopeContract?: readonly unknown[];
  scopeCatalog?: readonly unknown[];
  repairCatalog?: readonly unknown[];
  repairReadiness?: unknown;
  scopeReadiness?: readonly unknown[];
  lock?: boolean;
  failSql?: string;
  invalidJournal?: boolean;
  journalDrift?: boolean;
  records?: Readonly<ReturnType<typeof initialHistory>>;
} = {}) {
  const calls: string[] = [];
  const journalNames: string[] = [];
  let scopeInstalled = options.applied ?? options.scopeApplied ?? false;
  let repairInstalled = options.repaired ?? (!options.clean && scopeInstalled);
  let impactReads = 0, scopeContractReads = 0, scopeCatalogReads = 0, repairCatalogReads = 0, scopeReadinessReads = 0;
  const records = [...(options.records ?? [...initialHistory(), ...(scopeInstalled
    ? [historyRecord(policyReconciliation, 2), historyRecord(source, 3)] : []),
  ...(options.applied ? [historyRecord(repair, 4)] : [])])];
  const queryable = {
    async query(sql: string, values?: unknown[]) {
      calls.push(sql);
      if (options.failSql && sql.startsWith(options.failSql)) throw new Error("sensitive database error: fixture-secret");
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: options.lock ?? true }], rowCount: 1 };
      if (sql.includes("pg_advisory_unlock")) return { rows: [{ released: true }], rowCount: 1 };
      if (sql.includes('applied_at AS "appliedAt"')) return { rows: [...records], rowCount: records.length };
      if (sql === source.sql) scopeInstalled = true;
      if (sql === repair.sql) repairInstalled = true;
      if (sql.startsWith("INSERT INTO drizzle.veele_sql_migrations")) {
        const entry = [policyReconciliation, source, repair].find((candidate) => candidate.name === values?.[0]);
        assert.ok(entry);
        journalNames.push(entry.name);
        records.push({ ...historyRecord(entry, records.length), ...(options.journalDrift ? { hash: "c".repeat(64) } : {}) });
        return { rows: [{ name: values?.[0], hash: values?.[1], baselined: false }], rowCount: options.invalidJournal ? 0 : 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as AuthorizationQueryable;
  const dependencies: AuthorizationDependencies = {
    loadFrontier: async () => base,
    loadSource: async () => source,
    loadRepairSource: async () => repair,
    verifyScopeContract: async () => {
      calls.push("VERIFY SCOPE CONTRACT");
      return (options.scopeContract?.[scopeContractReads++] ??
        (scopeInstalled && records.some((entry) => entry.name === source.name))) as boolean;
    },
    verifyScopeCatalog: async () => {
      calls.push("VERIFY SCOPE CATALOG");
      return (options.scopeCatalog?.[scopeCatalogReads++] ?? scopeInstalled) as boolean;
    },
    verifyRepairCatalog: async () => {
      calls.push("VERIFY REPAIR CATALOG");
      return (options.repairCatalog?.[repairCatalogReads++] ?? repairInstalled) as boolean;
    },
    readRepairReadiness: async () => {
      calls.push("READ REPAIR READINESS");
      return (options.repairReadiness ?? {
        legacyDefinitionMatches: !repairInstalled && !options.clean, cleanDefinitionMatches: options.clean ?? false, targetDefinitionMatches: repairInstalled, dependenciesValid: true,
      }) as Awaited<ReturnType<AuthorizationDependencies["readRepairReadiness"]>>;
    },
    readScopeReadiness: async () => {
      calls.push("READ SCOPE READINESS");
      return (options.scopeReadiness?.[scopeReadinessReads++] ?? { readyForApply: repairInstalled }) as { readyForApply: boolean };
    },
    readImpact: async () => {
      calls.push("READ IMPACT");
      const impacts = options.impacts ?? [preserved];
      return impacts[Math.min(impactReads++, impacts.length - 1)]!;
    },
  };
  return { calls, journalNames, queryable, dependencies };
}

test("diagnose is read-only and distinguishes prerequisite readiness from legacy apply readiness", async () => {
  for (const impacts of [[preserved], [missing]]) {
    const f = fixture({ impacts });
    const result = await runTenantManagementAuthorization(f.queryable, "diagnose", f.dependencies);
    assert.deepEqual(result, {
      result: "diagnosed", state: "legacy-state", migrationRecorded: false, scopeMigrationRecorded: false,
      repairMigrationRecorded: false, contractVerified: false, readyForApply: false,
      readyForPrerequisiteRepair: impacts[0] === preserved,
      repairReadiness: {
        legacyDefinitionMatches: true, cleanDefinitionMatches: false,
        targetDefinitionMatches: false, dependenciesValid: true,
      },
      impact: impacts[0],
    });
    assert.ok(f.calls.includes("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"));
    assert.ok(f.calls.includes("ROLLBACK"));
    assert.ok(!f.calls.some((sql) => /^(?:LOCK TABLE|INSERT|UPDATE|DELETE|COMMIT)/u.test(sql)));
    assert.ok(!f.calls.includes(source.sql) && !f.calls.includes(repair.sql));
    assert.ok(f.calls.at(-1)?.includes("pg_advisory_unlock"));
  }
});

test("diagnose reports repaired and unknown states without inventing readiness", async () => {
  const repaired = fixture({ repaired: true });
  const diagnosed = await runTenantManagementAuthorization(repaired.queryable, "diagnose", repaired.dependencies);
  assert.equal(diagnosed.state, "repaired-state");
  assert.equal(diagnosed.readyForApply, true);
  assert.equal(diagnosed.readyForPrerequisiteRepair, true);
  const unknown = fixture({ repairReadiness: { legacyDefinitionMatches: false, cleanDefinitionMatches: false, targetDefinitionMatches: false, dependenciesValid: true } });
  const blocked = await runTenantManagementAuthorization(unknown.queryable, "diagnose", unknown.dependencies);
  assert.equal(blocked.state, "unknown-state");
  assert.equal(blocked.readyForPrerequisiteRepair, false);
  await assert.rejects(runTenantManagementAuthorization(unknown.queryable, "apply", unknown.dependencies), /repair_not_ready/u);
  assert.ok(!unknown.calls.includes(repair.sql));
});

test("diagnose cannot report apply readiness from raw scope preconditions alone", async () => {
  const cases = [
    {
      options: { repaired: true, impacts: [missing], scopeReadiness: [{ readyForApply: true }] },
      state: "repaired-state", prerequisite: false,
    },
    {
      options: {
        repairReadiness: { legacyDefinitionMatches: false, cleanDefinitionMatches: false, targetDefinitionMatches: false, dependenciesValid: true },
        scopeReadiness: [{ readyForApply: true }],
      },
      state: "unknown-state", prerequisite: false,
    },
    {
      options: {
        repaired: true,
        repairReadiness: { legacyDefinitionMatches: false, cleanDefinitionMatches: false, targetDefinitionMatches: true, dependenciesValid: false },
        scopeReadiness: [{ readyForApply: true }],
      },
      state: "unknown-state", prerequisite: false,
    },
    {
      options: { scopeReadiness: [{ readyForApply: true }] },
      state: "legacy-state", prerequisite: true,
    },
    {
      options: { scopeReadiness: [{ readyForApply: false }] },
      state: "legacy-state", prerequisite: true,
    },
    {
      options: { repaired: true, scopeReadiness: [{ readyForApply: false }] },
      state: "repaired-state", prerequisite: true,
    },
  ];
  for (const { options, state, prerequisite } of cases) {
    const f = fixture(options);
    const result = await runTenantManagementAuthorization(f.queryable, "diagnose", f.dependencies);
    assert.equal(result.state, state);
    assert.equal(result.readyForApply, false);
    assert.equal(result.readyForPrerequisiteRepair, prerequisite);
    assert.ok(f.calls.includes("READ SCOPE READINESS"));
    assert.ok(!f.calls.includes(repair.sql) && !f.calls.includes(source.sql));
  }
});

test("apply executes repair before the immutable pair, proves transitions, then journals chronologically", async () => {
  const f = fixture();
  const result = await runTenantManagementAuthorization(f.queryable, "apply", f.dependencies);
  assert.equal(result.result, "applied");
  assert.equal(result.state, "canonical-state");
  assert.equal(result.readyForApply, false);
  const locks = f.calls.findIndex((sql) => sql.startsWith("LOCK TABLE\n"));
  assert.match(f.calls[locks]!, /public\.platform_users, public\.role_permissions, public\.roles/u);
  assert.ok(locks < f.calls.indexOf("READ IMPACT"));
  const policyLocks = f.calls.findIndex((sql) => sql.startsWith("LOCK TABLE public.invoices"));
  assert.ok(locks < policyLocks && policyLocks < f.calls.indexOf("READ REPAIR READINESS"));
  assert.equal(f.calls[policyLocks], `LOCK TABLE public.invoices IN SHARE MODE;
LOCK TABLE public.object_contacts, public.object_personnel IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.objects IN SHARE MODE;
LOCK TABLE public.payments IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.personnel IN SHARE MODE`);
  assert.ok(f.calls.includes("BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE"));
  const repairIndex = f.calls.indexOf(repair.sql);
  const policyIndex = f.calls.indexOf(policyReconciliation.sql);
  const scopeIndex = f.calls.indexOf(source.sql);
  const journalIndex = f.calls.findIndex((sql) => sql.startsWith("INSERT INTO drizzle.veele_sql_migrations"));
  assert.ok(repairIndex < policyIndex && policyIndex < scopeIndex && scopeIndex < journalIndex);
  assert.deepEqual(f.journalNames, [policyReconciliation.name, source.name, repair.name]);
  assert.ok(f.calls.slice(repairIndex + 1, policyIndex).includes("VERIFY REPAIR CATALOG"));
  assert.ok(f.calls.slice(policyIndex + 1, scopeIndex).includes("READ SCOPE READINESS"));
  assert.ok(f.calls.slice(scopeIndex + 1, journalIndex).includes("VERIFY SCOPE CATALOG"));
  assert.ok(f.calls.lastIndexOf("VERIFY SCOPE CONTRACT") < f.calls.indexOf("COMMIT"));
  assert.equal(f.calls.filter((sql) => sql === repair.sql).length, 1);
  assert.equal(f.calls.filter((sql) => sql === policyReconciliation.sql).length, 1);
  assert.equal(f.calls.filter((sql) => sql === source.sql).length, 1);
});

test("pair-installed state executes only target repair and preserves subsequent legitimate scoped revocation", async () => {
  const f = fixture({ scopeApplied: true, impacts: [missing] });
  assert.equal((await runTenantManagementAuthorization(f.queryable, "apply", f.dependencies)).result, "applied");
  assert.ok(f.calls.includes(repair.sql));
  assert.ok(!f.calls.includes(source.sql) && !f.calls.includes(policyReconciliation.sql));
  assert.ok(!f.calls.includes("READ SCOPE READINESS"));
  assert.deepEqual(f.journalNames, [repair.name]);
  const reintroducedLegacy = fixture({ scopeApplied: true, repaired: false });
  await assert.rejects(runTenantManagementAuthorization(reintroducedLegacy.queryable, "apply", reintroducedLegacy.dependencies), /catalog_invalid/u);
  assert.ok(!reintroducedLegacy.calls.includes(repair.sql));
});

test("clean repair is accepted only after the complete historical pair", async () => {
  const clean = fixture({ scopeApplied: true, clean: true, impacts: [missing] });
  const diagnostic = await runTenantManagementAuthorization(clean.queryable, "diagnose", clean.dependencies);
  assert.equal(diagnostic.state, "clean-state");
  assert.equal(diagnostic.contractVerified, false);
  assert.equal(diagnostic.readyForApply, false);
  assert.equal(diagnostic.readyForPrerequisiteRepair, true);
  assert.deepEqual(diagnostic.repairReadiness, {
    legacyDefinitionMatches: false, cleanDefinitionMatches: true,
    targetDefinitionMatches: false, dependenciesValid: true,
  });
  const applied = await runTenantManagementAuthorization(clean.queryable, "apply", clean.dependencies);
  assert.equal(applied.state, "canonical-state");
  assert.equal(applied.contractVerified, true);
  assert.deepEqual(applied.repairReadiness, {
    legacyDefinitionMatches: false, cleanDefinitionMatches: false,
    targetDefinitionMatches: true, dependenciesValid: true,
  });
  assert.deepEqual(clean.journalNames, [repair.name]);
  assert.ok(!clean.calls.includes(policyReconciliation.sql) && !clean.calls.includes(source.sql));

  const beforeScope = fixture({ clean: true, scopeReadiness: [{ readyForApply: true }] });
  const unsupported = await runTenantManagementAuthorization(beforeScope.queryable, "diagnose", beforeScope.dependencies);
  assert.equal(unsupported.state, "clean-state");
  assert.equal(unsupported.readyForApply, false);
  assert.equal(unsupported.readyForPrerequisiteRepair, false);
  await assert.rejects(runTenantManagementAuthorization(beforeScope.queryable, "apply", beforeScope.dependencies), /repair_not_ready/u);
  assert.ok(!beforeScope.calls.includes(repair.sql));

  const falseJournal = fixture({ applied: true, clean: true });
  await assert.rejects(runTenantManagementAuthorization(falseJournal.queryable, "apply", falseJournal.dependencies), /catalog_invalid/u);
  assert.ok(!falseJournal.calls.includes(repair.sql));
});

test("target policy state remains repaired until all journal records are present", async () => {
  const pendingRepair = fixture({ scopeApplied: true });
  const result = await runTenantManagementAuthorization(pendingRepair.queryable, "diagnose", pendingRepair.dependencies);
  assert.equal(result.state, "repaired-state");
  assert.equal(result.contractVerified, false);
  assert.equal(result.repairMigrationRecorded, false);
  assert.equal(result.readyForPrerequisiteRepair, true);
});

test("already-applied is a non-mutating complete contract postcheck", async () => {
  const f = fixture({ applied: true, impacts: [missing] });
  const result = await runTenantManagementAuthorization(f.queryable, "apply", f.dependencies);
  assert.equal(result.result, "already-applied");
  assert.equal(result.contractVerified, true);
  assert.ok(!f.calls.includes(source.sql) && !f.calls.includes(repair.sql));
  assert.ok(!f.calls.some((sql) => sql.startsWith("INSERT")));
  assert.ok(!f.calls.includes("COMMIT"));
  assert.ok(f.calls.includes("ROLLBACK"));
  for (const drift of [fixture({ applied: true, scopeContract: [false] }), fixture({ applied: true, repairCatalog: [false] })]) {
    await assert.rejects(runTenantManagementAuthorization(drift.queryable, "apply", drift.dependencies), /catalog_invalid/u);
  }
});

test("missing access, history drift and unavailable locks prevent all migration SQL", async () => {
  for (const [options, error] of [
    [{ impacts: [missing] }, /access_preservation_failed/u],
    [{ records: [historyRecord(legacy, 0)] }, /history_invalid/u],
    [{ lock: false }, /lock_unavailable/u],
    [{ scopeContract: [true] }, /catalog_invalid/u],
    [{ repairReadiness: { legacyDefinitionMatches: true, cleanDefinitionMatches: false, targetDefinitionMatches: false, dependenciesValid: false } }, /repair_not_ready/u],
  ] as const) {
    const f = fixture(options);
    await assert.rejects(runTenantManagementAuthorization(f.queryable, "apply", f.dependencies), error);
    assert.ok(!f.calls.includes(repair.sql));
    assert.ok(!f.calls.includes("COMMIT"));
  }
});

test("every transition, SQL, journal and commit failure rolls back once without raw output or retry", async () => {
  for (const [options, error] of [
    [{ failSql: repair.sql }, /repair_failed/u],
    [{ failSql: policyReconciliation.sql }, /repair_failed/u],
    [{ failSql: source.sql }, /scope_failed/u],
    [{ repairCatalog: [false, false] }, /repair_failed/u],
    [{ scopeReadiness: [{ readyForApply: false }, { readyForApply: false }] }, /scope_not_ready/u],
    [{ scopeReadiness: [{ readyForApply: false }, { readyForApply: true }, { readyForApply: false }] }, /scope_not_ready/u],
    [{ scopeCatalog: [false, false] }, /catalog_invalid/u],
    [{ failSql: "INSERT INTO drizzle.veele_sql_migrations" }, /history_write_failed/u],
    [{ invalidJournal: true }, /history_write_failed/u],
    [{ journalDrift: true }, /history_invalid/u],
    [{ scopeContract: [false, false] }, /catalog_invalid/u],
    [{ impacts: [preserved, { ...preserved, scoped_pairs: 4 }] }, /access_preservation_failed/u],
    [{ failSql: "COMMIT" }, /commit_uncertain/u],
  ] as const) {
    const f = fixture(options);
    await assert.rejects(runTenantManagementAuthorization(f.queryable, "apply", f.dependencies), error);
    assert.ok(f.calls.includes("ROLLBACK"));
    assert.ok(f.calls.at(-1)?.includes("pg_advisory_unlock"));
    for (const migration of [repair, policyReconciliation, source]) assert.ok(f.calls.filter((sql) => sql === migration.sql).length <= 1);
    assert.ok(f.calls.filter((sql) => sql === "COMMIT").length <= 1);
  }
  assert.doesNotMatch(formatSafeTenantManagementAuthorizationError(new Error("fixture-secret")), /fixture-secret/u);
});

test("non-boolean or contradictory readiness and contract outputs fail closed", async () => {
  for (const options of [
    { scopeContract: ["false"] }, { scopeCatalog: [0] }, { repairCatalog: ["true"] },
    { repairReadiness: {} }, { repairReadiness: [] },
    { repairReadiness: { legacyDefinitionMatches: true, targetDefinitionMatches: false, dependenciesValid: true } },
    { repairReadiness: { legacyDefinitionMatches: true, cleanDefinitionMatches: "false", targetDefinitionMatches: false, dependenciesValid: true } },
    { repairReadiness: { legacyDefinitionMatches: true, cleanDefinitionMatches: true, targetDefinitionMatches: false, dependenciesValid: true } },
    { repairReadiness: { legacyDefinitionMatches: false, cleanDefinitionMatches: true, targetDefinitionMatches: true, dependenciesValid: true } },
    { repairReadiness: { legacyDefinitionMatches: true, cleanDefinitionMatches: false, targetDefinitionMatches: true, dependenciesValid: true } },
    { repairReadiness: { legacyDefinitionMatches: true, cleanDefinitionMatches: false, targetDefinitionMatches: false, dependenciesValid: "true" } },
    { repairReadiness: { legacyDefinitionMatches: true, cleanDefinitionMatches: false, targetDefinitionMatches: false, dependenciesValid: true, policySql: "must-not-export" } },
    { scopeReadiness: [{ readyForApply: "true" }] },
    { repairCatalog: [false, "true"] },
    { scopeCatalog: [false, "true"] },
    { scopeContract: [false, "true"] },
  ]) {
    const f = fixture(options);
    await assert.rejects(runTenantManagementAuthorization(f.queryable, "apply", f.dependencies), /catalog_invalid/u);
    assert.ok(!f.calls.includes("COMMIT"));
  }
});

test("rollback and advisory unlock errors remain bounded and preserve uncertain commit classification", async () => {
  for (const commitFailure of [false, true]) {
    for (const cleanupPhase of ["ROLLBACK", "pg_advisory_unlock"]) {
      const f = fixture({ failSql: commitFailure ? "COMMIT" : repair.sql });
      const original = f.queryable.query.bind(f.queryable);
      f.queryable.query = async (sql, values) => {
        if (sql.includes(cleanupPhase)) throw new Error("fixture-secret cleanup error");
        return original(sql, values);
      };
      await assert.rejects(runTenantManagementAuthorization(f.queryable, "apply", f.dependencies),
        commitFailure ? /commit_uncertain/u : /cleanup_failed/u);
      assert.ok(f.calls.filter((sql) => sql === repair.sql).length <= 1);
    }
  }
  const f = fixture();
  const original = f.queryable.query.bind(f.queryable);
  f.queryable.query = async (sql, values) => {
    if (sql.includes("pg_advisory_unlock")) return { rows: [{ released: false }] as never[], rowCount: 1 };
    return original(sql, values);
  };
  await assert.rejects(runTenantManagementAuthorization(f.queryable, "apply", f.dependencies), /cleanup_failed/u);
  assert.equal(f.calls.filter((sql) => sql === "COMMIT").length, 1);
});

test("session cleanup attempts release and pool end and never returns successful evidence on failure", async () => {
  for (const failure of ["connect", "release", "end", "both", "none"] as const) {
    const f = fixture();
    const cleanup: string[] = [];
    const database = { pool: {
      connect: async () => {
        if (failure === "connect") throw new Error("fixture-secret");
        return { ...f.queryable, release: (discard?: boolean) => {
          assert.equal(discard, true);
          cleanup.push("release");
          if (["release", "both"].includes(failure)) throw new Error("fixture-secret");
        } };
      },
      end: async () => {
        cleanup.push("end");
        if (["end", "both"].includes(failure)) throw new Error("fixture-secret");
      },
    } };
    if (failure === "none") assert.equal((await runTenantManagementAuthorizationSession(database, "diagnose", f.dependencies)).result, "diagnosed");
    else await assert.rejects(runTenantManagementAuthorizationSession(database, "diagnose", f.dependencies),
      failure === "connect" ? /operation_failed/u : /cleanup_failed/u);
    assert.deepEqual(cleanup, failure === "connect" ? ["end"] : ["release", "end"]);
  }
  const uncertain = fixture({ failSql: "COMMIT" });
  const database = { pool: {
    connect: async () => ({ ...uncertain.queryable, release: () => { throw new Error("fixture-secret"); } }),
    end: async () => { throw new Error("fixture-secret"); },
  } };
  await assert.rejects(runTenantManagementAuthorizationSession(database, "apply", uncertain.dependencies), /commit_uncertain/u);
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

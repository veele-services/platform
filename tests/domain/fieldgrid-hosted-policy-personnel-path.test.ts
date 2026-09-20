import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOSTED_POLICY_PERSONNEL_PATH_SQL,
  loadHostedPolicyCompatibilitySource,
  readHostedPolicyPersonnelPath,
  runHostedPolicyCompatibility,
  type HostedPolicyPersonnelPath,
} from "../../scripts/fieldgrid-hosted-policy-compatibility.mts";
import { loadPlatformPrivilegeMigrationFrontier } from "../../scripts/fieldgrid-staging-field-demo-owner-binding-repair.mts";
import type { AuthorizationQueryable } from "../../scripts/fieldgrid-staging-tenant-management-authorization.mts";

const closedPath: HostedPolicyPersonnelPath = {
  legacyPolicyExists: true,
  anonTableUpdate: false,
  anonColumnUpdate: false,
  authenticatedTableUpdate: false,
  authenticatedColumnUpdate: false,
  runtimeSelect: true,
  runtimeUpdate: true,
  runtimeRoleRestricted: true,
};
const source = loadHostedPolicyCompatibilitySource();
const historyPromise = loadPlatformPrivilegeMigrationFrontier().then((frontier) => {
  const pendingIndex = frontier.committed.findIndex((migration) =>
    migration.name === "20260914125400_reconcile_legacy_global_rbac_policies.sql");
  assert.ok(pendingIndex > 0);
  return frontier.committed.slice(0, pendingIndex).map((migration, index) => ({
    name: migration.name, hash: migration.hash, baselined: false,
    appliedAt: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
  }));
});

async function fixture(personnelPath: HostedPolicyPersonnelPath) {
  const history = await historyPromise;
  const statements: string[] = [];
  const queryable = { async query(sql: string) {
    statements.push(sql);
    if (sql.startsWith("SELECT pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
    if (sql.startsWith("SELECT pg_advisory_unlock")) return { rows: [{ released: true }] };
    if (sql.startsWith("SELECT name, hash, baselined")) return { rows: history };
    if (sql === source.readinessSql) return { rows: [{ legacyDefinitionMatches: true,
      cleanDefinitionMatches: false, targetDefinitionMatches: false, dependenciesValid: true }] };
    if (sql === HOSTED_POLICY_PERSONNEL_PATH_SQL) return { rows: [personnelPath] };
    if (/^(BEGIN|SET LOCAL|LOCK TABLE drizzle\.veele_sql_migrations|ROLLBACK)/u.test(sql)) return { rows: [] };
    throw new Error("Unexpected statement: the blocked runner must not reach DDL or journal writes");
  } } as unknown as AuthorizationQueryable;
  return { queryable, statements };
}

test("personnel diagnosis reports every closure prerequisite in the read-only transaction", async () => {
  const { queryable, statements } = await fixture(closedPath);
  const result = await runHostedPolicyCompatibility(queryable, "diagnose");
  assert.equal(result.ready, true);
  assert.deepEqual(result.personnelPath, { ...closedPath, closed: true });
  assert.ok(statements.includes("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"));
  assert.ok(statements.includes("ROLLBACK"));
});

for (const key of Object.keys(closedPath).filter((key) => key !== "legacyPolicyExists") as
  Exclude<keyof HostedPolicyPersonnelPath, "legacyPolicyExists">[]) {
  test(`personnel ${key} failure blocks diagnose and apply before migration mutation`, async () => {
    const blocked = { ...closedPath, [key]: !closedPath[key] };
    for (const operation of ["diagnose", "apply"] as const) {
      const { queryable, statements } = await fixture(blocked);
      const result = await runHostedPolicyCompatibility(queryable, operation);
      assert.equal(result.ready, false);
      assert.equal(result.changed, false);
      assert.equal(result.replacementRecorded, false);
      assert.equal(result.pendingCount, 3);
      assert.deepEqual(result.personnelPath, { ...blocked, closed: false });
      assert.ok(statements.includes("ROLLBACK"));
      assert.ok(statements.every((sql) => !/^(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|COMMIT)\b/u.test(sql)));
    }
  });
}

test("an absent historical personnel policy does not add new migration prerequisites", async () => {
  const absent = { ...closedPath, legacyPolicyExists: false, anonTableUpdate: true,
    authenticatedColumnUpdate: true, runtimeSelect: false, runtimeRoleRestricted: false };
  const result = await runHostedPolicyCompatibility((await fixture(absent)).queryable, "diagnose");
  assert.equal(result.ready, true);
  assert.equal(result.personnelPath.closed, true);
});

test("personnel evidence rejects incomplete, nonboolean and additional payload fields", async () => {
  for (const row of [null, {}, { ...closedPath, runtimeSelect: null },
    { ...closedPath, personnelPayload: "must never be emitted" }]) {
    const queryable = { async query() { return { rows: [row] }; } } as unknown as AuthorizationQueryable;
    await assert.rejects(readHostedPolicyPersonnelPath(queryable), /hosted_policy_personnel_diagnostic_invalid/u);
  }
});

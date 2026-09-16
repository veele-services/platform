import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatSafeTenantManagementPolicyIdentityDiagnosticError,
  parseTenantManagementPolicyIdentityDiagnosticArgs,
  runTenantManagementPolicyIdentityDiagnostic,
  sanitizeUnknownPolicyConsumerIdentities,
  tenantManagementPolicyIdentityDiagnosticSql,
} from "../../scripts/fieldgrid-staging-tenant-management-policy-identity-diagnostic.mts";

const sha = "a".repeat(40);
const identities = [
  { schema: "public", table: "customers", policy: "customers_management_read" },
  { schema: "public", table: "objects", policy: "objects_management_update" },
  { schema: "public", table: "personnel", policy: "personnel_management_read" },
];

test("policy identity diagnostic CLI is diagnose-only with an exact SHA", () => {
  assert.deepEqual(parseTenantManagementPolicyIdentityDiagnosticArgs(["--check"]), {
    mode: "check",
    expectedSha: "",
  });
  assert.deepEqual(
    parseTenantManagementPolicyIdentityDiagnosticArgs([
      "--diagnose",
      "--expected-sha",
      sha,
    ]),
    { mode: "diagnose", expectedSha: sha },
  );
  for (const argv of [
    [],
    ["--diagnose"],
    ["--apply", "--expected-sha", sha],
    ["--diagnose", "--expected-sha", "bad"],
    ["--check", "--expected-sha", sha],
  ]) {
    assert.throws(
      () => parseTenantManagementPolicyIdentityDiagnosticArgs(argv),
      /configuration_invalid/u,
    );
  }
});

test("sanitizer exports only bounded policy identities", () => {
  assert.deepEqual(
    sanitizeUnknownPolicyConsumerIdentities(
      identities.map((identity) => ({ ...identity, qual: "must-not-leak", email: "must-not-leak" })),
    ),
    { unknownConsumerCount: 3, identities },
  );
  assert.throws(
    () => sanitizeUnknownPolicyConsumerIdentities([
      { schema: "public", table: "bad table", policy: "policy" },
    ]),
    /diagnostic_failed/u,
  );
  assert.throws(
    () => sanitizeUnknownPolicyConsumerIdentities([
      { schema: "public", table: "customers", policy: "bad-policy" },
    ]),
    /diagnostic_failed/u,
  );
  assert.throws(
    () => sanitizeUnknownPolicyConsumerIdentities([
      identities[0],
      identities[0],
    ]),
    /diagnostic_failed/u,
  );
  assert.throws(
    () => sanitizeUnknownPolicyConsumerIdentities(
      Array.from({ length: 11 }, (_, index) => ({
        schema: "public",
        table: `table_${index}`,
        policy: `policy_${index}`,
      })),
    ),
    /too_many_consumers/u,
  );
});

test("SQL returns only identity columns for unknown legacy policy consumers", () => {
  const sql = tenantManagementPolicyIdentityDiagnosticSql();
  assert.match(sql, /schemaname AS schema/u);
  assert.match(sql, /tablename AS table/u);
  assert.match(sql, /policyname AS policy/u);
  assert.match(sql, /FROM pg_policies/u);
  assert.match(sql, /LIMIT 11/u);
  assert.match(sql, /user_roles_select_own/u);
  assert.doesNotMatch(sql, /SELECT[\s\S]*?qual\s+AS/u);
  assert.doesNotMatch(sql, /SELECT[\s\S]*?with_check\s+AS/u);
});

test("live diagnostic is read-only and always rolls back", async () => {
  const calls: string[] = [];
  const queryable = {
    async query(sql: string) {
      calls.push(sql);
      if (sql.includes("FROM pg_policies")) {
        return { rows: identities, rowCount: identities.length };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const result = await runTenantManagementPolicyIdentityDiagnostic(queryable);
  assert.deepEqual(result, { unknownConsumerCount: 3, identities });
  assert.ok(calls.includes("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"));
  assert.ok(calls.includes("SET LOCAL statement_timeout = '30s'"));
  assert.equal(calls.at(-1), "ROLLBACK");
  assert.ok(!calls.some((sql) => /^(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)/iu.test(sql.trim())));
});

test("raw errors are never included in safe output", () => {
  assert.doesNotMatch(
    formatSafeTenantManagementPolicyIdentityDiagnosticError(
      new Error("sensitive database error secret@example.test"),
    ),
    /sensitive|secret@example/u,
  );
});

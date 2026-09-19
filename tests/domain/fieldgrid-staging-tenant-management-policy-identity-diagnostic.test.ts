import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatSafeTenantManagementPolicyIdentityDiagnosticError,
  parseTenantManagementPolicyIdentityDiagnosticArgs,
  runTenantManagementPolicyIdentityDiagnostic,
  runTenantManagementPolicyIdentitySession,
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

test("identity boundaries accept ten and reject malformed or missing fields", () => {
  const ten = Array.from({ length: 10 }, (_, index) => ({
    schema: "public", table: `table_${index}`, policy: "a".repeat(63),
  }));
  assert.equal(sanitizeUnknownPolicyConsumerIdentities(ten).unknownConsumerCount, 10);
  assert.deepEqual(sanitizeUnknownPolicyConsumerIdentities([]), { unknownConsumerCount: 0, identities: [] });
  for (const value of [null, {}, "raw", [null], ["raw"], [[]], [{}],
    [{ schema: "public", table: "table" }],
    [{ schema: 1, table: "table", policy: "policy" }],
    [{ schema: "public", table: "table", policy: "a".repeat(64) }],
    [{ schema: "public", table: "table", policy: "policy\n" }],
    [{ schema: "public", table: "table", policy: "pólícy" }],
  ]) assert.throws(() => sanitizeUnknownPolicyConsumerIdentities(value), /diagnostic_failed/u);
});

test("each diagnostic failure rolls back and exports only a bounded error", async () => {
  for (const phase of ["begin", "timeout", "query", "sanitize", "rollback"]) {
    const calls: string[] = [];
    const queryable = {
      async query(sql: string) {
        calls.push(sql);
        if ((phase === "begin" && sql.startsWith("BEGIN")) ||
            (phase === "timeout" && sql.startsWith("SET LOCAL")) ||
            (phase === "query" && sql.includes("FROM pg_policies")) ||
            (phase === "rollback" && sql === "ROLLBACK")) {
          throw new Error("driver detail SELECT policy_sql secret@example.test");
        }
        return { rows: sql.includes("FROM pg_policies")
          ? (phase === "sanitize" ? [{ schema: "public" }] : identities) : [], rowCount: 0 };
      },
    };
    await assert.rejects(runTenantManagementPolicyIdentityDiagnostic(queryable), (error) => {
      assert.equal(formatSafeTenantManagementPolicyIdentityDiagnosticError(error),
        `fieldgrid-staging-tenant-management-policy-identity-diagnostic-v1: ${phase === "rollback" ? "cleanup_failed" : "diagnostic_failed"}`);
      return true;
    });
    if (phase !== "begin") assert.equal(calls.at(-1), "ROLLBACK");
    assert.ok(!calls.includes("COMMIT"));
  }
});

test("session discards its connection and closes the pool even after cleanup failures", async () => {
  for (const phase of ["none", "connect", "query", "release", "end", "both"]) {
    const calls: string[] = [];
    const database = { pool: {
      async connect() {
        calls.push("connect");
        if (phase === "connect") throw new Error("private connection detail");
        return {
          async query(sql: string) {
            if (phase === "query" && sql.includes("FROM pg_policies")) throw new Error("private SQL detail");
            return { rows: [], rowCount: 0 };
          },
          release(discard?: boolean) {
            assert.equal(discard, true);
            calls.push("release");
            if (phase === "release" || phase === "both") throw new Error("private release detail");
          },
        };
      },
      async end() {
        calls.push("end");
        if (phase === "end" || phase === "both") throw new Error("private pool detail");
      },
    } };
    if (phase === "none") {
      assert.deepEqual(await runTenantManagementPolicyIdentitySession(database), { unknownConsumerCount: 0, identities: [] });
    } else {
      await assert.rejects(runTenantManagementPolicyIdentitySession(database), (error) => {
        const code = phase === "connect" ? "operation_failed" : phase === "query" ? "diagnostic_failed" : "cleanup_failed";
        assert.equal(formatSafeTenantManagementPolicyIdentityDiagnosticError(error),
          `fieldgrid-staging-tenant-management-policy-identity-diagnostic-v1: ${code}`);
        return true;
      });
    }
    assert.deepEqual(calls, phase === "connect" ? ["connect", "end"] : ["connect", "release", "end"]);
  }
});

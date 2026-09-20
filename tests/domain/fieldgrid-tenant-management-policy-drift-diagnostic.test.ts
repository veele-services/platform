import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatSafeTenantManagementPolicyDriftDiagnosticError,
  loadTenantManagementPolicyDriftDiagnosticSource,
  readTenantManagementPolicyDriftDiagnostic,
  sanitizeTenantManagementPolicyDriftDiagnostic,
  type TenantManagementPolicyDriftDiagnostic,
} from "../../scripts/fieldgrid-tenant-management-policy-drift-diagnostic.mts";
import type { PolicyDefinitionQueryable } from "../../scripts/fieldgrid-tenant-management-policy-definition-contract.mts";

const source = loadTenantManagementPolicyDriftDiagnosticSource();
function fixture(): TenantManagementPolicyDriftDiagnostic {
  return {
    transactionReadOnly: true, repeatableRead: true, postgresMajor: 17, postgresMajorMatches: true,
    searchPathMatches: true, exactHistoricalOwnUpdateMatches: false,
    variants: source.variants.map((variant) => ({
      state: variant.state, profile: variant.profile, postgresMajorMatches: true,
      policySetMatches: true, helperContractsMatch: true, relationsMatch: true,
      baselinePlusHistoricalOwnUpdateSetMatches: false,
      policies: variant.manifest.policies.map(({ schema, table, name }) => ({
        schema, table, name, present: true, commandMatches: true, permissiveMatches: true,
        rolesMatch: true, usingMatches: true, checkMatches: true,
      })),
      helpers: variant.manifest.helpers.map((helper) => ({
        schema: helper.schema, name: helper.name, argumentTypes: [...helper.argumentTypes],
        present: true, namePresent: true, signatureMatches: true, bodyMatches: true, languageMatches: true,
        kindMatches: true, securityDefinerMatches: true, volatilityMatches: true, parallelMatches: true,
        strictMatches: true, leakproofMatches: true, scalarMatches: true, argumentModesMatch: true,
        supportMatches: true, defaultsMatch: true, configMatches: true, argumentNamesMatch: true,
        ownerMatches: true, directAclCountMatches: true, directAclMatches: true, effectiveExecuteMatches: true,
        directAclEntries: helper.directAcl.map(({ grantee, grantor }) => ({ grantee, grantor, matches: true })),
        effectiveExecute: helper.effectiveExecute.map(({ role }) => ({ role, roleExists: true, matches: true })),
      })),
      relations: variant.manifest.relations.map(({ schema, table, columns }) => ({
        schema, table, present: true, kindMatches: true, rowSecurityMatches: true, forceRowSecurityMatches: true,
        columns: columns.map(({ name }) => ({
          name, present: true, typeMatches: true, typeModifierMatches: true, notNullMatches: true,
        })),
      })),
      unexpectedPolicies: [],
    })),
  };
}
function reader(row: unknown = fixture(), context: unknown = { transactionReadOnly: true, repeatableRead: true }) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const queryable = { async query(sql: string, values?: unknown[]) {
    calls.push({ sql, values });
    return { rows: [calls.length === 1 ? context : calls.length === 2 ? { searchPathMatches: true } : row], rowCount: 1 };
  } } as PolicyDefinitionQueryable;
  return { queryable, calls };
}

test("diagnostic pins immutable source variants and historical015 only as parameter data", () => {
  assert.equal(source.variants.length, 8);
  assert.deepEqual(JSON.parse(source.values[0]), source.variants);
  assert.deepEqual(JSON.parse(source.values[1]), {
    schema: "public", table: "personnel", name: "personnel_update_own_phone",
    command: "w", permissive: true, roles: ["authenticated"],
    usingExpression: "(user_id = auth.uid())", checkExpression: "(user_id = auth.uid())",
  });
  assert.equal(loadTenantManagementPolicyDriftDiagnosticSource(), source);
  assert.ok(Object.isFrozen(source) && Object.isFrozen(source.values));
  assert.ok(Object.isFrozen(source.variants[0]!.manifest.policies[0]));
  assert.equal(Reflect.set(source.variants[0]!.manifest.policies[0]!, "usingExpression", "untrusted"), false);
  assert.doesNotMatch(source.sql, /personnel_update_own_phone/u);
  assert.doesNotMatch(source.sql, /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/u);
  assert.match(source.sql, /LIMIT 11/u);
});

test("every deparser has an argument-dependent pg_catalog pin", () => {
  const deparsers = source.sql.match(/pg_catalog\.pg_get_expr\(/gu) ?? [];
  const pins = source.sql.match(/pg_catalog\.pg_get_expr\(policy\.(?:polqual|polwithcheck), \(CASE WHEN pg_catalog\.set_config\('search_path', 'pg_catalog', true\) OPERATOR\(pg_catalog\.=\) 'pg_catalog' THEN policy\.polrelid END\), false\)/gu) ?? [];
  assert.equal(deparsers.length, 4);
  assert.equal(pins.length, deparsers.length);
});

test("valid bounded results are copied without expression, helper body or readiness fields", () => {
  const input = fixture();
  const result = sanitizeTenantManagementPolicyDriftDiagnostic(input);
  assert.deepEqual(result, input);
  input.variants[0]!.policies[0]!.present = false;
  assert.equal(result.variants[0]!.policies[0]!.present, true);
  assert.doesNotMatch(JSON.stringify(result), /usingExpression|checkExpression|"body":|readyForApply|readyForPrerequisiteRepair/u);
});

test("each nested boundary rejects unknown fields, omitted fields and non-boolean flags", () => {
  const paths = [
    (r: any) => r,
    (r: any) => r.variants[0],
    (r: any) => r.variants[0].policies[0],
    (r: any) => r.variants[0].helpers[0],
    (r: any) => r.variants[0].helpers[0].directAclEntries[0],
    (r: any) => r.variants[0].helpers[0].effectiveExecute[0],
    (r: any) => r.variants[0].relations[0],
    (r: any) => r.variants[0].relations[0].columns[0],
  ];
  for (const target of paths) {
    for (const mutation of [
      (row: any) => { row.rawSql = "sensitive driver detail"; },
      (row: any) => { delete row[Object.keys(row).find((key) => typeof row[key] === "boolean")!]; },
      (row: any) => { row[Object.keys(row).find((key) => typeof row[key] === "boolean")!] = "false"; },
      (row: any) => { row[Object.keys(row).find((key) => typeof row[key] === "boolean")!] = null; },
      (row: any) => { row[Symbol("hidden")] = "not permitted"; },
    ]) {
      const input = fixture(); mutation(target(input));
      assert.throws(() => sanitizeTenantManagementPolicyDriftDiagnostic(input), /catalog_invalid/u);
    }
  }
});

test("catalog rows cannot relabel source profiles, policy/helper/role/column identities or array positions", () => {
  const mutations: Array<(r: any) => void> = [
    (r) => { r.variants[0].state = "untrusted"; },
    (r) => { r.variants[0].profile = "untrusted"; },
    (r) => { r.variants[0].policies[0].name = "other"; },
    (r) => { r.variants[0].helpers[0].argumentTypes[0] = "text"; },
    (r) => { r.variants[0].helpers[0].directAclEntries[0].grantor = "untrusted"; },
    (r) => { r.variants[0].helpers[0].effectiveExecute[0].role = "untrusted"; },
    (r) => { r.variants[0].relations[0].columns[0].name = "other"; },
    (r) => { r.variants.reverse(); },
    (r) => { r.variants[0].policies.pop(); },
    (r) => { delete r.variants[0].policies[0]; },
    (r) => { r.variants[0].helpers[0].argumentTypes.extra = "extra"; },
  ];
  for (const mutate of mutations) {
    const input = fixture(); mutate(input);
    assert.throws(() => sanitizeTenantManagementPolicyDriftDiagnostic(input), /catalog_invalid/u);
  }
});

test("unexpected policy identities are limited to ten validated identities on source relations", () => {
  const input = fixture();
  input.variants[0]!.unexpectedPolicies = Array.from({ length: 10 }, (_, index) => ({
    schema: "public", table: "personnel", name: `synthetic_extra_${index}`,
  }));
  assert.equal(sanitizeTenantManagementPolicyDriftDiagnostic(input).variants[0]!.unexpectedPolicies.length, 10);
  input.variants[0]!.unexpectedPolicies.push({ schema: "public", table: "personnel", name: "synthetic_extra_10" });
  assert.throws(() => sanitizeTenantManagementPolicyDriftDiagnostic(input), /policy_limit_exceeded/u);
  for (const extra of [
    { schema: "public", table: "personnel", name: "x;select secret" },
    { schema: "auth", table: "users", name: "unlisted" },
    { schema: "public", table: "personnel", name: "x".repeat(64) },
    { schema: "public", table: "personnel", name: "quoted space" },
    { schema: "public", table: "personnel", name: "é" },
    { ...input.variants[0]!.policies[0] },
  ]) {
    const changed = fixture();
    changed.variants[0]!.unexpectedPolicies = [extra];
    assert.throws(() => sanitizeTenantManagementPolicyDriftDiagnostic(changed), /catalog_invalid/u);
  }
  const duplicate = fixture();
  duplicate.variants[0]!.unexpectedPolicies = Array(2).fill({ schema: "public", table: "personnel", name: "duplicate" });
  assert.throws(() => sanitizeTenantManagementPolicyDriftDiagnostic(duplicate), /catalog_invalid/u);
});

test("safe major metadata remains useful when the pinned PostgreSQL major differs", () => {
  const input = fixture();
  input.postgresMajor = 15; input.postgresMajorMatches = false;
  for (const variant of input.variants) variant.postgresMajorMatches = false;
  assert.equal(sanitizeTenantManagementPolicyDriftDiagnostic(input).postgresMajor, 15);
  for (const major of [null, "17", 9, 100, 17.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const changed: any = fixture(); changed.postgresMajor = major;
    assert.throws(() => sanitizeTenantManagementPolicyDriftDiagnostic(changed), /catalog_invalid/u);
  }
  input.postgresMajorMatches = true;
  assert.throws(() => sanitizeTenantManagementPolicyDriftDiagnostic(input), /catalog_invalid/u);
});

test("exact historical match is diagnostic evidence without changing policy-set readiness", () => {
  const input = fixture();
  input.exactHistoricalOwnUpdateMatches = true;
  for (const variant of input.variants) {
    variant.policySetMatches = false;
    variant.baselinePlusHistoricalOwnUpdateSetMatches = true;
    variant.unexpectedPolicies = [{ schema: "public", table: "personnel", name: "personnel_update_own_phone" }];
  }
  const output = sanitizeTenantManagementPolicyDriftDiagnostic(input);
  assert.equal(output.exactHistoricalOwnUpdateMatches, true);
  assert.ok(output.variants.every((variant) => !variant.policySetMatches && variant.baselinePlusHistoricalOwnUpdateSetMatches));
});

test("reader requires repeatable-read read-only before any catalog comparison", async () => {
  for (const context of [
    { transactionReadOnly: false, repeatableRead: true },
    { transactionReadOnly: true, repeatableRead: false },
    { transactionReadOnly: "true", repeatableRead: true },
    { transactionReadOnly: true, repeatableRead: null },
  ]) {
    const mock = reader(fixture(), context);
    await assert.rejects(readTenantManagementPolicyDriftDiagnostic(mock.queryable), /transaction_invalid/u);
    assert.equal(mock.calls.length, 1);
  }
  const mock = reader();
  assert.deepEqual(await readTenantManagementPolicyDriftDiagnostic(mock.queryable), fixture());
  assert.equal(mock.calls.length, 3);
  assert.ok(mock.calls[0]!.sql.startsWith("SELECT "));
  assert.match(mock.calls[0]!.sql, /OPERATOR\(pg_catalog\.=\)/u);
  assert.match(mock.calls[1]!.sql, /pg_catalog\.set_config\('search_path', 'pg_catalog', true\) OPERATOR\(pg_catalog\.=\)/u);
  assert.ok(mock.calls[2]!.sql.startsWith("WITH "));
  assert.deepEqual(mock.calls[2]!.values, [...source.values]);
});

test("reader and sanitizer refuse reconstructed sources before executing substituted SQL", async () => {
  const forged = { ...source, sql: "SELECT secret FROM private.data" };
  const mock = reader();
  await assert.rejects(readTenantManagementPolicyDriftDiagnostic(mock.queryable, forged), /source_invalid/u);
  assert.throws(() => sanitizeTenantManagementPolicyDriftDiagnostic(fixture(), forged), /source_invalid/u);
  assert.equal(mock.calls.length, 0);
});

test("catalog failures never expose driver messages, SQL or credentials", async () => {
  const marker = "postgres://sensitive-password policy-body private-user";
  const queryable = { async query() { throw new Error(marker); } } as PolicyDefinitionQueryable;
  await assert.rejects(readTenantManagementPolicyDriftDiagnostic(queryable), (error: unknown) => {
    assert.equal(formatSafeTenantManagementPolicyDriftDiagnosticError(error), "tenant_management_policy_drift_catalog_read_failed");
    assert.doesNotMatch(String(error), /sensitive|policy-body|private-user/u);
    return true;
  });
  assert.equal(formatSafeTenantManagementPolicyDriftDiagnosticError(new Error(marker)), "tenant_management_policy_drift_operation_failed");
});

test("missing, duplicated or invalid catalog result rows are rejected", async () => {
  for (const rows of [[], [fixture(), fixture()], ["false"], [null]]) {
    let call = 0;
    const q = { async query() {
      call++;
      return call === 1 ? { rows: [{ transactionReadOnly: true, repeatableRead: true }], rowCount: 1 }
        : call === 2 ? { rows: [{ searchPathMatches: true }], rowCount: 1 }
        : { rows, rowCount: rows.length };
    } } as PolicyDefinitionQueryable;
    await assert.rejects(readTenantManagementPolicyDriftDiagnostic(q), /catalog_invalid/u);
  }
  const row = fixture();
  Object.defineProperty(row.variants[0]!, "profile", { enumerable: true, get() { throw new Error("unsafe getter"); } });
  assert.throws(() => sanitizeTenantManagementPolicyDriftDiagnostic(row), /catalog_invalid/u);
});

test("parse-time namespace pin is strictly verified before compiling the catalog statement", async () => {
  for (const response of [
    { rows: [], rowCount: 0 },
    { rows: [{ searchPathMatches: false }], rowCount: 1 },
    { rows: [{ searchPathMatches: "true" }], rowCount: 1 },
    { rows: [{ searchPathMatches: true }, { searchPathMatches: true }], rowCount: 2 },
  ]) {
    let calls = 0;
    const queryable = { async query() {
      calls++;
      return calls === 1 ? { rows: [{ transactionReadOnly: true, repeatableRead: true }], rowCount: 1 } : response;
    } } as PolicyDefinitionQueryable;
    await assert.rejects(readTenantManagementPolicyDriftDiagnostic(queryable), /transaction_invalid/u);
    assert.equal(calls, 2);
  }
});

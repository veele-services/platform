import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("drift diagnosis leaves every committed authorization migration immutable", () => {
  for (const [name, expected] of [
    ["20260914125400_reconcile_legacy_global_rbac_policies.sql", "421fde7810185af215b46b733bcf09878c78812a6a151850bb52536ddcc7ba5c"],
    ["20260914125503_scope_tenant_management_authorization.sql", "23b1aa33b626a114694a748e3e2d391ea02460071c865d2b20df2ec582df9902"],
    ["20260919220633_repair_tenant_management_policy_consumers.sql", "89bb90be5003c58085edb2688cfc8c9793e682e159edc0f3a656703bd86c3929"],
  ]) {
    assert.equal(createHash("sha256").update(read(`lib/db/migrations/${name}`)).digest("hex"), expected);
  }
});

test("only blocked diagnosis reads drift and its observations cannot authorize apply", () => {
  const runner = read("scripts/fieldgrid-staging-tenant-management-authorization.mts");
  assert.match(runner, /readDriftDiagnostic: readTenantManagementPolicyDriftDiagnostic/u);
  const start = runner.indexOf('if (operation === "diagnose" && state === "unknown-state"');
  const end = runner.indexOf('await queryable.query("ROLLBACK")', start);
  assert.ok(start > 0 && end > start);
  const diagnostic = runner.slice(start, end);
  assert.match(diagnostic, /sanitizeTenantManagementPolicyDriftDiagnostic/u);
  assert.doesNotMatch(diagnostic, /readyForApply|readyForPrerequisiteRepair|queryable\.query|COMMIT/u);
  assert.ok(end < runner.indexOf('if (!readyForPrerequisiteRepair) throw'));
});

test("protected workflow retains exact main, TLS, purpose and bounded credentials", () => {
  const workflow = read(".github/workflows/fieldgrid-staging-tenant-management-authorization.yml");
  for (const required of [
    "environment: staging", "group: veele-staging", 'PGSSLMODE: verify-full',
    'test "$GITHUB_REF" = "refs/heads/main"', 'test "$GITHUB_SHA" = "$EXPECTED_MAIN_SHA"',
    "FIELDGRID_DATABASE_CONNECTION_PURPOSE: migration",
    "tests/security/fieldgrid-tenant-management-policy-drift-source.test.mjs",
    "tests/domain/fieldgrid-tenant-management-policy-drift-diagnostic.test.ts",
  ]) assert.ok(workflow.includes(required), required);
  assert.doesNotMatch(workflow, /ignore[-_]drift|skip[-_]validation|force[-_]apply/u);
});

test("real catalog drift tests are registered under the existing PostgreSQL gate", () => {
  const suite = read("tests/fieldgrid-realtime-projection-migration.test.mjs");
  const registration = suite.indexOf("verifyTenantManagementPolicyDrift);");
  assert.ok(registration > suite.indexOf("skip: !process.env.DATABASE_URL"));
  assert.ok(registration < suite.indexOf("await client.connect()"));
});

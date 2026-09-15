import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyTenantManagementSqlDiagnostic,
  parseTenantManagementSqlDiagnosticArgs,
  sanitizeTenantManagementSqlDiagnostic,
  tenantManagementSqlDiagnosticBlockers,
  type TenantManagementSqlDiagnostic,
} from "../../scripts/fieldgrid-staging-tenant-management-sql-diagnostic.mts";

const sha = "a".repeat(40);
const ready: TenantManagementSqlDiagnostic = {
  user_roles_table_present: true,
  policy_consumer_count: 3,
  recognized_policy_consumer_count: 3,
  user_roles_policy_count: 3,
  unknown_policy_consumer_count: 0,
  platform_permission_helper_exact: true,
  can_manage_user_roles_policies: true,
  private_canonical_helper_present: false,
  legacy_tenant_helper_exact: true,
  assignment_material_usage_policy_present: false,
  legacy_function_consumer_count: 0,
  legacy_rule_consumer_count: 0,
  can_create_private_helper: true,
};

test("diagnostic CLI accepts only check or exact-main diagnose", () => {
  assert.deepEqual(parseTenantManagementSqlDiagnosticArgs(["--check"]), {
    mode: "check",
    expectedSha: "",
  });
  assert.deepEqual(
    parseTenantManagementSqlDiagnosticArgs(["--diagnose", "--expected-sha", sha]),
    { mode: "diagnose", expectedSha: sha },
  );
  for (const argv of [
    [],
    ["--diagnose"],
    ["--apply", "--expected-sha", sha],
    ["--check", "--expected-sha", sha],
    ["--diagnose", "--expected-sha", "bad"],
    ["--diagnose", "--diagnose", "--expected-sha", sha],
  ]) {
    assert.throws(() => parseTenantManagementSqlDiagnosticArgs(argv), /configuration_invalid/u);
  }
});

test("diagnostic sanitizer exports only bounded booleans and nonnegative counts", () => {
  assert.deepEqual(
    sanitizeTenantManagementSqlDiagnostic({ ...ready, email: "must-not-leak" }),
    ready,
  );
  for (const value of [
    null,
    {},
    { ...ready, policy_consumer_count: "3" },
    { ...ready, unknown_policy_consumer_count: -1 },
    { ...ready, legacy_tenant_helper_exact: "yes" },
    { ...ready, recognized_policy_consumer_count: 4 },
    { ...ready, unknown_policy_consumer_count: 1 },
  ]) {
    assert.throws(
      () => sanitizeTenantManagementSqlDiagnostic(value),
      /diagnostic_failed/u,
    );
  }
});

test("ready catalog state has no blocker and selects no failure phase", () => {
  assert.deepEqual(tenantManagementSqlDiagnosticBlockers(ready), []);
  assert.deepEqual(classifyTenantManagementSqlDiagnostic(ready), {
    diagnostics: ready,
    blockers: [],
    likelyFailurePhase: "none",
    readyForApply: true,
  });
});

test("policy reconciliation blockers are categorized without identifiers", () => {
  const diagnostic = {
    ...ready,
    policy_consumer_count: 4,
    recognized_policy_consumer_count: 3,
    unknown_policy_consumer_count: 1,
    user_roles_policy_count: 2,
    platform_permission_helper_exact: false,
    can_manage_user_roles_policies: false,
  };
  const result = classifyTenantManagementSqlDiagnostic(diagnostic);
  assert.equal(result.readyForApply, false);
  assert.equal(result.likelyFailurePhase, "policy-reconciliation");
  assert.deepEqual(result.blockers, [
    "unknown_policy_consumer",
    "legacy_user_roles_policy_drift",
    "platform_permission_helper_drift",
    "user_roles_policy_ownership_invalid",
  ]);
});

test("tenant scope blockers are categorized after policy prerequisites pass", () => {
  const diagnostic = {
    ...ready,
    private_canonical_helper_present: true,
    legacy_tenant_helper_exact: false,
    assignment_material_usage_policy_present: true,
    legacy_function_consumer_count: 2,
    legacy_rule_consumer_count: 1,
    can_create_private_helper: false,
  };
  const result = classifyTenantManagementSqlDiagnostic(diagnostic);
  assert.equal(result.readyForApply, false);
  assert.equal(result.likelyFailurePhase, "tenant-scope");
  assert.deepEqual(result.blockers, [
    "private_helper_already_present",
    "legacy_tenant_helper_drift",
    "assignment_material_usage_policy_present",
    "legacy_function_consumer_present",
    "legacy_rule_consumer_present",
    "app_private_create_unavailable",
  ]);
});

test("already reconciled policies do not require the legacy platform helper", () => {
  const diagnostic = {
    ...ready,
    policy_consumer_count: 0,
    recognized_policy_consumer_count: 0,
    unknown_policy_consumer_count: 0,
    platform_permission_helper_exact: false,
    can_manage_user_roles_policies: false,
  };
  assert.deepEqual(tenantManagementSqlDiagnosticBlockers(diagnostic), []);
});

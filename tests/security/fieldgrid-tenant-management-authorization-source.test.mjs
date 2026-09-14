import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  loadTenantManagementAuthorizationSource,
  tenantManagementAuthorizationContractSql,
} from "../../scripts/fieldgrid-tenant-management-authorization-contract.mts";

const source = await loadTenantManagementAuthorizationSource();
const legacyPolicyReconciliation = readFileSync(
  "lib/db/migrations/20260914125400_reconcile_legacy_global_rbac_policies.sql",
  "utf8",
);
const predicate = source.sql.split("$canonical_tenant_management$")[1];
const wrapper = source.sql.split("$tenant_management_v2$")[1];

test("tenant management comes exclusively from canonical same-tenant grants", () => {
  assert.match(predicate, /scoped_role\.tenant_id = grant_link\.tenant_id/u);
  assert.match(predicate, /grant_link\.tenant_id = membership\.tenant_id/u);
  assert.match(predicate, /grant_link\.user_id = membership\.user_id/u);
  assert.match(predicate, /membership\.user_id = p_user_id AND membership\.tenant_id = p_tenant_id/u);
  assert.match(predicate, /scoped_role\.is_custom IS FALSE/u);
  assert.match(predicate, /template\.is_system IS TRUE/u);
  assert.match(predicate, /FROM public\.platform_users/u);
  assert.match(predicate, /FROM public\.role_permissions expected/u);
  assert.match(predicate, /FROM public\.tenant_role_permissions actual/u);
  assert.doesNotMatch(predicate, /public\.user_roles|raw_user_meta_data|auth\.jwt/u);
  assert.equal(wrapper.trim(), "SELECT app_private.fieldgrid_has_canonical_tenant_management(auth.uid(), p_tenant_id);");
});

test("forward migration preserves access under write barriers without account repair", () => {
  assert.match(source.name, /^20260914\d{6}_scope_tenant_management_authorization\.sql$/u);
  assert.match(source.sql, /LOCK TABLE[\s\S]+public\.user_roles IN SHARE MODE/u);
  assert.match(source.sql, /SET LOCAL lock_timeout = '5s'/u);
  assert.match(source.sql, /current_setting\('transaction_isolation'\) <> 'read committed'/u);
  assert.ok(source.sql.indexOf("tenant_management_requires_read_committed") < source.sql.indexOf("LOCK TABLE"));
  assert.match(source.sql, /IF missing_pairs <> 0 THEN/u);
  assert.match(source.sql, /tenant_management_scope_preservation_failed/u);
  assert.ok(source.sql.indexOf("IF missing_pairs <> 0") < source.sql.indexOf("CREATE OR REPLACE FUNCTION public.is_management_for_tenant"));
  assert.doesNotMatch(source.sql, /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+(?:public\.|auth\.)/iu);
  assert.doesNotMatch(source.sql, /GRANT\s+.*\s+ON\s+(?:TABLE|SCHEMA)/iu);
  assert.match(source.sql, /tenant_management_legacy_contract_drift/u);
  assert.match(source.sql, /tenant_management_unexpected_legacy_consumer/u);
});

test("legacy policy reconciliation is an allowlisted metadata-only repair", () => {
  assert.match(
    legacyPolicyReconciliation,
    /LOCK TABLE public\.platform_users, public\.role_permissions, public\.roles,[\s\S]+public\.user_roles IN SHARE MODE/u,
  );
  assert.match(legacyPolicyReconciliation, /SET LOCAL search_path = pg_catalog, public, auth, pg_temp/u);
  assert.match(legacyPolicyReconciliation, /tenant_management_legacy_policy_consumer_drift/u);
  assert.match(legacyPolicyReconciliation, /tenant_management_legacy_user_roles_policy_drift/u);
  assert.match(legacyPolicyReconciliation, /tenant_management_platform_permission_helper_drift/u);
  assert.match(legacyPolicyReconciliation, /tenant_management_legacy_policy_reconciliation_incomplete/u);
  for (const policy of [
    "user_roles_select_own",
    "user_roles_insert_management",
    "user_roles_delete_management",
  ]) {
    assert.match(legacyPolicyReconciliation, new RegExp(`DROP POLICY ${policy}`, "u"));
    assert.match(legacyPolicyReconciliation, new RegExp(`CREATE POLICY ${policy}`, "u"));
  }
  assert.match(
    legacyPolicyReconciliation,
    /public\.fieldgrid_has_platform_permission\('global\.rbac\.manage'\)/u,
  );
  assert.doesNotMatch(
    legacyPolicyReconciliation,
    /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+(?:public\.|auth\.)/iu,
  );
  assert.doesNotMatch(legacyPolicyReconciliation, /ALTER TABLE|CREATE TABLE|DROP TABLE/iu);
});

test("private predicate is invoker-only and wrapper retains constrained definer ACL", () => {
  assert.match(source.sql, /LANGUAGE sql STABLE SECURITY INVOKER/u);
  assert.match(source.sql, /LANGUAGE sql STABLE SECURITY DEFINER/u);
  assert.equal(source.sql.match(/SET search_path = pg_catalog, public, pg_temp/gu).length, 2);
  assert.match(source.sql, /REVOKE ALL ON FUNCTION app_private\.fieldgrid_has_canonical_tenant_management\(uuid,uuid\)\s+FROM PUBLIC, anon, authenticated, service_role/u);
  assert.match(source.sql, /GRANT EXECUTE ON FUNCTION public\.is_management_for_tenant\(uuid\) TO authenticated/u);
});

test("owner acceptance proves installed code and catalog rather than a marker", () => {
  const contract = tenantManagementAuthorizationContractSql();
  for (const text of ["wrapper.prosrc =", "predicate.prosrc =", "wrapper.proconfig =",
    "predicate.proconfig =", "wrapper.proowner = membership_table.relowner",
    "predicate.proowner = wrapper.proowner", source.hash,
    "baselined = false", "pg_policies", "pg_get_ruledef", "aclexplode"]) {
    assert.ok(contract.includes(text), text);
  }
  assert.doesNotMatch(contract, /\b(?:INSERT|UPDATE|DELETE|ALTER|GRANT|DROP|TRUNCATE)\b/iu);
  const gate = readFileSync("scripts/fieldgrid-staging-existing-owner.mts", "utf8");
  assert.match(gate, /legacy_role\.name = 'Management'\s+AND NOT \$\{tenantManagementAuthorizationContractSql\(\)\}/u);
});

test("historical RLS migration replay cannot replace the current authorization contract", () => {
  const harness = readFileSync("scripts/fieldgrid-runtime-safety-rls-harness.mjs", "utf8");
  assert.match(harness, /client\.query\(sqlForManagedMigrationTransaction\(migration\)\)/u);
  const historicalTest = harness.slice(
    harness.indexOf("async function historicalBroadAclDriftIsCleanedByPhaseBMigrations"),
    harness.indexOf("async function assignmentPersonnelTableAclIsLeastPrivilege"),
  );
  assert.match(historicalTest, /await client\.query\("BEGIN"\)/u);
  assert.match(historicalTest, /finally \{\s+await client\.query\("ROLLBACK"\)/u);
  assert.equal(historicalTest.match(/verifyTenantManagementAuthorizationContract\(client\)/gu).length, 2);
});

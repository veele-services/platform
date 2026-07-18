import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();
const phaseAMigrationPath = "lib/db/migrations/20260712130000_assignment_personnel_tenant_guard.sql";
const phaseAAclMigrationPath = "lib/db/migrations/20260713120000_assignment_personnel_phase_a_acl_hardening.sql";
const phaseBMigrationPath = "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql";
const phaseAMigrationCanonicalSha256 = "0933b6ca61e19b7db04d6a53c0aa03642803f2d07035f1e8c4d5a6aabd7c4a65";
const phaseAAclMigrationCanonicalSha256 = "a14b31c26fcd000eb4a0f67fbc3b3b94854a2f61716a92f66df6f25131220c09";

const removedAssignmentPersonnelPolicies = [
  "assignment_personnel_management_all",
  "assignment_personnel_tenant_management_all",
  "assignment_personnel_own_select",
  "personnel_read_own_assignment_personnel",
];

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function normalizeSql(sql) {
  return sql.replace(/\s+/gu, " ").trim();
}

function canonicalizeLineEndings(value) {
  return value.replace(/\r\n/g, "\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sqlStatements(sql) {
  return sql
    .split(";")
    .map((statement) => normalizeSql(statement))
    .filter(Boolean)
    .map((statement) => `${statement};`);
}

test("assignment_personnel Phase-A migration remains unchanged", () => {
  assert.equal(sha256(canonicalizeLineEndings(read(phaseAMigrationPath))), phaseAMigrationCanonicalSha256);
});

test("assignment_personnel Phase-A.1 migration remains unchanged", () => {
  assert.equal(sha256(canonicalizeLineEndings(read(phaseAAclMigrationPath))), phaseAAclMigrationCanonicalSha256);
});

test("assignment_personnel Phase-B migration is forward-only and closes direct table ACL", () => {
  const migration = read(phaseBMigrationPath);
  const normalized = normalizeSql(migration);

  assert.match(migration, /Assignment personnel Phase B direct access closure/u);
  assert.match(
    normalized,
    /REVOKE ALL ON TABLE public\.assignment_personnel FROM PUBLIC, anon, authenticated, service_role;/u,
  );
  assert.match(
    normalized,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.assignment_personnel TO service_role;/u,
  );

  for (const policyName of removedAssignmentPersonnelPolicies) {
    assert.match(
      normalized,
      new RegExp(`DROP POLICY IF EXISTS ${policyName} ON public\\.assignment_personnel;`, "u"),
    );
  }

  const grantStatements = sqlStatements(migration).filter((statement) => /^\bGRANT\b/iu.test(statement));
  assert.deepEqual(grantStatements, [
    "GRANT EXECUTE ON FUNCTION public.personnel_assigned_to_assignment(uuid) TO authenticated;",
    "GRANT EXECUTE ON FUNCTION public.personnel_can_access_assignment_storage(uuid, uuid) TO authenticated;",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assignment_personnel TO service_role;",
  ]);
  assert.doesNotMatch(migration, /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+public\.assignment_personnel\b/iu);
});

test("personnel_assigned_to_assignment is a minimal hardened SECURITY DEFINER helper", () => {
  const migration = read(phaseBMigrationPath);
  const helper = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.personnel_assigned_to_assignment"),
    migration.indexOf("REVOKE ALL ON FUNCTION public.personnel_assigned_to_assignment"),
  );

  assert.match(helper, /SECURITY DEFINER/u);
  assert.match(helper, /SET search_path = pg_catalog, public, auth/u);
  assert.match(helper, /LANGUAGE sql/u);
  assert.match(helper, /FROM public\.assignment_personnel ap/u);
  assert.match(helper, /JOIN public\.assignments a/u);
  assert.match(helper, /JOIN public\.personnel p/u);
  assert.match(helper, /\(SELECT auth\.uid\(\)\) IS NOT NULL/u);
  assert.match(helper, /p\.user_id = \(SELECT auth\.uid\(\)\)/u);
  assert.match(helper, /p\.is_active = true/u);
  assert.match(helper, /p\.tenant_id IS NOT NULL/u);
  assert.match(helper, /a\.tenant_id IS NOT NULL/u);
  assert.match(helper, /p\.tenant_id = a\.tenant_id/u);

  assert.doesNotMatch(helper, /\bEXECUTE\b/iu);
  assert.doesNotMatch(helper, /\bformat\s*\(/iu);
  assert.doesNotMatch(helper, /auth\.jwt\(\)\s*->>\s*['"]tenant_id['"]/u);
  assert.doesNotMatch(helper, /claim\s+IS\s+NULL\s+OR/iu);

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.personnel_assigned_to_assignment\(uuid\)\s+FROM PUBLIC, anon, authenticated, service_role;/u,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.personnel_assigned_to_assignment\(uuid\)\s+TO authenticated;/u,
  );
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.personnel_assigned_to_assignment\(uuid\)\s+TO anon/u);
});

test("personnel storage policies use database-derived tenant binding, not JWT tenant claims", () => {
  const migration = read(phaseBMigrationPath);
  const storageHelper = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.personnel_can_access_assignment_storage"),
    migration.indexOf("REVOKE ALL ON FUNCTION public.personnel_can_access_assignment_storage"),
  );
  const storagePolicies = migration.slice(
    migration.indexOf("DO $$"),
    migration.indexOf("REVOKE ALL ON TABLE public.assignment_personnel"),
  );

  assert.match(storageHelper, /SECURITY DEFINER/u);
  assert.match(storageHelper, /SET search_path = pg_catalog, public, auth/u);
  assert.match(storageHelper, /p_assignment_id IS NOT NULL/u);
  assert.match(storageHelper, /FROM public\.assignment_personnel ap/u);
  assert.match(storageHelper, /JOIN public\.assignments a/u);
  assert.match(storageHelper, /JOIN public\.personnel p/u);
  assert.match(storageHelper, /p\.user_id = \(SELECT auth\.uid\(\)\)/u);
  assert.match(storageHelper, /p\.is_active = true/u);
  assert.match(storageHelper, /p\.tenant_id = a\.tenant_id/u);
  assert.match(storageHelper, /p_path_tenant_id IS NULL\s+OR p_path_tenant_id = a\.tenant_id/u);
  assert.doesNotMatch(storageHelper, /auth\.jwt\(\)\s*->>\s*['"]tenant_id['"]/u);
  assert.doesNotMatch(storageHelper, /\bEXECUTE\b/iu);
  assert.doesNotMatch(storageHelper, /\bformat\s*\(/iu);

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.personnel_can_access_assignment_storage\(uuid, uuid\)\s+FROM PUBLIC, anon, authenticated, service_role;/u,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.personnel_can_access_assignment_storage\(uuid, uuid\)\s+TO authenticated;/u,
  );

  for (const policyName of [
    "assignment_photos_assigned_personnel",
    "assignment_photos_assigned_personnel_insert",
    "assignment_photos_assigned_personnel_update",
    "assignment_photos_assigned_personnel_delete",
  ]) {
    assert.match(storagePolicies, new RegExp(policyName, "u"));
  }
  assert.match(storagePolicies, /personnel_can_access_assignment_storage/u);
  assert.match(storagePolicies, /fieldgrid_storage_assignment_id_from_path\(name\)/u);
  assert.match(storagePolicies, /fieldgrid_storage_tenant_id_from_path\(name\)/u);
  assert.doesNotMatch(storagePolicies, /auth\.jwt\(\)\s*->>\s*['"]tenant_id['"]/u);
});

test("Phase-B migration removes obsolete helpers when present and keeps legacy RPC revoked", () => {
  const phaseA = read(phaseAMigrationPath);
  const phaseB = read(phaseBMigrationPath);

  assert.match(phaseA, /to_regprocedure\('public\.pwa_apply_for_assignment\(uuid\)'\)/u);
  assert.match(
    phaseA,
    /REVOKE ALL ON FUNCTION public\.pwa_apply_for_assignment\(uuid\) FROM PUBLIC, anon, authenticated/u,
  );
  assert.match(phaseB, /DROP FUNCTION IF EXISTS\s+public\.can_manage_assignment_personnel\(uuid, uuid\);/u);
  assert.match(phaseB, /DROP FUNCTION IF EXISTS\s+public\.can_select_own_assignment_personnel\(uuid, uuid\);/u);
  assert.match(phaseB, /DROP FUNCTION IF EXISTS\s+public\.assignment_personnel_tenant_match\(uuid, uuid\);/u);
});

test("Phase-B source guards cover direct access, RLS runtime, service-role invariant, and rollback compatibility", () => {
  const harness = read("scripts/fieldgrid-runtime-safety-rls-harness.mjs");
  const compatibility = read("scripts/fieldgrid-runtime-safety-previous-release-compatibility.mjs");
  const workflow = read(".github/workflows/runtime-safety-harness.yml");

  assert.match(harness, /rls-authenticated-direct-assignment-personnel-crud-revoked/u);
  assert.match(harness, /rls-anon-assignment-personnel-select-permission-denied/u);
  assert.match(harness, /rls-service-role-crud-and-trigger-invariant/u);
  assert.match(harness, /rls-personnel-policy-mediated-legitimate-data-access/u);
  assert.match(harness, /rls-tenant-a-b-isolation-and-jwt-tenant-claim-ignored/u);
  assert.match(harness, /rls-storage-assignment-photo-path-tenant-isolation-without-tenant-claim/u);
  assert.match(harness, /rls-customer-safe-realtime-projection-and-deactivation/u);
  assert.match(harness, /rls-personnel-approval-and-evidence-mutation-escalation-denied/u);
  assert.match(harness, /rls-database-function-policy-dependency-audit/u);
  assert.match(harness, /set local role \$\{role\}/u);
  assert.match(harness, /asAuthenticated\(client/u);
  assert.match(harness, /set local row_security = on/u);
  assert.doesNotMatch(harness, /rls-authenticated-own-select-rollback-compatibility/u);

  assert.match(compatibility, /132e7d0705f0192d6ec4a28195f192850574447d/u);
  assert.match(compatibility, /phase-b-previous-release-database-compatibility/u);
  assert.match(compatibility, /previousReleaseServerSideQueriesStillWork/u);
  assert.match(compatibility, /previousReleaseRlsContractStillWorksWithoutTenantClaim/u);
  assert.match(compatibility, /phase-b-previous-release-rls-contract-without-tenant-claim/u);
  assert.match(workflow, /phase-b-previous-release-database-compatibility/u);
});

test("Phase-B documentation classifies evidence layers without treating regex as runtime proof", () => {
  const classification = read("docs/testing/test-layer-classification.json");
  const docs = read("docs/testing/runtime-safety-harness.md");

  assert.match(classification, /phase-b-assignment-personnel-select-closure/u);
  assert.match(classification, /authenticated RLS plus database ACL runtime evidence/u);
  assert.match(classification, /phase-b-previous-release-database-compatibility/u);
  assert.match(classification, /deployment compatibility layer/u);
  assert.match(docs, /Phase B closes authenticated direct SELECT/u);
  assert.match(docs, /static callsite audit/u);
  assert.match(docs, /real PostgreSQL queries/u);
  assert.match(docs, /source regex checks are not runtime proof|Do not substitute static source inspection/u);
});

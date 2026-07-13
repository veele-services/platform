import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();
const phaseAMigrationPath = "lib/db/migrations/20260712130000_assignment_personnel_tenant_guard.sql";
const phaseAAclMigrationPath = "lib/db/migrations/20260713120000_assignment_personnel_phase_a_acl_hardening.sql";
const phaseAMigrationSha256 = "a421f26d21834f6ecc4f9f6ea0849edeb8cc7a80ebc51c49e7524beb8c8a9079";
const rollbackPolicyNames = [
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("assignment_personnel phase-A migration keeps SELECT rollback compatibility and closes direct DML", () => {
  const migration = read(phaseAMigrationPath);

  assert.match(migration, /assignment_personnel tenant invariant preflight failed/u);
  assert.match(migration, /LEFT JOIN public\.assignments/u);
  assert.match(migration, /LEFT JOIN public\.personnel/u);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.trg_assignment_personnel_tenant_guard/u);
  assert.match(migration, /SET search_path = pg_catalog, public/u);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.assignment_personnel/u);
  assert.match(migration, /USING ERRCODE = '23514'/u);
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON public\.assignment_personnel FROM PUBLIC, anon, authenticated/u,
  );
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.assignment_personnel TO service_role/u,
  );
  assert.doesNotMatch(migration, /REVOKE ALL ON TABLE public\.assignment_personnel FROM PUBLIC, anon, authenticated/u);
  assert.doesNotMatch(migration, /REVOKE SELECT ON public\.assignment_personnel FROM .*authenticated/u);
  assert.doesNotMatch(migration, /GRANT SELECT ON public\.assignment_personnel TO authenticated/u);
  assert.doesNotMatch(migration, /DROP POLICY IF EXISTS assignment_personnel_management_all/u);
  assert.doesNotMatch(migration, /DROP POLICY IF EXISTS assignment_personnel_tenant_management_all/u);
  assert.doesNotMatch(migration, /DROP POLICY IF EXISTS assignment_personnel_own_select/u);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.can_select_own_assignment_personnel/u);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.can_manage_assignment_personnel/u);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.can_select_own_assignment_personnel/u);
  assert.doesNotMatch(migration, /DROP FUNCTION IF EXISTS public\.can_manage_assignment_personnel\(uuid, uuid\)/u);
  assert.doesNotMatch(migration, /DROP FUNCTION IF EXISTS public\.can_select_own_assignment_personnel\(uuid, uuid\)/u);
});

test("assignment_personnel phase-A migration is unchanged in this ACL hardening PR", () => {
  assert.equal(sha256(read(phaseAMigrationPath)), phaseAMigrationSha256);
});

test("assignment_personnel phase-A.1 migration revokes broad table ACL and grants back only authenticated SELECT", () => {
  const migration = read(phaseAAclMigrationPath);
  const normalized = normalizeSql(migration);

  assert.match(migration, /Phase A\.1: least-privilege ACL hardening\./u);
  assert.match(migration, /Keep authenticated SELECT temporarily for rollback compatibility\./u);
  assert.match(
    normalized,
    /REVOKE ALL ON TABLE public\.assignment_personnel FROM PUBLIC, anon, authenticated;/u,
  );
  assert.match(
    normalized,
    /GRANT SELECT ON TABLE public\.assignment_personnel TO authenticated;/u,
  );

  const grantStatements = migration.match(/\bGRANT\b[\s\S]*?;/giu)?.map(normalizeSql) ?? [];
  assert.deepEqual(grantStatements, [
    "GRANT SELECT ON TABLE public.assignment_personnel TO authenticated;",
  ]);
  assert.doesNotMatch(migration, /\bGRANT\b[\s\S]*?\bTO\b[\s\S]*?\banon\b[\s\S]*?;/iu);
  assert.doesNotMatch(
    migration,
    /\bGRANT\b[\s\S]*?\b(INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|MAINTAIN)\b[\s\S]*?\bTO\b[\s\S]*?\bauthenticated\b[\s\S]*?;/iu,
  );
  assert.doesNotMatch(migration, /\b(REVOKE|GRANT)\b[\s\S]*?\bservice_role\b[\s\S]*?;/iu);
  assert.doesNotMatch(migration, /\b(CREATE|DROP)\s+(POLICY|TRIGGER|FUNCTION)\b/iu);
  assert.doesNotMatch(migration, /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+public\.assignment_personnel\b/iu);

  for (const policyName of rollbackPolicyNames) {
    assert.doesNotMatch(migration, new RegExp(`DROP POLICY IF EXISTS ${policyName}`, "u"));
  }
});

test("security definer helpers have explicit revokes and minimal grants", () => {
  const migration = read(phaseAMigrationPath);

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.trg_assignment_personnel_tenant_guard\(\) FROM PUBLIC, anon, authenticated/u,
  );

  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.trg_assignment_personnel_tenant_guard\(\) TO/u);
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.can_manage_assignment_personnel\(uuid, uuid\) TO/u,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.can_select_own_assignment_personnel\(uuid, uuid\) TO/u,
  );
});

test("authenticated RLS harness proves phase-A server-only DML without claiming SELECT closure", () => {
  const harness = read("scripts/fieldgrid-runtime-safety-rls-harness.mjs");

  assert.match(harness, /asRole\(client, "authenticated"/u);
  assert.match(harness, /set local row_security = on/u);
  assert.match(harness, /request\.jwt\.claim\.sub/u);
  assert.match(harness, /request\.jwt\.claims/u);
  assert.match(harness, /rls-assignment-personnel-table-acl-least-privilege/u);
  assert.match(harness, /aclexplode\(coalesce\(c\.relacl, acldefault\('r', c\.relowner\)\)\)/u);
  assert.match(harness, /has_table_privilege\(role_name::name, 'public\.assignment_personnel', privilege_name\)/u);
  assert.match(harness, /rls-authenticated-own-select-rollback-compatibility/u);
  assert.match(harness, /Temporary Phase-A rollback compatibility only; cross-tenant SELECT closure remains Phase B\./u);
  assert.match(harness, /rls-anon-assignment-personnel-select-permission-denied/u);
  assert.match(harness, /SELECT count\(\*\) FROM public\.assignment_personnel/u);
  assert.match(harness, /rls-tenant-context-does-not-open-direct-dml/u);
  assert.match(harness, /rls-legacy-global-management-without-tenant-role-denied/u);
  assert.match(harness, /rls-authenticated-direct-dml-revoked/u);
  assert.match(harness, /rls-anon-direct-dml-revoked/u);
  assert.match(harness, /rls-service-role-server-command-and-trigger-invariant/u);
  assert.match(harness, /rls-selected-tenant-claim-does-not-open-assignment-personnel-dml/u);
  assert.match(harness, /rls-security-definer-execute-privileges-minimal/u);
  assert.doesNotMatch(harness, /rls-authenticated-direct-select-revoked/u);
  assert.doesNotMatch(harness, /has_function_privilege\('PUBLIC'/u);
  assert.match(harness, /codex\/assignment-personnel-direct-access-close-phase2-prep/u);
  assert.match(harness, /Close authenticated assignment_personnel SELECT after phase-A is live on staging/u);
});

test("phase-B direct SELECT closure is classified and documented as deferred acceptance", () => {
  const classification = read("docs/testing/test-layer-classification.json");
  const docs = read("docs/testing/runtime-safety-harness.md");

  assert.match(classification, /phase-b-assignment-personnel-select-closure/u);
  assert.match(classification, /phase-B acceptance criteria/u);
  assert.match(classification, /codex\/assignment-personnel-direct-access-close-phase2-prep/u);
  assert.match(classification, /Close authenticated assignment_personnel SELECT after phase-A is live on staging/u);
  assert.match(classification, /assignment_personnel_management_all is removed/u);
  assert.match(classification, /personnel_read_own_assignment_personnel is removed/u);
  assert.match(docs, /Phase A\.1 deliberately keeps authenticated SELECT/u);
  assert.match(docs, /codex\/assignment-personnel-direct-access-close-phase2-prep/u);
  assert.match(docs, /reference snapshot only/u);
  assert.match(docs, /must not be merged directly/u);
  assert.match(docs, /rewrites the already-applied migration `20260712130000_assignment_personnel_tenant_guard\.sql`/u);
  assert.match(docs, /new forward-only migration from current main/u);
});

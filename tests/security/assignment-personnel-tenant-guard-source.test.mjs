import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

test("assignment_personnel migration installs preflight, trigger guard, and tenant-bound server authorization", () => {
  const migration = read("lib/db/migrations/20260712130000_assignment_personnel_tenant_guard.sql");
  const canManage = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.can_manage_assignment_personnel"),
    migration.indexOf("CREATE OR REPLACE FUNCTION public.can_select_own_assignment_personnel"),
  );

  assert.match(migration, /assignment_personnel tenant invariant preflight failed/u);
  assert.match(migration, /LEFT JOIN public\.assignments/u);
  assert.match(migration, /LEFT JOIN public\.personnel/u);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.trg_assignment_personnel_tenant_guard/u);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.assignment_personnel/u);
  assert.match(migration, /USING ERRCODE = '23514'/u);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.can_manage_assignment_personnel/u);
  assert.doesNotMatch(canManage, /public\.is_management\(\)|\bis_management\(\)/u);
  assert.doesNotMatch(canManage, /IS NULL\s+OR/u);
  assert.match(canManage, /JOIN public\.tenant_roles tr/u);
  assert.match(canManage, /tr\.tenant_id = a\.tenant_id/u);
  assert.match(canManage, /perm\.resource = 'assignments'/u);
  assert.match(canManage, /perm\.action = 'write'/u);
  assert.match(migration, /DROP POLICY IF EXISTS assignment_personnel_management_all/u);
  assert.doesNotMatch(migration, /CREATE POLICY assignment_personnel_tenant_management_all/u);
  assert.match(migration, /CREATE POLICY assignment_personnel_own_select/u);
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON public\.assignment_personnel FROM PUBLIC, anon, authenticated/u,
  );
  assert.match(migration, /GRANT SELECT ON public\.assignment_personnel TO authenticated/u);
});

test("security definer helpers have explicit revokes and minimal grants", () => {
  const migration = read("lib/db/migrations/20260712130000_assignment_personnel_tenant_guard.sql");

  for (const signature of [
    "assignment_personnel_tenant_match\\(uuid, uuid\\)",
    "trg_assignment_personnel_tenant_guard\\(\\)",
    "can_manage_assignment_personnel\\(uuid, uuid\\)",
    "can_select_own_assignment_personnel\\(uuid, uuid\\)",
  ]) {
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature} FROM PUBLIC`, "u"));
  }

  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.can_manage_assignment_personnel\(uuid, uuid\) TO service_role/u,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.can_select_own_assignment_personnel\(uuid, uuid\) TO authenticated/u,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.can_manage_assignment_personnel\(uuid, uuid\) TO authenticated/u,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.trg_assignment_personnel_tenant_guard\(\) TO authenticated/u,
  );
});

test("authenticated RLS harness proves server-only DML and fail-closed tenant context", () => {
  const harness = read("scripts/fieldgrid-runtime-safety-rls-harness.mjs");

  assert.match(harness, /asRole\(client, "authenticated"/u);
  assert.match(harness, /set local row_security = on/u);
  assert.match(harness, /request\.jwt\.claim\.sub/u);
  assert.match(harness, /request\.jwt\.claims/u);
  assert.match(harness, /rls-tenant-context-fail-closed/u);
  assert.match(harness, /rls-legacy-global-management-without-tenant-role-denied/u);
  assert.match(harness, /rls-authenticated-direct-dml-revoked/u);
  assert.match(harness, /rls-service-role-server-command-and-trigger-invariant/u);
  assert.match(harness, /rls-own-personnel-select-and-cross-tenant-read-denied/u);
  assert.match(harness, /rls-multi-tenant-selected-context-boundary/u);
  assert.match(harness, /rls-security-definer-execute-privileges-minimal/u);
});

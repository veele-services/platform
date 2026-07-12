import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

test("assignment_personnel migration installs preflight, trigger guard, and tenant-bound RLS", () => {
  const migration = read("lib/db/migrations/20260712130000_assignment_personnel_tenant_guard.sql");

  assert.match(migration, /assignment_personnel tenant invariant preflight failed/u);
  assert.match(migration, /LEFT JOIN public\.assignments/u);
  assert.match(migration, /LEFT JOIN public\.personnel/u);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.trg_assignment_personnel_tenant_guard/u);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.assignment_personnel/u);
  assert.match(migration, /USING ERRCODE = '23514'/u);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.can_manage_assignment_personnel/u);
  assert.match(migration, /NULLIF\(auth\.jwt\(\) ->> 'tenant_id', ''\)::uuid = a\.tenant_id/u);
  assert.match(migration, /DROP POLICY IF EXISTS assignment_personnel_management_all/u);
  assert.match(migration, /CREATE POLICY assignment_personnel_tenant_management_all/u);
});

test("authenticated RLS harness uses authenticated role and JWT GUCs, not postgres as actor", () => {
  const harness = read("scripts/fieldgrid-runtime-safety-rls-harness.mjs");

  assert.match(harness, /set local role authenticated/u);
  assert.match(harness, /set local row_security = on/u);
  assert.match(harness, /request\.jwt\.claim\.sub/u);
  assert.match(harness, /request\.jwt\.claims/u);
  assert.match(harness, /rls-authenticated-tenant-a-same-tenant-write/u);
  assert.match(harness, /rls-authenticated-tenant-a-foreign-personnel-write-denied/u);
  assert.match(harness, /rls-authenticated-multi-tenant-context-boundary/u);
});

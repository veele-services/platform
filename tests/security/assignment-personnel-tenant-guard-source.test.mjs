import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

test("assignment_personnel phase-A migration keeps SELECT rollback compatibility and closes direct DML", () => {
  const migration = read("lib/db/migrations/20260712130000_assignment_personnel_tenant_guard.sql");

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

test("security definer helpers have explicit revokes and minimal grants", () => {
  const migration = read("lib/db/migrations/20260712130000_assignment_personnel_tenant_guard.sql");

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
  assert.match(harness, /rls-tenant-context-does-not-open-direct-dml/u);
  assert.match(harness, /rls-legacy-global-management-without-tenant-role-denied/u);
  assert.match(harness, /rls-authenticated-direct-dml-revoked/u);
  assert.match(harness, /rls-anon-direct-dml-revoked/u);
  assert.match(harness, /rls-service-role-server-command-and-trigger-invariant/u);
  assert.match(harness, /rls-selected-tenant-claim-does-not-open-assignment-personnel-dml/u);
  assert.match(harness, /rls-security-definer-execute-privileges-minimal/u);
  assert.doesNotMatch(harness, /rls-authenticated-direct-select-revoked/u);
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
  assert.match(docs, /Phase A deliberately does not revoke authenticated SELECT/u);
  assert.match(docs, /codex\/assignment-personnel-direct-access-close-phase2-prep/u);
});

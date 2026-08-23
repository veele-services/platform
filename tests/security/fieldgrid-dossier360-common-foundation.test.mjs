import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("common dossier profiles have one tenant-bound canonical subject", async () => {
  const migration = await read(
    "lib/db/migrations/20260823130000_dossier360_common_foundation.sql",
  );

  assert.match(migration, /num_nonnulls\(personnel_id, customer_id, object_id\) = 1/u);
  for (const relation of ["personnel", "customers", "objects"]) {
    assert.match(
      migration,
      new RegExp(`REFERENCES public\\.${relation}\\(tenant_id, id\\) ON DELETE RESTRICT`, "u"),
    );
  }
  assert.match(migration, /dossier_profiles_personnel_unique/u);
  assert.match(migration, /dossier_profiles_customer_unique/u);
  assert.match(migration, /dossier_profiles_object_unique/u);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN)/iu);
});

test("notes and timeline are append-only and hard delete uses a guarded lifecycle", async () => {
  const migration = await read(
    "lib/db/migrations/20260823130000_dossier360_common_foundation.sql",
  );

  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.dossier_notes/u);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.dossier_events/u);
  assert.match(migration, /legal hold blocks dossier deletion/u);
  assert.match(migration, /hard delete is unavailable through the normal dossier lifecycle/u);
  assert.match(migration, /correction_of_id/u);
  assert.match(migration, /dossier_notes_correction_tenant_fk/u);
});

test("common dossier tables are server-only with RLS and no implicit role grants", async () => {
  const migration = await read(
    "lib/db/migrations/20260823130000_dossier360_common_foundation.sql",
  );

  for (const table of ["dossier_profiles", "dossier_notes", "dossier_tasks", "dossier_events"]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "u"));
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated, service_role`, "u"),
    );
  }
  const permissionSeed = migration.slice(migration.indexOf("INSERT INTO public.permissions"));
  assert.doesNotMatch(permissionSeed, /INSERT INTO public\.(?:role_permissions|tenant_role_permissions)/u);
});

test("dossier reads are permission checked and tenant scoped", async () => {
  const action = await read("artifacts/backoffice/src/app/actions/dossier360.ts");

  assert.match(action, /requirePermission\(subjectPermission\[parsed\.data\.subjectType\], "read"\)/u);
  assert.match(action, /eq\(dossierProfilesTable\.tenantId, tenantId\)/u);
  assert.match(action, /eq\(dossierTasksTable\.tenantId, tenantId\)/u);
  assert.doesNotMatch(action, /select\(\)\.from\(dossierProfilesTable\)/u);
});

test("dossier mutations recheck subject access and note classification", async () => {
  const action = await read("artifacts/backoffice/src/app/actions/dossier360.ts");
  assert.match(action, /requirePermission\(subjectPermission\[input\.subjectType\], "read"\)/u);
  assert.match(action, /notes_confidential/u);
  assert.match(action, /notes_restricted/u);
  assert.match(action, /inArray\(dossierNotesTable\.classification, visibleNoteClassifications\)/u);
});

test("customer deletion preserves related data when a dossier blocks hard delete", async () => {
  const action = await read("artifacts/backoffice/src/app/actions/customers.ts");
  const deleteCustomer = action.slice(
    action.indexOf("export async function deleteCustomer"),
    action.indexOf("export async function inviteCustomerPortal"),
  );

  assert.match(deleteCustomer, /eq\(dossierProfilesTable\.tenantId, tenantId\)/u);
  assert.match(deleteCustomer, /eq\(dossierProfilesTable\.customerId, id\)/u);
  assert.ok(
    deleteCustomer.indexOf("if (dossier)") <
      deleteCustomer.indexOf(".delete(customerContactsTable)"),
  );
  assert.match(deleteCustomer, /await db\.transaction\(async \(tx\) => \{/u);
  assert.match(deleteCustomer, /tx[\s\S]*\.delete\(customerContactsTable\)/u);
  assert.match(deleteCustomer, /tx[\s\S]*\.delete\(customerNotesTable\)/u);
  assert.match(deleteCustomer, /tx[\s\S]*\.delete\(customersTable\)/u);
  assert.match(deleteCustomer, /tx\.insert\(auditLogTable\)/u);
});

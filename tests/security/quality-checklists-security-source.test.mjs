import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const migration = read("lib/db/migrations/20260721120000_quality_checklists_foundation.sql");
const service = read("lib/db/src/checklist-reconciliation.ts");
const management = read("artifacts/backoffice/src/app/actions/checklists.ts");
const personnel = read("artifacts/personeel-pwa/src/actions/checklists.ts");
const storage = read("artifacts/personeel-pwa/src/lib/uploads/assignment-media.ts");

const historicalTables = [
  "checklist_template_versions",
  "assignment_checklists",
  "assignment_checklist_sources",
  "assignment_checklist_answers",
  "assignment_checklist_evidence",
  "checklist_reconciliation_events",
  "checklist_waivers",
];

test("every historical checklist relation is tenant scoped and restricts referenced deletion", () => {
  for (const table of historicalTables) {
    const block = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\([\\s\\S]*?\\n\\);`, "u"))?.[0];
    assert.ok(block, `${table} table is missing`);
    assert.match(block, /tenant_id uuid NOT NULL/u, `${table} must own a tenant key`);
    assert.doesNotMatch(block, /ON DELETE CASCADE/u, `${table} must not cascade historical data`);
  }
  assert.match(migration, /assignment_checklists_cardinality_idx[\s\S]*tenant_id, assignment_id, template_id, cardinality, cardinality_key/u);
  assert.match(migration, /checklist_reconciliation_events_idempotency_idx[\s\S]*tenant_id, idempotency_key/u);
});

test("RLS has management write checks and assigned-personnel read/write boundaries", () => {
  for (const table of ["checklist_templates", "checklist_bindings", "assignment_checklists", "assignment_checklist_answers", "assignment_checklist_evidence", "checklist_reconciliation_events", "checklist_waivers"]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "u"));
  }
  assert.match(migration, /assignment_checklists_management_all[\s\S]*USING \(public\.is_management_for_tenant\(tenant_id\)\)[\s\S]*WITH CHECK \(public\.is_management_for_tenant\(tenant_id\)\)/u);
  assert.match(migration, /assignment_checklist_answers_personnel_insert[\s\S]*personnel_assigned_to_assignment/u);
  assert.match(migration, /assignment_checklist_evidence_personnel_insert[\s\S]*personnel_assigned_to_assignment/u);
  assert.match(migration, /WITH CHECK \([\s\S]*personnel_assigned_to_assignment/u);
});

test("immutable publication, snapshots, answers and evidence are enforced in PostgreSQL", () => {
  assert.match(migration, /published checklist versions are immutable/u);
  assert.match(migration, /historical checklist records are append-only/u);
  assert.match(migration, /started checklist composition is immutable/u);
  assert.match(migration, /terminal checklist snapshot is immutable/u);
  assert.match(migration, /checklist answers are immutable for this work order/u);
  assert.match(migration, /checklist answer revision conflict/u);
  assert.match(migration, /checklist item is not part of the immutable snapshot/u);
  assert.match(migration, /checklist evidence path is not canonical for this tenant snapshot item/u);
  assert.match(migration, /assignment checklist snapshots cannot be deleted/u);
});

test("protected and waiver rules are server-side and audited", () => {
  assert.match(service, /checklist\.is_protected/u);
  assert.match(service, /checklist\.is_waivable/u);
  assert.match(service, /Een reden is verplicht voor een vrijstelling/u);
  assert.match(service, /INSERT INTO public\.checklist_waivers/u);
  assert.match(service, /`checklist_\$\{input\.kind\}`/u);
  assert.match(management, /requirePermission\("checklists", action\)/u);
  assert.match(management, /checklistIdentity\("review"\)/u);
});

test("tenant and object identifiers are revalidated before personnel evidence writes", () => {
  assert.match(personnel, /requireCurrentPersonnelPortalTenantId/u);
  assert.match(personnel, /eq\(assignmentsTable\.tenantId, tenantId\)/u);
  assert.match(personnel, /assignmentChecklistId/u);
  assert.match(personnel, /snapshotItemId/u);
  assert.match(personnel, /isChecklistEvidencePath/u);
  assert.match(personnel, /storagePath/u);
  assert.match(storage, /ASSIGNMENT_MEDIA_TENANT_ROOT,[\s\S]*tenantId,[\s\S]*ASSIGNMENT_MEDIA_ASSIGNMENT_ROOT,[\s\S]*assignmentId,[\s\S]*"checklists",[\s\S]*checklistId,[\s\S]*safeStorageSegment\(itemId\)/u);
  assert.match(migration, /split_part\(name, '\/', 1\) = 'tenant'/u);
  assert.match(migration, /split_part\(name, '\/', 5\) = 'checklists'/u);
});

test("service-role credentials never enter checklist client components", () => {
  const client = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/DynamicChecklistCard.tsx");
  const managementClient = read("artifacts/backoffice/src/components/checklists/ChecklistManagement.tsx");
  for (const source of [client, managementClient]) {
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE|service[_-]?role[_-]?key/iu);
    assert.doesNotMatch(source, /process\.env/u);
  }
});

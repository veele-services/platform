import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  getAssignmentChecklistCompletionIssues,
  pool,
  previewAssignmentChecklistResolution,
  reconcileAssignmentChecklists,
  saveAssignmentChecklistAnswer,
  transitionAssignmentStaffing,
  waiveAssignmentChecklist,
} from "../lib/db/src/index.ts";

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "DATABASE_URL is required");
const parsed = new URL(databaseUrl);
assert.ok(["127.0.0.1", "localhost", "::1", "postgres"].includes(parsed.hostname), "Checklist runtime proof only runs against local/disposable PostgreSQL");
assert.match(parsed.pathname, /(runtime|safety|test|smoke)/u, "Database name must clearly identify a disposable runtime database");

const tenantA = "10000000-0000-4000-8000-000000000001";
const tenantB = "10000000-0000-4000-8000-000000000002";
const assignmentA = "70000000-0000-4000-8000-000000000001";
const assignmentB = "70000000-0000-4000-8000-000000000002";
const actorA = "20000000-0000-4000-8000-000000000101";
const managerA = "20000000-0000-4000-8000-000000000102";
const personnelA = "20000000-0000-4000-8000-000000000104";
const personnelRecordA = "60000000-0000-4000-8000-000000000001";
const managerB = "20000000-0000-4000-8000-000000000202";
const templateId = randomUUID();
const versionId = randomUUID();
const bindingId = randomUUID();
const itemId = `runtime-check-${randomUUID()}`;
const familyKey = `runtime-${randomUUID()}`;

const report: Record<string, unknown> = { startedAt: new Date().toISOString() };

async function asAuthenticated<T>(userId: string, email: string, callback: (client: Awaited<ReturnType<typeof pool.connect>>) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SET LOCAL row_security = on");
    const claims = JSON.stringify({ sub: userId, email, role: "authenticated", aud: "authenticated" });
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [claims]);
    const value = await callback(client);
    await client.query("ROLLBACK");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

try {
  const catalog = await pool.query(
    `SELECT
       (SELECT count(*)::integer FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%checklist%') AS tables,
       (SELECT count(*)::integer FROM pg_policies WHERE schemaname='public' AND tablename LIKE '%checklist%') AS policies,
       (SELECT count(*)::integer FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text LIKE '%checklist%') AS triggers`,
  );
  assert.ok(Number(catalog.rows[0].tables) >= 10);
  assert.ok(Number(catalog.rows[0].policies) >= 10);
  assert.ok(Number(catalog.rows[0].triggers) >= 8);

  await pool.query(
    `INSERT INTO public.checklist_templates(
       id, tenant_id, family_key, name, cardinality, is_protected, is_waivable,
       status, created_by, updated_by
     ) VALUES ($1,$2,$3,'Runtime protected checklist','per_work_order',true,false,'published',$4,$4)`,
    [templateId, tenantA, familyKey, actorA],
  );
  const snapshot = {
    sections: [{
      id: "runtime-section",
      title: "Runtime",
      sortOrder: 0,
      items: [{ id: itemId, type: "checkbox", label: "Runtime acknowledgement", required: true, sortOrder: 0 }],
    }],
  };
  await pool.query(
    `INSERT INTO public.checklist_template_versions(
       id, tenant_id, template_id, version_number, status, schema, schema_hash,
       created_by, published_by, published_at
     ) VALUES ($1,$2,$3,1,'published',$4::jsonb,$5,$6,$6,now())`,
    [versionId, tenantA, templateId, JSON.stringify(snapshot), `runtime:${versionId}`, actorA],
  );
  await pool.query(
    `INSERT INTO public.checklist_bindings(
       id, tenant_id, template_id, version_strategy, mode, auto_attach, required,
       blocking_moments, skip_allowed, personnel_can_remove, created_by, updated_by
     ) VALUES ($1,$2,$3,'latest_published','add',true,true,'["before_complete"]'::jsonb,false,false,$4,$4)`,
    [bindingId, tenantA, templateId, actorA],
  );
  await transitionAssignmentStaffing({
    tenantId: tenantA,
    assignmentId: assignmentA,
    personnelId: personnelRecordA,
    actorUserId: managerA,
    action: "assign",
  });

  const key = `runtime:${randomUUID()}`;
  const first = await reconcileAssignmentChecklists({
    tenantId: tenantA,
    assignmentId: assignmentA,
    trigger: "assignment_context_changed",
    idempotencyKey: key,
    actorUserId: actorA,
  });
  const replay = await reconcileAssignmentChecklists({
    tenantId: tenantA,
    assignmentId: assignmentA,
    trigger: "assignment_context_changed",
    idempotencyKey: key,
    actorUserId: actorA,
  });
  assert.equal(first.eventStatus, "applied");
  assert.equal(replay.replayed, true);
  assert.equal(replay.eventId, first.eventId);

  const rows = await pool.query(
    `SELECT id FROM public.assignment_checklists
     WHERE tenant_id=$1 AND assignment_id=$2 AND template_id=$3`,
    [tenantA, assignmentA, templateId],
  );
  assert.equal(rows.rowCount, 1, "cardinality uniqueness must create one snapshot");
  const checklistId = String(rows.rows[0].id);

  const ownerAVisible = await asAuthenticated(managerA, "admin@tenant-a.runtime.fieldgrid.test", (client) => client.query(
    `SELECT id FROM public.assignment_checklists WHERE tenant_id=$1 AND id=$2`,
    [tenantA, checklistId],
  ));
  assert.equal(ownerAVisible.rowCount, 1);
  const ownerBCrossTenant = await asAuthenticated(managerB, "admin@tenant-b.runtime.fieldgrid.test", (client) => client.query(
    `SELECT id FROM public.assignment_checklists WHERE tenant_id=$1 AND id=$2`,
    [tenantA, checklistId],
  ));
  assert.equal(ownerBCrossTenant.rowCount, 0);
  const personnelVisible = await asAuthenticated(personnelA, "personnel@tenant-a.runtime.fieldgrid.test", (client) => client.query(
    `SELECT id FROM public.assignment_checklists WHERE tenant_id=$1 AND id=$2`,
    [tenantA, checklistId],
  ));
  assert.equal(personnelVisible.rowCount, 1);
  await assert.rejects(
    asAuthenticated(managerB, "admin@tenant-b.runtime.fieldgrid.test", (client) => client.query(
      `INSERT INTO public.assignment_checklist_answers(
         tenant_id, assignment_checklist_id, snapshot_item_id, value, answered_by
       ) VALUES ($1,$2,$3,'true'::jsonb,$4)`,
      [tenantA, checklistId, itemId, managerB],
    )),
    (error: unknown) => (error as { code?: string }).code === "42501",
  );
  await assert.rejects(
    asAuthenticated(personnelA, "personnel@tenant-a.runtime.fieldgrid.test", (client) => client.query(
      `INSERT INTO public.assignment_checklist_answers(
         tenant_id, assignment_checklist_id, snapshot_item_id, value, answered_by
       ) VALUES ($1,$2,'manipulated-item','true'::jsonb,$3)`,
      [tenantA, checklistId, personnelA],
    )),
    /immutable snapshot/u,
  );
  await assert.rejects(
    asAuthenticated(personnelA, "personnel@tenant-a.runtime.fieldgrid.test", (client) => client.query(
      `INSERT INTO public.assignment_checklist_evidence(
         tenant_id, assignment_checklist_id, snapshot_item_id, kind, storage_path, operation_key, uploaded_by
       ) VALUES ($1,$2,$3,'photo',$4,$5,$6)`,
      [tenantA, checklistId, itemId, `assignments/${assignmentA}/checklists/${checklistId}/${itemId}/bad.jpg`, `bad-path:${randomUUID()}`, personnelA],
    )),
    /not canonical/u,
  );

  const missing = await getAssignmentChecklistCompletionIssues({ tenantId: tenantA, assignmentId: assignmentA });
  assert.ok(missing.some((issue) => issue.itemId === itemId && issue.code === "required_answer_missing"));
  await saveAssignmentChecklistAnswer({
    tenantId: tenantA,
    assignmentId: assignmentA,
    assignmentChecklistId: checklistId,
    snapshotItemId: itemId,
    value: true,
    actorUserId: actorA,
    expectedRevision: 0,
    operationKey: `runtime-answer:${randomUUID()}`,
  });
  const complete = await getAssignmentChecklistCompletionIssues({ tenantId: tenantA, assignmentId: assignmentA });
  assert.equal(complete.filter((issue) => issue.checklistId === checklistId).length, 0);

  await assert.rejects(
    waiveAssignmentChecklist({ tenantId: tenantA, assignmentId: assignmentA, assignmentChecklistId: checklistId, actorUserId: actorA, reason: "runtime protected probe", kind: "not_applicable" }),
    /beschermde|niet-vrijstelbare/u,
  );
  await assert.rejects(
    pool.query(`UPDATE public.checklist_template_versions SET schema='{"sections":[]}'::jsonb WHERE id=$1`, [versionId]),
    /immutable/u,
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO public.checklist_bindings(
         tenant_id, template_id, assignment_id, version_strategy, mode, auto_attach,
         blocking_moments, created_by, updated_by
       ) VALUES ($1,$2,$3,'latest_published','add',true,'[]'::jsonb,$4,$4)`,
      [tenantB, templateId, assignmentB, actorA],
    ),
    /mismatch/u,
  );
  await assert.rejects(
    previewAssignmentChecklistResolution({ tenantId: tenantA, assignmentId: assignmentB }),
    /not found/u,
  );

  report.completedAt = new Date().toISOString();
  report.assertions = {
    freshCatalog: true,
    deterministicReplay: true,
    cardinalityUnique: true,
    completionGate: true,
    protectedWaiverDenied: true,
    publishedVersionImmutable: true,
    tenantMismatchDenied: true,
    tenantRlsReadWrite: true,
    assignedPersonnelRls: true,
    manipulatedItemDenied: true,
    nonCanonicalEvidenceDenied: true,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await pool.end();
}

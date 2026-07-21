import type { PoolClient } from "pg";
import { pool } from "./connection";
import {
  assignmentChecklistMutationIsLocked,
  planChecklistReconciliation,
  type ChecklistReconciliationPlan,
  type ExistingChecklistProjection,
} from "./checklist-reconciliation-plan";
import {
  buildChecklistInstanceIdentity,
  checklistFingerprint,
  resolveChecklistComposition,
  type ChecklistBinding,
  type ChecklistBlockingMoment,
  type ChecklistResolutionContext,
  type ChecklistResolutionResult,
  type ChecklistTemplateSnapshot,
  type EffectiveChecklistRules,
  type ResolvedChecklist,
} from "./checklist-resolution";
import {
  validateAssignmentChecklistCompletion,
  type ChecklistCompletionIssue,
  type ChecklistCompletionSnapshot,
} from "./checklist-completion";

const CHECKLIST_SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000001";

type AssignmentLifecycle = {
  tenantId: string;
  assignmentId: string;
  status: string;
  actualStartedAt: Date | string | null;
  customerSignedAt: Date | string | null;
};

export type ChecklistReconciliationTrigger =
  | "assignment_created"
  | "assignment_context_changed"
  | "assignment_task_changed"
  | "assignment_staffing_changed"
  | "assignment_scheduled"
  | "before_start"
  | "manual_checklist_added"
  | "manual_version_upgrade"
  | "binding_changed"
  | "template_published"
  | "retry";

export type AssignmentChecklistReconciliationResult = {
  eventId: string;
  eventStatus: "applied" | "pending_review";
  replayed: boolean;
  resolution: ChecklistResolutionResult;
  plan: ChecklistReconciliationPlan;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function dateString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

async function inTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await callback(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function lockAssignment(
  client: PoolClient,
  tenantId: string,
  assignmentId: string,
): Promise<AssignmentLifecycle & { customerId: string; objectId: string | null; sectorId: string | null; objectType: string | null }> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`checklists:${tenantId}:${assignmentId}`]);
  const result = await client.query(
    `SELECT assignment.id AS assignment_id, assignment.tenant_id, assignment.status,
            assignment.actual_started_at, assignment.customer_signed_at,
            assignment.customer_id, assignment.object_id,
            COALESCE(object.sector_id, customer.sector_id) AS sector_id,
            object.service_type AS object_type
     FROM public.assignments assignment
     JOIN public.customers customer
       ON customer.id = assignment.customer_id AND customer.tenant_id = assignment.tenant_id
     LEFT JOIN public.objects object
       ON object.id = assignment.object_id AND object.tenant_id = assignment.tenant_id
     WHERE assignment.id = $1 AND assignment.tenant_id = $2
     FOR UPDATE OF assignment`,
    [assignmentId, tenantId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Assignment was not found in the active tenant.");
  return {
    tenantId: String(row.tenant_id),
    assignmentId: String(row.assignment_id),
    status: String(row.status),
    actualStartedAt: row.actual_started_at ?? null,
    customerSignedAt: row.customer_signed_at ?? null,
    customerId: String(row.customer_id),
    objectId: row.object_id ? String(row.object_id) : null,
    sectorId: row.sector_id ? String(row.sector_id) : null,
    objectType: row.object_type ? String(row.object_type) : null,
  };
}

async function loadResolutionInput(
  client: PoolClient,
  lifecycle: Awaited<ReturnType<typeof lockAssignment>>,
  effectiveAt: Date,
): Promise<{ context: ChecklistResolutionContext; bindings: ChecklistBinding[] }> {
  const taskResult = await client.query(
    `SELECT task.id, task.task_code_id, task.tenant_task_code_id,
            COALESCE(tenant_code.code, task.task_code_code, code.code) AS code
     FROM public.assignment_tasks task
     JOIN public.assignments assignment ON assignment.id = task.assignment_id AND assignment.tenant_id = $1
     LEFT JOIN public.task_codes code ON code.id = task.task_code_id AND code.tenant_id = $1
     LEFT JOIN public.tenant_task_codes tenant_code ON tenant_code.id = task.tenant_task_code_id AND tenant_code.tenant_id = $1
     WHERE task.assignment_id = $2
     ORDER BY task.sort_order, task.id`,
    [lifecycle.tenantId, lifecycle.assignmentId],
  );
  const bindingResult = await client.query(
    `SELECT binding.*,
            template.family_key, template.name AS template_name, template.cardinality,
            template.is_protected, template.is_waivable,
            version.id AS resolved_version_id, version.version_number,
            version.schema AS version_schema
     FROM public.checklist_bindings binding
     LEFT JOIN public.checklist_templates template
       ON template.id = binding.template_id AND template.tenant_id = binding.tenant_id
     LEFT JOIN LATERAL (
       SELECT candidate.id, candidate.version_number, candidate.schema
       FROM public.checklist_template_versions candidate
       WHERE candidate.tenant_id = binding.tenant_id
         AND candidate.template_id = binding.template_id
         AND candidate.status = 'published'
         AND (binding.version_strategy <> 'pinned' OR candidate.id = binding.template_version_id)
       ORDER BY candidate.version_number DESC
       LIMIT 1
     ) version ON true
     WHERE binding.tenant_id = $1
       AND binding.status = 'active'
       AND (binding.active_from IS NULL OR binding.active_from <= $2)
       AND (binding.active_until IS NULL OR binding.active_until >= $2)
     ORDER BY binding.created_at, binding.id`,
    [lifecycle.tenantId, effectiveAt],
  );
  const bindings: ChecklistBinding[] = bindingResult.rows.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    template: row.template_id && row.resolved_version_id
      ? {
          templateId: String(row.template_id),
          familyKey: String(row.family_key),
          templateName: String(row.template_name),
          versionId: String(row.resolved_version_id),
          versionNumber: Number(row.version_number),
          cardinality: row.cardinality,
          protected: Boolean(row.is_protected),
          waivable: Boolean(row.is_waivable),
          snapshot: row.version_schema as ChecklistTemplateSnapshot,
        }
      : null,
    selectors: {
      assignmentId: row.assignment_id ? String(row.assignment_id) : null,
      sectorId: row.sector_id ? String(row.sector_id) : null,
      customerId: row.customer_id ? String(row.customer_id) : null,
      objectType: row.object_type ? String(row.object_type) : null,
      objectId: row.object_id ? String(row.object_id) : null,
      taskCodeId: row.task_code_id ? String(row.task_code_id) : null,
      tenantTaskCodeId: row.tenant_task_code_id ? String(row.tenant_task_code_id) : null,
    },
    mode: row.mode,
    targetTemplateId: row.target_template_id ? String(row.target_template_id) : null,
    targetFamilyKey: row.target_family_key ? String(row.target_family_key) : null,
    activeFrom: dateString(row.active_from),
    activeUntil: dateString(row.active_until),
    autoAttach: Boolean(row.auto_attach),
    required: Boolean(row.required),
    blockingMoments: asStringArray(row.blocking_moments) as ChecklistBinding["blockingMoments"],
    skipAllowed: Boolean(row.skip_allowed),
    personnelCanRemove: Boolean(row.personnel_can_remove),
    minimumPhotos: Number(row.minimum_photos),
    signatureRequired: Boolean(row.signature_required),
    deviationNoteRequired: Boolean(row.deviation_note_required),
    displayName: row.display_name ? String(row.display_name) : null,
    instruction: row.instruction ? String(row.instruction) : null,
    instructionMode: row.instruction_mode,
    sortOrder: Number(row.sort_order),
    tieBreaker: Number(row.tie_breaker),
    reason: row.reason ? String(row.reason) : null,
    createdAt: dateString(row.created_at)!,
  }));
  return {
    context: {
      tenantId: lifecycle.tenantId,
      assignmentId: lifecycle.assignmentId,
      customerId: lifecycle.customerId,
      sectorId: lifecycle.sectorId,
      objectId: lifecycle.objectId,
      objectType: lifecycle.objectType,
      tasks: taskResult.rows.map((row) => ({
        id: String(row.id),
        taskCodeId: row.task_code_id ? String(row.task_code_id) : null,
        tenantTaskCodeId: row.tenant_task_code_id ? String(row.tenant_task_code_id) : null,
        code: row.code ? String(row.code) : null,
      })),
      effectiveAt: effectiveAt.toISOString(),
    },
    bindings,
  };
}

async function loadExistingChecklists(
  client: PoolClient,
  lifecycle: AssignmentLifecycle,
): Promise<Array<ExistingChecklistProjection & { versionNumber: number }>> {
  const result = await client.query(
    `SELECT checklist.id, checklist.template_id, checklist.template_version_id,
            version.version_number, checklist.cardinality, checklist.cardinality_key,
            checklist.status, checklist.template_snapshot, checklist.effective_rules,
            checklist.source_fingerprint, checklist.response_count,
            COALESCE(evidence.count, 0)::integer AS evidence_count
     FROM public.assignment_checklists checklist
     JOIN public.checklist_template_versions version
       ON version.id = checklist.template_version_id AND version.tenant_id = checklist.tenant_id
     LEFT JOIN LATERAL (
       SELECT count(*) FROM public.assignment_checklist_evidence item
       WHERE item.tenant_id = checklist.tenant_id AND item.assignment_checklist_id = checklist.id
     ) evidence ON true
     WHERE checklist.tenant_id = $1 AND checklist.assignment_id = $2
     ORDER BY checklist.display_order, checklist.id
     FOR UPDATE OF checklist`,
    [lifecycle.tenantId, lifecycle.assignmentId],
  );
  return result.rows.map((row) => {
    const identity = buildChecklistInstanceIdentity({
      tenantId: lifecycle.tenantId,
      assignmentId: lifecycle.assignmentId,
      templateId: String(row.template_id),
      cardinality: row.cardinality,
      cardinalityKey: String(row.cardinality_key),
    });
    return {
      id: String(row.id),
      identity,
      templateId: String(row.template_id),
      versionId: String(row.template_version_id),
      versionNumber: Number(row.version_number),
      cardinality: String(row.cardinality),
      cardinalityKey: String(row.cardinality_key),
      status: String(row.status),
      templateSnapshot: row.template_snapshot,
      effectiveRules: row.effective_rules as EffectiveChecklistRules,
      sourceFingerprint: String(row.source_fingerprint),
      responseCount: Number(row.response_count),
      evidenceCount: Number(row.evidence_count),
    };
  });
}

function preserveSnapshotVersions(
  desired: ResolvedChecklist[],
  existing: Array<ExistingChecklistProjection & { versionNumber: number }>,
): ResolvedChecklist[] {
  const existingByIdentity = new Map(existing.map((item) => [item.identity, item]));
  return desired.map((item) => {
    const current = existingByIdentity.get(item.identity);
    if (!current) return item;
    return {
      ...item,
      versionId: current.versionId,
      versionNumber: current.versionNumber,
      snapshot: current.templateSnapshot as ChecklistTemplateSnapshot,
    };
  });
}

async function persistSources(
  client: PoolClient,
  tenantId: string,
  checklistId: string,
  desired: ResolvedChecklist,
): Promise<void> {
  await client.query(
    `UPDATE public.assignment_checklist_sources
     SET is_active = false, detached_at = COALESCE(detached_at, now()), updated_at = now()
     WHERE tenant_id = $1 AND assignment_checklist_id = $2 AND is_active`,
    [tenantId, checklistId],
  );
  for (const source of desired.sources) {
    await client.query(
      `INSERT INTO public.assignment_checklist_sources(
         tenant_id, assignment_checklist_id, binding_id, source_key, priority,
         specificity, source_snapshot, decisions, is_active, detached_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,true,NULL)
       ON CONFLICT (assignment_checklist_id, binding_id, source_key) DO UPDATE SET
         priority = EXCLUDED.priority, specificity = EXCLUDED.specificity,
         source_snapshot = EXCLUDED.source_snapshot, decisions = EXCLUDED.decisions,
         is_active = true, detached_at = NULL, updated_at = now()`,
      [
        tenantId,
        checklistId,
        source.bindingId,
        source.cardinalityKey,
        source.priority,
        source.specificity,
        JSON.stringify(source),
        JSON.stringify(source.decisions),
      ],
    );
  }
}

async function applyPlan(
  client: PoolClient,
  lifecycle: AssignmentLifecycle,
  plan: ChecklistReconciliationPlan,
  actorUserId: string | null,
): Promise<void> {
  for (const change of plan.changes) {
    if (change.kind === "create" && change.after) {
      const desired = change.after;
      const inserted = await client.query(
        `INSERT INTO public.assignment_checklists(
           tenant_id, assignment_id, template_id, template_version_id, cardinality,
           cardinality_key, status, template_snapshot, effective_rules,
           source_fingerprint, display_order, created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,'active',$7::jsonb,$8::jsonb,$9,$10,$11,$11)
         ON CONFLICT (tenant_id, assignment_id, template_id, cardinality, cardinality_key)
         DO UPDATE SET status = 'active', cancelled_at = NULL,
           effective_rules = EXCLUDED.effective_rules,
           source_fingerprint = EXCLUDED.source_fingerprint,
           display_order = EXCLUDED.display_order,
           updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING id`,
        [
          lifecycle.tenantId,
          lifecycle.assignmentId,
          desired.templateId,
          desired.versionId,
          desired.cardinality,
          desired.cardinalityKey,
          JSON.stringify(desired.snapshot),
          JSON.stringify(desired.effective),
          checklistFingerprint(desired.sources),
          desired.effective.sortOrder,
          actorUserId,
        ],
      );
      await persistSources(client, lifecycle.tenantId, String(inserted.rows[0].id), desired);
    } else if (change.kind === "update" && change.after && change.existingId) {
      const desired = change.after;
      await client.query(
        `UPDATE public.assignment_checklists SET
           status = 'active', cancelled_at = NULL,
           template_version_id = $4, template_snapshot = $5::jsonb,
           effective_rules = $6::jsonb, source_fingerprint = $7,
           display_order = $8, updated_by = $9, updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND assignment_id = $3`,
        [
          change.existingId,
          lifecycle.tenantId,
          lifecycle.assignmentId,
          desired.versionId,
          JSON.stringify(desired.snapshot),
          JSON.stringify(desired.effective),
          checklistFingerprint(desired.sources),
          desired.effective.sortOrder,
          actorUserId,
        ],
      );
      await persistSources(client, lifecycle.tenantId, change.existingId, desired);
    } else if ((change.kind === "cancel" || change.kind === "detach") && change.existingId) {
      await client.query(
        `UPDATE public.assignment_checklists SET status = $4,
           cancelled_at = CASE WHEN $4 = 'cancelled' THEN now() ELSE NULL END,
           updated_by = $5, updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND assignment_id = $3`,
        [
          change.existingId,
          lifecycle.tenantId,
          lifecycle.assignmentId,
          change.kind === "cancel" ? "cancelled" : "detached_pending_review",
          actorUserId,
        ],
      );
      await client.query(
        `UPDATE public.assignment_checklist_sources
         SET is_active = false, detached_at = COALESCE(detached_at, now()), updated_at = now()
         WHERE tenant_id = $1 AND assignment_checklist_id = $2 AND is_active`,
        [lifecycle.tenantId, change.existingId],
      );
    }
  }
}

async function persistWarnings(
  client: PoolClient,
  tenantId: string,
  eventId: string,
  resolution: ChecklistResolutionResult,
): Promise<void> {
  for (const warning of resolution.warnings) {
    const fingerprint = checklistFingerprint({ tenantId, warning });
    await client.query(
      `INSERT INTO public.checklist_configuration_warnings(
         tenant_id, binding_id, reconciliation_event_id, code, message, details, fingerprint
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       ON CONFLICT (tenant_id, fingerprint) DO UPDATE SET
         reconciliation_event_id = EXCLUDED.reconciliation_event_id,
         message = EXCLUDED.message, details = EXCLUDED.details,
         status = 'open', resolved_by = NULL, resolved_at = NULL`,
      [tenantId, warning.bindingId || null, eventId, warning.code, warning.message, JSON.stringify(warning), fingerprint],
    );
  }
}

async function insertAudit(
  client: PoolClient,
  input: {
    tenantId: string;
    actorUserId: string | null;
    action: string;
    assignmentId: string;
    eventId: string;
    plan: ChecklistReconciliationPlan;
    observability?: { durationMs: number; examinedBindings: number; warningCount: number };
  },
): Promise<void> {
  await client.query(
    `INSERT INTO public.audit_log(tenant_id, user_id, action, resource, resource_id, metadata)
     SELECT $1, $2, $3, 'checklist_reconciliation', $4, $5::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM public.audit_log
       WHERE tenant_id = $1 AND resource = 'checklist_reconciliation'
         AND resource_id = $4 AND metadata->>'eventId' = $6
     )`,
    [
      input.tenantId,
      input.actorUserId ?? CHECKLIST_SYSTEM_ACTOR_UUID,
      input.action,
      input.assignmentId,
      JSON.stringify({ eventId: input.eventId, fingerprint: input.plan.fingerprint, counts: input.plan.counts, ...input.observability }),
      input.eventId,
    ],
  );
}

export async function reconcileAssignmentChecklists(input: {
  tenantId: string;
  assignmentId: string;
  trigger: ChecklistReconciliationTrigger;
  idempotencyKey: string;
  actorUserId?: string | null;
  effectiveAt?: Date;
  applyNewerVersions?: boolean;
}): Promise<AssignmentChecklistReconciliationResult> {
  if (!input.idempotencyKey.trim()) throw new Error("Checklist reconciliation requires an idempotency key.");
  const startedAt = performance.now();
  return inTransaction(async (client) => {
    const lifecycle = await lockAssignment(client, input.tenantId, input.assignmentId);
    const replay = await client.query(
      `SELECT id, status, desired_snapshot, diff
       FROM public.checklist_reconciliation_events
       WHERE tenant_id = $1 AND idempotency_key = $2
       FOR UPDATE`,
      [input.tenantId, input.idempotencyKey.trim()],
    );
    if (replay.rows[0] && !["pending", "processing", "failed"].includes(String(replay.rows[0].status))) {
      const desiredSnapshot = asRecord(replay.rows[0].desired_snapshot);
      return {
        eventId: String(replay.rows[0].id),
        eventStatus: replay.rows[0].status === "pending_review" ? "pending_review" : "applied",
        replayed: true,
        resolution: desiredSnapshot.resolution as ChecklistResolutionResult,
        plan: replay.rows[0].diff as ChecklistReconciliationPlan,
      };
    }
    const effectiveAt = input.effectiveAt ?? new Date();
    const resolutionInput = await loadResolutionInput(client, lifecycle, effectiveAt);
    const initialResolution = resolveChecklistComposition(resolutionInput);
    const existing = await loadExistingChecklists(client, lifecycle);
    const desired = input.applyNewerVersions
      ? initialResolution.instances
      : preserveSnapshotVersions(initialResolution.instances, existing);
    const resolution = { ...initialResolution, instances: desired };
    const started = assignmentChecklistMutationIsLocked(lifecycle);
    const plan = planChecklistReconciliation({ started, desired, existing });
    const eventStatus = plan.requiresReview ? "pending_review" : "applied";
    const eventResult = replay.rows[0]
      ? await client.query(
          `UPDATE public.checklist_reconciliation_events SET
             trigger = $3, context_fingerprint = $4, context_snapshot = $5::jsonb,
             desired_snapshot = $6::jsonb, diff = $7::jsonb, status = $8::varchar(30),
             actor_user_id = COALESCE($9, actor_user_id), review_reason = $10,
             last_error_code = NULL, processed_at = CASE WHEN $8::text='applied' THEN now() ELSE NULL END,
             processing_started_at = NULL, updated_at = now()
           WHERE tenant_id = $1 AND id = $2 RETURNING id`,
          [
            input.tenantId,
            replay.rows[0].id,
            input.trigger,
            resolution.contextFingerprint,
            JSON.stringify(resolutionInput.context),
            JSON.stringify({ resolution }),
            JSON.stringify(plan),
            eventStatus,
            input.actorUserId ?? null,
            plan.requiresReview ? "Werkbon is gestart; samenstelling mag alleen na bevoegde beoordeling wijzigen." : null,
          ],
        )
      : await client.query(
          `INSERT INTO public.checklist_reconciliation_events(
         tenant_id, assignment_id, trigger, idempotency_key, context_fingerprint,
         context_snapshot, desired_snapshot, diff, status, actor_user_id,
         review_reason, processed_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::varchar(30),$10,$11,CASE WHEN $9::text='applied' THEN now() ELSE NULL END)
           RETURNING id`,
          [
            input.tenantId,
            input.assignmentId,
            input.trigger,
            input.idempotencyKey.trim(),
            resolution.contextFingerprint,
            JSON.stringify(resolutionInput.context),
            JSON.stringify({ resolution }),
            JSON.stringify(plan),
            eventStatus,
            input.actorUserId ?? null,
            plan.requiresReview ? "Werkbon is gestart; samenstelling mag alleen na bevoegde beoordeling wijzigen." : null,
          ],
        );
    const eventId = String(eventResult.rows[0].id);
    if (!started) await applyPlan(client, lifecycle, plan, input.actorUserId ?? null);
    await persistWarnings(client, input.tenantId, eventId, resolution);
    await insertAudit(client, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId ?? null,
      action: plan.requiresReview ? "checklist_reconciliation_review_required" : "checklist_reconciliation_applied",
      assignmentId: input.assignmentId,
      eventId,
      plan,
      observability: {
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        examinedBindings: resolution.examinedBindings,
        warningCount: resolution.warnings.length,
      },
    });
    return { eventId, eventStatus, replayed: false, resolution, plan };
  });
}

/**
 * Reconcile immediately after a committed product mutation. If an infrastructure
 * failure prevents that, persist the exact assignment/key as bounded retry work.
 * Product mutations therefore never leave an invisible, unrecoverable checklist gap.
 */
export async function reconcileAssignmentChecklistsRecoverably(input: {
  tenantId: string;
  assignmentId: string;
  trigger: ChecklistReconciliationTrigger;
  idempotencyKey: string;
  actorUserId?: string | null;
  applyNewerVersions?: boolean;
}): Promise<{ status: "applied" | "pending_review" | "queued"; eventId: string | null }> {
  try {
    const result = await reconcileAssignmentChecklists(input);
    return { status: result.eventStatus, eventId: result.eventId };
  } catch (error) {
    const queued = await pool.query(
      `INSERT INTO public.checklist_reconciliation_events(
         tenant_id, assignment_id, trigger, idempotency_key, context_fingerprint,
         context_snapshot, desired_snapshot, diff, status, actor_user_id, last_error_code
       ) VALUES ($1,$2,$3,$4,'pending',jsonb_build_object('queuedReason',$4),'{}'::jsonb,'{}'::jsonb,'pending',$5,$6)
       ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET
         status = CASE
           WHEN checklist_reconciliation_events.status IN ('applied','pending_review','dismissed')
             THEN checklist_reconciliation_events.status
           ELSE 'pending'
         END,
         last_error_code = EXCLUDED.last_error_code,
         updated_at = now()
       RETURNING id`,
      [
        input.tenantId,
        input.assignmentId,
        input.trigger,
        input.idempotencyKey.trim(),
        input.actorUserId ?? null,
        error instanceof Error ? error.name.slice(0, 100) : "unknown_error",
      ],
    );
    return { status: "queued", eventId: queued.rows[0]?.id ? String(queued.rows[0].id) : null };
  }
}

export async function finalizeAssignmentChecklists(input: {
  tenantId: string;
  assignmentId: string;
  actorUserId: string;
  outcome: "completed" | "cancelled";
}): Promise<number> {
  return inTransaction(async (client) => {
    await lockAssignment(client, input.tenantId, input.assignmentId);
    const result = await client.query(
      `UPDATE public.assignment_checklists
       SET status = $4,
           completed_at = CASE WHEN $4 = 'completed' THEN COALESCE(completed_at, now()) ELSE NULL END,
           cancelled_at = CASE WHEN $4 = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE NULL END,
           updated_by = $3,
           updated_at = now()
       WHERE tenant_id = $1 AND assignment_id = $2
         AND status IN ('active', 'detached_pending_review')`,
      [input.tenantId, input.assignmentId, input.actorUserId, input.outcome],
    );
    await client.query(
      `INSERT INTO public.audit_log(tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1,$2,$3,'assignment_checklists',$4,$5::jsonb)`,
      [
        input.tenantId,
        input.actorUserId,
        `assignment_checklists_${input.outcome}`,
        input.assignmentId,
        JSON.stringify({ outcome: input.outcome, snapshots: result.rowCount ?? 0 }),
      ],
    );
    return result.rowCount ?? 0;
  });
}

export async function enqueueTenantChecklistReconciliation(input: {
  tenantId: string;
  reasonKey: string;
  trigger: "binding_changed" | "template_published" | "retry";
  actorUserId?: string | null;
}): Promise<number> {
  if (!input.reasonKey.trim()) throw new Error("Checklist reconciliation queue requires a reason key.");
  const result = await pool.query(
    `INSERT INTO public.checklist_reconciliation_events(
       tenant_id, assignment_id, trigger, idempotency_key, context_fingerprint,
       context_snapshot, desired_snapshot, diff, status, actor_user_id
     )
     SELECT assignment.tenant_id, assignment.id, $2,
            concat('quality:', $3, ':', assignment.id::text), 'pending',
            jsonb_build_object('queuedReason', $3), '{}'::jsonb, '{}'::jsonb,
            'pending', $4
     FROM public.assignments assignment
     WHERE assignment.tenant_id = $1
       AND assignment.status NOT IN ('completed', 'report_submitted', 'report_approved', 'invoice_ready', 'invoiced', 'paid', 'closed', 'cancelled')
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
    [input.tenantId, input.trigger, input.reasonKey.trim(), input.actorUserId ?? null],
  );
  return result.rowCount ?? 0;
}

export async function processPendingChecklistReconciliations(input: {
  tenantId: string;
  limit?: number;
}): Promise<{ processed: number; failed: number }> {
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const pending = await pool.query(
    `SELECT assignment_id, trigger, idempotency_key, actor_user_id
     FROM public.checklist_reconciliation_events
     WHERE tenant_id = $1 AND status IN ('pending', 'failed')
     ORDER BY created_at, id
     LIMIT $2`,
    [input.tenantId, limit],
  );
  let processed = 0;
  let failed = 0;
  for (const row of pending.rows) {
    try {
      await reconcileAssignmentChecklists({
        tenantId: input.tenantId,
        assignmentId: String(row.assignment_id),
        trigger: row.trigger,
        idempotencyKey: String(row.idempotency_key),
        actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      await pool.query(
        `UPDATE public.checklist_reconciliation_events SET
           status = 'failed', retry_count = retry_count + 1,
           last_error_code = $3, processing_started_at = NULL, updated_at = now()
         WHERE tenant_id = $1 AND idempotency_key = $2`,
        [input.tenantId, String(row.idempotency_key), error instanceof Error ? error.name.slice(0, 100) : "unknown_error"],
      );
    }
  }
  return { processed, failed };
}

export async function decideChecklistReconciliation(input: {
  tenantId: string;
  eventId: string;
  actorUserId: string;
  decision: "accept_changes" | "keep_current";
  reason: string;
}): Promise<{ status: "applied" | "dismissed" }> {
  if (!input.reason.trim()) throw new Error("Een reden is verplicht bij een checklistbesluit.");
  return inTransaction(async (client) => {
    const eventResult = await client.query(
      `SELECT id, assignment_id, status, desired_snapshot, diff
       FROM public.checklist_reconciliation_events
       WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [input.eventId, input.tenantId],
    );
    const event = eventResult.rows[0];
    if (!event) throw new Error("Checklistvoorstel is niet gevonden.");
    if (event.status !== "pending_review") throw new Error("Checklistvoorstel is al behandeld.");
    const lifecycle = await lockAssignment(client, input.tenantId, String(event.assignment_id));
    const plan = event.diff as ChecklistReconciliationPlan;
    if (input.decision === "accept_changes") {
      await client.query("SELECT set_config('fieldgrid.allow_checklist_review_decision', 'on', true)");
      const directPlan: ChecklistReconciliationPlan = {
        ...plan,
        changes: plan.changes
          .filter((change) => change.kind === "review_create" || change.kind === "review_update")
          .map((change) => ({
            ...change,
            kind: change.kind === "review_create" ? "create" as const : "update" as const,
          })),
        requiresReview: false,
      };
      await applyPlan(client, lifecycle, directPlan, input.actorUserId);
      for (const change of plan.changes.filter((item) => item.kind === "review_detach" && item.existingId)) {
        const checklistResult = await client.query(
          `SELECT checklist.id, checklist.template_version_id, checklist.effective_rules,
                  template.is_protected, template.is_waivable,
                  COALESCE(jsonb_agg(source.source_snapshot) FILTER (WHERE source.id IS NOT NULL), '[]'::jsonb) AS sources
           FROM public.assignment_checklists checklist
           JOIN public.checklist_templates template ON template.id = checklist.template_id AND template.tenant_id = checklist.tenant_id
           LEFT JOIN public.assignment_checklist_sources source ON source.assignment_checklist_id = checklist.id AND source.tenant_id = checklist.tenant_id
           WHERE checklist.id = $1 AND checklist.tenant_id = $2
           GROUP BY checklist.id, template.is_protected, template.is_waivable`,
          [change.existingId, input.tenantId],
        );
        const checklist = checklistResult.rows[0];
        const required = Boolean(asRecord(checklist?.effective_rules).required);
        if (!checklist || checklist.is_protected || (required && !checklist.is_waivable)) {
          throw new Error("Deze beschermde of niet-vrijstelbare checklist kan niet buiten toepassing worden gezet.");
        }
        await client.query(
          `UPDATE public.assignment_checklists SET status = 'not_applicable', updated_by = $3, updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [change.existingId, input.tenantId, input.actorUserId],
        );
        await client.query(
          `INSERT INTO public.checklist_waivers(
             tenant_id, assignment_checklist_id, kind, reason, original_sources,
             template_version_id, actor_user_id
           ) VALUES ($1,$2,'not_applicable',$3,$4::jsonb,$5,$6)`,
          [input.tenantId, change.existingId, input.reason.trim(), JSON.stringify(checklist.sources), checklist.template_version_id, input.actorUserId],
        );
      }
    }
    const status = input.decision === "accept_changes" ? "applied" : "dismissed";
    await client.query(
      `UPDATE public.checklist_reconciliation_events SET
         status = $3, decision = $4, decision_reason = $5,
         decided_by = $6, decided_at = now(), processed_at = now(), updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [input.eventId, input.tenantId, status, input.decision, input.reason.trim(), input.actorUserId],
    );
    await insertAudit(client, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.decision === "accept_changes" ? "checklist_reconciliation_accepted" : "checklist_reconciliation_kept_current",
      assignmentId: String(event.assignment_id),
      eventId: input.eventId,
      plan,
    });
    return { status };
  });
}

export async function waiveAssignmentChecklist(input: {
  tenantId: string;
  assignmentId: string;
  assignmentChecklistId: string;
  actorUserId: string;
  reason: string;
  kind: "waived" | "not_applicable";
}): Promise<void> {
  if (!input.reason.trim()) throw new Error("Een reden is verplicht voor een vrijstelling.");
  await inTransaction(async (client) => {
    await lockAssignment(client, input.tenantId, input.assignmentId);
    await client.query("SELECT set_config('fieldgrid.allow_checklist_review_decision', 'on', true)");
    const result = await client.query(
      `SELECT checklist.id, checklist.template_version_id, checklist.effective_rules,
              template.is_protected, template.is_waivable,
              COALESCE(jsonb_agg(source.source_snapshot) FILTER (WHERE source.id IS NOT NULL), '[]'::jsonb) AS sources
       FROM public.assignment_checklists checklist
       JOIN public.checklist_templates template ON template.id = checklist.template_id AND template.tenant_id = checklist.tenant_id
       LEFT JOIN public.assignment_checklist_sources source ON source.assignment_checklist_id = checklist.id AND source.tenant_id = checklist.tenant_id
       WHERE checklist.id = $1 AND checklist.tenant_id = $2 AND checklist.assignment_id = $3
       GROUP BY checklist.id, template.is_protected, template.is_waivable`,
      [input.assignmentChecklistId, input.tenantId, input.assignmentId],
    );
    const checklist = result.rows[0];
    const required = Boolean(asRecord(checklist?.effective_rules).required);
    if (!checklist || checklist.is_protected || (input.kind === "waived" && !checklist.is_waivable) || (input.kind === "not_applicable" && required && !checklist.is_waivable)) {
      throw new Error("Deze beschermde of niet-vrijstelbare checklist kan niet worden vrijgesteld.");
    }
    await client.query(
      `UPDATE public.assignment_checklists SET status = $4, updated_by = $5, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND assignment_id = $3`,
      [input.assignmentChecklistId, input.tenantId, input.assignmentId, input.kind, input.actorUserId],
    );
    await client.query(
      `INSERT INTO public.checklist_waivers(
         tenant_id, assignment_checklist_id, kind, reason, original_sources,
         template_version_id, actor_user_id
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [input.tenantId, input.assignmentChecklistId, input.kind, input.reason.trim(), JSON.stringify(checklist.sources), checklist.template_version_id, input.actorUserId],
    );
    await client.query(
      `INSERT INTO public.audit_log(tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1,$2,$3,'assignment_checklists',$4,$5::jsonb)`,
      [input.tenantId, input.actorUserId, `checklist_${input.kind}`, input.assignmentChecklistId, JSON.stringify({ assignmentId: input.assignmentId, reason: input.reason.trim() })],
    );
  });
}

export async function previewAssignmentChecklistResolution(input: {
  tenantId: string;
  assignmentId: string;
  effectiveAt?: Date;
}): Promise<{ resolution: ChecklistResolutionResult; plan: ChecklistReconciliationPlan }> {
  return inTransaction(async (client) => {
    const lifecycle = await lockAssignment(client, input.tenantId, input.assignmentId);
    const resolutionInput = await loadResolutionInput(client, lifecycle, input.effectiveAt ?? new Date());
    const resolution = resolveChecklistComposition(resolutionInput);
    const existing = await loadExistingChecklists(client, lifecycle);
    const plan = planChecklistReconciliation({
      started: assignmentChecklistMutationIsLocked(lifecycle),
      desired: resolution.instances,
      existing,
    });
    return { resolution, plan };
  });
}

export async function prepareAssignmentChecklistsForStart(input: {
  tenantId: string;
  assignmentId: string;
  actorUserId: string;
  idempotencyKey: string;
}): Promise<AssignmentChecklistReconciliationResult> {
  const result = await reconcileAssignmentChecklists({ ...input, trigger: "before_start" });
  if (result.eventStatus === "pending_review") throw new Error("Checklistwijzigingen wachten op beoordeling; starten is geblokkeerd.");
  const issues = await getAssignmentChecklistCompletionIssues({
    tenantId: input.tenantId,
    assignmentId: input.assignmentId,
    blockingMoment: "before_start",
  });
  if (issues.length > 0) {
    throw new Error(issues.slice(0, 3).map((issue) => issue.message).join(" "));
  }
  return result;
}

export async function getAssignmentChecklistCompletionIssues(input: {
  tenantId: string;
  assignmentId: string;
  blockingMoment?: ChecklistBlockingMoment;
  blockingMoments?: ChecklistBlockingMoment[];
}): Promise<ChecklistCompletionIssue[]> {
  const [checklistResult, answerResult, evidenceResult] = await Promise.all([
    pool.query(
      `SELECT id, status, template_snapshot, effective_rules
       FROM public.assignment_checklists
       WHERE tenant_id = $1 AND assignment_id = $2 AND status <> 'cancelled'
       ORDER BY display_order, id`,
      [input.tenantId, input.assignmentId],
    ),
    pool.query(
      `SELECT answer.assignment_checklist_id, answer.snapshot_item_id, answer.value,
              answer.is_deviation, answer.deviation_note
       FROM public.assignment_checklist_answers answer
       JOIN public.assignment_checklists checklist
         ON checklist.id = answer.assignment_checklist_id AND checklist.tenant_id = answer.tenant_id
       WHERE answer.tenant_id = $1 AND checklist.assignment_id = $2`,
      [input.tenantId, input.assignmentId],
    ),
    pool.query(
      `SELECT evidence.assignment_checklist_id, evidence.snapshot_item_id, evidence.kind
       FROM public.assignment_checklist_evidence evidence
       JOIN public.assignment_checklists checklist
         ON checklist.id = evidence.assignment_checklist_id AND checklist.tenant_id = evidence.tenant_id
       WHERE evidence.tenant_id = $1 AND checklist.assignment_id = $2`,
      [input.tenantId, input.assignmentId],
    ),
  ]);
  const checklists: ChecklistCompletionSnapshot[] = checklistResult.rows.map((row) => ({
    id: String(row.id),
    status: row.status,
    displayName: String(asRecord(row.effective_rules).displayName ?? "Checklist"),
    templateSnapshot: row.template_snapshot as ChecklistTemplateSnapshot,
    effectiveRules: row.effective_rules as EffectiveChecklistRules,
  }));
  return validateAssignmentChecklistCompletion({
    checklists,
    answers: answerResult.rows.map((row) => ({
      assignmentChecklistId: String(row.assignment_checklist_id),
      snapshotItemId: String(row.snapshot_item_id),
      value: row.value,
      isDeviation: Boolean(row.is_deviation),
      deviationNote: row.deviation_note ? String(row.deviation_note) : null,
    })),
    evidence: evidenceResult.rows.map((row) => ({
      assignmentChecklistId: String(row.assignment_checklist_id),
      snapshotItemId: String(row.snapshot_item_id),
      kind: row.kind,
    })),
    blockingMoment: input.blockingMoment,
    blockingMoments: input.blockingMoments,
  });
}

export async function saveAssignmentChecklistAnswer(input: {
  tenantId: string;
  assignmentId: string;
  assignmentChecklistId: string;
  snapshotItemId: string;
  value: unknown;
  isDeviation?: boolean;
  deviationNote?: string | null;
  actorUserId: string;
  expectedRevision: number | null;
  operationKey: string;
}): Promise<{ id: string; revision: number; replayed: boolean }> {
  if (!input.operationKey.trim()) throw new Error("Checklist answer requires an operation key.");
  return inTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`checklist-answer:${input.tenantId}:${input.assignmentChecklistId}:${input.snapshotItemId}`]);
    const replay = await client.query(
      `SELECT id, revision FROM public.assignment_checklist_answers
       WHERE tenant_id = $1 AND last_operation_key = $2`,
      [input.tenantId, input.operationKey.trim()],
    );
    if (replay.rows[0]) return { id: String(replay.rows[0].id), revision: Number(replay.rows[0].revision), replayed: true };
    const checklistResult = await client.query(
      `SELECT checklist.id, checklist.status, checklist.template_snapshot
       FROM public.assignment_checklists checklist
       WHERE checklist.id = $1 AND checklist.tenant_id = $2 AND checklist.assignment_id = $3
       FOR UPDATE`,
      [input.assignmentChecklistId, input.tenantId, input.assignmentId],
    );
    const checklist = checklistResult.rows[0];
    if (!checklist || checklist.status !== "active") throw new Error("Checklist is niet beschikbaar voor invoer.");
    const snapshot = checklist.template_snapshot as ChecklistTemplateSnapshot;
    const itemExists = snapshot.sections.some((section) => section.items.some((item) => item.id === input.snapshotItemId));
    if (!itemExists) throw new Error("Checklistitem bestaat niet in de vastgelegde versie.");
    const existing = await client.query(
      `SELECT id, revision FROM public.assignment_checklist_answers
       WHERE tenant_id = $1 AND assignment_checklist_id = $2 AND snapshot_item_id = $3
       FOR UPDATE`,
      [input.tenantId, input.assignmentChecklistId, input.snapshotItemId],
    );
    if (!existing.rows[0]) {
      if (input.expectedRevision !== null && input.expectedRevision !== 0) throw new Error("Checklistantwoord is op een ander apparaat gewijzigd.");
      const inserted = await client.query(
        `INSERT INTO public.assignment_checklist_answers(
           tenant_id, assignment_checklist_id, snapshot_item_id, value,
           is_deviation, deviation_note, revision, last_operation_key, answered_by
         ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,1,$7,$8) RETURNING id, revision`,
        [input.tenantId, input.assignmentChecklistId, input.snapshotItemId, JSON.stringify(input.value ?? null), Boolean(input.isDeviation), input.deviationNote?.trim() || null, input.operationKey.trim(), input.actorUserId],
      );
      return { id: String(inserted.rows[0].id), revision: 1, replayed: false };
    }
    const currentRevision = Number(existing.rows[0].revision);
    if (input.expectedRevision === null || input.expectedRevision !== currentRevision) throw new Error("Checklistantwoord is op een ander apparaat gewijzigd; vernieuw voor je opnieuw opslaat.");
    const updated = await client.query(
      `UPDATE public.assignment_checklist_answers SET
         value = $4::jsonb, is_deviation = $5, deviation_note = $6,
         revision = revision + 1, last_operation_key = $7,
         answered_by = $8, answered_at = now(), updated_at = now()
       WHERE tenant_id = $1 AND assignment_checklist_id = $2
         AND snapshot_item_id = $3 AND revision = $9
       RETURNING id, revision`,
      [input.tenantId, input.assignmentChecklistId, input.snapshotItemId, JSON.stringify(input.value ?? null), Boolean(input.isDeviation), input.deviationNote?.trim() || null, input.operationKey.trim(), input.actorUserId, currentRevision],
    );
    if (!updated.rows[0]) throw new Error("Checklistantwoord is op een ander apparaat gewijzigd; vernieuw voor je opnieuw opslaat.");
    return { id: String(updated.rows[0].id), revision: Number(updated.rows[0].revision), replayed: false };
  });
}

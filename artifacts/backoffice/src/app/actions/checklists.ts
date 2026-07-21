"use server";

import { randomUUID } from "node:crypto";

import {
  CHECKLIST_CARDINALITIES,
  CHECKLIST_COMPOSITION_MODES,
  auditLogTable,
  checklistBindingsTable,
  checklistFingerprint,
  checklistTemplateVersionsTable,
  checklistTemplatesTable,
  db,
  decideChecklistReconciliation,
  enqueueTenantChecklistReconciliation,
  pool,
  previewAssignmentChecklistResolution,
  reconcileAssignmentChecklists,
  processPendingChecklistReconciliations,
  validateChecklistBinding,
  waiveAssignmentChecklist,
  type ChecklistCardinality,
  type ChecklistCompositionMode,
  type ChecklistTemplateSnapshot,
} from "@workspace/db";
import { and, desc, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";

export type ChecklistActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export type ChecklistManagementData = {
  templates: Array<{
    id: string;
    familyKey: string;
    name: string;
    description: string | null;
    cardinality: ChecklistCardinality;
    protected: boolean;
    waivable: boolean;
    status: string;
    bindingCount: number;
    versions: Array<{
      id: string;
      versionNumber: number;
      status: string;
      schema: ChecklistTemplateSnapshot;
      changeSummary: string | null;
      publishedAt: string | null;
      createdAt: string;
    }>;
  }>;
  bindings: Array<{
    id: string;
    templateId: string | null;
    templateName: string | null;
    mode: ChecklistCompositionMode;
    status: string;
    sourceLabel: string;
    required: boolean;
    autoAttach: boolean;
    targetLabel: string | null;
    reason: string | null;
  }>;
  pendingReviews: Array<{
    id: string;
    assignmentId: string;
    assignmentCode: string;
    assignmentTitle: string;
    trigger: string;
    reviewReason: string | null;
    diff: Record<string, unknown>;
    createdAt: string;
  }>;
  assignmentChecklists: Array<{
    id: string;
    assignmentId: string;
    assignmentCode: string;
    assignmentTitle: string;
    displayName: string;
    status: string;
    versionNumber: number;
    protected: boolean;
    waivable: boolean;
    required: boolean;
    responseCount: number;
    evidenceCount: number;
  }>;
  warnings: Array<{ id: string; code: string; message: string; createdAt: string }>;
  options: {
    sectors: Array<{ id: string; label: string }>;
    customers: Array<{ id: string; label: string }>;
    objects: Array<{ id: string; label: string; objectType: string | null }>;
    taskCodes: Array<{ id: string; label: string }>;
    assignments: Array<{ id: string; label: string }>;
  };
};

const ITEM_TYPES = new Set([
  "checkbox",
  "short_text",
  "long_text",
  "single_choice",
  "multiple_choice",
  "number",
  "measurement",
  "date",
  "datetime",
  "photo",
  "multi_photo",
  "signature",
  "information",
]);

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (/duplicate key|unique constraint/iu.test(error.message)) return "Deze sleutel of configuratie bestaat al.";
    return error.message;
  }
  return "Onbekende fout bij checklistbeheer.";
}

function normalizeFamilyKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, "-").replace(/[^a-z0-9._-]/gu, "");
}

function validateSnapshot(snapshot: ChecklistTemplateSnapshot): string[] {
  const errors: string[] = [];
  if (!snapshot || !Array.isArray(snapshot.sections) || snapshot.sections.length === 0) {
    return ["Voeg minimaal één sectie toe."];
  }
  const ids = new Set<string>();
  const itemsById = new Map<string, ChecklistTemplateSnapshot["sections"][number]["items"][number]>();
  for (const section of snapshot.sections) {
    if (!section.id?.trim() || ids.has(section.id)) errors.push("Iedere sectie heeft een unieke stabiele ID nodig.");
    ids.add(section.id);
    if (!section.title?.trim()) errors.push("Iedere sectie heeft een titel nodig.");
    if (!Number.isInteger(section.sortOrder)) errors.push(`Sectie ${section.title || section.id} heeft een ongeldige sortering.`);
    if (!Array.isArray(section.items)) errors.push(`Sectie ${section.title || section.id} heeft geen geldige itemlijst.`);
    for (const item of section.items ?? []) {
      if (!item.id?.trim() || ids.has(item.id)) errors.push("Iedere vraag heeft een unieke stabiele ID nodig.");
      ids.add(item.id);
      if (!ITEM_TYPES.has(item.type)) errors.push(`Onbekend veldtype bij ${item.label || item.id}.`);
      if (!item.label?.trim()) errors.push("Iedere vraag heeft een label nodig.");
      if (!Number.isInteger(item.sortOrder)) errors.push(`Vraag ${item.label || item.id} heeft een ongeldige sortering.`);
      itemsById.set(item.id, item);
      if (["single_choice", "multiple_choice"].includes(item.type)) {
        const options = item.validation?.options;
        if (!Array.isArray(options) || options.length < 2) errors.push(`${item.label} heeft minimaal twee keuzes nodig.`);
      }
      const minimum = item.validation?.min;
      const maximum = item.validation?.max;
      if (typeof minimum === "number" && typeof maximum === "number" && minimum > maximum) errors.push(`${item.label}: minimum mag niet hoger zijn dan maximum.`);
      const minimumPhotos = item.evidence?.minimumPhotos;
      if (minimumPhotos !== undefined && (typeof minimumPhotos !== "number" || !Number.isInteger(minimumPhotos) || minimumPhotos < 0)) errors.push(`${item.label}: minimumaantal foto’s moet een niet-negatief geheel getal zijn.`);
    }
  }
  for (const item of itemsById.values()) {
    const rule = item.visibleWhen;
    if (!rule) continue;
    const dependencyId = typeof rule.itemId === "string" ? rule.itemId : "";
    if (!dependencyId || dependencyId === item.id || !itemsById.has(dependencyId)) errors.push(`${item.label}: conditionele bronvraag is ongeldig.`);
    if (!["equals", "not_equals", "answered", "not_answered", "in", "not_in"].includes(String(rule.operator))) errors.push(`${item.label}: conditionele operator is ongeldig.`);
  }
  return [...new Set(errors)];
}

async function checklistIdentity(action: "read" | "write" | "publish" | "review") {
  await requirePermission("checklists", action);
  const [tenantId, supabase] = await Promise.all([requireCurrentTenantId(), createClient()]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Niet ingelogd.");
  return { tenantId, userId: user.id };
}

function refreshChecklistPaths() {
  revalidatePath("/settings/checklists");
  revalidatePath("/settings");
  revalidatePath("/assignments");
}

export async function getChecklistManagementData(): Promise<ChecklistManagementData> {
  const { tenantId } = await checklistIdentity("read");
  const [templates, bindings, reviews, assignmentChecklists, warnings, sectors, customers, objects, taskCodes, assignments] = await Promise.all([
    pool.query(
      `SELECT template.*,
              count(DISTINCT binding.id)::integer AS binding_count,
              COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                'id', version.id,
                'versionNumber', version.version_number,
                'status', version.status,
                'schema', version.schema,
                'changeSummary', version.change_summary,
                'publishedAt', version.published_at,
                'createdAt', version.created_at
              )) FILTER (WHERE version.id IS NOT NULL), '[]'::jsonb) AS versions
       FROM public.checklist_templates template
       LEFT JOIN public.checklist_template_versions version ON version.template_id = template.id AND version.tenant_id = template.tenant_id
       LEFT JOIN public.checklist_bindings binding ON binding.template_id = template.id AND binding.tenant_id = template.tenant_id AND binding.status <> 'archived'
       WHERE template.tenant_id = $1
       GROUP BY template.id
       ORDER BY template.status, template.name`,
      [tenantId],
    ),
    pool.query(
      `SELECT binding.*, template.name AS template_name,
              target.name AS target_name,
              sector.name AS sector_name, customer.name AS customer_name,
              object.name AS object_name,
              COALESCE(tenant_code.name, task_code.name) AS task_code_name,
              assignment.code AS assignment_code
       FROM public.checklist_bindings binding
       LEFT JOIN public.checklist_templates template ON template.id = binding.template_id AND template.tenant_id = binding.tenant_id
       LEFT JOIN public.checklist_templates target ON target.id = binding.target_template_id AND target.tenant_id = binding.tenant_id
       LEFT JOIN public.sectors sector ON sector.id = binding.sector_id
       LEFT JOIN public.customers customer ON customer.id = binding.customer_id AND customer.tenant_id = binding.tenant_id
       LEFT JOIN public.objects object ON object.id = binding.object_id AND object.tenant_id = binding.tenant_id
       LEFT JOIN public.task_codes task_code ON task_code.id = binding.task_code_id AND task_code.tenant_id = binding.tenant_id
       LEFT JOIN public.tenant_task_codes tenant_code ON tenant_code.id = binding.tenant_task_code_id AND tenant_code.tenant_id = binding.tenant_id
       LEFT JOIN public.assignments assignment ON assignment.id = binding.assignment_id AND assignment.tenant_id = binding.tenant_id
       WHERE binding.tenant_id = $1
       ORDER BY binding.status, binding.sort_order, binding.created_at`,
      [tenantId],
    ),
    pool.query(
      `SELECT event.id, event.assignment_id, event.trigger, event.review_reason,
              event.diff, event.created_at, assignment.code, assignment.title
       FROM public.checklist_reconciliation_events event
       JOIN public.assignments assignment ON assignment.id = event.assignment_id AND assignment.tenant_id = event.tenant_id
       WHERE event.tenant_id = $1 AND event.status = 'pending_review'
       ORDER BY event.created_at`,
      [tenantId],
    ),
    pool.query(
      `SELECT checklist.id, checklist.assignment_id, checklist.status,
              checklist.effective_rules, checklist.response_count,
              assignment.code, assignment.title,
              version.version_number,
              template.is_protected, template.is_waivable,
              COALESCE(evidence.count, 0)::integer AS evidence_count
       FROM public.assignment_checklists checklist
       JOIN public.assignments assignment
         ON assignment.id = checklist.assignment_id AND assignment.tenant_id = checklist.tenant_id
       JOIN public.checklist_templates template
         ON template.id = checklist.template_id AND template.tenant_id = checklist.tenant_id
       JOIN public.checklist_template_versions version
         ON version.id = checklist.template_version_id AND version.tenant_id = checklist.tenant_id
       LEFT JOIN LATERAL (
         SELECT count(*) FROM public.assignment_checklist_evidence item
         WHERE item.tenant_id = checklist.tenant_id AND item.assignment_checklist_id = checklist.id
       ) evidence ON true
       WHERE checklist.tenant_id = $1
       ORDER BY assignment.updated_at DESC, checklist.display_order, checklist.id
       LIMIT 500`,
      [tenantId],
    ),
    pool.query(
      `SELECT id, code, message, created_at FROM public.checklist_configuration_warnings
       WHERE tenant_id = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 50`,
      [tenantId],
    ),
    pool.query(`SELECT id, name FROM public.sectors WHERE is_active ORDER BY name`),
    pool.query(`SELECT id, name FROM public.customers WHERE tenant_id = $1 AND is_active ORDER BY name LIMIT 500`, [tenantId]),
    pool.query(`SELECT id, name, service_type FROM public.objects WHERE tenant_id = $1 AND is_active ORDER BY name LIMIT 500`, [tenantId]),
    pool.query(`SELECT id, concat(code, ' · ', name) AS label FROM public.task_codes WHERE tenant_id = $1 AND is_active ORDER BY code LIMIT 500`, [tenantId]),
    pool.query(`SELECT id, concat(code, ' · ', title) AS label FROM public.assignments WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 500`, [tenantId]),
  ]);
  return {
    templates: templates.rows.map((row) => {
      const versions: ChecklistManagementData["templates"][number]["versions"] = (Array.isArray(row.versions) ? row.versions : [])
        .map((version: Record<string, unknown>) => ({
          id: String(version.id), versionNumber: Number(version.versionNumber), status: String(version.status),
          schema: version.schema as ChecklistTemplateSnapshot,
          changeSummary: version.changeSummary ? String(version.changeSummary) : null,
          publishedAt: version.publishedAt ? new Date(version.publishedAt as string).toISOString() : null,
          createdAt: new Date(version.createdAt as string).toISOString(),
        }))
        .sort((left: ChecklistManagementData["templates"][number]["versions"][number], right: ChecklistManagementData["templates"][number]["versions"][number]) => right.versionNumber - left.versionNumber);
      return {
        id: String(row.id), familyKey: String(row.family_key), name: String(row.name),
        description: row.description ? String(row.description) : null,
        cardinality: row.cardinality, protected: Boolean(row.is_protected), waivable: Boolean(row.is_waivable),
        status: String(row.status), bindingCount: Number(row.binding_count), versions,
      };
    }),
    bindings: bindings.rows.map((row) => {
      const labels = [
        row.assignment_code ? `Werkbon ${row.assignment_code}` : null,
        row.object_name ? `Object ${row.object_name}` : null,
        row.task_code_name ? `Taakcode ${row.task_code_name}` : null,
        row.customer_name ? `Klant ${row.customer_name}` : null,
        row.object_type ? `Objecttype ${row.object_type}` : null,
        row.sector_name ? `Sector ${row.sector_name}` : null,
      ].filter(Boolean);
      return {
        id: String(row.id), templateId: row.template_id ? String(row.template_id) : null,
        templateName: row.template_name ? String(row.template_name) : null,
        mode: row.mode, status: String(row.status), sourceLabel: labels.join(" + ") || "Tenantstandaard",
        required: Boolean(row.required), autoAttach: Boolean(row.auto_attach),
        targetLabel: row.target_name ? String(row.target_name) : row.target_family_key ? `Familie ${row.target_family_key}` : null,
        reason: row.reason ? String(row.reason) : null,
      };
    }),
    pendingReviews: reviews.rows.map((row) => ({
      id: String(row.id), assignmentId: String(row.assignment_id), assignmentCode: String(row.code),
      assignmentTitle: String(row.title), trigger: String(row.trigger),
      reviewReason: row.review_reason ? String(row.review_reason) : null,
      diff: row.diff as Record<string, unknown>, createdAt: new Date(row.created_at).toISOString(),
    })),
    assignmentChecklists: assignmentChecklists.rows.map((row) => ({
      id: String(row.id), assignmentId: String(row.assignment_id), assignmentCode: String(row.code),
      assignmentTitle: String(row.title), displayName: String((row.effective_rules as Record<string, unknown>)?.displayName ?? "Checklist"),
      status: String(row.status), versionNumber: Number(row.version_number), protected: Boolean(row.is_protected),
      waivable: Boolean(row.is_waivable), required: Boolean((row.effective_rules as Record<string, unknown>)?.required),
      responseCount: Number(row.response_count), evidenceCount: Number(row.evidence_count),
    })),
    warnings: warnings.rows.map((row) => ({ id: String(row.id), code: String(row.code), message: String(row.message), createdAt: new Date(row.created_at).toISOString() })),
    options: {
      sectors: sectors.rows.map((row) => ({ id: String(row.id), label: String(row.name) })),
      customers: customers.rows.map((row) => ({ id: String(row.id), label: String(row.name) })),
      objects: objects.rows.map((row) => ({ id: String(row.id), label: String(row.name), objectType: row.service_type ? String(row.service_type) : null })),
      taskCodes: taskCodes.rows.map((row) => ({ id: String(row.id), label: String(row.label) })),
      assignments: assignments.rows.map((row) => ({ id: String(row.id), label: String(row.label) })),
    },
  };
}

export async function createChecklistTemplateAction(input: {
  familyKey: string;
  name: string;
  description?: string | null;
  cardinality: ChecklistCardinality;
  protected: boolean;
  waivable: boolean;
  schema: ChecklistTemplateSnapshot;
}): Promise<ChecklistActionResult<{ templateId: string; versionId: string }>> {
  try {
    const { tenantId, userId } = await checklistIdentity("write");
    const familyKey = normalizeFamilyKey(input.familyKey || input.name);
    if (familyKey.length < 2) throw new Error("Vul een geldige familiesleutel in.");
    if (!input.name.trim()) throw new Error("Naam is verplicht.");
    if (!CHECKLIST_CARDINALITIES.includes(input.cardinality)) throw new Error("Ongeldige cardinaliteit.");
    if (input.protected && input.waivable) throw new Error("Een beschermde checklist kan niet vrijstelbaar zijn.");
    const schemaErrors = validateSnapshot(input.schema);
    if (schemaErrors.length) throw new Error(schemaErrors.join(" "));
    const result = await db.transaction(async (tx) => {
      const [template] = await tx.insert(checklistTemplatesTable).values({
        tenantId, familyKey, name: input.name.trim(), description: input.description?.trim() || null,
        cardinality: input.cardinality, isProtected: input.protected, isWaivable: input.protected ? false : input.waivable,
        createdBy: userId, updatedBy: userId,
      }).returning({ id: checklistTemplatesTable.id });
      const [version] = await tx.insert(checklistTemplateVersionsTable).values({
        tenantId, templateId: template.id, versionNumber: 1, status: "draft",
        schema: input.schema, schemaHash: checklistFingerprint(input.schema), createdBy: userId,
      }).returning({ id: checklistTemplateVersionsTable.id });
      await tx.insert(auditLogTable).values({ tenantId, userId, action: "checklist_template_created", resource: "checklist_templates", resourceId: template.id, metadata: { familyKey, versionId: version.id } });
      return { templateId: template.id, versionId: version.id };
    });
    refreshChecklistPaths();
    return { success: true, data: result };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function saveChecklistDraftAction(input: {
  templateId: string;
  versionId: string;
  schema: ChecklistTemplateSnapshot;
  changeSummary?: string | null;
}): Promise<ChecklistActionResult> {
  try {
    const { tenantId, userId } = await checklistIdentity("write");
    const errors = validateSnapshot(input.schema);
    if (errors.length) throw new Error(errors.join(" "));
    const [updated] = await db.update(checklistTemplateVersionsTable).set({
      schema: input.schema, schemaHash: checklistFingerprint(input.schema), changeSummary: input.changeSummary?.trim() || null,
    }).where(and(
      eq(checklistTemplateVersionsTable.id, input.versionId), eq(checklistTemplateVersionsTable.templateId, input.templateId),
      eq(checklistTemplateVersionsTable.tenantId, tenantId), eq(checklistTemplateVersionsTable.status, "draft"),
    )).returning({ id: checklistTemplateVersionsTable.id });
    if (!updated) throw new Error("Alleen een conceptversie kan worden gewijzigd.");
    await db.insert(auditLogTable).values({ tenantId, userId, action: "checklist_draft_updated", resource: "checklist_template_versions", resourceId: input.versionId, metadata: { templateId: input.templateId, schemaHash: checklistFingerprint(input.schema) } });
    refreshChecklistPaths();
    return { success: true, data: undefined };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function publishChecklistVersionAction(input: { templateId: string; versionId: string }): Promise<ChecklistActionResult> {
  try {
    const { tenantId, userId } = await checklistIdentity("publish");
    const published = await db.transaction(async (tx) => {
      const [version] = await tx.select().from(checklistTemplateVersionsTable).where(and(
        eq(checklistTemplateVersionsTable.id, input.versionId), eq(checklistTemplateVersionsTable.templateId, input.templateId), eq(checklistTemplateVersionsTable.tenantId, tenantId),
      )).limit(1);
      if (!version || version.status !== "draft") throw new Error("Alleen een conceptversie kan worden gepubliceerd.");
      const errors = validateSnapshot(version.schema);
      if (errors.length) throw new Error(errors.join(" "));
      await tx.update(checklistTemplateVersionsTable).set({ status: "published", publishedBy: userId, publishedAt: new Date() }).where(eq(checklistTemplateVersionsTable.id, input.versionId));
      await tx.update(checklistTemplatesTable).set({ status: "published", updatedBy: userId }).where(and(eq(checklistTemplatesTable.id, input.templateId), eq(checklistTemplatesTable.tenantId, tenantId)));
      await tx.insert(auditLogTable).values({ tenantId, userId, action: "checklist_version_published", resource: "checklist_template_versions", resourceId: input.versionId, metadata: { templateId: input.templateId, versionNumber: version.versionNumber, schemaHash: version.schemaHash } });
      return version.versionNumber;
    });
    await enqueueTenantChecklistReconciliation({ tenantId, trigger: "template_published", reasonKey: `template:${input.templateId}:v${published}`, actorUserId: userId });
    await processPendingChecklistReconciliations({ tenantId, limit: 10 });
    refreshChecklistPaths();
    return { success: true, data: undefined };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function duplicateChecklistVersionAction(input: { templateId: string; sourceVersionId: string }): Promise<ChecklistActionResult<{ versionId: string }>> {
  try {
    const { tenantId, userId } = await checklistIdentity("write");
    const result = await db.transaction(async (tx) => {
      const [existingDraft] = await tx.select({ id: checklistTemplateVersionsTable.id }).from(checklistTemplateVersionsTable).where(and(
        eq(checklistTemplateVersionsTable.tenantId, tenantId), eq(checklistTemplateVersionsTable.templateId, input.templateId), eq(checklistTemplateVersionsTable.status, "draft"),
      )).limit(1);
      if (existingDraft) throw new Error("Er bestaat al een conceptversie voor deze template.");
      const [source] = await tx.select().from(checklistTemplateVersionsTable).where(and(eq(checklistTemplateVersionsTable.id, input.sourceVersionId), eq(checklistTemplateVersionsTable.templateId, input.templateId), eq(checklistTemplateVersionsTable.tenantId, tenantId))).limit(1);
      if (!source) throw new Error("Bronversie niet gevonden.");
      const [latest] = await tx.select({ value: max(checklistTemplateVersionsTable.versionNumber) }).from(checklistTemplateVersionsTable).where(and(eq(checklistTemplateVersionsTable.templateId, input.templateId), eq(checklistTemplateVersionsTable.tenantId, tenantId)));
      const [created] = await tx.insert(checklistTemplateVersionsTable).values({ tenantId, templateId: input.templateId, versionNumber: Number(latest?.value ?? 0) + 1, status: "draft", schema: source.schema, schemaHash: source.schemaHash, changeSummary: `Gebaseerd op versie ${source.versionNumber}`, createdBy: userId }).returning({ id: checklistTemplateVersionsTable.id });
      await tx.insert(auditLogTable).values({ tenantId, userId, action: "checklist_version_draft_created", resource: "checklist_template_versions", resourceId: created.id, metadata: { templateId: input.templateId, sourceVersionId: input.sourceVersionId } });
      return { versionId: created.id };
    });
    refreshChecklistPaths();
    return { success: true, data: result };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function archiveChecklistTemplateAction(templateId: string): Promise<ChecklistActionResult> {
  try {
    const { tenantId, userId } = await checklistIdentity("write");
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(checklistTemplatesTable).set({ status: "archived", archivedAt: new Date(), archivedBy: userId, updatedBy: userId }).where(and(eq(checklistTemplatesTable.id, templateId), eq(checklistTemplatesTable.tenantId, tenantId))).returning({ id: checklistTemplatesTable.id });
      if (!updated) throw new Error("Template niet gevonden.");
      await tx.update(checklistBindingsTable).set({ status: "inactive", updatedBy: userId }).where(and(eq(checklistBindingsTable.tenantId, tenantId), eq(checklistBindingsTable.templateId, templateId)));
      await tx.insert(auditLogTable).values({ tenantId, userId, action: "checklist_template_archived", resource: "checklist_templates", resourceId: templateId });
    });
    await enqueueTenantChecklistReconciliation({ tenantId, trigger: "binding_changed", reasonKey: `archive-template:${templateId}`, actorUserId: userId });
    await processPendingChecklistReconciliations({ tenantId, limit: 10 });
    refreshChecklistPaths();
    return { success: true, data: undefined };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function createChecklistBindingAction(input: {
  templateId?: string | null;
  templateVersionId?: string | null;
  versionStrategy: "pinned" | "latest_published";
  mode: ChecklistCompositionMode;
  selectors: { assignmentId?: string | null; sectorId?: string | null; customerId?: string | null; objectType?: string | null; objectId?: string | null; taskCodeId?: string | null };
  targetTemplateId?: string | null;
  targetFamilyKey?: string | null;
  activeFrom?: string | null;
  activeUntil?: string | null;
  autoAttach: boolean;
  required: boolean;
  blockingMoments: string[];
  skipAllowed: boolean;
  minimumPhotos: number;
  signatureRequired: boolean;
  deviationNoteRequired: boolean;
  displayName?: string | null;
  instruction?: string | null;
  instructionMode?: "append" | "replace";
  sortOrder?: number;
  tieBreaker?: number;
  reason?: string | null;
}): Promise<ChecklistActionResult<{ bindingId: string }>> {
  try {
    const { tenantId, userId } = await checklistIdentity("write");
    if (!CHECKLIST_COMPOSITION_MODES.includes(input.mode)) throw new Error("Ongeldige compositiemodus.");
    const activeFrom = input.activeFrom ? new Date(input.activeFrom) : null;
    const activeUntil = input.activeUntil ? new Date(input.activeUntil) : null;
    if (activeFrom && Number.isNaN(activeFrom.getTime())) throw new Error("Actief-vanaf bevat geen geldige datum/tijd.");
    if (activeUntil && Number.isNaN(activeUntil.getTime())) throw new Error("Actief-tot bevat geen geldige datum/tijd.");
    if (activeFrom && activeUntil && activeUntil <= activeFrom) throw new Error("Actief-tot moet na actief-vanaf liggen.");
    if (!Number.isInteger(input.sortOrder ?? 0) || !Number.isInteger(input.tieBreaker ?? 0)) throw new Error("Sortering en tie-breaker moeten gehele getallen zijn.");
    const validation = validateChecklistBinding({
      id: "new", tenantId, template: input.mode === "suppress" ? null : input.templateId ? { templateId: input.templateId } as never : null,
      selectors: input.selectors, mode: input.mode, targetTemplateId: input.targetTemplateId, targetFamilyKey: input.targetFamilyKey,
      activeFrom: input.activeFrom, activeUntil: input.activeUntil, autoAttach: input.autoAttach, required: input.required,
      blockingMoments: input.blockingMoments as never, skipAllowed: input.skipAllowed, personnelCanRemove: false,
      minimumPhotos: input.minimumPhotos, signatureRequired: input.signatureRequired, deviationNoteRequired: input.deviationNoteRequired,
      displayName: input.displayName, instruction: input.instruction, instructionMode: input.instructionMode ?? "append", sortOrder: input.sortOrder ?? 0,
      reason: input.reason, tieBreaker: input.tieBreaker ?? 0, createdAt: new Date().toISOString(),
    });
    if (validation.length) throw new Error(validation.join(" "));
    if (input.versionStrategy === "pinned" && !input.templateVersionId) throw new Error("Kies een gepubliceerde versie voor een vaste koppeling.");
    if (input.mode !== "suppress") {
      const template = await pool.query(
        `SELECT template.id FROM public.checklist_templates template
         WHERE template.id = $1 AND template.tenant_id = $2 AND template.status = 'published'`,
        [input.templateId, tenantId],
      );
      if (!template.rows[0]) throw new Error("Kies een gepubliceerde template binnen de actieve organisatie.");
      if (input.versionStrategy === "pinned") {
        const version = await pool.query(
          `SELECT id FROM public.checklist_template_versions
           WHERE id = $1 AND tenant_id = $2 AND template_id = $3 AND status = 'published'`,
          [input.templateVersionId, tenantId, input.templateId],
        );
        if (!version.rows[0]) throw new Error("De vaste templateversie is niet gepubliceerd binnen deze organisatie.");
      }
    }
    const [created] = await db.insert(checklistBindingsTable).values({
      tenantId, templateId: input.templateId || null, templateVersionId: input.versionStrategy === "pinned" ? input.templateVersionId || null : null,
      versionStrategy: input.versionStrategy, mode: input.mode,
      assignmentId: input.selectors.assignmentId || null, sectorId: input.selectors.sectorId || null,
      customerId: input.selectors.customerId || null, objectType: input.selectors.objectType?.trim() || null,
      objectId: input.selectors.objectId || null, taskCodeId: input.selectors.taskCodeId || null,
      targetTemplateId: input.targetTemplateId || null, targetFamilyKey: input.targetFamilyKey?.trim() || null,
      activeFrom, activeUntil,
      autoAttach: input.mode === "available" ? false : input.autoAttach, required: input.required,
      blockingMoments: input.blockingMoments as never, skipAllowed: input.skipAllowed, personnelCanRemove: false,
      minimumPhotos: Math.max(0, Math.floor(input.minimumPhotos)), signatureRequired: input.signatureRequired,
      deviationNoteRequired: input.deviationNoteRequired, displayName: input.displayName?.trim() || null,
      instruction: input.instruction?.trim() || null, instructionMode: input.instructionMode ?? "append",
      sortOrder: input.sortOrder ?? 0, tieBreaker: input.tieBreaker ?? 0, reason: input.reason?.trim() || null,
      createdBy: userId, updatedBy: userId,
    }).returning({ id: checklistBindingsTable.id });
    await db.insert(auditLogTable).values({ tenantId, userId, action: `checklist_binding_${input.mode}_created`, resource: "checklist_bindings", resourceId: created.id, metadata: { selectors: input.selectors, targetTemplateId: input.targetTemplateId, targetFamilyKey: input.targetFamilyKey, reason: input.reason } });
    await enqueueTenantChecklistReconciliation({ tenantId, trigger: "binding_changed", reasonKey: `binding:${created.id}:created`, actorUserId: userId });
    await processPendingChecklistReconciliations({ tenantId, limit: 10 });
    refreshChecklistPaths();
    return { success: true, data: { bindingId: created.id } };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function setChecklistBindingStatusAction(input: { bindingId: string; active: boolean }): Promise<ChecklistActionResult> {
  try {
    const { tenantId, userId } = await checklistIdentity("write");
    const [updated] = await db.update(checklistBindingsTable).set({ status: input.active ? "active" : "inactive", updatedBy: userId }).where(and(eq(checklistBindingsTable.id, input.bindingId), eq(checklistBindingsTable.tenantId, tenantId))).returning({ id: checklistBindingsTable.id });
    if (!updated) throw new Error("Koppeling niet gevonden.");
    await db.insert(auditLogTable).values({ tenantId, userId, action: input.active ? "checklist_binding_activated" : "checklist_binding_deactivated", resource: "checklist_bindings", resourceId: input.bindingId });
    await enqueueTenantChecklistReconciliation({ tenantId, trigger: "binding_changed", reasonKey: `binding:${input.bindingId}:${input.active ? "active" : "inactive"}:${Date.now()}`, actorUserId: userId });
    await processPendingChecklistReconciliations({ tenantId, limit: 10 });
    refreshChecklistPaths();
    return { success: true, data: undefined };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function previewAssignmentChecklistsAction(assignmentId: string): Promise<ChecklistActionResult<Awaited<ReturnType<typeof previewAssignmentChecklistResolution>>>> {
  try {
    const { tenantId } = await checklistIdentity("read");
    return { success: true, data: await previewAssignmentChecklistResolution({ tenantId, assignmentId }) };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function upgradeAssignmentChecklistVersionsAction(assignmentId: string): Promise<ChecklistActionResult<{ status: "applied" | "pending_review" }>> {
  try {
    const { tenantId, userId } = await checklistIdentity("review");
    const result = await reconcileAssignmentChecklists({
      tenantId,
      assignmentId,
      trigger: "manual_version_upgrade",
      idempotencyKey: `manual-version-upgrade:${assignmentId}:${randomUUID()}`,
      actorUserId: userId,
      applyNewerVersions: true,
    });
    refreshChecklistPaths();
    return { success: true, data: { status: result.eventStatus } };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function retryChecklistReconciliationQueueAction(): Promise<ChecklistActionResult<{ processed: number; failed: number }>> {
  try {
    const { tenantId } = await checklistIdentity("review");
    const result = await processPendingChecklistReconciliations({ tenantId, limit: 25 });
    refreshChecklistPaths();
    return { success: true, data: result };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function reviewChecklistReconciliationAction(input: { eventId: string; decision: "accept_changes" | "keep_current"; reason: string }): Promise<ChecklistActionResult> {
  try {
    const { tenantId, userId } = await checklistIdentity("review");
    await decideChecklistReconciliation({ tenantId, eventId: input.eventId, actorUserId: userId, decision: input.decision, reason: input.reason });
    refreshChecklistPaths();
    return { success: true, data: undefined };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function waiveAssignmentChecklistAction(input: { assignmentId: string; assignmentChecklistId: string; kind: "waived" | "not_applicable"; reason: string }): Promise<ChecklistActionResult> {
  try {
    const { tenantId, userId } = await checklistIdentity("review");
    await waiveAssignmentChecklist({ tenantId, assignmentId: input.assignmentId, assignmentChecklistId: input.assignmentChecklistId, actorUserId: userId, reason: input.reason, kind: input.kind });
    refreshChecklistPaths();
    return { success: true, data: undefined };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

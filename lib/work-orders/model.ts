import { z } from "zod";
import type { Json } from "@/lib/database.types";
import type { Row } from "@/lib/objects/model";

export const workOrderViews = { all: "Alle", unassigned: "In te delen", planned: "Gepland", running: "In uitvoering", handling: "Afhandeling", completed: "Afgerond" } as const;
export const workOrderTabs = [["overzicht", "Overzicht"], ["planning", "Planning & personeel"], ["taken", "Taken & checklists"], ["communicatie", "Communicatie & bijlagen"], ["rapport", "Rapport & handtekening"], ["financieel", "Financieel"], ["historie", "Historie"]] as const;
export const workOrderQuery = z.object({
  q: z.string().max(200).catch(""), view: z.enum(["all", "unassigned", "planned", "running", "handling", "completed"]).catch("all"),
  customer: z.uuid().or(z.literal("")).catch(""), object: z.uuid().or(z.literal("")).catch(""), employee: z.uuid().or(z.literal("")).catch(""),
  discipline: z.string().max(100).catch(""), priority: z.enum(["", "low", "normal", "high", "urgent"]).catch(""), source: z.string().max(30).catch(""),
  from: z.iso.date().or(z.literal("")).catch(""), to: z.iso.date().or(z.literal("")).catch(""), report: z.string().max(30).catch(""),
  planning: z.string().max(30).catch(""), execution: z.string().max(30).catch(""), billing: z.string().max(30).catch(""),
  exception: z.enum(["", "crew", "signature", "remaining", "blocked"]).catch(""), archived: z.enum(["", "yes"]).catch(""),
  pageSize: z.coerce.number().int().min(10).max(100).catch(25),
  sort: z.enum(["date", "date_desc", "number", "title", "customer", "status"]).catch("date"), page: z.coerce.number().int().min(1).max(100000).catch(1),
});
export type WorkOrderQuery = z.infer<typeof workOrderQuery>;
export type WorkOrderListRow = {
  id: string; number: string; title: string; customerId: string; customer: string; objectId: string; object: string; address: string;
  discipline: string; priority: string; source: string; start: string | null; end: string | null; deadline: string | null; version: number;
  status: string; planningState: string; reportState: string; billingState: string | null; signatureRequired: boolean; signatureState: string;
  requiredPersonnel: number; assignedPersonnel: number; crew: Array<{ id: string; name: string; status: string; start: string; end: string }>;
  archived: boolean; canEdit: boolean; canDelete: boolean; category: keyof typeof workOrderViews;
};
export type WorkOrderListData = { rows: WorkOrderListRow[]; total: number; page: number; pageSize: number; counts: Record<keyof typeof workOrderViews, number>; finance: boolean; canManage: boolean };
export type ChecklistQuestion = {
  id: string; section: string; label: string; help: string; type: "check" | "boolean" | "choice" | "text" | "number" | "photo";
  options: string[]; unit: string; required: boolean; proof: boolean; allowNA: boolean; customerVisible: boolean;
  condition?: { questionId: string; equals: string | boolean };
};
export type WorkTemplate = { id: string; name: string; kind: "work_order" | "checklist"; version: number; editVersion?: number; state: "draft" | "published" | "archived"; revisionId: string; definition: { discipline?: string; requiredPersonnel?: number; signatureMode?: "none" | "optional" | "required"; employeeSignatureRequired?: boolean; tasks?: Array<{ revisionId: string; quantity: number; instructions?: string }>; questions?: ChecklistQuestion[]; checklistRevisionIds?: string[] } };
export type WorkOrderOptions = {
  customers: Array<{ id: string; name: string; customer_number: string }>;
  objects: Array<{ id: string; customer_id: string; name: string; address: Json; signatureMode?: "inherit" | "none" | "optional" | "required"; instructions?: string }>;
  contacts: Array<{ id: string; customer_id: string; objectIds: string[]; full_name: string; email: string | null; phone: string | null }>;
  personnel: Array<{ id: string; full_name: string; personnel_number: string }>;
  planners: Array<{ id: string; label: string }>;
  tasks: Array<{ id: string; revisionId: string; code: string; name: string; discipline: string; unit: string; durationMinutes: number; priceCents?: number; vatBasisPoints?: number }>;
  templates: WorkTemplate[]; disciplines: string[]; finance: boolean; defaultSignatureMode: "none" | "optional" | "required"; canManageSignature: boolean; defaultPaymentTermsDays: number;
};
export type ChecklistQuestionState = { questionId: string; visible: boolean; answered: boolean; editable: boolean };
export type ChecklistInstance = { id: string; revisionId: string; name: string; version: number; questions: ChecklistQuestion[]; questionStates?: ChecklistQuestionState[]; answers: Array<{ questionId: string; value: Json; notApplicable: boolean; reason: string; attachmentId?: string; version: number; actor: string; updatedAt: string }> };
export function checklistQuestionState(checklist: ChecklistInstance, question: ChecklistQuestion): ChecklistQuestionState {
  // Restricted staff responses contain server-evaluated conditions, not peers'
  // answers. Full backoffice dossiers retain their existing answer-based view.
  if (checklist.questionStates) return checklist.questionStates.find(state => state.questionId === question.id) ?? { questionId: question.id, visible: false, answered: false, editable: false };
  return { questionId: question.id, visible: !question.condition || checklist.answers.some(a => a.questionId === question.condition!.questionId && a.value === question.condition!.equals), answered: checklist.answers.some(a => a.questionId === question.id), editable: true };
}
export type WorkOrderDossier = {
  order: WorkOrderListRow & { description: string; labels: string[]; instructions: string; customerReference: string; purchaseOrder: string; costCenter: string; locationLabel: string; leadPersonnelId: string | null; plannerId: string | null; requestedDate: string | null; windowStart: string | null; windowEnd: string | null; windowKind: "arrival" | "execution" | "unknown"; durationMinutes: number | null; signatureMode: "inherit" | "none" | "optional" | "required"; employeeSignatureRequired: boolean; publishedAt: string | null; templateSnapshot: Json; templateRevisionId: string | null; requestId: string | null; quoteId: string | null };
  contacts: Array<{ id: string; name: string; roles: string[]; email: string | null; phone: string | null }>;
  tasks: Array<Omit<Row<"work_order_tasks">, "unit_price_cents" | "vat_basis_points" | "commercial_snapshot"> & { unit_price_cents?: number; vat_basis_points?: number; commercial_snapshot?: Json; instructions: string }>;
  assignments: Array<{ id: string; personnelId: string; name: string; start: string; end: string; status: string; seenAt: string | null; actualStart: string | null; actualEnd: string | null }>;
  times: Array<{ id: string; personnelId: string; name: string; start: string; end: string | null; kind: string; status: string }>;
  checklists: ChecklistInstance[]; reports: Array<{ id: string; body: string; created_at: string; customer_visible: boolean; author?: string }>;
  attachments: Array<{ id: string; file_name: string; mime_type: string; created_at: string; customerVisible?: boolean }>;
  history: Array<{ id: string; at: string; actor: string | null; event: string; note: string | null }>;
  financial?: {
    materials: Array<{ id: string; description: string; quantity: number; unit: string; customerVisible: boolean; unitPriceCents: number | null }>;
    expenses: Array<{ id: string; description: string; amountCents: number; customerVisible: boolean }>;
    invoices: Array<{ id: string; number: string | null; status: string; totalCents: number; orderTotalCents?: number; paidCents: number; pdfAvailable: boolean; issuedOn: string | null }>;
  };
  finance: boolean; canManage: boolean; canReview: boolean;
};
export const saveWorkOrderSchema = z.object({
  id: z.uuid(), version: z.number().int().min(0), mutationId: z.uuid(), customerId: z.uuid(), objectId: z.uuid(), title: z.string().trim().min(2).max(180),
  description: z.string().max(10000).default(""), discipline: z.string().trim().min(1).max(100), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  labels: z.array(z.string().trim().min(1).max(60)).max(20).default([]), locationLabel: z.string().max(300).default(""),
  plannerId: z.uuid().nullable().default(null), leadPersonnelId: z.uuid().nullable().default(null),
  customerReference: z.string().max(200).default(""), purchaseOrder: z.string().max(200).default(""), costCenter: z.string().max(200).default(""),
  deadline: z.iso.date().nullable().default(null), requestedDate: z.iso.date().nullable().default(null),
  windowStart: z.iso.datetime({ offset: true }).nullable().default(null), windowEnd: z.iso.datetime({ offset: true }).nullable().default(null),
  windowKind: z.enum(["arrival", "execution", "unknown"]).default("unknown"), requiredPersonnel: z.number().int().min(1).max(100).default(1),
  durationMinutes: z.number().int().positive().max(100000).nullable().default(null), instructions: z.string().max(4000).default(""),
  contacts: z.array(z.object({ id: z.uuid(), roles: z.array(z.enum(["site", "requester", "extra_approver", "handover", "billing"])).min(1) })).max(30).default([]),
  tasks: z.array(z.object({ revisionId: z.uuid(), quantity: z.number().positive().max(100000), instructions: z.string().max(2000).default("") })).max(100), preserveTasks: z.boolean().default(false),
  templateRevisionId: z.uuid().nullable().default(null), checklistRevisionIds: z.array(z.uuid()).max(20).default([]),
  signatureMode: z.enum(["inherit", "none", "optional", "required"]).default("inherit"), employeeSignatureRequired: z.boolean().default(false),
  state: z.enum(["draft", "unassigned", "tentative", "final"]).default("unassigned"),
  start: z.iso.datetime({ offset: true }).nullable().default(null), end: z.iso.datetime({ offset: true }).nullable().default(null),
  assignments: z.array(z.object({ personnelId: z.uuid(), start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) })).max(100).default([]),
  confirmedWarnings: z.array(z.string().max(200)).max(300).default([]),
});
export type SaveWorkOrderInput = z.input<typeof saveWorkOrderSchema>;
export type WorkOrderResult = { ok: true; id: string; version: number } | { ok: false; error: string; code?: string; warnings?: Array<{ key: string; message: string }> };
export type SignatureSettings = { mode: "inherit" | "none" | "optional" | "required"; employeeRequired: boolean; allowWaivers: boolean; waiverUsers: string[]; affectedDrafts: number; canManage: boolean; reviewers: Array<{ id: string; name: string }> };
export type WorkOrderExceptionData = { canManage: boolean; items: Array<{ id: string; kind: "no_access" | "absence" | "material" | "unsafe" | "damage" | "customer_cancelled" | "customer_absent" | "delay" | "other"; description: string; ownerId: string | null; state: "open" | "resolved"; blocking: boolean; attachmentId: string | null; resolution: string | null; version: number; createdAt: string; resolvedAt: string | null }> };
export function workOrderReturn(value?: string) { return value && /^\/app\/(?:werkbonnen|klanten|objecten|personeel|planning)(?:[/?]|$)/.test(value) && !/[\\\r\n]/.test(value) ? value : "/app/werkbonnen"; }

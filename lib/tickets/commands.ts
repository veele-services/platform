import { z } from "zod";
import { ticketCommandSchema, ticketCreateSchema, ticketPriorities, ticketReplySchema, ticketShareSchema, ticketStatuses, type TicketCommand } from "./model";
import { scopePayload } from "./projection";

const id = z.uuid();
const reference = z.object({ id, version: z.number().int().positive() });
const reason = z.string().trim().min(3, "Geef een korte toelichting.").max(2000);
const scope = z.object({ all: z.boolean(), categories: z.array(id).max(100), personnelIds: z.array(id).max(200), objectIds: z.array(id).max(200), customerIds: z.array(id).max(200), tenantIds: z.array(id).max(100), assignedOnly: z.boolean() }).strict();
const grant = z.object({ userId: id, permission: z.string().min(3).max(100), version: z.number().int().min(0), scope, reason, verificationId: id.optional() }).strict();
const revoke = z.object({ id, version: z.number().int().positive(), reason, verificationId: id.optional() }).strict();
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const hours = z.object({ days: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(v => new Set(v).size === v.length), start: time, end: time }).strict().refine(v => v.start < v.end, "De eindtijd moet na de begintijd liggen.");

/** Allowlisted translation, shared by the mutation and its payload-bound OTP. */
export function ticketCommandPayload(commandInput: TicketCommand, input: unknown): { command: string; payload: Record<string, unknown> } {
  const command = ticketCommandSchema.parse(commandInput);
  if (command === "create") {
    const p = ticketCreateSchema.parse(input);
    return { command, payload: { title: p.subject, body: p.body, category_id: p.categoryId, urgency: p.urgency, needed_before: p.neededBefore, work_order_id: p.workOrderId, object_id: p.objectId, module: p.module, attachment_ids: p.uploadIds } };
  }
  if (command === "reply") {
    const p = ticketReplySchema.parse(input);
    return { command, payload: { ticket_id: p.id, expected_revision: p.version, body: p.body, audience: p.audience, attachment_ids: p.uploadIds } };
  }
  if (command === "status") {
    const p = reference.extend({ status: z.enum(ticketStatuses), reason: z.string().trim().max(2000).optional(), resolution: z.string().trim().max(10000).optional(), nextStep: z.string().trim().max(2000).optional() }).strict().parse(input);
    if (p.status === "resolved" && !p.resolution) throw new Error("Beschrijf de oplossing voor de melder.");
    if (p.status === "cancelled" && !p.reason) throw new Error("Geef aan waarom de melding wordt ingetrokken.");
    return { command, payload: { ticket_id: p.id, expected_revision: p.version, status: p.status, reason: p.reason, resolution: p.resolution, next_step: p.nextStep } };
  }
  if (command === "assign") {
    const p = reference.extend({ assigneeId: id.nullable() }).strict().parse(input);
    return { command, payload: { ticket_id: p.id, expected_revision: p.version, assigned_user_id: p.assigneeId } };
  }
  if (command === "priority") {
    const p = reference.extend({ priority: z.enum(ticketPriorities), reason }).strict().parse(input);
    return { command, payload: { ticket_id: p.id, expected_revision: p.version, priority: p.priority, reason: p.reason } };
  }
  if (command === "transfer") {
    const p = reference.extend({ categoryId: id, reason }).strict().parse(input);
    return { command: "category", payload: { ticket_id: p.id, expected_revision: p.version, category_id: p.categoryId, reason: p.reason } };
  }
  if (command === "share") {
    const p = ticketShareSchema.parse(input);
    return { command: "transfer", payload: { ticket_id: p.id, expected_revision: p.version, title: p.subject, body: p.body, category_id: p.categoryId, module: p.module, attachment_ids: p.attachmentIds } };
  }
  if (command === "mark_read") {
    const p = reference.strict().parse(input);
    return { command: "read", payload: { ticket_id: p.id, expected_revision: p.version } };
  }
  if (command === "save_category") {
    const p = z.object({ id: id.optional(), version: z.number().int().min(0), name: z.string().trim().min(2).max(100), description: z.string().trim().max(500), active: z.boolean(), order: z.number().int().min(0).max(1000), defaultAssigneeId: id.nullable(), fallbackCategoryId: id.nullable(), responseMinutes: z.number().int().min(1).max(100000), followupMinutes: z.number().int().min(1).max(100000), autoCloseDays: z.number().int().min(1).max(365).nullable(), pauseWhileWaiting: z.boolean(), groupId: id.nullable().optional(), canEscalate: z.boolean().optional(), confidential: z.boolean().optional(), retentionProfile: z.string().max(200).nullable().optional() }).strict().parse(input);
    return { command: "category_save", payload: { category_id: p.id, expected_revision: p.version, name: p.name, description: p.description, active: p.active, sort_order: p.order, default_assignee_id: p.defaultAssigneeId, fallback_category_id: p.fallbackCategoryId, response_minutes: p.responseMinutes, followup_minutes: p.followupMinutes, auto_close_days: p.autoCloseDays, pause_while_waiting: p.pauseWhileWaiting, group_id: p.groupId, can_escalate: p.canEscalate, confidential: p.confidential, retention_profile: p.retentionProfile } };
  }
  if (command === "save_group") {
    const p = z.object({ id: id.optional(), version: z.number().int().min(0), name: z.string().trim().min(2).max(100), memberIds: z.array(id).max(100), active: z.boolean() }).strict().parse(input);
    return { command: "group_save", payload: { group_id: p.id, expected_revision: p.version, name: p.name, member_ids: [...new Set(p.memberIds)], active: p.active } };
  }
  if (command === "save_settings") {
    const p = z.object({ version: z.number().int().min(0), openingHours: hours, timezone: z.string().min(1).max(100), enabled: z.boolean().optional() }).strict().parse(input);
    try { new Intl.DateTimeFormat("nl-NL", { timeZone: p.timezone }).format(); } catch { throw new Error("Kies een geldige tijdzone."); }
    return { command: "settings_save", payload: { expected_revision: p.version, opening_hours: p.openingHours, timezone: p.timezone, enabled: p.enabled } };
  }
  if (command === "save_grant") {
    const p = grant.parse(input);
    return { command: "grant_save", payload: { user_id: p.userId, capability: p.permission, expected_revision: p.version, scope: scopePayload(p.scope), reason: p.reason, ...(p.verificationId ? { verification_id: p.verificationId } : {}) } };
  }
  if (command === "revoke_grant") {
    const p = revoke.parse(input);
    return { command: "grant_revoke", payload: { grant_id: p.id, expected_revision: p.version, reason: p.reason, ...(p.verificationId ? { verification_id: p.verificationId } : {}) } };
  }
  if (command === "preferences") {
    return { command, payload: z.object({ email: z.boolean(), push: z.boolean() }).strict().parse(input) };
  }
  if (command === "archive") {
    const p = reference.extend({ reason }).strict().parse(input);
    return { command, payload: { ticket_id: p.id, expected_revision: p.version, reason: p.reason } };
  }
  const p = reference.extend({ messageId: id, reason }).strict().parse(input);
  return { command: "redact", payload: { ticket_id: p.id, expected_revision: p.version, message_id: p.messageId, reason: p.reason } };
}

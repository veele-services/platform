import { z } from "zod";
import { notificationChannels, notificationCommandSchema, notificationWorkspaceSchema, recipientCriteriaSchema, notificationScopeSchema, type NotificationCommand, type RecipientCriteria, type NotificationScope } from "./model";

const revision = z.number().int().min(0);
const reason = z.string().trim().min(3).max(2000);
const instant = z.iso.datetime({ offset: true }).nullable().optional();
const source = z.enum(["work_order", "object"]).nullable().optional();
export function notificationScopePayload(scope: NotificationScope) { const v = notificationScopeSchema.parse(scope); return { all: v.all, ...(v.personnelIds.length ? { personnel_ids: v.personnelIds } : {}), ...(v.objectIds.length ? { object_ids: v.objectIds } : {}), ...(v.customerIds.length ? { customer_ids: v.customerIds } : {}), ...(v.tenantIds.length ? { tenant_ids: v.tenantIds } : {}) }; }
export function criteriaPayload(input: RecipientCriteria) {
  const p = recipientCriteriaSchema.parse(input);
  return { kind: p.kind, all: p.all, user_ids: p.userIds, personnel_ids: p.personnelIds, customer_ids: p.customerIds, contact_ids: p.contactIds, object_ids: p.objectIds, work_order_ids: p.workOrderIds, tenant_ids: p.tenantIds };
}
export const campaignSchema = z.object({ id: z.uuid().optional(), version: revision, title: z.string().trim().min(3).max(180), body: z.string().trim().min(3).max(10000), priority: z.enum(["normal", "urgent"]), criteria: recipientCriteriaSchema, channels: z.array(z.enum(notificationChannels)).min(1).max(3), scheduledAt: instant, expiresAt: instant, timezone: z.string().min(1).max(100), ackRequired: z.boolean(), actionLabel: z.string().max(80), sourceKind: source, sourceId: z.uuid().nullable().optional() }).strict();
export function notificationCommandPayload(command: NotificationCommand, input: unknown): Record<string, unknown> {
  notificationCommandSchema.parse(command);
  if (command === "grant_save") { const p = z.object({ userId: z.uuid(), capability: z.string().regex(/^(?:platform\.)?notifications\.[a-z_.]+$/), version: revision, scope: notificationScopeSchema, reason, verificationId: z.uuid().optional() }).strict().parse(input); return { user_id: p.userId, capability: p.capability, expected_revision: p.version, scope: notificationScopePayload(p.scope), reason: p.reason, ...(p.verificationId ? { verification_id: p.verificationId } : {}) }; }
  if (command === "grant_revoke") { const p = z.object({ id: z.uuid(), version: z.number().int().positive(), reason, verificationId: z.uuid().optional() }).strict().parse(input); return { grant_id: p.id, expected_revision: p.version, reason: p.reason, ...(p.verificationId ? { verification_id: p.verificationId } : {}) }; }
  if (command === "inbox_read_all") { z.object({}).strict().parse(input); return {}; }
  if (command.startsWith("inbox_")) { const p = z.object({ id: z.uuid(), version: revision.optional() }).strict().parse(input); return { notification_id: p.id, expected_revision: p.version }; }
  if (command === "campaign_save") {
    const p = campaignSchema.parse(input);
    try { new Intl.DateTimeFormat("nl-NL", { timeZone: p.timezone }).format(); } catch { throw new Error("Kies een geldige tijdzone."); }
    if (Boolean(p.sourceKind) !== Boolean(p.sourceId)) throw new Error("Kies een volledige bronrelatie.");
    return { id: p.id, expected_revision: p.version, title: p.title, body: p.body, priority: p.priority, criteria: criteriaPayload(p.criteria), channels: p.channels, scheduled_at: p.scheduledAt, expires_at: p.expiresAt, timezone: p.timezone, ack_required: p.ackRequired, action_label: p.actionLabel, source_kind: p.sourceKind, source_id: p.sourceId };
  }
  if (command.startsWith("campaign_")) { const p = z.object({ id: z.uuid(), version: revision, reason: reason.optional(), selectionToken: z.string().min(1).max(512).optional() }).strict().parse(input); if (command === "campaign_publish" && !p.selectionToken) throw new Error("Controleer eerst de actuele ontvangers."); return { id: p.id, expected_revision: p.version, reason: p.reason, selection_token: p.selectionToken }; }
  if (command === "policy_save") {
    const p = z.object({ id: z.uuid().optional(), version: revision, scope: z.enum(["platform", "tenant"]), tenantId: z.uuid().nullable().optional(), context: notificationWorkspaceSchema.nullable().optional(), typeCode: z.string().max(150).nullable().optional(), channel: z.enum(notificationChannels).nullable().optional(), mode: z.enum(["inherit", "on", "off"]), bundleSeconds: z.number().int().min(0).max(300).nullable().optional(), reason }).strict().parse(input);
    if (p.bundleSeconds !== undefined && p.bundleSeconds !== null && (p.typeCode !== "work_order.rescheduled" || p.channel)) throw new Error("Bundelen kan alleen voor planningswijzigingen over alle kanalen worden ingesteld.");
    return { id: p.id, expected_revision: p.version, scope: p.scope, tenant_id: p.tenantId, context: p.context, type_code: p.typeCode, channel: p.channel, mode: p.mode, reason: p.reason, ...(p.bundleSeconds !== undefined ? { bundle_seconds: p.bundleSeconds } : {}) };
  }
  if (command.startsWith("template_")) {
    const p = z.object({ id: z.string().min(1).max(200), version: revision, title: z.string().max(200).optional(), body: z.string().max(10000).optional(), ctaLabel: z.string().max(80).optional(), reason: reason.optional() }).strict().parse(input);
    return { id: p.id, expected_revision: p.version, title: p.title, body: p.body, cta_label: p.ctaLabel, reason: p.reason };
  }
  if (command === "preferences_save") {
    const p = z.object({ version: revision, email: z.boolean(), push: z.boolean(), quietEnabled: z.boolean(), quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timezone: z.string().min(1).max(100), types: z.array(z.object({ code: z.string().max(150), email: z.boolean(), push: z.boolean() }).strict()).max(200) }).strict().parse(input);
    return { expected_revision: p.version, email: p.email, push: p.push, quiet_enabled: p.quietEnabled, quiet_start: p.quietStart, quiet_end: p.quietEnd, timezone: p.timezone, types: p.types };
  }
  const p = z.object({ id: z.uuid(), version: revision, reason }).strict().parse(input);
  return { id: p.id, expected_revision: p.version, reason: p.reason };
}

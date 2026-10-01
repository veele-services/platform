import "server-only";
import { z } from "zod";
import { getNotificationActor } from "./auth";
import { notificationRpc } from "./rpc";
import { notificationChannels, notificationQuerySchema, type NotificationChannel, type NotificationQuery, type NotificationWorkspace, type RecipientCriteria } from "./model";
import { criteriaPayload } from "./commands";
import { projectNotificationAccess, projectInbox, projectNotification, projectCampaign, projectRecipients, projectSettings, projectTemplate, projectDelivery, projectPreferences, projectExplanation, record, rows } from "./projection";
import { projectNotificationPermissions } from "./projection";

export async function queryNotifications(workspace: NotificationWorkspace, operation: string, payload: Record<string, unknown> = {}) {
  const actor = await getNotificationActor(workspace);
  return notificationRpc(actor.db, "notification_query", { target_tenant: actor.tenantId, actor_context: workspace, operation, payload });
}
export async function getNotificationAccess(workspace: NotificationWorkspace) {
  const a = await getNotificationActor(workspace);
  return projectNotificationAccess(await notificationRpc(a.db, "notification_query", { target_tenant: a.tenantId, actor_context: workspace, operation: "access", payload: {} }), workspace, a.user.id, a.tenant);
}
function listPayload(query: NotificationQuery) {
  const q = notificationQuerySchema.parse(query);
  return { search: q.search, view: q.view, category: q.category, page: q.page, page_size: q.pageSize, type_code: q.typeCode, channel: q.channel, status: q.status, tenant_id: q.tenantId, context: q.context };
}
export async function getNotificationInbox(workspace: NotificationWorkspace, query: NotificationQuery) { return projectInbox(await queryNotifications(workspace, "inbox", listPayload(query))); }
export async function getNotificationDetail(workspace: NotificationWorkspace, id: string) {
  try { const v = await queryNotifications(workspace, "detail", { notification_id: z.uuid().parse(id) }); return v ? projectNotification(record(v)) : null; }
  catch (error) { if (["42501", "P0002"].includes(String(record(error).code))) return null; throw error; }
}
export async function getNotificationCampaigns(workspace: NotificationWorkspace, query: NotificationQuery) {
  const v = record(await queryNotifications(workspace, "campaigns", { ...listPayload(query), view: query.tab === "scheduled" ? "scheduled" : "sent" }));
  return { items: rows(v.items).map(projectCampaign), total: Number(v.total) || 0, page: Number(v.page) || query.page, pageSize: Number(v.page_size) || query.pageSize };
}
export async function getNotificationCampaign(workspace: NotificationWorkspace, id: string) {
  try { const v = await queryNotifications(workspace, "campaign", { id: z.uuid().parse(id) }); return v ? projectCampaign(record(v)) : null; }
  catch (error) { if (["42501", "P0002"].includes(String(record(error).code))) return null; throw error; }
}
export async function getNotificationRecipients(workspace: NotificationWorkspace, criteria: RecipientCriteria, search = "", channels?: NotificationChannel[]) { return projectRecipients(await queryNotifications(workspace, "recipients", { criteria: criteriaPayload(criteria), search: z.string().max(160).parse(search), ...(channels ? { channels: z.array(z.enum(notificationChannels)).max(3).parse(channels) } : {}) })); }
export async function getNotificationSettings(workspace: NotificationWorkspace, tenantId?: string) { return projectSettings(await queryNotifications(workspace, "rules", tenantId ? { tenant_id: z.uuid().parse(tenantId) } : {})); }
export async function getNotificationTemplates(workspace: NotificationWorkspace) { const v = await queryNotifications(workspace, "templates"); return rows(Array.isArray(v) ? v : record(v).items).map(projectTemplate); }
export async function getNotificationTemplate(workspace: NotificationWorkspace, id: string) { return projectTemplate(record(await queryNotifications(workspace, "template", { id: z.string().max(200).parse(id) }))); }
export async function getNotificationDeliveries(workspace: NotificationWorkspace, query: NotificationQuery) {
  const v = record(await queryNotifications(workspace, "deliveries", listPayload(query)));
  return { items: rows(v.items).map(projectDelivery), total: Number(v.total) || 0, page: Number(v.page) || query.page, pageSize: Number(v.page_size) || query.pageSize };
}
export async function getNotificationPreferences(workspace: NotificationWorkspace) { return projectPreferences(await queryNotifications(workspace, "preferences")); }
export async function getNotificationPermissions(workspace: NotificationWorkspace) { return projectNotificationPermissions(await queryNotifications(workspace, "permissions")); }
export async function getNotificationExplanation(workspace: NotificationWorkspace, input: { typeCode?: string; criteria?: RecipientCriteria; campaignId?: string; policyId?: string }) {
  const p = z.object({ typeCode: z.string().max(150).optional(), criteria: z.unknown().optional(), campaignId: z.uuid().optional(), policyId: z.uuid().optional() }).strict().parse(input);
  return projectExplanation(await queryNotifications(workspace, "explain", { type_code: p.typeCode, criteria: input.criteria ? criteriaPayload(input.criteria) : undefined, campaign_id: p.campaignId, policy_id: p.policyId }));
}

import { notificationReason } from "./presentation";
import { notificationChannels, notificationTabs, notificationWorkspaces, recipientCriteriaSchema, type Choice, type NotificationAccess, type NotificationBrand, type NotificationCampaign, type NotificationChannel, type NotificationDelivery, type NotificationExplanation, type NotificationInbox, type NotificationItem, type NotificationPolicy, type NotificationPreferences, type NotificationRule, type NotificationSettings, type NotificationTemplate, type NotificationWorkspace, type RecipientPreview } from "./model";
import { notificationScopeSchema, type NotificationPermissions } from "./model";

type Row = Record<string, unknown>;
export const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
export const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(record) : [];
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const num = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const nullable = (value: unknown) => typeof value === "string" ? value : null;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const choices = (value: unknown): Choice[] => rows(value).map(v => ({ id: text(v.id), label: text(v.label ?? v.name) }));
const channels = (value: unknown) => strings(value).filter((c): c is NotificationChannel => notificationChannels.includes(c as NotificationChannel));
const contexts = (value: unknown) => strings(value).filter((c): c is NotificationWorkspace => notificationWorkspaces.includes(c as NotificationWorkspace));
const permissions = (value: unknown) => Array.isArray(value) ? strings(value) : Object.entries(record(value)).filter(([, permitted]) => permitted === true).map(([key]) => key);
export function safeNotificationTarget(value: unknown): string | null {
  if (typeof value !== "string" || !/^\/(app|staff|klant|platform)(?:\/|\?|$)/.test(value) || /[\\\r\n]/.test(value)) return null;
  return value;
}
export function projectNotificationAccess(input: unknown, workspace: NotificationWorkspace, userId: string, tenant: NotificationBrand | null): NotificationAccess {
  const v = record(input), rights = permissions(v.permissions);
  const tabs = strings(v.allowed_tabs).filter((t): t is NotificationAccess["tabs"][number] => notificationTabs.includes(t as NotificationAccess["tabs"][number]));
  if (!tabs.length && rights.includes("read_own")) tabs.push("inbox");
  if (!v.allowed_tabs) {
    if (rights.includes("sent_read")) tabs.push("sent", "scheduled");
    if (rights.includes("settings_manage") || rights.includes("manage_global")) tabs.push("rules");
    if (rights.includes("templates_manage") || rights.includes("templates_override")) tabs.push("templates");
    if (rights.includes("manage_global")) tabs.push("policies");
    if (rights.includes("manage_tenant")) tabs.push("tenants");
    if (rights.includes("delivery_read")) tabs.push("delivery");
    if (rights.includes("permissions_manage")) tabs.push("permissions");
  }
  return { workspace, userId, tenant, allowed: v.allowed === true, permissions: rights, tabs: [...new Set(tabs)], timezone: text(v.timezone, tenant?.timezone ?? "Europe/Amsterdam") };
}
export function projectNotification(v: Row): NotificationItem {
  return { id: text(v.id), typeCode: text(v.type_code), category: text(v.category), title: text(v.title), body: text(v.body), summary: text(v.summary), senderName: text(v.sender_name), priority: text(v.priority, "normal"), createdAt: text(v.created_at), readAt: nullable(v.read_at), archivedAt: nullable(v.archived_at), ackRequired: v.ack_required === true, acknowledgedAt: nullable(v.acknowledged_at), targetPath: v.source_available === false ? null : safeNotificationTarget(v.target_path), actionLabel: text(v.action_label, "Openen"), sourceAvailable: v.source_available !== false, version: num(v.revision, 1), allowedActions: permissions(v.permissions) };
}
export function projectInbox(input: unknown): NotificationInbox {
  const v = record(input);
  return { items: rows(v.items).map(projectNotification), total: num(v.total), unreadCount: num(v.unread_count), page: num(v.page, 1), pageSize: num(v.page_size, 25), categories: choices(v.categories) };
}
export function projectRecipients(input: unknown): RecipientPreview {
  const v = record(input), c = record(v.counts), o = record(v.options);
  return { recipients: rows(v.recipients).map(r => ({ key: text(r.key ?? r.id), id: text(r.id), kind: text(r.kind), label: text(r.label), tenantId: nullable(r.tenant_id), channels: channels(r.channels), excludedReason: r.excluded_reason ? notificationReason(text(r.excluded_reason)) : null })), counts: { total: num(c.total), inApp: num(c.in_app), push: num(c.push), email: num(c.email), reachable: num(c.reachable), unreachable: num(c.unreachable), suppressed: num(c.suppressed) }, selectionToken: nullable(v.selection_token), options: { personnel: choices(o.personnel), customers: choices(o.customers), contacts: choices(o.contacts), objects: choices(o.objects), workOrders: choices(o.work_orders), tenants: choices(o.tenants) } };
}
export function projectCriteria(input: unknown) {
  const v = record(input);
  return recipientCriteriaSchema.parse({ kind: ["staff", "customer", "management", "mixed"].includes(text(v.kind)) ? v.kind : "staff", all: v.all === true, userIds: strings(v.user_ids), personnelIds: strings(v.personnel_ids), customerIds: strings(v.customer_ids), contactIds: strings(v.contact_ids), objectIds: strings(v.object_ids), workOrderIds: strings(v.work_order_ids), tenantIds: strings(v.tenant_ids) });
}
export function projectCampaign(v: Row): NotificationCampaign {
  return { id: text(v.id), title: text(v.title), body: text(v.body), state: text(v.state, "draft"), audienceSummary: text(v.audience_summary), channels: channels(v.channels), recipientCount: num(v.recipient_count), senderName: text(v.sender_name), createdAt: text(v.created_at), scheduledAt: nullable(v.scheduled_at), expiresAt: nullable(v.expires_at), timezone: text(v.timezone, "Europe/Amsterdam"), version: num(v.revision, 1), priority: text(v.priority, "normal"), ackRequired: v.ack_required === true, actionLabel: text(v.action_label), criteria: projectCriteria(v.criteria), allowedActions: permissions(v.permissions), counts: Object.fromEntries(Object.entries(record(v.counts)).filter((entry): entry is [string, number] => typeof entry[1] === "number")), deliveries: rows(v.deliveries).map(projectDelivery), sourceKind: nullable(v.source_kind), sourceId: nullable(v.source_id) };
}
export function projectRule(v: Row): NotificationRule {
  return { code: text(v.code ?? v.type_code), name: text(v.name), category: text(v.category), module: text(v.module), status: v.status === "active" ? "active" : v.status === "available" ? "available" : "planned", contexts: contexts(v.contexts), channels: channels(v.channels), recipientDescription: text(v.recipient_description), description: text(v.description), bundleSeconds: num(v.bundle_seconds, text(v.code ?? v.type_code) === "work_order.rescheduled" ? 30 : 0), allowedActions: permissions(v.permissions) };
}
export function projectPolicy(v: Row): NotificationPolicy {
  return { id: text(v.id), scope: text(v.scope), tenantId: nullable(v.tenant_id), context: contexts([v.context])[0] ?? null, typeCode: nullable(v.type_code), channel: channels([v.channel])[0] ?? null, mode: v.mode === "on" ? "on" : v.mode === "off" ? "off" : "inherit", version: num(v.revision, 0), effective: v.effective === true, reason: notificationReason(text(v.reason)), source: text(v.source), bundleSeconds: typeof v.bundle_seconds === "number" ? v.bundle_seconds : null, effectiveBundleSeconds: typeof v.effective_bundle_seconds === "number" ? v.effective_bundle_seconds : null, allowedActions: permissions(v.permissions) };
}
export function projectSettings(input: unknown): NotificationSettings {
  const v = record(input);
  return { rules: rows(v.rules ?? v.catalog).map(projectRule), policies: rows(v.policies).map(projectPolicy), tenants: choices(v.tenants), revision: num(v.revision, 1), impact: { activeTenantCount: typeof record(v.impact).active_tenant_count === "number" && Number.isInteger(record(v.impact).active_tenant_count) && Number(record(v.impact).active_tenant_count) >= 0 ? Number(record(v.impact).active_tenant_count) : null, globalActiveTenantCount: typeof record(v.impact).global_active_tenant_count === "number" && Number.isInteger(record(v.impact).global_active_tenant_count) && Number(record(v.impact).global_active_tenant_count) >= 0 ? Number(record(v.impact).global_active_tenant_count) : null }, audit: rows(v.audit).map(a => ({ id: text(a.id), label: text(a.label), actorName: text(a.actor_name), createdAt: text(a.created_at) })) };
}
export function projectTemplate(v: Row): NotificationTemplate {
  return { id: text(v.id), typeCode: text(v.type_code), name: text(v.name), context: contexts([v.context])[0] ?? "backoffice", channel: channels([v.channel])[0] ?? "in_app", version: num(v.revision, 1), state: text(v.state), title: text(v.title), body: text(v.body), ctaLabel: text(v.cta_label), source: text(v.source), allowedFields: strings(v.allowed_fields), variables: rows(v.variables).map(r => ({ name: text(r.name), required: r.required === true })), defaultTitle: text(v.default_title), defaultBody: text(v.default_body), warning: v.warning ? "Dit bestaande pushtemplate voldoet niet aan de huidige beperkingen. Tot een geldige versie is gepubliceerd, wordt een veilige algemene pushtekst gebruikt." : null, newDefaultAvailable: v.new_default_available === true, allowedActions: permissions(v.permissions), history: rows(v.history).map(r => ({ revision: num(r.revision), title: text(r.title), body: text(r.body), createdAt: text(r.created_at), actorName: text(r.actor_name) })) };
}
export function projectDelivery(v: Row): NotificationDelivery {
  return { id: text(v.id), campaignId: nullable(v.campaign_id), typeCode: text(v.type_code), recipientLabel: text(v.recipient_label), channel: channels([v.channel])[0] ?? "in_app", state: text(v.state), reason: notificationReason(text(v.reason)), createdAt: text(v.created_at), lastAttemptAt: nullable(v.last_attempt_at), nextAttemptAt: nullable(v.next_attempt_at), expiresAt: nullable(v.expires_at), templateVersion: num(v.template_version), policyRevision: num(v.policy_revision), allowedActions: permissions(v.permissions), version: num(v.revision, 1) };
}
export function projectPreferences(input: unknown): NotificationPreferences {
  const v = record(input);
  return { version: num(v.revision, 0), email: v.email === true, push: v.push === true, quietEnabled: v.quiet_enabled === true, quietStart: text(v.quiet_start, "22:00").slice(0, 5), quietEnd: text(v.quiet_end, "07:00").slice(0, 5), timezone: text(v.timezone, "Europe/Amsterdam"), types: rows(v.types).map(r => ({ code: text(r.code), name: text(r.name), channels: channels(r.channels), email: r.email === true, push: r.push === true, reason: notificationReason(text(r.reason)) })) };
}
export function projectExplanation(input: unknown): NotificationExplanation {
  const v = record(input);
  return { summary: text(v.summary), recipients: projectRecipients(v.recipients), channels: rows(v.channels).map(c => ({ channel: channels([c.channel])[0] ?? "in_app", allowed: c.allowed === true, reason: notificationReason(text(c.reason)), source: text(c.source) })), previews: rows(v.previews).map(p => ({ channel: channels([p.channel])[0] ?? "in_app", context: contexts([p.context])[0] ?? null, tenantName: text(p.tenant_name), title: text(p.title), body: text(p.body), templateVersion: num(p.template_version) })), warnings: strings(v.warnings), affectedTenants: num(v.affected_tenants) };
}
export function projectNotificationScope(input: unknown) { const v = record(input); return notificationScopeSchema.parse({ all: v.all === true, personnelIds: strings(v.personnel_ids), objectIds: strings(v.object_ids), customerIds: strings(v.customer_ids), tenantIds: strings(v.tenant_ids) }); }
export function projectNotificationPermissions(input: unknown): NotificationPermissions {
  const v = record(input), o = record(v.scope_options);
  return { members: choices(v.members), catalog: rows(v.catalog).map(c => ({ key: text(c.key), label: text(c.label), description: text(c.description), sensitive: c.sensitive === true, dependencies: strings(c.dependencies), scopes: strings(c.scopes) })), grants: rows(v.grants).map(g => ({ id: text(g.id), userId: text(g.user_id), userLabel: text(g.user_label), capability: text(g.capability), scope: projectNotificationScope(g.scope), active: g.active === true, version: num(g.revision, 1), canRevoke: g.can_revoke === true })), scopeOptions: { personnel: choices(o.personnel), objects: choices(o.objects), customers: choices(o.customers), tenants: choices(o.tenants) }, delegationScope: projectNotificationScope(v.delegation_scope), audit: rows(v.audit).map(a => ({ id: text(a.id), label: text(a.label), actorName: text(a.actor_name), createdAt: text(a.created_at) })) };
}

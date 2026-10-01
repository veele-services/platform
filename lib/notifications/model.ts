import { z } from "zod";

export const notificationWorkspaces = ["platform", "backoffice", "staff", "customer"] as const;
export type NotificationWorkspace = typeof notificationWorkspaces[number];
export const notificationWorkspaceSchema = z.enum(notificationWorkspaces);
export const notificationChannels = ["in_app", "push", "email"] as const;
export type NotificationChannel = typeof notificationChannels[number];
export const channelLabels: Record<NotificationChannel, string> = { in_app: "In-app", push: "Push", email: "E-mail" };
export const workspaceLabels: Record<NotificationWorkspace, string> = { platform: "Platform", backoffice: "Backoffice", staff: "Personeelsapp", customer: "Klantomgeving" };
export const notificationPaths: Record<NotificationWorkspace, string> = { platform: "/platform/notificaties", backoffice: "/app/notificaties", staff: "/staff/notificaties", customer: "/klant/notificaties" };
export const notificationTabs = ["inbox", "sent", "scheduled", "rules", "templates", "policies", "tenants", "delivery", "permissions"] as const;
export type NotificationTab = typeof notificationTabs[number];
export const tabLabels: Record<NotificationTab, string> = { inbox: "Ontvangen", sent: "Verzonden", scheduled: "Gepland", rules: "Automatische meldingen", templates: "Templates", policies: "Platformbeleid", tenants: "Tenantuitzonderingen", delivery: "Aflevering", permissions: "Bevoegdheden" };
export type NotificationBrand = { id: string; name: string; slug: string; timezone: string; primaryColor: string; accentColor: string; logoUrl: string | null };
export type NotificationAccess = { workspace: NotificationWorkspace; userId: string; allowed: boolean; permissions: string[]; tabs: NotificationTab[]; tenant: NotificationBrand | null; timezone: string };
export type Choice = { id: string; label: string };
export type NotificationItem = {
  id: string; typeCode: string; category: string; title: string; summary: string; body: string; senderName: string; priority: string;
  createdAt: string; readAt: string | null; archivedAt: string | null; ackRequired: boolean; acknowledgedAt: string | null;
  targetPath: string | null; actionLabel: string; sourceAvailable: boolean; version: number; allowedActions: string[];
};
export type NotificationInbox = { items: NotificationItem[]; total: number; unreadCount: number; page: number; pageSize: number; categories: Choice[] };
export const notificationQuerySchema = z.object({
  tab: z.enum(notificationTabs).default("inbox"), search: z.string().trim().max(160).default(""),
  view: z.enum(["all", "unread", "action", "archived"]).default("all"), category: z.string().max(100).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(5).max(100).default(25),
  typeCode: z.string().max(150).optional(), channel: z.enum(notificationChannels).optional(), status: z.string().max(50).optional(),
  tenantId: z.uuid().optional(), context: notificationWorkspaceSchema.optional(),
});
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
export const recipientCriteriaSchema = z.object({
  kind: z.enum(["staff", "customer", "management", "mixed"]), all: z.boolean().default(false),
  userIds: z.array(z.uuid()).max(500).default([]), personnelIds: z.array(z.uuid()).max(500).default([]),
  customerIds: z.array(z.uuid()).max(500).default([]), contactIds: z.array(z.uuid()).max(500).default([]),
  objectIds: z.array(z.uuid()).max(500).default([]), workOrderIds: z.array(z.uuid()).max(500).default([]), tenantIds: z.array(z.uuid()).max(500).default([]),
}).strict();
export type RecipientCriteria = z.infer<typeof recipientCriteriaSchema>;
export type RecipientPreview = {
  recipients: Array<{ key: string; id: string; kind: string; label: string; tenantId: string | null; channels: NotificationChannel[]; excludedReason: string | null }>;
  counts: { total: number; inApp: number; push: number; email: number; reachable: number; unreachable: number; suppressed: number }; selectionToken: string | null;
  options: { personnel: Choice[]; customers: Choice[]; contacts: Choice[]; objects: Choice[]; workOrders: Choice[]; tenants: Choice[] };
};
export type NotificationCampaign = {
  id: string; title: string; body: string; state: string; audienceSummary: string; channels: NotificationChannel[]; recipientCount: number;
  senderName: string; createdAt: string; scheduledAt: string | null; expiresAt: string | null; timezone: string; version: number;
  priority: string; ackRequired: boolean; actionLabel: string; criteria: RecipientCriteria; allowedActions: string[];
  counts: Record<string, number>; deliveries: NotificationDelivery[]; sourceKind: string | null; sourceId: string | null;
};
export type CampaignList = { items: NotificationCampaign[]; total: number; page: number; pageSize: number };
export type NotificationRule = { code: string; name: string; category: string; module: string; status: "active" | "available" | "planned"; contexts: NotificationWorkspace[]; channels: NotificationChannel[]; recipientDescription: string; description: string; bundleSeconds: number; allowedActions: string[] };
export type NotificationPolicy = { id: string; scope: string; tenantId: string | null; context: NotificationWorkspace | null; typeCode: string | null; channel: NotificationChannel | null; mode: "inherit" | "on" | "off"; version: number; effective: boolean; reason: string; source: string; bundleSeconds: number | null; effectiveBundleSeconds: number | null; allowedActions: string[] };
export type NotificationSettings = { rules: NotificationRule[]; policies: NotificationPolicy[]; tenants: Choice[]; revision: number; impact: { activeTenantCount: number | null; globalActiveTenantCount: number | null }; audit: Array<{ id: string; label: string; actorName: string; createdAt: string }> };
export type NotificationTemplate = { id: string; typeCode: string; name: string; context: NotificationWorkspace; channel: NotificationChannel; version: number; state: string; title: string; body: string; ctaLabel: string; source: string; allowedFields: string[]; variables: Array<{ name: string; required: boolean }>; defaultTitle: string; defaultBody: string; warning: string | null; newDefaultAvailable: boolean; allowedActions: string[]; history: Array<{ revision: number; title: string; body: string; createdAt: string; actorName: string }> };
export type NotificationDelivery = { id: string; campaignId: string | null; typeCode: string; recipientLabel: string; channel: NotificationChannel; state: string; reason: string; createdAt: string; lastAttemptAt: string | null; nextAttemptAt: string | null; expiresAt: string | null; templateVersion: number; policyRevision: number; allowedActions: string[]; version: number };
export type DeliveryList = { items: NotificationDelivery[]; total: number; page: number; pageSize: number };
export type NotificationPreferences = { version: number; email: boolean; push: boolean; quietEnabled: boolean; quietStart: string; quietEnd: string; timezone: string; types: Array<{ code: string; name: string; channels: NotificationChannel[]; email: boolean; push: boolean; reason: string }> };
export type NotificationExplanation = { summary: string; recipients: RecipientPreview; channels: Array<{ channel: NotificationChannel; allowed: boolean; reason: string; source: string }>; previews: Array<{ channel: NotificationChannel; context: NotificationWorkspace | null; tenantName: string; title: string; body: string; templateVersion: number }>; warnings: string[]; affectedTenants: number };
export type NotificationResult<T = unknown> = { ok: true; data: T; id?: string; version?: number } | { ok: false; error: string; code?: string };
export const notificationCommands = ["inbox_read", "inbox_unread", "inbox_archive", "inbox_unarchive", "inbox_ack", "inbox_read_all", "campaign_save", "campaign_publish", "campaign_pause", "campaign_resume", "campaign_cancel", "campaign_duplicate", "policy_save", "template_save", "template_publish", "template_reset", "preferences_save", "delivery_retry", "grant_save", "grant_revoke"] as const;
export type NotificationCommand = typeof notificationCommands[number];
export const notificationCommandSchema = z.enum(notificationCommands);
export const notificationScopeSchema = z.object({ all: z.boolean().default(false), personnelIds: z.array(z.uuid()).max(200).default([]), objectIds: z.array(z.uuid()).max(200).default([]), customerIds: z.array(z.uuid()).max(200).default([]), tenantIds: z.array(z.uuid()).max(200).default([]) }).strict();
export type NotificationScope = z.infer<typeof notificationScopeSchema>;
export type NotificationGrant = { id: string; userId: string; userLabel: string; capability: string; scope: NotificationScope; active: boolean; version: number; canRevoke: boolean };
export type NotificationPermissions = { members: Choice[]; catalog: Array<{ key: string; label: string; description: string; sensitive: boolean; dependencies: string[]; scopes: string[] }>; grants: NotificationGrant[]; scopeOptions: { personnel: Choice[]; objects: Choice[]; customers: Choice[]; tenants: Choice[] }; delegationScope: NotificationScope; audit: NotificationSettings["audit"] };
export function notificationQueryFromSearch(raw: Record<string, string | string[] | undefined>) { return notificationQuerySchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([k, v]) => v !== "" || !["channel", "context", "tenantId"].includes(k as string)))); }

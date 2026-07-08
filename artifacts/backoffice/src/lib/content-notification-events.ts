import {
  auditLogTable,
  customerNotificationsTable,
  customersTable,
  db,
  domainEventsTable,
  listEnabledKnowledgebaseModuleKeysForTenant,
  notificationDeliveryQueueTable,
  notificationEventSettingsTable,
  personnelNotificationsTable,
  personnelTable,
  TENANT_RUNTIME_ACTIVE_STATUSES,
  tenantUsersTable,
  tenantsTable,
  type FieldgridContentAudience,
} from "@workspace/db";
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { getEffectiveUserPermissions } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { triggerNotificationWorker } from "@/lib/notification-worker";

type JsonRecord = Record<string, unknown>;

export type FieldgridContentNotificationKey =
  | "kb_article_published"
  | "kb_article_updated"
  | "kb_article_featured"
  | "roadmap_request_submitted"
  | "roadmap_status_changed"
  | "roadmap_comment_added"
  | "roadmap_item_done"
  | "release_published"
  | "release_featured"
  | "release_highlight_active";

type FieldgridContentNotificationFallback = {
  title: string;
  body: string;
  emailSubject?: string;
  pushTitle?: string;
  pushBody?: string;
  category: string;
  priority?: "low" | "normal" | "high";
  href: string;
};

type FieldgridContentNotificationInput = {
  eventKey: FieldgridContentNotificationKey;
  actorUserId?: string | null;
  tenantIds?: string[];
  moduleKeys?: string[];
  requiredModuleKeys?: string[];
  audienceKeys?: FieldgridContentAudience[];
  permissionKeys?: string[];
  requiredPermissionKeys: string[];
  aggregate: {
    type: string;
    id: string;
  };
  payload: JsonRecord;
  fallback: FieldgridContentNotificationFallback;
};

type TenantTarget = {
  id: string;
  name: string;
  slug: string;
};

type ManagementRecipient = {
  userId: string;
  email: string | null;
};

const BACKOFFICE_AUDIENCES = new Set<FieldgridContentAudience>([
  "tenant_admin",
  "tenant_management",
  "tenant_planning",
  "tenant_administration",
]);

const TENANT_NOTIFICATION_AUDIENCES = new Set<FieldgridContentAudience>([
  ...BACKOFFICE_AUDIENCES,
  "tenant_personnel",
  "tenant_customer",
]);

function uniqueStrings(values: Array<string | null | undefined> | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function getNestedValue(payload: JsonRecord, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as JsonRecord)[part];
  }, payload);
}

function renderTemplate(template: string | null | undefined, payload: JsonRecord): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = getNestedValue(payload, key);
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(title: string, body: string, href: string): string {
  const paragraphs = body
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 14px">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const button = href
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#081d3a;color:#fff;text-decoration:none;border-radius:8px;padding:12px 16px;font-weight:700">Openen</a></p>`
    : "";

  return [
    "<!doctype html>",
    '<html lang="nl">',
    '<body style="margin:0;padding:24px;background:#f3f6fa;font-family:Arial,sans-serif;color:#0b1f3f">',
    '<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dbe4ef">',
    '<div style="background:#081d3a;padding:22px 26px;color:#fff;font-weight:700;letter-spacing:.18em">MELDING</div>',
    '<div style="padding:28px 26px">',
    `<h1 style="font-size:22px;line-height:1.25;margin:0 0 16px;color:#0b1f3f">${escapeHtml(title)}</h1>`,
    paragraphs || "<p>Er is een update.</p>",
    button,
    "</div>",
    '<div style="padding:16px 26px;background:#f8fafc;color:#64748b;font-size:12px">Dit is een automatisch bericht.</div>',
    "</div>",
    "</body>",
    "</html>",
  ].join("");
}

function hasBackofficeAudience(audienceKeys: FieldgridContentAudience[]): boolean {
  return audienceKeys.length === 0 || audienceKeys.some((audience) => BACKOFFICE_AUDIENCES.has(audience));
}

function hasAudience(audienceKeys: FieldgridContentAudience[], audience: FieldgridContentAudience): boolean {
  return audienceKeys.length === 0 || audienceKeys.includes(audience);
}

function hasTenantNotificationAudience(audienceKeys: FieldgridContentAudience[]): boolean {
  return audienceKeys.length === 0 || audienceKeys.some((audience) => TENANT_NOTIFICATION_AUDIENCES.has(audience));
}

async function listRuntimeTenants(tenantIds?: string[]): Promise<TenantTarget[]> {
  const conditions: SQL[] = [
    eq(tenantsTable.isActive, true),
    inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
  ];
  const normalizedTenantIds = uniqueStrings(tenantIds);
  if (normalizedTenantIds.length > 0) conditions.push(inArray(tenantsTable.id, normalizedTenantIds));

  return db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      slug: tenantsTable.slug,
    })
    .from(tenantsTable)
    .where(and(...conditions))
    .orderBy(asc(tenantsTable.name));
}

async function tenantMatchesModuleScope(
  tenantId: string,
  moduleKeys: string[],
  requiredModuleKeys: string[],
): Promise<boolean> {
  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(tenantId);
  if (!activeModuleKeys.includes("notifications")) return false;

  if (requiredModuleKeys.length > 0 && !requiredModuleKeys.every((moduleKey) => activeModuleKeys.includes(moduleKey))) {
    return false;
  }

  if (moduleKeys.length === 0) return true;
  return moduleKeys.some((moduleKey) => activeModuleKeys.includes(moduleKey));
}

async function authEmailsByUserId(userIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (userIds.length === 0) return result;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    console.error("[content-notifications] auth users lookup failed", error);
    return result;
  }

  const wanted = new Set(userIds);
  for (const user of data.users) {
    if (wanted.has(user.id) && user.email) result.set(user.id, user.email);
  }

  return result;
}

async function personnelEmailsByUserId(tenantId: string, userIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (userIds.length === 0) return result;

  const rows = await db
    .select({
      userId: personnelTable.userId,
      email: personnelTable.email,
    })
    .from(personnelTable)
    .where(and(eq(personnelTable.tenantId, tenantId), inArray(personnelTable.userId, userIds), eq(personnelTable.isActive, true)));

  for (const row of rows) {
    if (row.userId && row.email) result.set(row.userId, row.email);
  }

  return result;
}

async function listManagementRecipients(
  tenantId: string,
  requiredPermissionKeys: string[],
): Promise<ManagementRecipient[]> {
  const users = await db
    .select({ userId: tenantUsersTable.userId })
    .from(tenantUsersTable)
    .where(and(eq(tenantUsersTable.tenantId, tenantId), eq(tenantUsersTable.status, "active")));

  const userIds = uniqueStrings(users.map((user) => user.userId));
  const allowedUserIds: string[] = [];

  for (const userId of userIds) {
    const permissions = await getEffectiveUserPermissions(userId, tenantId);
    if (requiredPermissionKeys.every((permission) => permissions.has(permission))) {
      allowedUserIds.push(userId);
    }
  }

  const [authEmails, personnelEmails] = await Promise.all([
    authEmailsByUserId(allowedUserIds),
    personnelEmailsByUserId(tenantId, allowedUserIds),
  ]);

  return allowedUserIds.map((userId) => ({
    userId,
    email: authEmails.get(userId) ?? personnelEmails.get(userId) ?? null,
  }));
}

async function listPersonnelRecipients(tenantId: string) {
  return db
    .select({
      id: personnelTable.id,
      email: personnelTable.email,
      emailEnabled: personnelTable.notificationEmailEnabled,
      pushEnabled: personnelTable.notificationPushEnabled,
    })
    .from(personnelTable)
    .where(and(eq(personnelTable.tenantId, tenantId), eq(personnelTable.isActive, true)));
}

async function listCustomerRecipients(tenantId: string) {
  return db
    .select({
      id: customersTable.id,
      contactEmail: customersTable.contactEmail,
    })
    .from(customersTable)
    .where(and(eq(customersTable.tenantId, tenantId), eq(customersTable.isActive, true)));
}

export async function emitFieldgridContentNotification(input: FieldgridContentNotificationInput): Promise<void> {
  const moduleKeys = uniqueStrings(input.moduleKeys);
  const requiredModuleKeys = uniqueStrings(input.requiredModuleKeys);
  const audienceKeys = input.audienceKeys ?? [];
  const permissionKeys = uniqueStrings([...input.requiredPermissionKeys, ...(input.permissionKeys ?? [])]);
  if (!hasTenantNotificationAudience(audienceKeys)) return;

  const tenants = await listRuntimeTenants(input.tenantIds);
  if (tenants.length === 0) return;

  const [setting] = await db
    .select()
    .from(notificationEventSettingsTable)
    .where(eq(notificationEventSettingsTable.eventKey, input.eventKey))
    .limit(1);

  const payload = {
    ...input.payload,
    eventKey: input.eventKey,
    href: input.fallback.href,
    backofficeHref: input.fallback.href,
  };
  const title = renderTemplate(setting?.title ?? input.fallback.title, payload).slice(0, 180);
  const body = renderTemplate(setting?.description ?? input.fallback.body, payload);
  const emailSubject = renderTemplate(setting?.emailSubject ?? input.fallback.emailSubject ?? input.fallback.title, payload).slice(0, 240);
  const pushTitle = renderTemplate(setting?.pushTitle ?? input.fallback.pushTitle ?? input.fallback.title, payload).slice(0, 120);
  const pushBody = renderTemplate(setting?.pushBody ?? input.fallback.pushBody ?? input.fallback.body, payload).slice(0, 500);
  const emailHtml = renderTemplate(setting?.emailBody, payload) || buildEmailHtml(title, body, input.fallback.href);
  const category = input.fallback.category;
  const priority = input.fallback.priority ?? "normal";

  const emailEnabled = setting?.emailEnabled ?? true;
  const pushEnabled = setting?.pushEnabled ?? false;
  const inAppEnabled = setting?.inAppEnabled ?? true;
  let queuedDeliveries = 0;

  for (const tenant of tenants) {
    if (!await tenantMatchesModuleScope(tenant.id, moduleKeys, requiredModuleKeys)) continue;

    const [event] = await db
      .insert(domainEventsTable)
      .values({
        tenantId: tenant.id,
        eventKey: input.eventKey,
        actorUserId: input.actorUserId ?? null,
        audience: audienceKeys.includes("tenant_customer")
          ? audienceKeys.includes("tenant_personnel") || hasBackofficeAudience(audienceKeys) ? "mixed" : "customer"
          : audienceKeys.includes("tenant_personnel") ? hasBackofficeAudience(audienceKeys) ? "mixed" : "personnel" : "management",
        aggregateType: input.aggregate.type,
        aggregateId: input.aggregate.id,
        payload: {
          ...payload,
          tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
          moduleKeys,
          requiredModuleKeys,
          audienceKeys,
          permissionKeys,
        },
        dispatchStatus: "queued",
      })
      .returning({ id: domainEventsTable.id });

    if (!event) continue;

    const queueRows: Array<typeof notificationDeliveryQueueTable.$inferInsert> = [];

    if (hasBackofficeAudience(audienceKeys)) {
      const managementRecipients = await listManagementRecipients(tenant.id, permissionKeys);
      if (emailEnabled) {
        queueRows.push(...managementRecipients
          .filter((recipient) => Boolean(recipient.email))
          .map((recipient) => ({
            tenantId: tenant.id,
            eventKey: input.eventKey,
            channel: "email" as const,
            recipientType: "management",
            recipientEmail: recipient.email,
            subject: emailSubject,
            title,
            body,
            html: emailHtml,
            payload: {
              ...payload,
              href: input.fallback.href,
              backofficeHref: input.fallback.href,
              priority,
              recipientUserId: recipient.userId,
            },
            idempotencyKey: `${event.id}:management:${recipient.userId}:email`,
          })));
      }
    }

    if (hasAudience(audienceKeys, "tenant_personnel")) {
      const personnel = await listPersonnelRecipients(tenant.id);
      if (inAppEnabled && personnel.length > 0) {
        await db.insert(personnelNotificationsTable).values(
          personnel.map((recipient) => ({
            tenantId: tenant.id,
            personnelId: recipient.id,
            title,
            body,
            category: "system" as const,
            priority,
            sourceLabel: "Melding",
            href: input.fallback.href,
          })),
        );
      }

      for (const recipient of personnel) {
        if (emailEnabled && recipient.emailEnabled && recipient.email) {
          queueRows.push({
            tenantId: tenant.id,
            eventKey: input.eventKey,
            channel: "email",
            recipientType: "personnel",
            personnelId: recipient.id,
            recipientEmail: recipient.email,
            subject: emailSubject,
            title,
            body,
            html: emailHtml,
            payload: { ...payload, href: input.fallback.href, priority },
            idempotencyKey: `${event.id}:personnel:${recipient.id}:email`,
          });
        }
        if (pushEnabled && recipient.pushEnabled) {
          queueRows.push({
            tenantId: tenant.id,
            eventKey: input.eventKey,
            channel: "push",
            recipientType: "personnel",
            personnelId: recipient.id,
            title: pushTitle,
            body: pushBody,
            payload: { ...payload, href: input.fallback.href, priority },
            idempotencyKey: `${event.id}:personnel:${recipient.id}:push`,
          });
        }
      }
    }

    if (hasAudience(audienceKeys, "tenant_customer")) {
      const customers = await listCustomerRecipients(tenant.id);
      if (inAppEnabled && customers.length > 0) {
        await db.insert(customerNotificationsTable).values(
          customers.map((recipient) => ({
            tenantId: tenant.id,
            customerId: recipient.id,
            title,
            body,
            category,
            priority,
            sourceLabel: "Melding",
            href: input.fallback.href,
          })),
        );
      }

      for (const recipient of customers) {
        if (emailEnabled && recipient.contactEmail) {
          queueRows.push({
            tenantId: tenant.id,
            eventKey: input.eventKey,
            channel: "email",
            recipientType: "customer",
            customerId: recipient.id,
            recipientEmail: recipient.contactEmail,
            subject: emailSubject,
            title,
            body,
            html: emailHtml,
            payload: { ...payload, href: input.fallback.href, priority },
            idempotencyKey: `${event.id}:customer:${recipient.id}:email`,
          });
        }
        if (pushEnabled) {
          queueRows.push({
            tenantId: tenant.id,
            eventKey: input.eventKey,
            channel: "push",
            recipientType: "customer",
            customerId: recipient.id,
            title: pushTitle,
            body: pushBody,
            payload: { ...payload, href: input.fallback.href, priority },
            idempotencyKey: `${event.id}:customer:${recipient.id}:push`,
          });
        }
      }
    }

    if (queueRows.length > 0) {
      await db.insert(notificationDeliveryQueueTable).values(queueRows).onConflictDoNothing();
      queuedDeliveries += queueRows.length;
    }

    await db
      .update(domainEventsTable)
      .set({
        dispatchStatus: queueRows.length > 0 || inAppEnabled ? "dispatched" : "recorded",
      })
      .where(eq(domainEventsTable.id, event.id));

    if (input.actorUserId) {
      await db.insert(auditLogTable).values({
        tenantId: tenant.id,
        userId: input.actorUserId,
        action: "content_notification_event_emitted",
        resource: input.aggregate.type,
        resourceId: input.aggregate.id,
        metadata: {
          eventKey: input.eventKey,
          domainEventId: event.id,
          queuedDeliveries: queueRows.length,
          audienceKeys,
          moduleKeys,
          permissionKeys,
        },
      });
    }
  }

  if (queuedDeliveries > 0) {
    await triggerNotificationWorker({ channels: ["email", "push"], limit: Math.min(Math.max(queuedDeliveries, 25), 250) });
  }
}

import { and, eq, inArray } from "drizzle-orm";
import {
  auditLogTable,
  customerNotificationsTable,
  customersTable,
  DEFAULT_TENANT_ID,
  domainEventsTable,
  db,
  notificationDeliveryQueueTable,
  notificationEventSettingsTable,
  personnelNotificationsTable,
  personnelTable,
  type NotificationEventSetting,
} from "./index";

type JsonRecord = Record<string, unknown>;

export type DomainEventRecipientInput = {
  customerIds?: string[];
  personnelIds?: string[];
};

export type DomainEventFallbackTemplate = {
  title: string;
  body?: string;
  category?: string;
  priority?: "low" | "normal" | "high";
  href?: string;
  sourceLabel?: string;
  emailSubject?: string;
  emailHtml?: string;
  pushTitle?: string;
  pushBody?: string;
};

export type DomainEventAuditInput = {
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: JsonRecord | null;
};

export type EmitDomainEventInput = {
  eventKey: string;
  tenantId?: string | null;
  actorUserId?: string | null;
  audience?: "customer" | "personnel" | "management" | "mixed";
  aggregate?: {
    type: string;
    id?: string | null;
  };
  payload?: JsonRecord;
  recipients?: DomainEventRecipientInput;
  fallback: DomainEventFallbackTemplate;
  audit?: DomainEventAuditInput | false;
};

export type EmitDomainEventResult = {
  eventId: string;
  personnelNotifications: number;
  customerNotifications: number;
  queuedDeliveries: number;
};

const PERSONNEL_CATEGORIES = new Set(["planning", "news", "hours", "system", "message"]);

function getNestedValue(payload: JsonRecord, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
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

function asPersonnelCategory(category: string | undefined): "planning" | "news" | "hours" | "system" | "message" {
  if (category && PERSONNEL_CATEGORIES.has(category)) {
    return category as "planning" | "news" | "hours" | "system" | "message";
  }
  return "system";
}

function buildPlainHtml(title: string, body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 14px">${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return [
    "<!doctype html>",
    '<html lang="nl">',
    '<body style="margin:0;padding:24px;background:#f3f6fa;font-family:Arial,sans-serif;color:#0b1f3f">',
    '<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dbe4ef">',
    '<div style="background:#08224a;padding:22px 26px;color:#fff;font-weight:700;letter-spacing:.18em">VEELE SERVICES</div>',
    '<div style="padding:28px 26px">',
    `<h1 style="font-size:22px;line-height:1.25;margin:0 0 16px;color:#0b1f3f">${title}</h1>`,
    paragraphs || "<p>Er is een update in het Veele Services platform.</p>",
    "</div>",
    '<div style="padding:16px 26px;background:#f8fafc;color:#64748b;font-size:12px">Dit is een automatisch bericht van Veele Services.</div>',
    "</div>",
    "</body>",
    "</html>",
  ].join("");
}

async function getEventSetting(eventKey: string): Promise<NotificationEventSetting | null> {
  const [setting] = await db
    .select()
    .from(notificationEventSettingsTable)
    .where(eq(notificationEventSettingsTable.eventKey, eventKey))
    .limit(1);

  return setting ?? null;
}

export async function emitDomainEvent(input: EmitDomainEventInput): Promise<EmitDomainEventResult> {
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const payload: JsonRecord = {
    ...(input.payload ?? {}),
    eventKey: input.eventKey,
  };
  const setting = await getEventSetting(input.eventKey);

  const title = renderTemplate(setting?.title ?? input.fallback.title, payload);
  const body = renderTemplate(setting?.description ?? input.fallback.body ?? "", payload);
  const pushTitle = renderTemplate(setting?.pushTitle ?? input.fallback.pushTitle ?? title, payload);
  const pushBody = renderTemplate(setting?.pushBody ?? input.fallback.pushBody ?? body, payload);
  const emailSubject = renderTemplate(
    setting?.emailSubject ?? input.fallback.emailSubject ?? title,
    payload,
  );
  const emailHtml = renderTemplate(
    setting?.emailBody ?? input.fallback.emailHtml ?? buildPlainHtml(title, body),
    payload,
  );
  const href = input.fallback.href ?? (typeof payload["href"] === "string" ? payload["href"] : undefined);
  const category = input.fallback.category ?? setting?.eventGroup ?? "system";
  const priority = input.fallback.priority ?? "normal";

  const [event] = await db
    .insert(domainEventsTable)
    .values({
      tenantId,
      eventKey: input.eventKey,
      actorUserId: input.actorUserId ?? null,
      audience: input.audience ?? setting?.audience ?? "management",
      aggregateType: input.aggregate?.type ?? null,
      aggregateId: input.aggregate?.id ?? null,
      payload,
      dispatchStatus: "queued",
    })
    .returning({ id: domainEventsTable.id });

  if (!event) {
    throw new Error(`Domain event ${input.eventKey} kon niet worden vastgelegd.`);
  }

  if (input.audit && input.actorUserId) {
    await db.insert(auditLogTable).values({
      userId: input.actorUserId,
      action: input.audit.action,
      resource: input.audit.resource,
      resourceId: input.audit.resourceId ?? input.aggregate?.id ?? null,
      metadata: {
        ...(input.audit.metadata ?? {}),
        domainEventId: event.id,
        eventKey: input.eventKey,
      },
    });
  }

  let personnelNotifications = 0;
  let customerNotifications = 0;
  let queuedDeliveries = 0;

  const personnelIds = input.recipients?.personnelIds?.filter(Boolean) ?? [];
  if (personnelIds.length > 0) {
    const personnel = await db
      .select({
        id: personnelTable.id,
        email: personnelTable.email,
        emailEnabled: personnelTable.notificationEmailEnabled,
        pushEnabled: personnelTable.notificationPushEnabled,
      })
      .from(personnelTable)
      .where(and(inArray(personnelTable.id, personnelIds), eq(personnelTable.isActive, true)));

    if ((setting?.inAppEnabled ?? true) && personnel.length > 0) {
      await db.insert(personnelNotificationsTable).values(
        personnel.map((person) => ({
          tenantId,
          personnelId: person.id,
          title,
          body,
          category: asPersonnelCategory(category),
          priority,
          sourceLabel: input.fallback.sourceLabel ?? "Veele Services",
          href,
        })),
      );
      personnelNotifications += personnel.length;
    }

    const rows = personnel.flatMap((person) => {
      const result: Array<typeof notificationDeliveryQueueTable.$inferInsert> = [];
      if ((setting?.emailEnabled ?? false) && person.emailEnabled && person.email) {
        result.push({
          tenantId,
          eventKey: input.eventKey,
          channel: "email",
          recipientType: "personnel",
          personnelId: person.id,
          recipientEmail: person.email,
          subject: emailSubject,
          title,
          body,
          html: emailHtml,
          payload: { ...payload, href },
        });
      }
      if ((setting?.pushEnabled ?? false) && person.pushEnabled) {
        result.push({
          tenantId,
          eventKey: input.eventKey,
          channel: "push",
          recipientType: "personnel",
          personnelId: person.id,
          title: pushTitle,
          body: pushBody,
          payload: { ...payload, href, priority },
        });
      }
      return result;
    });

    if (rows.length > 0) {
      await db.insert(notificationDeliveryQueueTable).values(rows);
      queuedDeliveries += rows.length;
    }
  }

  const customerIds = input.recipients?.customerIds?.filter(Boolean) ?? [];
  if (customerIds.length > 0) {
    const customers = await db
      .select({
        id: customersTable.id,
        contactEmail: customersTable.contactEmail,
      })
      .from(customersTable)
      .where(and(inArray(customersTable.id, customerIds), eq(customersTable.isActive, true)));

    if ((setting?.inAppEnabled ?? true) && customers.length > 0) {
      await db.insert(customerNotificationsTable).values(
        customers.map((customer) => ({
          tenantId,
          customerId: customer.id,
          title,
          body,
          category,
          priority,
          sourceLabel: input.fallback.sourceLabel ?? "Veele Services",
          href,
        })),
      );
      customerNotifications += customers.length;
    }

    const rows = customers.flatMap((customer) => {
      const result: Array<typeof notificationDeliveryQueueTable.$inferInsert> = [];
      if ((setting?.emailEnabled ?? false) && customer.contactEmail) {
        result.push({
          tenantId,
          eventKey: input.eventKey,
          channel: "email",
          recipientType: "customer",
          customerId: customer.id,
          recipientEmail: customer.contactEmail,
          subject: emailSubject,
          title,
          body,
          html: emailHtml,
          payload: { ...payload, href },
        });
      }
      if (setting?.pushEnabled ?? false) {
        result.push({
          tenantId,
          eventKey: input.eventKey,
          channel: "push",
          recipientType: "customer",
          customerId: customer.id,
          title: pushTitle,
          body: pushBody,
          payload: { ...payload, href, priority },
        });
      }
      return result;
    });

    if (rows.length > 0) {
      await db.insert(notificationDeliveryQueueTable).values(rows);
      queuedDeliveries += rows.length;
    }
  }

  await db
    .update(domainEventsTable)
    .set({
      dispatchStatus: queuedDeliveries > 0 || personnelNotifications > 0 || customerNotifications > 0
        ? "dispatched"
        : "recorded",
    })
    .where(eq(domainEventsTable.id, event.id));

  return {
    eventId: event.id,
    personnelNotifications,
    customerNotifications,
    queuedDeliveries,
  };
}

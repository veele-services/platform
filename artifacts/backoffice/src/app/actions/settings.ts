"use server";

import { db } from "@workspace/db";
import {
  organizationSettingsTable,
  rolesTable,
  permissionsTable,
  rolePermissionsTable,
  userRolesTable,
  auditLogTable,
  customerNotificationsTable,
  customersTable,
  customerPortalPreferencesTable,
  notificationDeliveryQueueTable,
  notificationDispatchesTable,
  notificationEventSettingsTable,
  personnelTable,
  personnelNotificationsTable,
  sectorsTable,
} from "@workspace/db";
import {
  eq,
  and,
  or,
  asc,
  desc,
  sql,
  inArray,
  ilike,
  gte,
  lte,
  exists,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import type { ActionResult } from "./customers";

export type { ActionResult };

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrgSettings = {
  id: string;
  naam: string;
  adres: string | null;
  kvkNummer: string | null;
  btwNummer: string | null;
  logoUrl: string | null;
  betaaltermijnDagen: number;
  availabilityAdvanceDays: number;
  emailAfzender: string | null;
  smtpEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpEncryption: "none" | "starttls" | "tls";
  smtpUsername: string | null;
  smtpPasswordConfigured: boolean;
  smtpFromName: string | null;
  smtpFromEmail: string | null;
  smtpReplyTo: string | null;
  emailTemplateBrandColor: string;
  emailTemplateAccentColor: string;
  emailTemplateFooterText: string;
  emailTemplateSignature: string;
  notifRapportGoedgekeurd: boolean;
  notifRapportAfgekeurd: boolean;
  notifOfferteVerstuurd: boolean;
  notifOfferteVerlopen: boolean;
  notifBetalingHerinnering: boolean;
  notifHerinneringDagen: number;
};

export type PermissionItem = {
  id: string;
  resource: string;
  action: string;
  description: string | null;
};

export type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permCount: number;
};

export type RoleDetail = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: PermissionItem[];
  allPermissions: PermissionItem[];
};

export type UserRow = {
  userId: string;
  name: string | null;
  email: string;
  roles: string[];
  roleIds: string[];
  status: "actief" | "uitgenodigd" | "inactief";
  createdAt: string;
};

export type AuditLogEntry = {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

// ─── Organisation settings ────────────────────────────────────────────────────

export async function getOrganizationSettings(): Promise<OrgSettings | null> {
  await requirePermission("settings", "read");

  const rows = await db.select().from(organizationSettingsTable).limit(1);

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    naam: r.naam,
    adres: r.adres,
    kvkNummer: r.kvkNummer,
    btwNummer: r.btwNummer,
    logoUrl: r.logoUrl,
    betaaltermijnDagen: r.betaaltermijnDagen,
    availabilityAdvanceDays: r.availabilityAdvanceDays,
    emailAfzender: r.emailAfzender,
    smtpEnabled: r.smtpEnabled,
    smtpHost: r.smtpHost,
    smtpPort: r.smtpPort,
    smtpEncryption:
      (r.smtpEncryption as "none" | "starttls" | "tls") ?? "starttls",
    smtpUsername: r.smtpUsername,
    smtpPasswordConfigured: Boolean(r.smtpPassword),
    smtpFromName: r.smtpFromName,
    smtpFromEmail: r.smtpFromEmail,
    smtpReplyTo: r.smtpReplyTo,
    emailTemplateBrandColor: r.emailTemplateBrandColor,
    emailTemplateAccentColor: r.emailTemplateAccentColor,
    emailTemplateFooterText: r.emailTemplateFooterText,
    emailTemplateSignature: r.emailTemplateSignature,
    notifRapportGoedgekeurd: r.notifRapportGoedgekeurd,
    notifRapportAfgekeurd: r.notifRapportAfgekeurd,
    notifOfferteVerstuurd: r.notifOfferteVerstuurd,
    notifOfferteVerlopen: r.notifOfferteVerlopen,
    notifBetalingHerinnering: r.notifBetalingHerinnering,
    notifHerinneringDagen: r.notifHerinneringDagen,
  };
}

export async function updateOrganizationSettings(data: {
  naam?: string;
  adres?: string | null;
  kvkNummer?: string | null;
  btwNummer?: string | null;
  logoUrl?: string | null;
  betaaltermijnDagen?: number;
  availabilityAdvanceDays?: number;
  emailAfzender?: string | null;
  notifRapportGoedgekeurd?: boolean;
  notifRapportAfgekeurd?: boolean;
  notifOfferteVerstuurd?: boolean;
  notifOfferteVerlopen?: boolean;
  notifBetalingHerinnering?: boolean;
  notifHerinneringDagen?: number;
}): Promise<ActionResult> {
  await requirePermission("settings", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (
    data.availabilityAdvanceDays !== undefined &&
    (data.availabilityAdvanceDays < 7 || data.availabilityAdvanceDays > 365)
  ) {
    return {
      success: false,
      message:
        "Beschikbaarheid vooruit invullen moet tussen 7 en 365 dagen liggen.",
    };
  }

  await db
    .update(organizationSettingsTable)
    .set({ ...data, updatedAt: new Date(), updatedBy: user.id });

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update",
    resource: "settings",
    resourceId: "organization",
    metadata: { fields: Object.keys(data) },
  });

  revalidatePath("/instellingen/organisatie");
  return { success: true };
}

type MailSettingsInput = {
  smtpEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpEncryption: "none" | "starttls" | "tls";
  smtpUsername: string | null;
  smtpPassword?: string | null;
  clearPassword?: boolean;
  smtpFromName: string | null;
  smtpFromEmail: string | null;
  smtpReplyTo: string | null;
};

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

export async function updateMailSettings(
  data: MailSettingsInput,
): Promise<ActionResult> {
  await requirePermission("settings", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = {
    smtpEnabled: data.smtpEnabled,
    smtpHost: data.smtpHost?.trim() || null,
    smtpPort: data.smtpPort,
    smtpEncryption: data.smtpEncryption,
    smtpUsername: data.smtpUsername?.trim() || null,
    smtpFromName: data.smtpFromName?.trim() || null,
    smtpFromEmail: data.smtpFromEmail?.trim() || null,
    smtpReplyTo: data.smtpReplyTo?.trim() || null,
  };

  if (!["none", "starttls", "tls"].includes(payload.smtpEncryption)) {
    return { success: false, message: "Ongeldige SMTP-beveiliging." };
  }
  if (
    payload.smtpPort != null &&
    (payload.smtpPort < 1 || payload.smtpPort > 65535)
  ) {
    return {
      success: false,
      message: "SMTP-poort moet tussen 1 en 65535 liggen.",
    };
  }
  if (payload.smtpEnabled) {
    if (!payload.smtpHost)
      return {
        success: false,
        message: "SMTP-host is verplicht wanneer SMTP actief is.",
      };
    if (!payload.smtpPort)
      return {
        success: false,
        message: "SMTP-poort is verplicht wanneer SMTP actief is.",
      };
    if (!payload.smtpFromEmail || !isEmailLike(payload.smtpFromEmail)) {
      return {
        success: false,
        message:
          "Een geldig afzenderadres is verplicht wanneer SMTP actief is.",
      };
    }
  }
  if (payload.smtpFromEmail && !isEmailLike(payload.smtpFromEmail)) {
    return { success: false, message: "Afzender e-mailadres is ongeldig." };
  }
  if (payload.smtpReplyTo && !isEmailLike(payload.smtpReplyTo)) {
    return { success: false, message: "Reply-to e-mailadres is ongeldig." };
  }

  const updateData: Partial<typeof organizationSettingsTable.$inferInsert> = {
    ...payload,
    updatedAt: new Date(),
    updatedBy: user.id,
  };

  if (data.clearPassword) {
    updateData.smtpPassword = null;
  } else if (data.smtpPassword?.trim()) {
    updateData.smtpPassword = data.smtpPassword.trim();
  }

  await db.update(organizationSettingsTable).set(updateData);

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update_mail_settings",
    resource: "settings",
    resourceId: "mail",
    metadata: {
      smtpEnabled: payload.smtpEnabled,
      smtpHost: payload.smtpHost,
      smtpPort: payload.smtpPort,
      smtpEncryption: payload.smtpEncryption,
      passwordChanged:
        Boolean(data.smtpPassword?.trim()) || Boolean(data.clearPassword),
    },
  });

  revalidatePath("/instellingen/mail");
  revalidatePath("/instellingen/notificaties");
  return { success: true };
}

export type NotificationEventSettingRow = {
  eventKey: string;
  eventGroup: string;
  audience: "customer" | "personnel" | "management" | "mixed";
  title: string;
  description: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  emailSubject: string;
  emailPreheader: string | null;
  emailBody: string;
  pushTitle: string;
  pushBody: string;
  shortcodes: string[];
  updatedAt: string;
};

export type NotificationAudienceOptions = {
  sectors: Array<{ id: string; name: string }>;
  personnel: Array<{
    id: string;
    name: string;
    email: string;
    sectorId: string | null;
    sectorName: string | null;
  }>;
  customers: Array<{
    id: string;
    name: string;
    email: string | null;
    sectorId: string | null;
    sectorName: string | null;
  }>;
};

type NotificationEventUpdateInput = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  emailSubject: string;
  emailPreheader: string | null;
  emailBody: string;
  pushTitle: string;
  pushBody: string;
};

type ManualNotificationInput = {
  audience: "personnel" | "customer" | "both";
  targetMode: "all" | "sector" | "individual";
  sectorIds: string[];
  personnelIds: string[];
  customerIds: string[];
  channels: Array<"email" | "push" | "in_app">;
  priority: "low" | "normal" | "high";
  title: string;
  body: string;
  href?: string | null;
};

function safeTrim(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeShortcodeText(
  value: string,
  replacements: Record<string, string | null | undefined>,
): string {
  return Object.entries(replacements).reduce(
    (current, [key, replacement]) =>
      current.replaceAll(`{{${key}}}`, replacement ?? ""),
    value,
  );
}

function bodyTextToHtml(body: string): string {
  return body
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export async function listNotificationEventSettings(): Promise<
  NotificationEventSettingRow[]
> {
  await requirePermission("settings", "read");

  const rows = await db
    .select()
    .from(notificationEventSettingsTable)
    .orderBy(
      asc(notificationEventSettingsTable.eventGroup),
      asc(notificationEventSettingsTable.title),
    );

  return rows.map((row) => ({
    eventKey: row.eventKey,
    eventGroup: row.eventGroup,
    audience: row.audience,
    title: row.title,
    description: row.description,
    emailEnabled: row.emailEnabled,
    pushEnabled: row.pushEnabled,
    inAppEnabled: row.inAppEnabled,
    emailSubject: row.emailSubject,
    emailPreheader: row.emailPreheader,
    emailBody: row.emailBody,
    pushTitle: row.pushTitle,
    pushBody: row.pushBody,
    shortcodes: row.shortcodes,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function updateNotificationEventSetting(
  eventKey: string,
  data: NotificationEventUpdateInput,
): Promise<ActionResult> {
  await requirePermission("settings", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = {
    emailEnabled: Boolean(data.emailEnabled),
    pushEnabled: Boolean(data.pushEnabled),
    inAppEnabled: Boolean(data.inAppEnabled),
    emailSubject: safeTrim(data.emailSubject, 240),
    emailPreheader: safeTrim(data.emailPreheader, 240) || null,
    emailBody: safeTrim(data.emailBody, 8000),
    pushTitle: safeTrim(data.pushTitle, 120),
    pushBody: safeTrim(data.pushBody, 500),
    updatedAt: new Date(),
    updatedBy: user.id,
  };

  if (!payload.emailSubject) {
    return { success: false, message: "E-mailonderwerp is verplicht." };
  }
  if (!payload.emailBody) {
    return { success: false, message: "E-mailtekst is verplicht." };
  }
  if (!payload.pushTitle || !payload.pushBody) {
    return { success: false, message: "Push titel en tekst zijn verplicht." };
  }

  const [updated] = await db
    .update(notificationEventSettingsTable)
    .set(payload)
    .where(eq(notificationEventSettingsTable.eventKey, eventKey))
    .returning({ eventKey: notificationEventSettingsTable.eventKey });

  if (!updated) return { success: false, message: "Notificatie-event niet gevonden." };

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update_notification_template",
    resource: "settings",
    resourceId: eventKey,
    metadata: {
      emailEnabled: payload.emailEnabled,
      pushEnabled: payload.pushEnabled,
      inAppEnabled: payload.inAppEnabled,
    },
  });

  revalidatePath("/instellingen/notificaties");
  return { success: true };
}

export async function updateEmailTemplateStyle(data: {
  brandColor: string;
  accentColor: string;
  footerText: string;
  signature: string;
}): Promise<ActionResult> {
  await requirePermission("settings", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const colorRegex = /^#[0-9a-fA-F]{6}$/u;
  const brandColor = safeTrim(data.brandColor, 20);
  const accentColor = safeTrim(data.accentColor, 20);
  if (!colorRegex.test(brandColor) || !colorRegex.test(accentColor)) {
    return { success: false, message: "Gebruik geldige hex-kleuren, bijvoorbeeld #081D3A." };
  }

  await db.update(organizationSettingsTable).set({
    emailTemplateBrandColor: brandColor,
    emailTemplateAccentColor: accentColor,
    emailTemplateFooterText: safeTrim(data.footerText, 2000),
    emailTemplateSignature: safeTrim(data.signature, 2000),
    updatedAt: new Date(),
    updatedBy: user.id,
  });

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update_email_template_style",
    resource: "settings",
    resourceId: "notifications",
    metadata: { brandColor, accentColor },
  });

  revalidatePath("/instellingen/notificaties");
  return { success: true };
}

export async function getNotificationAudienceOptions(): Promise<
  NotificationAudienceOptions
> {
  await requirePermission("settings", "read");

  const [sectorRows, personnelRows, customerRows] = await Promise.all([
    db
      .select({ id: sectorsTable.id, name: sectorsTable.name })
      .from(sectorsTable)
      .where(eq(sectorsTable.isActive, true))
      .orderBy(asc(sectorsTable.name)),
    db
      .select({
        id: personnelTable.id,
        firstName: personnelTable.firstName,
        lastName: personnelTable.lastName,
        email: personnelTable.email,
        sectorId: personnelTable.sectorId,
        sectorName: sectorsTable.name,
      })
      .from(personnelTable)
      .leftJoin(sectorsTable, eq(personnelTable.sectorId, sectorsTable.id))
      .where(eq(personnelTable.isActive, true))
      .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName)),
    db
      .select({
        id: customersTable.id,
        name: customersTable.name,
        email: customersTable.contactEmail,
        sectorId: customersTable.sectorId,
        sectorName: sectorsTable.name,
      })
      .from(customersTable)
      .leftJoin(sectorsTable, eq(customersTable.sectorId, sectorsTable.id))
      .where(eq(customersTable.isActive, true))
      .orderBy(asc(customersTable.name)),
  ]);

  return {
    sectors: sectorRows,
    personnel: personnelRows.map((person) => ({
      id: person.id,
      name: `${person.firstName} ${person.lastName}`.trim(),
      email: person.email,
      sectorId: person.sectorId,
      sectorName: person.sectorName,
    })),
    customers: customerRows.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      sectorId: customer.sectorId,
      sectorName: customer.sectorName,
    })),
  };
}

export async function sendManualNotification(
  input: ManualNotificationInput,
): Promise<ActionResult<{
  personnelCount: number;
  customerCount: number;
  emailSuccessCount: number;
  emailFailedCount: number;
}>> {
  await requirePermission("settings", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const title = safeTrim(input.title, 180);
  const body = safeTrim(input.body, 4000);
  const href = safeTrim(input.href, 1000) || null;
  const priority = ["low", "normal", "high"].includes(input.priority)
    ? input.priority
    : "normal";
  const channels = [...new Set(input.channels)].filter((channel) =>
    ["email", "push", "in_app"].includes(channel),
  ) as Array<"email" | "push" | "in_app">;

  if (!title) return { success: false, message: "Titel is verplicht." };
  if (!body) return { success: false, message: "Berichttekst is verplicht." };
  if (channels.length === 0) {
    return { success: false, message: "Kies minimaal een kanaal." };
  }

  const sectorIds = input.sectorIds.filter(Boolean);
  const personnelIds = input.personnelIds.filter(Boolean);
  const customerIds = input.customerIds.filter(Boolean);

  const wantsPersonnel = input.audience === "personnel" || input.audience === "both";
  const wantsCustomers = input.audience === "customer" || input.audience === "both";

  const personnelConditions = [eq(personnelTable.isActive, true)];
  if (input.targetMode === "sector" && sectorIds.length > 0) {
    personnelConditions.push(inArray(personnelTable.sectorId, sectorIds));
  }
  if (input.targetMode === "individual" && personnelIds.length > 0) {
    personnelConditions.push(inArray(personnelTable.id, personnelIds));
  }

  const customerConditions = [eq(customersTable.isActive, true)];
  if (input.targetMode === "sector" && sectorIds.length > 0) {
    customerConditions.push(inArray(customersTable.sectorId, sectorIds));
  }
  if (input.targetMode === "individual" && customerIds.length > 0) {
    customerConditions.push(inArray(customersTable.id, customerIds));
  }

  const [personnelRecipients, customerRecipients] = await Promise.all([
    wantsPersonnel
      ? db
          .select({
            id: personnelTable.id,
            firstName: personnelTable.firstName,
            lastName: personnelTable.lastName,
            email: personnelTable.email,
            emailEnabled: personnelTable.notificationEmailEnabled,
            pushEnabled: personnelTable.notificationPushEnabled,
          })
          .from(personnelTable)
          .where(and(...personnelConditions))
      : Promise.resolve([]),
    wantsCustomers
      ? db
          .select({
            id: customersTable.id,
            name: customersTable.name,
            email: customersTable.contactEmail,
            emailEnabled: customerPortalPreferencesTable.emailNotifications,
            pushEnabled: customerPortalPreferencesTable.pushNotifications,
          })
          .from(customersTable)
          .leftJoin(
            customerPortalPreferencesTable,
            eq(customerPortalPreferencesTable.customerId, customersTable.id),
          )
          .where(and(...customerConditions))
      : Promise.resolve([]),
  ]);

  if (personnelRecipients.length + customerRecipients.length === 0) {
    return { success: false, message: "Geen ontvangers gevonden voor deze selectie." };
  }

  const [dispatch] = await db
    .insert(notificationDispatchesTable)
    .values({
      title,
      body,
      audience: input.audience,
      channels,
      targetCriteria: {
        targetMode: input.targetMode,
        sectorIds,
        personnelIds,
        customerIds,
      },
      sentPersonnelCount: personnelRecipients.length,
      sentCustomerCount: customerRecipients.length,
      createdBy: user.id,
    })
    .returning({ id: notificationDispatchesTable.id });

  if (!dispatch) {
    return { success: false, message: "Notificatie kon niet worden aangemaakt." };
  }

  const createdAt = new Date();
  const inAppEnabled = channels.includes("in_app") || channels.includes("push");
  const pushEnabled = channels.includes("push");
  const emailEnabled = channels.includes("email");

  await db.transaction(async (tx) => {
    if (inAppEnabled && personnelRecipients.length > 0) {
      await tx.insert(personnelNotificationsTable).values(
        personnelRecipients.map((person) => {
          const recipientName = `${person.firstName} ${person.lastName}`.trim();
          return {
            personnelId: person.id,
            title: normalizeShortcodeText(title, {
              "recipient.name": recipientName,
              "personnel.first_name": person.firstName,
              "personnel.name": recipientName,
            }),
            body: normalizeShortcodeText(body, {
              "recipient.name": recipientName,
              "personnel.first_name": person.firstName,
              "personnel.name": recipientName,
            }),
            category: "system" as const,
            priority,
            sourceLabel: "Veele Services",
            href,
            createdAt,
          };
        }),
      );
    }

    if (inAppEnabled && customerRecipients.length > 0) {
      await tx.insert(customerNotificationsTable).values(
        customerRecipients.map((customer) => ({
          customerId: customer.id,
          title: normalizeShortcodeText(title, {
            "recipient.name": customer.name,
            "customer.name": customer.name,
          }),
          body: normalizeShortcodeText(body, {
            "recipient.name": customer.name,
            "customer.name": customer.name,
          }),
          category: "message",
          priority,
          sourceLabel: "Veele Services",
          href,
          createdAt,
        })),
      );
    }

    if (pushEnabled) {
      const queueRows = [
        ...personnelRecipients
          .filter((person) => person.pushEnabled)
          .map((person) => {
            const recipientName = `${person.firstName} ${person.lastName}`.trim();
            return {
              dispatchId: dispatch.id,
              channel: "push" as const,
              recipientType: "personnel",
              personnelId: person.id,
              title: normalizeShortcodeText(title, {
                "recipient.name": recipientName,
                "personnel.first_name": person.firstName,
                "personnel.name": recipientName,
              }),
              body: normalizeShortcodeText(body, {
                "recipient.name": recipientName,
                "personnel.first_name": person.firstName,
                "personnel.name": recipientName,
              }),
              payload: { href, priority },
            };
          }),
        ...customerRecipients
          .filter((customer) => customer.pushEnabled ?? false)
          .map((customer) => ({
            dispatchId: dispatch.id,
            channel: "push" as const,
            recipientType: "customer",
            customerId: customer.id,
            title: normalizeShortcodeText(title, {
              "recipient.name": customer.name,
              "customer.name": customer.name,
            }),
            body: normalizeShortcodeText(body, {
              "recipient.name": customer.name,
              "customer.name": customer.name,
            }),
            payload: { href, priority },
          })),
      ];

      if (queueRows.length > 0) {
        await tx.insert(notificationDeliveryQueueTable).values(queueRows);
      }
    }
  });

  let emailSuccessCount = 0;
  let emailFailedCount = 0;

  if (emailEnabled) {
    const { buildStyledNotificationEmail, sendEmailWithResult } = await import("@/lib/email");
    const emailRows: Array<typeof notificationDeliveryQueueTable.$inferInsert> = [];

    const emailRecipients = [
      ...personnelRecipients
        .filter((person) => person.emailEnabled)
        .map((person) => {
          const recipientName = `${person.firstName} ${person.lastName}`.trim();
          return {
            type: "personnel" as const,
            id: person.id,
            email: person.email,
            name: recipientName,
            firstName: person.firstName,
          };
        }),
      ...customerRecipients
        .filter((customer) => customer.email && (customer.emailEnabled ?? true))
        .map((customer) => ({
          type: "customer" as const,
          id: customer.id,
          email: customer.email!,
          name: customer.name,
          firstName: customer.name,
        })),
    ];

    for (const recipient of emailRecipients) {
      const renderedTitle = normalizeShortcodeText(title, {
        "recipient.name": recipient.name,
        "personnel.first_name": recipient.firstName,
        "personnel.name": recipient.name,
        "customer.name": recipient.name,
      });
      const renderedBody = normalizeShortcodeText(body, {
        "recipient.name": recipient.name,
        "personnel.first_name": recipient.firstName,
        "personnel.name": recipient.name,
        "customer.name": recipient.name,
      });
      const message = await buildStyledNotificationEmail({
        subject: renderedTitle,
        preheader: renderedBody.slice(0, 180),
        bodyHtml: bodyTextToHtml(renderedBody),
        bodyText: renderedBody,
        ctaHref: href,
        ctaLabel: href ? "Open portaal" : null,
      });
      const result = await sendEmailWithResult({
        to: recipient.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      if (result.success) emailSuccessCount += 1;
      else emailFailedCount += 1;

      emailRows.push({
        dispatchId: dispatch.id,
        channel: "email",
        recipientType: recipient.type,
        personnelId: recipient.type === "personnel" ? recipient.id : null,
        customerId: recipient.type === "customer" ? recipient.id : null,
        recipientEmail: recipient.email,
        subject: message.subject,
        title: renderedTitle,
        body: renderedBody,
        html: message.html,
        status: result.success ? "sent" : "failed",
        attempts: 1,
        lastError: result.success ? null : result.error ?? "E-mail verzenden mislukt.",
        sentAt: result.success ? new Date() : null,
      });
    }

    if (emailRows.length > 0) {
      await db.insert(notificationDeliveryQueueTable).values(emailRows);
    }
  }

  await db
    .update(notificationDispatchesTable)
    .set({ emailSuccessCount, emailFailedCount })
    .where(eq(notificationDispatchesTable.id, dispatch.id));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "send_manual_notification",
    resource: "notifications",
    resourceId: dispatch.id,
    metadata: {
      audience: input.audience,
      targetMode: input.targetMode,
      channels,
      personnelCount: personnelRecipients.length,
      customerCount: customerRecipients.length,
      emailSuccessCount,
      emailFailedCount,
    },
  });

  revalidatePath("/instellingen/notificaties");
  return {
    success: true,
    data: {
      personnelCount: personnelRecipients.length,
      customerCount: customerRecipients.length,
      emailSuccessCount,
      emailFailedCount,
    },
  };
}

export async function uploadOrgLogo(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  await requirePermission("settings", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) {
    return { success: false, message: "Geen bestand geselecteerd." };
  }

  if (file.size > 2 * 1024 * 1024) {
    return { success: false, message: "Logo mag maximaal 2 MB zijn." };
  }

  const ext = file.name.split(".").pop() ?? "png";
  const path = `logo.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from("org-assets")
    .upload(path, bytes, {
      contentType: file.type,
      upsert: true,
    });

  if (error) {
    return { success: false, message: `Upload mislukt: ${error.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("org-assets").getPublicUrl(path);

  await db
    .update(organizationSettingsTable)
    .set({ logoUrl: publicUrl, updatedAt: new Date(), updatedBy: user.id });

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update",
    resource: "settings",
    resourceId: "organization",
    metadata: { field: "logo_url" },
  });

  revalidatePath("/instellingen/organisatie");
  return { success: true, data: { url: publicUrl } };
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export async function listRoles(): Promise<RoleRow[]> {
  await requirePermission("roles", "read");

  const rows = await db
    .select({
      id: rolesTable.id,
      name: rolesTable.name,
      description: rolesTable.description,
      isSystem: rolesTable.isSystem,
      userCount: sql<number>`(SELECT COUNT(*) FROM user_roles WHERE role_id = ${rolesTable.id})::int`,
      permCount: sql<number>`(SELECT COUNT(*) FROM role_permissions WHERE role_id = ${rolesTable.id})::int`,
    })
    .from(rolesTable)
    .orderBy(asc(rolesTable.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    userCount: r.userCount,
    permCount: r.permCount,
  }));
}

export async function getRole(id: string): Promise<RoleDetail | null> {
  await requirePermission("roles", "read");

  const [role] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.id, id))
    .limit(1);

  if (!role) return null;

  const [allPerms, rolePermRows] = await Promise.all([
    db
      .select()
      .from(permissionsTable)
      .orderBy(asc(permissionsTable.resource), asc(permissionsTable.action)),
    db
      .select({ permissionId: rolePermissionsTable.permissionId })
      .from(rolePermissionsTable)
      .where(eq(rolePermissionsTable.roleId, id)),
  ]);

  const enabledIds = new Set(rolePermRows.map((r) => r.permissionId));

  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    allPermissions: allPerms.map((p) => ({
      id: p.id,
      resource: p.resource,
      action: p.action,
      description: p.description,
    })),
    permissions: allPerms
      .filter((p) => enabledIds.has(p.id))
      .map((p) => ({
        id: p.id,
        resource: p.resource,
        action: p.action,
        description: p.description,
      })),
  };
}

export async function createRole(data: {
  name: string;
  description: string | null;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission("roles", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const name = data.name.trim();
  if (!name) return { success: false, message: "Naam is verplicht." };

  const existing = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.name, name))
    .limit(1);
  if (existing.length > 0) {
    return { success: false, message: "Er bestaat al een rol met deze naam." };
  }

  const [inserted] = await db
    .insert(rolesTable)
    .values({ name, description: data.description, isSystem: false })
    .returning({ id: rolesTable.id });

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "create",
    resource: "roles",
    resourceId: inserted.id,
    metadata: { name },
  });

  revalidatePath("/instellingen/rollen");
  return { success: true, data: { id: inserted.id } };
}

/**
 * Toggle a single permission on/off for a role.
 * Used by the permission matrix checkboxes for optimistic per-toggle saves.
 */
export async function toggleRolePermission(
  roleId: string,
  permissionId: string,
  enabled: boolean,
): Promise<ActionResult> {
  await requirePermission("roles", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (enabled) {
    await db
      .insert(rolePermissionsTable)
      .values({ roleId, permissionId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(rolePermissionsTable)
      .where(
        and(
          eq(rolePermissionsTable.roleId, roleId),
          eq(rolePermissionsTable.permissionId, permissionId),
        ),
      );
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: enabled ? "grant_permission" : "revoke_permission",
    resource: "roles",
    resourceId: roleId,
    metadata: { permissionId, enabled },
  });

  revalidatePath(`/instellingen/rollen/${roleId}`);
  return { success: true };
}

/**
 * Batch-replace all permissions for a role.
 * Deletes all existing role-permissions and re-inserts the provided set.
 */
export async function updateRolePermissions(
  roleId: string,
  permissionIds: string[],
): Promise<ActionResult> {
  await requirePermission("roles", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  // Delete all existing and re-insert in a single transaction-like sequence
  await db
    .delete(rolePermissionsTable)
    .where(eq(rolePermissionsTable.roleId, roleId));

  if (permissionIds.length > 0) {
    await db
      .insert(rolePermissionsTable)
      .values(permissionIds.map((permissionId) => ({ roleId, permissionId })))
      .onConflictDoNothing();
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update_permissions",
    resource: "roles",
    resourceId: roleId,
    metadata: { permissionCount: permissionIds.length },
  });

  revalidatePath(`/instellingen/rollen/${roleId}`);
  return { success: true };
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function listUsersWithRoles(): Promise<UserRow[]> {
  await requirePermission("users", "read");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`Kan gebruikers niet ophalen: ${error.message}`);

  const authUsers = data.users;
  const userIds = authUsers.map((u) => u.id);
  if (userIds.length === 0) return [];

  const roleRows = await db
    .select({
      userId: userRolesTable.userId,
      roleId: rolesTable.id,
      roleName: rolesTable.name,
    })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(inArray(userRolesTable.userId, userIds));

  const rolesByUser = new Map<string, { names: string[]; ids: string[] }>();
  for (const r of roleRows) {
    const existing = rolesByUser.get(r.userId) ?? { names: [], ids: [] };
    existing.names.push(r.roleName);
    existing.ids.push(r.roleId);
    rolesByUser.set(r.userId, existing);
  }

  return authUsers.map((u) => {
    let status: UserRow["status"] = "actief";
    if (!u.confirmed_at) status = "uitgenodigd";
    else if (u.banned_until && new Date(u.banned_until) > new Date())
      status = "inactief";

    // Extract name from auth metadata (set by invite/profile update)
    const meta = u.user_metadata as Record<string, unknown> | undefined;
    const name = (meta?.full_name ?? meta?.name ?? null) as string | null;

    return {
      userId: u.id,
      name,
      email: u.email ?? "",
      roles: rolesByUser.get(u.id)?.names ?? [],
      roleIds: rolesByUser.get(u.id)?.ids ?? [],
      status,
      createdAt: u.created_at,
    };
  });
}

export async function inviteUser(data: {
  email: string;
  roleId: string;
}): Promise<ActionResult> {
  await requirePermission("users", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const email = data.email.trim().toLowerCase();
  if (!email) return { success: false, message: "E-mailadres is verplicht." };

  const admin = createAdminClient();
  const { data: inviteData, error } =
    await admin.auth.admin.inviteUserByEmail(email);
  if (error) {
    return { success: false, message: `Uitnodiging mislukt: ${error.message}` };
  }

  const invitedUserId = inviteData.user.id;

  await db
    .insert(userRolesTable)
    .values({ userId: invitedUserId, roleId: data.roleId })
    .onConflictDoNothing();

  const [role] = await db
    .select({ name: rolesTable.name })
    .from(rolesTable)
    .where(eq(rolesTable.id, data.roleId))
    .limit(1);

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "invite",
    resource: "users",
    resourceId: invitedUserId,
    metadata: { email, role: role?.name ?? data.roleId },
  });

  revalidatePath("/instellingen/gebruikers");
  return { success: true };
}

export async function deactivateUser(userId: string): Promise<ActionResult> {
  await requirePermission("users", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (userId === user.id) {
    return {
      success: false,
      message: "U kunt uw eigen account niet deactiveren.",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876600h",
  });
  if (error) {
    return { success: false, message: `Deactiveren mislukt: ${error.message}` };
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "deactivate",
    resource: "users",
    resourceId: userId,
    metadata: {},
  });

  revalidatePath("/instellingen/gebruikers");
  return { success: true };
}

/**
 * Resend an invitation by user ID.
 * Looks up the user's email via Admin API, then re-invites.
 */
export async function resendInvite(userId: string): Promise<ActionResult> {
  await requirePermission("users", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const admin = createAdminClient();
  const { data: targetUser, error: fetchError } =
    await admin.auth.admin.getUserById(userId);
  if (fetchError || !targetUser.user.email) {
    return {
      success: false,
      message: "Gebruiker niet gevonden of heeft geen e-mailadres.",
    };
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(
    targetUser.user.email,
  );
  if (error) {
    return {
      success: false,
      message: `Opnieuw versturen mislukt: ${error.message}`,
    };
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "resend_invite",
    resource: "users",
    resourceId: userId,
    metadata: { email: targetUser.user.email },
  });

  revalidatePath("/instellingen/gebruikers");
  return { success: true };
}

/**
 * Delete a custom (non-system) role.
 * Blocked when the role is a system role or when any active users are assigned to it.
 */
export async function deleteRole(roleId: string): Promise<ActionResult> {
  await requirePermission("roles", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [role] = await db
    .select({
      id: rolesTable.id,
      name: rolesTable.name,
      isSystem: rolesTable.isSystem,
    })
    .from(rolesTable)
    .where(eq(rolesTable.id, roleId))
    .limit(1);

  if (!role) return { success: false, message: "Rol niet gevonden." };
  if (role.isSystem) {
    return {
      success: false,
      message: "Systeemrollen kunnen niet worden verwijderd.",
    };
  }

  // Count only active users: personnel with is_active=true, or users not in
  // the personnel table (management users — assumed active at DB level).
  const [{ userCount }] = await db
    .select({ userCount: sql<number>`count(*)::int` })
    .from(userRolesTable)
    .leftJoin(personnelTable, eq(personnelTable.userId, userRolesTable.userId))
    .where(
      and(
        eq(userRolesTable.roleId, roleId),
        or(
          sql`${personnelTable.isActive} IS NULL`,
          eq(personnelTable.isActive, true),
        ),
      ),
    );

  if (userCount > 0) {
    return {
      success: false,
      message: `Rol heeft ${userCount} actieve gebruiker${userCount !== 1 ? "s" : ""}. Herken eerst de gebruikers.`,
    };
  }

  await db
    .delete(rolePermissionsTable)
    .where(eq(rolePermissionsTable.roleId, roleId));
  await db.delete(rolesTable).where(eq(rolesTable.id, roleId));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "delete",
    resource: "roles",
    resourceId: roleId,
    metadata: { name: role.name },
  });

  revalidatePath("/instellingen/rollen");
  return { success: true };
}

export async function updateUserRoles(
  userId: string,
  roleIds: string[],
): Promise<ActionResult> {
  await requirePermission("users", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (userId === user.id && roleIds.length === 0) {
    return {
      success: false,
      message: "U kunt uw eigen rollen niet volledig verwijderen.",
    };
  }

  await db.delete(userRolesTable).where(eq(userRolesTable.userId, userId));

  if (roleIds.length > 0) {
    await db
      .insert(userRolesTable)
      .values(roleIds.map((roleId) => ({ userId, roleId })))
      .onConflictDoNothing();
  }

  const assignedRoles =
    roleIds.length > 0
      ? await db
          .select({ name: rolesTable.name })
          .from(rolesTable)
          .where(inArray(rolesTable.id, roleIds))
      : [];

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update_roles",
    resource: "users",
    resourceId: userId,
    metadata: { roleIds, roleNames: assignedRoles.map((r) => r.name) },
  });

  revalidatePath("/instellingen/gebruikers");
  return { success: true };
}

const AUDIT_PAGE_SIZE = 25;

/**
 * Paginated, filterable audit log query across all resources.
 * Resolves actor names via LEFT JOIN on personnelTable (for field staff)
 * and via the Supabase Admin API (for management users not in personnel).
 */
export async function listAuditLog(
  params: {
    page?: number;
    search?: string;
    module?: string;
    dateFrom?: string;
    dateTo?: string;
    roleId?: string;
  } = {},
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  await requirePermission("settings", "read");

  const {
    page = 1,
    search = "",
    module = "",
    dateFrom = "",
    dateTo = "",
    roleId = "",
  } = params;

  const conditions = [];

  if (search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(auditLogTable.action, q),
        ilike(auditLogTable.resource, q),
        ilike(personnelTable.firstName, q),
        ilike(personnelTable.lastName, q),
        ilike(personnelTable.email, q),
      ),
    );
  }
  if (module) {
    conditions.push(eq(auditLogTable.resource, module));
  }
  if (dateFrom) {
    conditions.push(gte(auditLogTable.createdAt, new Date(dateFrom)));
  }
  if (dateTo) {
    // Make dateTo inclusive: advance by 1 day so lte covers the full final day
    const end = new Date(dateTo);
    end.setDate(end.getDate() + 1);
    conditions.push(lte(auditLogTable.createdAt, end));
  }
  if (roleId) {
    // Filter by actor role: only show entries where the user has this role assigned
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(userRolesTable)
          .where(
            and(
              eq(userRolesTable.userId, auditLogTable.userId),
              eq(userRolesTable.roleId, roleId),
            ),
          ),
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }], adminData] = await Promise.all([
    db
      .select({
        id: auditLogTable.id,
        userId: auditLogTable.userId,
        action: auditLogTable.action,
        resource: auditLogTable.resource,
        resourceId: auditLogTable.resourceId,
        metadata: auditLogTable.metadata,
        createdAt: auditLogTable.createdAt,
        pFirstName: personnelTable.firstName,
        pLastName: personnelTable.lastName,
        pEmail: personnelTable.email,
      })
      .from(auditLogTable)
      .leftJoin(personnelTable, eq(personnelTable.userId, auditLogTable.userId))
      .where(where)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogTable)
      .leftJoin(personnelTable, eq(personnelTable.userId, auditLogTable.userId))
      .where(where),

    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const authMap = new Map(
    (adminData.data?.users ?? []).map((u) => {
      const meta = u.user_metadata as
        | { full_name?: string; name?: string }
        | undefined;
      return [
        u.id,
        { email: u.email ?? u.id, name: meta?.full_name ?? meta?.name ?? null },
      ] as const;
    }),
  );

  return {
    entries: rows.map((r) => {
      const personnelName =
        r.pFirstName && r.pLastName ? `${r.pFirstName} ${r.pLastName}` : null;
      const auth = authMap.get(r.userId);
      return {
        id: r.id,
        userId: r.userId,
        userEmail: r.pEmail ?? auth?.email ?? r.userId,
        userName: personnelName ?? auth?.name ?? null,
        action: r.action,
        resource: r.resource,
        resourceId: r.resourceId,
        metadata: r.metadata as Record<string, unknown> | null,
        createdAt: r.createdAt.toISOString(),
      };
    }),
    total: count,
  };
}

// ─── Test-notificatie ─────────────────────────────────────────────────────────

/**
 * Sends a test e-mail to the configured emailAfzender address.
 * Used by the notification settings page to verify e-mail delivery.
 */
export async function sendTestNotification(
  type: string,
  label: string,
): Promise<ActionResult> {
  await requirePermission("settings", "write");

  const [orgSettings] = await db
    .select({ emailAfzender: organizationSettingsTable.emailAfzender })
    .from(organizationSettingsTable)
    .limit(1);

  if (!orgSettings?.emailAfzender) {
    return {
      success: false,
      message: "Geen afzenderadres ingesteld in organisatie-instellingen.",
    };
  }

  const { sendEmailWithResult } = await import("@/lib/email");

  const subject = `Test: ${label}`;
  const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:sans-serif;color:#1a1a1a;background:#f5f5f5;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
    <div style="background:#081D3A;padding:20px 24px">
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">Veele</span>
    </div>
    <div style="padding:28px 24px">
      <h2 style="margin-top:0;color:#081D3A">Testmelding: ${label}</h2>
      <p>Dit is een testmelding voor het notificatietype <strong>${label}</strong> (<code>${type}</code>).</p>
      <p>Als u dit bericht ontvangt, werkt de e-mailconfiguratie correct.</p>
    </div>
    <div style="padding:16px 24px;background:#f8fafc;font-size:12px;color:#94a3b8">
      Dit is een automatisch bericht van het Veele platform. Antwoorden op deze e-mail worden niet verwerkt.
    </div>
  </div>
</body>
</html>`;

  const result = await sendEmailWithResult({
    to: orgSettings.emailAfzender,
    subject,
    html,
  });
  if (!result.success) {
    return {
      success: false,
      message: result.error ?? "E-mail verzenden mislukt.",
    };
  }
  return { success: true };
}

export async function sendTestMailSettings(
  recipientEmail: string,
  template: "basic" | "temporary_password" = "basic",
): Promise<ActionResult> {
  await requirePermission("settings", "write");

  const to = recipientEmail.trim().toLowerCase();
  if (!isEmailLike(to)) {
    return { success: false, message: "Vul een geldig test e-mailadres in." };
  }

  const {
    buildTemporaryPasswordEmail,
    personeelPortalUrl,
    sendEmailWithResult,
  } = await import("@/lib/email");

  const message =
    template === "temporary_password"
      ? buildTemporaryPasswordEmail({
          recipientName: "Testgebruiker",
          portalName: "Personeelsportaal",
          loginUrl: personeelPortalUrl(),
          temporaryPassword: "Veele-Test-2026!",
        })
      : {
          subject: "Test SMTP-instellingen Veele",
          html: `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><title>Test SMTP-instellingen Veele</title></head>
<body style="font-family:sans-serif;color:#1a1a1a;background:#f5f5f5;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
    <div style="background:#081D3A;padding:20px 24px">
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">Veele</span>
    </div>
    <div style="padding:28px 24px">
      <h2 style="margin-top:0;color:#081D3A">SMTP-test geslaagd</h2>
      <p>Deze e-mail is verzonden vanuit de mailinstellingen van het Veele platform.</p>
      <p>Als u dit bericht ontvangt, kan het platform e-mail afleveren met de huidige configuratie.</p>
    </div>
    <div style="padding:16px 24px;background:#f8fafc;font-size:12px;color:#94a3b8">
      Dit is een automatisch testbericht van het Veele platform.
    </div>
  </div>
</body>
</html>`,
        };

  const result = await sendEmailWithResult({
    to,
    subject: message.subject,
    html: message.html,
  });
  if (!result.success) {
    return {
      success: false,
      message: result.error ?? "Testmail verzenden mislukt.",
    };
  }

  return { success: true };
}

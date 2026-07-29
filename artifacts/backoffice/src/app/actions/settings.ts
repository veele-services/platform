"use server";

import { db } from "@workspace/db";
import {
  organizationSettingsTable,
  rolesTable,
  permissionsTable,
  rolePermissionsTable,
  userRolesTable,
  auditLogTable,
  buildTenantBrandingAssetStoragePath,
  customerNotificationsTable,
  customersTable,
  customerPortalPreferencesTable,
  notificationDeliveryQueueTable,
  notificationDispatchesTable,
  notificationEventSettingsTable,
  issueCredentialRecoveryChallenge,
  markCredentialRecoveryDelivery,
  personnelTable,
  personnelNotificationsTable,
  sectorsTable,
  tenantsTable,
  tenantUsersTable,
  toSafeStorageSegment,
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
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { getTenantPlanCapabilities } from "@/lib/tenant-plan";
import { provisionPortalUserForActivation } from "@/lib/auth/portal-invites";
import { buildPasswordResetCodeEmail, sendEmailWithResult } from "@/lib/email";
import {
  decryptPlatformEmailConfig,
  encryptPlatformEmailConfig,
  maskEmailSecret,
  type TenantEmailApiProvider,
  type TenantEmailTransport,
} from "@workspace/db/email-service";
import type { ActionResult } from "./customers";
import { personnelTenantEntryUrl } from "@/lib/personnel-portal-entry";
import { tenantApplicationOrigin } from "@/lib/tenant-application-origin";
import { resolveBackofficeRecoveryContext } from "@/lib/auth/recovery-origin";

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
  planningWorkdayStart: string;
  planningTimeSlotMinutes: number;
  personnelLoginCode: string;
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
  emailTransport: TenantEmailTransport;
  emailApiProvider: TenantEmailApiProvider;
  emailApiKeyConfigured: boolean;
  emailApiKeyMasked: string | null;
  emailApiSendingDomain: string | null;
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

export type RolePlanCapabilities = {
  plan: string;
  customRoles: boolean;
  canResetSystemRoles: boolean;
};

export type RoleDetail = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: PermissionItem[];
  allPermissions: PermissionItem[];
};

const DEFAULT_SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
  Management: ["*"],
  Administration: [
    "dashboard:read",
    "customers:read",
    "customers:write",
    "customers:delete",
    "objects:read",
    "objects:write",
    "objects:delete",
    "assignments:read",
    "assignments:write",
    "assignments:approve",
    "planning:read",
    "planning:write",
    "personnel:read",
    "personnel:write",
    "task_codes:read",
    "task_codes:write",
    "reports:read",
    "reports:submit",
    "reports:write",
    "reports:export",
    "invoices:read",
    "invoices:write",
    "invoices:send",
    "documents:read",
    "documents:write",
    "documents:delete",
    "news:read",
    "news:write",
    "news:send",
    "settings:read",
    "users:read",
    "users:write",
  ],
  Planning: [
    "dashboard:read",
    "customers:read",
    "objects:read",
    "assignments:read",
    "assignments:write",
    "planning:read",
    "planning:write",
    "personnel:read",
    "task_codes:read",
    "news:read",
    "news:write",
    "news:send",
    "reports:read",
    "reports:submit",
  ],
  Teamlead: [
    "dashboard:read",
    "assignments:read",
    "assignments:write",
    "planning:read",
    "personnel:read",
    "reports:read",
    "reports:submit",
    "documents:read",
  ],
  Employee: [
    "dashboard:read",
    "assignments:read",
    "reports:read",
    "reports:submit",
    "documents:read",
  ],
  "Flex Employee": [
    "assignments:read",
    "reports:read",
    "reports:submit",
    "documents:read",
  ],
  Customer: [
    "assignments:read",
    "objects:read",
    "invoices:read",
    "documents:read",
  ],
  Support: [
    "dashboard:read",
    "customers:read",
    "objects:read",
    "assignments:read",
    "personnel:read",
    "reports:read",
    "documents:read",
    "news:read",
  ],
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

function normalizeMailTransport(
  value: string | null | undefined,
  smtpEnabled?: boolean,
): TenantEmailTransport {
  if (value === "platform" || value === "smtp" || value === "api") return value;
  return smtpEnabled ? "smtp" : "platform";
}

function readTenantEmailApiConfig(encrypted: string | null | undefined): {
  apiKey?: string | null;
  sendingDomain?: string | null;
} {
  if (!encrypted) return {};
  try {
    return decryptPlatformEmailConfig(encrypted);
  } catch {
    return {};
  }
}

export async function getOrganizationSettings(): Promise<OrgSettings | null> {
  await requirePermission("settings", "read");
  const tenantId = await requireCurrentTenantId();

  const [rows, tenantRows] = await Promise.all([
    db
      .select()
      .from(organizationSettingsTable)
      .where(eq(organizationSettingsTable.tenantId, tenantId))
      .limit(1),
    db
      .select({ personnelLoginCode: tenantsTable.personnelLoginCode })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1),
  ]);

  if (rows.length === 0) return null;
  const r = rows[0];
  const tenant = tenantRows[0];
  if (!tenant) return null;
  const emailApiConfig = readTenantEmailApiConfig(r.emailApiKeyEncrypted);
  return {
    id: r.id,
    naam: r.naam,
    adres: r.adres,
    kvkNummer: r.kvkNummer,
    btwNummer: r.btwNummer,
    logoUrl: r.logoUrl,
    betaaltermijnDagen: r.betaaltermijnDagen,
    availabilityAdvanceDays: r.availabilityAdvanceDays,
    planningWorkdayStart: r.planningWorkdayStart,
    planningTimeSlotMinutes: r.planningTimeSlotMinutes,
    personnelLoginCode: tenant.personnelLoginCode,
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
    emailTransport: normalizeMailTransport(r.emailTransport, r.smtpEnabled),
    emailApiProvider:
      r.emailApiProvider === "resend" ? r.emailApiProvider : "resend",
    emailApiKeyConfigured: Boolean(emailApiConfig.apiKey),
    emailApiKeyMasked: maskEmailSecret(emailApiConfig.apiKey, 3),
    emailApiSendingDomain:
      r.emailApiSendingDomain ?? emailApiConfig.sendingDomain ?? null,
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
  planningWorkdayStart?: string;
  planningTimeSlotMinutes?: number;
  emailAfzender?: string | null;
  notifRapportGoedgekeurd?: boolean;
  notifRapportAfgekeurd?: boolean;
  notifOfferteVerstuurd?: boolean;
  notifOfferteVerlopen?: boolean;
  notifBetalingHerinnering?: boolean;
  notifHerinneringDagen?: number;
}): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();

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
  if (
    data.planningWorkdayStart !== undefined &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.planningWorkdayStart)
  ) {
    return {
      success: false,
      message: "Start werkdag moet een geldige HH:MM-tijd zijn.",
    };
  }
  if (
    data.planningTimeSlotMinutes !== undefined &&
    (data.planningTimeSlotMinutes < 15 || data.planningTimeSlotMinutes > 240)
  ) {
    return {
      success: false,
      message: "Tijdvakgrootte moet tussen 15 en 240 minuten liggen.",
    };
  }

  await db
    .update(organizationSettingsTable)
    .set({ ...data, updatedAt: new Date(), updatedBy: user.id })
    .where(eq(organizationSettingsTable.tenantId, tenantId));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update",
    resource: "settings",
    resourceId: "organization",
    metadata: { tenantId, fields: Object.keys(data) },
  });

  revalidatePath("/instellingen/organisatie");
  return { success: true };
}

type MailSettingsInput = {
  emailTransport: TenantEmailTransport;
  emailApiProvider: TenantEmailApiProvider;
  emailApiKey?: string | null;
  clearApiKey?: boolean;
  emailApiSendingDomain?: string | null;
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
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const emailTransport = normalizeMailTransport(
    data.emailTransport,
    data.smtpEnabled,
  );
  if (data.emailApiProvider !== "resend") {
    return {
      success: false,
      message: "Voor API-mail wordt momenteel alleen Resend ondersteund.",
    };
  }

  const [existingSettings] = await db
    .select({
      emailApiKeyEncrypted: organizationSettingsTable.emailApiKeyEncrypted,
    })
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.tenantId, tenantId))
    .limit(1);

  const existingApiConfig = readTenantEmailApiConfig(
    existingSettings?.emailApiKeyEncrypted,
  );
  const apiKeyInput = data.emailApiKey?.trim() || null;
  const emailApiSendingDomain = data.emailApiSendingDomain?.trim() || null;
  const effectiveApiKey = data.clearApiKey
    ? null
    : (apiKeyInput ?? existingApiConfig.apiKey ?? null);

  const payload = {
    emailTransport,
    emailApiProvider: data.emailApiProvider,
    emailApiSendingDomain,
    smtpEnabled: emailTransport === "smtp",
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
  if (emailTransport === "smtp") {
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
  if (emailTransport === "api") {
    if (!payload.smtpFromEmail || !isEmailLike(payload.smtpFromEmail)) {
      return {
        success: false,
        message:
          "Een geldig afzenderadres is verplicht wanneer Resend API actief is.",
      };
    }
    if (!effectiveApiKey) {
      return {
        success: false,
        message: "Resend API key is verplicht wanneer API-mail actief is.",
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

  if (data.clearApiKey) {
    updateData.emailApiKeyEncrypted = null;
    updateData.emailApiKeyUpdatedAt = new Date();
  } else if (
    apiKeyInput ||
    (effectiveApiKey &&
      emailApiSendingDomain !== (existingApiConfig.sendingDomain ?? null))
  ) {
    try {
      updateData.emailApiKeyEncrypted = encryptPlatformEmailConfig({
        apiKey: effectiveApiKey,
        sendingDomain: emailApiSendingDomain,
      });
      updateData.emailApiKeyUpdatedAt = new Date();
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "API key versleutelen mislukt.",
      };
    }
  }

  if (data.clearPassword) {
    updateData.smtpPassword = null;
  } else if (data.smtpPassword?.trim()) {
    updateData.smtpPassword = data.smtpPassword.trim();
  }

  await db
    .update(organizationSettingsTable)
    .set(updateData)
    .where(eq(organizationSettingsTable.tenantId, tenantId));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update_mail_settings",
    resource: "settings",
    resourceId: "mail",
    metadata: {
      tenantId,
      emailTransport,
      emailApiProvider: payload.emailApiProvider,
      apiKeyChanged: Boolean(apiKeyInput) || Boolean(data.clearApiKey),
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
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

type PushDeliveryTriggerResult = {
  attempted: boolean;
  ok: boolean;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  error?: string;
};

async function triggerQueuedPushDelivery(
  limit: number,
): Promise<PushDeliveryTriggerResult> {
  const adminSecret = process.env["ADMIN_API_SECRET"];
  const apiBaseUrl =
    process.env["API_INTERNAL_URL"] ??
    (process.env["API_PORT"]
      ? `http://127.0.0.1:${process.env["API_PORT"]}`
      : null);

  if (!adminSecret || !apiBaseUrl) {
    return {
      attempted: false,
      ok: false,
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: "ADMIN_API_SECRET of API_PORT/API_INTERNAL_URL ontbreekt.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `${apiBaseUrl}/api/admin/push-notifications?limit=${Math.min(Math.max(limit, 100), 250)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${adminSecret}` },
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        attempted: true,
        ok: false,
        processed: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        error: text || `Push API gaf HTTP ${response.status}.`,
      };
    }

    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return {
      attempted: true,
      ok: true,
      processed: Number(data["processed"] ?? 0),
      sent: Number(data["sent"] ?? 0),
      skipped: Number(data["skipped"] ?? 0),
      failed: Number(data["failed"] ?? 0),
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error:
        error instanceof Error
          ? error.message
          : "Push delivery kon niet direct worden gestart.",
    };
  } finally {
    clearTimeout(timeout);
  }
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

  if (!updated)
    return { success: false, message: "Notificatie-event niet gevonden." };

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
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const colorRegex = /^#[0-9a-fA-F]{6}$/u;
  const brandColor = safeTrim(data.brandColor, 20);
  const accentColor = safeTrim(data.accentColor, 20);
  if (!colorRegex.test(brandColor) || !colorRegex.test(accentColor)) {
    return {
      success: false,
      message: "Gebruik geldige hex-kleuren, bijvoorbeeld #081D3A.",
    };
  }

  await db
    .update(organizationSettingsTable)
    .set({
      emailTemplateBrandColor: brandColor,
      emailTemplateAccentColor: accentColor,
      emailTemplateFooterText: safeTrim(data.footerText, 2000),
      emailTemplateSignature: safeTrim(data.signature, 2000),
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(organizationSettingsTable.tenantId, tenantId));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update_email_template_style",
    resource: "settings",
    resourceId: "notifications",
    metadata: { tenantId, brandColor, accentColor },
  });

  revalidatePath("/instellingen/notificaties");
  return { success: true };
}

export async function getNotificationAudienceOptions(): Promise<NotificationAudienceOptions> {
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
): Promise<
  ActionResult<{
    personnelCount: number;
    customerCount: number;
    emailSuccessCount: number;
    emailFailedCount: number;
    pushQueuedCount: number;
    pushDelivery: PushDeliveryTriggerResult | null;
  }>
> {
  await requirePermission("settings", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };
  const tenantId = await requireCurrentTenantId();

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

  const wantsPersonnel =
    input.audience === "personnel" || input.audience === "both";
  const wantsCustomers =
    input.audience === "customer" || input.audience === "both";

  const personnelConditions = [
    eq(personnelTable.tenantId, tenantId),
    eq(personnelTable.isActive, true),
  ];
  if (input.targetMode === "sector" && sectorIds.length > 0) {
    personnelConditions.push(inArray(personnelTable.sectorId, sectorIds));
  }
  if (input.targetMode === "individual" && personnelIds.length > 0) {
    personnelConditions.push(inArray(personnelTable.id, personnelIds));
  }

  const customerConditions = [
    eq(customersTable.tenantId, tenantId),
    eq(customersTable.isActive, true),
  ];
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
    return {
      success: false,
      message: "Geen ontvangers gevonden voor deze selectie.",
    };
  }

  const [dispatch] = await db
    .insert(notificationDispatchesTable)
    .values({
      tenantId,
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
    return {
      success: false,
      message: "Notificatie kon niet worden aangemaakt.",
    };
  }

  const createdAt = new Date();
  const inAppEnabled = channels.includes("in_app") || channels.includes("push");
  const pushEnabled = channels.includes("push");
  const emailEnabled = channels.includes("email");
  let pushQueuedCount = 0;

  await db.transaction(async (tx) => {
    if (inAppEnabled && personnelRecipients.length > 0) {
      await tx.insert(personnelNotificationsTable).values(
        personnelRecipients.map((person) => {
          const recipientName = `${person.firstName} ${person.lastName}`.trim();
          return {
            tenantId,
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
            sourceLabel: "Melding",
            href,
            createdAt,
          };
        }),
      );
    }

    if (inAppEnabled && customerRecipients.length > 0) {
      await tx.insert(customerNotificationsTable).values(
        customerRecipients.map((customer) => ({
          tenantId,
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
          sourceLabel: "Melding",
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
            const recipientName =
              `${person.firstName} ${person.lastName}`.trim();
            return {
              tenantId,
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
            tenantId,
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
        pushQueuedCount = queueRows.length;
      }
    }
  });

  const pushDelivery =
    pushEnabled && pushQueuedCount > 0
      ? await triggerQueuedPushDelivery(pushQueuedCount)
      : null;

  let emailSuccessCount = 0;
  let emailFailedCount = 0;

  if (emailEnabled) {
    const { buildStyledNotificationEmail, sendEmailWithResult } =
      await import("@/lib/email");
    const emailRows: Array<typeof notificationDeliveryQueueTable.$inferInsert> =
      [];

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
        tenantId,
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
        tenantId,
      });
      if (result.success) emailSuccessCount += 1;
      else emailFailedCount += 1;

      emailRows.push({
        tenantId,
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
        lastError: result.success
          ? null
          : (result.error ?? "E-mail verzenden mislukt."),
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
      pushQueuedCount,
      pushDelivery,
    },
  };
}

export async function uploadOrgLogo(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();

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

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = file.type.toLowerCase();
  const allowedTypes = new Map([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
  ]);

  if (mimeType === "image/svg+xml" || extension === "svg") {
    return {
      success: false,
      message: "SVG-logo's zijn nog niet toegestaan",
    };
  }

  const ext = allowedTypes.get(mimeType) ?? null;
  if (!ext) {
    return { success: false, message: "Upload een PNG-, JPG- of WebP-logo." };
  }

  const safeName = toSafeStorageSegment(file.name, `logo.${ext}`);
  const path = buildTenantBrandingAssetStoragePath(
    tenantId,
    "logo",
    `${Date.now()}-${safeName}`,
  );
  const bytes = await file.arrayBuffer();
  const admin = createAdminClient();

  const { error } = await admin.storage.from("org-assets").upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    return { success: false, message: `Upload mislukt: ${error.message}` };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("org-assets").getPublicUrl(path);

  await db
    .update(organizationSettingsTable)
    .set({ logoUrl: publicUrl, updatedAt: new Date(), updatedBy: user.id })
    .where(eq(organizationSettingsTable.tenantId, tenantId));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update",
    resource: "settings",
    resourceId: "organization",
    metadata: { tenantId, field: "logo_url", path },
  });

  revalidatePath("/instellingen/organisatie");
  return { success: true, data: { url: publicUrl } };
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export async function getRolePlanCapabilities(): Promise<RolePlanCapabilities> {
  await requirePermission("roles", "read");
  const [{ customRoles, plan }, canResetSystemRoles] = await Promise.all([
    getTenantPlanCapabilities(),
    hasPermission("roles", "delete"),
  ]);

  return { plan, customRoles, canResetSystemRoles };
}

async function requireCustomRolesEnabled(): Promise<ActionResult | null> {
  const capabilities = await getTenantPlanCapabilities();
  if (!capabilities.customRoles) {
    return {
      success: false,
      message: `Custom rollen zijn niet beschikbaar in het huidige tenantplan (${capabilities.plan}).`,
    };
  }
  return null;
}

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

  const planBlock = await requireCustomRolesEnabled();
  if (planBlock) return planBlock;

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

export async function updateRole(data: {
  id: string;
  name: string;
  description: string | null;
}): Promise<ActionResult> {
  await requirePermission("roles", "write");

  const planBlock = await requireCustomRolesEnabled();
  if (planBlock) return planBlock;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const name = data.name.trim();
  if (!name) return { success: false, message: "Naam is verplicht." };

  const [role] = await db
    .select({ id: rolesTable.id, isSystem: rolesTable.isSystem })
    .from(rolesTable)
    .where(eq(rolesTable.id, data.id))
    .limit(1);
  if (!role) return { success: false, message: "Rol niet gevonden." };
  if (role.isSystem) {
    return {
      success: false,
      message: "Systeemrollen kunnen niet als custom rol worden gewijzigd.",
    };
  }

  const duplicate = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(and(eq(rolesTable.name, name), sql`${rolesTable.id} <> ${data.id}`))
    .limit(1);
  if (duplicate.length > 0) {
    return { success: false, message: "Er bestaat al een rol met deze naam." };
  }

  await db
    .update(rolesTable)
    .set({
      name,
      description: data.description?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(rolesTable.id, data.id));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update",
    resource: "roles",
    resourceId: data.id,
    metadata: { name },
  });

  revalidatePath("/instellingen/rollen");
  revalidatePath(`/instellingen/rollen/${data.id}`);
  return { success: true };
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

  const [role] = await db
    .select({ isSystem: rolesTable.isSystem })
    .from(rolesTable)
    .where(eq(rolesTable.id, roleId))
    .limit(1);
  if (!role) return { success: false, message: "Rol niet gevonden." };
  if (!role.isSystem) {
    const planBlock = await requireCustomRolesEnabled();
    if (planBlock) return planBlock;
  }

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

  const [role] = await db
    .select({ isSystem: rolesTable.isSystem })
    .from(rolesTable)
    .where(eq(rolesTable.id, roleId))
    .limit(1);
  if (!role) return { success: false, message: "Rol niet gevonden." };
  if (!role.isSystem) {
    const planBlock = await requireCustomRolesEnabled();
    if (planBlock) return planBlock;
  }

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

async function assertTenantUserAccess(
  userId: string,
): Promise<ActionResult | null> {
  const tenantId = await requireCurrentTenantId();
  const [tenantUser] = await db
    .select({ id: tenantUsersTable.id })
    .from(tenantUsersTable)
    .where(
      and(
        eq(tenantUsersTable.tenantId, tenantId),
        eq(tenantUsersTable.userId, userId),
        eq(tenantUsersTable.status, "active"),
      ),
    )
    .limit(1);

  if (!tenantUser) {
    return {
      success: false,
      message: "Gebruiker hoort niet bij deze tenant of is niet actief.",
    };
  }

  return null;
}

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
    if (
      u.app_metadata?.credential_activation_pending === true ||
      !u.confirmed_at
    )
      status = "uitgenodigd";
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
  const tenantId = await requireCurrentTenantId();

  const email = data.email.trim().toLowerCase();
  if (!email) return { success: false, message: "E-mailadres is verplicht." };

  let invitedUserId: string;
  try {
    const invite = await provisionPortalUserForActivation({
      email,
      fullName: "",
      portal: "tenant-admin",
      tenantId,
      portalName: "Tenant backoffice",
      activationUrl: `${await tenantApplicationOrigin(tenantId)}/admin/wachtwoord-vergeten?doel=activatie`,
      actorUserId: user.id,
      allowExistingActive: true,
    });
    invitedUserId = invite.user.id;
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Uitnodiging mislukt.",
    };
  }

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

  const tenantUserGuard = await assertTenantUserAccess(userId);
  if (tenantUserGuard) return tenantUserGuard;

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
 * Send a fresh temporary password by user ID.
 * Looks up the user's email via Admin API, then sends a platform-managed mail.
 */
export async function resendInvite(userId: string): Promise<ActionResult> {
  await requirePermission("users", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };
  const tenantId = await requireCurrentTenantId();

  const tenantUserGuard = await assertTenantUserAccess(userId);
  if (tenantUserGuard) return tenantUserGuard;

  const admin = createAdminClient();
  const { data: targetUser, error: fetchError } =
    await admin.auth.admin.getUserById(userId);
  if (fetchError || !targetUser.user.email) {
    return {
      success: false,
      message: "Gebruiker niet gevonden of heeft geen e-mailadres.",
    };
  }

  try {
    const email = targetUser.user.email;
    await provisionPortalUserForActivation({
      email,
      fullName: String(
        targetUser.user.user_metadata?.["full_name"] ??
          targetUser.user.user_metadata?.["name"] ??
          email,
      ),
      portal: "tenant-admin",
      tenantId,
      portalName: "Tenant backoffice",
      activationUrl: `${await tenantApplicationOrigin(tenantId)}/admin/wachtwoord-vergeten?doel=activatie`,
      actorUserId: user.id,
      allowExistingActive: true,
    });
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Opnieuw versturen mislukt.",
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

export async function sendUserPasswordReset(
  userId: string,
): Promise<ActionResult> {
  await requirePermission("users", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };
  const tenantId = await requireCurrentTenantId();

  const tenantUserGuard = await assertTenantUserAccess(userId);
  if (tenantUserGuard) return tenantUserGuard;

  const admin = createAdminClient();
  const { data: targetUser, error: fetchError } =
    await admin.auth.admin.getUserById(userId);
  if (fetchError || !targetUser.user.email) {
    return {
      success: false,
      message: "Gebruiker niet gevonden of heeft geen e-mailadres.",
    };
  }

  const email = targetUser.user.email;
  const resetUrl = `${await tenantApplicationOrigin(tenantId)}/admin/wachtwoord-vergeten`;
  const recoveryContext = await resolveBackofficeRecoveryContext(resetUrl);
  if (
    recoveryContext.surface !== "tenant-backoffice" ||
    recoveryContext.tenantId !== tenantId
  ) {
    return {
      success: false,
      message: "Het hersteladres hoort niet bij deze tenant.",
    };
  }
  const challenge = await issueCredentialRecoveryChallenge({
    surface: "tenant-backoffice",
    purpose: "password-reset",
    tenantId,
    accountIdentifier: email,
    subjectUserId: userId,
    redirectOrigin: recoveryContext.origin,
    actorUserId: user.id,
    networkSignal: `actor:${user.id}`,
    clientSignal: "backoffice-user-reset",
  });
  if (
    challenge.status !== "issued" ||
    !challenge.challengeId ||
    !challenge.code
  ) {
    return {
      success: false,
      message:
        "Er is recent al een herstelmail verstuurd. Probeer het later opnieuw.",
    };
  }
  const { subject, html } = buildPasswordResetCodeEmail({
    recipientName: String(
      targetUser.user.user_metadata?.["full_name"] ??
        targetUser.user.user_metadata?.["name"] ??
        email,
    ),
    portalName: "Tenant backoffice",
    resetUrl,
    code: challenge.code,
  });
  const sent = await sendEmailWithResult({
    to: email,
    subject,
    html,
    tenantId,
    purpose: "tenant_backoffice_password_reset",
  });
  await markCredentialRecoveryDelivery(challenge.challengeId, sent.success);
  if (!sent.success)
    return { success: false, message: "Herstelmail versturen mislukt." };

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "password_reset_sent",
    resource: "users",
    resourceId: userId,
    metadata: { email },
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

  const planBlock = await requireCustomRolesEnabled();
  if (planBlock) return planBlock;

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

export async function resetSystemRolesToDefault(): Promise<ActionResult> {
  await requirePermission("roles", "delete");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [roles, permissions] = await Promise.all([
    db
      .select({
        id: rolesTable.id,
        name: rolesTable.name,
        isSystem: rolesTable.isSystem,
      })
      .from(rolesTable),
    db
      .select({
        id: permissionsTable.id,
        resource: permissionsTable.resource,
        action: permissionsTable.action,
      })
      .from(permissionsTable),
  ]);

  const permissionByKey = new Map(
    permissions.map((p) => [`${p.resource}:${p.action}`, p.id]),
  );
  const allPermissionIds = permissions.map((p) => p.id);
  const systemRoles = roles.filter(
    (role) => role.isSystem && DEFAULT_SYSTEM_ROLE_PERMISSIONS[role.name],
  );

  for (const role of systemRoles) {
    const defaults = DEFAULT_SYSTEM_ROLE_PERMISSIONS[role.name] ?? [];
    const permissionIds = defaults.includes("*")
      ? allPermissionIds
      : defaults
          .map((key) => permissionByKey.get(key))
          .filter((id): id is string => Boolean(id));

    await db
      .delete(rolePermissionsTable)
      .where(eq(rolePermissionsTable.roleId, role.id));
    if (permissionIds.length > 0) {
      await db
        .insert(rolePermissionsTable)
        .values(
          permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
        )
        .onConflictDoNothing();
    }
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "reset_defaults",
    resource: "roles",
    resourceId: null,
    metadata: { roles: systemRoles.map((role) => role.name) },
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
  const tenantId = await requireCurrentTenantId();

  const {
    page = 1,
    search = "",
    module = "",
    dateFrom = "",
    dateTo = "",
    roleId = "",
  } = params;

  const conditions = [];
  conditions.push(eq(auditLogTable.tenantId, tenantId));

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
  const tenantId = await requireCurrentTenantId();

  const [orgSettings] = await db
    .select({ emailAfzender: organizationSettingsTable.emailAfzender })
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.tenantId, tenantId))
    .limit(1);

  if (!orgSettings?.emailAfzender) {
    return {
      success: false,
      message: "Geen afzenderadres ingesteld in organisatie-instellingen.",
    };
  }

  const { buildNotificationTestEmail, sendEmailWithResult } =
    await import("@/lib/email");
  const message = buildNotificationTestEmail({
    notificationType: type,
    notificationTypeLabel: label,
  });

  const result = await sendEmailWithResult({
    to: orgSettings.emailAfzender,
    subject: message.subject,
    html: message.html,
    text: message.text,
    tenantId,
    purpose: "notification_test",
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
  template: "basic" | "account_activation" = "basic",
): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();

  const to = recipientEmail.trim().toLowerCase();
  if (!isEmailLike(to)) {
    return { success: false, message: "Vul een geldig test e-mailadres in." };
  }

  const {
    buildTenantMailSettingsTestEmail,
    buildAccountActivationEmail,
    sendEmailWithResult,
  } = await import("@/lib/email");

  const activationUrl =
    template === "account_activation"
      ? await personnelTenantEntryUrl(
          tenantId,
          "/wachtwoord-vergeten?doel=activatie",
        )
      : null;
  const message =
    template === "account_activation"
      ? buildAccountActivationEmail({
          recipientName: "Testgebruiker",
          portalName: "Personeelsportaal",
          activationUrl: activationUrl!,
          code: "12345678",
        })
      : buildTenantMailSettingsTestEmail();

  const result = await sendEmailWithResult({
    to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    tenantId,
    purpose: "tenant_mail_settings_test",
  });
  if (!result.success) {
    return {
      success: false,
      message: result.error ?? "Testmail verzenden mislukt.",
    };
  }

  return { success: true };
}

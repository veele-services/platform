"use server";

import {
  auditLogTable,
  db,
  DEFAULT_PLATFORM_HOSTS,
  FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES,
  organizationSettingsTable,
  platformHosts,
} from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import type { ActionResult } from "./customers";

export type PlatformSettingsStatus = "ok" | "warning" | "manual";
export type PlatformSettingsCategory =
  | "routing"
  | "support"
  | "domains"
  | "mail"
  | "branding"
  | "operations";

export type PlatformSettingRow = {
  id: string;
  label: string;
  category: PlatformSettingsCategory;
  status: PlatformSettingsStatus;
  value: string;
  source: string;
  detail: string;
  nextAction: string;
};

export type PlatformSmtpSettings = {
  smtpEnabled: boolean;
  smtpHost: string;
  smtpPort: number | null;
  smtpEncryption: "none" | "starttls" | "tls";
  smtpUsername: string;
  smtpPasswordConfigured: boolean;
  smtpFromName: string;
  smtpFromEmail: string;
  smtpReplyTo: string;
  defaultTenantFromPattern: string;
};

export type PlatformSettingsDashboard = {
  generatedAt: string;
  settings: PlatformSettingRow[];
  summary: Record<PlatformSettingsStatus, number>;
  changeRequestOptions: Array<{ id: string; label: string }>;
  smtp: PlatformSmtpSettings;
};

function envValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function isLegacyDgwebservicesValue(value: string | null): boolean {
  return Boolean(value && value.toLowerCase().includes("dgwebservices.nl"));
}

function fieldgridDnsTargetValue(): string {
  const explicitTarget =
    envValue("FIELDGRID_CUSTOM_DOMAIN_CNAME_TARGET") ??
    envValue("FIELDGRID_CUSTOM_DOMAIN_DNS_TARGET") ??
    envValue("FIELDGRID_PUBLIC_IPV4") ??
    envValue("FIELDGRID_PUBLIC_IPV6");

  if (explicitTarget && !isLegacyDgwebservicesValue(explicitTarget)) {
    return explicitTarget.replace(/^https?:\/\//u, "").replace(/\/$/u, "");
  }

  return "fieldgrid.nl";
}

function formValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function nullableFormValue(formData: FormData, name: string): string | null {
  return formValue(formData, name) || null;
}

function formCheckbox(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function configuredStatus(value: string | null): PlatformSettingsStatus {
  return value ? "ok" : "manual";
}

function summarizeStatus(settings: PlatformSettingRow[]): Record<PlatformSettingsStatus, number> {
  return settings.reduce<Record<PlatformSettingsStatus, number>>(
    (counts, setting) => {
      counts[setting.status] += 1;
      return counts;
    },
    { ok: 0, warning: 0, manual: 0 },
  );
}

async function getMailSnapshot(): Promise<{
  smtpConfigured: number;
  fromEmail: string | null;
  brandingConfigured: number;
}> {
  const [snapshot] = await db
    .select({
      smtpConfigured: sql<number>`count(*) filter (
        where smtp_enabled = true
          and smtp_host is not null
          and smtp_port is not null
          and smtp_from_email is not null
      )::int`,
      fromEmail: sql<string | null>`max(smtp_from_email) filter (where smtp_from_email is not null)`,
      brandingConfigured: sql<number>`count(*) filter (
        where email_template_brand_color is not null
          and email_template_accent_color is not null
      )::int`,
    })
    .from(organizationSettingsTable);

  return {
    smtpConfigured: Number(snapshot?.smtpConfigured ?? 0),
    fromEmail: snapshot?.fromEmail ?? null,
    brandingConfigured: Number(snapshot?.brandingConfigured ?? 0),
  };
}

function normalizeSmtpEncryption(value: string | null | undefined): PlatformSmtpSettings["smtpEncryption"] {
  if (value === "none" || value === "tls" || value === "starttls") return value;
  return "starttls";
}

async function getPlatformSmtpSettings(): Promise<PlatformSmtpSettings> {
  const [settings] = await db
    .select({
      smtpEnabled: organizationSettingsTable.smtpEnabled,
      smtpHost: organizationSettingsTable.smtpHost,
      smtpPort: organizationSettingsTable.smtpPort,
      smtpEncryption: organizationSettingsTable.smtpEncryption,
      smtpUsername: organizationSettingsTable.smtpUsername,
      smtpPassword: organizationSettingsTable.smtpPassword,
      smtpFromName: organizationSettingsTable.smtpFromName,
      smtpFromEmail: organizationSettingsTable.smtpFromEmail,
      smtpReplyTo: organizationSettingsTable.smtpReplyTo,
    })
    .from(organizationSettingsTable)
    .orderBy(desc(organizationSettingsTable.updatedAt))
    .limit(1);

  return {
    smtpEnabled: Boolean(settings?.smtpEnabled),
    smtpHost: settings?.smtpHost ?? "",
    smtpPort: settings?.smtpPort ?? null,
    smtpEncryption: normalizeSmtpEncryption(settings?.smtpEncryption),
    smtpUsername: settings?.smtpUsername ?? "",
    smtpPasswordConfigured: Boolean(settings?.smtpPassword),
    smtpFromName: settings?.smtpFromName ?? "Fieldgrid",
    smtpFromEmail: settings?.smtpFromEmail ?? "noreply@fieldgrid.nl",
    smtpReplyTo: settings?.smtpReplyTo ?? "",
    defaultTenantFromPattern: "<mail>@<slug>.fieldgrid.nl",
  };
}

export async function getPlatformSettingsDashboard(): Promise<PlatformSettingsDashboard> {
  await requirePlatformAdmin();

  const [mail, smtp] = await Promise.all([getMailSnapshot(), getPlatformSmtpSettings()]);
  const hosts = Array.from(platformHosts()).sort();
  const platformHostSource = envValue("PLATFORM_HOSTS") ? "PLATFORM_HOSTS" : `default: ${DEFAULT_PLATFORM_HOSTS.join(", ")}`;
  const customDomainTarget = fieldgridDnsTargetValue();
  const caddyAskMode =
    envValue("CADDY_ASK_MODE") ??
    (envValue("CADDY_ASK_ENDPOINT") || envValue("API_INTERNAL_URL") ? "ask endpoint via API" : null);
  const smokeTargetValue = [
    envValue("FIELDGRID_STAGING_SMOKE_API_URL") ?? "FIELDGRID_STAGING_SMOKE_API_URL ontbreekt",
    envValue("FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL") ? "empty-db smoke geconfigureerd" : "empty-db smoke handmatig",
    envValue("FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL") ? "staging-copy smoke geconfigureerd" : "staging-copy smoke handmatig",
  ].join(" / ");
  const systemMailConfigured =
    (smtp.smtpEnabled && Boolean(smtp.smtpHost) && Boolean(smtp.smtpPort) && Boolean(smtp.smtpFromEmail)) ||
    Boolean(envValue("RESEND_API_KEY"));
  const defaultBrandName = envValue("FIELDGRID_DEFAULT_BRAND_NAME") ?? "Fieldgrid";

  const settings: PlatformSettingRow[] = [
    {
      id: "platformhosts",
      label: "Platformhosts",
      category: "routing",
      status: hosts.length > 0 ? "ok" : "warning",
      value: hosts.join(", ") || "Niet geconfigureerd",
      source: platformHostSource,
      detail: "Hosts die als platformbeheer worden behandeld en dus geen tenantcontext mogen krijgen.",
      nextAction: "Houd admin.fieldgrid.nl en staging.fieldgrid.nl expliciet in PLATFORM_HOSTS.",
    },
    {
      id: "support-ttl-default",
      label: "Support TTL default",
      category: "support",
      status: "ok",
      value: `${FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES} minuten`,
      source: "FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES",
      detail: "Maximale break-glass looptijd voor platform support grants.",
      nextAction: "Wijzig dit alleen via code review, omdat verlopen grants hard op deze policy leunen.",
    },
    {
      id: "custom-domain-dns-target",
      label: "Custom domain DNS target",
      category: "domains",
      status: configuredStatus(customDomainTarget),
      value: customDomainTarget ?? "Niet geconfigureerd",
      source: "FIELDGRID_CUSTOM_DOMAIN_CNAME_TARGET / FIELDGRID_CUSTOM_DOMAIN_DNS_TARGET / FIELDGRID_PUBLIC_IPV4 / FIELDGRID_PUBLIC_IPV6",
      detail: "Waarde die platform-admins tonen als custom domain DNS target bij Enterprise DNS-instructies.",
      nextAction: customDomainTarget
        ? "Controleer of deze waarde overeenkomt met de Caddy/VPS ingress."
        : "Leg de publieke IPv4/IPv6 of CNAME target vast voordat custom domains breed live gaan.",
    },
    {
      id: "caddy-ask-mode",
      label: "Caddy ask mode",
      category: "domains",
      status: configuredStatus(caddyAskMode),
      value: caddyAskMode ?? "Niet geconfigureerd",
      source: "CADDY_ASK_MODE / CADDY_ASK_ENDPOINT / API_INTERNAL_URL",
      detail: "On-demand TLS mag alleen certificaten krijgen na positief ask-domain antwoord.",
      nextAction: caddyAskMode ? "Verifieer staging met een verified Enterprise custom domain." : "Configureer Caddy ask richting /internal/caddy/ask-domain.",
    },
    {
      id: "smtp-system-mail",
      label: "SMTP/system mail",
      category: "mail",
      status: systemMailConfigured ? "ok" : "manual",
      value: systemMailConfigured
        ? `Platform SMTP ${smtp.smtpEnabled ? "actief" : "via fallback"}, from ${smtp.smtpFromEmail || mail.fromEmail || "tenant-default"}, Resend ${envValue("RESEND_API_KEY") ? "aanwezig" : "niet nodig"}`
        : "Geen platform SMTP of RESEND_API_KEY zichtbaar",
      source: "Platform instellingen / organization_settings SMTP / RESEND_API_KEY",
      detail: "Platformbrede e-mailtransportconfiguratie voor uitnodigingen, notificaties en systeemmails zonder secrets te tonen.",
      nextAction: systemMailConfigured
        ? `Standaard tenantafzenders blijven ${smtp.defaultTenantFromPattern}; SendGrid volgt als aparte koppeling.`
        : "Configureer platform SMTP of RESEND_API_KEY voor uitnodigingen en meldingen.",
    },
    {
      id: "default-branding",
      label: "Default branding",
      category: "branding",
      status: "ok",
      value: `${defaultBrandName}, ${mail.brandingConfigured} tenant brandingconfiguratie(s)`,
      source: "FIELDGRID_DEFAULT_BRAND_NAME / organization_settings email template defaults",
      detail: "Fallback naam en templatekleuren voor default branding voordat tenants eigen branding zetten.",
      nextAction: "Houd Fieldgrid als fallback consistent met marketing en tenant first-run.",
    },
    {
      id: "smoke-targets",
      label: "Smoke targets",
      category: "operations",
      status: smokeTargetValue.includes("ontbreekt") ? "manual" : "ok",
      value: smokeTargetValue,
      source: "FIELDGRID_STAGING_SMOKE_API_URL / FIELDGRID_MIGRATION_SMOKE_*",
      detail: "Readiness voor read-only staging smoke en migration smoke targets.",
      nextAction: "Vul GitHub environment secrets zodat operations zonder terminal kan verklaren welke smoke mist.",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    settings,
    summary: summarizeStatus(settings),
    changeRequestOptions: settings.map((setting) => ({ id: setting.id, label: setting.label })),
    smtp,
  };
}

export async function updatePlatformSmtpSettings(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const smtpPortRaw = formValue(formData, "smtpPort");
  const smtpPort = smtpPortRaw ? Number(smtpPortRaw) : null;
  const smtpEncryption = normalizeSmtpEncryption(formValue(formData, "smtpEncryption"));
  const payload = {
    smtpEnabled: formCheckbox(formData, "smtpEnabled"),
    smtpHost: nullableFormValue(formData, "smtpHost"),
    smtpPort,
    smtpEncryption,
    smtpUsername: nullableFormValue(formData, "smtpUsername"),
    smtpFromName: nullableFormValue(formData, "smtpFromName"),
    smtpFromEmail: nullableFormValue(formData, "smtpFromEmail"),
    smtpReplyTo: nullableFormValue(formData, "smtpReplyTo"),
  };
  const smtpPassword = nullableFormValue(formData, "smtpPassword");
  const clearPassword = formCheckbox(formData, "clearPassword");

  if (smtpPortRaw && (!Number.isInteger(smtpPort) || smtpPort! < 1 || smtpPort! > 65535)) {
    return { success: false, message: "SMTP-poort moet tussen 1 en 65535 liggen." };
  }
  if (payload.smtpEnabled) {
    if (!payload.smtpHost) return { success: false, message: "SMTP-host is verplicht wanneer SMTP actief is." };
    if (!payload.smtpPort) return { success: false, message: "SMTP-poort is verplicht wanneer SMTP actief is." };
    if (!payload.smtpFromEmail || !isEmailLike(payload.smtpFromEmail)) {
      return { success: false, message: "Een geldig afzenderadres is verplicht wanneer SMTP actief is." };
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
    emailAfzender: payload.smtpFromEmail,
    updatedAt: new Date(),
    updatedBy: actor.userId,
  };

  if (clearPassword) {
    updateData.smtpPassword = null;
  } else if (smtpPassword) {
    updateData.smtpPassword = smtpPassword;
  }

  const updatedRows = await db
    .update(organizationSettingsTable)
    .set(updateData)
    .returning({ id: organizationSettingsTable.id });

  if (updatedRows.length === 0) {
    return { success: false, message: "Er is nog geen organisatie-instellingenrecord om platform SMTP op toe te passen." };
  }

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "platform_smtp_settings_updated",
    resource: "platform_settings",
    resourceId: "smtp",
    metadata: {
      smtpEnabled: payload.smtpEnabled,
      smtpHost: payload.smtpHost,
      smtpPort: payload.smtpPort,
      smtpEncryption: payload.smtpEncryption,
      smtpFromEmail: payload.smtpFromEmail,
      smtpReplyTo: payload.smtpReplyTo,
      passwordChanged: Boolean(smtpPassword || clearPassword),
      updatedRows: updatedRows.length,
      sendgridRoadmap: true,
      defaultTenantFromPattern: "<mail>@<slug>.fieldgrid.nl",
      enterpriseCustomMailDomainsOnly: true,
    },
  });

  revalidatePath("/platform/settings");
  revalidatePath("/platform/operations");
  return { success: true };
}

export async function requestPlatformSettingChange(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const settingKey = formValue(formData, "settingKey");
  const proposedValue = formValue(formData, "proposedValue");
  const reason = formValue(formData, "reason");

  if (!settingKey || !proposedValue || reason.length < 8) {
    return { success: false, message: "Kies een instelling, vul een voorstel in en geef een korte reden." };
  }

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "platform_setting_change_requested",
    resource: "platform_settings",
    resourceId: settingKey,
    metadata: {
      proposedValue,
      reason,
      actorPlatformRole: actor.role,
    },
  });

  revalidatePath("/platform/settings");
  revalidatePath("/platform/security");
  return { success: true };
}

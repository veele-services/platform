"use server";

import {
  auditLogTable,
  db,
  DEFAULT_PLATFORM_HOSTS,
  FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES,
  getPlatformBrandTheme,
  organizationSettingsTable,
  platformHosts,
} from "@workspace/db";
import {
  getPlatformEmailProviderSettings,
  savePlatformEmailProviderSettings,
  sendPlatformEmailTest,
  type PlatformEmailProviderAdminView,
  type PlatformEmailProviderType,
} from "@workspace/db/email-service";
import { sql } from "drizzle-orm";
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
  emailProviders: PlatformEmailProviderAdminView[];
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
  const smtp = (await getPlatformEmailProviderSettings()).find((provider) => provider.providerType === "smtp");

  return {
    smtpEnabled: Boolean(smtp?.isActive),
    smtpHost: smtp?.config.smtpHost ?? "",
    smtpPort: smtp?.config.smtpPort ?? null,
    smtpEncryption: normalizeSmtpEncryption(smtp?.config.smtpEncryption),
    smtpUsername: smtp?.config.smtpUsername ?? "",
    smtpPasswordConfigured: Boolean(smtp?.config.smtpPasswordConfigured),
    smtpFromName: smtp?.fromName ?? "Fieldgrid",
    smtpFromEmail: smtp?.fromEmail ?? "noreply@fieldgrid.nl",
    smtpReplyTo: smtp?.replyToEmail ?? "",
    defaultTenantFromPattern: "<mail>@<slug>.fieldgrid.nl",
  };
}

export async function getPlatformSettingsDashboard(): Promise<PlatformSettingsDashboard> {
  await requirePlatformAdmin();

  const [mail, smtp, emailProviders, platformTheme] = await Promise.all([
    getMailSnapshot(),
    getPlatformSmtpSettings(),
    getPlatformEmailProviderSettings(),
    getPlatformBrandTheme(),
  ]);
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
  const activeEmailProvider = emailProviders.find((provider) => provider.isActive);
  const systemMailConfigured = Boolean(activeEmailProvider?.configured);

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
      label: "E-mailprovider",
      category: "mail",
      status: systemMailConfigured ? "ok" : "manual",
      value: systemMailConfigured
        ? `${activeEmailProvider?.name ?? "Provider"} actief, from ${activeEmailProvider?.fromEmail || smtp.smtpFromEmail || mail.fromEmail || "tenant-default"}`
        : "Geen actieve platform e-mailprovider geconfigureerd",
      source: "platform_email_providers",
      detail: "Platformbrede e-mailtransportconfiguratie voor uitnodigingen, notificaties en systeemmails met encrypted secrets.",
      nextAction: systemMailConfigured
        ? "Verstuur na provider- of DNS-wijzigingen altijd een echte testmail."
        : "Configureer bij voorkeur SendGrid API, of gebruik Resend API/SMTP als fallback.",
    },
    {
      id: "default-branding",
      label: "Default branding",
      category: "branding",
      status: "ok",
      value: `${platformTheme.brandName}, ${mail.brandingConfigured} tenant brandingconfiguratie(s)`,
      source: "platform_theme_settings / tenant_theme_settings / organization_settings legacy defaults",
      detail: "Platformthema is de fallback voordat tenants een eigen thema activeren.",
      nextAction: "Beheer kleuren, logo's en e-mailstijl in Branding & Thema op deze pagina.",
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
    emailProviders,
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

  const saved = await savePlatformEmailProviderSettings({
    providerType: "smtp",
    name: "SMTP",
    isActive: payload.smtpEnabled,
    fromEmail: payload.smtpFromEmail ?? "noreply@fieldgrid.nl",
    fromName: payload.smtpFromName ?? "Fieldgrid",
    replyToEmail: payload.smtpReplyTo,
    smtpHost: payload.smtpHost,
    smtpPort: payload.smtpPort,
    smtpEncryption: payload.smtpEncryption,
    smtpUsername: payload.smtpUsername,
    smtpPassword,
    clearSmtpPassword: clearPassword,
    updatedBy: actor.userId,
  });

  if (!saved.success) return saved;

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "platform_email_provider_updated",
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
      sendgridRoadmap: true,
      defaultTenantFromPattern: "<mail>@<slug>.fieldgrid.nl",
      enterpriseCustomMailDomainsOnly: true,
    },
  });

  revalidatePath("/platform/settings");
  revalidatePath("/platform/operations");
  return saved;
}

export async function updatePlatformEmailProviderSettings(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const providerTypeRaw = formValue(formData, "providerType");
  const providerType = providerTypeRaw === "sendgrid_api" || providerTypeRaw === "resend_api" || providerTypeRaw === "smtp" ? providerTypeRaw : null;
  if (!providerType) return { success: false, message: "Kies een geldige e-mailprovider." };

  const smtpPortRaw = formValue(formData, "smtpPort");
  const smtpPort = smtpPortRaw ? Number(smtpPortRaw) : null;
  if (smtpPortRaw && (!Number.isInteger(smtpPort) || smtpPort! < 1 || smtpPort! > 65535)) {
    return { success: false, message: "SMTP-poort moet tussen 1 en 65535 liggen." };
  }

  const fromEmail = formValue(formData, "fromEmail");
  const replyToEmail = nullableFormValue(formData, "replyToEmail");
  if (!fromEmail || !isEmailLike(fromEmail)) return { success: false, message: "Vul een geldig afzenderadres in." };
  if (replyToEmail && !isEmailLike(replyToEmail)) return { success: false, message: "Reply-to e-mailadres is ongeldig." };

  const saved = await savePlatformEmailProviderSettings({
    providerType: providerType as PlatformEmailProviderType,
    name: nullableFormValue(formData, "name"),
    isActive: formCheckbox(formData, "isActive"),
    fromEmail,
    fromName: formValue(formData, "fromName") || "Fieldgrid",
    replyToEmail,
    sendgridApiKey: nullableFormValue(formData, "sendgridApiKey"),
    sendgridApiRegion: formValue(formData, "sendgridApiRegion") === "eu" ? "eu" : "global",
    clearSendGridApiKey: formCheckbox(formData, "clearSendGridApiKey"),
    resendApiKey: nullableFormValue(formData, "resendApiKey"),
    sendingDomain: nullableFormValue(formData, "sendingDomain"),
    smtpHost: nullableFormValue(formData, "smtpHost"),
    smtpPort,
    smtpEncryption: normalizeSmtpEncryption(formValue(formData, "smtpEncryption")),
    smtpUsername: nullableFormValue(formData, "smtpUsername"),
    smtpPassword: nullableFormValue(formData, "smtpPassword"),
    clearSmtpPassword: formCheckbox(formData, "clearSmtpPassword"),
    updatedBy: actor.userId,
  });

  if (!saved.success) return saved;

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "platform_email_provider_updated",
    resource: "platform_settings",
    resourceId: providerType,
    metadata: {
      providerType,
      active: formCheckbox(formData, "isActive"),
      fromEmail,
      replyToEmail,
      secretChanged: Boolean(
        nullableFormValue(formData, "sendgridApiKey") ||
        formCheckbox(formData, "clearSendGridApiKey") ||
        nullableFormValue(formData, "resendApiKey") ||
        nullableFormValue(formData, "smtpPassword") ||
        formCheckbox(formData, "clearSmtpPassword"),
      ),
    },
  });

  revalidatePath("/platform/settings");
  revalidatePath("/platform/operations");
  return saved;
}

export async function sendPlatformEmailTestAction(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const testEmail = formValue(formData, "testEmail");
  if (!testEmail || !isEmailLike(testEmail)) return { success: false, message: "Vul een geldig test e-mailadres in." };

  const result = await sendPlatformEmailTest({ to: testEmail, triggeredBy: actor.userId });
  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "platform_email_test_sent",
    resource: "platform_settings",
    resourceId: result.providerId ?? result.providerType,
    metadata: {
      providerType: result.providerType,
      success: result.success,
      error: result.error ?? null,
    },
  });

  revalidatePath("/platform/settings");
  return result.success
    ? { success: true }
    : { success: false, message: result.error ?? "Testmail versturen mislukt." };
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

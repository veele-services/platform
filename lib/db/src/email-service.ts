import crypto from "node:crypto";
import { Resend } from "resend";
import { desc, eq } from "drizzle-orm";
import { db } from "./index";
import {
  emailDeliveryLogTable,
  organizationSettingsTable,
  platformEmailProvidersTable,
  type PlatformEmailProvider,
} from "./schema";
import { sendSmtpMail, type SmtpEncryption, type SmtpMailConfig } from "./email-smtp";

export type PlatformEmailProviderType = "resend_api" | "smtp";
export type RuntimeEmailProviderType = PlatformEmailProviderType | "legacy_smtp" | "env_resend" | "none";
export type PlatformEmailProviderStatus = "draft" | "configured" | "disabled" | "error";
export type PlatformEmailTestStatus = "success" | "failed";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
};

export type TransactionalEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  tenantId?: string | null;
  templateKey?: string | null;
  purpose?: string | null;
  triggeredBy?: string | null;
  triggeredByType?: "platform_admin" | "tenant_user" | "customer_user" | "personnel_user" | "system";
  metadata?: Record<string, unknown>;
};

export type TransactionalEmailResult = {
  success: boolean;
  error?: string;
  providerType: RuntimeEmailProviderType;
  providerId?: string | null;
  providerMessageId?: string | null;
};

type ResendProviderConfig = {
  apiKey?: string | null;
  sendingDomain?: string | null;
};

type SmtpProviderConfig = {
  host?: string | null;
  port?: number | null;
  encryption?: SmtpEncryption | null;
  username?: string | null;
  password?: string | null;
};

type EmailProviderConfig = ResendProviderConfig & SmtpProviderConfig;

type ResolvedProvider = {
  id: string | null;
  providerType: RuntimeEmailProviderType;
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string | null;
  config: EmailProviderConfig;
};

export type PlatformEmailProviderAdminView = {
  id: string | null;
  providerType: PlatformEmailProviderType;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  status: PlatformEmailProviderStatus;
  configured: boolean;
  maskedSecret: string | null;
  lastTestedAt: string | null;
  lastTestStatus: PlatformEmailTestStatus | null;
  lastTestError: string | null;
  config: {
    sendingDomain: string;
    smtpHost: string;
    smtpPort: number | null;
    smtpEncryption: SmtpEncryption;
    smtpUsername: string;
    smtpPasswordConfigured: boolean;
  };
};

export type SavePlatformEmailProviderInput = {
  providerType: PlatformEmailProviderType;
  name?: string | null;
  isActive: boolean;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string | null;
  resendApiKey?: string | null;
  sendingDomain?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpEncryption?: SmtpEncryption | null;
  smtpUsername?: string | null;
  smtpPassword?: string | null;
  clearSmtpPassword?: boolean;
  updatedBy?: string | null;
};

const DEFAULT_FROM_EMAIL = "noreply@fieldgrid.nl";
const DEFAULT_FROM_NAME = "Fieldgrid";
const ENCRYPTION_KEY_ENV = "FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY";
const LEGACY_ENCRYPTION_KEY_ENV = "PLATFORM_EMAIL_CONFIG_ENCRYPTION_KEY";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeEncryption(value: string | null | undefined): SmtpEncryption {
  if (value === "none" || value === "tls" || value === "starttls") return value;
  return "starttls";
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isEmailLike(value: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(String(value ?? "").trim());
}

function sanitizeError(error: unknown): string {
  const raw = String((error as { message?: string })?.message ?? error ?? "Onbekende e-mailfout");
  return raw
    .replace(/re_[A-Za-z0-9_-]{8,}/gu, "re_[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/giu, "Bearer [redacted]")
    .replace(/password\s*[:=]\s*\S+/giu, "password=[redacted]")
    .slice(0, 1800);
}

function getEncryptionKey(): Buffer {
  const secret = process.env[ENCRYPTION_KEY_ENV] ?? process.env[LEGACY_ENCRYPTION_KEY_ENV];
  if (!secret) {
    throw new Error(`${ENCRYPTION_KEY_ENV} must be set before storing platform e-mail secrets.`);
  }

  if (secret.startsWith("base64:")) {
    const decoded = Buffer.from(secret.slice("base64:".length), "base64");
    if (decoded.length === 32) return decoded;
  }

  if (secret.startsWith("hex:")) {
    const decoded = Buffer.from(secret.slice("hex:".length), "hex");
    if (decoded.length === 32) return decoded;
  }

  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function encryptPlatformEmailConfig(config: EmailProviderConfig): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(config), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

export function decryptPlatformEmailConfig(value: string | null | undefined): EmailProviderConfig {
  if (!value || value === "{}") return {};
  const parsed = JSON.parse(value) as unknown;

  if (!isRecord(parsed) || parsed.v !== 1) {
    return isRecord(parsed) ? (parsed as EmailProviderConfig) : {};
  }

  const iv = Buffer.from(String(parsed.iv ?? ""), "base64");
  const tag = Buffer.from(String(parsed.tag ?? ""), "base64");
  const data = Buffer.from(String(parsed.data ?? ""), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  const config = JSON.parse(decrypted) as unknown;
  return isRecord(config) ? (config as EmailProviderConfig) : {};
}

export function maskEmailSecret(value: string | null | undefined, prefixLength = 3): string | null {
  if (!value) return null;
  if (value.length <= prefixLength + 4) return "geconfigureerd";
  return `${value.slice(0, prefixLength)}${"*".repeat(12)}${value.slice(-4)}`;
}

function formatAddress(email: string, name?: string | null): string {
  const trimmedEmail = email.trim();
  const trimmedName = name?.trim();
  if (!trimmedName) return trimmedEmail;
  return `${trimmedName.replace(/"/gu, "")} <${trimmedEmail}>`;
}

function normalizeRecipients(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function getLegacySmtpProvider(): Promise<ResolvedProvider | null> {
  const smtpRows = await db
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
    .where(eq(organizationSettingsTable.smtpEnabled, true))
    .orderBy(desc(organizationSettingsTable.updatedAt))
    .limit(25);

  const settings = smtpRows.find((row) => row.smtpHost && row.smtpPort && row.smtpFromEmail);
  if (!settings) return null;

  return {
    id: null,
    providerType: "legacy_smtp",
    fromEmail: settings.smtpFromEmail!,
    fromName: settings.smtpFromName ?? DEFAULT_FROM_NAME,
    replyToEmail: settings.smtpReplyTo ?? null,
    config: {
      host: settings.smtpHost,
      port: settings.smtpPort,
      encryption: normalizeEncryption(settings.smtpEncryption),
      username: settings.smtpUsername,
      password: settings.smtpPassword,
    },
  };
}

async function getEnvResendProvider(): Promise<ResolvedProvider | null> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return null;
  const from = process.env["RESEND_FROM_EMAIL"] ?? formatAddress(DEFAULT_FROM_EMAIL, DEFAULT_FROM_NAME);
  const match = from.match(/^(.*?)\s*<([^>]+)>$/u);
  return {
    id: null,
    providerType: "env_resend",
    fromEmail: match?.[2]?.trim() ?? from.trim(),
    fromName: match?.[1]?.trim() || DEFAULT_FROM_NAME,
    replyToEmail: process.env["RESEND_REPLY_TO_EMAIL"] ?? null,
    config: { apiKey },
  };
}

async function resolveActiveProvider(): Promise<ResolvedProvider | null> {
  const [provider] = await db
    .select()
    .from(platformEmailProvidersTable)
    .where(eq(platformEmailProvidersTable.isActive, true))
    .orderBy(desc(platformEmailProvidersTable.updatedAt))
    .limit(1);

  if (provider) {
    return {
      id: provider.id,
      providerType: provider.providerType as PlatformEmailProviderType,
      fromEmail: provider.fromEmail,
      fromName: provider.fromName,
      replyToEmail: provider.replyToEmail,
      config: decryptPlatformEmailConfig(provider.encryptedConfigJson),
    };
  }

  return (await getLegacySmtpProvider()) ?? (await getEnvResendProvider());
}

function assertProviderReady(provider: ResolvedProvider): void {
  if (!isEmailLike(provider.fromEmail)) throw new Error("Afzender e-mailadres is ongeldig.");

  if (provider.providerType === "resend_api" || provider.providerType === "env_resend") {
    if (!provider.config.apiKey) throw new Error("Resend API key ontbreekt.");
    return;
  }

  if (provider.providerType === "smtp" || provider.providerType === "legacy_smtp") {
    if (!provider.config.host) throw new Error("SMTP-host ontbreekt.");
    if (!provider.config.port) throw new Error("SMTP-poort ontbreekt.");
    return;
  }

  throw new Error("Geen ondersteunde e-mailprovider actief.");
}

async function logDelivery(
  input: TransactionalEmailInput,
  provider: ResolvedProvider | null,
  status: "success" | "failed" | "skipped",
  errorMessage?: string | null,
  providerMessageId?: string | null,
): Promise<void> {
  const recipients = normalizeRecipients(input.to);
  const rows = recipients.map((recipient) => ({
    providerId: provider?.id ?? null,
    providerType: provider?.providerType ?? "none",
    templateKey: input.templateKey ?? input.purpose ?? null,
    tenantId: input.tenantId ?? null,
    recipientEmail: recipient,
    subject: input.subject.slice(0, 500),
    status,
    providerMessageId: providerMessageId ?? null,
    errorMessage: errorMessage ? sanitizeError(errorMessage) : null,
    triggeredBy: input.triggeredBy ?? null,
    triggeredByType: input.triggeredByType ?? "system",
    metadata: input.metadata ?? {},
  }));

  if (rows.length === 0) return;

  try {
    await db.insert(emailDeliveryLogTable).values(rows);
  } catch (error) {
    console.error("[email-service] delivery log insert failed:", sanitizeError(error));
  }
}

async function sendWithResend(provider: ResolvedProvider, input: TransactionalEmailInput): Promise<string | null> {
  const resend = new Resend(provider.config.apiKey!);
  const { data, error } = await resend.emails.send({
    from: formatAddress(provider.fromEmail, provider.fromName),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: provider.replyToEmail ?? undefined,
    attachments: input.attachments,
  });

  if (error) throw new Error(String((error as { message?: string }).message ?? error));
  return data?.id ?? null;
}

async function sendWithSmtp(provider: ResolvedProvider, input: TransactionalEmailInput): Promise<string | null> {
  const config: SmtpMailConfig = {
    host: provider.config.host!,
    port: provider.config.port!,
    encryption: normalizeEncryption(provider.config.encryption),
    username: provider.config.username ?? null,
    password: provider.config.password ?? null,
    fromEmail: provider.fromEmail,
    fromName: provider.fromName,
    replyTo: provider.replyToEmail,
  };

  return sendSmtpMail(config, {
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: input.attachments,
  });
}

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  const provider = await resolveActiveProvider();
  if (!provider) {
    const error = "Geen actieve platform e-mailprovider geconfigureerd.";
    await logDelivery(input, null, "skipped", error);
    return { success: false, error, providerType: "none", providerId: null };
  }

  try {
    assertProviderReady(provider);
    const providerMessageId =
      provider.providerType === "resend_api" || provider.providerType === "env_resend"
        ? await sendWithResend(provider, input)
        : await sendWithSmtp(provider, input);

    await logDelivery(input, provider, "success", null, providerMessageId);
    return {
      success: true,
      providerType: provider.providerType,
      providerId: provider.id,
      providerMessageId,
    };
  } catch (error) {
    const message = sanitizeError(error);
    await logDelivery(input, provider, "failed", message);
    return {
      success: false,
      error: message,
      providerType: provider.providerType,
      providerId: provider.id,
    };
  }
}

export async function sendEmail(input: TransactionalEmailInput): Promise<void> {
  const result = await sendTransactionalEmail(input);
  if (!result.success) {
    console.error("[email-service] Verzenden mislukt:", result.error);
  }
}

function providerStatus(provider: PlatformEmailProvider, config: EmailProviderConfig): PlatformEmailProviderStatus {
  if (!provider.isActive && provider.status === "disabled") return "disabled";
  if (provider.providerType === "resend_api") return config.apiKey && provider.fromEmail ? "configured" : "draft";
  if (provider.providerType === "smtp") return config.host && config.port && provider.fromEmail ? "configured" : "draft";
  return "draft";
}

function toAdminView(provider: PlatformEmailProvider): PlatformEmailProviderAdminView {
  const config = decryptPlatformEmailConfig(provider.encryptedConfigJson);
  const type = provider.providerType as PlatformEmailProviderType;
  return {
    id: provider.id,
    providerType: type,
    name: provider.name,
    isActive: provider.isActive,
    isDefault: provider.isDefault,
    fromEmail: provider.fromEmail,
    fromName: provider.fromName,
    replyToEmail: provider.replyToEmail ?? "",
    status: providerStatus(provider, config),
    configured: type === "resend_api" ? Boolean(config.apiKey) : Boolean(config.host && config.port),
    maskedSecret: type === "resend_api" ? maskEmailSecret(config.apiKey, 3) : maskEmailSecret(config.password, 0),
    lastTestedAt: provider.lastTestedAt?.toISOString() ?? null,
    lastTestStatus: provider.lastTestStatus as PlatformEmailTestStatus | null,
    lastTestError: provider.lastTestError,
    config: {
      sendingDomain: config.sendingDomain ?? "",
      smtpHost: config.host ?? "",
      smtpPort: config.port ?? null,
      smtpEncryption: normalizeEncryption(config.encryption),
      smtpUsername: config.username ?? "",
      smtpPasswordConfigured: Boolean(config.password),
    },
  };
}

export async function getPlatformEmailProviderSettings(): Promise<PlatformEmailProviderAdminView[]> {
  const providers = await db
    .select()
    .from(platformEmailProvidersTable)
    .orderBy(desc(platformEmailProvidersTable.isActive), platformEmailProvidersTable.providerType);

  const views = providers.map(toAdminView);
  const existingTypes = new Set(views.map((view) => view.providerType));

  if (!existingTypes.has("resend_api")) {
    views.push({
      id: null,
      providerType: "resend_api",
      name: "Resend API",
      isActive: false,
      isDefault: false,
      fromEmail: DEFAULT_FROM_EMAIL,
      fromName: DEFAULT_FROM_NAME,
      replyToEmail: "",
      status: "draft",
      configured: false,
      maskedSecret: null,
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestError: null,
      config: {
        sendingDomain: "",
        smtpHost: "",
        smtpPort: null,
        smtpEncryption: "starttls",
        smtpUsername: "",
        smtpPasswordConfigured: false,
      },
    });
  }

  if (!existingTypes.has("smtp")) {
    views.push({
      id: null,
      providerType: "smtp",
      name: "SMTP",
      isActive: false,
      isDefault: false,
      fromEmail: DEFAULT_FROM_EMAIL,
      fromName: DEFAULT_FROM_NAME,
      replyToEmail: "",
      status: "draft",
      configured: false,
      maskedSecret: null,
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestError: null,
      config: {
        sendingDomain: "",
        smtpHost: "",
        smtpPort: 587,
        smtpEncryption: "starttls",
        smtpUsername: "",
        smtpPasswordConfigured: false,
      },
    });
  }

  return views.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.providerType.localeCompare(b.providerType));
}

function validateProviderInput(input: SavePlatformEmailProviderInput, config: EmailProviderConfig): string | null {
  if (!isEmailLike(input.fromEmail)) return "Vul een geldig afzenderadres in.";
  if (input.replyToEmail && !isEmailLike(input.replyToEmail)) return "Vul een geldig reply-to adres in.";

  if (input.providerType === "resend_api") {
    if (input.isActive && !config.apiKey) return "Resend API key is verplicht wanneer Resend actief is.";
    return null;
  }

  if (input.isActive) {
    if (!config.host) return "SMTP-host is verplicht wanneer SMTP actief is.";
    if (!config.port || config.port < 1 || config.port > 65535) return "SMTP-poort moet tussen 1 en 65535 liggen.";
  }

  return null;
}

export async function savePlatformEmailProviderSettings(input: SavePlatformEmailProviderInput): Promise<{ success: boolean; message: string }> {
  const [existing] = await db
    .select()
    .from(platformEmailProvidersTable)
    .where(eq(platformEmailProvidersTable.providerType, input.providerType))
    .limit(1);

  const existingConfig = existing ? decryptPlatformEmailConfig(existing.encryptedConfigJson) : {};
  const config: EmailProviderConfig =
    input.providerType === "resend_api"
      ? {
          apiKey: input.resendApiKey?.trim() || existingConfig.apiKey || null,
          sendingDomain: input.sendingDomain?.trim() || null,
        }
      : {
          host: input.smtpHost?.trim() || null,
          port: input.smtpPort ?? null,
          encryption: normalizeEncryption(input.smtpEncryption),
          username: input.smtpUsername?.trim() || null,
          password: input.clearSmtpPassword ? null : input.smtpPassword?.trim() || existingConfig.password || null,
        };

  const validationError = validateProviderInput(input, config);
  if (validationError) return { success: false, message: validationError };

  const status: PlatformEmailProviderStatus = input.isActive ? "configured" : "disabled";
  const encryptedConfigJson = encryptPlatformEmailConfig(config);
  const payload = {
    providerType: input.providerType,
    name: input.name?.trim() || (input.providerType === "resend_api" ? "Resend API" : "SMTP"),
    isActive: input.isActive,
    isDefault: input.isActive,
    encryptedConfigJson,
    fromEmail: normalizeEmail(input.fromEmail) || DEFAULT_FROM_EMAIL,
    fromName: input.fromName.trim() || DEFAULT_FROM_NAME,
    replyToEmail: input.replyToEmail?.trim() || null,
    status,
    updatedAt: new Date(),
    updatedBy: input.updatedBy ?? null,
  };

  await db.transaction(async (tx) => {
    if (input.isActive) {
      await tx.update(platformEmailProvidersTable).set({ isActive: false, isDefault: false });
    }

    if (existing) {
      await tx
        .update(platformEmailProvidersTable)
        .set(payload)
        .where(eq(platformEmailProvidersTable.id, existing.id));
    } else {
      await tx.insert(platformEmailProvidersTable).values({
        ...payload,
        createdAt: new Date(),
      });
    }
  });

  return { success: true, message: "Platform e-mailprovider opgeslagen." };
}

export async function sendPlatformEmailTest(input: {
  to: string;
  triggeredBy?: string | null;
}): Promise<TransactionalEmailResult> {
  const to = input.to.trim().toLowerCase();
  if (!isEmailLike(to)) {
    return { success: false, error: "Vul een geldig test e-mailadres in.", providerType: "none" };
  }

  const result = await sendTransactionalEmail({
    to,
    subject: "Testmail vanuit Fieldgrid / platform e-mailinstellingen",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2 style="margin:0 0 12px">Fieldgrid testmail</h2>
        <p>Dit is een testmail vanuit de globale platform e-mailconfiguratie.</p>
        <p>Als je deze mail ontvangt, werkt de actieve e-mailprovider correct.</p>
      </div>
    `,
    text: "Dit is een testmail vanuit de globale platform e-mailconfiguratie. Als je deze mail ontvangt, werkt de actieve e-mailprovider correct.",
    templateKey: "platform_email_test",
    triggeredBy: input.triggeredBy ?? null,
    triggeredByType: input.triggeredBy ? "platform_admin" : "system",
  });

  if (result.providerId) {
    await db
      .update(platformEmailProvidersTable)
      .set({
        lastTestedAt: new Date(),
        lastTestStatus: result.success ? "success" : "failed",
        lastTestError: result.success ? null : result.error ?? "Testmail mislukt.",
        status: result.success ? "configured" : "error",
        updatedAt: new Date(),
      })
      .where(eq(platformEmailProvidersTable.id, result.providerId));
  }

  return result;
}

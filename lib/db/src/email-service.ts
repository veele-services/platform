import crypto from "node:crypto";
import { appendFile } from "node:fs/promises";
import { Resend } from "resend";
import { desc, eq } from "drizzle-orm";
import { db } from "./index";
import { emailDeliveryLogTable, organizationSettingsTable, platformEmailProvidersTable, tenantsTable, type PlatformEmailProvider } from "./schema";
import { sendSmtpMail, type SmtpEncryption, type SmtpMailConfig } from "./email-smtp";
import { consumeRenderedEmailMetadata, renderEmailTemplate, type EmailTemplateKey, type EmailTemplateVariables } from "./email-templates";
import { normalizeSendGridApiRegion, sendSendGridMail, type SendGridApiRegion } from "./email-sendgrid";
import { selectEmailProviderForMessage, type FieldgridEmailProviderScope } from "./email-provider-resolution";
import {
  decryptEmailSecretJson,
  decryptTenantSmtpPassword,
  encryptEmailSecretJson,
} from "./email-secret-crypto";
import { isTenantRuntimeActive } from "./tenant-context";

export type PlatformEmailProviderType = "sendgrid_api" | "resend_api" | "smtp";
export type RuntimeEmailProviderType = PlatformEmailProviderType | "env_resend" | "test_outbox" | "none";
export type PlatformEmailProviderStatus = "draft" | "configured" | "disabled" | "error";
export type PlatformEmailTestStatus = "success" | "failed";
export type TenantEmailTransport = "platform" | "smtp" | "api";
export type TenantEmailApiProvider = "resend";

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
  /** Stable provider key for safe retries. Never include recipient data or secrets. */
  idempotencyKey?: string;
};

export type TransactionalEmailResult = {
  success: boolean;
  error?: string;
  providerType: RuntimeEmailProviderType;
  providerId?: string | null;
  providerMessageId?: string | null;
  /** Whether a provider could have accepted the message before an error surfaced. */
  deliveryEffect: "not_attempted" | "accepted" | "unknown";
  /** Internal optimistic-concurrency token used by the provider test flow. */
  providerConfigurationFingerprint?: string;
};

export type SensitiveOtpTransport = (message: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<void>;

export type TemplatedEmailInput = Omit<TransactionalEmailInput, "subject" | "html" | "text" | "templateKey"> & {
  templateKey: EmailTemplateKey;
  variables: EmailTemplateVariables;
};

type ResendProviderConfig = {
  apiKey?: string | null;
  sendingDomain?: string | null;
};

type SendGridProviderConfig = {
  apiKey?: string | null;
  apiRegion?: SendGridApiRegion | null;
  sendingDomain?: string | null;
};

type SmtpProviderConfig = {
  host?: string | null;
  port?: number | null;
  encryption?: SmtpEncryption | null;
  username?: string | null;
  password?: string | null;
};

type EmailProviderConfig = ResendProviderConfig & SendGridProviderConfig & SmtpProviderConfig;

type ResolvedProvider = {
  id: string | null;
  scope: FieldgridEmailProviderScope;
  providerType: RuntimeEmailProviderType;
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string | null;
  config: EmailProviderConfig;
  configurationFingerprint?: string;
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
    sendgridApiRegion: SendGridApiRegion;
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
  sendgridApiKey?: string | null;
  sendgridApiRegion?: SendGridApiRegion | null;
  clearSendGridApiKey?: boolean;
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
const DEFAULT_SENDING_DOMAIN = "fieldgrid.nl";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeEncryption(value: string | null | undefined): SmtpEncryption {
  if (value === "none" || value === "tls" || value === "starttls") return value;
  return "starttls";
}

function normalizeTenantTransport(value: string | null | undefined, smtpEnabled?: boolean | null): TenantEmailTransport {
  if (value === "platform" || value === "smtp" || value === "api") return value;
  return smtpEnabled ? "smtp" : "platform";
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeSendingDomain(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/u, "");
}

function isEmailLike(value: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(String(value ?? "").trim());
}

function isHostname(value: string | null | undefined): boolean {
  const hostname = normalizeSendingDomain(value);
  if (!hostname || hostname.length > 253 || hostname.includes("..")) return false;
  return hostname.split(".").every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label));
}

function emailBelongsToDomain(email: string, domain: string): boolean {
  const emailDomain = normalizeEmail(email).split("@").at(-1) ?? "";
  const normalizedDomain = normalizeSendingDomain(domain);
  return emailDomain === normalizedDomain || emailDomain.endsWith(`.${normalizedDomain}`);
}

function sanitizeError(error: unknown): string {
  const raw = String((error as { message?: string })?.message ?? error ?? "Onbekende e-mailfout");
  return raw
    .replace(/re_[A-Za-z0-9_-]{8,}/gu, "re_[redacted]")
    .replace(/SG\.[A-Za-z0-9._-]{8,}/gu, "SG.[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/giu, "Bearer [redacted]")
    .replace(/api[_\s-]?key\s*[:=]\s*\S+/giu, "api_key=[redacted]")
    .replace(/password\s*[:=]\s*\S+/giu, "password=[redacted]")
    .slice(0, 1800);
}

export function encryptPlatformEmailConfig(config: EmailProviderConfig): string {
  return encryptEmailSecretJson(config);
}

export function decryptPlatformEmailConfig(value: string | null | undefined): EmailProviderConfig {
  if (!value || value === "{}") return {};
  const parsed = JSON.parse(value) as unknown;

  if (!isRecord(parsed) || parsed.v !== 1) {
    return isRecord(parsed) ? (parsed as EmailProviderConfig) : {};
  }

  return decryptEmailSecretJson(value) as EmailProviderConfig;
}

function safeDecryptPlatformEmailConfig(value: string | null | undefined): {
  config: EmailProviderConfig;
  error: string | null;
} {
  try {
    return { config: decryptPlatformEmailConfig(value), error: null };
  } catch (error) {
    console.error("[email-service] provider config decrypt failed:", sanitizeError(error));
    return {
      config: {},
      error: "E-mailsecret kon niet worden ontcijferd. Vul de API key of het wachtwoord opnieuw in en sla opnieuw op.",
    };
  }
}

function platformProviderConfigurationFingerprint(
  provider: PlatformEmailProvider,
): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        providerType: provider.providerType,
        isActive: provider.isActive,
        encryptedConfigJson: provider.encryptedConfigJson,
        fromEmail: provider.fromEmail,
        fromName: provider.fromName,
        replyToEmail: provider.replyToEmail,
      }),
    )
    .digest("hex");
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

async function getEnvResendProvider(): Promise<ResolvedProvider | null> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return null;
  const from = process.env["RESEND_FROM_EMAIL"] ?? formatAddress(DEFAULT_FROM_EMAIL, DEFAULT_FROM_NAME);
  const match = from.match(/^(.*?)\s*<([^>]+)>$/u);
  return {
    id: null,
    scope: { kind: "fieldgrid_environment" },
    providerType: "env_resend",
    fromEmail: match?.[2]?.trim() ?? from.trim(),
    fromName: match?.[1]?.trim() || DEFAULT_FROM_NAME,
    replyToEmail: process.env["RESEND_REPLY_TO_EMAIL"] ?? null,
    config: { apiKey },
  };
}

async function getTenantProvider(tenantId: string | null | undefined): Promise<ResolvedProvider | null> {
  if (!tenantId) return null;

  const [settings] = await db
    .select({
      tenantId: organizationSettingsTable.tenantId,
      naam: organizationSettingsTable.naam,
      tenantIsActive: tenantsTable.isActive,
      tenantStatus: tenantsTable.status,
      emailTransport: organizationSettingsTable.emailTransport,
      emailApiProvider: organizationSettingsTable.emailApiProvider,
      emailApiKeyEncrypted: organizationSettingsTable.emailApiKeyEncrypted,
      emailApiSendingDomain: organizationSettingsTable.emailApiSendingDomain,
      smtpEnabled: organizationSettingsTable.smtpEnabled,
      smtpHost: organizationSettingsTable.smtpHost,
      smtpPort: organizationSettingsTable.smtpPort,
      smtpEncryption: organizationSettingsTable.smtpEncryption,
      smtpUsername: organizationSettingsTable.smtpUsername,
      smtpPasswordEncrypted: organizationSettingsTable.smtpPasswordEncrypted,
      smtpFromName: organizationSettingsTable.smtpFromName,
      smtpFromEmail: organizationSettingsTable.smtpFromEmail,
      smtpReplyTo: organizationSettingsTable.smtpReplyTo,
    })
    .from(organizationSettingsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, organizationSettingsTable.tenantId))
    .where(eq(organizationSettingsTable.tenantId, tenantId))
    .limit(1);

  if (
    !settings ||
    settings.tenantId !== tenantId ||
    !isTenantRuntimeActive({
      isActive: settings.tenantIsActive,
      status: settings.tenantStatus,
    })
  ) {
    return null;
  }

  const transport = normalizeTenantTransport(settings.emailTransport, settings.smtpEnabled);
  const fromName = settings.smtpFromName ?? settings.naam ?? DEFAULT_FROM_NAME;

  if (transport === "smtp") {
    return {
      id: null,
      scope: { kind: "tenant", tenantId: settings.tenantId },
      providerType: "smtp",
      fromEmail: settings.smtpFromEmail ?? "",
      fromName,
      replyToEmail: settings.smtpReplyTo ?? null,
      config: {
        host: settings.smtpHost,
        port: settings.smtpPort,
        encryption: normalizeEncryption(settings.smtpEncryption),
        username: settings.smtpUsername,
        password: decryptTenantSmtpPassword(
          settings.tenantId,
          settings.smtpPasswordEncrypted,
        ),
      },
    };
  }

  if (transport === "api") {
    const config = safeDecryptPlatformEmailConfig(settings.emailApiKeyEncrypted).config;
    return {
      id: null,
      scope: { kind: "tenant", tenantId: settings.tenantId },
      providerType: "resend_api",
      fromEmail: settings.smtpFromEmail ?? "",
      fromName,
      replyToEmail: settings.smtpReplyTo ?? null,
      config: {
        apiKey: config.apiKey ?? null,
        sendingDomain: settings.emailApiSendingDomain ?? config.sendingDomain ?? null,
      },
    };
  }

  return null;
}

async function resolveActiveProvider(tenantId?: string | null): Promise<ResolvedProvider | null> {
  const [provider] = await db
    .select()
    .from(platformEmailProvidersTable)
    .where(eq(platformEmailProvidersTable.isActive, true))
    .orderBy(desc(platformEmailProvidersTable.updatedAt))
    .limit(1);

  if (provider) {
    const config = safeDecryptPlatformEmailConfig(provider.encryptedConfigJson).config;
    const platformProvider: ResolvedProvider = {
      id: provider.id,
      scope: { kind: "platform" },
      providerType: provider.providerType as PlatformEmailProviderType,
      fromEmail: provider.fromEmail,
      fromName: provider.fromName,
      replyToEmail: provider.replyToEmail,
      config,
      configurationFingerprint:
        platformProviderConfigurationFingerprint(provider),
    };
    return selectEmailProviderForMessage({
      messageTenantId: tenantId,
      platformProvider,
    });
  }

  const tenantProvider = await getTenantProvider(tenantId);
  if (tenantProvider) {
    return selectEmailProviderForMessage({ messageTenantId: tenantId, tenantProvider });
  }

  return selectEmailProviderForMessage({
    messageTenantId: tenantId,
    environmentProvider: await getEnvResendProvider(),
  });
}

function assertProviderReady(provider: ResolvedProvider): void {
  if (!isEmailLike(provider.fromEmail)) throw new Error("Afzender e-mailadres is ongeldig.");

  if (provider.providerType === "sendgrid_api") {
    if (!provider.config.apiKey) throw new Error("SendGrid API key ontbreekt.");
    if (!isHostname(provider.config.sendingDomain)) {
      throw new Error("SendGrid sending domain ontbreekt of is ongeldig.");
    }
    if (!emailBelongsToDomain(provider.fromEmail, provider.config.sendingDomain!)) {
      throw new Error("SendGrid-afzender hoort niet bij het ingestelde sending domain.");
    }
    return;
  }

  if (provider.providerType === "resend_api" || provider.providerType === "env_resend") {
    if (!provider.config.apiKey) throw new Error("Resend API key ontbreekt.");
    return;
  }

  if (provider.providerType === "smtp") {
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
  }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined);

  if (error) throw new Error(String((error as { message?: string }).message ?? error));
  return data?.id ?? null;
}

async function sendWithSendGrid(provider: ResolvedProvider, input: TransactionalEmailInput): Promise<string | null> {
  return sendSendGridMail(
    {
      apiKey: provider.config.apiKey!,
      apiRegion: normalizeSendGridApiRegion(provider.config.apiRegion),
      fromEmail: provider.fromEmail,
      fromName: provider.fromName,
      replyTo: provider.replyToEmail,
    },
    {
      to: normalizeRecipients(input.to),
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
      deliveryKey: input.idempotencyKey,
    },
  );
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
    deliveryKey: input.idempotencyKey,
  });
}

async function normalizeTemplateInput(input: TransactionalEmailInput): Promise<TransactionalEmailInput> {
  const metadata = consumeRenderedEmailMetadata(input.html);
  if (!metadata) return input;

  const rendered = await renderEmailTemplate({
    templateKey: metadata.templateKey,
    variables: metadata.variables,
    tenantId: input.tenantId ?? null,
  });

  return {
    ...input,
    subject: rendered.subject,
    html: rendered.html,
    text: input.text ?? rendered.text,
    templateKey: input.templateKey ?? metadata.templateKey,
    metadata: {
      ...input.metadata,
      renderedTemplateKey: metadata.templateKey,
    },
  };
}

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  let normalizedInput: TransactionalEmailInput;
  try {
    normalizedInput = await normalizeTemplateInput(input);
  } catch (error) {
    const message = sanitizeError(error);
    await logDelivery(input, null, "failed", message);
    return {
      success: false,
      error: message,
      providerType: "none",
      providerId: null,
      deliveryEffect: "not_attempted",
    };
  }

  const testOutboxPath = process.env["FIELDGRID_EMAIL_TEST_OUTBOX_PATH"];
  const testTransportAllowed = process.env.NODE_ENV === "test" || process.env["FIELDGRID_E2E_AUTH_ENABLED"] === "true";
  if (testOutboxPath && testTransportAllowed) {
    const providerMessageId = input.idempotencyKey
      ? `test-${crypto.createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 32)}`
      : `test-${crypto.randomUUID()}`;
    const captured = {
      id: providerMessageId,
      capturedAt: new Date().toISOString(),
      to: normalizeRecipients(normalizedInput.to),
      subject: normalizedInput.subject,
      html: normalizedInput.html,
      text: normalizedInput.text ?? null,
      tenantId: normalizedInput.tenantId ?? null,
      templateKey: normalizedInput.templateKey ?? null,
      purpose: normalizedInput.purpose ?? null,
    };
    await appendFile(testOutboxPath, `${JSON.stringify(captured)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    return {
      success: true,
      providerType: "test_outbox",
      providerId: "fieldgrid-test-outbox",
      providerMessageId,
      deliveryEffect: "accepted",
    };
  }

  let provider: ResolvedProvider | null;
  try {
    provider = await resolveActiveProvider(normalizedInput.tenantId);
  } catch (error) {
    const message = sanitizeError(error);
    await logDelivery(normalizedInput, null, "failed", message);
    return {
      success: false,
      error: message,
      providerType: "none",
      providerId: null,
      deliveryEffect: "not_attempted",
    };
  }

  if (!provider) {
    const error = "Geen actieve e-mailprovider geconfigureerd.";
    await logDelivery(normalizedInput, null, "skipped", error);
    return {
      success: false,
      error,
      providerType: "none",
      providerId: null,
      deliveryEffect: "not_attempted",
    };
  }

  try {
    assertProviderReady(provider);
  } catch (error) {
    const message = sanitizeError(error);
    await logDelivery(normalizedInput, provider, "failed", message);
    return {
      success: false,
      error: message,
      providerType: provider.providerType,
      providerId: provider.id,
      deliveryEffect: "not_attempted",
      providerConfigurationFingerprint:
        provider.configurationFingerprint,
    };
  }

  try {
    const providerMessageId =
      provider.providerType === "sendgrid_api"
        ? await sendWithSendGrid(provider, normalizedInput)
        : provider.providerType === "resend_api" || provider.providerType === "env_resend"
          ? await sendWithResend(provider, normalizedInput)
          : await sendWithSmtp(provider, normalizedInput);

    await logDelivery(normalizedInput, provider, "success", null, providerMessageId);
    return {
      success: true,
      providerType: provider.providerType,
      providerId: provider.id,
      providerMessageId,
      deliveryEffect: "accepted",
      providerConfigurationFingerprint:
        provider.configurationFingerprint,
    };
  } catch (error) {
    const message = sanitizeError(error);
    await logDelivery(normalizedInput, provider, "failed", message);
    return {
      success: false,
      error: message,
      providerType: provider.providerType,
      providerId: provider.id,
      deliveryEffect: "unknown",
      providerConfigurationFingerprint:
        provider.configurationFingerprint,
    };
  }
}

/**
 * Dedicated, synchronous OTP delivery path.
 *
 * It deliberately bypasses the general delivery log, retry/outbox path,
 * templates and idempotency metadata because those mechanisms may persist the
 * message body. The six-digit value exists only in this call stack and the
 * provider request. An uncertain provider outcome is returned as failure so
 * the caller can invalidate the challenge.
 */
export async function sendSensitiveOtpEmail(
  input: { to: string; code: string; tenantId: string },
  options: { testTransport?: SensitiveOtpTransport } = {},
): Promise<TransactionalEmailResult> {
  if (!/^\d{6}$/u.test(input.code)) {
    return {
      success: false,
      error: "Ongeldige beveiligingscode.",
      providerType: "none",
      providerId: null,
      deliveryEffect: "not_attempted",
    };
  }
  const subject = "Uw beveiligingscode voor Object 360";
  const text = [
    "U vroeg toegang aan tot afgeschermde objectinformatie.",
    "",
    `Uw eenmalige code is: ${input.code}`,
    "",
    "De code verloopt na 10 minuten. Deel deze code niet.",
    "Was u dit niet? Negeer dit bericht en meld het bij uw beheerder.",
  ].join("\n");
  const html = `<p>U vroeg toegang aan tot afgeschermde objectinformatie.</p><p>Uw eenmalige code is: <strong style="font-size:24px;letter-spacing:4px">${input.code}</strong></p><p>De code verloopt na 10 minuten. Deel deze code niet.</p><p>Was u dit niet? Negeer dit bericht en meld het bij uw beheerder.</p>`;

  if (options.testTransport) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Sensitive OTP test transport is disabled in production.");
    }
    try {
      await options.testTransport({ to: input.to, subject, html, text });
      return {
        success: true,
        providerType: "test_outbox",
        providerId: "sensitive-otp-memory-transport",
        deliveryEffect: "accepted",
      };
    } catch (error) {
      return {
        success: false,
        error: sanitizeError(error),
        providerType: "test_outbox",
        providerId: "sensitive-otp-memory-transport",
        deliveryEffect: "unknown",
      };
    }
  }

  let provider: ResolvedProvider | null;
  try {
    provider = await resolveActiveProvider(input.tenantId);
    if (!provider) throw new Error("Geen actieve e-mailprovider geconfigureerd.");
    assertProviderReady(provider);
  } catch (error) {
    return {
      success: false,
      error: sanitizeError(error),
      providerType: "none",
      providerId: null,
      deliveryEffect: "not_attempted",
    };
  }

  const message: TransactionalEmailInput = {
    to: input.to,
    subject,
    html,
    text,
    tenantId: input.tenantId,
    purpose: "sensitive-object-security-otp",
  };
  try {
    const providerMessageId = provider.providerType === "sendgrid_api"
      ? await sendWithSendGrid(provider, message)
      : provider.providerType === "resend_api" || provider.providerType === "env_resend"
        ? await sendWithResend(provider, message)
        : await sendWithSmtp(provider, message);
    return {
      success: true,
      providerType: provider.providerType,
      providerId: provider.id,
      providerMessageId,
      deliveryEffect: "accepted",
    };
  } catch (error) {
    return {
      success: false,
      error: sanitizeError(error),
      providerType: provider.providerType,
      providerId: provider.id,
      deliveryEffect: "unknown",
    };
  }
}

/**
 * Dedicated, synchronous OTP delivery path.
 *
 * It deliberately bypasses the general delivery log, retry/outbox path,
 * templates and idempotency metadata because those mechanisms may persist the
 * message body. The six-digit value exists only in this call stack and the
 * provider request. An uncertain provider outcome is returned as failure so
 * the caller can invalidate the challenge.
 */
export async function sendSensitiveOtpEmail(
  input: { to: string; code: string; tenantId: string },
  options: { testTransport?: SensitiveOtpTransport } = {},
): Promise<TransactionalEmailResult> {
  if (!/^\d{6}$/u.test(input.code)) {
    return {
      success: false,
      error: "Ongeldige beveiligingscode.",
      providerType: "none",
      providerId: null,
      deliveryEffect: "not_attempted",
    };
  }
  const subject = "Uw beveiligingscode voor Object 360";
  const text = [
    "U vroeg toegang aan tot afgeschermde objectinformatie.",
    "",
    `Uw eenmalige code is: ${input.code}`,
    "",
    "De code verloopt na 10 minuten. Deel deze code niet.",
    "Was u dit niet? Negeer dit bericht en meld het bij uw beheerder.",
  ].join("\n");
  const html = `<p>U vroeg toegang aan tot afgeschermde objectinformatie.</p><p>Uw eenmalige code is: <strong style="font-size:24px;letter-spacing:4px">${input.code}</strong></p><p>De code verloopt na 10 minuten. Deel deze code niet.</p><p>Was u dit niet? Negeer dit bericht en meld het bij uw beheerder.</p>`;

  if (options.testTransport) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Sensitive OTP test transport is disabled in production.");
    }
    try {
      await options.testTransport({ to: input.to, subject, html, text });
      return {
        success: true,
        providerType: "test_outbox",
        providerId: "sensitive-otp-memory-transport",
        deliveryEffect: "accepted",
      };
    } catch (error) {
      return {
        success: false,
        error: sanitizeError(error),
        providerType: "test_outbox",
        providerId: "sensitive-otp-memory-transport",
        deliveryEffect: "unknown",
      };
    }
  }

  let provider: ResolvedProvider | null;
  try {
    provider = await resolveActiveProvider(input.tenantId);
    if (!provider) throw new Error("Geen actieve e-mailprovider geconfigureerd.");
    assertProviderReady(provider);
  } catch (error) {
    return {
      success: false,
      error: sanitizeError(error),
      providerType: "none",
      providerId: null,
      deliveryEffect: "not_attempted",
    };
  }

  const message: TransactionalEmailInput = {
    to: input.to,
    subject,
    html,
    text,
    tenantId: input.tenantId,
    purpose: "sensitive-object-security-otp",
  };
  try {
    const providerMessageId = provider.providerType === "sendgrid_api"
      ? await sendWithSendGrid(provider, message)
      : provider.providerType === "resend_api" || provider.providerType === "env_resend"
        ? await sendWithResend(provider, message)
        : await sendWithSmtp(provider, message);
    return {
      success: true,
      providerType: provider.providerType,
      providerId: provider.id,
      providerMessageId,
      deliveryEffect: "accepted",
    };
  } catch (error) {
    return {
      success: false,
      error: sanitizeError(error),
      providerType: provider.providerType,
      providerId: provider.id,
      deliveryEffect: "unknown",
    };
  }
}

export async function sendEmail(input: TransactionalEmailInput): Promise<void> {
  const result = await sendTransactionalEmail(input);
  if (!result.success) {
    console.error("[email-service] Verzenden mislukt:", result.error);
  }
}

export async function sendTemplatedEmail(input: TemplatedEmailInput): Promise<TransactionalEmailResult> {
  try {
    const rendered = await renderEmailTemplate({
      templateKey: input.templateKey,
      variables: input.variables,
      tenantId: input.tenantId ?? null,
    });

    return sendTransactionalEmail({
      ...input,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateKey: input.templateKey,
      metadata: {
        ...input.metadata,
        renderedTemplateKey: input.templateKey,
      },
    });
  } catch (error) {
    const message = sanitizeError(error);
    await logDelivery(
      {
        ...input,
        subject: `Template ${input.templateKey}`,
        html: "",
        text: "",
        templateKey: input.templateKey,
      },
      null,
      "failed",
      message,
    );
    return {
      success: false,
      error: message,
      providerType: "none",
      providerId: null,
      deliveryEffect: "not_attempted",
    };
  }
}

function providerStatus(provider: PlatformEmailProvider, config: EmailProviderConfig): PlatformEmailProviderStatus {
  if (!provider.isActive && provider.status === "disabled") return "disabled";
  if (provider.providerType === "sendgrid_api") {
    return config.apiKey && config.sendingDomain && provider.fromEmail ? "configured" : "draft";
  }
  if (provider.providerType === "resend_api") return config.apiKey && provider.fromEmail ? "configured" : "draft";
  if (provider.providerType === "smtp") return config.host && config.port && provider.fromEmail ? "configured" : "draft";
  return "draft";
}

function toAdminView(provider: PlatformEmailProvider): PlatformEmailProviderAdminView {
  const { config, error: configError } = safeDecryptPlatformEmailConfig(provider.encryptedConfigJson);
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
    status: configError ? "error" : providerStatus(provider, config),
    configured:
      !configError &&
      (type === "sendgrid_api"
        ? Boolean(config.apiKey && config.sendingDomain)
        : type === "resend_api"
          ? Boolean(config.apiKey)
          : Boolean(config.host && config.port)),
    maskedSecret: type === "sendgrid_api" || type === "resend_api" ? maskEmailSecret(config.apiKey, 3) : maskEmailSecret(config.password, 0),
    lastTestedAt: provider.lastTestedAt?.toISOString() ?? null,
    lastTestStatus: provider.lastTestStatus as PlatformEmailTestStatus | null,
    lastTestError: configError ?? provider.lastTestError,
    config: {
      sendingDomain: config.sendingDomain ?? "",
      sendgridApiRegion: normalizeSendGridApiRegion(config.apiRegion),
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

  if (!existingTypes.has("sendgrid_api")) {
    views.push({
      id: null,
      providerType: "sendgrid_api",
      name: "SendGrid API",
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
        sendingDomain: DEFAULT_SENDING_DOMAIN,
        sendgridApiRegion: "global",
        smtpHost: "",
        smtpPort: null,
        smtpEncryption: "starttls",
        smtpUsername: "",
        smtpPasswordConfigured: false,
      },
    });
  }

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
        sendgridApiRegion: "global",
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
        sendgridApiRegion: "global",
        smtpHost: "",
        smtpPort: 587,
        smtpEncryption: "starttls",
        smtpUsername: "",
        smtpPasswordConfigured: false,
      },
    });
  }

  const providerOrder: Record<PlatformEmailProviderType, number> = {
    sendgrid_api: 0,
    resend_api: 1,
    smtp: 2,
  };
  return views.sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      providerOrder[a.providerType] - providerOrder[b.providerType],
  );
}

function validateProviderInput(input: SavePlatformEmailProviderInput, config: EmailProviderConfig): string | null {
  if (!isEmailLike(input.fromEmail)) return "Vul een geldig afzenderadres in.";
  if (input.replyToEmail && !isEmailLike(input.replyToEmail)) return "Vul een geldig reply-to adres in.";

  if (input.providerType === "resend_api") {
    if (input.isActive && !config.apiKey) return "Resend API key is verplicht wanneer Resend actief is.";
    return null;
  }

  if (input.providerType === "sendgrid_api") {
    if (input.isActive && !config.apiKey) {
      return "SendGrid API key is verplicht wanneer SendGrid actief is.";
    }
    if (config.apiKey && config.apiKey.length > 512) {
      return "SendGrid API key is te lang.";
    }
    if (!isHostname(config.sendingDomain)) {
      return "Vul een geldig SendGrid sending domain in, zonder https:// of pad.";
    }
    if (!emailBelongsToDomain(input.fromEmail, config.sendingDomain!)) {
      return "Het afzenderadres moet bij het SendGrid sending domain horen.";
    }
    return null;
  }

  if (input.isActive) {
    if (!config.host) return "SMTP-host is verplicht wanneer SMTP actief is.";
    if (!config.port || config.port < 1 || config.port > 65535) return "SMTP-poort moet tussen 1 en 65535 liggen.";
  }

  return null;
}

export async function savePlatformEmailProviderSettings(input: SavePlatformEmailProviderInput): Promise<{ success: boolean; message: string }> {
  const [existing] = await db.select().from(platformEmailProvidersTable).where(eq(platformEmailProvidersTable.providerType, input.providerType)).limit(1);

  const existingConfig = existing ? safeDecryptPlatformEmailConfig(existing.encryptedConfigJson).config : {};
  const config: EmailProviderConfig =
    input.providerType === "sendgrid_api"
      ? {
          apiKey: input.clearSendGridApiKey ? null : input.sendgridApiKey?.trim() || existingConfig.apiKey || null,
          apiRegion: normalizeSendGridApiRegion(input.sendgridApiRegion),
          sendingDomain: normalizeSendingDomain(input.sendingDomain) || DEFAULT_SENDING_DOMAIN,
        }
      : input.providerType === "resend_api"
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
  let encryptedConfigJson: string;
  try {
    encryptedConfigJson = encryptPlatformEmailConfig(config);
  } catch (error) {
    return { success: false, message: sanitizeError(error) };
  }
  const payload = {
    providerType: input.providerType,
    name: input.name?.trim() || (input.providerType === "sendgrid_api" ? "SendGrid API" : input.providerType === "resend_api" ? "Resend API" : "SMTP"),
    isActive: input.isActive,
    isDefault: input.isActive,
    encryptedConfigJson,
    fromEmail: normalizeEmail(input.fromEmail) || DEFAULT_FROM_EMAIL,
    fromName: input.fromName.trim() || DEFAULT_FROM_NAME,
    replyToEmail: input.replyToEmail?.trim() || null,
    status,
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestError: null,
    updatedAt: new Date(),
    updatedBy: input.updatedBy ?? null,
  };

  await db.transaction(async (tx) => {
    if (input.isActive) {
      await tx.update(platformEmailProvidersTable).set({ isActive: false, isDefault: false });
    }

    if (existing) {
      await tx.update(platformEmailProvidersTable).set(payload).where(eq(platformEmailProvidersTable.id, existing.id));
    } else {
      await tx.insert(platformEmailProvidersTable).values({
        ...payload,
        createdAt: new Date(),
      });
    }
  });

  return { success: true, message: "Platform e-mailprovider opgeslagen." };
}

export async function sendPlatformEmailTest(input: { to: string; triggeredBy?: string | null }): Promise<TransactionalEmailResult> {
  const to = input.to.trim().toLowerCase();
  if (!isEmailLike(to)) {
    return {
      success: false,
      error: "Vul een geldig test e-mailadres in.",
      providerType: "none",
      deliveryEffect: "not_attempted",
    };
  }

  const result = await sendTemplatedEmail({
    to,
    templateKey: "platform_email_test",
    variables: { triggeredAt: new Date().toLocaleString("nl-NL") },
    triggeredBy: input.triggeredBy ?? null,
    triggeredByType: input.triggeredBy ? "platform_admin" : "system",
  });

  if (result.providerId && result.providerConfigurationFingerprint) {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(platformEmailProvidersTable)
        .where(eq(platformEmailProvidersTable.id, result.providerId!))
        .limit(1)
        .for("update");
      if (
        !current ||
        platformProviderConfigurationFingerprint(current) !==
          result.providerConfigurationFingerprint
      ) {
        return;
      }

      await tx
        .update(platformEmailProvidersTable)
        .set({
          lastTestedAt: new Date(),
          lastTestStatus: result.success ? "success" : "failed",
          lastTestError: result.success
            ? null
            : (result.error ?? "Testmail mislukt."),
          status: result.success ? "configured" : "error",
          updatedAt: new Date(),
        })
        .where(eq(platformEmailProvidersTable.id, result.providerId!));
    });
  }

  return result;
}

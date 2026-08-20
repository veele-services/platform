import {
  renderEmailTemplatePreview,
  type EmailTemplateKey,
  type EmailTemplateVariables,
  type RenderedEmail,
} from "@workspace/db/email-templates";
import { sendTransactionalEmail } from "@workspace/db/email-service";
import { logger } from "./logger";

function siteUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}`;
  return process.env["SITE_URL"] ?? "https://fieldgrid.nl";
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  tenantId?: string | null;
  purpose?: string | null;
  idempotencyKey?: string;
}): Promise<void> {
  const result = await sendTransactionalEmail({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    tenantId: opts.tenantId ?? null,
    templateKey: opts.purpose ?? "api_server",
    triggeredByType: "system",
    idempotencyKey: opts.idempotencyKey,
  });
  if (!result.success) {
    logger.error({ error: result.error, subject: opts.subject }, "E-mail verzenden mislukt");
  }
}

export async function sendEmailWithResult(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  tenantId?: string | null;
  purpose?: string | null;
  idempotencyKey?: string;
}): Promise<{ success: boolean; error?: string; providerMessageId?: string | null; providerType?: string }> {
  const result = await sendTransactionalEmail({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    tenantId: opts.tenantId ?? null,
    templateKey: opts.purpose ?? "api_server",
    triggeredByType: "system",
    idempotencyKey: opts.idempotencyKey,
  });
  if (!result.success) {
    const msg = result.error ?? "E-mailprovider niet geconfigureerd";
    logger.warn({ subject: opts.subject }, msg);
    return { success: false, error: msg };
  }
  return {
    success: true,
    providerMessageId: result.providerMessageId ?? null,
    providerType: result.providerType,
  };
}

function renderPreview(templateKey: EmailTemplateKey, variables: EmailTemplateVariables): RenderedEmail {
  return renderEmailTemplatePreview({ templateKey, variables });
}

function formatAmount(value: string): string {
  const parsed = Number.parseFloat(value);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  return amount.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}

export function buildQuoteExpiredEmail(opts: {
  customerName: string;
  quoteNumber: string;
  amount: string;
}): RenderedEmail {
  return renderPreview("quote_expired", {
    customerName: opts.customerName,
    quoteNumber: opts.quoteNumber,
    amount: formatAmount(opts.amount),
    quotesUrl: `${siteUrl()}/klant/offertes`,
  });
}

export function buildPaymentReminderEmail(opts: {
  customerName: string;
  invoiceNumber: string;
  totalAmount: string;
  dueDate: string;
  invoiceId: string;
}): RenderedEmail {
  return renderPreview("invoice_payment_reminder", {
    customerName: opts.customerName,
    invoiceNumber: opts.invoiceNumber,
    totalAmount: formatAmount(opts.totalAmount),
    dueDate: opts.dueDate,
    invoiceId: opts.invoiceId,
    invoiceUrl: `${siteUrl()}/klant/facturen`,
  });
}

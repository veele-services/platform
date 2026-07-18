import {
  renderEmailTemplate,
  renderEmailTemplatePreview,
  type EmailTemplateKey,
  type EmailTemplateVariables,
  type RenderedEmail,
} from "@workspace/db/email-templates";
import { sendTransactionalEmail } from "@workspace/db/email-service";

function siteUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}`;
  return process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://fieldgrid.nl";
}

export function backofficeUrl(): string {
  const explicit =
    process.env["BACKOFFICE_URL"] ??
    process.env["NEXT_PUBLIC_BACKOFFICE_URL"] ??
    process.env["NEXT_PUBLIC_SITE_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}`;
  return "https://admin.fieldgrid.nl";
}

export function platformAdminUrl(): string {
  const explicit =
    process.env["PLATFORM_ADMIN_URL"] ??
    process.env["NEXT_PUBLIC_PLATFORM_ADMIN_URL"] ??
    process.env["BACKOFFICE_URL"] ??
    process.env["NEXT_PUBLIC_BACKOFFICE_URL"];
  return (explicit ?? "https://admin.fieldgrid.nl").replace(/\/$/, "");
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  tenantId?: string | null;
  purpose?: string | null;
}): Promise<void> {
  const result = await sendEmailWithResult(opts);
  if (!result.success) console.error("[email] Verzenden mislukt:", result.error);
}

export async function sendEmailWithResult(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  tenantId?: string | null;
  purpose?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const result = await sendTransactionalEmail({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments,
    tenantId: opts.tenantId ?? null,
    templateKey: opts.purpose ?? null,
    purpose: opts.purpose ?? null,
  });

  return result.success ? { success: true } : { success: false, error: result.error };
}

export function klantPortalUrl(): string {
  const explicit = process.env["KLANT_PORTAL_URL"] ?? process.env["NEXT_PUBLIC_KLANT_PORTAL_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}/klant`;
  const rootUrl = process.env["NEXT_PUBLIC_SITE_URL"];
  if (rootUrl) return `${rootUrl.replace(/\/$/, "")}/klant`;
  return "https://fieldgrid.nl/klant";
}

export function personeelPortalUrl(): string {
  const explicit = process.env["PERSONEEL_PORTAL_URL"] ?? process.env["NEXT_PUBLIC_PERSONEEL_PORTAL_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}/personeel`;
  const rootUrl = process.env["NEXT_PUBLIC_SITE_URL"];
  if (rootUrl) return `${rootUrl.replace(/\/$/, "")}/personeel`;
  return "https://fieldgrid.nl/personeel";
}

function renderPreview(templateKey: EmailTemplateKey, variables: EmailTemplateVariables): RenderedEmail {
  return renderEmailTemplatePreview({ templateKey, variables });
}

function formatAmount(value: string): string {
  const parsed = Number.parseFloat(value);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  return amount.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}

function formatPeriod(startDate: string, endDate: string | null): string {
  return endDate && endDate !== startDate ? `${startDate} t/m ${endDate}` : startDate;
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/p>/giu, "\n\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export type StyledNotificationEmailInput = {
  subject: string;
  tenantId?: string | null;
  preheader?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  ctaHref?: string | null;
  ctaLabel?: string | null;
};

export async function buildStyledNotificationEmail(
  opts: StyledNotificationEmailInput,
): Promise<{ subject: string; html: string; text: string }> {
  const bodyText = opts.bodyText?.trim() || (opts.bodyHtml ? stripHtml(opts.bodyHtml) : "");
  return renderEmailTemplate({
    tenantId: opts.tenantId ?? null,
    templateKey: "notification_manual",
    variables: {
      notificationTitle: opts.subject,
      notificationPreheader: opts.preheader ?? bodyText.slice(0, 180),
      notificationBody: bodyText,
      ctaUrl: opts.ctaHref ?? "",
      ctaLabel: opts.ctaLabel ?? "",
    },
  });
}

export function buildAccountActivationEmail(opts: {
  recipientName: string;
  portalName: string;
  activationUrl: string;
  code: string;
}): RenderedEmail {
  return renderPreview("account_invite", opts);
}

export function buildPasswordResetCodeEmail(opts: {
  recipientName: string;
  portalName: string;
  resetUrl: string;
  code: string;
}): RenderedEmail {
  return renderPreview("password_reset", opts);
}

export function buildReportSubmittedEmail(opts: {
  assignmentTitle: string;
  assignmentId: string;
  reportId: string;
}): RenderedEmail {
  return renderPreview("report_submitted", {
    assignmentTitle: opts.assignmentTitle,
    assignmentId: opts.assignmentId,
    reportId: opts.reportId,
    reporterName: "Een gebruiker",
    reportUrl: `${siteUrl()}/reports/${opts.reportId}`,
  });
}

export function buildLeaveRequestedEmail(opts: {
  personnelName: string;
  startDate: string;
  endDate: string | null;
  leaveType: string;
  reason: string | null;
}): RenderedEmail {
  return renderPreview("leave_request_submitted", {
    personnelName: opts.personnelName,
    startDate: opts.startDate,
    endDate: opts.endDate ?? "",
    leaveType: opts.leaveType,
    reason: opts.reason ?? "",
    period: formatPeriod(opts.startDate, opts.endDate),
    leaveUrl: `${siteUrl()}/personnel/verlof`,
  });
}

export function buildLeaveDecisionEmail(opts: {
  firstName: string;
  decision: "goedgekeurd" | "afgewezen";
  startDate: string;
  endDate: string | null;
  leaveType: string;
}): RenderedEmail {
  return renderPreview("leave_request_decision", {
    firstName: opts.firstName,
    decision: opts.decision,
    decisionMessage:
      opts.decision === "afgewezen"
        ? "Neem contact op met uw leidinggevende voor meer informatie."
        : "Uw verlof is verwerkt in de planning.",
    startDate: opts.startDate,
    endDate: opts.endDate ?? "",
    leaveType: opts.leaveType,
    period: formatPeriod(opts.startDate, opts.endDate),
    leaveUrl: `${siteUrl()}/personeel/verlof`,
  });
}

export function buildReportApprovedEmail(opts: {
  firstName: string;
  assignmentTitle: string;
  reportId: string;
}): RenderedEmail {
  return renderPreview("report_approved", {
    firstName: opts.firstName,
    assignmentTitle: opts.assignmentTitle,
    reportId: opts.reportId,
    reportsUrl: `${siteUrl()}/personeel/rapporten`,
  });
}

export function buildReportRejectedEmail(opts: {
  firstName: string;
  assignmentTitle: string;
  reportId: string;
  reason: string;
}): RenderedEmail {
  return renderPreview("report_rejected", {
    firstName: opts.firstName,
    assignmentTitle: opts.assignmentTitle,
    reportId: opts.reportId,
    reason: opts.reason,
    reportsUrl: `${siteUrl()}/personeel/rapporten`,
  });
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
    quotesUrl: `${klantPortalUrl()}/offertes`,
  });
}

export function buildInvoiceEmail(opts: {
  customerName: string;
  invoiceNumber: string;
  totalAmount: string;
  dueDate: string;
  paymentUrl: string | null;
  portalUrl: string;
}): RenderedEmail {
  const portalUrl = opts.portalUrl.replace(/\/$/, "");
  return renderPreview("invoice_available", {
    customerName: opts.customerName,
    invoiceNumber: opts.invoiceNumber,
    totalAmount: formatAmount(opts.totalAmount),
    dueDate: opts.dueDate,
    paymentUrl: opts.paymentUrl ?? "",
    invoiceUrl: `${portalUrl}/facturen`,
  });
}

export function buildPaymentReminderEmail(opts: {
  customerName: string;
  invoiceNumber: string;
  totalAmount: string;
  dueDate: string;
}): RenderedEmail {
  return renderPreview("invoice_payment_reminder", {
    customerName: opts.customerName,
    invoiceNumber: opts.invoiceNumber,
    totalAmount: formatAmount(opts.totalAmount),
    dueDate: opts.dueDate,
    invoiceUrl: `${klantPortalUrl()}/facturen`,
  });
}

export function buildQuoteDecisionEmail(opts: {
  customerName: string;
  quoteNumber: string;
  decision: "geaccepteerd" | "afgewezen";
  reason: string | null;
}): RenderedEmail {
  return renderPreview("quote_decision_received", {
    customerName: opts.customerName,
    quoteNumber: opts.quoteNumber,
    decision: opts.decision,
    reason: opts.reason ?? "",
    quotesUrl: `${siteUrl()}/quotes`,
  });
}

export function buildQuoteSentEmail(opts: {
  customerName: string;
  quoteNumber: string;
  amount: string;
  validityDate: string;
  quoteId: string;
}): RenderedEmail {
  return renderPreview("quote_available", {
    customerName: opts.customerName,
    quoteNumber: opts.quoteNumber,
    amount: formatAmount(opts.amount),
    validityDate: opts.validityDate,
    quoteId: opts.quoteId,
    quoteUrl: `${klantPortalUrl()}/offertes`,
  });
}

export function buildNotificationTestEmail(opts: {
  notificationType: string;
  notificationTypeLabel: string;
}): RenderedEmail {
  return renderPreview("notification_test", {
    notificationType: opts.notificationType,
    notificationTypeLabel: opts.notificationTypeLabel,
  });
}

export function buildTenantMailSettingsTestEmail(): RenderedEmail {
  return renderPreview("tenant_mail_settings_test", {});
}

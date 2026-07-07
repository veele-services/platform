import {
  renderEmailTemplatePreview,
  type EmailTemplateKey,
  type EmailTemplateVariables,
  type RenderedEmail,
} from "@workspace/db/email-templates";
import { sendTransactionalEmail } from "@workspace/db/email-service";

function backofficeUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}`;
  return process.env["NEXT_PUBLIC_BACKOFFICE_URL"] ?? process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://admin.fieldgrid.nl";
}

export function klantPortalUrl(): string {
  const explicit = process.env["KLANT_PORTAL_URL"] ?? process.env["NEXT_PUBLIC_KLANT_PORTAL_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const site = (process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://fieldgrid.nl").replace(/\/$/, "");
  return site.endsWith("/klant") ? site : `${site}/klant`;
}

export async function sendEmailWithResult(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  tenantId?: string | null;
  purpose?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const result = await sendTransactionalEmail({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    tenantId: opts.tenantId ?? null,
    templateKey: opts.purpose ?? "customer_portal",
    purpose: opts.purpose ?? null,
    triggeredByType: "customer_user",
  });

  return result.success ? { success: true } : { success: false, error: result.error };
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

function renderPreview(templateKey: EmailTemplateKey, variables: EmailTemplateVariables): RenderedEmail {
  return renderEmailTemplatePreview({ templateKey, variables });
}

export function buildPasswordResetCodeEmail(opts: {
  recipientName: string;
  portalName: string;
  resetUrl: string;
  code: string;
}): RenderedEmail {
  return renderPreview("password_reset", opts);
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
    quotesUrl: `${backofficeUrl().replace(/\/$/, "")}/quotes`,
  });
}

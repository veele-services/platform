import {
  renderEmailTemplatePreview,
  type EmailTemplateKey,
  type EmailTemplateVariables,
  type RenderedEmail,
} from "@workspace/db/email-templates";
import { sendTransactionalEmail } from "@workspace/db/email-service";

function backofficeBaseUrl(value: string): string {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/u, "") || "/";
  if (pathname === "/") url.pathname = "/admin";
  else if (pathname !== "/admin") throw new Error("Backoffice URL must use /admin as its only path.");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function backofficeUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return backofficeBaseUrl(`https://${domains.split(",")[0]!.trim()}`);
  return backofficeBaseUrl(
    process.env["NEXT_PUBLIC_BACKOFFICE_URL"] ??
      process.env["NEXT_PUBLIC_SITE_URL"] ??
      "https://admin.fieldgrid.nl",
  );
}

export function personeelPortalUrl(): string {
  const explicit = process.env["PERSONEEL_PORTAL_URL"] ?? process.env["NEXT_PUBLIC_PERSONEEL_PORTAL_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const site = (process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://fieldgrid.nl").replace(/\/$/, "");
  return site.endsWith("/personeel") ? site : `${site}/personeel`;
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

  if (!result.success) {
    console.error("[email] Verzenden mislukt:", result.error);
  }
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
    templateKey: opts.purpose ?? "personnel_portal",
    purpose: opts.purpose ?? null,
    triggeredByType: "personnel_user",
  });

  return result.success ? { success: true } : { success: false, error: result.error };
}

function renderPreview(templateKey: EmailTemplateKey, variables: EmailTemplateVariables): RenderedEmail {
  return renderEmailTemplatePreview({ templateKey, variables });
}

function formatPeriod(startDate: string, endDate: string | null): string {
  return endDate && endDate !== startDate ? `${startDate} t/m ${endDate}` : startDate;
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
  personnelName: string;
  assignmentTitle: string;
  assignmentId: string;
}): RenderedEmail {
  return renderPreview("report_submitted", {
    reporterName: opts.personnelName,
    assignmentTitle: opts.assignmentTitle,
    assignmentId: opts.assignmentId,
    reportUrl: `${backofficeUrl()}/reports`,
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
    leaveUrl: `${backofficeUrl()}/personnel/verlof`,
  });
}

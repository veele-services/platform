import {
  FIELDGRID_BRAND_DEFAULTS,
  getEffectiveBrandTheme,
} from "@workspace/db";
import { sendTransactionalEmail } from "@workspace/db/email-service";

// ── Singleton ─────────────────────────────────────────────────────────────────

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

// ── Core send helpers ─────────────────────────────────────────────────────────
// Fire-and-forget variant: awaited by callers but never throws.

export async function sendEmail(opts: {
  to:      string | string[];
  subject: string;
  html:    string;
  text?:   string;
  tenantId?: string;
  purpose?:  string;
}): Promise<void> {
  const result = await sendEmailWithResult(opts);
  if (!result.success) console.error("[email] Verzenden mislukt:", result.error);
}

// Returning variant with attachment support — used by emailInvoice action.
export async function sendEmailWithResult(opts: {
  to:          string | string[];
  subject:     string;
  html:        string;
  text?:       string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  tenantId?:    string;
  purpose?:     string;
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
  const siteUrl = process.env["NEXT_PUBLIC_SITE_URL"];
  if (siteUrl) return `${siteUrl}/klant`;
  return "https://fieldgrid.nl/klant";
}

export function personeelPortalUrl(): string {
  const explicit = process.env["PERSONEEL_PORTAL_URL"] ?? process.env["NEXT_PUBLIC_PERSONEEL_PORTAL_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}/personeel`;
  const siteUrl = process.env["NEXT_PUBLIC_SITE_URL"];
  if (siteUrl) return `${siteUrl}/personeel`;
  return "https://fieldgrid.nl/personeel";
}

// ── Shared base template ───────────────────────────────────────────────────────

const BRAND_COLOR = FIELDGRID_BRAND_DEFAULTS.primaryColor;
const ACCENT_COLOR = FIELDGRID_BRAND_DEFAULTS.accentColor;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function baseTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;color:#1a1a1a;background:#f5f5f5;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
    <div style="background:${BRAND_COLOR};padding:20px 24px">
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">Fieldgrid</span>
    </div>
    <div style="padding:28px 24px">
      ${bodyHtml}
    </div>
    <div style="padding:16px 24px;background:#f8fafc;font-size:12px;color:#94a3b8">
      Dit is een automatisch bericht van Fieldgrid. Antwoorden op deze e-mail worden niet verwerkt.
    </div>
  </div>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<p><a href="${href}" style="display:inline-block;padding:11px 22px;background:${BRAND_COLOR};color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">${label}</a></p>`;
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
  const theme = await getEffectiveBrandTheme(opts.tenantId ?? null);
  const brandColor = theme.primaryColor || BRAND_COLOR;
  const accentColor = theme.accentColor || ACCENT_COLOR;
  const companyName = theme.brandName.trim() || "Fieldgrid";
  const preheader = opts.preheader?.trim() || opts.subject;
  const body = opts.bodyHtml?.trim()
    ? opts.bodyHtml
    : `<p>${nl2br(opts.bodyText ?? "")}</p>`;
  const signature = nl2br(theme.emailSignature || FIELDGRID_BRAND_DEFAULTS.signature);
  const footer = nl2br(theme.emailFooterText || FIELDGRID_BRAND_DEFAULTS.footerText);
  const cta = opts.ctaHref && opts.ctaLabel
    ? `<p style="margin:26px 0 4px"><a href="${escapeHtml(opts.ctaHref)}" style="display:inline-block;padding:13px 24px;background:${accentColor};color:#fff;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px">${escapeHtml(opts.ctaLabel)}</a></p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#EEF3F8;font-family:Arial,Helvetica,sans-serif;color:#0F172A">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EEF3F8;padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #DDE7F0;box-shadow:0 18px 45px rgba(8,29,58,.10)">
          <tr>
            <td style="background:${brandColor};padding:30px 34px">
              ${theme.logoUrl
                ? `<img src="${escapeHtml(theme.logoUrl)}" alt="${escapeHtml(companyName)}" style="display:block;max-height:54px;max-width:220px">`
                : `<div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:.16em;text-transform:uppercase">${escapeHtml(companyName)}</div>`}
              <div style="margin-top:18px;height:3px;width:72px;background:${accentColor};border-radius:99px"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:34px">
              <h1 style="margin:0 0 18px;color:${brandColor};font-size:24px;line-height:1.25;font-weight:800">${escapeHtml(opts.subject)}</h1>
              <div style="font-size:15px;line-height:1.75;color:#334155">
                ${body}
                ${cta}
                <div style="margin-top:28px;padding-top:18px;border-top:1px solid #E2E8F0;color:#475569;font-size:14px;line-height:1.7">${signature}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;padding:18px 34px;color:#64748B;font-size:12px;line-height:1.6">
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: opts.subject,
    html,
    text: `${preheader}\n\n${opts.bodyText ?? opts.bodyHtml?.replace(/<[^>]+>/g, " ") ?? ""}`,
  };
}

export function buildTemporaryPasswordEmail(opts: {
  recipientName:     string;
  portalName:        string;
  loginUrl:          string;
  temporaryPassword: string;
}): { subject: string; html: string } {
  const subject = `Toegang tot ${opts.portalName}`;
  const html = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Uw portaaltoegang</h2>
    <p>Beste ${opts.recipientName},</p>
    <p>Er is een account voor u aangemaakt in Fieldgrid.</p>
    <p>Log in met onderstaand tijdelijk wachtwoord. Na de eerste login moet u direct een eigen wachtwoord kiezen.</p>
    <div style="margin:18px 0;padding:14px 16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px">
      <p style="margin:0 0 6px;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Tijdelijk wachtwoord</p>
      <code style="font-size:18px;font-weight:700;color:${BRAND_COLOR};letter-spacing:.04em">${opts.temporaryPassword}</code>
    </div>
    ${ctaButton(opts.loginUrl, `Inloggen op ${opts.portalName}`)}
    <p style="font-size:13px;color:#64748b;margin-top:16px">
      Bewaar dit tijdelijke wachtwoord niet. Het is alleen bedoeld voor de eerste login.
    </p>
  `);
  return { subject, html };
}

export function buildPasswordResetCodeEmail(opts: {
  recipientName: string;
  portalName:    string;
  resetUrl:      string;
  code:          string;
}): { subject: string; html: string } {
  const subject = `Wachtwoord opnieuw instellen voor ${opts.portalName}`;
  const html = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Wachtwoord opnieuw instellen</h2>
    <p>Beste ${opts.recipientName},</p>
    <p>Er is een wachtwoord-reset aangevraagd voor uw account in ${opts.portalName}.</p>
    <p>Open de resetpagina en vul onderstaande code in. Daarna kiest u direct een nieuw wachtwoord.</p>
    <div style="margin:18px 0;padding:14px 16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px">
      <p style="margin:0 0 6px;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Herstelcode</p>
      <code style="font-size:22px;font-weight:800;color:${BRAND_COLOR};letter-spacing:.18em">${opts.code}</code>
    </div>
    ${ctaButton(opts.resetUrl, "Resetpagina openen")}
    <p style="font-size:13px;color:#64748b;margin-top:16px">
      Deze code is 30 minuten geldig. Heeft u dit niet aangevraagd, dan kunt u deze e-mail negeren.
    </p>
  `);
  return { subject, html };
}

// ── Templates ─────────────────────────────────────────────────────────────────

// 1. Rapport ingediend → beheerder (org emailAfzender)
export function buildReportSubmittedEmail(opts: {
  assignmentTitle: string;
  assignmentId:    string;
  reportId:        string;
}): { subject: string; html: string } {
  const url     = `${siteUrl()}/reports/${opts.reportId}`;
  const subject = `Nieuw rapport ingediend: ${opts.assignmentTitle}`;
  const html    = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Rapport ingediend</h2>
    <p>Er is een nieuw rapport ingediend voor opdracht <strong>${opts.assignmentTitle}</strong>.</p>
    <p>Het rapport staat klaar voor beoordeling in de backoffice.</p>
    ${ctaButton(url, "Rapport bekijken")}
  `);
  return { subject, html };
}

// 2. Verlofaanvraag ingediend → beheerder (org emailAfzender)
export function buildLeaveRequestedEmail(opts: {
  personnelName: string;
  startDate:     string;
  endDate:       string | null;
  leaveType:     string;
  reason:        string | null;
}): { subject: string; html: string } {
  const period  = opts.endDate && opts.endDate !== opts.startDate
    ? `${opts.startDate} t/m ${opts.endDate}`
    : opts.startDate;
  const url     = `${siteUrl()}/personnel/verlof`;
  const subject = `Nieuwe verlofaanvraag van ${opts.personnelName}`;
  const html    = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Verlofaanvraag</h2>
    <p><strong>${opts.personnelName}</strong> heeft een verlofaanvraag ingediend.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Type</td>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${opts.leaveType}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Periode</td>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${period}</td></tr>
      ${opts.reason ? `<tr><td style="padding:8px 0;color:#64748b">Reden</td>
          <td style="padding:8px 0">${opts.reason}</td></tr>` : ""}
    </table>
    ${ctaButton(url, "Verlofaanvragen bekijken")}
  `);
  return { subject, html };
}

// 3. Verlofaanvraag goedgekeurd of afgewezen → medewerker
export function buildLeaveDecisionEmail(opts: {
  firstName:  string;
  decision:   "goedgekeurd" | "afgewezen";
  startDate:  string;
  endDate:    string | null;
  leaveType:  string;
}): { subject: string; html: string } {
  const period  = opts.endDate && opts.endDate !== opts.startDate
    ? `${opts.startDate} t/m ${opts.endDate}`
    : opts.startDate;
  const color   = opts.decision === "goedgekeurd" ? "#16a34a" : "#dc2626";
  const url     = `${siteUrl()}/personeel/verlof`;
  const subject = `Verlofaanvraag ${opts.decision}`;
  const html    = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Verlofaanvraag ${opts.decision}</h2>
    <p>Beste ${opts.firstName},</p>
    <p>
      Uw verlofaanvraag (<strong>${opts.leaveType}</strong>) voor de periode
      <strong>${period}</strong> is
      <span style="color:${color};font-weight:600">${opts.decision}</span>.
    </p>
    ${opts.decision === "afgewezen"
      ? "<p>Neem contact op met uw leidinggevende voor meer informatie.</p>"
      : "<p>Uw verlof is verwerkt in de planning.</p>"
    }
    ${ctaButton(url, "Mijn verlofaanvragen bekijken")}
  `);
  return { subject, html };
}

// 5a. Rapport goedgekeurd → medewerker (submitter)
export function buildReportApprovedEmail(opts: {
  firstName:       string;
  assignmentTitle: string;
  reportId:        string;
}): { subject: string; html: string } {
  const url     = `${siteUrl()}/personeel/rapporten`;
  const subject = `Uw rapport voor "${opts.assignmentTitle}" is goedgekeurd`;
  const html    = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Rapport goedgekeurd</h2>
    <p>Beste ${opts.firstName},</p>
    <p>
      Goed nieuws! Uw ingediende rapport voor opdracht
      <strong>${opts.assignmentTitle}</strong> is
      <span style="color:#16a34a;font-weight:600">goedgekeurd</span>.
    </p>
    ${ctaButton(url, "Mijn rapporten bekijken")}
  `);
  return { subject, html };
}

// 5b. Rapport afgekeurd → medewerker (submitter)
export function buildReportRejectedEmail(opts: {
  firstName:       string;
  assignmentTitle: string;
  reportId:        string;
  reason:          string;
}): { subject: string; html: string } {
  const url     = `${siteUrl()}/personeel/rapporten`;
  const subject = `Uw rapport voor "${opts.assignmentTitle}" is afgekeurd`;
  const html    = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Rapport afgekeurd</h2>
    <p>Beste ${opts.firstName},</p>
    <p>
      Uw ingediende rapport voor opdracht
      <strong>${opts.assignmentTitle}</strong> is helaas
      <span style="color:#dc2626;font-weight:600">afgekeurd</span>.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:8px 0;color:#64748b;vertical-align:top">Reden</td>
        <td style="padding:8px 0">${opts.reason}</td>
      </tr>
    </table>
    <p style="font-size:13px;color:#64748b">
      Neem contact op met uw leidinggevende of dien een gecorrigeerd rapport in.
    </p>
    ${ctaButton(url, "Mijn rapporten bekijken")}
  `);
  return { subject, html };
}

// 5c. Offerte verlopen → klant
export function buildQuoteExpiredEmail(opts: {
  customerName: string;
  quoteNumber:  string;
  amount:       string;
}): { subject: string; html: string } {
  const portalUrl = klantPortalUrl();
  const amount    = parseFloat(opts.amount).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
  const subject   = `Uw offerte ${opts.quoteNumber} is verlopen`;
  const html      = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Offerte verlopen</h2>
    <p>Beste ${opts.customerName},</p>
    <p>
      Offerte <strong>${opts.quoteNumber}</strong> (bedrag: ${amount}) is verlopen.
      Neem contact met ons op als u nog gebruik wilt maken van onze diensten.
    </p>
    ${ctaButton(`${portalUrl}/offertes`, "Offertes bekijken")}
  `);
  return { subject, html };
}

// 5. Factuur per e-mail naar klant
export function buildInvoiceEmail(opts: {
  customerName:  string;
  invoiceNumber: string;
  totalAmount:   string;
  dueDate:       string;
  paymentUrl:    string | null;
  portalUrl:     string;
}): { subject: string; html: string } {
  const TEAL = "#00B7B3";
  const amount = parseFloat(opts.totalAmount).toLocaleString("nl-NL", {
    style:    "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
  const subject = `Factuur ${opts.invoiceNumber}`;
  const html = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Uw factuur</h2>
    <p>Beste ${opts.customerName},</p>
    <p>
      Bijgaand ontvangt u factuur <strong>${opts.invoiceNumber}</strong>.
      De factuur is als PDF bijgevoegd aan dit bericht.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Factuurnummer</td>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${opts.invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Totaalbedrag</td>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${amount}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b">Vervaldatum</td>
        <td style="padding:8px 0;font-weight:600">${opts.dueDate}</td>
      </tr>
    </table>
    ${opts.paymentUrl
      ? `<p><a href="${opts.paymentUrl}" style="display:inline-block;padding:11px 22px;background:${TEAL};color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Factuur online betalen</a></p>`
      : ""}
    <p style="margin-top:12px">
      <a href="${opts.portalUrl}/facturen" style="color:${BRAND_COLOR};font-size:13px;text-decoration:underline">
        Factuur bekijken in uw klantportaal →
      </a>
    </p>
    <p style="font-size:13px;color:#64748b;margin-top:16px">
      Neem bij vragen contact op met ons.
    </p>
  `);
  return { subject, html };
}

// 6. Betalingsherinnering → klant
export function buildPaymentReminderEmail(opts: {
  customerName:  string;
  invoiceNumber: string;
  totalAmount:   string;
  dueDate:       string;
}): { subject: string; html: string } {
  const portalUrl = klantPortalUrl();
  const amount    = parseFloat(opts.totalAmount).toLocaleString("nl-NL", {
    style:    "currency",
    currency: "EUR",
  });
  const subject = `Betalingsherinnering factuur ${opts.invoiceNumber}`;
  const html    = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Betalingsherinnering</h2>
    <p>Beste ${opts.customerName},</p>
    <p>
      Wij constateren dat onderstaande factuur nog niet is voldaan.
      Wij verzoeken u vriendelijk het openstaande bedrag zo spoedig mogelijk te betalen.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Factuurnummer</td>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${opts.invoiceNumber}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Bedrag</td>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${amount}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b">Vervaldatum</td>
          <td style="padding:8px 0;font-weight:600;color:#dc2626">${opts.dueDate}</td></tr>
    </table>
    ${ctaButton(`${portalUrl}/facturen`, "Factuur bekijken &amp; betalen")}
    <p style="font-size:13px;color:#64748b">
      Heeft u al betaald? Dan kunt u dit bericht als niet verzonden beschouwen.
      Neem bij vragen contact op met ons.
    </p>
  `);
  return { subject, html };
}

// 4. Offerte verstuurd → klant
export function buildQuoteDecisionEmail(opts: {
  customerName: string;
  quoteNumber:  string;
  decision:     "geaccepteerd" | "afgewezen";
  reason:       string | null;
}): { subject: string; html: string } {
  const color   = opts.decision === "geaccepteerd" ? "#16a34a" : "#dc2626";
  const url     = `${siteUrl()}/quotes`;
  const subject = `Offerte ${opts.quoteNumber} is ${opts.decision} door ${opts.customerName}`;
  const html    = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Offerte ${opts.decision}</h2>
    <p>
      Klant <strong>${opts.customerName}</strong> heeft offerte
      <strong>${opts.quoteNumber}</strong>
      <span style="color:${color};font-weight:600">${opts.decision}</span>.
    </p>
    ${opts.reason ? `
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:8px 0;color:#64748b;vertical-align:top">Reden</td>
        <td style="padding:8px 0">${opts.reason}</td>
      </tr>
    </table>` : ""}
    ${ctaButton(url, "Offertes bekijken in backoffice")}
  `);
  return { subject, html };
}

export function buildQuoteSentEmail(opts: {
  customerName: string;
  quoteNumber:  string;
  amount:       string;
  validityDate: string;
  quoteId:      string;
}): { subject: string; html: string } {
  const url    = `${siteUrl()}/klant/offertes`;
  const amount = parseFloat(opts.amount).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
  const subject = `Uw offerte ${opts.quoteNumber}`;
  const html    = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Offerte ${opts.quoteNumber}</h2>
    <p>Beste ${opts.customerName},</p>
    <p>Wij sturen u hierbij onze offerte toe.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Offertenummer</td>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${opts.quoteNumber}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Bedrag</td>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${amount}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b">Geldig tot</td>
          <td style="padding:8px 0;font-weight:600">${opts.validityDate}</td></tr>
    </table>
    ${ctaButton(url, "Offerte bekijken &amp; accorderen")}
    <p style="font-size:13px;color:#64748b">
      U kunt de offerte bekijken en direct accorderen via de bovenstaande knop.
    </p>
  `);
  return { subject, html };
}

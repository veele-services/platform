import { Resend } from "resend";
import { db, organizationSettingsTable } from "@workspace/db";
import { sendSmtpMail, type SmtpMailConfig, type SmtpEncryption } from "@/lib/smtp-mailer";

// ── Singleton ─────────────────────────────────────────────────────────────────

let _client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

function fromAddress(): string {
  return process.env["RESEND_FROM_EMAIL"] ?? "Veele <noreply@veele.nl>";
}

function normalizeEncryption(value: string | null): SmtpEncryption {
  if (value === "none" || value === "tls" || value === "starttls") return value;
  return "starttls";
}

async function getSmtpConfig(): Promise<SmtpMailConfig | null> {
  const [settings] = await db
    .select({
      smtpEnabled:    organizationSettingsTable.smtpEnabled,
      smtpHost:       organizationSettingsTable.smtpHost,
      smtpPort:       organizationSettingsTable.smtpPort,
      smtpEncryption: organizationSettingsTable.smtpEncryption,
      smtpUsername:   organizationSettingsTable.smtpUsername,
      smtpPassword:   organizationSettingsTable.smtpPassword,
      smtpFromName:   organizationSettingsTable.smtpFromName,
      smtpFromEmail:  organizationSettingsTable.smtpFromEmail,
      smtpReplyTo:    organizationSettingsTable.smtpReplyTo,
    })
    .from(organizationSettingsTable)
    .limit(1);

  if (!settings?.smtpEnabled) return null;

  if (!settings.smtpHost || !settings.smtpPort || !settings.smtpFromEmail) {
    throw new Error("SMTP is actief, maar host, poort of afzender ontbreekt.");
  }

  return {
    host:       settings.smtpHost,
    port:       settings.smtpPort,
    encryption: normalizeEncryption(settings.smtpEncryption),
    username:   settings.smtpUsername,
    password:   settings.smtpPassword,
    fromEmail:  settings.smtpFromEmail,
    fromName:   settings.smtpFromName,
    replyTo:    settings.smtpReplyTo,
  };
}

function siteUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}`;
  return process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://veele.nl";
}

// ── Core send helpers ─────────────────────────────────────────────────────────
// Fire-and-forget variant: awaited by callers but never throws.

export async function sendEmail(opts: {
  to:      string | string[];
  subject: string;
  html:    string;
  text?:   string;
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
}): Promise<{ success: boolean; error?: string }> {
  try {
    const smtpConfig = await getSmtpConfig();
    if (smtpConfig) {
      await sendSmtpMail(smtpConfig, opts);
      return { success: true };
    }
  } catch (error) {
    const msg = String((error as { message?: string }).message ?? error);
    console.error("[email] SMTP verzenden mislukt:", msg);
    return { success: false, error: msg };
  }

  const resend = getClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — e-mail overgeslagen:", opts.subject);
    return { success: false, error: "E-mailclient niet geconfigureerd. Vul SMTP-instellingen in of configureer RESEND_API_KEY." };
  }
  try {
    const { error } = await resend.emails.send({
      from:        fromAddress(),
      to:          opts.to,
      subject:     opts.subject,
      html:        opts.html,
      text:        opts.text,
      attachments: opts.attachments,
    });
    if (error) {
      const msg = String((error as { message?: string }).message ?? error);
      console.error("[email] Verzenden mislukt:", msg);
      return { success: false, error: msg };
    }
  } catch (error) {
    const msg = String((error as { message?: string }).message ?? error);
    console.error("[email] Verzenden mislukt:", msg);
    return { success: false, error: msg };
  }

  return { success: true };
}

export function klantPortalUrl(): string {
  const explicit = process.env["KLANT_PORTAL_URL"] ?? process.env["NEXT_PUBLIC_KLANT_PORTAL_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}/klant`;
  const siteUrl = process.env["NEXT_PUBLIC_SITE_URL"];
  if (siteUrl) return `${siteUrl}/klant`;
  return "https://veele.nl/klant";
}

export function personeelPortalUrl(): string {
  const explicit = process.env["PERSONEEL_PORTAL_URL"] ?? process.env["NEXT_PUBLIC_PERSONEEL_PORTAL_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}/personeel`;
  const siteUrl = process.env["NEXT_PUBLIC_SITE_URL"];
  if (siteUrl) return `${siteUrl}/personeel`;
  return "https://veele.nl/personeel";
}

// ── Shared base template ───────────────────────────────────────────────────────

const BRAND_COLOR = "#081D3A";

function baseTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;color:#1a1a1a;background:#f5f5f5;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
    <div style="background:${BRAND_COLOR};padding:20px 24px">
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">Veele</span>
    </div>
    <div style="padding:28px 24px">
      ${bodyHtml}
    </div>
    <div style="padding:16px 24px;background:#f8fafc;font-size:12px;color:#94a3b8">
      Dit is een automatisch bericht van het Veele platform. Antwoorden op deze e-mail worden niet verwerkt.
    </div>
  </div>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<p><a href="${href}" style="display:inline-block;padding:11px 22px;background:${BRAND_COLOR};color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">${label}</a></p>`;
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
    <p>Er is een account voor u aangemaakt in het Veele platform.</p>
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
  const subject = `Uw offerte ${opts.quoteNumber} van Veele`;
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

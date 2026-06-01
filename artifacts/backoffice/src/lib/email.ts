import { Resend } from "resend";

// ── Singleton ─────────────────────────────────────────────────────────────────
// Returns null when RESEND_API_KEY is not configured so callers can
// skip gracefully instead of crashing. Email is always non-blocking.

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

function siteUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}`;
  return process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://veele.nl";
}

// ── Core send helper ──────────────────────────────────────────────────────────
// Fire-and-forget: awaited by callers but never throws — errors are logged only.

export async function sendEmail(opts: {
  to:      string | string[];
  subject: string;
  html:    string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — e-mail overgeslagen:", opts.subject);
    return;
  }
  const { error } = await resend.emails.send({
    from:    fromAddress(),
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
  });
  if (error) {
    console.error("[email] Verzenden mislukt:", error);
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────

function baseTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;color:#1a1a1a;background:#f5f5f5;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
    <div style="background:#0f172a;padding:20px 24px">
      <span style="color:#fff;font-size:18px;font-weight:600">Veele</span>
    </div>
    <div style="padding:24px">
      ${bodyHtml}
    </div>
    <div style="padding:16px 24px;background:#f8fafc;font-size:12px;color:#94a3b8">
      Dit is een automatisch bericht van het Veele platform. Antwoorden op deze e-mail worden niet verwerkt.
    </div>
  </div>
</body>
</html>`;
}

// 1. Rapport ingediend → beheerder
export function buildReportSubmittedEmail(opts: {
  assignmentTitle: string;
  assignmentId:    string;
  reportId:        string;
}): { subject: string; html: string } {
  const url = `${siteUrl()}/reports/${opts.reportId}`;
  const subject = `Nieuw rapport ingediend: ${opts.assignmentTitle}`;
  const html = baseTemplate(subject, `
    <h2 style="margin-top:0">Rapport ingediend</h2>
    <p>Er is een nieuw rapport ingediend voor opdracht <strong>${opts.assignmentTitle}</strong>.</p>
    <p>Het rapport staat klaar voor beoordeling.</p>
    <p>
      <a href="${url}"
         style="display:inline-block;padding:10px 20px;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        Rapport bekijken
      </a>
    </p>
  `);
  return { subject, html };
}

// 2. Verlofaanvraag goedgekeurd of afgewezen → medewerker
export function buildLeaveDecisionEmail(opts: {
  firstName:  string;
  decision:   "goedgekeurd" | "afgewezen";
  startDate:  string;
  endDate:    string | null;
  leaveType:  string;
}): { subject: string; html: string } {
  const period = opts.endDate && opts.endDate !== opts.startDate
    ? `${opts.startDate} t/m ${opts.endDate}`
    : opts.startDate;
  const color  = opts.decision === "goedgekeurd" ? "#16a34a" : "#dc2626";
  const subject = `Verlofaanvraag ${opts.decision}`;
  const html = baseTemplate(subject, `
    <h2 style="margin-top:0">Verlofaanvraag ${opts.decision}</h2>
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
  `);
  return { subject, html };
}

// 3. Offerte verstuurd → klant
export function buildQuoteSentEmail(opts: {
  customerName: string;
  quoteNumber:  string;
  amount:       string;
  validityDate: string;
  quoteId:      string;
}): { subject: string; html: string } {
  const url    = `${siteUrl()}/klant/offertes/${opts.quoteId}`;
  const amount = parseFloat(opts.amount).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
  const subject = `Uw offerte ${opts.quoteNumber} van Veele`;
  const html = baseTemplate(subject, `
    <h2 style="margin-top:0">Offerte ${opts.quoteNumber}</h2>
    <p>Beste ${opts.customerName},</p>
    <p>Wij sturen u hierbij onze offerte toe.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Offertenummer</td>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${opts.quoteNumber}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Bedrag</td>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${amount}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b">Geldig tot</td>
        <td style="padding:8px 0;font-weight:600">${opts.validityDate}</td>
      </tr>
    </table>
    <p>
      <a href="${url}"
         style="display:inline-block;padding:10px 20px;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        Offerte bekijken &amp; accorderen
      </a>
    </p>
    <p style="font-size:13px;color:#64748b">
      U kunt de offerte bekijken en direct accorderen via de bovenstaande knop.
    </p>
  `);
  return { subject, html };
}

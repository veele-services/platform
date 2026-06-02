import { Resend } from "resend";
import { logger } from "./logger";

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

function siteUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}`;
  return process.env["SITE_URL"] ?? "https://veele.nl";
}

// ── Core send helper ──────────────────────────────────────────────────────────

export async function sendEmail(opts: {
  to:      string | string[];
  subject: string;
  html:    string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ subject: opts.subject }, "RESEND_API_KEY not set — e-mail overgeslagen");
    return;
  }
  const { error } = await resend.emails.send({
    from:    fromAddress(),
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
  });
  if (error) {
    logger.error({ error }, "E-mail verzenden mislukt");
  }
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
      Dit is een automatisch bericht van het Veele platform. Antwoorden worden niet verwerkt.
    </div>
  </div>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<p><a href="${href}" style="display:inline-block;padding:11px 22px;background:${BRAND_COLOR};color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">${label}</a></p>`;
}

// ── Templates ─────────────────────────────────────────────────────────────────

export function buildQuoteExpiredEmail(opts: {
  customerName: string;
  quoteNumber:  string;
  amount:       string;
}): { subject: string; html: string } {
  const url     = `${siteUrl()}/klant/offertes`;
  const amount  = parseFloat(opts.amount).toLocaleString("nl-NL", {
    style:    "currency",
    currency: "EUR",
  });
  const subject = `Uw offerte ${opts.quoteNumber} is verlopen`;
  const html    = baseTemplate(subject, `
    <h2 style="margin-top:0;color:${BRAND_COLOR}">Offerte verlopen</h2>
    <p>Beste ${opts.customerName},</p>
    <p>
      Offerte <strong>${opts.quoteNumber}</strong> (bedrag: ${amount}) is verlopen.
      Neem contact met ons op als u nog gebruik wilt maken van onze diensten.
    </p>
    ${ctaButton(url, "Offertes bekijken")}
  `);
  return { subject, html };
}

export function buildPaymentReminderEmail(opts: {
  customerName:  string;
  invoiceNumber: string;
  totalAmount:   string;
  dueDate:       string;
  invoiceId:     string;
}): { subject: string; html: string } {
  const url     = `${siteUrl()}/klant/facturen`;
  const amount  = parseFloat(opts.totalAmount).toLocaleString("nl-NL", {
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
    ${ctaButton(url, "Factuur bekijken &amp; betalen")}
    <p style="font-size:13px;color:#64748b">
      Heeft u al betaald? Dan kunt u dit bericht als niet verzonden beschouwen.
      Neem bij vragen contact op met ons.
    </p>
  `);
  return { subject, html };
}

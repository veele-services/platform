import { sendTransactionalEmail } from "@workspace/db/email-service";

// ── Singleton ─────────────────────────────────────────────────────────────────

function backofficeUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]!.trim()}`;
  return process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://veele.nl";
}

export function klantPortalUrl(): string {
  const explicit = process.env["KLANT_PORTAL_URL"] ?? process.env["NEXT_PUBLIC_KLANT_PORTAL_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const site = (process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://veele.fieldgrid.nl").replace(/\/$/, "");
  return site.endsWith("/klant") ? site : `${site}/klant`;
}

// ── Core send helper ──────────────────────────────────────────────────────────
// Fire-and-forget: never throws — errors are logged only.

export async function sendEmailWithResult(opts: {
  to:      string | string[];
  subject: string;
  html:    string;
  text?:   string;
}): Promise<{ success: boolean; error?: string }> {
  const result = await sendTransactionalEmail({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    templateKey: "customer_portal",
    triggeredByType: "customer_user",
  });

  return result.success ? { success: true } : { success: false, error: result.error };
}

export async function sendEmail(opts: {
  to:      string | string[];
  subject: string;
  html:    string;
}): Promise<void> {
  const result = await sendEmailWithResult(opts);
  if (!result.success) console.error("[email] Verzenden mislukt:", result.error);
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

// Offerte-beslissing klant → beheerder (org emailAfzender)
export function buildQuoteDecisionEmail(opts: {
  customerName: string;
  quoteNumber:  string;
  decision:     "geaccepteerd" | "afgewezen";
  reason:       string | null;
}): { subject: string; html: string } {
  const color   = opts.decision === "geaccepteerd" ? "#16a34a" : "#dc2626";
  const url     = `${backofficeUrl()}/quotes`;
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

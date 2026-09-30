import {
  FIELDGRID_PRIMARY,
  FIELDGRID_SECONDARY,
  PREVIEW_VALUES,
  renderTemplateText,
  type TemplateKey,
  type TemplateValues,
} from "./templates";

export type EmailBrand = {
  company: string;
  domain: string;
  primary: string;
  accent: string;
  senderEmail?: string | null;
  emailLogoUrl?: string | null;
};

export type EmailMessage = { subject: string; body: string };
export type EmailRenderMode = "delivery" | "preview" | "template";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function validColor(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

function textOn(color: string) {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16) / 255);
  const linear = [r, g, b].map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.42 ? "#112C42" : "#FFFFFF";
}

function safeHttpsUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function safeWebsiteUrl(value: string) {
  const domain = value.trim();
  if (!domain) return null;
  return safeHttpsUrl(domain.includes("://") ? domain : `https://${domain}`);
}

function safeEmailLogoUrl(value: string | null | undefined, mode: EmailRenderMode, allowLocalLinks = false) {
  const secure = safeHttpsUrl(value);
  if (secure || (mode !== "preview" && !allowLocalLinks) || !value) return secure;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function paragraphHtml(value: string) {
  return value.trim().split(/\n\s*\n/).filter(Boolean).map((paragraph) => `<p style="margin:0 0 17px;color:#40586B;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("\n                  ");
}

export function renderTenantEmailHtml(input: {
  brand: EmailBrand;
  kind: Extract<TemplateKey, "invoice" | "quote"> | "personnel_invitation" | "dossier_reminder";
  message: EmailMessage;
  values?: TemplateValues;
  targetUrl?: string;
  mode?: EmailRenderMode;
  existingAccount?: boolean;
  allowLocalLinks?: boolean;
}) {
  const mode = input.mode ?? "delivery";
  const company = input.brand.company.trim() || "Uw organisatie";
  const values: TemplateValues = mode === "preview"
    ? { ...PREVIEW_VALUES, bedrijfsnaam: company }
    : { ...input.values, bedrijfsnaam: input.values?.bedrijfsnaam ?? company };
  const strict = mode !== "template";
  const subject = renderTemplateText(input.message.subject, values, strict);
  const body = renderTemplateText(input.message.body, values, strict);
  const primary = validColor(input.brand.primary, FIELDGRID_PRIMARY);
  const accent = validColor(input.brand.accent, FIELDGRID_SECONDARY);
  const onAccent = textOn(accent);
  const personnelInvitation = input.kind === "personnel_invitation";
  const dossierReminder = input.kind === "dossier_reminder";
  const preheader = dossierReminder ? "Een dossieractie vraagt aandacht." : personnelInvitation ? `Je bent uitgenodigd voor het personeelsportaal van ${company}.` : input.kind === "invoice" ? "Uw factuur is beschikbaar." : "Uw prijsopgave staat klaar.";
  const eyebrow = dossierReminder ? "DOSSIERHERINNERING" : personnelInvitation ? "UITNODIGING PERSONEELSPORTAAL" : input.kind === "invoice" ? "UW FACTUUR" : "UW PRIJSOPGAVE";
  const cta = dossierReminder ? "Open personeelsdossier" : personnelInvitation ? (input.existingAccount ? "Personeelsportaal openen" : "Personeelsaccount activeren") : input.kind === "invoice" ? "Factuur veilig betalen" : "Prijsopgave bekijken";
  const targetToken = personnelInvitation || dossierReminder ? "{portaallink}" : input.kind === "invoice" ? "{betaallink}" : "{offertelink}";
  const target = mode === "template"
    ? targetToken
    : mode === "preview"
      ? "https://voorbeeld.invalid/voorbeeld"
      : safeEmailLogoUrl(input.targetUrl, "delivery", input.allowLocalLinks) ?? (() => { throw new Error("De transactielink is geen geldige HTTPS-URL"); })();
  const logoUrl = safeEmailLogoUrl(input.brand.emailLogoUrl, mode, input.allowLocalLinks);
  const headerBrand = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="110" alt="${escapeHtml(company)}" style="display:block;max-width:110px;max-height:44px;width:auto;height:auto;border:0;outline:none;text-decoration:none;">`
    : `<span style="display:block;color:${primary};font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;line-height:1.35;">${escapeHtml(company)}</span>`;
  const websiteUrl = safeWebsiteUrl(input.brand.domain);
  const website = websiteUrl
    ? `<p style="margin:7px 0 0;color:#8195A1;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.65;"><a href="${escapeHtml(websiteUrl)}" style="color:#567384;text-decoration:underline;">${escapeHtml(input.brand.domain)}</a></p>`
    : "";
  const senderEmail = input.brand.senderEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.brand.senderEmail) ? input.brand.senderEmail : null;
  const sender = senderEmail ? `<a href="mailto:${escapeHtml(senderEmail)}" style="color:#567384;text-decoration:underline;">${escapeHtml(senderEmail)}</a>` : "Neem contact op met onze administratie.";
  const visibleTarget = mode === "preview" ? (personnelInvitation ? "Voorbeeldlink · geen echte uitnodiging" : "Voorbeeldlink · geen echte betaling of aanvraag") : target;

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(subject)}</title>
  <style>@media screen and (max-width:640px){.outer-pad{padding:0!important}.mail-pad{padding:30px 23px!important}.mail-heading{font-size:25px!important}.mail-shell{border-radius:0!important}}</style>
</head>
<body style="margin:0;padding:0;background:#F0F4F6;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#F0F4F6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:#F0F4F6;">
    <tr><td align="center" class="outer-pad" style="padding:35px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="mail-shell" style="width:100%;max-width:600px;border-collapse:separate;border-spacing:0;background:#FFFFFF;border:1px solid #E1E9ED;border-radius:16px;overflow:hidden;">
        <tr><td height="5" bgcolor="${accent}" style="height:5px;line-height:5px;font-size:1px;background:${accent};">&nbsp;</td></tr>
        <tr><td class="mail-pad" style="padding:34px 42px 25px;">
          ${headerBrand}
        </td></tr>
        <tr><td style="height:1px;background:#E9EFF2;font-size:1px;line-height:1px;">&nbsp;</td></tr>
        <tr><td class="mail-pad" style="padding:37px 42px 28px;">
          <span style="display:block;color:${primary};font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;line-height:1.5;">${eyebrow}</span>
          <h1 class="mail-heading" style="margin:12px 0 20px;color:#102B42;font-family:Arial,Helvetica,sans-serif;font-size:29px;font-weight:700;line-height:1.28;letter-spacing:-.5px;">${escapeHtml(subject)}</h1>
          ${paragraphHtml(body)}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;margin:25px 0 18px;"><tr><td align="center" bgcolor="${accent}" style="border-radius:9px;background:${accent};"><a href="${escapeHtml(target)}" style="display:inline-block;padding:15px 22px;color:${onAccent};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.3;text-decoration:none;">${cta}</a></td></tr></table>
          <p style="margin:0;color:#91A2AA;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;word-break:break-word;">Werkt de knop niet? Open <a href="${escapeHtml(target)}" style="color:#457A8E;text-decoration:underline;">${escapeHtml(visibleTarget)}</a>.</p>
        </td></tr>
        <tr><td class="mail-pad" style="padding:22px 42px;background:#F7F9FA;border-top:1px solid #E9EFF2;"><p style="margin:0 0 5px;color:#17334A;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:1.5;">${escapeHtml(company)}</p><p style="margin:0;color:#8195A1;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.65;">Dit bericht is voor u bestemd. Vragen? ${sender}</p>${website}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

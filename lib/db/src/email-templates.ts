import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { tenantEmailTemplateOverridesTable } from "./schema";
import {
  FIELDGRID_DEFAULT_BRAND_THEME,
  getEffectiveBrandTheme,
  type BrandTheme,
} from "./tenant-branding";

export type EmailTemplateValue = string | number | boolean | Date | null | undefined;
export type EmailTemplateVariables = Record<string, EmailTemplateValue>;

export type EmailTemplateKey =
  | "account_invite"
  | "password_reset"
  | "report_submitted"
  | "leave_request_submitted"
  | "leave_request_decision"
  | "report_approved"
  | "report_rejected"
  | "quote_expired"
  | "quote_decision_received"
  | "quote_available"
  | "invoice_available"
  | "invoice_payment_reminder"
  | "notification_manual"
  | "notification_test"
  | "tenant_mail_settings_test"
  | "platform_email_test";

export type EmailTemplateRenderInput = {
  templateKey: EmailTemplateKey;
  variables: EmailTemplateVariables;
  tenantId?: string | null;
  theme?: EmailTheme | null;
};

export type RenderedEmail = {
  templateKey: EmailTemplateKey;
  subject: string;
  html: string;
  text: string;
  variablesUsed: string[];
};

export type EmailTemplateSummary = {
  key: EmailTemplateKey;
  name: string;
  category: "account" | "planning" | "reports" | "finance" | "quotes" | "notifications" | "platform";
  requiredVariables: readonly string[];
  optionalVariables: readonly string[];
};

type EmailTemplateDefinition = EmailTemplateSummary & {
  subject: string;
  preheader: string;
  headline: string;
  intro: readonly string[];
  detailRows?: readonly EmailTemplateDetailRow[];
  cta?: EmailTemplateLink;
  secondaryLink?: EmailTemplateLink;
  footerNote?: string;
};

type EmailTemplateDetailRow = {
  label: string;
  value: string;
  optionalVariable?: string;
  monospace?: boolean;
};

type EmailTemplateLink = {
  label: string;
  href: string;
  optionalVariable?: string;
};

export type EmailTheme = {
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  buttonTextColor: string;
  footerText: string;
  signature: string;
};

type RenderedEmailMetadata = {
  templateKey: EmailTemplateKey;
  variables: EmailTemplateVariables;
};

export class EmailTemplateValidationError extends Error {
  readonly templateKey: EmailTemplateKey;
  readonly missingVariables: string[];

  constructor(templateKey: EmailTemplateKey, message: string, missingVariables: string[] = []) {
    super(message);
    this.name = "EmailTemplateValidationError";
    this.templateKey = templateKey;
    this.missingVariables = missingVariables;
  }
}

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu;
const MAX_RENDERED_EMAIL_REGISTRY_SIZE = 300;

const renderedEmailRegistry = new Map<string, RenderedEmailMetadata>();

export const FIELDGRID_CLEAN_OPS_EMAIL_THEME: EmailTheme = {
  brandName: "Fieldgrid",
  logoUrl: null,
  primaryColor: "#16A34A",
  accentColor: "#0F766E",
  backgroundColor: "#F5F7F8",
  surfaceColor: "#FFFFFF",
  textColor: "#18212B",
  mutedColor: "#6B7280",
  borderColor: "#E4E8EC",
  buttonTextColor: "#FFFFFF",
  footerText: FIELDGRID_DEFAULT_BRAND_THEME.emailFooterText,
  signature: FIELDGRID_DEFAULT_BRAND_THEME.emailSignature,
};

const EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailTemplateDefinition> = {
  account_invite: {
    key: "account_invite",
    name: "Accountuitnodiging",
    category: "account",
    subject: "Toegang tot {{portalName}} van {{brandName}}",
    preheader: "Uw account staat klaar. Log in met het tijdelijke wachtwoord en kies daarna uw eigen wachtwoord.",
    headline: "Uw account staat klaar",
    intro: [
      "Beste {{recipientName}},",
      "Er is een account voor u aangemaakt voor {{portalName}} van {{brandName}}.",
      "Gebruik het tijdelijke wachtwoord hieronder om voor de eerste keer in te loggen. Daarna vragen wij u direct een eigen wachtwoord te kiezen.",
    ],
    detailRows: [
      { label: "Tijdelijk wachtwoord", value: "{{temporaryPassword}}", monospace: true },
    ],
    cta: { label: "Inloggen op {{portalName}}", href: "{{loginUrl}}" },
    footerNote: "Bewaar dit tijdelijke wachtwoord niet. Het is alleen bedoeld voor de eerste login.",
    requiredVariables: ["recipientName", "portalName", "loginUrl", "temporaryPassword"],
    optionalVariables: [],
  },
  password_reset: {
    key: "password_reset",
    name: "Wachtwoordherstel",
    category: "account",
    subject: "Wachtwoord opnieuw instellen voor {{portalName}}",
    preheader: "Gebruik deze herstelcode om een nieuw wachtwoord te kiezen.",
    headline: "Wachtwoord opnieuw instellen",
    intro: [
      "Beste {{recipientName}},",
      "Er is een verzoek gedaan om uw wachtwoord voor {{portalName}} opnieuw in te stellen.",
      "Gebruik de herstelcode hieronder op de resetpagina. Daarna kiest u direct een nieuw wachtwoord.",
    ],
    detailRows: [{ label: "Herstelcode", value: "{{code}}", monospace: true }],
    cta: { label: "Resetpagina openen", href: "{{resetUrl}}" },
    footerNote: "Deze code is 30 minuten geldig. Heeft u dit niet aangevraagd? Dan hoeft u niets te doen. Uw huidige wachtwoord blijft geldig.",
    requiredVariables: ["recipientName", "portalName", "resetUrl", "code"],
    optionalVariables: [],
  },
  report_submitted: {
    key: "report_submitted",
    name: "Rapport ingediend",
    category: "reports",
    subject: "Nieuw rapport ingediend: {{assignmentTitle}}",
    preheader: "Een rapport staat klaar voor beoordeling.",
    headline: "Rapport ingediend",
    intro: [
      "{{reporterName}} heeft een rapport ingediend voor {{assignmentTitle}}.",
      "Bekijk het rapport in de backoffice en keur het goed of stuur het terug met een duidelijke toelichting.",
    ],
    detailRows: [
      { label: "Opdracht", value: "{{assignmentTitle}}" },
      { label: "Rapport-id", value: "{{reportId}}", optionalVariable: "reportId" },
    ],
    cta: { label: "Rapport bekijken", href: "{{reportUrl}}" },
    requiredVariables: ["assignmentTitle", "reportUrl"],
    optionalVariables: ["reporterName", "assignmentId", "reportId"],
  },
  leave_request_submitted: {
    key: "leave_request_submitted",
    name: "Verlofaanvraag ingediend",
    category: "planning",
    subject: "Nieuwe verlofaanvraag van {{personnelName}}",
    preheader: "Er is een nieuwe verlofaanvraag ingediend.",
    headline: "Verlofaanvraag",
    intro: [
      "{{personnelName}} heeft een verlofaanvraag ingediend.",
      "Controleer de aanvraag en verwerk de planning zodra de aanvraag is beoordeeld.",
    ],
    detailRows: [
      { label: "Type", value: "{{leaveType}}" },
      { label: "Periode", value: "{{period}}" },
      { label: "Reden", value: "{{reason}}", optionalVariable: "reason" },
    ],
    cta: { label: "Verlofaanvraag bekijken", href: "{{leaveUrl}}" },
    requiredVariables: ["personnelName", "leaveType", "period", "leaveUrl"],
    optionalVariables: ["reason"],
  },
  leave_request_decision: {
    key: "leave_request_decision",
    name: "Verlofaanvraag beoordeeld",
    category: "planning",
    subject: "Verlofaanvraag {{decision}}",
    preheader: "Uw verlofaanvraag is {{decision}}.",
    headline: "Verlofaanvraag {{decision}}",
    intro: [
      "Beste {{firstName}},",
      "Uw verlofaanvraag voor {{leaveType}} in de periode {{period}} is {{decision}}.",
      "{{decisionMessage}}",
    ],
    detailRows: [
      { label: "Type", value: "{{leaveType}}" },
      { label: "Periode", value: "{{period}}" },
    ],
    cta: { label: "Mijn verlofaanvragen bekijken", href: "{{leaveUrl}}" },
    requiredVariables: ["firstName", "decision", "decisionMessage", "leaveType", "period", "leaveUrl"],
    optionalVariables: [],
  },
  report_approved: {
    key: "report_approved",
    name: "Rapport goedgekeurd",
    category: "reports",
    subject: "Uw rapport voor {{assignmentTitle}} is goedgekeurd",
    preheader: "Uw ingediende rapport is goedgekeurd.",
    headline: "Rapport goedgekeurd",
    intro: [
      "Beste {{firstName}},",
      "Goed nieuws: uw rapport voor {{assignmentTitle}} is goedgekeurd.",
      "U hoeft hiervoor verder niets te doen.",
    ],
    cta: { label: "Mijn rapporten bekijken", href: "{{reportsUrl}}" },
    requiredVariables: ["firstName", "assignmentTitle", "reportsUrl"],
    optionalVariables: ["reportId"],
  },
  report_rejected: {
    key: "report_rejected",
    name: "Rapport afgewezen",
    category: "reports",
    subject: "Uw rapport voor {{assignmentTitle}} vraagt aanpassing",
    preheader: "Controleer de toelichting en pas het rapport aan.",
    headline: "Rapport vraagt aanpassing",
    intro: [
      "Beste {{firstName}},",
      "Uw rapport voor {{assignmentTitle}} is teruggestuurd voor aanpassing.",
      "Bekijk de reden hieronder en dien daarna een aangepast rapport in.",
    ],
    detailRows: [{ label: "Reden", value: "{{reason}}" }],
    cta: { label: "Mijn rapporten bekijken", href: "{{reportsUrl}}" },
    requiredVariables: ["firstName", "assignmentTitle", "reason", "reportsUrl"],
    optionalVariables: ["reportId"],
  },
  quote_expired: {
    key: "quote_expired",
    name: "Offerte verlopen",
    category: "quotes",
    subject: "Offerte {{quoteNumber}} is verlopen",
    preheader: "Neem contact met ons op als u de werkzaamheden alsnog wilt laten uitvoeren.",
    headline: "Offerte verlopen",
    intro: [
      "Beste {{customerName}},",
      "Offerte {{quoteNumber}} is verlopen.",
      "Wilt u de werkzaamheden alsnog laten uitvoeren of wilt u een nieuwe prijsopgave ontvangen? Neem dan contact met ons op.",
    ],
    detailRows: [
      { label: "Offertenummer", value: "{{quoteNumber}}" },
      { label: "Bedrag", value: "{{amount}}" },
    ],
    cta: { label: "Offertes bekijken", href: "{{quotesUrl}}" },
    requiredVariables: ["customerName", "quoteNumber", "amount", "quotesUrl"],
    optionalVariables: [],
  },
  quote_decision_received: {
    key: "quote_decision_received",
    name: "Offertebeslissing ontvangen",
    category: "quotes",
    subject: "Offerte {{quoteNumber}} is {{decision}} door {{customerName}}",
    preheader: "Een klant heeft een beslissing genomen op offerte {{quoteNumber}}.",
    headline: "Offerte {{decision}}",
    intro: [
      "{{customerName}} heeft offerte {{quoteNumber}} {{decision}}.",
      "Controleer de offerte in de backoffice en bepaal de vervolgstap.",
    ],
    detailRows: [
      { label: "Klant", value: "{{customerName}}" },
      { label: "Offertenummer", value: "{{quoteNumber}}" },
      { label: "Reden", value: "{{reason}}", optionalVariable: "reason" },
    ],
    cta: { label: "Offerte openen", href: "{{quotesUrl}}" },
    requiredVariables: ["customerName", "quoteNumber", "decision", "quotesUrl"],
    optionalVariables: ["reason"],
  },
  quote_available: {
    key: "quote_available",
    name: "Offerte beschikbaar",
    category: "quotes",
    subject: "Uw offerte {{quoteNumber}} staat klaar",
    preheader: "Bekijk de offerte en geef eenvoudig akkoord via het klantenportaal.",
    headline: "Offerte {{quoteNumber}} staat klaar",
    intro: [
      "Beste {{customerName}},",
      "Er staat een nieuwe offerte voor u klaar.",
      "U kunt de offerte bekijken en direct akkoord geven of afwijzen via het klantenportaal.",
    ],
    detailRows: [
      { label: "Offertenummer", value: "{{quoteNumber}}" },
      { label: "Bedrag", value: "{{amount}}" },
      { label: "Geldig tot", value: "{{validityDate}}" },
    ],
    cta: { label: "Offerte bekijken", href: "{{quoteUrl}}" },
    requiredVariables: ["customerName", "quoteNumber", "amount", "validityDate", "quoteUrl"],
    optionalVariables: ["quoteId"],
  },
  invoice_available: {
    key: "invoice_available",
    name: "Factuur beschikbaar",
    category: "finance",
    subject: "Factuur {{invoiceNumber}} staat klaar",
    preheader: "Bekijk uw factuur en betaal eenvoudig online via het klantenportaal.",
    headline: "Nieuwe factuur",
    intro: [
      "Beste {{customerName}},",
      "Er staat een nieuwe factuur voor u klaar.",
      "U kunt de factuur bekijken en, indien online betalen actief is, direct betalen via het klantenportaal.",
    ],
    detailRows: [
      { label: "Factuurnummer", value: "{{invoiceNumber}}" },
      { label: "Bedrag", value: "{{totalAmount}}" },
      { label: "Vervaldatum", value: "{{dueDate}}" },
    ],
    cta: { label: "Factuur bekijken en betalen", href: "{{paymentUrl}}", optionalVariable: "paymentUrl" },
    secondaryLink: { label: "Factuur bekijken in het klantenportaal", href: "{{invoiceUrl}}" },
    requiredVariables: ["customerName", "invoiceNumber", "totalAmount", "dueDate", "invoiceUrl"],
    optionalVariables: ["paymentUrl"],
  },
  invoice_payment_reminder: {
    key: "invoice_payment_reminder",
    name: "Betalingsherinnering",
    category: "finance",
    subject: "Betalingsherinnering voor factuur {{invoiceNumber}}",
    preheader: "Deze factuur staat nog open. Heeft u al betaald? Dan kunt u dit bericht negeren.",
    headline: "Factuur staat nog open",
    intro: [
      "Beste {{customerName}},",
      "Volgens onze administratie staat onderstaande factuur nog open.",
      "Wij verzoeken u vriendelijk het openstaande bedrag te voldoen.",
    ],
    detailRows: [
      { label: "Factuurnummer", value: "{{invoiceNumber}}" },
      { label: "Bedrag", value: "{{totalAmount}}" },
      { label: "Vervaldatum", value: "{{dueDate}}" },
    ],
    cta: { label: "Factuur bekijken en betalen", href: "{{invoiceUrl}}" },
    footerNote: "Heeft u de factuur inmiddels betaald? Dan kunt u dit bericht als niet verzonden beschouwen.",
    requiredVariables: ["customerName", "invoiceNumber", "totalAmount", "dueDate", "invoiceUrl"],
    optionalVariables: ["invoiceId"],
  },
  notification_manual: {
    key: "notification_manual",
    name: "Handmatige melding",
    category: "notifications",
    subject: "{{notificationTitle}}",
    preheader: "{{notificationPreheader}}",
    headline: "{{notificationTitle}}",
    intro: ["{{notificationBody}}"],
    cta: { label: "{{ctaLabel}}", href: "{{ctaUrl}}", optionalVariable: "ctaUrl" },
    requiredVariables: ["notificationTitle", "notificationBody"],
    optionalVariables: ["notificationPreheader", "ctaUrl", "ctaLabel"],
  },
  notification_test: {
    key: "notification_test",
    name: "Notificatietest",
    category: "notifications",
    subject: "Testmelding: {{notificationTypeLabel}}",
    preheader: "Controlebericht voor {{notificationTypeLabel}}.",
    headline: "Testmelding",
    intro: [
      "Dit is een testmelding voor {{notificationTypeLabel}}.",
      "Als u dit bericht ontvangt, werkt de e-mailverzending correct.",
    ],
    requiredVariables: ["notificationTypeLabel", "notificationType"],
    optionalVariables: [],
  },
  tenant_mail_settings_test: {
    key: "tenant_mail_settings_test",
    name: "E-mailinstellingen test",
    category: "platform",
    subject: "Testmail vanuit {{brandName}}",
    preheader: "De e-mailinstellingen kunnen berichten afleveren.",
    headline: "Testmail verzonden",
    intro: [
      "Deze e-mail is verzonden vanuit de mailinstellingen van {{brandName}}.",
      "Als u dit bericht ontvangt, kan Fieldgrid e-mail afleveren met de huidige instellingen.",
    ],
    requiredVariables: [],
    optionalVariables: [],
  },
  platform_email_test: {
    key: "platform_email_test",
    name: "Platform e-mailtest",
    category: "platform",
    subject: "Testmail vanuit Fieldgrid e-mailinstellingen",
    preheader: "De actieve platform e-mailprovider werkt.",
    headline: "Fieldgrid testmail",
    intro: [
      "Dit is een testmail vanuit de globale platform e-mailinstellingen.",
      "Als u deze mail ontvangt, werkt de actieve e-mailprovider correct.",
    ],
    detailRows: [{ label: "Verzonden op", value: "{{triggeredAt}}", optionalVariable: "triggeredAt" }],
    requiredVariables: [],
    optionalVariables: ["triggeredAt"],
  },
};

export const EMAIL_TEMPLATE_VARIABLES = Object.values(EMAIL_TEMPLATES).reduce(
  (acc, template) => {
    acc[template.key] = [...template.requiredVariables, ...template.optionalVariables];
    return acc;
  },
  {} as Record<EmailTemplateKey, readonly string[]>,
);

export const EMAIL_TEMPLATE_SUMMARIES: readonly EmailTemplateSummary[] = Object.values(EMAIL_TEMPLATES).map(
  ({ key, name, category, requiredVariables, optionalVariables }) => ({
    key,
    name,
    category,
    requiredVariables,
    optionalVariables,
  }),
);

function nonEmpty(value: EmailTemplateValue): string | null {
  if (value instanceof Date) return value.toISOString();
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeValue(value: EmailTemplateValue): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function textToHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/gu, "<br>");
}

function plainText(value: string): string {
  return value.replace(/\r\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

function extractTokens(template: string): string[] {
  return [...template.matchAll(TOKEN_PATTERN)].map((match) => match[1]!).filter(Boolean);
}

function replaceTokens(
  template: string,
  variables: EmailTemplateVariables,
  mode: "html" | "text" | "url",
): string {
  return template.replace(TOKEN_PATTERN, (_match, key: string) => {
    const value = normalizeValue(variables[key]);
    if (mode === "html") return textToHtml(value);
    return value;
  });
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function compactVariables(input: EmailTemplateVariables): EmailTemplateVariables {
  const variables: EmailTemplateVariables = {};
  for (const [key, value] of Object.entries(input)) {
    variables[key] = value ?? "";
  }
  return variables;
}

function emailThemeFromBrandTheme(theme: BrandTheme): EmailTheme {
  return {
    brandName: theme.brandName || FIELDGRID_CLEAN_OPS_EMAIL_THEME.brandName,
    logoUrl: theme.logoUrl,
    primaryColor: theme.primaryColor || FIELDGRID_CLEAN_OPS_EMAIL_THEME.primaryColor,
    accentColor: theme.accentColor || FIELDGRID_CLEAN_OPS_EMAIL_THEME.accentColor,
    backgroundColor: theme.backgroundColor || FIELDGRID_CLEAN_OPS_EMAIL_THEME.backgroundColor,
    surfaceColor: theme.surfaceColor || FIELDGRID_CLEAN_OPS_EMAIL_THEME.surfaceColor,
    textColor: theme.textColor || FIELDGRID_CLEAN_OPS_EMAIL_THEME.textColor,
    mutedColor: theme.mutedColor || FIELDGRID_CLEAN_OPS_EMAIL_THEME.mutedColor,
    borderColor: "#E4E8EC",
    buttonTextColor: "#FFFFFF",
    footerText: theme.emailFooterText || FIELDGRID_CLEAN_OPS_EMAIL_THEME.footerText,
    signature: theme.emailSignature || FIELDGRID_CLEAN_OPS_EMAIL_THEME.signature,
  };
}

export function getDefaultEmailTheme(): EmailTheme {
  return { ...FIELDGRID_CLEAN_OPS_EMAIL_THEME };
}

export async function getEffectiveEmailTheme(tenantId?: string | null): Promise<EmailTheme> {
  const theme = await getEffectiveBrandTheme(tenantId ?? null);
  return emailThemeFromBrandTheme(theme);
}

function validateTemplateTokens(definition: EmailTemplateDefinition): void {
  const allowed = new Set([
    ...definition.requiredVariables,
    ...definition.optionalVariables,
    "brandName",
    "platformName",
  ]);
  const templateParts = [
    definition.subject,
    definition.preheader,
    definition.headline,
    definition.footerNote ?? "",
    ...definition.intro,
    ...(definition.detailRows ?? []).flatMap((row) => [row.label, row.value]),
    definition.cta?.label ?? "",
    definition.cta?.href ?? "",
    definition.secondaryLink?.label ?? "",
    definition.secondaryLink?.href ?? "",
  ];
  const unknown = templateParts
    .flatMap(extractTokens)
    .filter((token) => !allowed.has(token));

  if (unknown.length > 0) {
    throw new EmailTemplateValidationError(
      definition.key,
      `Template ${definition.key} gebruikt onbekende variabele(n): ${[...new Set(unknown)].join(", ")}.`,
    );
  }
}

function validateVariables(definition: EmailTemplateDefinition, variables: EmailTemplateVariables): void {
  validateTemplateTokens(definition);
  const missing = definition.requiredVariables.filter((key) => !nonEmpty(variables[key]));
  if (missing.length > 0) {
    throw new EmailTemplateValidationError(
      definition.key,
      `Template ${definition.key} mist verplichte variabele(n): ${missing.join(", ")}.`,
      missing,
    );
  }
}

function applyTemplateOverride(
  definition: EmailTemplateDefinition,
  override: {
    subjectTemplate: string | null;
    preheaderTemplate: string | null;
    headlineTemplate: string | null;
    introTemplate: string | null;
    ctaLabelTemplate: string | null;
    ctaUrlTemplate: string | null;
    footerNoteTemplate: string | null;
  } | null,
): EmailTemplateDefinition {
  if (!override) return definition;

  const overridden: EmailTemplateDefinition = {
    ...definition,
    subject: override.subjectTemplate?.trim() || definition.subject,
    preheader: override.preheaderTemplate?.trim() || definition.preheader,
    headline: override.headlineTemplate?.trim() || definition.headline,
    intro: override.introTemplate?.trim()
      ? override.introTemplate.split(/\n\s*\n/gu).map((part) => part.trim()).filter(Boolean)
      : definition.intro,
    cta: definition.cta
      ? {
          ...definition.cta,
          label: override.ctaLabelTemplate?.trim() || definition.cta.label,
          href: override.ctaUrlTemplate?.trim() || definition.cta.href,
        }
      : definition.cta,
    footerNote: override.footerNoteTemplate?.trim() || definition.footerNote,
  };

  validateTemplateTokens(overridden);
  return overridden;
}

async function getTenantTemplateOverride(tenantId: string | null | undefined, templateKey: EmailTemplateKey) {
  if (!tenantId) return null;

  const [row] = await db
    .select({
      subjectTemplate: tenantEmailTemplateOverridesTable.subjectTemplate,
      preheaderTemplate: tenantEmailTemplateOverridesTable.preheaderTemplate,
      headlineTemplate: tenantEmailTemplateOverridesTable.headlineTemplate,
      introTemplate: tenantEmailTemplateOverridesTable.introTemplate,
      ctaLabelTemplate: tenantEmailTemplateOverridesTable.ctaLabelTemplate,
      ctaUrlTemplate: tenantEmailTemplateOverridesTable.ctaUrlTemplate,
      footerNoteTemplate: tenantEmailTemplateOverridesTable.footerNoteTemplate,
    })
    .from(tenantEmailTemplateOverridesTable)
    .where(
      and(
        eq(tenantEmailTemplateOverridesTable.tenantId, tenantId),
        eq(tenantEmailTemplateOverridesTable.templateKey, templateKey),
        eq(tenantEmailTemplateOverridesTable.isEnabled, true),
      ),
    )
    .limit(1);

  return row ?? null;
}

function renderLink(
  link: EmailTemplateLink | undefined,
  variables: EmailTemplateVariables,
  linkKind: "primary" | "secondary",
): { html: string; text: string } {
  if (!link) return { html: "", text: "" };
  if (link.optionalVariable && !nonEmpty(variables[link.optionalVariable])) return { html: "", text: "" };

  const href = replaceTokens(link.href, variables, "url").trim();
  if (!isSafeUrl(href)) {
    if (link.optionalVariable) return { html: "", text: "" };
    throw new Error(`Onveilige of ontbrekende CTA URL voor templatevariabele ${link.href}.`);
  }

  const labelText = replaceTokens(link.label, variables, "text").trim();
  const labelHtml = replaceTokens(link.label, variables, "html").trim();

  if (linkKind === "secondary") {
    return {
      html: `<p style="margin:14px 0 0"><a href="${escapeHtml(href)}" style="color:inherit;text-decoration:underline;font-size:13px">${labelHtml}</a></p>`,
      text: `${labelText}: ${href}`,
    };
  }

  return {
    html: `<p style="margin:28px 0 8px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;background:#16A34A;background:${"var(--email-primary, #16A34A)"};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;line-height:1.2">${labelHtml}</a></p>`,
    text: `${labelText}: ${href}`,
  };
}

function renderDetails(
  rows: readonly EmailTemplateDetailRow[] | undefined,
  variables: EmailTemplateVariables,
): { html: string; text: string[] } {
  if (!rows?.length) return { html: "", text: [] };

  const visibleRows = rows.filter((row) => !row.optionalVariable || nonEmpty(variables[row.optionalVariable]));
  if (visibleRows.length === 0) return { html: "", text: [] };

  const textRows: string[] = [];
  const htmlRows = visibleRows.map((row) => {
    const label = replaceTokens(row.label, variables, "html");
    const textLabel = replaceTokens(row.label, variables, "text");
    const value = replaceTokens(row.value, variables, "html");
    const textValue = replaceTokens(row.value, variables, "text");
    textRows.push(`${textLabel}: ${textValue}`);
    const valueStyle = row.monospace
      ? "font-family:Consolas,Monaco,monospace;font-size:17px;letter-spacing:.08em;color:#18212B"
      : "font-weight:700;color:#18212B";
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #E4E8EC;color:#6B7280;font-size:13px;vertical-align:top">${label}</td>
        <td style="padding:10px 0;border-bottom:1px solid #E4E8EC;text-align:right;${valueStyle}">${value}</td>
      </tr>`;
  });

  return {
    html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:22px 0">${htmlRows.join("")}</table>`,
    text: textRows,
  };
}

function rememberRenderedEmail(rendered: RenderedEmail, variables: EmailTemplateVariables): RenderedEmail {
  renderedEmailRegistry.set(rendered.html, {
    templateKey: rendered.templateKey,
    variables: compactVariables(variables),
  });

  if (renderedEmailRegistry.size > MAX_RENDERED_EMAIL_REGISTRY_SIZE) {
    const firstKey = renderedEmailRegistry.keys().next().value as string | undefined;
    if (firstKey) renderedEmailRegistry.delete(firstKey);
  }

  return rendered;
}

export function consumeRenderedEmailMetadata(html: string): RenderedEmailMetadata | null {
  const metadata = renderedEmailRegistry.get(html) ?? null;
  if (metadata) renderedEmailRegistry.delete(html);
  return metadata;
}

function renderTemplateWithTheme(
  definition: EmailTemplateDefinition,
  variables: EmailTemplateVariables,
  theme: EmailTheme,
): RenderedEmail {
  const inputVariables = compactVariables(variables);
  const mergedVariables: EmailTemplateVariables = {
    brandName: theme.brandName,
    platformName: "Fieldgrid",
    ...inputVariables,
    notificationPreheader: inputVariables.notificationPreheader || inputVariables.notificationBody,
    ctaLabel: inputVariables.ctaLabel || "Open portaal",
  };

  validateVariables(definition, mergedVariables);

  const subject = plainText(replaceTokens(definition.subject, mergedVariables, "text"));
  const preheader = plainText(replaceTokens(definition.preheader, mergedVariables, "text"));
  const headline = replaceTokens(definition.headline, mergedVariables, "html");
  const bodyHtml = definition.intro
    .map((line) => `<p style="margin:0 0 16px">${replaceTokens(line, mergedVariables, "html")}</p>`)
    .join("");
  const bodyText = definition.intro.map((line) => replaceTokens(line, mergedVariables, "text"));
  const details = renderDetails(definition.detailRows, mergedVariables);
  const primaryLink = renderLink(definition.cta, mergedVariables, "primary");
  const secondaryLink = renderLink(definition.secondaryLink, mergedVariables, "secondary");
  const footerNoteHtml = definition.footerNote
    ? `<p style="margin:18px 0 0;color:${theme.mutedColor};font-size:13px;line-height:1.6">${replaceTokens(definition.footerNote, mergedVariables, "html")}</p>`
    : "";
  const footerNoteText = definition.footerNote ? replaceTokens(definition.footerNote, mergedVariables, "text") : "";
  const signatureHtml = textToHtml(theme.signature);
  const footerHtml = textToHtml(theme.footerText);
  const logoHtml = theme.logoUrl
    ? `<img src="${escapeHtml(theme.logoUrl)}" alt="${escapeHtml(theme.brandName)}" style="display:block;max-height:44px;max-width:190px">`
    : `<div style="font-size:20px;line-height:1.2;font-weight:800;color:${theme.textColor}">${escapeHtml(theme.brandName)}</div>`;

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${theme.backgroundColor};font-family:Arial,Helvetica,sans-serif;color:${theme.textColor}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${theme.backgroundColor};padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:${theme.surfaceColor};border:1px solid ${theme.borderColor};border-radius:8px;overflow:hidden">
          <tr>
            <td style="padding:28px 30px 10px">
              ${logoHtml}
              <div style="margin-top:18px;height:3px;width:68px;background:${theme.primaryColor};border-radius:999px"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 30px 30px">
              <h1 style="margin:0 0 18px;color:${theme.textColor};font-size:24px;line-height:1.25;font-weight:800">${headline}</h1>
              <div style="font-size:15px;line-height:1.72;color:${theme.textColor}">
                ${bodyHtml}
                ${details.html}
                ${primaryLink.html.replace("var(--email-primary, #16A34A)", theme.primaryColor)}
                ${secondaryLink.html}
                ${footerNoteHtml}
                <div style="margin-top:26px;padding-top:18px;border-top:1px solid ${theme.borderColor};color:${theme.mutedColor};font-size:14px;line-height:1.6">${signatureHtml}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:${theme.backgroundColor};border-top:1px solid ${theme.borderColor};padding:18px 30px;color:${theme.mutedColor};font-size:12px;line-height:1.6">
              ${footerHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = plainText(
    [
      subject,
      preheader,
      "",
      ...bodyText,
      "",
      ...details.text,
      primaryLink.text,
      secondaryLink.text,
      footerNoteText,
      "",
      theme.signature,
      "",
      theme.footerText,
    ]
      .filter((part) => typeof part === "string" && part.trim())
      .join("\n"),
  );

  return {
    templateKey: definition.key,
    subject,
    html,
    text,
    variablesUsed: [...new Set([...definition.requiredVariables, ...definition.optionalVariables])],
  };
}

export function renderEmailTemplatePreview(input: {
  templateKey: EmailTemplateKey;
  variables: EmailTemplateVariables;
  theme?: EmailTheme | null;
}): RenderedEmail {
  const definition = EMAIL_TEMPLATES[input.templateKey];
  const rendered = renderTemplateWithTheme(definition, input.variables, input.theme ?? getDefaultEmailTheme());
  return rememberRenderedEmail(rendered, input.variables);
}

export async function renderEmailTemplate(input: EmailTemplateRenderInput): Promise<RenderedEmail> {
  const definition = EMAIL_TEMPLATES[input.templateKey];
  const [theme, override] = await Promise.all([
    input.theme ? Promise.resolve(input.theme) : getEffectiveEmailTheme(input.tenantId ?? null),
    getTenantTemplateOverride(input.tenantId ?? null, input.templateKey),
  ]);
  const effectiveDefinition = applyTemplateOverride(definition, override);
  const rendered = renderTemplateWithTheme(effectiveDefinition, input.variables, theme);
  return rememberRenderedEmail(rendered, input.variables);
}

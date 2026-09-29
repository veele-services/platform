export type TemplateKey = "invoice" | "quote" | "workorder" | "schedule";
export type TemplateChannel = "email" | "push";

export type TemplateDefinition = {
  key: TemplateKey;
  title: string;
  channel: TemplateChannel;
  description: string;
  subject: string;
  body: string;
  tokens: readonly TemplateToken[];
};

export type TemplateToken =
  | "bedrijfsnaam"
  | "klantnaam"
  | "factuurnummer"
  | "betaallink"
  | "offertelink"
  | "bonnummer"
  | "datum"
  | "locatie";

export type TemplateValues = Partial<Record<TemplateToken, string>>;

export const FIELDGRID_PRIMARY = "#222C35";
export const FIELDGRID_SECONDARY = "#41AC42";

export const TEMPLATE_CATALOG: readonly TemplateDefinition[] = [
  {
    key: "invoice",
    title: "Factuur verzonden",
    channel: "email",
    description: "Bij verzending van een definitieve factuur.",
    subject: "Factuur {factuurnummer} van {bedrijfsnaam}",
    body: "Beste {klantnaam},\n\nBijgevoegd vindt u factuur {factuurnummer}. U kunt deze veilig betalen met de knop hieronder.\n\nMet vriendelijke groet,\n{bedrijfsnaam}",
    tokens: ["bedrijfsnaam", "klantnaam", "factuurnummer", "betaallink"],
  },
  {
    key: "workorder",
    title: "Nieuwe werkbon",
    channel: "push",
    description: "Wanneer planning een werkbon vrijgeeft.",
    subject: "Nieuwe werkbon",
    body: "Er staat een nieuwe werkbon voor {datum} bij {locatie} voor je klaar.",
    tokens: ["bedrijfsnaam", "bonnummer", "datum", "locatie"],
  },
  {
    key: "schedule",
    title: "Planning gewijzigd",
    channel: "push",
    description: "Bij een relevante wijziging in de dagplanning.",
    subject: "Je planning is gewijzigd",
    body: "De planning van werkbon {bonnummer} is aangepast. Bekijk de bijgewerkte tijden in de app.",
    tokens: ["bedrijfsnaam", "bonnummer", "datum", "locatie"],
  },
  {
    key: "quote",
    title: "Prijsopgave",
    channel: "email",
    description: "Wanneer de klant een prijsopgave ontvangt.",
    subject: "Uw prijsopgave van {bedrijfsnaam}",
    body: "Beste {klantnaam},\n\nUw prijsopgave staat klaar. Bekijk de werkzaamheden en geef uw akkoord via de knop hieronder.\n\nMet vriendelijke groet,\n{bedrijfsnaam}",
    tokens: ["bedrijfsnaam", "klantnaam", "offertelink"],
  },
] as const;

export const PREVIEW_VALUES: Record<TemplateToken, string> = {
  bedrijfsnaam: "Voorbeeldorganisatie",
  klantnaam: "Restaurant De Pier",
  factuurnummer: "FACT-2026-00481",
  betaallink: "https://voorbeeld.invalid/betalen",
  offertelink: "https://voorbeeld.invalid/prijsopgave",
  bonnummer: "WB-2026-00581",
  datum: "30 september 2026",
  locatie: "Strandweg 18, Den Haag",
};

export function templateDefinition(key: TemplateKey): TemplateDefinition {
  const definition = TEMPLATE_CATALOG.find((item) => item.key === key);
  if (!definition) throw new Error("Onbekend berichttemplate");
  return definition;
}

export function templateTokens(value: string): string[] {
  return value.match(/\{[a-z]+\}/g) ?? [];
}

export function validateTemplateDraft(key: TemplateKey, subject: string, body: string): string | null {
  const definition = templateDefinition(key);
  const normalizedSubject = subject.trim();
  const normalizedBody = body.trim();
  if (!normalizedSubject || normalizedSubject.length > 200 || /[\r\n]/.test(normalizedSubject)) {
    return definition.channel === "email" ? "Gebruik een onderwerp van maximaal 200 tekens zonder regelafbreking." : "Gebruik een titel van maximaal 200 tekens zonder regelafbreking.";
  }
  if (!normalizedBody || normalizedBody.length > 6000) return "Gebruik een bericht van maximaal 6000 tekens.";
  const allowed = new Set(definition.tokens.map((token) => `{${token}}`));
  const invalid = [...new Set([...templateTokens(subject), ...templateTokens(body)].filter((token) => !allowed.has(token)))];
  return invalid.length ? `Onbekende variabele: ${invalid[0]}` : null;
}

export function renderTemplateText(value: string, values: TemplateValues, strict = true): string {
  return value.replace(/\{([a-z]+)\}/g, (whole, token: string) => {
    const replacement = values[token as TemplateToken];
    if (replacement !== undefined && replacement !== "") return replacement;
    if (strict) throw new Error(`Ontbrekende berichtvariabele: {${token}}`);
    return whole;
  });
}

export function renderPlainEmail(input: {
  subject: string;
  body: string;
  values: TemplateValues;
  targetUrl: string;
  targetLabel: string;
}) {
  return {
    subject: renderTemplateText(input.subject, input.values),
    text: `${renderTemplateText(input.body, input.values)}\n\n${input.targetLabel}: ${input.targetUrl}`,
  };
}

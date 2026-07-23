import type {
  WebsiteEditorSectionKey,
  WebsiteRichTextDocument,
  WebsiteSection,
} from "@workspace/db";

export const EMPTY_RICH_TEXT_DOCUMENT: Extract<
  WebsiteRichTextDocument,
  { schemaVersion: 2 }
> = {
  type: "doc",
  schemaVersion: 2,
  content: [{ type: "paragraph", content: [] }],
};

export const WEBSITE_SECTION_LABELS: Record<WebsiteEditorSectionKey, string> = {
  hero: "Intro / hero",
  trust_bar: "Vertrouwen",
  services_grid: "Diensten",
  feature_grid: "Kenmerken",
  process_steps: "Werkwijze",
  testimonials: "Klantverhalen",
  faq: "Veelgestelde vragen",
  cta_banner: "Actieblok",
  contact_form: "Contactformulier",
  rich_text: "Vrije tekst",
};

export function createDefaultWebsiteSection(
  type: WebsiteEditorSectionKey,
  id: string,
): WebsiteSection {
  const identity = { id, type, schemaVersion: 1 as const, visible: true };
  switch (type) {
    case "hero":
      return {
        ...identity,
        type,
        variant: "split",
        content: {
          title: "Een heldere titel",
          subtitle: "Vertel kort wat uw organisatie voor de klant betekent.",
          badges: [],
        },
      };
    case "trust_bar":
      return {
        ...identity,
        type,
        variant: "short_points",
        content: {
          items: [
            { name: "Betrouwbaar", decorative: false },
            { name: "Vakkundig", decorative: false },
          ],
          shortClaims: [],
        },
      };
    case "services_grid":
      return {
        ...identity,
        type,
        variant: "cards",
        content: {
          title: "Onze diensten",
          services: [
            { title: "Dienst één", description: "Beschrijf deze dienst." },
            { title: "Dienst twee", description: "Beschrijf deze dienst." },
          ],
        },
      };
    case "feature_grid":
      return {
        ...identity,
        type,
        variant: "three_column",
        content: {
          title: "Waarom voor ons kiezen",
          features: [
            {
              title: "Duidelijke afspraken",
              description: "Licht dit voordeel kort toe.",
              icon: "badge_check",
            },
            {
              title: "Vakkundige uitvoering",
              description: "Licht dit voordeel kort toe.",
              icon: "tools",
            },
          ],
        },
      };
    case "process_steps":
      return {
        ...identity,
        type,
        variant: "numbered",
        content: {
          title: "Zo werken wij",
          steps: [
            { title: "Kennismaken", description: "Omschrijf de eerste stap." },
            { title: "Uitvoeren", description: "Omschrijf de volgende stap." },
          ],
        },
      };
    case "testimonials":
      return {
        ...identity,
        type,
        variant: "cards",
        content: {
          title: "Wat klanten zeggen",
          testimonials: [
            {
              quote: "Voeg hier een controleerbare klantervaring toe.",
              name: "Naam klant",
            },
          ],
        },
      };
    case "faq":
      return {
        ...identity,
        type,
        variant: "accordion",
        content: {
          title: "Veelgestelde vragen",
          items: [
            {
              question: "Wat wilt u weten?",
              answer: EMPTY_RICH_TEXT_DOCUMENT,
            },
          ],
          schemaEligible: false,
        },
      };
    case "cta_banner":
      return {
        ...identity,
        type,
        variant: "solid",
        content: {
          title: "Klaar om te beginnen?",
          subtitle: "Neem contact op voor een vrijblijvend gesprek.",
          primaryAction: {
            kind: "path",
            label: "Neem contact op",
            path: "/contact",
          },
        },
      };
    case "contact_form":
      return {
        ...identity,
        type,
        variant: "split_contact",
        content: {
          title: "Neem contact op",
          formId: null,
          showContactDetails: true,
          showOpeningHours: false,
          showMap: false,
        },
      };
    case "rich_text":
      return {
        ...identity,
        type,
        variant: "default",
        content: { body: EMPTY_RICH_TEXT_DOCUMENT },
      };
  }
}

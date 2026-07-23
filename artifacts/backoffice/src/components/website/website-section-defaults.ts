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
  emergency_hero: "Spoedhero",
  trust_bar: "Vertrouwen",
  services_grid: "Diensten",
  feature_grid: "Kenmerken",
  process_steps: "Werkwijze",
  testimonials: "Klantverhalen",
  faq: "Veelgestelde vragen",
  cta_banner: "Actieblok",
  contact_form: "Contactformulier",
  service_area: "Werkgebied",
  project_showcase: "Projecten",
  blog_preview: "Blogpreview",
  rich_text: "Vrije tekst",
  stats: "Kengetallen",
  team: "Team",
  logo_wall: "Logo's en certificeringen",
};

export function createDefaultWebsiteSection(
  type: WebsiteEditorSectionKey,
  id: string,
): WebsiteSection {
  const identity = {
    id,
    type,
    schemaVersion: 1 as const,
    visible: true,
    requiresReview: true,
  };
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
    case "emergency_hero":
      return {
        ...identity,
        type,
        variant: "urgent",
        content: {
          title: "Direct contact bij een storing",
          subtitle: "Beschrijf waarvoor en wanneer klanten kunnen bellen.",
          phoneAction: {
            kind: "phone",
            label: "Bel de storingsdienst",
            phone: "+31100000000",
          },
          badges: [],
          availabilityNotice:
            "Vul de actuele bereikbaarheid in voordat u deze sectie publiceert.",
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
    case "service_area":
      return {
        ...identity,
        type,
        variant: "grid",
        content: {
          title: "Ons werkgebied",
          areas: ["Plaats of regio"],
        },
      };
    case "project_showcase":
      return {
        ...identity,
        type,
        variant: "editorial",
        content: {
          title: "Projecten",
          projects: [
            {
              title: "Nieuw project",
              description:
                "Beschrijf uitsluitend een project dat gepubliceerd mag worden.",
            },
          ],
        },
      };
    case "blog_preview":
      return {
        ...identity,
        type,
        variant: "cards",
        content: {
          title: "Kennis en nieuws",
          limit: 3,
          action: {
            kind: "path",
            label: "Bekijk alle berichten",
            path: "/blog",
          },
        },
      };
    case "rich_text":
      return {
        ...identity,
        type,
        variant: "default",
        content: { body: EMPTY_RICH_TEXT_DOCUMENT },
      };
    case "stats":
      return {
        ...identity,
        type,
        variant: "inline",
        content: {
          items: [
            {
              value: "Waarde",
              label: "Controleerbaar kengetal",
              sourceNote: "Noteer de interne of openbare bron en peildatum.",
            },
          ],
        },
      };
    case "team":
      return {
        ...identity,
        type,
        variant: "cards",
        visible: false,
        content: {
          title: "Ons team",
          subtitle:
            "Voeg alleen teamleden toe die publicatietoestemming hebben gegeven.",
          members: [],
        },
      };
    case "logo_wall":
      return {
        ...identity,
        type,
        variant: "logos",
        content: {
          title: "Partners en certificeringen",
          items: [
            {
              name: "Naam toevoegen",
              description:
                "Controleer toestemming, geldigheid en publicatierecht.",
            },
          ],
        },
      };
  }
}

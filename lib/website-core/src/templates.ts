import { z } from "zod/v4";
import {
  WEBSITE_EDITOR_SECTION_KEYS,
  WEBSITE_MVP_SECTION_KEYS,
  WEBSITE_SECTION_REGISTRY,
  websiteSectionSchema,
  type WebsiteEditorSectionKey,
  type WebsiteRichTextDocument,
  type WebsiteSection,
} from "./sections";
import { websiteThemeSchema, type WebsiteTheme } from "./site";

export const WEBSITE_TEMPLATE_KEYS = [
  "trust_conversion",
  "premium_local_authority",
  "fast_service_emergency",
  "multi_service_company",
  "content_seo_growth",
] as const;

export const WEBSITE_PAGE_TYPES = [
  "home",
  "standard",
  "service",
  "contact",
  "blog_index",
  "custom",
  "legal",
  "area",
] as const;

export type WebsiteTemplateKey = (typeof WEBSITE_TEMPLATE_KEYS)[number];
export type WebsitePageType = (typeof WEBSITE_PAGE_TYPES)[number];

export type WebsiteTemplatePage = {
  key: string;
  title: string;
  path: string;
  pageType: WebsitePageType;
  sections: WebsiteSection[];
};

export type WebsiteTemplateDefinition = {
  key: WebsiteTemplateKey;
  version: number;
  label: string;
  description: string;
  audience: readonly string[];
  goal: string;
  previewMediaKey: string;
  defaultTheme: WebsiteTheme;
  allowedSections: readonly WebsiteEditorSectionKey[];
  pages: readonly WebsiteTemplatePage[];
  navigation: readonly {
    label: string;
    pageKey: string;
    location: "header" | "footer_primary";
  }[];
};

const sectionId = (suffix: string) =>
  `10000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

export const TRUST_CONVERSION_TEMPLATE_V1 = {
  key: "trust_conversion",
  version: 1,
  label: "Trust & Conversion",
  description:
    "Betrouwbare, professionele en conversiegerichte website voor lokale dienstverleners.",
  audience: [
    "Loodgieters",
    "Elektriciens",
    "Installateurs",
    "Algemene woningservice",
  ],
  goal: "Lokale bezoekers vertrouwen geven en naar contact converteren.",
  previewMediaKey: "trust-conversion-v1",
  defaultTheme: {
    schemaVersion: 1,
    colors: {
      background: "#FFFFFF",
      foreground: "#081D3A",
      primary: "#007F7C",
      primaryForeground: "#FFFFFF",
      accent: "#E0FAFB",
      accentForeground: "#081D3A",
    },
    headingFont: "manrope",
    bodyFont: "inter",
    radius: "medium",
    spacing: "comfortable",
    contentWidth: "standard",
    buttonStyle: "solid",
    surfaceStyle: "bordered",
    logoMediaId: null,
    faviconMediaId: null,
  },
  allowedSections: WEBSITE_MVP_SECTION_KEYS,
  pages: [
    {
      key: "home",
      title: "Home",
      path: "/",
      pageType: "home",
      sections: [
        {
          id: sectionId("1"),
          type: "hero",
          schemaVersion: 1,
          variant: "split",
          visible: true,
          content: {
            eyebrow: "Vakmanschap bij u in de buurt",
            title: "Betrouwbare service wanneer het telt",
            subtitle:
              "Vervang deze tekst door een heldere belofte aan uw klant.",
            primaryAction: {
              kind: "path",
              label: "Vraag een offerte aan",
              path: "/contact",
            },
            secondaryAction: {
              kind: "phone",
              label: "Bel direct",
              phone: "+31100000000",
            },
            badges: ["Duidelijke afspraken", "Vakkundige uitvoering"],
          },
        },
        {
          id: sectionId("2"),
          type: "trust_bar",
          schemaVersion: 1,
          variant: "short_points",
          visible: true,
          content: {
            items: [
              {
                name: "Betrouwbaar",
                description: "Vervang dit bewijs met een controleerbare claim.",
                decorative: false,
              },
              {
                name: "Vakkundig",
                description: "Vertel waarom klanten voor uw team kiezen.",
                decorative: false,
              },
            ],
            shortClaims: [],
          },
        },
        {
          id: sectionId("3"),
          type: "services_grid",
          schemaVersion: 1,
          variant: "cards",
          visible: true,
          content: {
            title: "Onze diensten",
            subtitle: "Vervang de voorbeelden door uw belangrijkste diensten.",
            services: [
              {
                title: "Dienst één",
                description: "Beschrijf kort wat de klant mag verwachten.",
                icon: "tools",
              },
              {
                title: "Dienst twee",
                description: "Beschrijf kort wat de klant mag verwachten.",
                icon: "home",
              },
              {
                title: "Dienst drie",
                description: "Beschrijf kort wat de klant mag verwachten.",
                icon: "shield_check",
              },
            ],
          },
        },
        {
          id: sectionId("4"),
          type: "feature_grid",
          schemaVersion: 1,
          variant: "three_column",
          visible: true,
          content: {
            title: "Waarom klanten voor ons kiezen",
            features: [
              {
                title: "Heldere afspraken",
                description: "Leg concreet uit hoe u verwachtingen waarmaakt.",
                icon: "calendar_check",
              },
              {
                title: "Vakkundig team",
                description:
                  "Onderbouw ervaring en kwaliteit zonder onbewezen claims.",
                icon: "users",
              },
              {
                title: "Goede communicatie",
                description:
                  "Vertel hoe klanten tijdens het werk op de hoogte blijven.",
                icon: "phone",
              },
            ],
          },
        },
        {
          id: sectionId("5"),
          type: "process_steps",
          schemaVersion: 1,
          variant: "numbered",
          visible: true,
          content: {
            title: "Zo werkt het",
            steps: [
              {
                title: "Neem contact op",
                description: "Vertel kort hoe de aanvraag wordt ontvangen.",
              },
              {
                title: "We maken een afspraak",
                description: "Leg uit hoe planning en voorbereiding verlopen.",
              },
              {
                title: "We voeren het werk uit",
                description: "Beschrijf de uitvoering en oplevering.",
              },
            ],
          },
        },
        {
          id: sectionId("6"),
          type: "testimonials",
          schemaVersion: 1,
          variant: "cards",
          visible: true,
          content: {
            title: "Ervaringen van klanten",
            testimonials: [
              {
                quote:
                  "Vervang dit voorbeeld uitsluitend door een echte, goedgekeurde klantreactie.",
                name: "Voorbeeldklant",
              },
            ],
          },
        },
        {
          id: sectionId("7"),
          type: "faq",
          schemaVersion: 1,
          variant: "accordion",
          visible: true,
          content: {
            title: "Veelgestelde vragen",
            items: [
              {
                question: "In welke regio werken jullie?",
                answer: "Beschrijf hier het werkgebied.",
              },
              {
                question: "Hoe kan ik een afspraak maken?",
                answer: "Beschrijf hier de contact- en planningsroute.",
              },
            ],
            schemaEligible: false,
          },
        },
        {
          id: sectionId("8"),
          type: "cta_banner",
          schemaVersion: 1,
          variant: "solid",
          visible: true,
          content: {
            title: "Klaar om uw aanvraag te bespreken?",
            subtitle: "Neem contact op voor een duidelijke volgende stap.",
            primaryAction: {
              kind: "path",
              label: "Neem contact op",
              path: "/contact",
            },
          },
        },
        {
          id: sectionId("9"),
          type: "contact_form",
          schemaVersion: 1,
          variant: "split_contact",
          visible: true,
          content: {
            title: "Neem contact op",
            subtitle: "Koppel vóór publicatie een actief formulier.",
            formId: null,
            showContactDetails: true,
            showOpeningHours: false,
            showMap: false,
          },
        },
      ],
    },
    {
      key: "services",
      title: "Diensten",
      path: "/diensten",
      pageType: "service",
      sections: [],
    },
    {
      key: "about",
      title: "Over ons",
      path: "/over-ons",
      pageType: "standard",
      sections: [],
    },
    {
      key: "reviews",
      title: "Reviews",
      path: "/reviews",
      pageType: "standard",
      sections: [],
    },
    {
      key: "blog",
      title: "Blog",
      path: "/blog",
      pageType: "blog_index",
      sections: [],
    },
    {
      key: "contact",
      title: "Contact",
      path: "/contact",
      pageType: "contact",
      sections: [],
    },
  ],
  navigation: [
    { label: "Home", pageKey: "home", location: "header" },
    { label: "Diensten", pageKey: "services", location: "header" },
    { label: "Over ons", pageKey: "about", location: "header" },
    { label: "Reviews", pageKey: "reviews", location: "header" },
    { label: "Blog", pageKey: "blog", location: "header" },
    { label: "Contact", pageKey: "contact", location: "header" },
  ],
} as const satisfies WebsiteTemplateDefinition;

const presetSectionId = (template: number, section: number) =>
  `${template}0000000-0000-4000-8000-${String(section).padStart(12, "0")}`;

const emptyRichText: WebsiteRichTextDocument = {
  type: "doc",
  schemaVersion: 2,
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Vervang deze voorbeeldtekst door uw eigen, gecontroleerde verhaal.",
        },
      ],
    },
  ],
};

export const PREMIUM_LOCAL_AUTHORITY_TEMPLATE_V1 = {
  key: "premium_local_authority",
  version: 1,
  label: "Premium Local Authority",
  description:
    "Een redactionele, vertrouwenwekkende website voor specialistisch vakmanschap.",
  audience: [
    "Premium renovatie",
    "Exclusieve tuinaanleg",
    "Specialistische installatie",
    "Vastgoedverbetering",
  ],
  goal: "Hoogwaardig vakmanschap aantoonbaar maken en adviesgesprekken winnen.",
  previewMediaKey: "premium-local-authority-v1",
  defaultTheme: {
    schemaVersion: 1,
    colors: {
      background: "#FCFBF8",
      foreground: "#1D2924",
      primary: "#245747",
      primaryForeground: "#FFFFFF",
      accent: "#E8E2D6",
      accentForeground: "#1D2924",
    },
    headingFont: "manrope",
    bodyFont: "source_sans_3",
    radius: "small",
    spacing: "spacious",
    contentWidth: "wide",
    buttonStyle: "outline",
    surfaceStyle: "flat",
    logoMediaId: null,
    faviconMediaId: null,
  },
  allowedSections: [
    "hero",
    "trust_bar",
    "services_grid",
    "project_showcase",
    "rich_text",
    "logo_wall",
    "testimonials",
    "cta_banner",
    "contact_form",
  ],
  pages: [
    {
      key: "home",
      title: "Home",
      path: "/",
      pageType: "home",
      sections: [
        {
          id: presetSectionId(2, 1),
          type: "hero",
          schemaVersion: 1,
          variant: "visual",
          visible: true,
          content: {
            eyebrow: "Specialistisch vakmanschap",
            title: "Een resultaat dat past bij uw woning",
            subtitle:
              "Vervang deze tekst door uw aanpak, specialisme en werkgebied.",
            primaryAction: {
              kind: "path",
              label: "Plan een adviesgesprek",
              path: "/contact",
            },
            badges: [],
          },
        },
        {
          id: presetSectionId(2, 2),
          type: "trust_bar",
          schemaVersion: 1,
          variant: "logos",
          visible: true,
          content: {
            items: [
              {
                name: "Certificering toevoegen",
                description: "Gebruik alleen een actuele, controleerbare bron.",
                decorative: false,
              },
              {
                name: "Garantievoorwaarde toevoegen",
                description: "Beschrijf uitsluitend wat contractueel geldt.",
                decorative: false,
              },
            ],
            shortClaims: [],
          },
        },
        {
          id: presetSectionId(2, 3),
          type: "services_grid",
          schemaVersion: 1,
          variant: "editorial",
          visible: true,
          content: {
            title: "Onze specialismen",
            subtitle:
              "Beschrijf de diensten waarop uw team aantoonbaar sterk is.",
            services: [
              {
                title: "Specialisme één",
                description:
                  "Omschrijf de waarde en het resultaat voor de klant.",
              },
              {
                title: "Specialisme twee",
                description:
                  "Omschrijf de waarde en het resultaat voor de klant.",
              },
            ],
          },
        },
        {
          id: presetSectionId(2, 4),
          type: "project_showcase",
          schemaVersion: 1,
          variant: "editorial",
          visible: true,
          content: {
            title: "Geselecteerde projecten",
            subtitle:
              "Gebruik uitsluitend projecten en media waarvoor publicatierechten zijn bevestigd.",
            projects: [
              {
                title: "Voorbeeldproject",
                description:
                  "Vervang dit voorbeeld door een echt project met toestemming.",
              },
            ],
          },
        },
        {
          id: presetSectionId(2, 5),
          type: "rich_text",
          schemaVersion: 1,
          variant: "narrow",
          visible: true,
          content: { title: "Ons verhaal", body: emptyRichText },
        },
        {
          id: presetSectionId(2, 6),
          type: "logo_wall",
          schemaVersion: 1,
          variant: "certifications",
          visible: true,
          content: {
            title: "Certificeringen en partners",
            items: [
              {
                name: "Controleerbare certificering",
                description:
                  "Voeg alleen een actuele certificering met publicatierecht toe.",
              },
            ],
          },
        },
        {
          id: presetSectionId(2, 7),
          type: "testimonials",
          schemaVersion: 1,
          variant: "featured",
          visible: true,
          content: {
            title: "Ervaringen van opdrachtgevers",
            testimonials: [
              {
                quote:
                  "Vervang dit voorbeeld uitsluitend door een goedgekeurde klantervaring.",
                name: "Voorbeeldopdrachtgever",
              },
            ],
          },
        },
        {
          id: presetSectionId(2, 8),
          type: "cta_banner",
          schemaVersion: 1,
          variant: "split",
          visible: true,
          content: {
            title: "Bespreek uw project",
            subtitle: "Plan een eerste adviesgesprek.",
            primaryAction: {
              kind: "path",
              label: "Neem contact op",
              path: "/contact",
            },
          },
        },
        {
          id: presetSectionId(2, 9),
          type: "contact_form",
          schemaVersion: 1,
          variant: "split_contact",
          visible: true,
          content: {
            title: "Neem contact op",
            formId: null,
            showContactDetails: true,
            showOpeningHours: false,
            showMap: false,
          },
        },
      ],
    },
    {
      key: "services",
      title: "Diensten",
      path: "/diensten",
      pageType: "service",
      sections: [],
    },
    {
      key: "projects",
      title: "Projecten",
      path: "/projecten",
      pageType: "standard",
      sections: [],
    },
    {
      key: "about",
      title: "Over ons",
      path: "/over-ons",
      pageType: "standard",
      sections: [],
    },
    {
      key: "blog",
      title: "Blog",
      path: "/blog",
      pageType: "blog_index",
      sections: [],
    },
    {
      key: "contact",
      title: "Contact",
      path: "/contact",
      pageType: "contact",
      sections: [],
    },
  ],
  navigation: [
    { label: "Home", pageKey: "home", location: "header" },
    { label: "Diensten", pageKey: "services", location: "header" },
    { label: "Projecten", pageKey: "projects", location: "header" },
    { label: "Over ons", pageKey: "about", location: "header" },
    { label: "Blog", pageKey: "blog", location: "header" },
    { label: "Contact", pageKey: "contact", location: "header" },
  ],
} as const satisfies WebsiteTemplateDefinition;

export const FAST_SERVICE_EMERGENCY_TEMPLATE_V1 = {
  key: "fast_service_emergency",
  version: 1,
  label: "Fast Service & Emergency",
  description:
    "Een mobiele, telefoongerichte website voor spoed- en storingsdiensten.",
  audience: [
    "Spoedloodgieters",
    "Slotenmakers",
    "Lek- en storingsdiensten",
    "Rioolservice",
  ],
  goal: "Een urgente bezoeker snel naar de juiste, eerlijke contactroute leiden.",
  previewMediaKey: "fast-service-emergency-v1",
  defaultTheme: {
    schemaVersion: 1,
    colors: {
      background: "#FFFFFF",
      foreground: "#10233F",
      primary: "#B42318",
      primaryForeground: "#FFFFFF",
      accent: "#FFF1E8",
      accentForeground: "#49130D",
    },
    headingFont: "manrope",
    bodyFont: "inter",
    radius: "medium",
    spacing: "compact",
    contentWidth: "standard",
    buttonStyle: "solid",
    surfaceStyle: "elevated",
    logoMediaId: null,
    faviconMediaId: null,
  },
  allowedSections: [
    "emergency_hero",
    "trust_bar",
    "services_grid",
    "service_area",
    "process_steps",
    "testimonials",
    "faq",
    "cta_banner",
    "contact_form",
  ],
  pages: [
    {
      key: "home",
      title: "Home",
      path: "/",
      pageType: "home",
      sections: [
        {
          id: presetSectionId(3, 1),
          type: "emergency_hero",
          schemaVersion: 1,
          variant: "urgent",
          visible: true,
          content: {
            eyebrow: "Hulp nodig?",
            title: "Direct contact bij een storing",
            subtitle:
              "Beschrijf welke meldingen u aanneemt en wanneer u bereikbaar bent.",
            phoneAction: {
              kind: "phone",
              label: "Bel de storingsdienst",
              phone: "+31100000000",
            },
            badges: [],
            availabilityNotice:
              "Vervang dit door uw actuele bereikbaarheid; claim geen 24/7-service zonder onderbouwing.",
          },
        },
        {
          id: presetSectionId(3, 2),
          type: "trust_bar",
          schemaVersion: 1,
          variant: "short_points",
          visible: true,
          content: {
            items: [
              {
                name: "Heldere bereikbaarheid",
                description:
                  "Publiceer actuele openingstijden en uitzonderingen.",
                decorative: false,
              },
              {
                name: "Duidelijke afspraken",
                description: "Licht kosten en vervolgstappen vooraf toe.",
                decorative: false,
              },
            ],
            shortClaims: [],
          },
        },
        {
          id: presetSectionId(3, 3),
          type: "services_grid",
          schemaVersion: 1,
          variant: "compact",
          visible: true,
          content: {
            title: "Waarmee kunnen we helpen?",
            services: [
              {
                title: "Storing één",
                description: "Omschrijf wanneer de klant contact moet opnemen.",
              },
              {
                title: "Storing twee",
                description: "Omschrijf wanneer de klant contact moet opnemen.",
              },
            ],
          },
        },
        {
          id: presetSectionId(3, 4),
          type: "service_area",
          schemaVersion: 1,
          variant: "grid",
          visible: true,
          content: {
            title: "Werkgebied",
            subtitle:
              "Noem alleen plaatsen waar uw dienst daadwerkelijk actief is.",
            areas: ["Plaats of regio toevoegen"],
          },
        },
        {
          id: presetSectionId(3, 5),
          type: "process_steps",
          schemaVersion: 1,
          variant: "numbered",
          visible: true,
          content: {
            title: "Wat gebeurt er na uw melding?",
            steps: [
              {
                title: "Situatie bespreken",
                description:
                  "We vragen naar de aard en urgentie van de melding.",
              },
              {
                title: "Vervolg afspreken",
                description:
                  "We spreken bereikbaarheid, kosten en de volgende stap af.",
              },
            ],
          },
        },
        {
          id: presetSectionId(3, 6),
          type: "testimonials",
          schemaVersion: 1,
          variant: "cards",
          visible: true,
          content: {
            title: "Klantervaringen",
            testimonials: [
              {
                quote:
                  "Vervang dit voorbeeld uitsluitend door een goedgekeurde klantervaring.",
                name: "Voorbeeldklant",
              },
            ],
          },
        },
        {
          id: presetSectionId(3, 7),
          type: "faq",
          schemaVersion: 1,
          variant: "accordion",
          visible: true,
          content: {
            title: "Veelgestelde vragen",
            items: [
              {
                question: "Wanneer zijn jullie bereikbaar?",
                answer: "Vul uw actuele bereikbaarheid en uitzonderingen in.",
              },
            ],
            schemaEligible: false,
          },
        },
        {
          id: presetSectionId(3, 8),
          type: "cta_banner",
          schemaVersion: 1,
          variant: "solid",
          visible: true,
          content: {
            title: "Een storing melden?",
            primaryAction: {
              kind: "phone",
              label: "Bel de storingsdienst",
              phone: "+31100000000",
            },
          },
        },
        {
          id: presetSectionId(3, 9),
          type: "contact_form",
          schemaVersion: 1,
          variant: "card",
          visible: true,
          content: {
            title: "Niet urgent? Stuur een bericht",
            formId: null,
            showContactDetails: true,
            showOpeningHours: true,
            showMap: false,
          },
        },
      ],
    },
    {
      key: "emergency",
      title: "Spoedservice",
      path: "/spoedservice",
      pageType: "service",
      sections: [],
    },
    {
      key: "services",
      title: "Diensten",
      path: "/diensten",
      pageType: "service",
      sections: [],
    },
    {
      key: "area",
      title: "Werkgebied",
      path: "/werkgebied",
      pageType: "area",
      sections: [],
    },
    {
      key: "reviews",
      title: "Reviews",
      path: "/reviews",
      pageType: "standard",
      sections: [],
    },
    {
      key: "contact",
      title: "Contact",
      path: "/contact",
      pageType: "contact",
      sections: [],
    },
  ],
  navigation: [
    { label: "Home", pageKey: "home", location: "header" },
    { label: "Spoedservice", pageKey: "emergency", location: "header" },
    { label: "Diensten", pageKey: "services", location: "header" },
    { label: "Werkgebied", pageKey: "area", location: "header" },
    { label: "Reviews", pageKey: "reviews", location: "header" },
    { label: "Contact", pageKey: "contact", location: "header" },
  ],
} as const satisfies WebsiteTemplateDefinition;

export const MULTI_SERVICE_COMPANY_TEMPLATE_V1 = {
  key: "multi_service_company",
  version: 1,
  label: "Multi-Service Company",
  description:
    "Een schaalbare bedrijfswebsite voor organisaties met meerdere diensten en sectoren.",
  audience: [
    "Facility services",
    "Allround onderhoud",
    "Schoonmaak en onderhoud",
    "Vastgoedservice",
  ],
  goal: "Meerdere dienstgroepen helder presenteren en zakelijke aanvragen winnen.",
  previewMediaKey: "multi-service-company-v1",
  defaultTheme: {
    schemaVersion: 1,
    colors: {
      background: "#FFFFFF",
      foreground: "#102A43",
      primary: "#065F74",
      primaryForeground: "#FFFFFF",
      accent: "#E6F6F8",
      accentForeground: "#102A43",
    },
    headingFont: "inter",
    bodyFont: "source_sans_3",
    radius: "small",
    spacing: "comfortable",
    contentWidth: "wide",
    buttonStyle: "solid",
    surfaceStyle: "bordered",
    logoMediaId: null,
    faviconMediaId: null,
  },
  allowedSections: [
    "hero",
    "services_grid",
    "feature_grid",
    "process_steps",
    "project_showcase",
    "team",
    "testimonials",
    "blog_preview",
    "cta_banner",
    "contact_form",
    "stats",
  ],
  pages: [
    {
      key: "home",
      title: "Home",
      path: "/",
      pageType: "home",
      sections: [
        {
          id: presetSectionId(4, 1),
          type: "hero",
          schemaVersion: 1,
          variant: "split",
          visible: true,
          content: {
            eyebrow: "Eén partner voor meerdere diensten",
            title: "Professionele service voor gebouw en organisatie",
            subtitle:
              "Vervang deze tekst door uw belangrijkste zakelijke propositie.",
            primaryAction: {
              kind: "path",
              label: "Vraag een gesprek aan",
              path: "/contact",
            },
            badges: [],
          },
        },
        {
          id: presetSectionId(4, 2),
          type: "services_grid",
          schemaVersion: 1,
          variant: "cards",
          visible: true,
          content: {
            title: "Onze dienstverlening",
            services: [
              {
                title: "Dienstgroep één",
                description:
                  "Beschrijf de werkzaamheden binnen deze categorie.",
              },
              {
                title: "Dienstgroep twee",
                description:
                  "Beschrijf de werkzaamheden binnen deze categorie.",
              },
            ],
          },
        },
        {
          id: presetSectionId(4, 3),
          type: "feature_grid",
          schemaVersion: 1,
          variant: "three_column",
          visible: true,
          content: {
            title: "Waarom organisaties voor ons kiezen",
            features: [
              {
                title: "Eén aanspreekpunt",
                description:
                  "Beschrijf hoe verantwoordelijkheden zijn ingericht.",
                icon: "users",
              },
              {
                title: "Planbare uitvoering",
                description:
                  "Beschrijf hoe planning en terugkoppeling verlopen.",
                icon: "calendar_check",
              },
            ],
          },
        },
        {
          id: presetSectionId(4, 4),
          type: "process_steps",
          schemaVersion: 1,
          variant: "timeline",
          visible: true,
          content: {
            title: "Van inventarisatie tot uitvoering",
            steps: [
              {
                title: "Inventariseren",
                description: "We brengen de locatie en behoefte in kaart.",
              },
              {
                title: "Uitvoeren en rapporteren",
                description:
                  "We voeren uit volgens de overeengekomen afspraken.",
              },
            ],
          },
        },
        {
          id: presetSectionId(4, 5),
          type: "project_showcase",
          schemaVersion: 1,
          variant: "cards",
          visible: true,
          content: {
            title: "Cases",
            projects: [
              {
                title: "Voorbeeldcase",
                description:
                  "Vervang dit voorbeeld door een aantoonbare case met toestemming.",
              },
            ],
          },
        },
        {
          id: presetSectionId(4, 6),
          type: "team",
          schemaVersion: 1,
          variant: "compact",
          visible: false,
          content: {
            title: "Ons team",
            subtitle:
              "Voeg teamleden pas toe nadat zij publicatietoestemming hebben gegeven.",
            members: [],
          },
        },
        {
          id: presetSectionId(4, 7),
          type: "testimonials",
          schemaVersion: 1,
          variant: "cards",
          visible: true,
          content: {
            title: "Ervaringen van opdrachtgevers",
            testimonials: [
              {
                quote:
                  "Vervang dit voorbeeld uitsluitend door een goedgekeurde ervaring.",
                name: "Voorbeeldopdrachtgever",
              },
            ],
          },
        },
        {
          id: presetSectionId(4, 8),
          type: "blog_preview",
          schemaVersion: 1,
          variant: "cards",
          visible: true,
          content: {
            title: "Kennis en nieuws",
            limit: 3,
            action: {
              kind: "path",
              label: "Bekijk alle berichten",
              path: "/blog",
            },
          },
        },
        {
          id: presetSectionId(4, 9),
          type: "cta_banner",
          schemaVersion: 1,
          variant: "split",
          visible: true,
          content: {
            title: "Uw servicevraag bespreken?",
            primaryAction: {
              kind: "path",
              label: "Neem contact op",
              path: "/contact",
            },
          },
        },
      ],
    },
    {
      key: "services",
      title: "Diensten",
      path: "/diensten",
      pageType: "service",
      sections: [],
    },
    {
      key: "sectors",
      title: "Sectoren",
      path: "/sectoren",
      pageType: "standard",
      sections: [],
    },
    {
      key: "cases",
      title: "Cases",
      path: "/cases",
      pageType: "standard",
      sections: [],
    },
    {
      key: "about",
      title: "Over ons",
      path: "/over-ons",
      pageType: "standard",
      sections: [],
    },
    {
      key: "blog",
      title: "Blog",
      path: "/blog",
      pageType: "blog_index",
      sections: [],
    },
    {
      key: "contact",
      title: "Contact",
      path: "/contact",
      pageType: "contact",
      sections: [],
    },
  ],
  navigation: [
    { label: "Home", pageKey: "home", location: "header" },
    { label: "Diensten", pageKey: "services", location: "header" },
    { label: "Sectoren", pageKey: "sectors", location: "header" },
    { label: "Cases", pageKey: "cases", location: "header" },
    { label: "Over ons", pageKey: "about", location: "header" },
    { label: "Blog", pageKey: "blog", location: "header" },
    { label: "Contact", pageKey: "contact", location: "header" },
  ],
} as const satisfies WebsiteTemplateDefinition;

export const CONTENT_SEO_GROWTH_TEMPLATE_V1 = {
  key: "content_seo_growth",
  version: 1,
  label: "Content & SEO Growth",
  description:
    "Een contentgerichte website voor gecontroleerde groei via diensten, regio's en kennis.",
  audience: [
    "Lokale dienstverleners",
    "Franchises",
    "Bedrijven met meerdere regio's",
    "Contentgedreven servicebedrijven",
  ],
  goal: "Organische vindbaarheid opbouwen zonder dunne of automatisch gegenereerde pagina's.",
  previewMediaKey: "content-seo-growth-v1",
  defaultTheme: {
    schemaVersion: 1,
    colors: {
      background: "#FFFFFF",
      foreground: "#172033",
      primary: "#3157A4",
      primaryForeground: "#FFFFFF",
      accent: "#EEF3FF",
      accentForeground: "#172033",
    },
    headingFont: "source_sans_3",
    bodyFont: "source_sans_3",
    radius: "medium",
    spacing: "comfortable",
    contentWidth: "compact",
    buttonStyle: "soft",
    surfaceStyle: "bordered",
    logoMediaId: null,
    faviconMediaId: null,
  },
  allowedSections: [
    "hero",
    "services_grid",
    "service_area",
    "rich_text",
    "faq",
    "blog_preview",
    "trust_bar",
    "cta_banner",
    "contact_form",
  ],
  pages: [
    {
      key: "home",
      title: "Home",
      path: "/",
      pageType: "home",
      sections: [
        {
          id: presetSectionId(5, 1),
          type: "hero",
          schemaVersion: 1,
          variant: "service",
          visible: true,
          content: {
            eyebrow: "Lokale specialist",
            title: "Vind de juiste dienst in uw regio",
            subtitle:
              "Vervang deze tekst door een unieke, concrete propositie voor echte bezoekers.",
            primaryAction: {
              kind: "path",
              label: "Bekijk onze diensten",
              path: "/diensten",
            },
            secondaryAction: {
              kind: "path",
              label: "Neem contact op",
              path: "/contact",
            },
            badges: [],
          },
        },
        {
          id: presetSectionId(5, 2),
          type: "services_grid",
          schemaVersion: 1,
          variant: "editorial",
          visible: true,
          content: {
            title: "Diensten",
            subtitle:
              "Maak elke dienst inhoudelijk uniek en aantoonbaar nuttig.",
            services: [
              {
                title: "Dienst één",
                description:
                  "Beschrijf het probleem, de aanpak en het resultaat.",
              },
              {
                title: "Dienst twee",
                description:
                  "Beschrijf het probleem, de aanpak en het resultaat.",
              },
            ],
          },
        },
        {
          id: presetSectionId(5, 3),
          type: "service_area",
          schemaVersion: 1,
          variant: "list",
          visible: true,
          content: {
            title: "Werkgebied",
            subtitle:
              "Publiceer alleen regio's waarvoor u echte, unieke en relevante informatie heeft.",
            areas: ["Regio toevoegen"],
          },
        },
        {
          id: presetSectionId(5, 4),
          type: "rich_text",
          schemaVersion: 1,
          variant: "narrow",
          visible: true,
          content: { title: "Uw lokale specialist", body: emptyRichText },
        },
        {
          id: presetSectionId(5, 5),
          type: "faq",
          schemaVersion: 1,
          variant: "list",
          visible: true,
          content: {
            title: "Veelgestelde vragen",
            items: [
              {
                question: "Welke dienst past bij mijn situatie?",
                answer:
                  "Vervang dit door een inhoudelijk en controleerbaar antwoord.",
              },
            ],
            schemaEligible: false,
          },
        },
        {
          id: presetSectionId(5, 6),
          type: "blog_preview",
          schemaVersion: 1,
          variant: "editorial",
          visible: true,
          content: {
            title: "Praktische kennis",
            subtitle: "Beantwoord echte vragen van klanten met eigen inhoud.",
            limit: 3,
            action: { kind: "path", label: "Naar het blog", path: "/blog" },
          },
        },
        {
          id: presetSectionId(5, 7),
          type: "trust_bar",
          schemaVersion: 1,
          variant: "short_points",
          visible: true,
          content: {
            items: [
              {
                name: "Echte expertise",
                description: "Onderbouw dit met controleerbare ervaring.",
                decorative: false,
              },
              {
                name: "Lokale uitvoering",
                description: "Beschrijf uw werkgebied zonder doorway-content.",
                decorative: false,
              },
            ],
            shortClaims: [],
          },
        },
        {
          id: presetSectionId(5, 8),
          type: "cta_banner",
          schemaVersion: 1,
          variant: "solid",
          visible: true,
          content: {
            title: "Een concrete vraag?",
            primaryAction: {
              kind: "path",
              label: "Neem contact op",
              path: "/contact",
            },
          },
        },
        {
          id: presetSectionId(5, 9),
          type: "contact_form",
          schemaVersion: 1,
          variant: "split_contact",
          visible: true,
          content: {
            title: "Neem contact op",
            formId: null,
            showContactDetails: true,
            showOpeningHours: false,
            showMap: false,
          },
        },
      ],
    },
    {
      key: "services",
      title: "Diensten",
      path: "/diensten",
      pageType: "service",
      sections: [],
    },
    {
      key: "areas",
      title: "Regio's",
      path: "/regios",
      pageType: "area",
      sections: [],
    },
    {
      key: "blog",
      title: "Blog",
      path: "/blog",
      pageType: "blog_index",
      sections: [],
    },
    {
      key: "knowledge",
      title: "Kennisbank",
      path: "/kennis",
      pageType: "standard",
      sections: [],
    },
    {
      key: "contact",
      title: "Contact",
      path: "/contact",
      pageType: "contact",
      sections: [],
    },
  ],
  navigation: [
    { label: "Home", pageKey: "home", location: "header" },
    { label: "Diensten", pageKey: "services", location: "header" },
    { label: "Regio's", pageKey: "areas", location: "header" },
    { label: "Blog", pageKey: "blog", location: "header" },
    { label: "Kennisbank", pageKey: "knowledge", location: "header" },
    { label: "Contact", pageKey: "contact", location: "header" },
  ],
} as const satisfies WebsiteTemplateDefinition;

const templatePageSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/u)
      .max(80),
    title: z.string().trim().min(1).max(180),
    path: z
      .string()
      .regex(/^\/(?!\/)[a-z0-9/_-]*$/u)
      .max(500),
    pageType: z.enum(WEBSITE_PAGE_TYPES),
    sections: z.array(websiteSectionSchema).max(100),
  })
  .strict();

export const websiteTemplateSchema = z
  .object({
    key: z.enum(WEBSITE_TEMPLATE_KEYS),
    version: z.number().int().positive(),
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    audience: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
    goal: z.string().trim().min(1).max(500),
    previewMediaKey: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]*$/u)
      .max(120),
    defaultTheme: websiteThemeSchema,
    allowedSections: z.array(z.enum(WEBSITE_EDITOR_SECTION_KEYS)).min(1),
    pages: z.array(templatePageSchema).min(1).max(100),
    navigation: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(180),
            pageKey: z
              .string()
              .regex(/^[a-z][a-z0-9_]*$/u)
              .max(80),
            location: z.enum(["header", "footer_primary"]),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .superRefine((template, context) => {
    const pageKeys = new Set<string>();
    const paths = new Set<string>();

    for (const page of template.pages) {
      if (pageKeys.has(page.key)) {
        context.addIssue({
          code: "custom",
          path: ["pages"],
          message: `Duplicate page key: ${page.key}`,
        });
      }
      if (paths.has(page.path)) {
        context.addIssue({
          code: "custom",
          path: ["pages"],
          message: `Duplicate page path: ${page.path}`,
        });
      }
      pageKeys.add(page.key);
      paths.add(page.path);

      for (const section of page.sections) {
        if (
          !template.allowedSections.includes(
            section.type as WebsiteEditorSectionKey,
          )
        ) {
          context.addIssue({
            code: "custom",
            path: ["pages"],
            message: `Section is not allowed: ${section.type}`,
          });
        }
      }
    }

    for (const item of template.navigation) {
      if (!pageKeys.has(item.pageKey)) {
        context.addIssue({
          code: "custom",
          path: ["navigation"],
          message: `Unknown navigation page: ${item.pageKey}`,
        });
      }
    }
  });

export const WEBSITE_TEMPLATE_REGISTRY = {
  trust_conversion: TRUST_CONVERSION_TEMPLATE_V1,
  premium_local_authority: PREMIUM_LOCAL_AUTHORITY_TEMPLATE_V1,
  fast_service_emergency: FAST_SERVICE_EMERGENCY_TEMPLATE_V1,
  multi_service_company: MULTI_SERVICE_COMPANY_TEMPLATE_V1,
  content_seo_growth: CONTENT_SEO_GROWTH_TEMPLATE_V1,
} as const;

for (const sectionKey of WEBSITE_EDITOR_SECTION_KEYS) {
  if (!(sectionKey in WEBSITE_SECTION_REGISTRY)) {
    throw new Error(`Missing editor section registry entry: ${sectionKey}`);
  }
}

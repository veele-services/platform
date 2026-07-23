import { z } from "zod/v4";
import {
  WEBSITE_MVP_SECTION_KEYS,
  WEBSITE_SECTION_REGISTRY,
  websiteSectionSchema,
  type WebsiteMvpSectionKey,
  type WebsiteSection,
} from "./sections";

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
  allowedSections: readonly WebsiteMvpSectionKey[];
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
    allowedSections: z.array(z.enum(WEBSITE_MVP_SECTION_KEYS)).min(1),
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
            section.type as WebsiteMvpSectionKey,
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
} as const;

for (const sectionKey of WEBSITE_MVP_SECTION_KEYS) {
  if (!(sectionKey in WEBSITE_SECTION_REGISTRY)) {
    throw new Error(`Missing MVP section registry entry: ${sectionKey}`);
  }
}

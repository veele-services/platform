import { z } from "zod/v4";

export const WEBSITE_SECTION_KEYS = [
  "hero",
  "emergency_hero",
  "trust_bar",
  "services_grid",
  "feature_grid",
  "process_steps",
  "testimonials",
  "faq",
  "cta_banner",
  "contact_form",
  "service_area",
  "project_showcase",
  "blog_preview",
  "rich_text",
  "stats",
  "team",
  "logo_wall",
] as const;

export const WEBSITE_MVP_SECTION_KEYS = [
  "hero",
  "trust_bar",
  "services_grid",
  "feature_grid",
  "process_steps",
  "testimonials",
  "faq",
  "cta_banner",
  "contact_form",
] as const;

export const WEBSITE_EDITOR_SECTION_KEYS = [
  "hero",
  "emergency_hero",
  "trust_bar",
  "services_grid",
  "feature_grid",
  "process_steps",
  "testimonials",
  "faq",
  "cta_banner",
  "contact_form",
  "service_area",
  "project_showcase",
  "blog_preview",
  "rich_text",
  "stats",
  "team",
  "logo_wall",
] as const;

export type WebsiteSectionKey = (typeof WEBSITE_SECTION_KEYS)[number];
export type WebsiteMvpSectionKey = (typeof WEBSITE_MVP_SECTION_KEYS)[number];
export type WebsiteEditorSectionKey =
  (typeof WEBSITE_EDITOR_SECTION_KEYS)[number];

const shortText = z.string().trim().min(1).max(180);
const bodyText = z.string().trim().min(1).max(2_000);
const optionalBodyText = z.string().trim().max(2_000).optional();
const approvedIconSchema = z.enum([
  "badge_check",
  "calendar_check",
  "clock",
  "home",
  "map_pin",
  "phone",
  "shield_check",
  "sparkles",
  "tools",
  "users",
]);

const externalHttpsUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine(
    (value) => new URL(value).protocol === "https:",
    "Only HTTPS URLs are allowed",
  );

export const websiteActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("page"),
      label: shortText,
      pageId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("path"),
      label: shortText,
      path: z
        .string()
        .regex(/^\/(?!\/)[a-z0-9/_-]*$/u)
        .max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal("external"),
      label: shortText,
      href: externalHttpsUrlSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("phone"),
      label: shortText,
      phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/u),
    })
    .strict(),
  z
    .object({
      kind: z.literal("email"),
      label: shortText,
      email: z.string().email().max(320),
    })
    .strict(),
]);

const richTextHrefSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine((value) => {
    if (/^\/(?!\/)[a-z0-9/_-]*$/u.test(value)) return true;
    if (/^#[a-z][a-z0-9_-]*$/iu.test(value)) return true;
    if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/iu.test(value)) return true;
    if (/^tel:\+[1-9][0-9]{7,14}$/u.test(value)) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Alleen interne, HTTPS-, e-mail- en telefoonlinks zijn toegestaan");

const richTextMarkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }).strict(),
  z.object({ type: z.literal("italic") }).strict(),
  z
    .object({
      type: z.literal("link"),
      attrs: z
        .object({
          href: richTextHrefSchema,
          target: z.enum(["_blank"]).nullable().optional(),
          rel: z.string().max(120).nullable().optional(),
          class: z.null().optional(),
        })
        .strict(),
    })
    .strict(),
]);

type WebsiteRichTextNode =
  | {
      type: "text";
      text: string;
      marks?: Array<z.infer<typeof richTextMarkSchema>>;
    }
  | { type: "hardBreak" }
  | { type: "horizontalRule" }
  | {
      type:
        | "paragraph"
        | "blockquote"
        | "bulletList"
        | "orderedList"
        | "listItem";
      content: WebsiteRichTextNode[];
    }
  | {
      type: "heading";
      attrs: { level: 2 | 3 };
      content: WebsiteRichTextNode[];
    };

const richTextNodeSchema: z.ZodType<WebsiteRichTextNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("text"),
        text: z.string().max(4_000),
        marks: z.array(richTextMarkSchema).max(3).optional(),
      })
      .strict(),
    z.object({ type: z.literal("hardBreak") }).strict(),
    z.object({ type: z.literal("horizontalRule") }).strict(),
    ...(
      [
        "paragraph",
        "blockquote",
        "bulletList",
        "orderedList",
        "listItem",
      ] as const
    ).map((type) =>
      z
        .object({
          type: z.literal(type),
          content: z.array(richTextNodeSchema).max(200).default([]),
        })
        .strict(),
    ),
    z
      .object({
        type: z.literal("heading"),
        attrs: z
          .object({ level: z.union([z.literal(2), z.literal(3)]) })
          .strict(),
        content: z.array(richTextNodeSchema).max(100),
      })
      .strict(),
  ]),
);

export const websiteRichTextDocumentSchema = z.discriminatedUnion(
  "schemaVersion",
  [
    z
      .object({
        type: z.literal("doc"),
        schemaVersion: z.literal(1),
        content: z
          .array(
            z
              .object({
                type: z.literal("paragraph"),
                content: z
                  .array(
                    z
                      .object({
                        type: z.literal("text"),
                        text: z.string().max(4_000),
                        marks: z
                          .array(z.enum(["bold", "italic"]))
                          .max(2)
                          .optional(),
                      })
                      .strict(),
                  )
                  .max(100)
                  .default([]),
              })
              .strict(),
          )
          .min(1)
          .max(100),
      })
      .strict(),
    z
      .object({
        type: z.literal("doc"),
        schemaVersion: z.literal(2),
        content: z.array(richTextNodeSchema).min(1).max(300),
      })
      .strict(),
  ],
);

export const richTextContentSchema = z
  .object({
    title: shortText.optional(),
    body: websiteRichTextDocumentSchema,
  })
  .strict();

export const heroContentSchema = z
  .object({
    eyebrow: shortText.optional(),
    title: shortText,
    subtitle: optionalBodyText,
    primaryAction: websiteActionSchema.optional(),
    secondaryAction: websiteActionSchema.optional(),
    imageId: z.string().uuid().optional(),
    badges: z.array(shortText).max(5).default([]),
    trustText: z.string().trim().max(240).optional(),
  })
  .strict();

export const emergencyHeroContentSchema = z
  .object({
    eyebrow: shortText.optional(),
    title: shortText,
    subtitle: optionalBodyText,
    phoneAction: websiteActionSchema.refine(
      (action) => action.kind === "phone",
      "Een spoedhero vereist een telefoonactie",
    ),
    secondaryAction: websiteActionSchema.optional(),
    badges: z.array(shortText).max(5).default([]),
    availabilityNotice: z.string().trim().min(1).max(240),
  })
  .strict();

const trustItemSchema = z
  .object({
    name: shortText,
    mediaId: z.string().uuid().optional(),
    description: z.string().trim().max(240).optional(),
    decorative: z.boolean().default(false),
  })
  .strict();

export const trustBarContentSchema = z
  .object({
    title: shortText.optional(),
    reviewScore: z.number().min(0).max(5).optional(),
    reviewCount: z.number().int().nonnegative().optional(),
    items: z.array(trustItemSchema).min(2).max(8),
    shortClaims: z.array(shortText).max(5).default([]),
  })
  .strict();

const serviceCardSchema = z
  .object({
    title: shortText,
    description: bodyText,
    icon: approvedIconSchema.optional(),
    imageId: z.string().uuid().optional(),
    action: websiteActionSchema.optional(),
  })
  .strict();

export const servicesGridContentSchema = z
  .object({
    title: shortText,
    subtitle: optionalBodyText,
    services: z.array(serviceCardSchema).min(2).max(12),
  })
  .strict();

const featureSchema = z
  .object({
    title: shortText,
    description: bodyText,
    icon: approvedIconSchema,
  })
  .strict();

export const featureGridContentSchema = z
  .object({
    title: shortText,
    subtitle: optionalBodyText,
    features: z.array(featureSchema).min(2).max(9),
  })
  .strict();

const processStepSchema = z
  .object({
    title: shortText,
    description: bodyText,
    icon: approvedIconSchema.optional(),
  })
  .strict();

export const processStepsContentSchema = z
  .object({
    title: shortText,
    subtitle: optionalBodyText,
    steps: z.array(processStepSchema).min(2).max(8),
  })
  .strict();

const testimonialSchema = z
  .object({
    quote: bodyText,
    name: shortText,
    companyOrLocation: z.string().trim().max(180).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    imageId: z.string().uuid().optional(),
  })
  .strict();

export const testimonialsContentSchema = z
  .object({
    title: shortText,
    subtitle: optionalBodyText,
    testimonials: z.array(testimonialSchema).min(1).max(6),
  })
  .strict();

const faqItemSchema = z
  .object({
    question: shortText,
    answer: z.union([bodyText, websiteRichTextDocumentSchema]),
  })
  .strict();

export const faqContentSchema = z
  .object({
    title: shortText,
    subtitle: optionalBodyText,
    items: z.array(faqItemSchema).min(1).max(20),
    schemaEligible: z.boolean().default(false),
  })
  .strict();

export const ctaBannerContentSchema = z
  .object({
    title: shortText,
    subtitle: optionalBodyText,
    primaryAction: websiteActionSchema,
    secondaryAction: websiteActionSchema.optional(),
  })
  .strict();

export const contactFormContentSchema = z
  .object({
    title: shortText,
    subtitle: optionalBodyText,
    formId: z.string().uuid().nullable(),
    showContactDetails: z.boolean().default(true),
    showOpeningHours: z.boolean().default(false),
    showMap: z.literal(false).default(false),
  })
  .strict();

export const serviceAreaContentSchema = z
  .object({
    title: shortText,
    subtitle: optionalBodyText,
    areas: z.array(shortText).min(1).max(40),
    action: websiteActionSchema.optional(),
  })
  .strict();

const projectShowcaseItemSchema = z
  .object({
    title: shortText,
    description: bodyText,
    location: z.string().trim().max(180).optional(),
    imageId: z.string().uuid().optional(),
    action: websiteActionSchema.optional(),
  })
  .strict();

export const projectShowcaseContentSchema = z
  .object({
    title: shortText,
    subtitle: optionalBodyText,
    projects: z.array(projectShowcaseItemSchema).min(1).max(12),
  })
  .strict();

export const blogPreviewContentSchema = z
  .object({
    title: shortText,
    subtitle: optionalBodyText,
    limit: z.number().int().min(1).max(9).default(3),
    action: websiteActionSchema.optional(),
  })
  .strict();

const statItemSchema = z
  .object({
    value: shortText,
    label: shortText,
    sourceNote: z.string().trim().min(1).max(500),
  })
  .strict();

export const statsContentSchema = z
  .object({
    title: shortText.optional(),
    items: z.array(statItemSchema).min(1).max(8),
  })
  .strict();

const teamMemberSchema = z
  .object({
    name: shortText,
    role: shortText,
    bio: z.string().trim().max(1_000).optional(),
    imageId: z.string().uuid().optional(),
    consentConfirmed: z.boolean().default(false),
  })
  .strict();

export const teamContentSchema = z
  .object({
    title: shortText,
    subtitle: optionalBodyText,
    members: z.array(teamMemberSchema).max(24),
  })
  .strict();

const logoWallItemSchema = z
  .object({
    name: shortText,
    description: z.string().trim().max(500).optional(),
    mediaId: z.string().uuid().optional(),
    validUntil: z.string().date().optional(),
  })
  .strict();

export const logoWallContentSchema = z
  .object({
    title: shortText.optional(),
    items: z.array(logoWallItemSchema).min(1).max(24),
  })
  .strict();

export const WEBSITE_SECTION_REGISTRY = {
  hero: {
    key: "hero",
    schemaVersion: 1,
    variants: ["centered", "split", "visual", "service", "minimal"] as const,
    defaultVariant: "split",
    contentSchema: heroContentSchema,
  },
  emergency_hero: {
    key: "emergency_hero",
    schemaVersion: 1,
    variants: ["urgent", "compact"] as const,
    defaultVariant: "urgent",
    contentSchema: emergencyHeroContentSchema,
  },
  trust_bar: {
    key: "trust_bar",
    schemaVersion: 1,
    variants: ["logos", "reviews", "short_points"] as const,
    defaultVariant: "short_points",
    contentSchema: trustBarContentSchema,
  },
  services_grid: {
    key: "services_grid",
    schemaVersion: 1,
    variants: ["cards", "icons", "editorial", "compact"] as const,
    defaultVariant: "cards",
    contentSchema: servicesGridContentSchema,
  },
  feature_grid: {
    key: "feature_grid",
    schemaVersion: 1,
    variants: ["two_column", "three_column"] as const,
    defaultVariant: "three_column",
    contentSchema: featureGridContentSchema,
  },
  process_steps: {
    key: "process_steps",
    schemaVersion: 1,
    variants: ["numbered", "timeline"] as const,
    defaultVariant: "numbered",
    contentSchema: processStepsContentSchema,
  },
  testimonials: {
    key: "testimonials",
    schemaVersion: 1,
    variants: ["cards", "featured"] as const,
    defaultVariant: "cards",
    contentSchema: testimonialsContentSchema,
  },
  faq: {
    key: "faq",
    schemaVersion: 1,
    variants: ["accordion", "list"] as const,
    defaultVariant: "accordion",
    contentSchema: faqContentSchema,
  },
  cta_banner: {
    key: "cta_banner",
    schemaVersion: 1,
    variants: ["solid", "split"] as const,
    defaultVariant: "solid",
    contentSchema: ctaBannerContentSchema,
  },
  contact_form: {
    key: "contact_form",
    schemaVersion: 1,
    variants: ["card", "split_contact"] as const,
    defaultVariant: "split_contact",
    contentSchema: contactFormContentSchema,
  },
  service_area: {
    key: "service_area",
    schemaVersion: 1,
    variants: ["list", "grid"] as const,
    defaultVariant: "grid",
    contentSchema: serviceAreaContentSchema,
  },
  project_showcase: {
    key: "project_showcase",
    schemaVersion: 1,
    variants: ["editorial", "cards"] as const,
    defaultVariant: "editorial",
    contentSchema: projectShowcaseContentSchema,
  },
  blog_preview: {
    key: "blog_preview",
    schemaVersion: 1,
    variants: ["cards", "editorial"] as const,
    defaultVariant: "cards",
    contentSchema: blogPreviewContentSchema,
  },
  rich_text: {
    key: "rich_text",
    schemaVersion: 1,
    variants: ["default", "narrow"] as const,
    defaultVariant: "default",
    contentSchema: richTextContentSchema,
  },
  stats: {
    key: "stats",
    schemaVersion: 1,
    variants: ["inline", "cards"] as const,
    defaultVariant: "inline",
    contentSchema: statsContentSchema,
  },
  team: {
    key: "team",
    schemaVersion: 1,
    variants: ["cards", "compact"] as const,
    defaultVariant: "cards",
    contentSchema: teamContentSchema,
  },
  logo_wall: {
    key: "logo_wall",
    schemaVersion: 1,
    variants: ["logos", "certifications"] as const,
    defaultVariant: "logos",
    contentSchema: logoWallContentSchema,
  },
} as const satisfies Record<
  WebsiteEditorSectionKey,
  {
    key: WebsiteEditorSectionKey;
    schemaVersion: 1;
    variants: readonly [string, ...string[]];
    defaultVariant: string;
    contentSchema: z.ZodType;
  }
>;

const sectionIdentitySchema = {
  id: z.string().uuid(),
  schemaVersion: z.literal(1),
  visible: z.boolean().default(true),
  requiresReview: z.boolean().optional(),
};

export const websiteSectionSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("hero"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.hero.variants),
      content: heroContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("emergency_hero"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.emergency_hero.variants),
      content: emergencyHeroContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("trust_bar"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.trust_bar.variants),
      content: trustBarContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("services_grid"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.services_grid.variants),
      content: servicesGridContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("feature_grid"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.feature_grid.variants),
      content: featureGridContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("process_steps"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.process_steps.variants),
      content: processStepsContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("testimonials"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.testimonials.variants),
      content: testimonialsContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("faq"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.faq.variants),
      content: faqContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("cta_banner"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.cta_banner.variants),
      content: ctaBannerContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("contact_form"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.contact_form.variants),
      content: contactFormContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("service_area"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.service_area.variants),
      content: serviceAreaContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("project_showcase"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.project_showcase.variants),
      content: projectShowcaseContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("blog_preview"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.blog_preview.variants),
      content: blogPreviewContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("rich_text"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.rich_text.variants),
      content: richTextContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("stats"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.stats.variants),
      content: statsContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("team"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.team.variants),
      content: teamContentSchema,
    })
    .strict(),
  z
    .object({
      ...sectionIdentitySchema,
      type: z.literal("logo_wall"),
      variant: z.enum(WEBSITE_SECTION_REGISTRY.logo_wall.variants),
      content: logoWallContentSchema,
    })
    .strict(),
]);

export type WebsiteAction = z.infer<typeof websiteActionSchema>;
export type WebsiteRichTextDocument = z.infer<
  typeof websiteRichTextDocumentSchema
>;
export type WebsiteSection = z.infer<typeof websiteSectionSchema>;

import { z } from "zod/v4";

export const WEBSITE_DELIVERY_MODES = ["managed_cms", "custom_nextjs"] as const;
export const WEBSITE_SITE_STATUSES = ["draft", "active", "disabled"] as const;
export const WEBSITE_CONTENT_STATUSES = [
  "draft",
  "published",
  "archived",
] as const;
export const WEBSITE_PUBLICATION_STATUSES = [
  "building",
  "ready",
  "active",
  "superseded",
  "failed",
] as const;
export const WEBSITE_CUSTOM_DEPLOYMENT_STATUSES = [
  "draft",
  "checking",
  "ready",
  "active",
  "failed",
  "retired",
] as const;
export const WEBSITE_DOMAIN_BINDING_STATUSES = [
  "pending",
  "active",
  "disabled",
] as const;

export const websiteDeliveryModeSchema = z.enum(WEBSITE_DELIVERY_MODES);
export const websiteSiteStatusSchema = z.enum(WEBSITE_SITE_STATUSES);
export const websiteContentStatusSchema = z.enum(WEBSITE_CONTENT_STATUSES);
export const websitePublicationStatusSchema = z.enum(
  WEBSITE_PUBLICATION_STATUSES,
);
export const websiteCustomDeploymentStatusSchema = z.enum(
  WEBSITE_CUSTOM_DEPLOYMENT_STATUSES,
);
export const websiteDomainBindingStatusSchema = z.enum(
  WEBSITE_DOMAIN_BINDING_STATUSES,
);

const publicText = (maximum: number) => z.string().trim().min(1).max(maximum);
const nullablePublicText = (maximum: number) =>
  z.string().trim().max(maximum).nullable();
const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu);
const httpsUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine(
    (value) => new URL(value).protocol === "https:",
    "Only HTTPS URLs are allowed",
  );

export const websiteThemeSchema = z
  .object({
    schemaVersion: z.literal(1),
    colors: z
      .object({
        background: hexColorSchema,
        foreground: hexColorSchema,
        primary: hexColorSchema,
        primaryForeground: hexColorSchema,
        accent: hexColorSchema,
        accentForeground: hexColorSchema,
      })
      .strict(),
    headingFont: z.enum(["inter", "manrope", "source_sans_3"]),
    bodyFont: z.enum(["inter", "source_sans_3"]),
    radius: z.enum(["none", "small", "medium", "large"]),
    spacing: z.enum(["compact", "comfortable", "spacious"]),
    logoMediaId: z.string().uuid().nullable(),
    faviconMediaId: z.string().uuid().nullable(),
  })
  .strict();

export const websiteContactSchema = z
  .object({
    companyName: publicText(180),
    email: z.string().email().max(320).nullable(),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9][0-9]{7,14}$/u)
      .nullable(),
    street: nullablePublicText(180),
    postalCode: nullablePublicText(24),
    city: nullablePublicText(120),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/u)
      .default("NL"),
    openingHours: z.array(publicText(160)).max(14).default([]),
  })
  .strict();

export const websiteSocialLinkSchema = z
  .object({
    provider: z.enum(["facebook", "instagram", "linkedin", "youtube"]),
    url: httpsUrlSchema,
  })
  .strict();

export const websiteSeoSchema = z
  .object({
    title: publicText(70),
    description: publicText(170),
    socialImageMediaId: z.string().uuid().nullable(),
    indexable: z.boolean().default(true),
  })
  .strict();

export const websiteAnalyticsSchema = z
  .discriminatedUnion("provider", [
    z.object({ provider: z.literal("none") }).strict(),
    z
      .object({
        provider: z.literal("plausible"),
        publicSiteId: z.string().trim().min(1).max(160),
      })
      .strict(),
  ])
  .default({ provider: "none" });

export const websiteSiteSettingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: publicText(160),
    defaultLocale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/u),
    theme: websiteThemeSchema,
    contact: websiteContactSchema,
    socialLinks: z.array(websiteSocialLinkSchema).max(8),
    defaultSeo: websiteSeoSchema,
    analytics: websiteAnalyticsSchema,
  })
  .strict();

export type WebsiteDeliveryMode = z.infer<typeof websiteDeliveryModeSchema>;
export type WebsiteSiteStatus = z.infer<typeof websiteSiteStatusSchema>;
export type WebsiteContentStatus = z.infer<typeof websiteContentStatusSchema>;
export type WebsitePublicationStatus = z.infer<
  typeof websitePublicationStatusSchema
>;
export type WebsiteCustomDeploymentStatus = z.infer<
  typeof websiteCustomDeploymentStatusSchema
>;
export type WebsiteDomainBindingStatus = z.infer<
  typeof websiteDomainBindingStatusSchema
>;
export type WebsiteTheme = z.infer<typeof websiteThemeSchema>;
export type WebsiteContact = z.infer<typeof websiteContactSchema>;
export type WebsiteSocialLink = z.infer<typeof websiteSocialLinkSchema>;
export type WebsiteSeo = z.infer<typeof websiteSeoSchema>;
export type WebsiteAnalytics = z.infer<typeof websiteAnalyticsSchema>;
export type WebsiteSiteSettings = z.infer<typeof websiteSiteSettingsSchema>;

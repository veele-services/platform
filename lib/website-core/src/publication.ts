import { z } from "zod/v4";
import { websiteSectionSchema } from "./sections";
import {
  websiteContactSchema,
  websiteSeoSchema,
  websiteSocialLinkSchema,
  websiteThemeSchema,
} from "./site";
import { WEBSITE_PAGE_TYPES } from "./templates";

export const WEBSITE_PUBLICATION_SCHEMA_VERSION = 1 as const;

const publicPathSchema = z
  .string()
  .regex(/^\/(?!\/)[a-z0-9/_-]*$/u)
  .max(500);

const publicationPageSchema = z
  .object({
    id: z.string().uuid(),
    locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/u),
    path: publicPathSchema,
    pageType: z.enum(WEBSITE_PAGE_TYPES),
    title: z.string().trim().min(1).max(180),
    seo: websiteSeoSchema,
    sections: z.array(websiteSectionSchema).max(100),
  })
  .strict();

const publicationNavigationItemSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(180),
    location: z.enum(["header", "footer_primary", "footer_legal"]),
    parentId: z.string().uuid().nullable(),
    pageId: z.string().uuid().nullable(),
    href: publicPathSchema.nullable(),
    position: z.number().int().nonnegative(),
  })
  .strict();

export const websitePublicationSnapshotSchema = z
  .object({
    schemaVersion: z.literal(WEBSITE_PUBLICATION_SCHEMA_VERSION),
    siteId: z.string().uuid(),
    deliveryRevision: z.number().int().positive(),
    canonicalHostname: z.string().trim().toLowerCase().max(253),
    defaultLocale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/u),
    theme: websiteThemeSchema,
    contact: websiteContactSchema,
    socialLinks: z.array(websiteSocialLinkSchema).max(8),
    defaultSeo: websiteSeoSchema,
    pages: z.array(publicationPageSchema).min(1).max(1_000),
    navigation: z.array(publicationNavigationItemSchema).max(500),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const pageIds = new Set<string>();
    const paths = new Set<string>();

    for (const page of snapshot.pages) {
      if (pageIds.has(page.id) || paths.has(`${page.locale}:${page.path}`)) {
        context.addIssue({
          code: "custom",
          path: ["pages"],
          message: "Publication pages must have unique identities and paths",
        });
      }
      pageIds.add(page.id);
      paths.add(`${page.locale}:${page.path}`);
    }

    for (const item of snapshot.navigation) {
      if (item.pageId && !pageIds.has(item.pageId)) {
        context.addIssue({
          code: "custom",
          path: ["navigation"],
          message: `Navigation references an unknown page: ${item.pageId}`,
        });
      }
    }
  });

export type WebsitePublicationSnapshot = z.infer<
  typeof websitePublicationSnapshotSchema
>;

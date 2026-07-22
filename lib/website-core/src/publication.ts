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

const externalHttpsUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine(
    (value) => new URL(value).protocol === "https:",
    "Only HTTPS navigation URLs are allowed",
  );

const publicationHrefSchema = z.union([
  publicPathSchema,
  externalHttpsUrlSchema,
]);

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
    linkType: z.enum(["page", "external", "dropdown"]),
    pageId: z.string().uuid().nullable(),
    href: publicationHrefSchema.nullable(),
    target: z.enum(["self", "blank"]),
    position: z.number().int().nonnegative(),
  })
  .strict();

function collectPageActionReferences(value: unknown, references: string[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectPageActionReferences(item, references);
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (record.kind === "page" && typeof record.pageId === "string") {
    references.push(record.pageId);
  }
  for (const nested of Object.values(record)) {
    collectPageActionReferences(nested, references);
  }
}

export const websitePublicationSnapshotSchema = z
  .object({
    schemaVersion: z.literal(WEBSITE_PUBLICATION_SCHEMA_VERSION),
    siteId: z.string().uuid(),
    deliveryRevision: z.number().int().positive(),
    canonicalHostname: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/u)
      .refine((value) => value.includes(".") && !value.includes(".."))
      .max(253),
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
    const navigationById = new Map(
      snapshot.navigation.map((item) => [item.id, item]),
    );

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

      if (page.sections.some((section) => !section.visible)) {
        context.addIssue({
          code: "custom",
          path: ["pages", page.id, "sections"],
          message: "Publication snapshots may contain visible sections only",
        });
      }
    }

    const navigationIds = new Set<string>();
    for (const item of snapshot.navigation) {
      if (navigationIds.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: ["navigation"],
          message: `Duplicate navigation identity: ${item.id}`,
        });
      }
      navigationIds.add(item.id);

      const parent = item.parentId
        ? navigationById.get(item.parentId)
        : undefined;
      if (item.parentId && (!parent || parent.location !== item.location)) {
        context.addIssue({
          code: "custom",
          path: ["navigation", item.id, "parentId"],
          message: "Navigation parent must exist in the same location",
        });
      }

      if (item.linkType === "page") {
        if (
          !item.pageId ||
          !pageIds.has(item.pageId) ||
          !item.href ||
          !item.href.startsWith("/")
        ) {
          context.addIssue({
            code: "custom",
            path: ["navigation", item.id],
            message: "Page navigation must resolve to a published page path",
          });
        }
      } else if (item.linkType === "external") {
        if (item.pageId || !item.href || !item.href.startsWith("https://")) {
          context.addIssue({
            code: "custom",
            path: ["navigation", item.id],
            message: "External navigation must use an HTTPS URL",
          });
        }
      } else if (item.pageId || item.href || item.target !== "self") {
        context.addIssue({
          code: "custom",
          path: ["navigation", item.id],
          message:
            "Dropdown navigation cannot have a destination or blank target",
        });
      }

      const ancestors = new Set([item.id]);
      let ancestorId = item.parentId;
      while (ancestorId) {
        if (ancestors.has(ancestorId)) {
          context.addIssue({
            code: "custom",
            path: ["navigation", item.id, "parentId"],
            message: "Navigation hierarchy cannot contain a cycle",
          });
          break;
        }
        ancestors.add(ancestorId);
        ancestorId = navigationById.get(ancestorId)?.parentId ?? null;
      }
    }

    const pageActionReferences: string[] = [];
    for (const page of snapshot.pages) {
      collectPageActionReferences(page.sections, pageActionReferences);
    }
    for (const pageId of pageActionReferences) {
      if (!pageIds.has(pageId)) {
        context.addIssue({
          code: "custom",
          path: ["pages"],
          message: `Section action references an unpublished page: ${pageId}`,
        });
      }
    }
  });

export type WebsitePublicationSnapshot = z.infer<
  typeof websitePublicationSnapshotSchema
>;

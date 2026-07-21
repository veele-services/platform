import { z } from "zod/v4";
import {
  WEBSITE_PUBLICATION_SCHEMA_VERSION,
  websitePublicationSnapshotSchema,
  type WebsitePublicationSnapshot,
} from "./publication";
import { websiteSectionSchema } from "./sections";
import {
  websiteContactSchema,
  websiteContentStatusSchema,
  websiteSeoSchema,
  websiteSocialLinkSchema,
  websiteThemeSchema,
} from "./site";
import { WEBSITE_PAGE_TYPES } from "./templates";

const uuidSchema = z.string().uuid();
const pathSchema = z
  .string()
  .regex(/^\/(?!\/)[a-z0-9/_-]*$/u)
  .max(500);
const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/u)
  .refine((value) => value.includes(".") && !value.includes(".."))
  .max(253);

const sourceSectionSchema = z
  .object({
    id: uuidSchema,
    sectionKey: z.string().trim().min(1).max(80),
    schemaVersion: z.number().int().positive(),
    variantKey: z.string().trim().min(1).max(80),
    position: z.number().int().nonnegative(),
    content: z.unknown(),
    isVisible: z.boolean(),
  })
  .strict();

const sourcePageSchema = z
  .object({
    id: uuidSchema,
    locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/u),
    path: pathSchema,
    pageType: z.enum(WEBSITE_PAGE_TYPES),
    title: z.string().trim().min(1).max(180),
    seo: websiteSeoSchema,
    status: websiteContentStatusSchema,
    isHomepage: z.boolean(),
    sections: z.array(sourceSectionSchema).max(100),
  })
  .strict();

const sourceNavigationItemSchema = z
  .object({
    id: uuidSchema,
    label: z.string().trim().min(1).max(180),
    location: z.enum(["header", "footer_primary", "footer_legal"]),
    parentId: uuidSchema.nullable(),
    pageId: uuidSchema.nullable(),
    linkType: z.enum(["page", "external", "dropdown"]),
    href: z.string().trim().max(2_048).nullable(),
    target: z.enum(["self", "blank"]),
    position: z.number().int().nonnegative(),
    isVisible: z.boolean(),
  })
  .strict();

export const websitePublicationSourceSchema = z
  .object({
    site: z
      .object({
        id: uuidSchema,
        authoringRevision: z.number().int().positive(),
        deliveryRevision: z.number().int().positive(),
        defaultLocale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/u),
        theme: websiteThemeSchema,
        contact: websiteContactSchema,
        socialLinks: z.array(websiteSocialLinkSchema).max(8),
        defaultSeo: websiteSeoSchema,
      })
      .strict(),
    canonicalHostname: hostnameSchema,
    pages: z.array(sourcePageSchema).max(1_000),
    navigation: z.array(sourceNavigationItemSchema).max(500),
  })
  .strict();

export type WebsitePublicationSource = z.input<
  typeof websitePublicationSourceSchema
>;

export type WebsitePublicationDiagnostic = {
  code: string;
  path: string;
  message: string;
};

export class WebsitePublicationValidationError extends Error {
  readonly diagnostics: WebsitePublicationDiagnostic[];

  constructor(diagnostics: WebsitePublicationDiagnostic[]) {
    super("Website publication validation failed");
    this.name = "WebsitePublicationValidationError";
    this.diagnostics = diagnostics;
  }
}

function zodDiagnostics(error: z.ZodError): WebsitePublicationDiagnostic[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function diagnostic(
  code: string,
  path: string,
  message: string,
): WebsitePublicationDiagnostic {
  return { code, path, message };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertUniquePositions(
  values: readonly { id: string; position: number }[],
  path: string,
  diagnostics: WebsitePublicationDiagnostic[],
) {
  const positions = new Set<number>();
  for (const value of values) {
    if (positions.has(value.position)) {
      diagnostics.push(
        diagnostic(
          "duplicate_position",
          `${path}.${value.id}.position`,
          `Position ${value.position} is used more than once`,
        ),
      );
    }
    positions.add(value.position);
  }
}

export function buildWebsitePublicationSnapshot(
  input: WebsitePublicationSource,
): WebsitePublicationSnapshot {
  const parsed = websitePublicationSourceSchema.safeParse(input);
  if (!parsed.success) {
    throw new WebsitePublicationValidationError(zodDiagnostics(parsed.error));
  }

  const source = parsed.data;
  const diagnostics: WebsitePublicationDiagnostic[] = [];
  const publishedPages = source.pages
    .filter((page) => page.status === "published")
    .sort(
      (left, right) =>
        compareText(left.locale, right.locale) ||
        compareText(left.path, right.path) ||
        compareText(left.id, right.id),
    );

  const defaultHomepages = publishedPages.filter(
    (page) =>
      page.locale === source.site.defaultLocale &&
      page.isHomepage &&
      page.path === "/",
  );
  if (defaultHomepages.length !== 1) {
    diagnostics.push(
      diagnostic(
        "default_homepage",
        "pages",
        "Exactly one published default-locale homepage at / is required",
      ),
    );
  }
  for (const page of publishedPages) {
    if (page.isHomepage && page.path !== "/") {
      diagnostics.push(
        diagnostic(
          "homepage_path",
          `pages.${page.id}.path`,
          "A published homepage must use the root path",
        ),
      );
    }
    assertUniquePositions(
      page.sections.filter((section) => section.isVisible),
      `pages.${page.id}.sections`,
      diagnostics,
    );
  }

  const pageById = new Map(publishedPages.map((page) => [page.id, page]));
  const pages = publishedPages.map((page) => ({
    id: page.id,
    locale: page.locale,
    path: page.path,
    pageType: page.pageType,
    title: page.title,
    seo: page.seo,
    sections: page.sections
      .filter((section) => section.isVisible)
      .sort(
        (left, right) =>
          left.position - right.position || compareText(left.id, right.id),
      )
      .flatMap((section) => {
        const result = websiteSectionSchema.safeParse({
          id: section.id,
          type: section.sectionKey,
          schemaVersion: section.schemaVersion,
          variant: section.variantKey,
          visible: true,
          content: section.content,
        });
        if (result.success) return [result.data];
        diagnostics.push(
          ...zodDiagnostics(result.error).map((entry) => ({
            ...entry,
            path: `pages.${page.id}.sections.${section.id}.${entry.path}`,
          })),
        );
        return [];
      }),
  }));

  const visibleNavigation = source.navigation.filter((item) => item.isVisible);
  for (const location of [
    "header",
    "footer_primary",
    "footer_legal",
  ] as const) {
    assertUniquePositions(
      visibleNavigation.filter((item) => item.location === location),
      `navigation.${location}`,
      diagnostics,
    );
  }

  const navigation = visibleNavigation
    .sort(
      (left, right) =>
        compareText(left.location, right.location) ||
        left.position - right.position ||
        compareText(left.id, right.id),
    )
    .map((item) => {
      let href = item.href;
      if (item.linkType === "page") {
        const page = item.pageId ? pageById.get(item.pageId) : undefined;
        if (!page) {
          diagnostics.push(
            diagnostic(
              "unpublished_navigation_page",
              `navigation.${item.id}.pageId`,
              "Navigation references a page that is not published",
            ),
          );
          href = null;
        } else {
          href = page.path;
        }
      } else if (item.linkType === "external") {
        let isHttps = false;
        try {
          isHttps = Boolean(href && new URL(href).protocol === "https:");
        } catch {
          isHttps = false;
        }
        if (item.pageId || !isHttps) {
          diagnostics.push(
            diagnostic(
              "unsafe_external_navigation",
              `navigation.${item.id}.href`,
              "External navigation must use an HTTPS URL and cannot reference a page",
            ),
          );
        }
      } else if (item.pageId || href || item.target !== "self") {
        diagnostics.push(
          diagnostic(
            "invalid_dropdown_navigation",
            `navigation.${item.id}`,
            "Dropdown navigation cannot have a destination or blank target",
          ),
        );
      }
      return {
        id: item.id,
        label: item.label,
        location: item.location,
        parentId: item.parentId,
        linkType: item.linkType,
        pageId: item.pageId,
        href,
        target: item.target,
        position: item.position,
      };
    });

  if (diagnostics.length > 0) {
    throw new WebsitePublicationValidationError(diagnostics);
  }

  const snapshot = websitePublicationSnapshotSchema.safeParse({
    schemaVersion: WEBSITE_PUBLICATION_SCHEMA_VERSION,
    siteId: source.site.id,
    deliveryRevision: source.site.deliveryRevision + 1,
    canonicalHostname: source.canonicalHostname,
    defaultLocale: source.site.defaultLocale,
    theme: source.site.theme,
    contact: source.site.contact,
    socialLinks: source.site.socialLinks,
    defaultSeo: source.site.defaultSeo,
    pages,
    navigation,
  });
  if (!snapshot.success) {
    throw new WebsitePublicationValidationError(zodDiagnostics(snapshot.error));
  }
  return snapshot.data;
}

function stableJsonValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value
      .map((entry) => (entry === undefined ? "null" : stableJsonValue(entry)))
      .join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonValue(record[key])}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Publication contains a non-JSON value");
  }
  return serialized;
}

export function serializeWebsitePublication(
  snapshot: WebsitePublicationSnapshot,
): string {
  return stableJsonValue(websitePublicationSnapshotSchema.parse(snapshot));
}

const cacheIdentityInputSchema = z
  .object({
    tenantId: uuidSchema,
    siteId: uuidSchema,
    deliveryRevision: z.number().int().positive(),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

export function websitePublicationCacheIdentity(
  input: z.input<typeof cacheIdentityInputSchema>,
): { cacheKey: string; etag: string } {
  const value = cacheIdentityInputSchema.parse(input);
  return {
    cacheKey: [
      "website-publication",
      "v1",
      value.tenantId,
      value.siteId,
      `r${value.deliveryRevision}`,
      value.contentHash,
    ].join(":"),
    etag: `"fgw-v1-r${value.deliveryRevision}-${value.contentHash}"`,
  };
}

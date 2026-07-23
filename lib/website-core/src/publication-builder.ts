import { z } from "zod/v4";
import {
  WEBSITE_BLOG_INDEX_PATH,
  websiteBlogCategoryPath,
  websiteBlogPostPath,
  websiteBlogSourceSchema,
  websiteBlogTagPath,
} from "./blog";
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
import {
  websiteCanonicalPathSchema,
  websiteRedirectDraftSchema,
  websiteRouteKey,
} from "./redirects";
import {
  resolvePublicationForm,
  websiteFormSourceSchema,
  type WebsitePublicationForm,
} from "./forms";

const uuidSchema = z.string().uuid();
const pathSchema = websiteCanonicalPathSchema;
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
    redirects: websiteRedirectDraftSchema.default([]),
    blog: websiteBlogSourceSchema,
    forms: z.array(websiteFormSourceSchema).max(100).default([]),
  })
  .strict();

export type WebsitePublicationSource = z.output<
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

function buildWebsiteSnapshot(
  input: WebsitePublicationSource,
  includePage: (
    status: WebsitePublicationSource["pages"][number]["status"],
  ) => boolean,
  includeBlogPost: (status: "draft" | "published" | "archived") => boolean,
): WebsitePublicationSnapshot {
  const parsed = websitePublicationSourceSchema.safeParse(input);
  if (!parsed.success) {
    throw new WebsitePublicationValidationError(zodDiagnostics(parsed.error));
  }

  const source = parsed.data;
  const diagnostics: WebsitePublicationDiagnostic[] = [];
  const publishedPages = source.pages
    .filter((page) => includePage(page.status))
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
  const pageByRoute = new Map(
    publishedPages.map((page) => [
      websiteRouteKey(page.locale, page.path),
      page,
    ]),
  );
  const blogIndexLocales = new Set(
    publishedPages
      .filter(
        (page) =>
          page.pageType === "blog_index" &&
          page.path === WEBSITE_BLOG_INDEX_PATH,
      )
      .map((page) => page.locale),
  );
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
  const visibleNavigationById = new Map(
    visibleNavigation.map((item) => [item.id, item]),
  );
  const siblingLabels = new Set<string>();
  const siblingDestinations = new Set<string>();
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
  for (const item of visibleNavigation) {
    const ancestors = new Set([item.id]);
    let ancestorId = item.parentId;
    while (ancestorId) {
      if (ancestors.has(ancestorId)) {
        diagnostics.push(
          diagnostic(
            "navigation_cycle",
            `navigation.${item.id}.parentId`,
            "Navigation hierarchy cannot contain a cycle",
          ),
        );
        break;
      }
      ancestors.add(ancestorId);
      ancestorId = visibleNavigationById.get(ancestorId)?.parentId ?? null;
    }

    const parent = item.parentId
      ? visibleNavigationById.get(item.parentId)
      : undefined;
    if (
      item.parentId &&
      (!parent || parent.location !== item.location || parent.parentId !== null)
    ) {
      diagnostics.push(
        diagnostic(
          "invalid_navigation_hierarchy",
          `navigation.${item.id}.parentId`,
          "Navigation supports one submenu level under a parent in the same location",
        ),
      );
    }
    if (item.parentId && item.linkType === "dropdown") {
      diagnostics.push(
        diagnostic(
          "nested_navigation_dropdown",
          `navigation.${item.id}.linkType`,
          "A submenu item cannot be another destination-less dropdown",
        ),
      );
    }

    const siblingKey = `${item.location}:${item.parentId ?? "root"}`;
    const labelKey = `${siblingKey}:${item.label.toLocaleLowerCase("nl-NL")}`;
    if (siblingLabels.has(labelKey)) {
      diagnostics.push(
        diagnostic(
          "duplicate_navigation_label",
          `navigation.${item.id}.label`,
          "Navigation labels must be unique within the same level",
        ),
      );
    }
    siblingLabels.add(labelKey);

    const destination =
      item.linkType === "page" && item.pageId
        ? `page:${item.pageId}`
        : item.linkType === "external" && item.href
          ? `external:${item.href}`
          : null;
    if (destination) {
      const destinationKey = `${siblingKey}:${destination}`;
      if (siblingDestinations.has(destinationKey)) {
        diagnostics.push(
          diagnostic(
            "duplicate_navigation_destination",
            `navigation.${item.id}`,
            "A navigation destination must be unique within the same level",
          ),
        );
      }
      siblingDestinations.add(destinationKey);
    }
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
          const url = href ? new URL(href) : null;
          isHttps = Boolean(
            url && url.protocol === "https:" && !url.username && !url.password,
          );
        } catch {
          isHttps = false;
        }
        if (item.pageId || !isHttps) {
          diagnostics.push(
            diagnostic(
              "unsafe_external_navigation",
              `navigation.${item.id}.href`,
              "External navigation must use an HTTPS URL without credentials and cannot reference a page",
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

  const includedSourceBlogPosts = source.blog.posts.filter((post) =>
    includeBlogPost(post.status),
  );
  const includedCategoryIds = new Set(
    includedSourceBlogPosts.flatMap((post) =>
      post.categoryId ? [post.categoryId] : [],
    ),
  );
  const includedTagIds = new Set(
    includedSourceBlogPosts.flatMap((post) => post.tagIds),
  );
  const categories = source.blog.categories
    .filter(
      (category) => category.isActive && includedCategoryIds.has(category.id),
    )
    .sort(
      (left, right) =>
        compareText(left.locale, right.locale) ||
        compareText(left.slug, right.slug) ||
        compareText(left.id, right.id),
    )
    .map((category) => ({
      id: category.id,
      locale: category.locale,
      name: category.name,
      slug: category.slug,
      path: websiteBlogCategoryPath(category.slug),
      description: category.description,
    }));
  const tags = source.blog.tags
    .filter((tag) => tag.isActive && includedTagIds.has(tag.id))
    .sort(
      (left, right) =>
        compareText(left.locale, right.locale) ||
        compareText(left.slug, right.slug) ||
        compareText(left.id, right.id),
    )
    .map((tag) => ({
      id: tag.id,
      locale: tag.locale,
      name: tag.name,
      slug: tag.slug,
      path: websiteBlogTagPath(tag.slug),
    }));
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const blogPosts = includedSourceBlogPosts
    .sort(
      (left, right) =>
        compareText(left.locale, right.locale) ||
        compareText(
          right.publishedAt ?? right.updatedAt,
          left.publishedAt ?? left.updatedAt,
        ) ||
        compareText(left.slug, right.slug) ||
        compareText(left.id, right.id),
    )
    .map((post) => {
      if (!blogIndexLocales.has(post.locale)) {
        diagnostics.push(
          diagnostic(
            "blog_index_missing",
            `blog.posts.${post.id}.locale`,
            "Blogcontent vereist een gepubliceerde blogoverzichtspagina op /blog in dezelfde taal",
          ),
        );
      }
      if (
        post.status === "published" &&
        post.publishedAt &&
        new Date(post.publishedAt).getTime() > Date.now()
      ) {
        diagnostics.push(
          diagnostic(
            "future_blog_post",
            `blog.posts.${post.id}.publishedAt`,
            "Toekomstige publicatie is niet ondersteund; publiceer het bericht expliciet wanneer het live mag",
          ),
        );
      }
      if (post.categoryId) {
        const category = categoryById.get(post.categoryId);
        if (!category || category.locale !== post.locale) {
          diagnostics.push(
            diagnostic(
              "invalid_blog_category",
              `blog.posts.${post.id}.categoryId`,
              "De blogcategorie is niet actief of gebruikt een andere taal",
            ),
          );
        }
      }
      for (const tagId of post.tagIds) {
        const tag = tagById.get(tagId);
        if (!tag || tag.locale !== post.locale) {
          diagnostics.push(
            diagnostic(
              "invalid_blog_tag",
              `blog.posts.${post.id}.tagIds`,
              "Een blogtag is niet actief of gebruikt een andere taal",
            ),
          );
        }
      }
      const path = websiteBlogPostPath(post.slug);
      if (pageByRoute.has(websiteRouteKey(post.locale, path))) {
        diagnostics.push(
          diagnostic(
            "blog_page_collision",
            `blog.posts.${post.id}.slug`,
            "Blogberichtpad botst met een gepubliceerde pagina",
          ),
        );
      }
      return {
        id: post.id,
        locale: post.locale,
        title: post.title,
        slug: post.slug,
        path,
        excerpt: post.excerpt,
        body: post.body,
        categoryId: post.categoryId,
        tagIds: post.tagIds,
        seo: post.seo,
        visibility:
          post.status === "published"
            ? ("published" as const)
            : ("preview" as const),
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt,
      };
    });
  const blogRouteKeys = new Set([
    ...categories.map((category) =>
      websiteRouteKey(category.locale, category.path),
    ),
    ...tags.map((tag) => websiteRouteKey(tag.locale, tag.path)),
    ...blogPosts.map((post) => websiteRouteKey(post.locale, post.path)),
  ]);
  for (const category of categories) {
    if (pageByRoute.has(websiteRouteKey(category.locale, category.path))) {
      diagnostics.push(
        diagnostic(
          "blog_page_collision",
          `blog.categories.${category.id}.slug`,
          "Blogcategoriepad botst met een gepubliceerde pagina",
        ),
      );
    }
  }
  for (const tag of tags) {
    if (pageByRoute.has(websiteRouteKey(tag.locale, tag.path))) {
      diagnostics.push(
        diagnostic(
          "blog_page_collision",
          `blog.tags.${tag.id}.slug`,
          "Blogtagpad botst met een gepubliceerde pagina",
        ),
      );
    }
  }

  const redirects = source.redirects
    .filter((redirect) => redirect.isActive)
    .sort(
      (left, right) =>
        compareText(left.locale, right.locale) ||
        compareText(left.sourcePath, right.sourcePath) ||
        compareText(left.id, right.id),
    )
    .map((redirect) => {
      const sourceKey = websiteRouteKey(redirect.locale, redirect.sourcePath);
      if (pageByRoute.has(sourceKey)) {
        diagnostics.push(
          diagnostic(
            "redirect_page_collision",
            `redirects.${redirect.id}.sourcePath`,
            "Redirect source collides with a page in the same locale",
          ),
        );
      }
      if (blogRouteKeys.has(sourceKey)) {
        diagnostics.push(
          diagnostic(
            "redirect_blog_collision",
            `redirects.${redirect.id}.sourcePath`,
            "Redirectbron botst met gepubliceerde blogcontent",
          ),
        );
      }
      if (
        redirect.destinationType === "path" &&
        !pageByRoute.has(
          websiteRouteKey(redirect.locale, redirect.destination),
        ) &&
        !blogRouteKeys.has(
          websiteRouteKey(redirect.locale, redirect.destination),
        )
      ) {
        diagnostics.push(
          diagnostic(
            "unpublished_redirect_destination",
            `redirects.${redirect.id}.destination`,
            "Internal redirect destination must resolve to a published page in the same locale",
          ),
        );
      }
      return {
        id: redirect.id,
        locale: redirect.locale,
        sourcePath: redirect.sourcePath,
        destinationType: redirect.destinationType,
        destination: redirect.destination,
        statusCode: redirect.statusCode,
      };
    });

  const forms: WebsitePublicationForm[] = source.forms
    .filter((form) => includePage(form.status))
    .sort(
      (left, right) =>
        compareText(left.locale, right.locale) ||
        compareText(left.key, right.key) ||
        compareText(left.id, right.id),
    )
    .map(({ status: _status, ...form }) => form);

  for (const page of pages) {
    for (const section of page.sections) {
      if (
        section.type === "contact_form" &&
        !resolvePublicationForm(forms, {
          formId: section.content.formId,
          locale: page.locale,
        })
      ) {
        diagnostics.push(
          diagnostic(
            "missing_published_form",
            `pages.${page.id}.sections.${section.id}.content.formId`,
            "Een zichtbaar contactformulier moet naar een gepubliceerd formulier in dezelfde taal verwijzen",
          ),
        );
      }
    }
  }

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
    redirects,
    blog: {
      categories,
      tags,
      posts: blogPosts,
    },
    forms,
  });
  if (!snapshot.success) {
    throw new WebsitePublicationValidationError(zodDiagnostics(snapshot.error));
  }
  return snapshot.data;
}

export function buildWebsitePublicationSnapshot(
  input: WebsitePublicationSource,
): WebsitePublicationSnapshot {
  return buildWebsiteSnapshot(
    input,
    (status) => status === "published",
    (status) => status === "published",
  );
}

export function buildWebsiteDraftPreviewSnapshot(
  input: WebsitePublicationSource,
): WebsitePublicationSnapshot {
  return buildWebsiteSnapshot(
    input,
    (status) => status !== "archived",
    (status) => status !== "archived",
  );
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

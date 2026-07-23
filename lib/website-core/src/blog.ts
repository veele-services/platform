import { z } from "zod/v4";
import {
  websiteCanonicalPathSchema,
  websiteLocaleSchema,
  websiteRouteKey,
} from "./redirects";
import {
  websiteRichTextDocumentSchema,
  type WebsiteRichTextDocument,
} from "./sections";
import { websiteContentStatusSchema, websiteSeoSchema } from "./site";

export const WEBSITE_BLOG_INDEX_PATH = "/blog" as const;
export const WEBSITE_BLOG_CATEGORY_SEGMENT = "categorie" as const;
export const WEBSITE_BLOG_TAG_SEGMENT = "tag" as const;

export const websiteBlogSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9][a-z0-9-]*$/u)
  .refine(
    (value) =>
      value !== WEBSITE_BLOG_CATEGORY_SEGMENT &&
      value !== WEBSITE_BLOG_TAG_SEGMENT,
    "Deze slug is gereserveerd voor het blogarchief",
  );

const optionalDescriptionSchema = z.string().trim().max(500).nullable();

export function websiteBlogPostPath(slug: string): string {
  return `${WEBSITE_BLOG_INDEX_PATH}/${websiteBlogSlugSchema.parse(slug)}`;
}

export function websiteBlogCategoryPath(slug: string): string {
  return `${WEBSITE_BLOG_INDEX_PATH}/${WEBSITE_BLOG_CATEGORY_SEGMENT}/${websiteBlogSlugSchema.parse(slug)}`;
}

export function websiteBlogTagPath(slug: string): string {
  return `${WEBSITE_BLOG_INDEX_PATH}/${WEBSITE_BLOG_TAG_SEGMENT}/${websiteBlogSlugSchema.parse(slug)}`;
}

export const websiteBlogCategoryDraftItemSchema = z
  .object({
    id: z.string().uuid(),
    locale: websiteLocaleSchema,
    name: z.string().trim().min(1).max(120),
    slug: websiteBlogSlugSchema,
    description: optionalDescriptionSchema,
    isActive: z.boolean(),
  })
  .strict();

export const websiteBlogTagDraftItemSchema = z
  .object({
    id: z.string().uuid(),
    locale: websiteLocaleSchema,
    name: z.string().trim().min(1).max(80),
    slug: websiteBlogSlugSchema,
    isActive: z.boolean(),
  })
  .strict();

function uniqueTaxonomy<T extends { id: string; locale: string; slug: string }>(
  values: readonly T[],
  context: z.RefinementCtx,
  label: string,
) {
  const ids = new Set<string>();
  const routes = new Set<string>();
  for (const value of values) {
    const route = websiteRouteKey(value.locale, value.slug);
    if (ids.has(value.id)) {
      context.addIssue({
        code: "custom",
        path: [value.id],
        message: `Dubbele ${label}-identiteit`,
      });
    }
    if (routes.has(route)) {
      context.addIssue({
        code: "custom",
        path: [value.id, "slug"],
        message: `${label}slugs moeten uniek zijn per taal`,
      });
    }
    ids.add(value.id);
    routes.add(route);
  }
}

export const websiteBlogTaxonomyDraftSchema = z
  .object({
    categories: z.array(websiteBlogCategoryDraftItemSchema).max(100),
    tags: z.array(websiteBlogTagDraftItemSchema).max(250),
  })
  .strict()
  .superRefine((taxonomy, context) => {
    uniqueTaxonomy(taxonomy.categories, context, "categorie");
    uniqueTaxonomy(taxonomy.tags, context, "tag");
    const categoryIds = new Set(
      taxonomy.categories.map((category) => category.id),
    );
    for (const tag of taxonomy.tags) {
      if (categoryIds.has(tag.id)) {
        context.addIssue({
          code: "custom",
          path: ["tags", tag.id],
          message: "Categorieën en tags mogen geen identiteit delen",
        });
      }
    }
  });

export const websiteBlogPostDraftSchema = z
  .object({
    locale: websiteLocaleSchema,
    title: z.string().trim().min(1).max(180),
    slug: websiteBlogSlugSchema,
    excerpt: z.string().trim().min(1).max(500),
    body: websiteRichTextDocumentSchema,
    categoryId: z.string().uuid().nullable(),
    tagIds: z
      .array(z.string().uuid())
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, "Dubbele tag"),
    seo: websiteSeoSchema,
  })
  .strict();

export const websiteBlogSourceCategorySchema =
  websiteBlogCategoryDraftItemSchema;
export const websiteBlogSourceTagSchema = websiteBlogTagDraftItemSchema;
export const websiteBlogSourcePostSchema = websiteBlogPostDraftSchema
  .extend({
    id: z.string().uuid(),
    status: websiteContentStatusSchema,
    publishedAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((post, context) => {
    if (post.status === "published" && !post.publishedAt) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "Een gepubliceerd blogbericht vereist een publicatietijd",
      });
    }
    if (post.status !== "published" && post.publishedAt) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message:
          "Alleen een expliciet gepubliceerd blogbericht mag een publicatietijd hebben",
      });
    }
  });

export const websiteBlogSourceSchema = z
  .object({
    categories: z.array(websiteBlogSourceCategorySchema).max(100).default([]),
    tags: z.array(websiteBlogSourceTagSchema).max(250).default([]),
    posts: z.array(websiteBlogSourcePostSchema).max(2_000).default([]),
  })
  .strict()
  .default({ categories: [], tags: [], posts: [] });

export const websitePublicationBlogCategorySchema = z
  .object({
    id: z.string().uuid(),
    locale: websiteLocaleSchema,
    name: z.string().trim().min(1).max(120),
    slug: websiteBlogSlugSchema,
    path: websiteCanonicalPathSchema,
    description: optionalDescriptionSchema,
  })
  .strict();

export const websitePublicationBlogTagSchema = z
  .object({
    id: z.string().uuid(),
    locale: websiteLocaleSchema,
    name: z.string().trim().min(1).max(80),
    slug: websiteBlogSlugSchema,
    path: websiteCanonicalPathSchema,
  })
  .strict();

export const websitePublicationBlogPostSchema = z
  .object({
    id: z.string().uuid(),
    locale: websiteLocaleSchema,
    title: z.string().trim().min(1).max(180),
    slug: websiteBlogSlugSchema,
    path: websiteCanonicalPathSchema,
    excerpt: z.string().trim().min(1).max(500),
    body: websiteRichTextDocumentSchema,
    categoryId: z.string().uuid().nullable(),
    tagIds: z.array(z.string().uuid()).max(20),
    seo: websiteSeoSchema,
    visibility: z.enum(["published", "preview"]),
    publishedAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((post, context) => {
    if (post.path !== websiteBlogPostPath(post.slug)) {
      context.addIssue({
        code: "custom",
        path: ["path"],
        message: "Blogberichtpad komt niet overeen met de slug",
      });
    }
    if (post.visibility === "published" && !post.publishedAt) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "Publieke blogberichten vereisen een publicatietijd",
      });
    }
  });

export const websitePublicationBlogSchema = z
  .object({
    categories: z.array(websitePublicationBlogCategorySchema).max(100),
    tags: z.array(websitePublicationBlogTagSchema).max(250),
    posts: z.array(websitePublicationBlogPostSchema).max(2_000),
  })
  .strict()
  .superRefine((blog, context) => {
    const categoryById = new Map(
      blog.categories.map((item) => [item.id, item]),
    );
    const tagById = new Map(blog.tags.map((item) => [item.id, item]));
    const ids = new Set<string>();
    const routes = new Set<string>();

    for (const category of blog.categories) {
      const route = websiteRouteKey(category.locale, category.path);
      if (
        ids.has(category.id) ||
        routes.has(route) ||
        category.path !== websiteBlogCategoryPath(category.slug)
      ) {
        context.addIssue({
          code: "custom",
          path: ["categories", category.id],
          message: "Blogcategorie-identiteit of -route is ongeldig of dubbel",
        });
      }
      ids.add(category.id);
      routes.add(route);
    }
    for (const tag of blog.tags) {
      const route = websiteRouteKey(tag.locale, tag.path);
      if (
        ids.has(tag.id) ||
        routes.has(route) ||
        tag.path !== websiteBlogTagPath(tag.slug)
      ) {
        context.addIssue({
          code: "custom",
          path: ["tags", tag.id],
          message: "Blogtag-identiteit of -route is ongeldig of dubbel",
        });
      }
      ids.add(tag.id);
      routes.add(route);
    }
    for (const post of blog.posts) {
      const route = websiteRouteKey(post.locale, post.path);
      if (ids.has(post.id) || routes.has(route)) {
        context.addIssue({
          code: "custom",
          path: ["posts", post.id],
          message: "Blogbericht-identiteit of -route is dubbel",
        });
      }
      ids.add(post.id);
      routes.add(route);
      if (post.categoryId) {
        const category = categoryById.get(post.categoryId);
        if (!category || category.locale !== post.locale) {
          context.addIssue({
            code: "custom",
            path: ["posts", post.id, "categoryId"],
            message: "Blogcategorie moet in dezelfde taal bestaan",
          });
        }
      }
      for (const tagId of post.tagIds) {
        const tag = tagById.get(tagId);
        if (!tag || tag.locale !== post.locale) {
          context.addIssue({
            code: "custom",
            path: ["posts", post.id, "tagIds"],
            message: "Blogtags moeten in dezelfde taal bestaan",
          });
        }
      }
    }
  });

export const EMPTY_WEBSITE_PUBLICATION_BLOG = {
  categories: [],
  tags: [],
  posts: [],
};

export type WebsiteBlogCategoryDraftItem = z.infer<
  typeof websiteBlogCategoryDraftItemSchema
>;
export type WebsiteBlogTagDraftItem = z.infer<
  typeof websiteBlogTagDraftItemSchema
>;
export type WebsiteBlogTaxonomyDraft = z.infer<
  typeof websiteBlogTaxonomyDraftSchema
>;
export type WebsiteBlogPostDraft = z.infer<typeof websiteBlogPostDraftSchema>;
export type WebsiteBlogSource = z.infer<typeof websiteBlogSourceSchema>;
export type WebsitePublicationBlog = z.infer<
  typeof websitePublicationBlogSchema
>;
export type WebsitePublicationBlogPost = z.infer<
  typeof websitePublicationBlogPostSchema
>;
export type { WebsiteRichTextDocument };

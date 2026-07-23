import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import {
  websiteBlogCategoryPath,
  websiteBlogPostDraftSchema,
  websiteBlogPostPath,
  websiteBlogSourceSchema,
  websiteBlogTagPath,
  websiteBlogTaxonomyDraftSchema,
  type WebsiteBlogCategoryDraftItem,
  type WebsiteBlogPostDraft,
  type WebsiteBlogSource,
  type WebsiteBlogTagDraftItem,
  type WebsiteRichTextDocument,
} from "@workspace/website-core/blog";
import { websiteSeoSchema, type WebsiteSeo } from "@workspace/website-core";
import { pool } from "./connection";

export type {
  WebsiteBlogCategoryDraftItem,
  WebsiteBlogPostDraft,
  WebsiteBlogTagDraftItem,
  WebsiteBlogTaxonomyDraft,
  WebsiteRichTextDocument,
} from "@workspace/website-core/blog";

type Queryable = Pick<PoolClient, "query">;
type DeliveryMode = "managed_cms" | "custom_nextjs";
type ContentStatus = "draft" | "published" | "archived";

const tenantIdSchema = z.string().uuid();
const siteMutationSchema = z
  .object({
    tenantId: tenantIdSchema,
    actorUserId: z.string().uuid(),
    siteId: z.string().uuid(),
    expectedAuthoringRevision: z.number().int().positive(),
  })
  .strict();
const replaceTaxonomyInputSchema = siteMutationSchema.extend({
  taxonomy: websiteBlogTaxonomyDraftSchema,
});
const createPostInputSchema = siteMutationSchema.extend({
  post: websiteBlogPostDraftSchema,
});
const updatePostInputSchema = siteMutationSchema.extend({
  postId: z.string().uuid(),
  expectedPostRevision: z.number().int().positive(),
  post: websiteBlogPostDraftSchema,
});
const transitionPostInputSchema = siteMutationSchema.extend({
  postId: z.string().uuid(),
  expectedPostRevision: z.number().int().positive(),
});

export type WebsiteBlogPostListItem = {
  id: string;
  locale: string;
  title: string;
  slug: string;
  path: string;
  excerpt: string;
  status: ContentStatus;
  authoringRevision: number;
  categoryId: string | null;
  tagIds: string[];
  publishedAt: string | null;
  updatedAt: string;
};

export type WebsiteBlogView = {
  siteId: string;
  siteName: string;
  authoringRevision: number;
  deliveryMode: DeliveryMode;
  defaultLocale: string;
  hasBlogIndex: boolean;
  categories: WebsiteBlogCategoryDraftItem[];
  tags: WebsiteBlogTagDraftItem[];
  posts: WebsiteBlogPostListItem[];
};

export type WebsiteBlogPostDetail = WebsiteBlogPostListItem & {
  siteId: string;
  siteName: string;
  siteAuthoringRevision: number;
  body: WebsiteRichTextDocument;
  seo: WebsiteSeo;
};

type LockedSite = {
  id: string;
  name: string;
  authoring_revision: number;
  delivery_mode: DeliveryMode;
  default_locale: string;
  tenant_is_active: boolean;
  tenant_status: string;
  module_enabled: boolean;
};

function requireOne<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}

function asIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

async function inTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function lockSite(
  client: PoolClient,
  input: z.infer<typeof siteMutationSchema>,
): Promise<LockedSite> {
  const result = await client.query<LockedSite>(
    `SELECT site.id, site.name, site.authoring_revision, site.delivery_mode,
            site.default_locale, tenant.is_active AS tenant_is_active,
            tenant.status AS tenant_status,
            EXISTS (
              SELECT 1
              FROM public.tenant_modules entitlement
              JOIN public.modules module ON module.id = entitlement.module_id
              WHERE entitlement.tenant_id = site.tenant_id
                AND module.key = 'website'
                AND entitlement.is_enabled = true
            ) AS module_enabled
     FROM public.website_sites site
     JOIN public.tenants tenant ON tenant.id = site.tenant_id
     WHERE site.tenant_id = $1 AND site.id = $2
       AND site.is_primary = true AND site.status <> 'disabled'
     FOR UPDATE OF site`,
    [input.tenantId, input.siteId],
  );
  const site = requireOne(result.rows, "Website niet gevonden");
  if (
    !site.tenant_is_active ||
    !["trial", "active"].includes(site.tenant_status)
  ) {
    throw new Error("De tenant is niet actief");
  }
  if (!site.module_enabled) throw new Error("De website-module is niet actief");
  if (Number(site.authoring_revision) !== input.expectedAuthoringRevision) {
    throw new Error("Website is intussen gewijzigd. Laad het blog opnieuw.");
  }
  return site;
}

async function beginBlogMutation(client: PoolClient): Promise<void> {
  await client.query(
    `SET CONSTRAINTS
       trg_website_blog_categories_route_integrity,
       trg_website_blog_tags_route_integrity,
       trg_website_blog_posts_route_integrity,
       trg_website_blog_post_tag_locale
     DEFERRED`,
  );
  await client.query(
    `SELECT set_config('fieldgrid.website_child_authoring_touch', 'suppressed', true)`,
  );
}

async function finishBlogMutation(
  client: PoolClient,
  input: z.infer<typeof siteMutationSchema>,
  action: string,
  metadata: Record<string, unknown>,
): Promise<number> {
  await client.query(
    `SELECT set_config('fieldgrid.website_authoring_touch', 'allowed', true)`,
  );
  const revisionResult = await client.query<{ authoring_revision: number }>(
    `UPDATE public.website_sites
     SET authoring_revision = authoring_revision + 1,
         updated_by = $4,
         updated_at = now()
     WHERE tenant_id = $1 AND id = $2 AND authoring_revision = $3
     RETURNING authoring_revision`,
    [
      input.tenantId,
      input.siteId,
      input.expectedAuthoringRevision,
      input.actorUserId,
    ],
  );
  const revision = Number(
    requireOne(
      revisionResult.rows,
      "Website is intussen gewijzigd. Laad het blog opnieuw.",
    ).authoring_revision,
  );
  await client.query(
    `INSERT INTO public.audit_log (
       tenant_id, user_id, action, resource, resource_id, metadata
     ) VALUES ($1, $2, $3, 'website_blog', $4, $5::jsonb)`,
    [
      input.tenantId,
      input.actorUserId,
      action,
      input.siteId,
      JSON.stringify({
        fromRevision: input.expectedAuthoringRevision,
        toRevision: revision,
        ...metadata,
      }),
    ],
  );
  return revision;
}

async function activeTaxonomy(
  query: Queryable,
  tenantId: string,
  siteId: string,
): Promise<{
  categories: Map<string, { locale: string }>;
  tags: Map<string, { locale: string }>;
}> {
  const [categories, tags] = await Promise.all([
    query.query<{ id: string; locale: string }>(
      `SELECT id, locale
       FROM public.website_blog_categories
       WHERE tenant_id = $1 AND site_id = $2 AND is_active = true`,
      [tenantId, siteId],
    ),
    query.query<{ id: string; locale: string }>(
      `SELECT id, locale
       FROM public.website_blog_tags
       WHERE tenant_id = $1 AND site_id = $2 AND is_active = true`,
      [tenantId, siteId],
    ),
  ]);
  return {
    categories: new Map(categories.rows.map((row) => [row.id, row])),
    tags: new Map(tags.rows.map((row) => [row.id, row])),
  };
}

function assertPostTaxonomy(
  post: Pick<WebsiteBlogPostDraft, "locale" | "categoryId" | "tagIds">,
  taxonomy: Awaited<ReturnType<typeof activeTaxonomy>>,
) {
  if (post.categoryId) {
    const category = taxonomy.categories.get(post.categoryId);
    if (!category || category.locale !== post.locale) {
      throw new Error("Selecteer een actieve categorie in dezelfde taal.");
    }
  }
  for (const tagId of post.tagIds) {
    const tag = taxonomy.tags.get(tagId);
    if (!tag || tag.locale !== post.locale) {
      throw new Error("Selecteer alleen actieve tags in dezelfde taal.");
    }
  }
}

async function replacePostTags(
  client: PoolClient,
  input: {
    tenantId: string;
    siteId: string;
    postId: string;
    actorUserId: string;
    tagIds: string[];
  },
) {
  await client.query(
    `DELETE FROM public.website_blog_post_tags
     WHERE tenant_id = $1 AND site_id = $2 AND post_id = $3`,
    [input.tenantId, input.siteId, input.postId],
  );
  for (const tagId of input.tagIds) {
    await client.query(
      `INSERT INTO public.website_blog_post_tags (
         tenant_id, site_id, post_id, tag_id, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $5)`,
      [input.tenantId, input.siteId, input.postId, tagId, input.actorUserId],
    );
  }
}

export async function loadWebsiteBlogSource(
  query: Queryable,
  tenantId: string,
  siteId: string,
): Promise<WebsiteBlogSource> {
  const categoryResult = await query.query<{
    id: string;
    locale: string;
    name: string;
    slug: string;
    description: string | null;
    is_active: boolean;
  }>(
    `SELECT id, locale, name, slug, description, is_active
     FROM public.website_blog_categories
     WHERE tenant_id = $1 AND site_id = $2
     ORDER BY locale, slug, id`,
    [tenantId, siteId],
  );
  const tagResult = await query.query<{
    id: string;
    locale: string;
    name: string;
    slug: string;
    is_active: boolean;
  }>(
    `SELECT id, locale, name, slug, is_active
     FROM public.website_blog_tags
     WHERE tenant_id = $1 AND site_id = $2
     ORDER BY locale, slug, id`,
    [tenantId, siteId],
  );
  const postResult = await query.query<{
    id: string;
    locale: string;
    title: string;
    slug: string;
    excerpt: string;
    body: unknown;
    category_id: string | null;
    seo: unknown;
    status: ContentStatus;
    published_at: Date | string | null;
    updated_at: Date | string;
  }>(
    `SELECT id, locale, title, slug, excerpt, body, category_id, seo,
            status, published_at, updated_at
     FROM public.website_blog_posts
     WHERE tenant_id = $1 AND site_id = $2
     ORDER BY locale, slug, id`,
    [tenantId, siteId],
  );
  const postTagResult = await query.query<{
    post_id: string;
    tag_id: string;
  }>(
    `SELECT post_id, tag_id
     FROM public.website_blog_post_tags
     WHERE tenant_id = $1 AND site_id = $2
     ORDER BY post_id, tag_id`,
    [tenantId, siteId],
  );
  const tagsByPost = new Map<string, string[]>();
  for (const relation of postTagResult.rows) {
    const values = tagsByPost.get(relation.post_id) ?? [];
    values.push(relation.tag_id);
    tagsByPost.set(relation.post_id, values);
  }
  return websiteBlogSourceSchema.parse({
    categories: categoryResult.rows.map((row) => ({
      id: row.id,
      locale: row.locale,
      name: row.name,
      slug: row.slug,
      description: row.description,
      isActive: row.is_active,
    })),
    tags: tagResult.rows.map((row) => ({
      id: row.id,
      locale: row.locale,
      name: row.name,
      slug: row.slug,
      isActive: row.is_active,
    })),
    posts: postResult.rows.map((row) => ({
      id: row.id,
      locale: row.locale,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      body: row.body,
      categoryId: row.category_id,
      tagIds: tagsByPost.get(row.id) ?? [],
      seo: row.seo,
      status: row.status,
      publishedAt: row.published_at ? asIsoString(row.published_at) : null,
      updatedAt: asIsoString(row.updated_at),
    })),
  });
}

export async function getWebsiteBlog(
  tenantId: string,
): Promise<WebsiteBlogView | null> {
  const parsedTenantId = tenantIdSchema.parse(tenantId);
  const siteResult = await pool.query<{
    id: string;
    name: string;
    authoring_revision: number;
    delivery_mode: DeliveryMode;
    default_locale: string;
    has_blog_index: boolean;
  }>(
    `SELECT site.id, site.name, site.authoring_revision, site.delivery_mode,
            site.default_locale,
            EXISTS (
              SELECT 1 FROM public.website_pages page
              WHERE page.tenant_id = site.tenant_id
                AND page.site_id = site.id
                AND page.locale = site.default_locale
                AND page.page_type = 'blog_index'
                AND page.path = '/blog'
                AND page.status = 'published'
            ) AS has_blog_index
     FROM public.website_sites site
     JOIN public.tenants tenant ON tenant.id = site.tenant_id
     WHERE site.tenant_id = $1
       AND site.is_primary = true
       AND site.status <> 'disabled'
       AND tenant.is_active = true
       AND tenant.status IN ('trial', 'active')
       AND EXISTS (
         SELECT 1
         FROM public.tenant_modules entitlement
         JOIN public.modules module ON module.id = entitlement.module_id
         WHERE entitlement.tenant_id = site.tenant_id
           AND module.key = 'website'
           AND entitlement.is_enabled = true
       )
     LIMIT 1`,
    [parsedTenantId],
  );
  const site = siteResult.rows[0];
  if (!site) return null;
  const [blog, revisionResult] = await Promise.all([
    loadWebsiteBlogSource(pool, parsedTenantId, site.id),
    pool.query<{ id: string; authoring_revision: number }>(
      `SELECT id, authoring_revision
       FROM public.website_blog_posts
       WHERE tenant_id = $1 AND site_id = $2`,
      [parsedTenantId, site.id],
    ),
  ]);
  const revisions = new Map(
    revisionResult.rows.map((row) => [row.id, Number(row.authoring_revision)]),
  );
  return {
    siteId: site.id,
    siteName: site.name,
    authoringRevision: Number(site.authoring_revision),
    deliveryMode: site.delivery_mode,
    defaultLocale: site.default_locale,
    hasBlogIndex: site.has_blog_index,
    categories: blog.categories,
    tags: blog.tags,
    posts: blog.posts.map((post) => ({
      id: post.id,
      locale: post.locale,
      title: post.title,
      slug: post.slug,
      path: websiteBlogPostPath(post.slug),
      excerpt: post.excerpt,
      status: post.status,
      authoringRevision: revisions.get(post.id) ?? 1,
      categoryId: post.categoryId,
      tagIds: post.tagIds,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
    })),
  };
}

export async function getWebsiteBlogPost(
  tenantId: string,
  postId: string,
): Promise<WebsiteBlogPostDetail | null> {
  const [parsedTenantId, parsedPostId] = [
    tenantIdSchema.parse(tenantId),
    z.string().uuid().parse(postId),
  ];
  const result = await pool.query<{
    id: string;
    site_id: string;
    site_name: string;
    site_authoring_revision: number;
    locale: string;
    title: string;
    slug: string;
    path: string;
    excerpt: string;
    body: WebsiteRichTextDocument;
    category_id: string | null;
    seo: WebsiteSeo;
    status: ContentStatus;
    authoring_revision: number;
    published_at: Date | string | null;
    updated_at: Date | string;
  }>(
    `SELECT post.id, post.site_id, site.name AS site_name,
            site.authoring_revision AS site_authoring_revision,
            post.locale, post.title, post.slug, post.path, post.excerpt,
            post.body, post.category_id, post.seo, post.status,
            post.authoring_revision, post.published_at, post.updated_at
     FROM public.website_blog_posts post
     JOIN public.website_sites site
       ON site.tenant_id = post.tenant_id AND site.id = post.site_id
     WHERE post.tenant_id = $1 AND post.id = $2
       AND site.is_primary = true AND site.status <> 'disabled'
     LIMIT 1`,
    [parsedTenantId, parsedPostId],
  );
  const post = result.rows[0];
  if (!post) return null;
  const tagResult = await pool.query<{ tag_id: string }>(
    `SELECT tag_id FROM public.website_blog_post_tags
     WHERE tenant_id = $1 AND site_id = $2 AND post_id = $3
     ORDER BY tag_id`,
    [parsedTenantId, post.site_id, post.id],
  );
  return {
    id: post.id,
    siteId: post.site_id,
    siteName: post.site_name,
    siteAuthoringRevision: Number(post.site_authoring_revision),
    locale: post.locale,
    title: post.title,
    slug: post.slug,
    path: post.path,
    excerpt: post.excerpt,
    body: post.body,
    categoryId: post.category_id,
    tagIds: tagResult.rows.map((row) => row.tag_id),
    seo: websiteSeoSchema.parse(post.seo),
    status: post.status,
    authoringRevision: Number(post.authoring_revision),
    publishedAt: post.published_at ? asIsoString(post.published_at) : null,
    updatedAt: asIsoString(post.updated_at),
  };
}

function canonicalTaxonomy(
  taxonomy: z.infer<typeof websiteBlogTaxonomyDraftSchema>,
): string {
  return JSON.stringify({
    categories: [...taxonomy.categories].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    tags: [...taxonomy.tags].sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export async function replaceWebsiteBlogTaxonomy(
  rawInput: z.input<typeof replaceTaxonomyInputSchema>,
): Promise<{ authoringRevision: number; changed: boolean }> {
  const input = replaceTaxonomyInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    const site = await lockSite(client, input);
    const current = await loadWebsiteBlogSource(
      client,
      input.tenantId,
      input.siteId,
    );
    if (
      canonicalTaxonomy({
        categories: current.categories,
        tags: current.tags,
      }) === canonicalTaxonomy(input.taxonomy)
    ) {
      return {
        authoringRevision: Number(site.authoring_revision),
        changed: false,
      };
    }

    const activeCategories = new Map(
      input.taxonomy.categories
        .filter((item) => item.isActive)
        .map((item) => [item.id, item.locale]),
    );
    const activeTags = new Map(
      input.taxonomy.tags
        .filter((item) => item.isActive)
        .map((item) => [item.id, item.locale]),
    );
    const used = await client.query<{
      locale: string;
      category_id: string | null;
      tag_id: string | null;
    }>(
      `SELECT post.locale, post.category_id, relation.tag_id
       FROM public.website_blog_posts post
       LEFT JOIN public.website_blog_post_tags relation
         ON relation.tenant_id = post.tenant_id
        AND relation.site_id = post.site_id
        AND relation.post_id = post.id
       WHERE post.tenant_id = $1 AND post.site_id = $2
         AND post.status <> 'archived'`,
      [input.tenantId, input.siteId],
    );
    for (const reference of used.rows) {
      if (
        (reference.category_id &&
          activeCategories.get(reference.category_id) !== reference.locale) ||
        (reference.tag_id &&
          activeTags.get(reference.tag_id) !== reference.locale)
      ) {
        throw new Error(
          "Een gebruikte categorie of tag kan niet worden verwijderd of gedeactiveerd.",
        );
      }
    }

    const desiredIds = [
      ...input.taxonomy.categories.map((item) => item.id),
      ...input.taxonomy.tags.map((item) => item.id),
    ];
    const conflict = await client.query(
      `SELECT 1
       FROM (
         SELECT id, tenant_id, site_id FROM public.website_blog_categories
         UNION ALL
         SELECT id, tenant_id, site_id FROM public.website_blog_tags
       ) item
       WHERE item.id = ANY($1::uuid[])
         AND (item.tenant_id <> $2 OR item.site_id <> $3)
       LIMIT 1`,
      [desiredIds, input.tenantId, input.siteId],
    );
    if (conflict.rowCount) {
      throw new Error("Blogtaxonomie hoort bij een andere website.");
    }

    await beginBlogMutation(client);
    await client.query(
      `DELETE FROM public.website_blog_categories
       WHERE tenant_id = $1 AND site_id = $2
         AND NOT (id = ANY($3::uuid[]))`,
      [
        input.tenantId,
        input.siteId,
        input.taxonomy.categories.map((item) => item.id),
      ],
    );
    await client.query(
      `DELETE FROM public.website_blog_tags
       WHERE tenant_id = $1 AND site_id = $2
         AND NOT (id = ANY($3::uuid[]))`,
      [
        input.tenantId,
        input.siteId,
        input.taxonomy.tags.map((item) => item.id),
      ],
    );
    for (const category of input.taxonomy.categories) {
      await client.query(
        `INSERT INTO public.website_blog_categories (
           id, tenant_id, site_id, locale, name, slug, path, description,
           is_active, created_by, updated_by
         ) VALUES ($4, $1, $2, $5, $6, $7, $8, $9, $10, $3, $3)
         ON CONFLICT (id) DO UPDATE
         SET locale = EXCLUDED.locale,
             name = EXCLUDED.name,
             slug = EXCLUDED.slug,
             path = EXCLUDED.path,
             description = EXCLUDED.description,
             is_active = EXCLUDED.is_active,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
         WHERE website_blog_categories.tenant_id = EXCLUDED.tenant_id
           AND website_blog_categories.site_id = EXCLUDED.site_id`,
        [
          input.tenantId,
          input.siteId,
          input.actorUserId,
          category.id,
          category.locale,
          category.name,
          category.slug,
          websiteBlogCategoryPath(category.slug),
          category.description,
          category.isActive,
        ],
      );
    }
    for (const tag of input.taxonomy.tags) {
      await client.query(
        `INSERT INTO public.website_blog_tags (
           id, tenant_id, site_id, locale, name, slug, path, is_active,
           created_by, updated_by
         ) VALUES ($4, $1, $2, $5, $6, $7, $8, $9, $3, $3)
         ON CONFLICT (id) DO UPDATE
         SET locale = EXCLUDED.locale,
             name = EXCLUDED.name,
             slug = EXCLUDED.slug,
             path = EXCLUDED.path,
             is_active = EXCLUDED.is_active,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
         WHERE website_blog_tags.tenant_id = EXCLUDED.tenant_id
           AND website_blog_tags.site_id = EXCLUDED.site_id`,
        [
          input.tenantId,
          input.siteId,
          input.actorUserId,
          tag.id,
          tag.locale,
          tag.name,
          tag.slug,
          websiteBlogTagPath(tag.slug),
          tag.isActive,
        ],
      );
    }
    const revision = await finishBlogMutation(
      client,
      input,
      "website_blog_taxonomy_replaced",
      {
        categories: input.taxonomy.categories.length,
        tags: input.taxonomy.tags.length,
      },
    );
    return { authoringRevision: revision, changed: true };
  });
}

export async function createWebsiteBlogPost(
  rawInput: z.input<typeof createPostInputSchema>,
): Promise<{ id: string; authoringRevision: number }> {
  const input = createPostInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    await lockSite(client, input);
    const taxonomy = await activeTaxonomy(client, input.tenantId, input.siteId);
    assertPostTaxonomy(input.post, taxonomy);
    await beginBlogMutation(client);
    const id = randomUUID();
    await client.query(
      `INSERT INTO public.website_blog_posts (
         id, tenant_id, site_id, locale, title, slug, path, excerpt, body,
         category_id, seo, status, authoring_revision, created_by, updated_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb,
         'draft', 1, $12, $12
       )`,
      [
        id,
        input.tenantId,
        input.siteId,
        input.post.locale,
        input.post.title,
        input.post.slug,
        websiteBlogPostPath(input.post.slug),
        input.post.excerpt,
        JSON.stringify(input.post.body),
        input.post.categoryId,
        JSON.stringify(input.post.seo),
        input.actorUserId,
      ],
    );
    await replacePostTags(client, {
      tenantId: input.tenantId,
      siteId: input.siteId,
      postId: id,
      actorUserId: input.actorUserId,
      tagIds: input.post.tagIds,
    });
    const authoringRevision = await finishBlogMutation(
      client,
      input,
      "website_blog_post_created",
      { postId: id, path: websiteBlogPostPath(input.post.slug) },
    );
    return { id, authoringRevision };
  });
}

export async function updateWebsiteBlogPost(
  rawInput: z.input<typeof updatePostInputSchema>,
): Promise<{
  authoringRevision: number;
  postAuthoringRevision: number;
  changed: boolean;
}> {
  const input = updatePostInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    const site = await lockSite(client, input);
    const currentResult = await client.query<{
      locale: string;
      title: string;
      slug: string;
      excerpt: string;
      body: unknown;
      category_id: string | null;
      seo: unknown;
      status: ContentStatus;
      authoring_revision: number;
    }>(
      `SELECT locale, title, slug, excerpt, body, category_id, seo, status,
              authoring_revision
       FROM public.website_blog_posts
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3
         AND status <> 'archived'
       FOR UPDATE`,
      [input.tenantId, input.siteId, input.postId],
    );
    const current = requireOne(currentResult.rows, "Blogbericht niet gevonden");
    if (Number(current.authoring_revision) !== input.expectedPostRevision) {
      throw new Error("Blogbericht is intussen gewijzigd. Laad opnieuw.");
    }
    const tagResult = await client.query<{ tag_id: string }>(
      `SELECT tag_id FROM public.website_blog_post_tags
       WHERE tenant_id = $1 AND site_id = $2 AND post_id = $3
       ORDER BY tag_id`,
      [input.tenantId, input.siteId, input.postId],
    );
    const currentDraft = websiteBlogPostDraftSchema.parse({
      locale: current.locale,
      title: current.title,
      slug: current.slug,
      excerpt: current.excerpt,
      body: current.body,
      categoryId: current.category_id,
      tagIds: tagResult.rows.map((row) => row.tag_id),
      seo: current.seo,
    });
    if (JSON.stringify(currentDraft) === JSON.stringify(input.post)) {
      return {
        authoringRevision: Number(site.authoring_revision),
        postAuthoringRevision: Number(current.authoring_revision),
        changed: false,
      };
    }
    const taxonomy = await activeTaxonomy(client, input.tenantId, input.siteId);
    assertPostTaxonomy(input.post, taxonomy);
    await beginBlogMutation(client);
    const result = await client.query<{ authoring_revision: number }>(
      `UPDATE public.website_blog_posts
       SET locale = $6,
           title = $7,
           slug = $8,
           path = $9,
           excerpt = $10,
           body = $11::jsonb,
           category_id = $12,
           seo = $13::jsonb,
           status = 'draft',
           published_at = NULL,
           authoring_revision = authoring_revision + 1,
           updated_by = $5,
           updated_at = now()
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3
         AND authoring_revision = $4 AND status <> 'archived'
       RETURNING authoring_revision`,
      [
        input.tenantId,
        input.siteId,
        input.postId,
        input.expectedPostRevision,
        input.actorUserId,
        input.post.locale,
        input.post.title,
        input.post.slug,
        websiteBlogPostPath(input.post.slug),
        input.post.excerpt,
        JSON.stringify(input.post.body),
        input.post.categoryId,
        JSON.stringify(input.post.seo),
      ],
    );
    const postRevision = Number(
      requireOne(
        result.rows,
        "Blogbericht is intussen gewijzigd. Laad opnieuw.",
      ).authoring_revision,
    );
    await replacePostTags(client, {
      tenantId: input.tenantId,
      siteId: input.siteId,
      postId: input.postId,
      actorUserId: input.actorUserId,
      tagIds: input.post.tagIds,
    });
    const authoringRevision = await finishBlogMutation(
      client,
      input,
      "website_blog_post_updated",
      {
        postId: input.postId,
        postRevision,
        previousStatus: current.status,
        status: "draft",
      },
    );
    return {
      authoringRevision,
      postAuthoringRevision: postRevision,
      changed: true,
    };
  });
}

export async function publishWebsiteBlogPost(
  rawInput: z.input<typeof transitionPostInputSchema>,
): Promise<{ authoringRevision: number; postAuthoringRevision: number }> {
  const input = transitionPostInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    await lockSite(client, input);
    const postResult = await client.query<{
      locale: string;
      category_id: string | null;
      status: ContentStatus;
      authoring_revision: number;
    }>(
      `SELECT locale, category_id, status, authoring_revision
       FROM public.website_blog_posts
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3
       FOR UPDATE`,
      [input.tenantId, input.siteId, input.postId],
    );
    const post = requireOne(postResult.rows, "Blogbericht niet gevonden");
    if (Number(post.authoring_revision) !== input.expectedPostRevision) {
      throw new Error("Blogbericht is intussen gewijzigd. Laad opnieuw.");
    }
    if (post.status !== "draft") {
      throw new Error("Alleen een conceptblogbericht kan worden gepubliceerd.");
    }
    const taxonomy = await activeTaxonomy(client, input.tenantId, input.siteId);
    const tagResult = await client.query<{ tag_id: string }>(
      `SELECT tag_id FROM public.website_blog_post_tags
       WHERE tenant_id = $1 AND site_id = $2 AND post_id = $3`,
      [input.tenantId, input.siteId, input.postId],
    );
    assertPostTaxonomy(
      {
        locale: post.locale,
        categoryId: post.category_id,
        tagIds: tagResult.rows.map((row) => row.tag_id),
      },
      taxonomy,
    );
    await beginBlogMutation(client);
    const result = await client.query<{ authoring_revision: number }>(
      `UPDATE public.website_blog_posts
       SET status = 'published',
           published_at = transaction_timestamp(),
           archived_at = NULL,
           authoring_revision = authoring_revision + 1,
           updated_by = $5,
           updated_at = now()
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3
         AND authoring_revision = $4 AND status = 'draft'
       RETURNING authoring_revision`,
      [
        input.tenantId,
        input.siteId,
        input.postId,
        input.expectedPostRevision,
        input.actorUserId,
      ],
    );
    const postRevision = Number(
      requireOne(result.rows, "Blogbericht kon niet worden gepubliceerd.")
        .authoring_revision,
    );
    const authoringRevision = await finishBlogMutation(
      client,
      input,
      "website_blog_post_published",
      { postId: input.postId, postRevision, scheduling: false },
    );
    return { authoringRevision, postAuthoringRevision: postRevision };
  });
}

export async function archiveWebsiteBlogPost(
  rawInput: z.input<typeof transitionPostInputSchema>,
): Promise<{ authoringRevision: number; postAuthoringRevision: number }> {
  const input = transitionPostInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    await lockSite(client, input);
    await beginBlogMutation(client);
    const result = await client.query<{ authoring_revision: number }>(
      `UPDATE public.website_blog_posts
       SET status = 'archived',
           published_at = NULL,
           archived_at = transaction_timestamp(),
           authoring_revision = authoring_revision + 1,
           updated_by = $5,
           updated_at = now()
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3
         AND authoring_revision = $4 AND status <> 'archived'
       RETURNING authoring_revision`,
      [
        input.tenantId,
        input.siteId,
        input.postId,
        input.expectedPostRevision,
        input.actorUserId,
      ],
    );
    const postRevision = Number(
      requireOne(
        result.rows,
        "Blogbericht is intussen gewijzigd of gearchiveerd.",
      ).authoring_revision,
    );
    const authoringRevision = await finishBlogMutation(
      client,
      input,
      "website_blog_post_archived",
      { postId: input.postId, postRevision },
    );
    return { authoringRevision, postAuthoringRevision: postRevision };
  });
}

export type ReplaceWebsiteBlogTaxonomyInput = z.input<
  typeof replaceTaxonomyInputSchema
>;
export type CreateWebsiteBlogPostInput = z.input<typeof createPostInputSchema>;
export type UpdateWebsiteBlogPostInput = z.input<typeof updatePostInputSchema>;
export type TransitionWebsiteBlogPostInput = z.input<
  typeof transitionPostInputSchema
>;

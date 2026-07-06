import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import {
  canReadPublishedContent,
  normalizeVisibilityContext,
  type FieldgridContentVisibilityContext,
} from "./content-visibility";
import {
  kbArticleAudiencesTable,
  kbArticleMediaTable,
  kbArticleModulesTable,
  kbArticlePermissionsTable,
  kbArticleRelatedTable,
  kbArticlesTable,
  kbCategoriesTable,
  kbSearchEventsTable,
  modulesTable,
  type FieldgridContentAudience,
  type KbArticle,
  type KbArticleMedia,
} from "./schema";
import { isTenantModuleEnabled } from "./tenant-entitlements";

export type KnowledgebaseCategorySummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  moduleKey: string | null;
  sortOrder: number;
};

export type KnowledgebaseArticleSummary = {
  id: string;
  tenantId: string | null;
  scope: "platform_global" | "tenant";
  title: string;
  slug: string;
  summary: string | null;
  contentHtml: string | null;
  contentText: string | null;
  keywords: string[];
  smartTerms: string[];
  status: "draft" | "published" | "archived";
  featured: boolean;
  language: string;
  publishedAt: string | null;
  updatedAt: string;
  archivedAt: string | null;
  category: KnowledgebaseCategorySummary | null;
  audienceKeys: FieldgridContentAudience[];
  moduleKeys: string[];
  requiredModuleKeys: string[];
  permissionKeys: string[];
  media: KnowledgebaseArticleMediaSummary[];
  relatedArticles: KnowledgebaseRelatedArticleSummary[];
};

export type KnowledgebaseArticleMediaSummary = {
  id: string;
  mediaType: "image" | "video" | "attachment";
  storagePath: string;
  publicUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  altText: string | null;
  caption: string | null;
  sortOrder: number;
};

export type KnowledgebaseRelatedArticleSummary = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
};

export type KnowledgebaseHelpIndex = {
  articles: KnowledgebaseArticleSummary[];
  categories: Array<KnowledgebaseCategorySummary & { articleCount: number }>;
  featured: KnowledgebaseArticleSummary[];
  recent: KnowledgebaseArticleSummary[];
};

export type KnowledgebaseListOptions = {
  query?: string | null;
  language?: string | null;
  includeUnpublished?: boolean;
  includeArchived?: boolean;
  limit?: number;
};

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function arrayFromJson(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function searchableText(article: KnowledgebaseArticleSummary): string {
  return normalizeSearch(
    [
      article.title,
      article.summary,
      article.contentText,
      article.category?.name,
      article.category?.description,
      ...article.keywords,
      ...article.smartTerms,
    ].filter(Boolean).join(" "),
  );
}

function matchesQuery(article: KnowledgebaseArticleSummary, query: string | null | undefined): boolean {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  return normalized.split(/\s+/).every((part) => searchableText(article).includes(part));
}

function categoryFromRow(row: {
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  categoryDescription: string | null;
  categoryModuleKey: string | null;
  categorySortOrder: number | null;
}): KnowledgebaseCategorySummary | null {
  if (!row.categoryId || !row.categoryName || !row.categorySlug) return null;
  return {
    id: row.categoryId,
    name: row.categoryName,
    slug: row.categorySlug,
    description: row.categoryDescription,
    moduleKey: row.categoryModuleKey,
    sortOrder: row.categorySortOrder ?? 0,
  };
}

async function loadArticleRelations(articleIds: string[]) {
  if (articleIds.length === 0) {
    return {
      audiences: new Map<string, FieldgridContentAudience[]>(),
      modules: new Map<string, Array<{ moduleKey: string; isRequired: boolean }>>(),
      permissions: new Map<string, string[]>(),
      media: new Map<string, KnowledgebaseArticleMediaSummary[]>(),
      related: new Map<string, KnowledgebaseRelatedArticleSummary[]>(),
    };
  }

  const [audienceRows, moduleRows, permissionRows, mediaRows, relatedRows] = await Promise.all([
    db
      .select({
        articleId: kbArticleAudiencesTable.articleId,
        audienceKey: kbArticleAudiencesTable.audienceKey,
      })
      .from(kbArticleAudiencesTable)
      .where(inArray(kbArticleAudiencesTable.articleId, articleIds)),
    db
      .select({
        articleId: kbArticleModulesTable.articleId,
        moduleKey: kbArticleModulesTable.moduleKey,
        isRequired: kbArticleModulesTable.isRequired,
      })
      .from(kbArticleModulesTable)
      .where(inArray(kbArticleModulesTable.articleId, articleIds)),
    db
      .select({
        articleId: kbArticlePermissionsTable.articleId,
        permissionKey: kbArticlePermissionsTable.permissionKey,
      })
      .from(kbArticlePermissionsTable)
      .where(inArray(kbArticlePermissionsTable.articleId, articleIds)),
    db
      .select()
      .from(kbArticleMediaTable)
      .where(inArray(kbArticleMediaTable.articleId, articleIds))
      .orderBy(asc(kbArticleMediaTable.sortOrder), asc(kbArticleMediaTable.createdAt)),
    db
      .select({
        articleId: kbArticleRelatedTable.articleId,
        relatedArticleId: kbArticleRelatedTable.relatedArticleId,
        sortOrder: kbArticleRelatedTable.sortOrder,
        title: kbArticlesTable.title,
        slug: kbArticlesTable.slug,
        summary: kbArticlesTable.summary,
      })
      .from(kbArticleRelatedTable)
      .innerJoin(kbArticlesTable, eq(kbArticleRelatedTable.relatedArticleId, kbArticlesTable.id))
      .where(inArray(kbArticleRelatedTable.articleId, articleIds))
      .orderBy(asc(kbArticleRelatedTable.sortOrder)),
  ]);

  const audiences = new Map<string, FieldgridContentAudience[]>();
  for (const row of audienceRows) {
    const list = audiences.get(row.articleId) ?? [];
    list.push(row.audienceKey);
    audiences.set(row.articleId, list);
  }

  const modules = new Map<string, Array<{ moduleKey: string; isRequired: boolean }>>();
  for (const row of moduleRows) {
    const list = modules.get(row.articleId) ?? [];
    list.push({ moduleKey: row.moduleKey, isRequired: row.isRequired });
    modules.set(row.articleId, list);
  }

  const permissions = new Map<string, string[]>();
  for (const row of permissionRows) {
    const list = permissions.get(row.articleId) ?? [];
    list.push(row.permissionKey);
    permissions.set(row.articleId, list);
  }

  const media = new Map<string, KnowledgebaseArticleMediaSummary[]>();
  for (const row of mediaRows) {
    const list = media.get(row.articleId) ?? [];
    list.push(mapMedia(row));
    media.set(row.articleId, list);
  }

  const related = new Map<string, KnowledgebaseRelatedArticleSummary[]>();
  for (const row of relatedRows) {
    const list = related.get(row.articleId) ?? [];
    list.push({
      id: row.relatedArticleId,
      title: row.title,
      slug: row.slug,
      summary: row.summary,
    });
    related.set(row.articleId, list);
  }

  return { audiences, modules, permissions, media, related };
}

function mapMedia(row: KbArticleMedia): KnowledgebaseArticleMediaSummary {
  return {
    id: row.id,
    mediaType: row.mediaType,
    storagePath: row.storagePath,
    publicUrl: row.publicUrl,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    altText: row.altText,
    caption: row.caption,
    sortOrder: row.sortOrder,
  };
}

export async function listEnabledKnowledgebaseModuleKeysForTenant(tenantId: string): Promise<string[]> {
  const modules = await db
    .select({ key: modulesTable.key })
    .from(modulesTable)
    .orderBy(asc(modulesTable.key));

  const enabled = await Promise.all(
    modules.map(async (module) => ({
      key: module.key,
      enabled: await isTenantModuleEnabled(tenantId, module.key),
    })),
  );

  return enabled.filter((entry) => entry.enabled).map((entry) => entry.key);
}

export async function listKnowledgebaseArticlesForContext(
  context: FieldgridContentVisibilityContext,
  options: KnowledgebaseListOptions = {},
): Promise<KnowledgebaseArticleSummary[]> {
  const normalizedContext = normalizeVisibilityContext(context);
  const language = options.language?.trim() || "nl";
  const conditions = [eq(kbArticlesTable.language, language)];

  if (!options.includeArchived) {
    conditions.push(eq(kbArticlesTable.status, "published"));
  } else if (!options.includeUnpublished && !normalizedContext.isPlatformAdmin) {
    conditions.push(eq(kbArticlesTable.status, "published"));
  }

  const rows = await db
    .select({
      id: kbArticlesTable.id,
      tenantId: kbArticlesTable.tenantId,
      scope: kbArticlesTable.scope,
      categoryId: kbArticlesTable.categoryId,
      title: kbArticlesTable.title,
      slug: kbArticlesTable.slug,
      summary: kbArticlesTable.summary,
      contentHtml: kbArticlesTable.contentHtml,
      contentText: kbArticlesTable.contentText,
      keywords: kbArticlesTable.keywords,
      smartTerms: kbArticlesTable.smartTerms,
      status: kbArticlesTable.status,
      featured: kbArticlesTable.featured,
      language: kbArticlesTable.language,
      publishedAt: kbArticlesTable.publishedAt,
      updatedAt: kbArticlesTable.updatedAt,
      archivedAt: kbArticlesTable.archivedAt,
      categoryName: kbCategoriesTable.name,
      categorySlug: kbCategoriesTable.slug,
      categoryDescription: kbCategoriesTable.description,
      categoryModuleKey: kbCategoriesTable.moduleKey,
      categorySortOrder: kbCategoriesTable.sortOrder,
    })
    .from(kbArticlesTable)
    .leftJoin(kbCategoriesTable, eq(kbArticlesTable.categoryId, kbCategoriesTable.id))
    .where(and(...conditions))
    .orderBy(desc(kbArticlesTable.featured), desc(kbArticlesTable.publishedAt), desc(kbArticlesTable.updatedAt));

  const relations = await loadArticleRelations(rows.map((row) => row.id));

  const articles = rows.map((row): KnowledgebaseArticleSummary => {
    const category = categoryFromRow(row);
    const articleModules = relations.modules.get(row.id) ?? [];
    const moduleKeys = uniqueStrings([
      ...articleModules.map((entry) => entry.moduleKey),
      category?.moduleKey ?? null,
    ]);
    const requiredModuleKeys = uniqueStrings(
      articleModules.filter((entry) => entry.isRequired).map((entry) => entry.moduleKey),
    );

    return {
      id: row.id,
      tenantId: row.tenantId,
      scope: row.scope,
      title: row.title,
      slug: row.slug,
      summary: row.summary,
      contentHtml: row.contentHtml,
      contentText: row.contentText,
      keywords: arrayFromJson(row.keywords),
      smartTerms: arrayFromJson(row.smartTerms),
      status: row.status,
      featured: row.featured,
      language: row.language,
      publishedAt: iso(row.publishedAt),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: iso(row.archivedAt),
      category,
      audienceKeys: relations.audiences.get(row.id) ?? [],
      moduleKeys,
      requiredModuleKeys,
      permissionKeys: relations.permissions.get(row.id) ?? [],
      media: relations.media.get(row.id) ?? [],
      relatedArticles: relations.related.get(row.id) ?? [],
    };
  });

  const visibleArticles = articles
    .filter((article) => {
      if (normalizedContext.isPlatformAdmin && options.includeUnpublished) return true;
      return canReadPublishedContent(normalizedContext, {
        scope: article.scope,
        tenantId: article.tenantId,
        status: article.status,
        archivedAt: article.archivedAt,
        audienceKeys: article.audienceKeys,
        moduleKeys: article.moduleKeys,
        requiredModuleKeys: article.requiredModuleKeys,
        permissionKeys: article.permissionKeys,
      });
    })
    .filter((article) => matchesQuery(article, options.query));

  return typeof options.limit === "number" ? visibleArticles.slice(0, options.limit) : visibleArticles;
}

export async function getKnowledgebaseArticleBySlugForContext(
  context: FieldgridContentVisibilityContext,
  slug: string,
  options: Omit<KnowledgebaseListOptions, "query" | "limit"> = {},
): Promise<KnowledgebaseArticleSummary | null> {
  const articles = await listKnowledgebaseArticlesForContext(context, options);
  return articles.find((article) => article.slug === slug) ?? null;
}

export async function getKnowledgebaseArticleByIdForContext(
  context: FieldgridContentVisibilityContext,
  id: string,
  options: Omit<KnowledgebaseListOptions, "query" | "limit"> = {},
): Promise<KnowledgebaseArticleSummary | null> {
  const articles = await listKnowledgebaseArticlesForContext(context, options);
  return articles.find((article) => article.id === id) ?? null;
}

export async function listKnowledgebaseHelpIndexForContext(
  context: FieldgridContentVisibilityContext,
  options: KnowledgebaseListOptions = {},
): Promise<KnowledgebaseHelpIndex> {
  const articles = await listKnowledgebaseArticlesForContext(context, options);
  const categories = new Map<string, KnowledgebaseCategorySummary & { articleCount: number }>();

  for (const article of articles) {
    if (!article.category) continue;
    const current = categories.get(article.category.id);
    categories.set(article.category.id, {
      ...article.category,
      articleCount: (current?.articleCount ?? 0) + 1,
    });
  }

  return {
    articles,
    categories: [...categories.values()].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)),
    featured: articles.filter((article) => article.featured).slice(0, 6),
    recent: [...articles]
      .sort((left, right) => new Date(right.publishedAt ?? right.updatedAt).getTime() - new Date(left.publishedAt ?? left.updatedAt).getTime())
      .slice(0, 8),
  };
}

export async function recordKnowledgebaseSearchEvent(input: {
  tenantId?: string | null;
  audienceKey: FieldgridContentAudience;
  query: string;
  resultCount: number;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const query = input.query.trim();
  if (!query) return;

  await db.insert(kbSearchEventsTable).values({
    tenantId: input.tenantId ?? null,
    audienceKey: input.audienceKey,
    query,
    resultCount: input.resultCount,
    metadata: input.metadata ?? null,
  });
}

export function articlePlainText(article: Pick<KbArticle, "contentHtml" | "contentText">): string {
  if (article.contentText?.trim()) return article.contentText.trim();
  return (article.contentHtml ?? "")
    .replace(/<\/(p|h1|h2|h3|h4|li|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

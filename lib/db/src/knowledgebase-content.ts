import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
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

export type KnowledgebaseMediaAccess = KnowledgebaseArticleMediaSummary & {
  articleId: string;
  articleSlug: string;
  articleTitle: string;
};

export type KnowledgebaseRelatedArticleSummary = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  relationType?: "manual" | "suggested";
  score?: number;
};

export type KnowledgebaseSearchSuggestion = {
  type: "article" | "category" | "term";
  label: string;
  value: string;
  href?: string;
  description?: string | null;
  score: number;
};

export type KnowledgebaseHelpIndex = {
  articles: KnowledgebaseArticleSummary[];
  categories: Array<KnowledgebaseCategorySummary & { articleCount: number }>;
  featured: KnowledgebaseArticleSummary[];
  recent: KnowledgebaseArticleSummary[];
  suggestions: KnowledgebaseSearchSuggestion[];
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
      article.category?.moduleKey,
      ...article.moduleKeys,
      ...article.requiredModuleKeys,
      ...article.keywords,
      ...article.smartTerms,
    ].filter(Boolean).join(" "),
  );
}

function tokenSet(value: string | null | undefined): Set<string> {
  return new Set(normalizeSearch(value).split(/\s+/).filter((token) => token.length >= 2));
}

function intersectCount(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const values = new Set(left);
  return right.filter((value) => values.has(value)).length;
}

function queryTokens(query: string | null | undefined): string[] {
  return normalizeSearch(query).split(/\s+/).filter((token) => token.length > 0);
}

function matchesQuery(article: KnowledgebaseArticleSummary, query: string | null | undefined): boolean {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return true;
  const text = searchableText(article);
  return tokens.every((part) => text.includes(part));
}

function searchScore(article: KnowledgebaseArticleSummary, query: string | null | undefined): number {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return article.featured ? 10 : 0;

  const title = normalizeSearch(article.title);
  const summary = normalizeSearch(article.summary);
  const category = normalizeSearch(article.category?.name);
  const modules = [...article.moduleKeys, ...article.requiredModuleKeys].map(normalizeSearch);
  const keywords = article.keywords.map(normalizeSearch);
  const smartTerms = article.smartTerms.map(normalizeSearch);
  const content = normalizeSearch(article.contentText);

  return tokens.reduce((score, token) => {
    if (title === token) return score + 120;
    if (title.startsWith(token)) score += 80;
    if (title.includes(token)) score += 50;
    if (keywords.some((keyword) => keyword === token || keyword.startsWith(token))) score += 42;
    if (smartTerms.some((term) => term === token || term.startsWith(token))) score += 34;
    if (category.includes(token)) score += 24;
    if (modules.some((moduleKey) => moduleKey === token || moduleKey.includes(token))) score += 22;
    if (summary.includes(token)) score += 16;
    if (content.includes(token)) score += 6;
    return score;
  }, article.featured ? 10 : 0);
}

function relatedScore(article: KnowledgebaseArticleSummary, candidate: KnowledgebaseArticleSummary): number {
  let score = 0;
  if (article.category?.id && article.category.id === candidate.category?.id) score += 40;
  score += intersectCount(article.moduleKeys, candidate.moduleKeys) * 18;
  score += intersectCount(article.requiredModuleKeys, candidate.requiredModuleKeys) * 10;
  score += intersectCount(article.audienceKeys, candidate.audienceKeys) * 8;
  score += intersectCount(article.keywords, candidate.keywords) * 7;
  score += intersectCount(article.smartTerms, candidate.smartTerms) * 5;

  const titleTokens = [...tokenSet(article.title)];
  const candidateTitleTokens = [...tokenSet(candidate.title)];
  score += intersectCount(titleTokens, candidateTitleTokens) * 3;

  if (candidate.featured) score += 3;
  return score;
}

function enrichRelatedArticles(
  articles: KnowledgebaseArticleSummary[],
  limit = 5,
): KnowledgebaseArticleSummary[] {
  const visibleById = new Map(articles.map((article) => [article.id, article]));

  return articles.map((article) => {
    const manual = article.relatedArticles
      .map((related) => visibleById.get(related.id))
      .filter((related): related is KnowledgebaseArticleSummary => Boolean(related))
      .map((related): KnowledgebaseRelatedArticleSummary => ({
        id: related.id,
        title: related.title,
        slug: related.slug,
        summary: related.summary,
        relationType: "manual",
        score: 100,
      }));

    const manualIds = new Set(manual.map((related) => related.id));
    const suggested = articles
      .filter((candidate) => candidate.id !== article.id && !manualIds.has(candidate.id))
      .map((candidate) => ({
        candidate,
        score: relatedScore(article, candidate),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.candidate.title.localeCompare(right.candidate.title))
      .slice(0, Math.max(0, limit - manual.length))
      .map((entry): KnowledgebaseRelatedArticleSummary => ({
        id: entry.candidate.id,
        title: entry.candidate.title,
        slug: entry.candidate.slug,
        summary: entry.candidate.summary,
        relationType: "suggested",
        score: entry.score,
      }));

    return {
      ...article,
      relatedArticles: [...manual, ...suggested].slice(0, limit),
    };
  });
}

function buildSearchSuggestions(
  articles: KnowledgebaseArticleSummary[],
  query?: string | null,
  limit = 12,
): KnowledgebaseSearchSuggestion[] {
  const normalizedQuery = normalizeSearch(query);
  const suggestions = new Map<string, KnowledgebaseSearchSuggestion>();

  function add(suggestion: KnowledgebaseSearchSuggestion) {
    const key = `${suggestion.type}:${normalizeSearch(suggestion.value)}`;
    const existing = suggestions.get(key);
    if (!existing || suggestion.score > existing.score) suggestions.set(key, suggestion);
  }

  for (const article of articles) {
    add({
      type: "article",
      label: article.title,
      value: article.title,
      href: `/help/${article.slug}`,
      description: article.summary,
      score: 100 + (article.featured ? 10 : 0),
    });

    if (article.category) {
      add({
        type: "category",
        label: article.category.name,
        value: article.category.name,
        description: article.category.description,
        score: 60,
      });
    }

    for (const keyword of [...article.keywords, ...article.smartTerms]) {
      add({
        type: "term",
        label: keyword,
        value: keyword,
        description: article.category?.name ?? null,
        score: article.smartTerms.includes(keyword) ? 44 : 38,
      });
    }

    for (const moduleKey of [...new Set([...article.moduleKeys, ...article.requiredModuleKeys])]) {
      add({
        type: "term",
        label: moduleKey,
        value: moduleKey,
        description: article.category?.name ?? "Module",
        score: 36,
      });
    }
  }

  return [...suggestions.values()]
    .filter((suggestion) => {
      if (!normalizedQuery) return true;
      return normalizeSearch(`${suggestion.label} ${suggestion.description ?? ""}`).includes(normalizedQuery);
    })
    .sort((left, right) => {
      const leftExact = normalizeSearch(left.value).startsWith(normalizedQuery) ? 1 : 0;
      const rightExact = normalizeSearch(right.value).startsWith(normalizedQuery) ? 1 : 0;
      return rightExact - leftExact || right.score - left.score || left.label.localeCompare(right.label);
    })
    .slice(0, limit);
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
    publicUrl: null,
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
  const conditions: SQL[] = [eq(kbArticlesTable.language, language)];
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
    .filter((article) => matchesQuery(article, options.query))
    .sort((left, right) => {
      const scoreDiff = searchScore(right, options.query) - searchScore(left, options.query);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(right.publishedAt ?? right.updatedAt).getTime() - new Date(left.publishedAt ?? left.updatedAt).getTime();
    });

  const enrichedArticles = enrichRelatedArticles(visibleArticles);
  return typeof options.limit === "number" ? enrichedArticles.slice(0, options.limit) : enrichedArticles;
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

export async function getKnowledgebaseMediaByIdForContext(
  context: FieldgridContentVisibilityContext,
  mediaId: string,
  options: Omit<KnowledgebaseListOptions, "query" | "limit"> = {},
): Promise<KnowledgebaseMediaAccess | null> {
  const [media] = await db
    .select({
      id: kbArticleMediaTable.id,
      articleId: kbArticleMediaTable.articleId,
      mediaType: kbArticleMediaTable.mediaType,
      storagePath: kbArticleMediaTable.storagePath,
      publicUrl: kbArticleMediaTable.publicUrl,
      mimeType: kbArticleMediaTable.mimeType,
      sizeBytes: kbArticleMediaTable.sizeBytes,
      altText: kbArticleMediaTable.altText,
      caption: kbArticleMediaTable.caption,
      sortOrder: kbArticleMediaTable.sortOrder,
    })
    .from(kbArticleMediaTable)
    .where(eq(kbArticleMediaTable.id, mediaId))
    .limit(1);

  if (!media) return null;

  const article = await getKnowledgebaseArticleByIdForContext(context, media.articleId, options);
  if (!article) return null;
  if (!article.media.some((item) => item.id === media.id)) return null;

  return {
    id: media.id,
    articleId: media.articleId,
    articleSlug: article.slug,
    articleTitle: article.title,
    mediaType: media.mediaType,
    storagePath: media.storagePath,
    publicUrl: null,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    altText: media.altText,
    caption: media.caption,
    sortOrder: media.sortOrder,
  };
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
    suggestions: buildSearchSuggestions(articles, options.query),
  };
}

export async function listKnowledgebaseSearchSuggestionsForContext(
  context: FieldgridContentVisibilityContext,
  query?: string | null,
  limit = 12,
): Promise<KnowledgebaseSearchSuggestion[]> {
  const articles = await listKnowledgebaseArticlesForContext(context, { query, limit: 60 });
  return buildSearchSuggestions(articles, query, limit);
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

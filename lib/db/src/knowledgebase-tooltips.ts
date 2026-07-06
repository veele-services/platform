import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import {
  canReadPublishedContent,
  normalizeVisibilityContext,
  type FieldgridContentVisibilityContext,
} from "./content-visibility";
import {
  kbArticlesTable,
  kbTooltipAudiencesTable,
  kbTooltipRelatedArticlesTable,
  kbTooltipsTable,
  type FieldgridContentAudience,
} from "./schema";
import { getKnowledgebaseArticleByIdForContext } from "./knowledgebase-content";

export type KnowledgebaseFeatureHelp = {
  featureKey: string;
  title: string;
  description: string;
  moduleKey: string | null;
  permissionKey: string | null;
  placement: "top" | "right" | "bottom" | "left";
  articleHref: string | null;
  articleLabel: string;
  relatedArticles: Array<{
    title: string;
    href: string | null;
  }>;
  showRelatedArticles: boolean;
};

export type KnowledgebaseFeatureHelpOptions = {
  moduleKey?: string | null;
  audience?: FieldgridContentAudience | null;
  articleHrefPrefix?: string;
  articleHrefMode?: "slug" | "id";
};

const PLACEMENTS = new Set(["top", "right", "bottom", "left"]);

function normalizePlacement(value: string): "top" | "right" | "bottom" | "left" {
  return PLACEMENTS.has(value) ? value as "top" | "right" | "bottom" | "left" : "top";
}

function hasAudience(
  context: FieldgridContentVisibilityContext,
  tooltipAudiences: readonly FieldgridContentAudience[],
  requestedAudience?: FieldgridContentAudience | null,
): boolean {
  if (context.isPlatformAdmin) return true;
  if (tooltipAudiences.length === 0) return true;

  const normalizedContext = normalizeVisibilityContext(context);
  const audienceSet = new Set(normalizedContext.audiences);
  if (requestedAudience) audienceSet.add(requestedAudience);

  return tooltipAudiences.some((audience) => audienceSet.has(audience));
}

function hasModuleAccess(context: FieldgridContentVisibilityContext, moduleKey?: string | null): boolean {
  if (context.isPlatformAdmin || !moduleKey) return true;
  return normalizeVisibilityContext(context).activeModuleKeys.includes(moduleKey);
}

function hasPermissionAccess(context: FieldgridContentVisibilityContext, permissionKey?: string | null): boolean {
  if (context.isPlatformAdmin || !permissionKey) return true;
  return normalizeVisibilityContext(context).permissionKeys.includes(permissionKey);
}

function articleHref(prefix: string, article: { id: string; slug: string }, mode: "slug" | "id"): string {
  const normalizedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return `${normalizedPrefix}/${mode === "id" ? article.id : article.slug}`;
}

export async function getKnowledgebaseFeatureHelpForContext(
  context: FieldgridContentVisibilityContext,
  featureKey: string,
  options: KnowledgebaseFeatureHelpOptions = {},
): Promise<KnowledgebaseFeatureHelp | null> {
  const stableKey = featureKey.trim();
  if (!stableKey) return null;

  const [tooltip] = await db
    .select({
      id: kbTooltipsTable.id,
      stableKey: kbTooltipsTable.stableKey,
      title: kbTooltipsTable.title,
      description: kbTooltipsTable.description,
      articleId: kbTooltipsTable.articleId,
      moduleKey: kbTooltipsTable.moduleKey,
      permissionKey: kbTooltipsTable.permissionKey,
      placement: kbTooltipsTable.placement,
      showRelatedArticles: kbTooltipsTable.showRelatedArticles,
    })
    .from(kbTooltipsTable)
    .where(and(eq(kbTooltipsTable.stableKey, stableKey), eq(kbTooltipsTable.status, "published")))
    .limit(1);

  if (!tooltip) return null;

  const moduleKey = options.moduleKey ?? tooltip.moduleKey;
  if (!hasModuleAccess(context, moduleKey)) return null;
  if (!hasPermissionAccess(context, tooltip.permissionKey)) return null;

  const [audienceRows, relatedRows] = await Promise.all([
    db
      .select({ audienceKey: kbTooltipAudiencesTable.audienceKey })
      .from(kbTooltipAudiencesTable)
      .where(eq(kbTooltipAudiencesTable.tooltipId, tooltip.id)),
    db
      .select({
        articleId: kbTooltipRelatedArticlesTable.articleId,
        title: kbArticlesTable.title,
      })
      .from(kbTooltipRelatedArticlesTable)
      .innerJoin(kbArticlesTable, eq(kbTooltipRelatedArticlesTable.articleId, kbArticlesTable.id))
      .where(eq(kbTooltipRelatedArticlesTable.tooltipId, tooltip.id))
      .orderBy(asc(kbTooltipRelatedArticlesTable.sortOrder)),
  ]);

  const tooltipAudiences = audienceRows.map((row) => row.audienceKey);
  if (!hasAudience(context, tooltipAudiences, options.audience)) return null;

  const hrefPrefix = options.articleHrefPrefix ?? "/help";
  const hrefMode = options.articleHrefMode ?? "slug";
  const article = tooltip.articleId
    ? await getKnowledgebaseArticleByIdForContext(context, tooltip.articleId)
    : null;
  const visibleRelated = [];

  if (tooltip.showRelatedArticles && relatedRows.length > 0) {
    const relatedIds = relatedRows.map((row) => row.articleId);
    const relatedArticles = await Promise.all(
      relatedIds.map((relatedArticleId) => getKnowledgebaseArticleByIdForContext(context, relatedArticleId)),
    );
    const relatedTitleById = new Map(relatedRows.map((row) => [row.articleId, row.title]));

    for (const relatedArticle of relatedArticles) {
      if (!relatedArticle) continue;
      visibleRelated.push({
        title: relatedArticle.title || relatedTitleById.get(relatedArticle.id) || "Handleiding",
        href: articleHref(hrefPrefix, relatedArticle, hrefMode),
      });
    }
  }

  if (tooltip.articleId && !article) {
    const [rawArticle] = await db
      .select({
        id: kbArticlesTable.id,
        scope: kbArticlesTable.scope,
        tenantId: kbArticlesTable.tenantId,
        status: kbArticlesTable.status,
        archivedAt: kbArticlesTable.archivedAt,
      })
      .from(kbArticlesTable)
      .where(eq(kbArticlesTable.id, tooltip.articleId))
      .limit(1);

    if (rawArticle && !canReadPublishedContent(context, rawArticle)) {
      return {
        featureKey: tooltip.stableKey,
        title: tooltip.title,
        description: tooltip.description,
        moduleKey: tooltip.moduleKey,
        permissionKey: tooltip.permissionKey,
        placement: normalizePlacement(tooltip.placement),
        articleHref: null,
        articleLabel: "Lees volledige uitleg",
        relatedArticles: visibleRelated,
        showRelatedArticles: tooltip.showRelatedArticles,
      };
    }
  }

  return {
    featureKey: tooltip.stableKey,
    title: tooltip.title,
    description: tooltip.description,
    moduleKey: tooltip.moduleKey,
    permissionKey: tooltip.permissionKey,
    placement: normalizePlacement(tooltip.placement),
    articleHref: article ? articleHref(hrefPrefix, article, hrefMode) : null,
    articleLabel: "Lees volledige uitleg",
    relatedArticles: visibleRelated,
    showRelatedArticles: tooltip.showRelatedArticles,
  };
}

export async function listKnowledgebaseFeatureHelpsForContext(
  context: FieldgridContentVisibilityContext,
  featureKeys: readonly string[],
  options: KnowledgebaseFeatureHelpOptions = {},
): Promise<Record<string, KnowledgebaseFeatureHelp | null>> {
  const entries = await Promise.all(
    featureKeys.map(async (featureKey) => [
      featureKey,
      await getKnowledgebaseFeatureHelpForContext(context, featureKey, options),
    ] as const),
  );

  return Object.fromEntries(entries);
}

import { and, asc, desc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { db } from "./index";
import {
  releaseAudiencesTable,
  releaseCategoriesTable,
  releaseDismissalsTable,
  releaseHighlightsTable,
  releaseItemsTable,
  releaseModulesTable,
  releaseRoadmapLinksTable,
  releasesTable,
  roadmapItemsTable,
  type FieldgridContentAudience,
  type ReleaseHighlightSurface,
  type ReleaseImpactLevel,
  type ReleaseStatus,
} from "./schema";

export type ReleaseVisibilityContext = {
  tenantId?: string | null;
  surface: ReleaseHighlightSurface;
  audiences: FieldgridContentAudience[];
  activeModuleKeys: string[];
  userId?: string | null;
  personnelId?: string | null;
  customerId?: string | null;
  isPlatformAdmin?: boolean;
};

export type ReleaseCategorySummary = {
  id: string;
  name: string;
  slug: string;
  moduleKey: string | null;
  sortOrder: number;
};

export type ReleaseItemSummary = {
  id: string;
  title: string;
  description: string;
  moduleKey: string | null;
  impactLevel: ReleaseImpactLevel;
  sortOrder: number;
  category: ReleaseCategorySummary | null;
};

export type ReleaseRoadmapSummary = {
  id: string;
  title: string;
  status: string;
};

export type ReleaseSummary = {
  id: string;
  version: string;
  title: string;
  slug: string;
  summary: string | null;
  contentHtml: string | null;
  contentText: string | null;
  status: ReleaseStatus;
  impactLevel: ReleaseImpactLevel;
  featured: boolean;
  publishedAt: string | null;
  updatedAt: string;
  archivedAt: string | null;
  audienceKeys: FieldgridContentAudience[];
  moduleKeys: string[];
  items: ReleaseItemSummary[];
  roadmapItems: ReleaseRoadmapSummary[];
};

export type ReleaseHighlightSummary = {
  id: string;
  releaseId: string;
  releaseSlug: string;
  releaseTitle: string;
  releaseVersion: string;
  surface: ReleaseHighlightSurface;
  audienceKey: FieldgridContentAudience;
  moduleKey: string | null;
  title: string;
  message: string;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
};

export type ReleaseListOptions = {
  includeUnpublished?: boolean;
  includeArchived?: boolean;
  limit?: number;
};

type ReleaseRelationMaps = {
  audiences: Map<string, FieldgridContentAudience[]>;
  modules: Map<string, string[]>;
  items: Map<string, ReleaseItemSummary[]>;
  roadmapItems: Map<string, ReleaseRoadmapSummary[]>;
};

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString();
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const values = new Set(left);
  return right.some((value) => values.has(value));
}

function canReadRelease(context: ReleaseVisibilityContext, release: Pick<ReleaseSummary, "status" | "archivedAt" | "audienceKeys" | "moduleKeys">, includeUnpublished = false): boolean {
  if (context.isPlatformAdmin && includeUnpublished) return true;
  if (release.status !== "published" || release.archivedAt) return false;
  if (release.audienceKeys.length > 0 && !intersects(release.audienceKeys, context.audiences)) return false;
  if (release.moduleKeys.length > 0 && !intersects(release.moduleKeys, context.activeModuleKeys)) return false;
  return true;
}

async function loadReleaseRelations(releaseIds: string[]): Promise<ReleaseRelationMaps> {
  if (releaseIds.length === 0) {
    return {
      audiences: new Map(),
      modules: new Map(),
      items: new Map(),
      roadmapItems: new Map(),
    };
  }

  const [audienceRows, moduleRows, itemRows, roadmapRows] = await Promise.all([
    db
      .select({
        releaseId: releaseAudiencesTable.releaseId,
        audienceKey: releaseAudiencesTable.audienceKey,
      })
      .from(releaseAudiencesTable)
      .where(inArray(releaseAudiencesTable.releaseId, releaseIds)),
    db
      .select({
        releaseId: releaseModulesTable.releaseId,
        moduleKey: releaseModulesTable.moduleKey,
      })
      .from(releaseModulesTable)
      .where(inArray(releaseModulesTable.releaseId, releaseIds)),
    db
      .select({
        id: releaseItemsTable.id,
        releaseId: releaseItemsTable.releaseId,
        title: releaseItemsTable.title,
        description: releaseItemsTable.description,
        moduleKey: releaseItemsTable.moduleKey,
        impactLevel: releaseItemsTable.impactLevel,
        sortOrder: releaseItemsTable.sortOrder,
        categoryId: releaseCategoriesTable.id,
        categoryName: releaseCategoriesTable.name,
        categorySlug: releaseCategoriesTable.slug,
        categoryModuleKey: releaseCategoriesTable.moduleKey,
        categorySortOrder: releaseCategoriesTable.sortOrder,
      })
      .from(releaseItemsTable)
      .leftJoin(releaseCategoriesTable, eq(releaseItemsTable.categoryId, releaseCategoriesTable.id))
      .where(inArray(releaseItemsTable.releaseId, releaseIds))
      .orderBy(asc(releaseItemsTable.sortOrder), asc(releaseItemsTable.title)),
    db
      .select({
        releaseId: releaseRoadmapLinksTable.releaseId,
        roadmapItemId: roadmapItemsTable.id,
        roadmapTitle: roadmapItemsTable.title,
        roadmapStatus: roadmapItemsTable.status,
      })
      .from(releaseRoadmapLinksTable)
      .innerJoin(roadmapItemsTable, eq(releaseRoadmapLinksTable.roadmapItemId, roadmapItemsTable.id))
      .where(inArray(releaseRoadmapLinksTable.releaseId, releaseIds)),
  ]);

  const audiences = new Map<string, FieldgridContentAudience[]>();
  for (const row of audienceRows) {
    const list = audiences.get(row.releaseId) ?? [];
    list.push(row.audienceKey);
    audiences.set(row.releaseId, list);
  }

  const modules = new Map<string, string[]>();
  for (const row of moduleRows) {
    const list = modules.get(row.releaseId) ?? [];
    list.push(row.moduleKey);
    modules.set(row.releaseId, list);
  }

  const items = new Map<string, ReleaseItemSummary[]>();
  for (const row of itemRows) {
    const list = items.get(row.releaseId) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      description: row.description,
      moduleKey: row.moduleKey,
      impactLevel: row.impactLevel,
      sortOrder: row.sortOrder,
      category: row.categoryId
        ? {
          id: row.categoryId,
          name: row.categoryName ?? "",
          slug: row.categorySlug ?? "",
          moduleKey: row.categoryModuleKey,
          sortOrder: row.categorySortOrder ?? 0,
        }
        : null,
    });
    items.set(row.releaseId, list);
  }

  const roadmapItems = new Map<string, ReleaseRoadmapSummary[]>();
  for (const row of roadmapRows) {
    const list = roadmapItems.get(row.releaseId) ?? [];
    list.push({
      id: row.roadmapItemId,
      title: row.roadmapTitle,
      status: row.roadmapStatus,
    });
    roadmapItems.set(row.releaseId, list);
  }

  return { audiences, modules, items, roadmapItems };
}

export async function listReleasesForContext(
  context: ReleaseVisibilityContext,
  options: ReleaseListOptions = {},
): Promise<ReleaseSummary[]> {
  const conditions: SQL[] = [];
  if (!options.includeUnpublished) conditions.push(eq(releasesTable.status, "published"));
  if (!options.includeArchived) conditions.push(isNull(releasesTable.archivedAt));

  const rows = await db
    .select({
      id: releasesTable.id,
      version: releasesTable.version,
      title: releasesTable.title,
      slug: releasesTable.slug,
      summary: releasesTable.summary,
      contentHtml: releasesTable.contentHtml,
      contentText: releasesTable.contentText,
      status: releasesTable.status,
      impactLevel: releasesTable.impactLevel,
      featured: releasesTable.featured,
      publishedAt: releasesTable.publishedAt,
      updatedAt: releasesTable.updatedAt,
      archivedAt: releasesTable.archivedAt,
    })
    .from(releasesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(releasesTable.publishedAt), desc(releasesTable.updatedAt));

  const relations = await loadReleaseRelations(rows.map((row) => row.id));
  const releases = rows.map((row): ReleaseSummary => {
    const audienceKeys = relations.audiences.get(row.id) ?? [];
    const moduleKeys = relations.modules.get(row.id) ?? [];
    return {
      id: row.id,
      version: row.version,
      title: row.title,
      slug: row.slug,
      summary: row.summary,
      contentHtml: row.contentHtml,
      contentText: row.contentText,
      status: row.status,
      impactLevel: row.impactLevel,
      featured: row.featured,
      publishedAt: iso(row.publishedAt),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: iso(row.archivedAt),
      audienceKeys,
      moduleKeys,
      items: relations.items.get(row.id) ?? [],
      roadmapItems: relations.roadmapItems.get(row.id) ?? [],
    };
  });

  const visible = releases.filter((release) => canReadRelease(context, release, options.includeUnpublished));
  return typeof options.limit === "number" ? visible.slice(0, options.limit) : visible;
}

export async function getReleaseBySlugForContext(
  context: ReleaseVisibilityContext,
  slug: string,
  options: ReleaseListOptions = {},
): Promise<ReleaseSummary | null> {
  const releases = await listReleasesForContext(context, options);
  return releases.find((release) => release.slug === slug) ?? null;
}

export async function getActiveReleaseHighlightsForContext(
  context: ReleaseVisibilityContext,
): Promise<ReleaseHighlightSummary[]> {
  const now = new Date();
  const dismissalConditions: SQL[] = [];
  if (context.userId) dismissalConditions.push(eq(releaseDismissalsTable.userId, context.userId));
  if (context.personnelId) dismissalConditions.push(eq(releaseDismissalsTable.personnelId, context.personnelId));
  if (context.customerId) dismissalConditions.push(eq(releaseDismissalsTable.customerId, context.customerId));

  const rows = await db
    .select({
      id: releaseHighlightsTable.id,
      releaseId: releaseHighlightsTable.releaseId,
      releaseSlug: releasesTable.slug,
      releaseTitle: releasesTable.title,
      releaseVersion: releasesTable.version,
      surface: releaseHighlightsTable.surface,
      audienceKey: releaseHighlightsTable.audienceKey,
      moduleKey: releaseHighlightsTable.moduleKey,
      title: releaseHighlightsTable.title,
      message: releaseHighlightsTable.message,
      priority: releaseHighlightsTable.priority,
      startsAt: releaseHighlightsTable.startsAt,
      endsAt: releaseHighlightsTable.endsAt,
      dismissedAt: releaseDismissalsTable.dismissedAt,
    })
    .from(releaseHighlightsTable)
    .innerJoin(releasesTable, eq(releaseHighlightsTable.releaseId, releasesTable.id))
    .leftJoin(
      releaseDismissalsTable,
      and(
        eq(releaseDismissalsTable.highlightId, releaseHighlightsTable.id),
        dismissalConditions.length > 0 ? or(...dismissalConditions) : eq(releaseDismissalsTable.highlightId, "00000000-0000-0000-0000-000000000000"),
      ),
    )
    .where(
      and(
        eq(releaseHighlightsTable.surface, context.surface),
        eq(releaseHighlightsTable.isActive, true),
        eq(releasesTable.status, "published"),
        isNull(releasesTable.archivedAt),
      ),
    )
    .orderBy(desc(releaseHighlightsTable.priority), desc(releasesTable.publishedAt), desc(releaseHighlightsTable.createdAt));

  return rows
    .filter((row) => !row.dismissedAt)
    .filter((row) => context.audiences.includes(row.audienceKey))
    .filter((row) => context.isPlatformAdmin || !row.moduleKey || context.activeModuleKeys.includes(row.moduleKey))
    .filter((row) => !row.startsAt || row.startsAt <= now)
    .filter((row) => !row.endsAt || row.endsAt >= now)
    .map((row) => ({
      id: row.id,
      releaseId: row.releaseId,
      releaseSlug: row.releaseSlug,
      releaseTitle: row.releaseTitle,
      releaseVersion: row.releaseVersion,
      surface: row.surface,
      audienceKey: row.audienceKey,
      moduleKey: row.moduleKey,
      title: row.title,
      message: row.message,
      priority: row.priority,
      startsAt: iso(row.startsAt),
      endsAt: iso(row.endsAt),
    }));
}

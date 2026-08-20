"use server";

import { randomUUID } from "node:crypto";
import {
  db,
  auditLogTable,
  kbArticleAudiencesTable,
  kbArticleFeedbackTable,
  kbArticleMediaTable,
  kbArticleModulesTable,
  kbArticlePermissionsTable,
  kbArticleRelatedTable,
  kbArticleVersionsTable,
  kbArticlesTable,
  kbCategoriesTable,
  kbSearchEventsTable,
  kbSearchTermsTable,
  kbTooltipAudiencesTable,
  kbTooltipRelatedArticlesTable,
  kbTooltipsTable,
  listEnabledKnowledgebaseModuleKeysForTenant,
  listKnowledgebaseArticlesForContext,
  modulesTable,
  organizationSettingsTable,
  permissionsTable,
  type FieldgridContentAudience,
  type FieldgridContentStatus,
  type KnowledgebaseArticleSummary,
} from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentEffectiveUserPermissions, requirePermission } from "@/lib/auth/permissions";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { getCurrentBackofficeUser, requireCurrentTenantId } from "@/lib/auth/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitFieldgridContentNotification } from "@/lib/content-notification-events";
import { sanitizeKnowledgebaseHtml } from "@workspace/shared-ui/knowledgebase-html";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; message: string };

export type KnowledgebaseModuleOption = {
  key: string;
  name: string;
  description: string | null;
};

export type KnowledgebasePermissionOption = {
  key: string;
  resource: string;
  action: string;
  description: string | null;
};

export type KnowledgebaseCategoryOption = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  moduleKey: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type KnowledgebaseArticleOption = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: FieldgridContentStatus;
};

export type KnowledgebaseTooltipRow = {
  id: string;
  stableKey: string;
  title: string;
  description: string;
  articleId: string | null;
  articleTitle: string | null;
  articleSlug: string | null;
  moduleKey: string | null;
  permissionKey: string | null;
  status: "draft" | "published" | "archived";
  placement: string;
  openInDrawer: boolean;
  showRelatedArticles: boolean;
  audienceKeys: FieldgridContentAudience[];
  relatedArticleIds: string[];
  updatedAt: string;
};

export type KnowledgebaseEditorOptions = {
  audiences: Array<{ key: FieldgridContentAudience; label: string; description: string }>;
  categories: KnowledgebaseCategoryOption[];
  modules: KnowledgebaseModuleOption[];
  permissions: KnowledgebasePermissionOption[];
  relatedArticles: KnowledgebaseArticleOption[];
};

export type TenantKnowledgebaseAuthoringState = {
  enabled: boolean;
  canManage: boolean;
  reason: string | null;
};

export type TenantKnowledgebaseDashboard = {
  state: TenantKnowledgebaseAuthoringState;
  articles: KnowledgebaseArticleSummary[];
};

export type TenantProductExperienceSettings = {
  kbTenantAuthoringEnabled: boolean;
  roadmapPersonnelRequestsEnabled: boolean;
  roadmapCustomerRequestsEnabled: boolean;
};

export type KnowledgebaseFeedbackInsight = {
  id: string;
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  tenantId: string | null;
  audienceKey: FieldgridContentAudience;
  isHelpful: boolean;
  comment: string | null;
  createdAt: string;
};

export type KnowledgebaseArticleFeedbackInsight = {
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  tenantId: string | null;
  scope: "platform_global" | "tenant";
  total: number;
  helpful: number;
  notHelpful: number;
  helpfulRate: number;
  lastFeedbackAt: string;
};

export type KnowledgebaseSearchInsight = {
  query: string;
  total: number;
  zeroResults: number;
  lastSearchedAt: string;
  audienceKeys: FieldgridContentAudience[];
};

export type KnowledgebaseInsightsDashboard = {
  windowDays: number;
  feedback: {
    total: number;
    helpful: number;
    notHelpful: number;
    helpfulRate: number;
    recent: KnowledgebaseFeedbackInsight[];
    byArticle: KnowledgebaseArticleFeedbackInsight[];
  };
  searches: {
    total: number;
    zeroResultTotal: number;
    popular: KnowledgebaseSearchInsight[];
    zeroResults: KnowledgebaseSearchInsight[];
    recent: Array<{
      id: string;
      tenantId: string | null;
      audienceKey: FieldgridContentAudience;
      query: string;
      resultCount: number;
      createdAt: string;
    }>;
  };
};

export type SaveKnowledgebaseArticleInput = {
  id?: string | null;
  title: string;
  slug?: string | null;
  summary?: string | null;
  categoryId?: string | null;
  contentHtml: string;
  contentJson?: Record<string, unknown> | null;
  keywords: string[];
  smartTerms: string[];
  status: FieldgridContentStatus;
  featured: boolean;
  language?: string | null;
  audienceKeys: FieldgridContentAudience[];
  moduleKeys: string[];
  requiredModuleKeys: string[];
  permissionKeys: string[];
  relatedArticleIds: string[];
  changeNote?: string | null;
};

const KB_MEDIA_BUCKET = "knowledgebase-media";
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "application/pdf",
]);

const AUDIENCE_OPTIONS: KnowledgebaseEditorOptions["audiences"] = [
  { key: "platform_admin", label: "Platform admin", description: "Platformbeheer en supportbeheer." },
  { key: "support", label: "Support", description: "Supportmedewerkers met platformcontext." },
  { key: "tenant_admin", label: "Tenant admin", description: "Tenantbeheerders en eigenaren." },
  { key: "tenant_management", label: "Management", description: "Managementrollen binnen tenant backoffice." },
  { key: "tenant_planning", label: "Planning", description: "Planning en operatie." },
  { key: "tenant_administration", label: "Administratie", description: "Finance en administratieve gebruikers." },
  { key: "tenant_personnel", label: "Personeel", description: "Gebruikers van de personeelsapp." },
  { key: "tenant_customer", label: "Klanten", description: "Gebruikers van het klantportaal." },
];

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function slugify(value: string, fallback = "artikel"): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);

  return slug || `${fallback}-${Date.now()}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|h1|h2|h3|h4|li|blockquote|tr|td|th|figcaption|div)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeSearchInsightQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 180);
}

function toHelpfulRate(helpful: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((helpful / total) * 100);
}

function normalizeStatus(value: string): FieldgridContentStatus {
  return value === "published" || value === "archived" ? value : "draft";
}

function normalizeTooltipStatus(value: string): "draft" | "published" | "archived" {
  if (value === "published" || value === "archived") return value;
  return "draft";
}

function parseCsv(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeInput(input: SaveKnowledgebaseArticleInput) {
  const title = input.title.trim();
  const contentHtml = sanitizeKnowledgebaseHtml(input.contentHtml);
  if (!title) throw new Error("Titel is verplicht.");
  if (!contentHtml) throw new Error("Artikelinhoud is verplicht.");

  const status = normalizeStatus(input.status);
  const moduleKeys = uniqueStrings(input.moduleKeys);
  const requiredModuleKeys = uniqueStrings(input.requiredModuleKeys).filter((key) => moduleKeys.includes(key));
  const audienceKeys = [...new Set(input.audienceKeys.filter((key) => AUDIENCE_OPTIONS.some((option) => option.key === key)))];

  return {
    id: input.id?.trim() || null,
    title,
    slug: slugify(input.slug?.trim() || title),
    summary: input.summary?.trim() || null,
    categoryId: input.categoryId?.trim() || null,
    contentHtml,
    contentJson: input.contentJson ?? null,
    contentText: stripHtml(contentHtml),
    keywords: uniqueStrings(input.keywords),
    smartTerms: uniqueStrings(input.smartTerms),
    status,
    featured: Boolean(input.featured),
    language: input.language?.trim() || "nl",
    audienceKeys,
    moduleKeys,
    requiredModuleKeys,
    permissionKeys: uniqueStrings(input.permissionKeys),
    relatedArticleIds: uniqueStrings(input.relatedArticleIds).filter((id) => id !== input.id),
    changeNote: input.changeNote?.trim() || null,
  };
}

function revalidateKnowledgebasePaths(): void {
  revalidatePath("/platform/knowledgebase");
  revalidatePath("/help");
  revalidatePath("/klant/help");
  revalidatePath("/personeel/help");
}

function revalidateTenantKnowledgebaseManagementPaths(): void {
  revalidateKnowledgebasePaths();
  revalidatePath("/help/beheer");
}

async function getTenantKnowledgebaseAuthoringState(): Promise<TenantKnowledgebaseAuthoringState & { tenantId: string; userId: string | null }> {
  const tenantId = await requireCurrentTenantId();
  const user = await getCurrentBackofficeUser();
  const permissionSet = await getCurrentEffectiveUserPermissions();
  const canManage = permissionSet.has("kb:manage");

  const [settings] = await db
    .select({ enabled: organizationSettingsTable.kbTenantAuthoringEnabled })
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.tenantId, tenantId))
    .limit(1);

  const enabled = Boolean(settings?.enabled);
  const reason = !enabled
    ? "Tenant-eigen knowledgebasebeheer staat uit in instellingen."
    : !canManage
      ? "Permissie ontbreekt: kb:manage."
      : null;

  return { tenantId, userId: user?.id ?? null, enabled, canManage, reason };
}

async function requireTenantKnowledgebaseAuthoringContext(): Promise<{ tenantId: string; userId: string }> {
  await requirePermission("kb", "manage");
  const state = await getTenantKnowledgebaseAuthoringState();
  if (!state.enabled) throw new Error("Tenant-eigen knowledgebasebeheer staat uit.");
  if (!state.canManage || !state.userId) throw new Error("Forbidden: kb:manage");
  return { tenantId: state.tenantId, userId: state.userId };
}

export async function listKnowledgebaseManagementArticles(query?: string | null): Promise<KnowledgebaseArticleSummary[]> {
  await requirePlatformAdmin();

  return listKnowledgebaseArticlesForContext(
    {
      surface: "platform_backoffice",
      isPlatformAdmin: true,
      audiences: ["platform_admin", "support"],
      activeModuleKeys: [],
      permissionKeys: [],
    },
    {
      query,
      includeArchived: true,
      includeUnpublished: true,
    },
  );
}

async function buildKnowledgebaseInsightsDashboard(options: { tenantId?: string | null } = {}): Promise<KnowledgebaseInsightsDashboard> {
  const windowDays = 90;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const tenantId = options.tenantId ?? null;

  const feedbackWhere = tenantId
    ? and(eq(kbArticleFeedbackTable.tenantId, tenantId), gte(kbArticleFeedbackTable.createdAt, since))
    : gte(kbArticleFeedbackTable.createdAt, since);
  const searchWhere = tenantId
    ? and(eq(kbSearchEventsTable.tenantId, tenantId), gte(kbSearchEventsTable.createdAt, since))
    : gte(kbSearchEventsTable.createdAt, since);

  const [feedbackRows, searchRows] = await Promise.all([
    db
      .select({
        id: kbArticleFeedbackTable.id,
        articleId: kbArticleFeedbackTable.articleId,
        articleTitle: kbArticlesTable.title,
        articleSlug: kbArticlesTable.slug,
        articleScope: kbArticlesTable.scope,
        articleTenantId: kbArticlesTable.tenantId,
        tenantId: kbArticleFeedbackTable.tenantId,
        audienceKey: kbArticleFeedbackTable.audienceKey,
        isHelpful: kbArticleFeedbackTable.isHelpful,
        comment: kbArticleFeedbackTable.comment,
        createdAt: kbArticleFeedbackTable.createdAt,
      })
      .from(kbArticleFeedbackTable)
      .innerJoin(kbArticlesTable, eq(kbArticleFeedbackTable.articleId, kbArticlesTable.id))
      .where(feedbackWhere)
      .orderBy(desc(kbArticleFeedbackTable.createdAt))
      .limit(500),
    db
      .select({
        id: kbSearchEventsTable.id,
        tenantId: kbSearchEventsTable.tenantId,
        audienceKey: kbSearchEventsTable.audienceKey,
        query: kbSearchEventsTable.query,
        resultCount: kbSearchEventsTable.resultCount,
        createdAt: kbSearchEventsTable.createdAt,
      })
      .from(kbSearchEventsTable)
      .where(searchWhere)
      .orderBy(desc(kbSearchEventsTable.createdAt))
      .limit(1000),
  ]);

  const feedbackByArticle = new Map<string, KnowledgebaseArticleFeedbackInsight>();
  let helpful = 0;
  let notHelpful = 0;

  for (const row of feedbackRows) {
    if (row.isHelpful) helpful += 1;
    else notHelpful += 1;

    const current = feedbackByArticle.get(row.articleId) ?? {
      articleId: row.articleId,
      articleTitle: row.articleTitle,
      articleSlug: row.articleSlug,
      tenantId: row.articleTenantId,
      scope: row.articleScope,
      total: 0,
      helpful: 0,
      notHelpful: 0,
      helpfulRate: 0,
      lastFeedbackAt: row.createdAt.toISOString(),
    };

    current.total += 1;
    if (row.isHelpful) current.helpful += 1;
    else current.notHelpful += 1;
    current.helpfulRate = toHelpfulRate(current.helpful, current.total);
    if (new Date(current.lastFeedbackAt) < row.createdAt) current.lastFeedbackAt = row.createdAt.toISOString();
    feedbackByArticle.set(row.articleId, current);
  }

  const searchByQuery = new Map<string, KnowledgebaseSearchInsight & { audienceSet: Set<FieldgridContentAudience> }>();
  for (const row of searchRows) {
    const query = normalizeSearchInsightQuery(row.query);
    if (!query) continue;
    const current = searchByQuery.get(query) ?? {
      query,
      total: 0,
      zeroResults: 0,
      lastSearchedAt: row.createdAt.toISOString(),
      audienceKeys: [],
      audienceSet: new Set<FieldgridContentAudience>(),
    };

    current.total += 1;
    if (row.resultCount === 0) current.zeroResults += 1;
    if (new Date(current.lastSearchedAt) < row.createdAt) current.lastSearchedAt = row.createdAt.toISOString();
    current.audienceSet.add(row.audienceKey);
    current.audienceKeys = [...current.audienceSet];
    searchByQuery.set(query, current);
  }

  const searchInsights = [...searchByQuery.values()].map((entry) => ({
    query: entry.query,
    total: entry.total,
    zeroResults: entry.zeroResults,
    lastSearchedAt: entry.lastSearchedAt,
    audienceKeys: entry.audienceKeys,
  }));
  const zeroResultTotal = searchRows.filter((row) => row.resultCount === 0).length;

  return {
    windowDays,
    feedback: {
      total: feedbackRows.length,
      helpful,
      notHelpful,
      helpfulRate: toHelpfulRate(helpful, feedbackRows.length),
      recent: feedbackRows.slice(0, 30).map((row) => ({
        id: row.id,
        articleId: row.articleId,
        articleTitle: row.articleTitle,
        articleSlug: row.articleSlug,
        tenantId: row.tenantId,
        audienceKey: row.audienceKey,
        isHelpful: row.isHelpful,
        comment: row.comment,
        createdAt: row.createdAt.toISOString(),
      })),
      byArticle: [...feedbackByArticle.values()]
        .sort((left, right) => right.total - left.total || new Date(right.lastFeedbackAt).getTime() - new Date(left.lastFeedbackAt).getTime())
        .slice(0, 25),
    },
    searches: {
      total: searchRows.length,
      zeroResultTotal,
      popular: [...searchInsights]
        .sort((left, right) => right.total - left.total || new Date(right.lastSearchedAt).getTime() - new Date(left.lastSearchedAt).getTime())
        .slice(0, 20),
      zeroResults: [...searchInsights]
        .filter((entry) => entry.zeroResults > 0)
        .sort((left, right) => right.zeroResults - left.zeroResults || right.total - left.total)
        .slice(0, 20),
      recent: searchRows.slice(0, 30).map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        audienceKey: row.audienceKey,
        query: row.query,
        resultCount: row.resultCount,
        createdAt: row.createdAt.toISOString(),
      })),
    },
  };
}

export async function getPlatformKnowledgebaseInsightsDashboard(): Promise<KnowledgebaseInsightsDashboard> {
  await requirePlatformAdmin();
  return buildKnowledgebaseInsightsDashboard();
}

export async function getTenantKnowledgebaseInsightsDashboard(): Promise<KnowledgebaseInsightsDashboard> {
  const state = await getTenantKnowledgebaseAuthoringState();
  if (!state.enabled || !state.canManage) {
    return {
      windowDays: 90,
      feedback: { total: 0, helpful: 0, notHelpful: 0, helpfulRate: 0, recent: [], byArticle: [] },
      searches: { total: 0, zeroResultTotal: 0, popular: [], zeroResults: [], recent: [] },
    };
  }
  return buildKnowledgebaseInsightsDashboard({ tenantId: state.tenantId });
}

export async function getKnowledgebaseArticleForEdit(id: string): Promise<KnowledgebaseArticleSummary | null> {
  const articles = await listKnowledgebaseManagementArticles();
  return articles.find((article) => article.id === id) ?? null;
}

export async function listKnowledgebaseCategoriesForManagement(): Promise<KnowledgebaseCategoryOption[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: kbCategoriesTable.id,
      name: kbCategoriesTable.name,
      slug: kbCategoriesTable.slug,
      description: kbCategoriesTable.description,
      moduleKey: kbCategoriesTable.moduleKey,
      sortOrder: kbCategoriesTable.sortOrder,
      isActive: kbCategoriesTable.isActive,
    })
    .from(kbCategoriesTable)
    .where(eq(kbCategoriesTable.scope, "platform_global"))
    .orderBy(asc(kbCategoriesTable.sortOrder), asc(kbCategoriesTable.name));

  return rows;
}

export async function listKnowledgebaseEditorOptions(articleId?: string | null): Promise<KnowledgebaseEditorOptions> {
  await requirePlatformAdmin();

  const [categories, modules, permissions, relatedArticles] = await Promise.all([
    listKnowledgebaseCategoriesForManagement(),
    db
      .select({
        key: modulesTable.key,
        name: modulesTable.name,
        description: modulesTable.description,
      })
      .from(modulesTable)
      .orderBy(asc(modulesTable.category), asc(modulesTable.name)),
    db
      .select({
        resource: permissionsTable.resource,
        action: permissionsTable.action,
        description: permissionsTable.description,
      })
      .from(permissionsTable)
      .orderBy(asc(permissionsTable.resource), asc(permissionsTable.action)),
    db
      .select({
        id: kbArticlesTable.id,
        title: kbArticlesTable.title,
        slug: kbArticlesTable.slug,
        summary: kbArticlesTable.summary,
        status: kbArticlesTable.status,
      })
      .from(kbArticlesTable)
      .where(eq(kbArticlesTable.scope, "platform_global"))
      .orderBy(asc(kbArticlesTable.title)),
  ]);

  return {
    audiences: AUDIENCE_OPTIONS,
    categories,
    modules,
    permissions: permissions.map((permission) => ({
      key: `${permission.resource}:${permission.action}`,
      resource: permission.resource,
      action: permission.action,
      description: permission.description,
    })),
    relatedArticles: relatedArticles.filter((article) => article.id !== articleId),
  };
}

export async function getTenantKnowledgebaseDashboard(query?: string | null): Promise<TenantKnowledgebaseDashboard> {
  const state = await getTenantKnowledgebaseAuthoringState();
  if (!state.enabled || !state.canManage) {
    return {
      state: { enabled: state.enabled, canManage: state.canManage, reason: state.reason },
      articles: [],
    };
  }

  const permissionSet = await getCurrentEffectiveUserPermissions();
  const articles = await listKnowledgebaseArticlesForContext(
    {
      tenantId: state.tenantId,
      surface: "tenant_backoffice",
      audiences: ["tenant_admin", "tenant_management"],
      activeModuleKeys: await listEnabledTenantKnowledgebaseModules(state.tenantId),
      permissionKeys: [...permissionSet],
    },
    {
      query,
      includeUnpublished: true,
      includeArchived: true,
    },
  );

  return {
    state: { enabled: state.enabled, canManage: state.canManage, reason: state.reason },
    articles: articles.filter((article) => article.scope === "tenant" && article.tenantId === state.tenantId),
  };
}

async function listEnabledTenantKnowledgebaseModules(tenantId: string): Promise<string[]> {
  return listEnabledKnowledgebaseModuleKeysForTenant(tenantId);
}

export async function listTenantKnowledgebaseEditorOptions(articleId?: string | null): Promise<KnowledgebaseEditorOptions> {
  const context = await requireTenantKnowledgebaseAuthoringContext();
  const permissionSet = await getCurrentEffectiveUserPermissions();
  const activeModuleKeys = await listEnabledTenantKnowledgebaseModules(context.tenantId);

  const [categories, modules, permissions, relatedArticles] = await Promise.all([
    db
      .select({
        id: kbCategoriesTable.id,
        name: kbCategoriesTable.name,
        slug: kbCategoriesTable.slug,
        description: kbCategoriesTable.description,
        moduleKey: kbCategoriesTable.moduleKey,
        sortOrder: kbCategoriesTable.sortOrder,
        isActive: kbCategoriesTable.isActive,
      })
      .from(kbCategoriesTable)
      .where(
        and(
          eq(kbCategoriesTable.isActive, true),
          or(
            eq(kbCategoriesTable.scope, "platform_global"),
            and(eq(kbCategoriesTable.scope, "tenant"), eq(kbCategoriesTable.tenantId, context.tenantId)),
          ),
        ),
      )
      .orderBy(asc(kbCategoriesTable.sortOrder), asc(kbCategoriesTable.name)),
    db
      .select({
        key: modulesTable.key,
        name: modulesTable.name,
        description: modulesTable.description,
      })
      .from(modulesTable)
      .where(inArray(modulesTable.key, activeModuleKeys))
      .orderBy(asc(modulesTable.category), asc(modulesTable.name)),
    db
      .select({
        resource: permissionsTable.resource,
        action: permissionsTable.action,
        description: permissionsTable.description,
      })
      .from(permissionsTable)
      .orderBy(asc(permissionsTable.resource), asc(permissionsTable.action)),
    listKnowledgebaseArticlesForContext(
      {
        tenantId: context.tenantId,
        surface: "tenant_backoffice",
        audiences: ["tenant_admin", "tenant_management"],
        activeModuleKeys,
        permissionKeys: [...permissionSet],
      },
      { includeUnpublished: true, includeArchived: false },
    ),
  ]);

  return {
    audiences: AUDIENCE_OPTIONS.filter((audience) => audience.key !== "platform_admin" && audience.key !== "support"),
    categories: categories.filter((category) => !category.moduleKey || activeModuleKeys.includes(category.moduleKey)),
    modules,
    permissions: permissions
      .map((permission) => ({
        key: `${permission.resource}:${permission.action}`,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
      }))
      .filter((permission) => permissionSet.has(permission.key)),
    relatedArticles: relatedArticles
      .filter((article) => article.id !== articleId)
      .map((article) => ({
        id: article.id,
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        status: article.status,
      })),
  };
}

export async function getTenantKnowledgebaseArticleForEdit(id: string): Promise<KnowledgebaseArticleSummary | null> {
  const context = await requireTenantKnowledgebaseAuthoringContext();
  const permissionSet = await getCurrentEffectiveUserPermissions();
  const articles = await listKnowledgebaseArticlesForContext(
    {
      tenantId: context.tenantId,
      surface: "tenant_backoffice",
      audiences: ["tenant_admin", "tenant_management"],
      activeModuleKeys: await listEnabledTenantKnowledgebaseModules(context.tenantId),
      permissionKeys: [...permissionSet],
    },
    { includeUnpublished: true, includeArchived: true },
  );

  return articles.find((article) => article.id === id && article.scope === "tenant" && article.tenantId === context.tenantId) ?? null;
}

export async function saveTenantKnowledgebaseArticle(input: SaveKnowledgebaseArticleInput): Promise<ActionResult<{ id: string; slug: string }>> {
  try {
    const context = await requireTenantKnowledgebaseAuthoringContext();
    const permissionSet = await getCurrentEffectiveUserPermissions();
    const activeModuleKeys = await listEnabledTenantKnowledgebaseModules(context.tenantId);
    const normalized = normalizeInput({
      ...input,
      audienceKeys: input.audienceKeys.filter((audience) => audience !== "platform_admin" && audience !== "support"),
      moduleKeys: input.moduleKeys.filter((moduleKey) => activeModuleKeys.includes(moduleKey)),
      requiredModuleKeys: input.requiredModuleKeys.filter((moduleKey) => activeModuleKeys.includes(moduleKey)),
      permissionKeys: input.permissionKeys.filter((permissionKey) => permissionSet.has(permissionKey)),
    });
    const now = new Date();

    const allowedRelatedArticles = await listKnowledgebaseArticlesForContext(
      {
        tenantId: context.tenantId,
        surface: "tenant_backoffice",
        audiences: ["tenant_admin", "tenant_management"],
        activeModuleKeys,
        permissionKeys: [...permissionSet],
      },
      { includeUnpublished: true, includeArchived: false },
    );
    const allowedRelatedIds = new Set(allowedRelatedArticles.map((article) => article.id));
    const relatedArticleIds = normalized.relatedArticleIds.filter((id) => allowedRelatedIds.has(id));

    const [category] = normalized.categoryId
      ? await db
        .select({ id: kbCategoriesTable.id })
        .from(kbCategoriesTable)
        .where(
          and(
            eq(kbCategoriesTable.id, normalized.categoryId),
            or(
              eq(kbCategoriesTable.scope, "platform_global"),
              and(eq(kbCategoriesTable.scope, "tenant"), eq(kbCategoriesTable.tenantId, context.tenantId)),
            ),
          ),
        )
        .limit(1)
      : [];
    const categoryId = category?.id ?? null;

    const result = await db.transaction(async (tx) => {
      const [existing] = normalized.id
        ? await tx
          .select()
          .from(kbArticlesTable)
          .where(
            and(
              eq(kbArticlesTable.id, normalized.id),
              eq(kbArticlesTable.scope, "tenant"),
              eq(kbArticlesTable.tenantId, context.tenantId),
            ),
          )
          .limit(1)
        : [];

      const publishedAt = normalized.status === "published" ? existing?.publishedAt ?? now : null;
      const archivedAt = normalized.status === "archived" ? now : null;

      const values = {
        scope: "tenant" as const,
        tenantId: context.tenantId,
        categoryId,
        title: normalized.title,
        slug: normalized.slug,
        summary: normalized.summary,
        contentHtml: normalized.contentHtml,
        contentJson: normalized.contentJson,
        contentText: normalized.contentText,
        keywords: normalized.keywords,
        smartTerms: normalized.smartTerms,
        status: normalized.status,
        featured: normalized.featured,
        language: normalized.language,
        publishedAt,
        archivedAt,
        updatedBy: context.userId,
        updatedAt: now,
      };

      const [saved] = existing
        ? await tx.update(kbArticlesTable).set(values).where(eq(kbArticlesTable.id, existing.id)).returning()
        : await tx.insert(kbArticlesTable).values({ ...values, createdBy: context.userId, createdAt: now }).returning();

      if (!saved) throw new Error("Tenantartikel kon niet worden opgeslagen.");

      await tx.delete(kbArticleAudiencesTable).where(eq(kbArticleAudiencesTable.articleId, saved.id));
      await tx.delete(kbArticleModulesTable).where(eq(kbArticleModulesTable.articleId, saved.id));
      await tx.delete(kbArticlePermissionsTable).where(eq(kbArticlePermissionsTable.articleId, saved.id));
      await tx.delete(kbArticleRelatedTable).where(eq(kbArticleRelatedTable.articleId, saved.id));
      await tx.delete(kbSearchTermsTable).where(eq(kbSearchTermsTable.articleId, saved.id));

      if (normalized.audienceKeys.length > 0) {
        await tx.insert(kbArticleAudiencesTable).values(normalized.audienceKeys.map((audienceKey) => ({
          articleId: saved.id,
          audienceKey,
        })));
      }

      if (normalized.moduleKeys.length > 0) {
        await tx.insert(kbArticleModulesTable).values(normalized.moduleKeys.map((moduleKey) => ({
          articleId: saved.id,
          moduleKey,
          isRequired: normalized.requiredModuleKeys.includes(moduleKey),
        })));
      }

      if (normalized.permissionKeys.length > 0) {
        await tx.insert(kbArticlePermissionsTable).values(normalized.permissionKeys.map((permissionKey) => ({
          articleId: saved.id,
          permissionKey,
        })));
      }

      if (relatedArticleIds.length > 0) {
        await tx.insert(kbArticleRelatedTable).values(relatedArticleIds.map((relatedArticleId, index) => ({
          articleId: saved.id,
          relatedArticleId,
          relationType: "manual",
          sortOrder: index + 1,
        })));
      }

      const searchTerms = [
        ...normalized.keywords.map((term) => ({ term, weight: 4 })),
        ...normalized.smartTerms.map((term) => ({ term, weight: 2 })),
      ];
      if (searchTerms.length > 0) {
        await tx.insert(kbSearchTermsTable).values(searchTerms.map((term) => ({
          articleId: saved.id,
          term: term.term,
          weight: term.weight,
          language: normalized.language,
        })));
      }

      const [latestVersion] = await tx
        .select({ versionNo: kbArticleVersionsTable.versionNo })
        .from(kbArticleVersionsTable)
        .where(eq(kbArticleVersionsTable.articleId, saved.id))
        .orderBy(desc(kbArticleVersionsTable.versionNo))
        .limit(1);

      await tx.insert(kbArticleVersionsTable).values({
        articleId: saved.id,
        versionNo: (latestVersion?.versionNo ?? 0) + 1,
        title: saved.title,
        summary: saved.summary,
        contentHtml: saved.contentHtml,
        contentJson: saved.contentJson,
        contentText: saved.contentText,
        changeNote: normalized.changeNote,
        changedBy: context.userId,
      });

      await tx.insert(auditLogTable).values({
        tenantId: context.tenantId,
        userId: context.userId,
        action: existing ? "tenant_kb_article_updated" : "tenant_kb_article_created",
        resource: "kb",
        resourceId: saved.id,
        metadata: {
          title: saved.title,
          slug: saved.slug,
          status: saved.status,
          audienceKeys: normalized.audienceKeys,
          moduleKeys: normalized.moduleKeys,
        },
      });

      return saved;
    });

    revalidateTenantKnowledgebaseManagementPaths();
    return { success: true, data: { id: result.id, slug: result.slug } };
  } catch (error) {
    return { success: false, message: (error as Error).message || "Tenantartikel opslaan mislukt." };
  }
}

export async function saveKnowledgebaseArticle(input: SaveKnowledgebaseArticleInput): Promise<ActionResult<{ id: string; slug: string }>> {
  try {
    const actor = await requirePlatformAdmin();
    const normalized = normalizeInput(input);
    const now = new Date();

    const result = await db.transaction(async (tx) => {
      const [existing] = normalized.id
        ? await tx
          .select()
          .from(kbArticlesTable)
          .where(and(eq(kbArticlesTable.id, normalized.id), eq(kbArticlesTable.scope, "platform_global")))
          .limit(1)
        : [];

      const publishedAt = normalized.status === "published" ? existing?.publishedAt ?? now : null;
      const archivedAt = normalized.status === "archived" ? now : null;

      const values = {
        scope: "platform_global" as const,
        tenantId: null,
        categoryId: normalized.categoryId,
        title: normalized.title,
        slug: normalized.slug,
        summary: normalized.summary,
        contentHtml: normalized.contentHtml,
        contentJson: normalized.contentJson,
        contentText: normalized.contentText,
        keywords: normalized.keywords,
        smartTerms: normalized.smartTerms,
        status: normalized.status,
        featured: normalized.featured,
        language: normalized.language,
        publishedAt,
        archivedAt,
        updatedBy: actor.userId,
        updatedAt: now,
      };

      const [saved] = existing
        ? await tx
          .update(kbArticlesTable)
          .set(values)
          .where(eq(kbArticlesTable.id, existing.id))
          .returning()
        : await tx
          .insert(kbArticlesTable)
          .values({
            ...values,
            createdBy: actor.userId,
            createdAt: now,
          })
          .returning();

      if (!saved) throw new Error("Artikel kon niet worden opgeslagen.");

      await tx.delete(kbArticleAudiencesTable).where(eq(kbArticleAudiencesTable.articleId, saved.id));
      await tx.delete(kbArticleModulesTable).where(eq(kbArticleModulesTable.articleId, saved.id));
      await tx.delete(kbArticlePermissionsTable).where(eq(kbArticlePermissionsTable.articleId, saved.id));
      await tx.delete(kbArticleRelatedTable).where(eq(kbArticleRelatedTable.articleId, saved.id));
      await tx.delete(kbSearchTermsTable).where(eq(kbSearchTermsTable.articleId, saved.id));

      if (normalized.audienceKeys.length > 0) {
        await tx.insert(kbArticleAudiencesTable).values(
          normalized.audienceKeys.map((audienceKey) => ({
            articleId: saved.id,
            audienceKey,
          })),
        );
      }

      if (normalized.moduleKeys.length > 0) {
        await tx.insert(kbArticleModulesTable).values(
          normalized.moduleKeys.map((moduleKey) => ({
            articleId: saved.id,
            moduleKey,
            isRequired: normalized.requiredModuleKeys.includes(moduleKey),
          })),
        );
      }

      if (normalized.permissionKeys.length > 0) {
        await tx.insert(kbArticlePermissionsTable).values(
          normalized.permissionKeys.map((permissionKey) => ({
            articleId: saved.id,
            permissionKey,
          })),
        );
      }

      if (normalized.relatedArticleIds.length > 0) {
        await tx.insert(kbArticleRelatedTable).values(
          normalized.relatedArticleIds.map((relatedArticleId, index) => ({
            articleId: saved.id,
            relatedArticleId,
            relationType: "manual",
            sortOrder: index + 1,
          })),
        );
      }

      const searchTerms = [
        ...normalized.keywords.map((term) => ({ term, weight: 4 })),
        ...normalized.smartTerms.map((term) => ({ term, weight: 2 })),
      ];
      if (searchTerms.length > 0) {
        await tx.insert(kbSearchTermsTable).values(
          searchTerms.map((term) => ({
            articleId: saved.id,
            term: term.term,
            weight: term.weight,
            language: normalized.language,
          })),
        );
      }

      const [latestVersion] = await tx
        .select({ versionNo: kbArticleVersionsTable.versionNo })
        .from(kbArticleVersionsTable)
        .where(eq(kbArticleVersionsTable.articleId, saved.id))
        .orderBy(desc(kbArticleVersionsTable.versionNo))
        .limit(1);

      await tx.insert(kbArticleVersionsTable).values({
        articleId: saved.id,
        versionNo: (latestVersion?.versionNo ?? 0) + 1,
        title: saved.title,
        summary: saved.summary,
        contentHtml: saved.contentHtml,
        contentJson: saved.contentJson,
        contentText: saved.contentText,
        changeNote: normalized.changeNote,
        changedBy: actor.userId,
      });

      await tx.insert(auditLogTable).values({
        userId: actor.userId,
        action: existing ? "update" : "create",
        resource: "kb",
        resourceId: saved.id,
        metadata: {
          title: saved.title,
          slug: saved.slug,
          status: saved.status,
          audienceKeys: normalized.audienceKeys,
          moduleKeys: normalized.moduleKeys,
        },
      });

      return {
        article: saved,
        previousStatus: existing?.status ?? null,
        previousFeatured: existing?.featured ?? false,
      };
    });

    revalidateKnowledgebasePaths();

    if (result.article.status === "published") {
      const notificationBase = {
        actorUserId: actor.userId,
        moduleKeys: normalized.moduleKeys,
        requiredModuleKeys: uniqueStrings(["knowledgebase", ...normalized.requiredModuleKeys]),
        audienceKeys: normalized.audienceKeys,
        permissionKeys: normalized.permissionKeys,
        requiredPermissionKeys: ["kb:view"],
        aggregate: { type: "kb", id: result.article.id },
        payload: {
          article: {
            id: result.article.id,
            title: result.article.title,
            slug: result.article.slug,
            summary: result.article.summary ?? "",
          },
        },
        fallback: {
          title: `Nieuwe handleiding: ${result.article.title}`,
          body: result.article.summary ?? "Er staat een nieuwe Fieldgrid handleiding klaar.",
          category: "knowledgebase",
          href: `/help/${result.article.slug}`,
        },
      };

      if (result.previousStatus !== "published") {
        await emitFieldgridContentNotification({
          ...notificationBase,
          eventKey: "kb_article_published",
        });
      } else {
        await emitFieldgridContentNotification({
          ...notificationBase,
          eventKey: "kb_article_updated",
          fallback: {
            ...notificationBase.fallback,
            title: `Handleiding bijgewerkt: ${result.article.title}`,
            body: result.article.summary ?? "Een Fieldgrid handleiding is bijgewerkt.",
          },
        });
      }

      if (result.article.featured && !result.previousFeatured) {
        await emitFieldgridContentNotification({
          ...notificationBase,
          eventKey: "kb_article_featured",
          fallback: {
            ...notificationBase.fallback,
            title: `Belangrijke handleiding: ${result.article.title}`,
            body: result.article.summary ?? "Een belangrijke Fieldgrid handleiding is uitgelicht.",
            priority: "high",
          },
        });
      }
    }

    return { success: true, data: { id: result.article.id, slug: result.article.slug } };
  } catch (error) {
    return { success: false, message: (error as Error).message || "Artikel opslaan mislukt." };
  }
}

export async function saveKnowledgebaseCategoryFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const moduleKey = String(formData.get("moduleKey") ?? "").trim() || null;
  const sortOrder = Number.parseInt(String(formData.get("sortOrder") ?? "0"), 10) || 0;
  const isActive = formData.get("isActive") === "on";
  const slug = slugify(String(formData.get("slug") ?? "").trim() || name, "categorie");

  if (!name) throw new Error("Categorienaam is verplicht.");

  const values = {
    scope: "platform_global" as const,
    tenantId: null,
    name,
    slug,
    description,
    moduleKey,
    sortOrder,
    isActive,
    updatedBy: actor.userId,
    updatedAt: new Date(),
  };

  const [saved] = id
    ? await db
      .update(kbCategoriesTable)
      .set(values)
      .where(and(eq(kbCategoriesTable.id, id), eq(kbCategoriesTable.scope, "platform_global")))
      .returning({ id: kbCategoriesTable.id })
    : await db
      .insert(kbCategoriesTable)
      .values({
        ...values,
        createdBy: actor.userId,
      })
      .returning({ id: kbCategoriesTable.id });

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: id ? "update" : "create",
    resource: "kb_category",
    resourceId: saved?.id ?? id,
    metadata: { name, slug, moduleKey, isActive },
  });

  revalidateKnowledgebasePaths();
}

export async function archiveKnowledgebaseArticle(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requirePlatformAdmin();
    await db
      .update(kbArticlesTable)
      .set({
        status: "archived",
        archivedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: actor.userId,
      })
      .where(and(eq(kbArticlesTable.id, id), eq(kbArticlesTable.scope, "platform_global")));

    await db.insert(auditLogTable).values({
      userId: actor.userId,
      action: "archive",
      resource: "kb",
      resourceId: id,
      metadata: {},
    });

    revalidateKnowledgebasePaths();
    return { success: true, data: { id } };
  } catch (error) {
    return { success: false, message: (error as Error).message || "Artikel archiveren mislukt." };
  }
}

export async function uploadKnowledgebaseMedia(formData: FormData): Promise<ActionResult<{ id: string; url: string; path: string }>> {
  try {
    const actor = await requirePlatformAdmin();
    const articleId = String(formData.get("articleId") ?? "").trim();
    const altText = String(formData.get("altText") ?? "").trim() || null;
    const caption = String(formData.get("caption") ?? "").trim() || null;
    const file = formData.get("file") as File | null;

    if (!articleId) return { success: false, message: "Sla het artikel eerst op voordat u media toevoegt." };
    if (!file || file.size === 0) return { success: false, message: "Geen bestand geselecteerd." };
    if (!altText) return { success: false, message: "Alt-tekst is verplicht voor knowledgebase-media." };
    if (file.size > MAX_MEDIA_BYTES) return { success: false, message: "Bestand mag maximaal 50 MB zijn." };
    if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
      return { success: false, message: "Gebruik JPG, PNG, WebP, GIF, MP4, WebM of PDF." };
    }

    const [article] = await db
      .select({ id: kbArticlesTable.id })
      .from(kbArticlesTable)
      .where(and(eq(kbArticlesTable.id, articleId), eq(kbArticlesTable.scope, "platform_global")))
      .limit(1);
    if (!article) return { success: false, message: "Artikel niet gevonden." };

    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
    const mediaType = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : "attachment";
    const path = `platform/${articleId}/${randomUUID()}.${ext}`;
    const bytes = await file.arrayBuffer();
    const supabase = createAdminClient();
    const { error } = await supabase.storage
      .from(KB_MEDIA_BUCKET)
      .upload(path, bytes, {
        contentType: file.type,
        upsert: false,
      });

    if (error) return { success: false, message: `Upload mislukt: ${error.message}` };

    const [saved] = await db
      .insert(kbArticleMediaTable)
      .values({
        articleId,
        tenantId: null,
        scope: "platform_global",
        mediaType,
        storagePath: path,
        publicUrl: null,
        mimeType: file.type,
        sizeBytes: file.size,
        altText,
        caption,
        createdBy: actor.userId,
      })
      .returning({ id: kbArticleMediaTable.id });

    await db.insert(auditLogTable).values({
      userId: actor.userId,
      action: "upload_media",
      resource: "kb",
      resourceId: articleId,
      metadata: { mediaId: saved.id, path, mediaType, mimeType: file.type },
    });

    revalidateKnowledgebasePaths();
    return { success: true, data: { id: saved.id, url: `/platform/knowledgebase/media/${saved.id}`, path } };
  } catch (error) {
    return { success: false, message: (error as Error).message || "Media uploaden mislukt." };
  }
}

export async function archiveTenantKnowledgebaseArticle(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const context = await requireTenantKnowledgebaseAuthoringContext();
    await db
      .update(kbArticlesTable)
      .set({
        status: "archived",
        archivedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: context.userId,
      })
      .where(
        and(
          eq(kbArticlesTable.id, id),
          eq(kbArticlesTable.scope, "tenant"),
          eq(kbArticlesTable.tenantId, context.tenantId),
        ),
      );

    await db.insert(auditLogTable).values({
      tenantId: context.tenantId,
      userId: context.userId,
      action: "tenant_kb_article_archived",
      resource: "kb",
      resourceId: id,
      metadata: {},
    });

    revalidateTenantKnowledgebaseManagementPaths();
    return { success: true, data: { id } };
  } catch (error) {
    return { success: false, message: (error as Error).message || "Tenantartikel archiveren mislukt." };
  }
}

export async function uploadTenantKnowledgebaseMedia(formData: FormData): Promise<ActionResult<{ id: string; url: string; path: string }>> {
  try {
    const context = await requireTenantKnowledgebaseAuthoringContext();
    const articleId = String(formData.get("articleId") ?? "").trim();
    const altText = String(formData.get("altText") ?? "").trim() || null;
    const caption = String(formData.get("caption") ?? "").trim() || null;
    const file = formData.get("file") as File | null;

    if (!articleId) return { success: false, message: "Sla het artikel eerst op voordat u media toevoegt." };
    if (!file || file.size === 0) return { success: false, message: "Geen bestand geselecteerd." };
    if (!altText) return { success: false, message: "Alt-tekst is verplicht voor knowledgebase-media." };
    if (file.size > MAX_MEDIA_BYTES) return { success: false, message: "Bestand mag maximaal 50 MB zijn." };
    if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
      return { success: false, message: "Gebruik JPG, PNG, WebP, GIF, MP4, WebM of PDF." };
    }

    const [article] = await db
      .select({ id: kbArticlesTable.id })
      .from(kbArticlesTable)
      .where(
        and(
          eq(kbArticlesTable.id, articleId),
          eq(kbArticlesTable.scope, "tenant"),
          eq(kbArticlesTable.tenantId, context.tenantId),
        ),
      )
      .limit(1);
    if (!article) return { success: false, message: "Tenantartikel niet gevonden." };

    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
    const mediaType = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : "attachment";
    const path = `tenant/${context.tenantId}/${articleId}/${randomUUID()}.${ext}`;
    const bytes = await file.arrayBuffer();
    const supabase = createAdminClient();
    const { error } = await supabase.storage
      .from(KB_MEDIA_BUCKET)
      .upload(path, bytes, {
        contentType: file.type,
        upsert: false,
      });

    if (error) return { success: false, message: `Upload mislukt: ${error.message}` };

    const [saved] = await db
      .insert(kbArticleMediaTable)
      .values({
        articleId,
        tenantId: context.tenantId,
        scope: "tenant",
        mediaType,
        storagePath: path,
        publicUrl: null,
        mimeType: file.type,
        sizeBytes: file.size,
        altText,
        caption,
        createdBy: context.userId,
      })
      .returning({ id: kbArticleMediaTable.id });

    await db.insert(auditLogTable).values({
      tenantId: context.tenantId,
      userId: context.userId,
      action: "tenant_kb_media_uploaded",
      resource: "kb",
      resourceId: articleId,
      metadata: { mediaId: saved.id, path, mediaType, mimeType: file.type },
    });

    revalidateTenantKnowledgebaseManagementPaths();
    return { success: true, data: { id: saved.id, url: `/help/media/${saved.id}`, path } };
  } catch (error) {
    return { success: false, message: (error as Error).message || "Tenantmedia uploaden mislukt." };
  }
}

export async function getTenantProductExperienceSettings(): Promise<TenantProductExperienceSettings> {
  await requirePermission("settings", "read");
  const tenantId = await requireCurrentTenantId();
  const [settings] = await db
    .select({
      kbTenantAuthoringEnabled: organizationSettingsTable.kbTenantAuthoringEnabled,
      roadmapPersonnelRequestsEnabled: organizationSettingsTable.roadmapPersonnelRequestsEnabled,
      roadmapCustomerRequestsEnabled: organizationSettingsTable.roadmapCustomerRequestsEnabled,
    })
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.tenantId, tenantId))
    .limit(1);

  return {
    kbTenantAuthoringEnabled: Boolean(settings?.kbTenantAuthoringEnabled),
    roadmapPersonnelRequestsEnabled: Boolean(settings?.roadmapPersonnelRequestsEnabled),
    roadmapCustomerRequestsEnabled: Boolean(settings?.roadmapCustomerRequestsEnabled),
  };
}

export async function saveTenantProductExperienceSettings(formData: FormData): Promise<void> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  const user = await getCurrentBackofficeUser();
  if (!user) throw new Error("Geen actieve gebruiker gevonden.");
  const values = {
    kbTenantAuthoringEnabled: formData.get("kbTenantAuthoringEnabled") === "on",
    roadmapPersonnelRequestsEnabled: formData.get("roadmapPersonnelRequestsEnabled") === "on",
    roadmapCustomerRequestsEnabled: formData.get("roadmapCustomerRequestsEnabled") === "on",
    updatedAt: new Date(),
    updatedBy: user.id,
  };

  const [existing] = await db
    .select({ id: organizationSettingsTable.id })
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.tenantId, tenantId))
    .limit(1);

  if (existing) {
    await db.update(organizationSettingsTable).set(values).where(eq(organizationSettingsTable.id, existing.id));
  } else {
    await db.insert(organizationSettingsTable).values({
      tenantId,
      ...values,
    });
  }

  await db.insert(auditLogTable).values({
    tenantId,
    userId: user.id,
    action: "product_experience_settings_updated",
    resource: "settings",
    resourceId: tenantId,
    metadata: {
      kbTenantAuthoringEnabled: values.kbTenantAuthoringEnabled,
      roadmapPersonnelRequestsEnabled: values.roadmapPersonnelRequestsEnabled,
      roadmapCustomerRequestsEnabled: values.roadmapCustomerRequestsEnabled,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/instellingen/productervaring");
  revalidatePath("/help/beheer");
}

async function loadTooltipRelations(tooltipIds: string[]) {
  if (tooltipIds.length === 0) {
    return {
      audiences: new Map<string, FieldgridContentAudience[]>(),
      related: new Map<string, string[]>(),
    };
  }

  const [audienceRows, relatedRows] = await Promise.all([
    db
      .select({
        tooltipId: kbTooltipAudiencesTable.tooltipId,
        audienceKey: kbTooltipAudiencesTable.audienceKey,
      })
      .from(kbTooltipAudiencesTable)
      .where(inArray(kbTooltipAudiencesTable.tooltipId, tooltipIds)),
    db
      .select({
        tooltipId: kbTooltipRelatedArticlesTable.tooltipId,
        articleId: kbTooltipRelatedArticlesTable.articleId,
      })
      .from(kbTooltipRelatedArticlesTable)
      .where(inArray(kbTooltipRelatedArticlesTable.tooltipId, tooltipIds)),
  ]);

  const audiences = new Map<string, FieldgridContentAudience[]>();
  for (const row of audienceRows) {
    const list = audiences.get(row.tooltipId) ?? [];
    list.push(row.audienceKey);
    audiences.set(row.tooltipId, list);
  }

  const related = new Map<string, string[]>();
  for (const row of relatedRows) {
    const list = related.get(row.tooltipId) ?? [];
    list.push(row.articleId);
    related.set(row.tooltipId, list);
  }

  return { audiences, related };
}

export async function listKnowledgebaseTooltipsForManagement(): Promise<KnowledgebaseTooltipRow[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: kbTooltipsTable.id,
      stableKey: kbTooltipsTable.stableKey,
      title: kbTooltipsTable.title,
      description: kbTooltipsTable.description,
      articleId: kbTooltipsTable.articleId,
      articleTitle: kbArticlesTable.title,
      articleSlug: kbArticlesTable.slug,
      moduleKey: kbTooltipsTable.moduleKey,
      permissionKey: kbTooltipsTable.permissionKey,
      status: kbTooltipsTable.status,
      placement: kbTooltipsTable.placement,
      openInDrawer: kbTooltipsTable.openInDrawer,
      showRelatedArticles: kbTooltipsTable.showRelatedArticles,
      updatedAt: kbTooltipsTable.updatedAt,
    })
    .from(kbTooltipsTable)
    .leftJoin(kbArticlesTable, eq(kbTooltipsTable.articleId, kbArticlesTable.id))
    .orderBy(asc(kbTooltipsTable.stableKey));

  const relations = await loadTooltipRelations(rows.map((row) => row.id));

  return rows.map((row) => ({
    ...row,
    status: normalizeTooltipStatus(row.status),
    updatedAt: row.updatedAt.toISOString(),
    audienceKeys: relations.audiences.get(row.id) ?? [],
    relatedArticleIds: relations.related.get(row.id) ?? [],
  }));
}

export async function saveKnowledgebaseTooltipFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const stableKey = String(formData.get("stableKey") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const articleId = String(formData.get("articleId") ?? "").trim() || null;
  const moduleKey = String(formData.get("moduleKey") ?? "").trim() || null;
  const permissionKey = String(formData.get("permissionKey") ?? "").trim() || null;
  const status = normalizeTooltipStatus(String(formData.get("status") ?? ""));
  const placement = String(formData.get("placement") ?? "top").trim() || "top";
  const openInDrawer = formData.get("openInDrawer") === "on";
  const showRelatedArticles = formData.getAll("showRelatedArticles").map(String).includes("on");
  const audienceKeys = formData.getAll("audienceKeys").map(String).filter((key): key is FieldgridContentAudience =>
    AUDIENCE_OPTIONS.some((option) => option.key === key),
  );
  const relatedArticleIds = uniqueStrings(formData.getAll("relatedArticleIds").map(String));

  if (!stableKey) throw new Error("Stabiele tooltip-key is verplicht.");
  if (!title) throw new Error("Tooltip titel is verplicht.");
  if (!description) throw new Error("Tooltip beschrijving is verplicht.");

  await db.transaction(async (tx) => {
    const values = {
      stableKey,
      title,
      description,
      articleId,
      moduleKey,
      permissionKey,
      status,
      placement,
      openInDrawer,
      showRelatedArticles,
      updatedBy: actor.userId,
      updatedAt: new Date(),
    };

    const [row] = id
      ? await tx
        .update(kbTooltipsTable)
        .set(values)
        .where(eq(kbTooltipsTable.id, id))
        .returning({ id: kbTooltipsTable.id })
      : await tx
        .insert(kbTooltipsTable)
        .values({
          ...values,
          createdBy: actor.userId,
        })
        .returning({ id: kbTooltipsTable.id });

    if (!row) throw new Error("Tooltip kon niet worden opgeslagen.");

    await tx.delete(kbTooltipAudiencesTable).where(eq(kbTooltipAudiencesTable.tooltipId, row.id));
    await tx.delete(kbTooltipRelatedArticlesTable).where(eq(kbTooltipRelatedArticlesTable.tooltipId, row.id));

    if (audienceKeys.length > 0) {
      await tx.insert(kbTooltipAudiencesTable).values(
        audienceKeys.map((audienceKey) => ({
          tooltipId: row.id,
          audienceKey,
        })),
      );
    }

    const related = relatedArticleIds.filter((relatedArticleId) => relatedArticleId !== articleId);
    if (related.length > 0) {
      await tx.insert(kbTooltipRelatedArticlesTable).values(
        related.map((relatedArticleId, index) => ({
          tooltipId: row.id,
          articleId: relatedArticleId,
          sortOrder: index + 1,
        })),
      );
    }

    await tx.insert(auditLogTable).values({
      userId: actor.userId,
      action: id ? "update" : "create",
      resource: "help_tooltips",
      resourceId: row.id,
      metadata: { stableKey, title, status, articleId, moduleKey, permissionKey, audienceKeys },
    });
  });

  revalidateKnowledgebasePaths();
  revalidatePath("/platform/knowledgebase/tooltips");
}

export async function archiveKnowledgebaseTooltip(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await db
    .update(kbTooltipsTable)
    .set({
      status: "archived",
      updatedBy: actor.userId,
      updatedAt: new Date(),
    })
    .where(eq(kbTooltipsTable.id, id));

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "archive",
    resource: "help_tooltips",
    resourceId: id,
    metadata: {},
  });

  revalidatePath("/platform/knowledgebase/tooltips");
}

export async function saveKnowledgebaseArticleFromForm(formData: FormData): Promise<ActionResult<{ id: string; slug: string }>> {
  const audienceKeys = formData.getAll("audienceKeys").map(String) as FieldgridContentAudience[];
  const moduleKeys = formData.getAll("moduleKeys").map(String);
  const requiredModuleKeys = formData.getAll("requiredModuleKeys").map(String);
  const permissionKeys = formData.getAll("permissionKeys").map(String);
  const relatedArticleIds = formData.getAll("relatedArticleIds").map(String);

  return saveKnowledgebaseArticle({
    id: String(formData.get("id") ?? "") || null,
    title: String(formData.get("title") ?? ""),
    slug: String(formData.get("slug") ?? "") || null,
    summary: String(formData.get("summary") ?? "") || null,
    categoryId: String(formData.get("categoryId") ?? "") || null,
    contentHtml: String(formData.get("contentHtml") ?? ""),
    contentJson: null,
    keywords: parseCsv(formData.get("keywords")),
    smartTerms: parseCsv(formData.get("smartTerms")),
    status: normalizeStatus(String(formData.get("status") ?? "")),
    featured: formData.get("featured") === "on",
    language: String(formData.get("language") ?? "nl"),
    audienceKeys,
    moduleKeys,
    requiredModuleKeys,
    permissionKeys,
    relatedArticleIds,
    changeNote: String(formData.get("changeNote") ?? "") || null,
  });
}

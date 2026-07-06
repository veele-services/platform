"use server";

import {
  auditLogTable,
  db,
  listEnabledKnowledgebaseModuleKeysForTenant,
  modulesTable,
  releaseRoadmapLinksTable,
  releasesTable,
  roadmapItemAudiencesTable,
  roadmapItemCommentsTable,
  roadmapItemModulesTable,
  roadmapItemStatusHistoryTable,
  roadmapItemTenantLinksTable,
  roadmapItemVotesTable,
  roadmapItemsTable,
  tenantsTable,
  type FieldgridContentAudience,
  type RoadmapCommentVisibility,
  type RoadmapPriority,
  type RoadmapScope,
  type RoadmapStatus,
  type RoadmapTenantLinkType,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { getCurrentEffectiveUserPermissions, requirePermission } from "@/lib/auth/permissions";
import { getCurrentBackofficeUser, requireCurrentTenantId } from "@/lib/auth/tenant";
import { emitFieldgridContentNotification } from "@/lib/content-notification-events";

export type RoadmapModuleOption = {
  key: string;
  name: string;
  description: string | null;
};

export type RoadmapTenantOption = {
  id: string;
  name: string;
  slug: string;
};

export type RoadmapReleaseOption = {
  id: string;
  version: string;
  title: string;
  status: string;
};

export type RoadmapEditorOptions = {
  modules: RoadmapModuleOption[];
  tenants: RoadmapTenantOption[];
  releases: RoadmapReleaseOption[];
};

export type RoadmapCommentSummary = {
  id: string;
  body: string;
  visibility: RoadmapCommentVisibility;
  tenantId: string | null;
  authorUserId: string | null;
  createdAt: string;
};

export type RoadmapStatusHistorySummary = {
  id: string;
  fromStatus: RoadmapStatus | null;
  toStatus: RoadmapStatus;
  changedBy: string | null;
  note: string | null;
  createdAt: string;
};

export type RoadmapTenantLinkSummary = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  relationType: RoadmapTenantLinkType;
};

export type RoadmapItemSummary = {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  scope: RoadmapScope;
  title: string;
  slug: string;
  description: string;
  status: RoadmapStatus;
  priority: RoadmapPriority;
  submittedBy: string | null;
  plannedVersion: string | null;
  expectedDelivery: string | null;
  publicVisible: boolean;
  featured: boolean;
  internalNote: string | null;
  convertedFromItemId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  audienceKeys: FieldgridContentAudience[];
  moduleKeys: string[];
  tenantLinks: RoadmapTenantLinkSummary[];
  comments: RoadmapCommentSummary[];
  statusHistory: RoadmapStatusHistorySummary[];
  voteCount: number;
  hasCurrentUserVote: boolean;
  linkedReleases: RoadmapReleaseOption[];
};

export type RoadmapBoardData = {
  items: RoadmapItemSummary[];
  options: RoadmapEditorOptions;
};

type RoadmapTenantContext = {
  tenantId: string;
  userId: string;
  permissionKeys: Set<string>;
  activeModuleKeys: string[];
  audiences: FieldgridContentAudience[];
};

type RoadmapRelationMaps = {
  audiences: Map<string, FieldgridContentAudience[]>;
  modules: Map<string, string[]>;
  comments: Map<string, RoadmapCommentSummary[]>;
  history: Map<string, RoadmapStatusHistorySummary[]>;
  votes: Map<string, { count: number; userVoted: boolean }>;
  tenantLinks: Map<string, RoadmapTenantLinkSummary[]>;
  releases: Map<string, RoadmapReleaseOption[]>;
};

const TENANT_ROADMAP_AUDIENCES: FieldgridContentAudience[] = [
  "tenant_admin",
  "tenant_management",
  "tenant_planning",
  "tenant_administration",
];

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function normalizeStatus(value: string): RoadmapStatus {
  if (value === "considering" || value === "in_development" || value === "done" || value === "archived") return value;
  return "new";
}

function normalizePriority(value: string): RoadmapPriority {
  if (value === "low" || value === "high" || value === "critical") return value;
  return "normal";
}

function normalizeScope(value: string): RoadmapScope {
  return value === "global" ? "global" : "tenant";
}

function normalizeCommentVisibility(value: string): RoadmapCommentVisibility {
  return value === "platform_internal" ? "platform_internal" : "tenant_visible";
}

function normalizeAudienceKeys(values: string[]): FieldgridContentAudience[] {
  const allowed = new Set<FieldgridContentAudience>([
    "platform_admin",
    "support",
    "tenant_admin",
    "tenant_management",
    "tenant_planning",
    "tenant_administration",
    "tenant_personnel",
    "tenant_customer",
  ]);

  return uniqueStrings(values).filter((value): value is FieldgridContentAudience => allowed.has(value as FieldgridContentAudience));
}

function revalidateRoadmapPaths(): void {
  revalidatePath("/platform/roadmap");
  revalidatePath("/roadmap");
}

async function roadmapNotificationScope(itemId: string): Promise<{
  item: { id: string; title: string; status: RoadmapStatus; scope: RoadmapScope; tenantId: string | null; publicVisible: boolean };
  tenantIds: string[] | undefined;
  moduleKeys: string[];
  audienceKeys: FieldgridContentAudience[];
} | null> {
  const [item] = await db
    .select({
      id: roadmapItemsTable.id,
      title: roadmapItemsTable.title,
      status: roadmapItemsTable.status,
      scope: roadmapItemsTable.scope,
      tenantId: roadmapItemsTable.tenantId,
      publicVisible: roadmapItemsTable.publicVisible,
    })
    .from(roadmapItemsTable)
    .where(eq(roadmapItemsTable.id, itemId))
    .limit(1);

  if (!item) return null;

  const [moduleRows, audienceRows, tenantLinkRows] = await Promise.all([
    db
      .select({ moduleKey: roadmapItemModulesTable.moduleKey })
      .from(roadmapItemModulesTable)
      .where(eq(roadmapItemModulesTable.roadmapItemId, itemId)),
    db
      .select({ audienceKey: roadmapItemAudiencesTable.audienceKey })
      .from(roadmapItemAudiencesTable)
      .where(eq(roadmapItemAudiencesTable.roadmapItemId, itemId)),
    db
      .select({ tenantId: roadmapItemTenantLinksTable.tenantId })
      .from(roadmapItemTenantLinksTable)
      .where(eq(roadmapItemTenantLinksTable.roadmapItemId, itemId)),
  ]);

  const tenantIds = item.scope === "tenant" && item.tenantId
    ? [item.tenantId]
    : item.publicVisible
      ? undefined
      : tenantLinkRows.map((row) => row.tenantId);

  return {
    item,
    tenantIds,
    moduleKeys: uniqueStrings(moduleRows.map((row) => row.moduleKey)),
    audienceKeys: normalizeAudienceKeys(audienceRows.map((row) => row.audienceKey)),
  };
}

async function getTenantRoadmapContext(): Promise<RoadmapTenantContext | null> {
  const tenantId = await requireCurrentTenantId();
  const user = await getCurrentBackofficeUser();
  if (!user) return null;

  const permissionKeys = await getCurrentEffectiveUserPermissions();
  if (!permissionKeys.has("roadmap:view")) return null;

  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(tenantId);
  if (!activeModuleKeys.includes("roadmap")) return null;

  return {
    tenantId,
    userId: user.id,
    permissionKeys,
    activeModuleKeys,
    audiences: TENANT_ROADMAP_AUDIENCES,
  };
}

async function listRoadmapEditorOptions(includeTenants: boolean): Promise<RoadmapEditorOptions> {
  const [modules, tenants, releases] = await Promise.all([
    db
      .select({
        key: modulesTable.key,
        name: modulesTable.name,
        description: modulesTable.description,
      })
      .from(modulesTable)
      .orderBy(asc(modulesTable.category), asc(modulesTable.name)),
    includeTenants
      ? db
        .select({
          id: tenantsTable.id,
          name: tenantsTable.name,
          slug: tenantsTable.slug,
        })
        .from(tenantsTable)
        .orderBy(asc(tenantsTable.name))
      : Promise.resolve([]),
    db
      .select({
        id: releasesTable.id,
        version: releasesTable.version,
        title: releasesTable.title,
        status: releasesTable.status,
      })
      .from(releasesTable)
      .orderBy(desc(releasesTable.publishedAt), desc(releasesTable.updatedAt)),
  ]);

  return { modules, tenants, releases };
}

async function loadRoadmapRelations(
  itemIds: string[],
  currentUserId: string | null,
  includeInternalComments: boolean,
): Promise<RoadmapRelationMaps> {
  if (itemIds.length === 0) {
    return {
      audiences: new Map(),
      modules: new Map(),
      comments: new Map(),
      history: new Map(),
      votes: new Map(),
      tenantLinks: new Map(),
      releases: new Map(),
    };
  }

  const [audienceRows, moduleRows, commentRows, historyRows, voteRows, tenantLinkRows, releaseLinkRows] = await Promise.all([
    db
      .select({
        roadmapItemId: roadmapItemAudiencesTable.roadmapItemId,
        audienceKey: roadmapItemAudiencesTable.audienceKey,
      })
      .from(roadmapItemAudiencesTable)
      .where(inArray(roadmapItemAudiencesTable.roadmapItemId, itemIds)),
    db
      .select({
        roadmapItemId: roadmapItemModulesTable.roadmapItemId,
        moduleKey: roadmapItemModulesTable.moduleKey,
      })
      .from(roadmapItemModulesTable)
      .where(inArray(roadmapItemModulesTable.roadmapItemId, itemIds)),
    db
      .select({
        id: roadmapItemCommentsTable.id,
        roadmapItemId: roadmapItemCommentsTable.roadmapItemId,
        tenantId: roadmapItemCommentsTable.tenantId,
        authorUserId: roadmapItemCommentsTable.authorUserId,
        body: roadmapItemCommentsTable.body,
        visibility: roadmapItemCommentsTable.visibility,
        createdAt: roadmapItemCommentsTable.createdAt,
      })
      .from(roadmapItemCommentsTable)
      .where(
        includeInternalComments
          ? inArray(roadmapItemCommentsTable.roadmapItemId, itemIds)
          : and(
            inArray(roadmapItemCommentsTable.roadmapItemId, itemIds),
            eq(roadmapItemCommentsTable.visibility, "tenant_visible"),
          ),
      )
      .orderBy(desc(roadmapItemCommentsTable.createdAt)),
    db
      .select({
        id: roadmapItemStatusHistoryTable.id,
        roadmapItemId: roadmapItemStatusHistoryTable.roadmapItemId,
        fromStatus: roadmapItemStatusHistoryTable.fromStatus,
        toStatus: roadmapItemStatusHistoryTable.toStatus,
        changedBy: roadmapItemStatusHistoryTable.changedBy,
        note: roadmapItemStatusHistoryTable.note,
        createdAt: roadmapItemStatusHistoryTable.createdAt,
      })
      .from(roadmapItemStatusHistoryTable)
      .where(inArray(roadmapItemStatusHistoryTable.roadmapItemId, itemIds))
      .orderBy(desc(roadmapItemStatusHistoryTable.createdAt)),
    db
      .select({
        roadmapItemId: roadmapItemVotesTable.roadmapItemId,
        userId: roadmapItemVotesTable.userId,
      })
      .from(roadmapItemVotesTable)
      .where(inArray(roadmapItemVotesTable.roadmapItemId, itemIds)),
    db
      .select({
        roadmapItemId: roadmapItemTenantLinksTable.roadmapItemId,
        tenantId: roadmapItemTenantLinksTable.tenantId,
        relationType: roadmapItemTenantLinksTable.relationType,
        tenantName: tenantsTable.name,
        tenantSlug: tenantsTable.slug,
      })
      .from(roadmapItemTenantLinksTable)
      .innerJoin(tenantsTable, eq(roadmapItemTenantLinksTable.tenantId, tenantsTable.id))
      .where(inArray(roadmapItemTenantLinksTable.roadmapItemId, itemIds)),
    db
      .select({
        roadmapItemId: releaseRoadmapLinksTable.roadmapItemId,
        releaseId: releasesTable.id,
        version: releasesTable.version,
        title: releasesTable.title,
        status: releasesTable.status,
      })
      .from(releaseRoadmapLinksTable)
      .innerJoin(releasesTable, eq(releaseRoadmapLinksTable.releaseId, releasesTable.id))
      .where(inArray(releaseRoadmapLinksTable.roadmapItemId, itemIds)),
  ]);

  const audiences = new Map<string, FieldgridContentAudience[]>();
  for (const row of audienceRows) {
    const list = audiences.get(row.roadmapItemId) ?? [];
    list.push(row.audienceKey);
    audiences.set(row.roadmapItemId, list);
  }

  const modules = new Map<string, string[]>();
  for (const row of moduleRows) {
    const list = modules.get(row.roadmapItemId) ?? [];
    list.push(row.moduleKey);
    modules.set(row.roadmapItemId, list);
  }

  const comments = new Map<string, RoadmapCommentSummary[]>();
  for (const row of commentRows) {
    const list = comments.get(row.roadmapItemId) ?? [];
    list.push({
      id: row.id,
      body: row.body,
      visibility: row.visibility,
      tenantId: row.tenantId,
      authorUserId: row.authorUserId,
      createdAt: row.createdAt.toISOString(),
    });
    comments.set(row.roadmapItemId, list);
  }

  const history = new Map<string, RoadmapStatusHistorySummary[]>();
  for (const row of historyRows) {
    const list = history.get(row.roadmapItemId) ?? [];
    list.push({
      id: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      changedBy: row.changedBy,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    });
    history.set(row.roadmapItemId, list);
  }

  const votes = new Map<string, { count: number; userVoted: boolean }>();
  for (const row of voteRows) {
    const current = votes.get(row.roadmapItemId) ?? { count: 0, userVoted: false };
    votes.set(row.roadmapItemId, {
      count: current.count + 1,
      userVoted: current.userVoted || Boolean(currentUserId && row.userId === currentUserId),
    });
  }

  const tenantLinks = new Map<string, RoadmapTenantLinkSummary[]>();
  for (const row of tenantLinkRows) {
    const list = tenantLinks.get(row.roadmapItemId) ?? [];
    list.push({
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      tenantSlug: row.tenantSlug,
      relationType: row.relationType,
    });
    tenantLinks.set(row.roadmapItemId, list);
  }

  const releases = new Map<string, RoadmapReleaseOption[]>();
  for (const row of releaseLinkRows) {
    const list = releases.get(row.roadmapItemId) ?? [];
    list.push({
      id: row.releaseId,
      version: row.version,
      title: row.title,
      status: row.status,
    });
    releases.set(row.roadmapItemId, list);
  }

  return { audiences, modules, comments, history, votes, tenantLinks, releases };
}

async function listAllRoadmapItems(includeArchived: boolean, currentUserId: string | null, includeInternalComments: boolean): Promise<RoadmapItemSummary[]> {
  const rows = await db
    .select({
      id: roadmapItemsTable.id,
      tenantId: roadmapItemsTable.tenantId,
      tenantName: tenantsTable.name,
      tenantSlug: tenantsTable.slug,
      scope: roadmapItemsTable.scope,
      title: roadmapItemsTable.title,
      slug: roadmapItemsTable.slug,
      description: roadmapItemsTable.description,
      status: roadmapItemsTable.status,
      priority: roadmapItemsTable.priority,
      submittedBy: roadmapItemsTable.submittedBy,
      plannedVersion: roadmapItemsTable.plannedVersion,
      expectedDelivery: roadmapItemsTable.expectedDelivery,
      publicVisible: roadmapItemsTable.publicVisible,
      featured: roadmapItemsTable.featured,
      internalNote: roadmapItemsTable.internalNote,
      convertedFromItemId: roadmapItemsTable.convertedFromItemId,
      createdAt: roadmapItemsTable.createdAt,
      updatedAt: roadmapItemsTable.updatedAt,
      archivedAt: roadmapItemsTable.archivedAt,
    })
    .from(roadmapItemsTable)
    .leftJoin(tenantsTable, eq(roadmapItemsTable.tenantId, tenantsTable.id))
    .where(includeArchived ? undefined : isNull(roadmapItemsTable.archivedAt))
    .orderBy(asc(roadmapItemsTable.status), desc(roadmapItemsTable.featured), desc(roadmapItemsTable.updatedAt));

  const relations = await loadRoadmapRelations(rows.map((row) => row.id), currentUserId, includeInternalComments);

  return rows.map((row) => {
    const voteInfo = relations.votes.get(row.id) ?? { count: 0, userVoted: false };
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      tenantSlug: row.tenantSlug,
      scope: row.scope,
      title: row.title,
      slug: row.slug,
      description: row.description,
      status: row.status,
      priority: row.priority,
      submittedBy: row.submittedBy,
      plannedVersion: row.plannedVersion,
      expectedDelivery: iso(row.expectedDelivery),
      publicVisible: row.publicVisible,
      featured: row.featured,
      internalNote: includeInternalComments ? row.internalNote : null,
      convertedFromItemId: row.convertedFromItemId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: iso(row.archivedAt),
      audienceKeys: relations.audiences.get(row.id) ?? [],
      moduleKeys: relations.modules.get(row.id) ?? [],
      tenantLinks: relations.tenantLinks.get(row.id) ?? [],
      comments: relations.comments.get(row.id) ?? [],
      statusHistory: relations.history.get(row.id) ?? [],
      voteCount: voteInfo.count,
      hasCurrentUserVote: voteInfo.userVoted,
      linkedReleases: relations.releases.get(row.id) ?? [],
    };
  });
}

function isVisibleForTenant(item: RoadmapItemSummary, context: RoadmapTenantContext): boolean {
  if (item.status === "archived" || item.archivedAt) return false;

  const moduleVisible = item.moduleKeys.length === 0 || item.moduleKeys.some((moduleKey) => context.activeModuleKeys.includes(moduleKey));
  if (!moduleVisible) return false;

  const audienceVisible = item.audienceKeys.length === 0 || item.audienceKeys.some((audienceKey) => context.audiences.includes(audienceKey));
  if (!audienceVisible) return false;

  if (item.scope === "tenant") return item.tenantId === context.tenantId;
  if (item.publicVisible) return true;
  return item.tenantLinks.some((link) => link.tenantId === context.tenantId);
}

export async function listPlatformRoadmapBoard(): Promise<RoadmapBoardData> {
  const actor = await requirePlatformAdmin();
  const [items, options] = await Promise.all([
    listAllRoadmapItems(false, actor.userId, true),
    listRoadmapEditorOptions(true),
  ]);

  return { items, options };
}

export async function listPlatformRoadmapEditorOptions(): Promise<RoadmapEditorOptions> {
  await requirePlatformAdmin();
  return listRoadmapEditorOptions(true);
}

export async function getPlatformRoadmapItem(itemId: string): Promise<RoadmapItemSummary | null> {
  const actor = await requirePlatformAdmin();
  const items = await listAllRoadmapItems(true, actor.userId, true);
  return items.find((item) => item.id === itemId) ?? null;
}

export async function listTenantRoadmapBoard(): Promise<RoadmapBoardData> {
  const context = await getTenantRoadmapContext();
  if (!context) {
    return {
      items: [],
      options: { modules: [], tenants: [], releases: [] },
    };
  }

  const [items, options] = await Promise.all([
    listAllRoadmapItems(false, context.userId, false),
    listRoadmapEditorOptions(false),
  ]);

  return {
    items: items.filter((item) => isVisibleForTenant(item, context)),
    options,
  };
}

export async function listTenantRoadmapEditorOptions(): Promise<RoadmapEditorOptions> {
  const context = await getTenantRoadmapContext();
  if (!context) return { modules: [], tenants: [], releases: [] };
  const options = await listRoadmapEditorOptions(false);
  return {
    ...options,
    modules: options.modules.filter((module) => context.activeModuleKeys.includes(module.key)),
  };
}

export async function getTenantRoadmapItem(itemId: string): Promise<RoadmapItemSummary | null> {
  const context = await getTenantRoadmapContext();
  if (!context) return null;

  const items = await listAllRoadmapItems(false, context.userId, false);
  const item = items.find((entry) => entry.id === itemId) ?? null;
  return item && isVisibleForTenant(item, context) ? item : null;
}

export async function savePlatformRoadmapItemFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const scope = normalizeScope(String(formData.get("scope") ?? ""));
  const tenantId = scope === "tenant" ? String(formData.get("tenantId") ?? "").trim() || null : null;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = normalizeStatus(String(formData.get("status") ?? ""));
  const priority = normalizePriority(String(formData.get("priority") ?? ""));
  const slug = slugify(String(formData.get("slug") ?? "").trim() || title);
  const plannedVersion = String(formData.get("plannedVersion") ?? "").trim() || null;
  const expectedDeliveryValue = String(formData.get("expectedDelivery") ?? "").trim();
  const internalNote = String(formData.get("internalNote") ?? "").trim() || null;
  const publicVisible = formData.get("publicVisible") === "on";
  const featured = formData.get("featured") === "on";
  const audienceKeys = normalizeAudienceKeys(formData.getAll("audienceKeys").map(String));
  const moduleKeys = uniqueStrings(formData.getAll("moduleKeys").map(String));
  const releaseIds = uniqueStrings(formData.getAll("releaseIds").map(String));

  if (!title) throw new Error("Titel is verplicht.");
  if (!description) throw new Error("Omschrijving is verplicht.");
  if (!slug) throw new Error("Slug is verplicht.");
  if (scope === "tenant" && !tenantId) throw new Error("Tenant is verplicht voor tenantwensen.");

  const eventInfo = await db.transaction(async (tx) => {
    const [existing] = id
      ? await tx.select().from(roadmapItemsTable).where(eq(roadmapItemsTable.id, id)).limit(1)
      : [];

    const now = new Date();
    const expectedDelivery = expectedDeliveryValue ? new Date(expectedDeliveryValue) : null;
    const values = {
      tenantId,
      scope,
      title,
      slug,
      description,
      status,
      priority,
      plannedVersion,
      expectedDelivery,
      publicVisible,
      featured,
      internalNote,
      updatedBy: actor.userId,
      updatedAt: now,
      archivedAt: status === "archived" ? existing?.archivedAt ?? now : null,
    };

    const [saved] = existing
      ? await tx.update(roadmapItemsTable).set(values).where(eq(roadmapItemsTable.id, existing.id)).returning()
      : await tx
        .insert(roadmapItemsTable)
        .values({
          ...values,
          submittedBy: actor.userId,
          createdBy: actor.userId,
          createdAt: now,
        })
        .returning();

    if (!saved) throw new Error("Roadmapitem kon niet worden opgeslagen.");

    if (!existing || existing.status !== status) {
      await tx.insert(roadmapItemStatusHistoryTable).values({
        roadmapItemId: saved.id,
        fromStatus: existing?.status ?? null,
        toStatus: status,
        changedBy: actor.userId,
        note: String(formData.get("statusNote") ?? "").trim() || null,
      });
    }

    await tx.delete(roadmapItemAudiencesTable).where(eq(roadmapItemAudiencesTable.roadmapItemId, saved.id));
    await tx.delete(roadmapItemModulesTable).where(eq(roadmapItemModulesTable.roadmapItemId, saved.id));
    await tx.delete(releaseRoadmapLinksTable).where(eq(releaseRoadmapLinksTable.roadmapItemId, saved.id));

    if (audienceKeys.length > 0) {
      await tx.insert(roadmapItemAudiencesTable).values(audienceKeys.map((audienceKey) => ({
        roadmapItemId: saved.id,
        audienceKey,
      })));
    }

    if (moduleKeys.length > 0) {
      await tx.insert(roadmapItemModulesTable).values(moduleKeys.map((moduleKey) => ({
        roadmapItemId: saved.id,
        moduleKey,
      })));
    }

    if (releaseIds.length > 0) {
      await tx.insert(releaseRoadmapLinksTable).values(releaseIds.map((releaseId) => ({
        roadmapItemId: saved.id,
        releaseId,
      })));
    }

    if (scope === "tenant" && tenantId) {
      await tx.insert(roadmapItemTenantLinksTable).values({
        roadmapItemId: saved.id,
        tenantId,
        relationType: "requested_by",
      }).onConflictDoNothing();
    }

    await tx.insert(auditLogTable).values({
      userId: actor.userId,
      tenantId,
      action: existing ? "roadmap_item_updated" : "roadmap_item_created",
      resource: "roadmap",
      resourceId: saved.id,
      metadata: { scope, status, priority, publicVisible, featured, moduleKeys, audienceKeys, releaseIds },
    });

    return {
      id: saved.id,
      title: saved.title,
      previousStatus: existing?.status ?? null,
      status,
    };
  });

  revalidateRoadmapPaths();

  if (eventInfo.previousStatus && eventInfo.previousStatus !== eventInfo.status) {
    const scopeInfo = await roadmapNotificationScope(eventInfo.id);
    if (scopeInfo) {
      await emitFieldgridContentNotification({
        eventKey: "roadmap_status_changed",
        actorUserId: actor.userId,
        tenantIds: scopeInfo.tenantIds,
        moduleKeys: scopeInfo.moduleKeys,
        requiredModuleKeys: ["roadmap"],
        audienceKeys: scopeInfo.audienceKeys,
        requiredPermissionKeys: ["roadmap:view"],
        aggregate: { type: "roadmap", id: eventInfo.id },
        payload: {
          roadmap: {
            id: eventInfo.id,
            title: eventInfo.title,
            from_status: eventInfo.previousStatus,
            to_status: eventInfo.status,
          },
        },
        fallback: {
          title: `Roadmapstatus gewijzigd: ${eventInfo.title}`,
          body: `De status is gewijzigd van ${eventInfo.previousStatus} naar ${eventInfo.status}.`,
          category: "roadmap",
          href: `/roadmap/${eventInfo.id}`,
        },
      });

      if (eventInfo.status === "done") {
        await emitFieldgridContentNotification({
          eventKey: "roadmap_item_done",
          actorUserId: actor.userId,
          tenantIds: scopeInfo.tenantIds,
          moduleKeys: scopeInfo.moduleKeys,
          requiredModuleKeys: ["roadmap"],
          audienceKeys: scopeInfo.audienceKeys,
          requiredPermissionKeys: ["roadmap:view"],
          aggregate: { type: "roadmap", id: eventInfo.id },
          payload: {
            roadmap: {
              id: eventInfo.id,
              title: eventInfo.title,
              status: eventInfo.status,
            },
          },
          fallback: {
            title: `Roadmapitem afgerond: ${eventInfo.title}`,
            body: "Een roadmapitem dat voor uw tenant zichtbaar is, is afgerond.",
            category: "roadmap",
            priority: "high",
            href: `/roadmap/${eventInfo.id}`,
          },
        });
      }
    }
  }
}

export async function submitTenantRoadmapRequest(formData: FormData): Promise<void> {
  await requirePermission("roadmap", "submit_request");
  const context = await getTenantRoadmapContext();
  if (!context) return;

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = normalizePriority(String(formData.get("priority") ?? ""));
  const moduleKeys = uniqueStrings(formData.getAll("moduleKeys").map(String))
    .filter((moduleKey) => context.activeModuleKeys.includes(moduleKey));

  if (!title) throw new Error("Titel is verplicht.");
  if (!description) throw new Error("Omschrijving is verplicht.");

  const savedItem = await db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(roadmapItemsTable)
      .values({
        tenantId: context.tenantId,
        scope: "tenant",
        title,
        slug: slugify(title),
        description,
        status: "new",
        priority,
        submittedBy: context.userId,
        createdBy: context.userId,
        updatedBy: context.userId,
      })
      .returning();

    if (!saved) throw new Error("Featurewens kon niet worden opgeslagen.");

    await tx.insert(roadmapItemAudiencesTable).values([
      { roadmapItemId: saved.id, audienceKey: "tenant_admin" },
      { roadmapItemId: saved.id, audienceKey: "tenant_management" },
    ]);

    if (moduleKeys.length > 0) {
      await tx.insert(roadmapItemModulesTable).values(moduleKeys.map((moduleKey) => ({
        roadmapItemId: saved.id,
        moduleKey,
      })));
    }

    await tx.insert(roadmapItemTenantLinksTable).values({
      roadmapItemId: saved.id,
      tenantId: context.tenantId,
      relationType: "requested_by",
    }).onConflictDoNothing();

    await tx.insert(roadmapItemStatusHistoryTable).values({
      roadmapItemId: saved.id,
      fromStatus: null,
      toStatus: "new",
      changedBy: context.userId,
      note: "Ingediend door tenant.",
    });

    await tx.insert(auditLogTable).values({
      tenantId: context.tenantId,
      userId: context.userId,
      action: "roadmap_item_created",
      resource: "roadmap",
      resourceId: saved.id,
      metadata: { source: "tenant_backoffice", moduleKeys, priority },
    });

    return saved;
  });

  revalidateRoadmapPaths();

  await emitFieldgridContentNotification({
    eventKey: "roadmap_request_submitted",
    actorUserId: context.userId,
    tenantIds: [context.tenantId],
    moduleKeys,
    requiredModuleKeys: ["roadmap"],
    audienceKeys: ["tenant_admin", "tenant_management"],
    requiredPermissionKeys: ["roadmap:view"],
    aggregate: { type: "roadmap", id: savedItem.id },
    payload: {
      roadmap: {
        id: savedItem.id,
        title: savedItem.title,
        priority,
      },
    },
    fallback: {
      title: `Nieuwe roadmapwens: ${savedItem.title}`,
      body: "Er is een nieuwe featurewens ingediend vanuit de tenant backoffice.",
      category: "roadmap",
      href: `/roadmap/${savedItem.id}`,
    },
  });
}

export async function changePlatformRoadmapStatus(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const status = normalizeStatus(String(formData.get("status") ?? ""));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id) return;

  const eventInfo = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(roadmapItemsTable).where(eq(roadmapItemsTable.id, id)).limit(1);
    if (!existing) return null;
    if (existing.status === status) return null;

    await tx.update(roadmapItemsTable).set({
      status,
      updatedBy: actor.userId,
      updatedAt: new Date(),
      archivedAt: status === "archived" ? new Date() : null,
    }).where(eq(roadmapItemsTable.id, id));

    await tx.insert(roadmapItemStatusHistoryTable).values({
      roadmapItemId: id,
      fromStatus: existing.status,
      toStatus: status,
      changedBy: actor.userId,
      note,
    });

    await tx.insert(auditLogTable).values({
      tenantId: existing.tenantId,
      userId: actor.userId,
      action: "roadmap_status_changed",
      resource: "roadmap",
      resourceId: id,
      metadata: { fromStatus: existing.status, toStatus: status, note },
    });

    return {
      id,
      title: existing.title,
      previousStatus: existing.status,
      status,
    };
  });

  revalidateRoadmapPaths();

  if (eventInfo) {
    const scopeInfo = await roadmapNotificationScope(eventInfo.id);
    if (!scopeInfo) return;

    await emitFieldgridContentNotification({
      eventKey: "roadmap_status_changed",
      actorUserId: actor.userId,
      tenantIds: scopeInfo.tenantIds,
      moduleKeys: scopeInfo.moduleKeys,
      requiredModuleKeys: ["roadmap"],
      audienceKeys: scopeInfo.audienceKeys,
      requiredPermissionKeys: ["roadmap:view"],
      aggregate: { type: "roadmap", id: eventInfo.id },
      payload: {
        roadmap: {
          id: eventInfo.id,
          title: eventInfo.title,
          from_status: eventInfo.previousStatus,
          to_status: eventInfo.status,
          note: note ?? "",
        },
      },
      fallback: {
        title: `Roadmapstatus gewijzigd: ${eventInfo.title}`,
        body: `De status is gewijzigd van ${eventInfo.previousStatus} naar ${eventInfo.status}.`,
        category: "roadmap",
        href: `/roadmap/${eventInfo.id}`,
      },
    });

    if (eventInfo.status === "done") {
      await emitFieldgridContentNotification({
        eventKey: "roadmap_item_done",
        actorUserId: actor.userId,
        tenantIds: scopeInfo.tenantIds,
        moduleKeys: scopeInfo.moduleKeys,
        requiredModuleKeys: ["roadmap"],
        audienceKeys: scopeInfo.audienceKeys,
        requiredPermissionKeys: ["roadmap:view"],
        aggregate: { type: "roadmap", id: eventInfo.id },
        payload: {
          roadmap: {
            id: eventInfo.id,
            title: eventInfo.title,
            status: eventInfo.status,
          },
        },
        fallback: {
          title: `Roadmapitem afgerond: ${eventInfo.title}`,
          body: "Een roadmapitem dat voor uw tenant zichtbaar is, is afgerond.",
          category: "roadmap",
          priority: "high",
          href: `/roadmap/${eventInfo.id}`,
        },
      });
    }
  }
}

export async function changePlatformRoadmapPriority(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const priority = normalizePriority(String(formData.get("priority") ?? ""));
  if (!id) return;

  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(roadmapItemsTable).where(eq(roadmapItemsTable.id, id)).limit(1);
    if (!existing || existing.priority === priority) return;

    await tx.update(roadmapItemsTable).set({
      priority,
      updatedBy: actor.userId,
      updatedAt: new Date(),
    }).where(eq(roadmapItemsTable.id, id));

    await tx.insert(auditLogTable).values({
      tenantId: existing.tenantId,
      userId: actor.userId,
      action: "roadmap_priority_changed",
      resource: "roadmap",
      resourceId: id,
      metadata: { fromPriority: existing.priority, toPriority: priority },
    });
  });

  revalidateRoadmapPaths();
}

export async function linkPlatformRoadmapReleases(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const releaseIds = uniqueStrings(formData.getAll("releaseIds").map(String));
  if (!id) return;

  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(roadmapItemsTable).where(eq(roadmapItemsTable.id, id)).limit(1);
    if (!existing) return;

    await tx.delete(releaseRoadmapLinksTable).where(eq(releaseRoadmapLinksTable.roadmapItemId, id));
    if (releaseIds.length > 0) {
      await tx.insert(releaseRoadmapLinksTable).values(releaseIds.map((releaseId) => ({
        roadmapItemId: id,
        releaseId,
      })));
    }

    await tx.update(roadmapItemsTable).set({
      updatedBy: actor.userId,
      updatedAt: new Date(),
    }).where(eq(roadmapItemsTable.id, id));

    await tx.insert(auditLogTable).values({
      tenantId: existing.tenantId,
      userId: actor.userId,
      action: "roadmap_release_links_updated",
      resource: "roadmap",
      resourceId: id,
      metadata: { releaseIds },
    });
  });

  revalidateRoadmapPaths();
}

export async function addPlatformRoadmapComment(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const visibility = normalizeCommentVisibility(String(formData.get("visibility") ?? ""));
  if (!id || !body) return;

  await db.insert(roadmapItemCommentsTable).values({
    roadmapItemId: id,
    authorUserId: actor.userId,
    body,
    visibility,
  });

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "roadmap_comment_added",
    resource: "roadmap",
    resourceId: id,
    metadata: { visibility },
  });

  revalidateRoadmapPaths();

  if (visibility === "tenant_visible") {
    const scopeInfo = await roadmapNotificationScope(id);
    if (scopeInfo) {
      await emitFieldgridContentNotification({
        eventKey: "roadmap_comment_added",
        actorUserId: actor.userId,
        tenantIds: scopeInfo.tenantIds,
        moduleKeys: scopeInfo.moduleKeys,
        requiredModuleKeys: ["roadmap"],
        audienceKeys: scopeInfo.audienceKeys,
        requiredPermissionKeys: ["roadmap:view"],
        aggregate: { type: "roadmap", id },
        payload: {
          roadmap: {
            id,
            title: scopeInfo.item.title,
          },
          comment: {
            body: body.slice(0, 240),
          },
        },
        fallback: {
          title: `Nieuwe roadmapreactie: ${scopeInfo.item.title}`,
          body: body.slice(0, 500),
          category: "roadmap",
          href: `/roadmap/${id}`,
        },
      });
    }
  }
}

export async function addTenantRoadmapComment(formData: FormData): Promise<void> {
  await requirePermission("roadmap", "comment");
  const context = await getTenantRoadmapContext();
  if (!context) return;

  const id = String(formData.get("id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return;

  const item = await getTenantRoadmapItem(id);
  if (!item) return;

  await db.insert(roadmapItemCommentsTable).values({
    roadmapItemId: id,
    tenantId: context.tenantId,
    authorUserId: context.userId,
    body,
    visibility: "tenant_visible",
  });

  await db.insert(auditLogTable).values({
    tenantId: context.tenantId,
    userId: context.userId,
    action: "roadmap_comment_added",
    resource: "roadmap",
    resourceId: id,
    metadata: { source: "tenant_backoffice" },
  });

  revalidateRoadmapPaths();

  await emitFieldgridContentNotification({
    eventKey: "roadmap_comment_added",
    actorUserId: context.userId,
    tenantIds: [context.tenantId],
    moduleKeys: item.moduleKeys,
    requiredModuleKeys: ["roadmap"],
    audienceKeys: item.audienceKeys,
    requiredPermissionKeys: ["roadmap:view"],
    aggregate: { type: "roadmap", id },
    payload: {
      roadmap: {
        id,
        title: item.title,
      },
      comment: {
        body: body.slice(0, 240),
      },
    },
    fallback: {
      title: `Nieuwe roadmapreactie: ${item.title}`,
      body: body.slice(0, 500),
      category: "roadmap",
      href: `/roadmap/${id}`,
    },
  });
}

export async function toggleTenantRoadmapVote(formData: FormData): Promise<void> {
  await requirePermission("roadmap", "vote");
  const context = await getTenantRoadmapContext();
  if (!context) return;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const item = await getTenantRoadmapItem(id);
  if (!item) return;

  const [existing] = await db
    .select({ id: roadmapItemVotesTable.id })
    .from(roadmapItemVotesTable)
    .where(and(eq(roadmapItemVotesTable.roadmapItemId, id), eq(roadmapItemVotesTable.userId, context.userId)))
    .limit(1);

  if (existing) {
    await db.delete(roadmapItemVotesTable).where(eq(roadmapItemVotesTable.id, existing.id));
  } else {
    await db.insert(roadmapItemVotesTable).values({
      roadmapItemId: id,
      tenantId: context.tenantId,
      userId: context.userId,
    });
  }

  revalidateRoadmapPaths();
}

export async function archivePlatformRoadmapItem(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const eventInfo = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(roadmapItemsTable).where(eq(roadmapItemsTable.id, id)).limit(1);
    if (!existing) return null;

    const now = new Date();
    await tx.update(roadmapItemsTable).set({
      status: "archived",
      archivedAt: existing.archivedAt ?? now,
      updatedBy: actor.userId,
      updatedAt: now,
    }).where(eq(roadmapItemsTable.id, id));

    if (existing.status !== "archived") {
      await tx.insert(roadmapItemStatusHistoryTable).values({
        roadmapItemId: id,
        fromStatus: existing.status,
        toStatus: "archived",
        changedBy: actor.userId,
        note: "Gearchiveerd via snelle triage.",
      });
    }

    await tx.insert(auditLogTable).values({
      tenantId: existing.tenantId,
      userId: actor.userId,
      action: "roadmap_item_archived",
      resource: "roadmap",
      resourceId: id,
      metadata: { fromStatus: existing.status, toStatus: "archived" },
    });

    return existing.status === "archived"
      ? null
      : {
        id,
        title: existing.title,
        previousStatus: existing.status,
        status: "archived" as RoadmapStatus,
      };
  });

  revalidateRoadmapPaths();

  if (eventInfo) {
    const scopeInfo = await roadmapNotificationScope(eventInfo.id);
    if (!scopeInfo) return;

    await emitFieldgridContentNotification({
      eventKey: "roadmap_status_changed",
      actorUserId: actor.userId,
      tenantIds: scopeInfo.tenantIds,
      moduleKeys: scopeInfo.moduleKeys,
      requiredModuleKeys: ["roadmap"],
      audienceKeys: scopeInfo.audienceKeys,
      requiredPermissionKeys: ["roadmap:view"],
      aggregate: { type: "roadmap", id: eventInfo.id },
      payload: {
        roadmap: {
          id: eventInfo.id,
          title: eventInfo.title,
          from_status: eventInfo.previousStatus,
          to_status: eventInfo.status,
          note: "Gearchiveerd via snelle triage.",
        },
      },
      fallback: {
        title: `Roadmapstatus gewijzigd: ${eventInfo.title}`,
        body: `De status is gewijzigd van ${eventInfo.previousStatus} naar archived.`,
        category: "roadmap",
        href: `/roadmap/${eventInfo.id}`,
      },
    });
  }
}

export async function convertRoadmapItemToGlobal(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(roadmapItemsTable).where(eq(roadmapItemsTable.id, id)).limit(1);
    if (!existing || existing.scope === "global") return;

    if (existing.tenantId) {
      await tx.insert(roadmapItemTenantLinksTable).values({
        roadmapItemId: id,
        tenantId: existing.tenantId,
        relationType: "requested_by",
      }).onConflictDoNothing();
    }

    await tx.update(roadmapItemsTable).set({
      scope: "global",
      tenantId: null,
      publicVisible: true,
      updatedBy: actor.userId,
      updatedAt: new Date(),
    }).where(eq(roadmapItemsTable.id, id));

    await tx.insert(auditLogTable).values({
      tenantId: existing.tenantId,
      userId: actor.userId,
      action: "roadmap_item_converted_global",
      resource: "roadmap",
      resourceId: id,
      metadata: { previousTenantId: existing.tenantId },
    });
  });

  revalidateRoadmapPaths();
}

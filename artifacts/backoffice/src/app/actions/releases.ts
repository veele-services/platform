"use server";

import {
  auditLogTable,
  db,
  getActiveReleaseHighlightsForContext,
  getReleaseBySlugForContext,
  listEnabledKnowledgebaseModuleKeysForTenant,
  listReleasesForContext,
  modulesTable,
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
  type ReleaseSummary,
  type ReleaseHighlightSummary,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { getCurrentEffectiveUserPermissions } from "@/lib/auth/permissions";
import { getCurrentBackofficeUser, requireCurrentTenantId } from "@/lib/auth/tenant";

export type ReleaseCategoryOption = {
  id: string;
  name: string;
  slug: string;
  moduleKey: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type ReleaseModuleOption = {
  key: string;
  name: string;
  description: string | null;
};

export type ReleaseRoadmapOption = {
  id: string;
  title: string;
  status: string;
};

export type ReleaseEditorOptions = {
  categories: ReleaseCategoryOption[];
  modules: ReleaseModuleOption[];
  roadmapItems: ReleaseRoadmapOption[];
};

export type ReleaseItemInput = {
  id?: string | null;
  title: string;
  description: string;
  categoryId?: string | null;
  moduleKey?: string | null;
  impactLevel: ReleaseImpactLevel;
  sortOrder: number;
};

export type SaveReleaseInput = {
  id?: string | null;
  version: string;
  title: string;
  slug?: string | null;
  summary?: string | null;
  contentHtml?: string | null;
  contentText?: string | null;
  status: ReleaseStatus;
  impactLevel: ReleaseImpactLevel;
  featured: boolean;
  audienceKeys: FieldgridContentAudience[];
  moduleKeys: string[];
  roadmapItemIds: string[];
  items: ReleaseItemInput[];
};

const AUDIENCE_OPTIONS: Array<{ key: FieldgridContentAudience; label: string }> = [
  { key: "platform_admin", label: "Platform admin" },
  { key: "support", label: "Support" },
  { key: "tenant_admin", label: "Tenant admin" },
  { key: "tenant_management", label: "Management" },
  { key: "tenant_planning", label: "Planning" },
  { key: "tenant_administration", label: "Administratie" },
  { key: "tenant_personnel", label: "Personeel" },
  { key: "tenant_customer", label: "Klanten" },
];

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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeStatus(value: string): ReleaseStatus {
  if (value === "published" || value === "archived") return value;
  return "draft";
}

function normalizeImpact(value: string): ReleaseImpactLevel {
  if (value === "low" || value === "high" || value === "critical") return value;
  return "medium";
}

function normalizeAudienceKeys(values: string[]): FieldgridContentAudience[] {
  const allowed = new Set(AUDIENCE_OPTIONS.map((option) => option.key));
  return uniqueStrings(values).filter((value): value is FieldgridContentAudience => allowed.has(value as FieldgridContentAudience));
}

function normalizeSurface(value: string): ReleaseHighlightSurface {
  if (value === "platform_backoffice" || value === "personnel_pwa" || value === "customer_pwa") return value;
  return "tenant_backoffice";
}

function revalidateReleasePaths(): void {
  revalidatePath("/platform/releases");
  revalidatePath("/releases");
  revalidatePath("/klant/releases");
  revalidatePath("/personeel/releases");
}

function releaseTextFromHtml(html: string | null | undefined): string | null {
  const text = (html ?? "")
    .replace(/<\/(p|h1|h2|h3|h4|li|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

async function tenantReleaseContext() {
  const tenantId = await requireCurrentTenantId();
  const user = await getCurrentBackofficeUser();
  if (!user) return null;

  const permissionSet = await getCurrentEffectiveUserPermissions();
  if (!permissionSet.has("releases:view")) return null;

  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(tenantId);
  if (!activeModuleKeys.includes("releases")) return null;

  return {
    tenantId,
    surface: "tenant_backoffice" as const,
    audiences: ["tenant_admin", "tenant_management", "tenant_planning", "tenant_administration"] as FieldgridContentAudience[],
    activeModuleKeys,
    userId: user.id,
  };
}

export async function listReleaseEditorOptions(): Promise<ReleaseEditorOptions> {
  await requirePlatformAdmin();
  const [categories, modules, roadmapItems] = await Promise.all([
    db
      .select({
        id: releaseCategoriesTable.id,
        name: releaseCategoriesTable.name,
        slug: releaseCategoriesTable.slug,
        moduleKey: releaseCategoriesTable.moduleKey,
        sortOrder: releaseCategoriesTable.sortOrder,
        isActive: releaseCategoriesTable.isActive,
      })
      .from(releaseCategoriesTable)
      .orderBy(asc(releaseCategoriesTable.sortOrder), asc(releaseCategoriesTable.name)),
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
        id: roadmapItemsTable.id,
        title: roadmapItemsTable.title,
        status: roadmapItemsTable.status,
      })
      .from(roadmapItemsTable)
      .orderBy(desc(roadmapItemsTable.updatedAt)),
  ]);

  return { categories, modules, roadmapItems };
}

export async function listPlatformReleases(): Promise<ReleaseSummary[]> {
  await requirePlatformAdmin();
  return listReleasesForContext(
    {
      surface: "platform_backoffice",
      audiences: ["platform_admin", "support"],
      activeModuleKeys: [],
      isPlatformAdmin: true,
    },
    { includeUnpublished: true, includeArchived: true },
  );
}

export async function getPlatformRelease(slug: string): Promise<ReleaseSummary | null> {
  await requirePlatformAdmin();
  return getReleaseBySlugForContext(
    {
      surface: "platform_backoffice",
      audiences: ["platform_admin", "support"],
      activeModuleKeys: [],
      isPlatformAdmin: true,
    },
    slug,
    { includeUnpublished: true, includeArchived: true },
  );
}

export async function listTenantReleases(): Promise<ReleaseSummary[]> {
  const context = await tenantReleaseContext();
  if (!context) return [];
  return listReleasesForContext(context);
}

export async function getTenantRelease(slug: string): Promise<ReleaseSummary | null> {
  const context = await tenantReleaseContext();
  if (!context) return null;
  return getReleaseBySlugForContext(context, slug);
}

export async function getTenantReleaseHighlight(): Promise<ReleaseHighlightSummary | null> {
  const context = await tenantReleaseContext();
  if (!context) return null;
  const highlights = await getActiveReleaseHighlightsForContext(context);
  return highlights[0] ?? null;
}

export async function getPlatformReleaseHighlight(): Promise<ReleaseHighlightSummary | null> {
  const actor = await requirePlatformAdmin();
  const highlights = await getActiveReleaseHighlightsForContext({
    surface: "platform_backoffice",
    audiences: ["platform_admin"],
    activeModuleKeys: [],
    userId: actor.userId,
    isPlatformAdmin: true,
  });
  return highlights[0] ?? null;
}

export async function saveRelease(input: SaveReleaseInput): Promise<{ id: string; slug: string }> {
  const actor = await requirePlatformAdmin();
  const title = input.title.trim();
  const version = input.version.trim();
  const slug = slugify(input.slug?.trim() || `${version}-${title}`);
  const status = normalizeStatus(input.status);
  const now = new Date();

  if (!title) throw new Error("Titel is verplicht.");
  if (!version) throw new Error("Versie is verplicht.");
  if (!slug) throw new Error("Slug is verplicht.");

  const release = await db.transaction(async (tx) => {
    const [existing] = input.id
      ? await tx.select().from(releasesTable).where(eq(releasesTable.id, input.id)).limit(1)
      : [];

    const values = {
      version,
      title,
      slug,
      summary: input.summary?.trim() || null,
      contentHtml: input.contentHtml?.trim() || null,
      contentText: input.contentText?.trim() || releaseTextFromHtml(input.contentHtml),
      status,
      impactLevel: normalizeImpact(input.impactLevel),
      featured: input.featured,
      publishedAt: status === "published" ? existing?.publishedAt ?? now : null,
      archivedAt: status === "archived" ? existing?.archivedAt ?? now : null,
      updatedBy: actor.userId,
      updatedAt: now,
    };

    const [saved] = existing
      ? await tx.update(releasesTable).set(values).where(eq(releasesTable.id, existing.id)).returning()
      : await tx.insert(releasesTable).values({ ...values, createdBy: actor.userId, createdAt: now }).returning();

    if (!saved) throw new Error("Release kon niet worden opgeslagen.");

    await tx.delete(releaseAudiencesTable).where(eq(releaseAudiencesTable.releaseId, saved.id));
    await tx.delete(releaseModulesTable).where(eq(releaseModulesTable.releaseId, saved.id));
    await tx.delete(releaseItemsTable).where(eq(releaseItemsTable.releaseId, saved.id));
    await tx.delete(releaseRoadmapLinksTable).where(eq(releaseRoadmapLinksTable.releaseId, saved.id));

    const audienceKeys = normalizeAudienceKeys(input.audienceKeys);
    const moduleKeys = uniqueStrings(input.moduleKeys);
    const roadmapItemIds = uniqueStrings(input.roadmapItemIds);

    if (audienceKeys.length > 0) {
      await tx.insert(releaseAudiencesTable).values(audienceKeys.map((audienceKey) => ({
        releaseId: saved.id,
        audienceKey,
      })));
    }

    if (moduleKeys.length > 0) {
      await tx.insert(releaseModulesTable).values(moduleKeys.map((moduleKey) => ({
        releaseId: saved.id,
        moduleKey,
      })));
    }

    const items = input.items
      .map((item, index) => ({
        releaseId: saved.id,
        title: item.title.trim(),
        description: item.description.trim(),
        categoryId: item.categoryId || null,
        moduleKey: item.moduleKey || null,
        impactLevel: normalizeImpact(item.impactLevel),
        sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : index + 1,
      }))
      .filter((item) => item.title && item.description);

    if (items.length > 0) await tx.insert(releaseItemsTable).values(items);

    if (roadmapItemIds.length > 0) {
      await tx.insert(releaseRoadmapLinksTable).values(roadmapItemIds.map((roadmapItemId) => ({
        releaseId: saved.id,
        roadmapItemId,
      })));
    }

    await tx.insert(auditLogTable).values({
      userId: actor.userId,
      action: existing ? "release_updated" : "release_created",
      resource: "releases",
      resourceId: saved.id,
      metadata: { status, impactLevel: values.impactLevel, audienceKeys, moduleKeys, roadmapItemIds },
    });

    return saved;
  });

  revalidateReleasePaths();
  return { id: release.id, slug: release.slug };
}

export async function saveReleaseFromForm(formData: FormData): Promise<void> {
  const itemTitles = formData.getAll("itemTitle").map(String);
  const itemDescriptions = formData.getAll("itemDescription").map(String);
  const itemCategoryIds = formData.getAll("itemCategoryId").map(String);
  const itemModuleKeys = formData.getAll("itemModuleKey").map(String);
  const itemImpacts = formData.getAll("itemImpactLevel").map(String);

  await saveRelease({
    id: String(formData.get("id") ?? "").trim() || null,
    version: String(formData.get("version") ?? ""),
    title: String(formData.get("title") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    contentHtml: String(formData.get("contentHtml") ?? ""),
    contentText: null,
    status: normalizeStatus(String(formData.get("status") ?? "")),
    impactLevel: normalizeImpact(String(formData.get("impactLevel") ?? "")),
    featured: formData.get("featured") === "on",
    audienceKeys: normalizeAudienceKeys(formData.getAll("audienceKeys").map(String)),
    moduleKeys: uniqueStrings(formData.getAll("moduleKeys").map(String)),
    roadmapItemIds: uniqueStrings(formData.getAll("roadmapItemIds").map(String)),
    items: itemTitles.map((title, index) => ({
      title,
      description: itemDescriptions[index] ?? "",
      categoryId: itemCategoryIds[index] || null,
      moduleKey: itemModuleKeys[index] || null,
      impactLevel: normalizeImpact(itemImpacts[index] ?? ""),
      sortOrder: index + 1,
    })),
  });
}

export async function saveReleaseCategoryFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const slug = slugify(String(formData.get("slug") ?? "").trim() || name);
  const moduleKey = String(formData.get("moduleKey") ?? "").trim() || null;
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  const isActive = formData.get("isActive") === "on";
  if (!name || !slug) throw new Error("Naam en slug zijn verplicht.");

  const values = { name, slug, moduleKey, sortOrder, isActive, updatedAt: new Date() };
  const [saved] = id
    ? await db.update(releaseCategoriesTable).set(values).where(eq(releaseCategoriesTable.id, id)).returning({ id: releaseCategoriesTable.id })
    : await db.insert(releaseCategoriesTable).values(values).returning({ id: releaseCategoriesTable.id });

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: id ? "release_category_updated" : "release_category_created",
    resource: "releases",
    resourceId: saved?.id ?? id,
    metadata: { name, slug, moduleKey },
  });

  revalidateReleasePaths();
}

export async function saveReleaseHighlightFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const releaseId = String(formData.get("releaseId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const surface = normalizeSurface(String(formData.get("surface") ?? ""));
  const audienceKey = normalizeAudienceKeys([String(formData.get("audienceKey") ?? "")])[0] ?? "tenant_admin";
  const moduleKey = String(formData.get("moduleKey") ?? "").trim() || null;
  const priority = Number(formData.get("priority") ?? 0);
  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const endsAt = String(formData.get("endsAt") ?? "").trim();
  if (!releaseId || !title || !message) throw new Error("Release, titel en bericht zijn verplicht.");

  const [saved] = await db.insert(releaseHighlightsTable).values({
    releaseId,
    title,
    message,
    surface,
    audienceKey,
    moduleKey,
    priority: Number.isFinite(priority) ? priority : 0,
    startsAt: startsAt ? new Date(startsAt) : null,
    endsAt: endsAt ? new Date(endsAt) : null,
    isActive: true,
    createdBy: actor.userId,
  }).returning({ id: releaseHighlightsTable.id });

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "release_highlight_created",
    resource: "releases",
    resourceId: releaseId,
    metadata: { highlightId: saved?.id, surface, audienceKey, moduleKey, priority },
  });

  revalidateReleasePaths();
}

export async function archiveRelease(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await db.update(releasesTable).set({
    status: "archived",
    archivedAt: new Date(),
    updatedBy: actor.userId,
    updatedAt: new Date(),
  }).where(eq(releasesTable.id, id));
  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "release_archived",
    resource: "releases",
    resourceId: id,
    metadata: {},
  });
  revalidateReleasePaths();
}

export async function dismissTenantReleaseHighlight(formData: FormData): Promise<void> {
  const context = await tenantReleaseContext();
  if (!context?.userId) return;
  const highlightId = String(formData.get("highlightId") ?? "").trim();
  if (!highlightId) return;

  await db.insert(releaseDismissalsTable).values({
    highlightId,
    tenantId: context.tenantId,
    userId: context.userId,
  }).onConflictDoNothing();

  await db.insert(auditLogTable).values({
    tenantId: context.tenantId,
    userId: context.userId,
    action: "release_highlight_dismissed",
    resource: "releases",
    resourceId: highlightId,
    metadata: { surface: "tenant_backoffice" },
  });

  revalidateReleasePaths();
}

export async function dismissPlatformReleaseHighlight(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const highlightId = String(formData.get("highlightId") ?? "").trim();
  if (!highlightId) return;

  const visibleHighlight = (await getActiveReleaseHighlightsForContext({
    surface: "platform_backoffice",
    audiences: ["platform_admin"],
    activeModuleKeys: [],
    userId: actor.userId,
    isPlatformAdmin: true,
  })).find((highlight) => highlight.id === highlightId);
  if (!visibleHighlight) return;

  await db.insert(releaseDismissalsTable).values({
    highlightId,
    userId: actor.userId,
  }).onConflictDoNothing();

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "release_highlight_dismissed",
    resource: "releases",
    resourceId: highlightId,
    metadata: { surface: "platform_backoffice" },
  });

  revalidatePath("/platform");
  revalidatePath("/platform/releases");
}

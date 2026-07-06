"use server";

import { randomUUID } from "node:crypto";
import {
  db,
  auditLogTable,
  kbArticleAudiencesTable,
  kbArticleMediaTable,
  kbArticleModulesTable,
  kbArticlePermissionsTable,
  kbArticleRelatedTable,
  kbArticleVersionsTable,
  kbArticlesTable,
  kbCategoriesTable,
  kbSearchTermsTable,
  kbTooltipAudiencesTable,
  kbTooltipRelatedArticlesTable,
  kbTooltipsTable,
  listKnowledgebaseArticlesForContext,
  modulesTable,
  permissionsTable,
  type FieldgridContentAudience,
  type FieldgridContentStatus,
  type KnowledgebaseArticleSummary,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { createAdminClient } from "@/lib/supabase/admin";

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

function sanitizeHtmlFragment(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|h1|h2|h3|h4|li|blockquote|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
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
  const contentHtml = sanitizeHtmlFragment(input.contentHtml);
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

export async function saveKnowledgebaseArticle(input: SaveKnowledgebaseArticleInput): Promise<ActionResult<{ id: string; slug: string }>> {
  try {
    const actor = await requirePlatformAdmin();
    const normalized = normalizeInput(input);
    const now = new Date();

    const article = await db.transaction(async (tx) => {
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

      return saved;
    });

    revalidateKnowledgebasePaths();
    return { success: true, data: { id: article.id, slug: article.slug } };
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

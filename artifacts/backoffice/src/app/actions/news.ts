"use server";

import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  auditLogTable,
  customerTypesTable,
  customersTable,
  newsPostsTable,
  newsPostTargetsTable,
  personnelTable,
  sectorsTable,
  type NewsPostStatus,
  type NewsTargetType,
} from "@workspace/db";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import type { ActionResult } from "./customers";

export type { ActionResult };

export type NewsAudienceSelection = {
  allPersonnel:    boolean;
  allCustomers:    boolean;
  sectorIds:       string[];
  personnelIds:    string[];
  customerIds:     string[];
  customerTypeIds: string[];
};

export type NewsAudienceOption = {
  id:       string;
  label:    string;
  subtitle: string | null;
};

export type NewsAudienceOptions = {
  sectors:       NewsAudienceOption[];
  personnel:     NewsAudienceOption[];
  customers:     NewsAudienceOption[];
  customerTypes: NewsAudienceOption[];
};

export type NewsPostListRow = {
  id:             string;
  slug:           string;
  title:          string;
  excerpt:        string | null;
  heroImageUrl:   string | null;
  status:         NewsPostStatus;
  publishAt:      string | null;
  publishedAt:    string | null;
  updatedAt:      string;
  createdAt:      string;
  audienceSummary:string;
  targetCount:    number;
};

export type NewsPostDetail = NewsPostListRow & {
  contentHtml: string;
  contentJson: Record<string, unknown> | null;
  heroImagePath: string | null;
  audience: NewsAudienceSelection;
};

export type SaveNewsPostInput = {
  id?:            string | null;
  title:          string;
  slug?:          string | null;
  excerpt?:       string | null;
  contentHtml:    string;
  contentJson?:   Record<string, unknown> | null;
  heroImageUrl?:  string | null;
  heroImagePath?: string | null;
  status:         NewsPostStatus;
  publishAt?:     string | null;
  audience:       NewsAudienceSelection;
};

const HERO_BUCKET = "news-hero";
const MAX_HERO_BYTES = 5 * 1024 * 1024;
const HERO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function uniqueIds(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
}

function slugifyNewsTitle(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);

  return slug || `nieuws-${Date.now()}`;
}

function sanitizeHtmlFragment(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .trim();
}

function cleanAudience(input: NewsAudienceSelection): NewsAudienceSelection {
  return {
    allPersonnel:    Boolean(input.allPersonnel),
    allCustomers:    Boolean(input.allCustomers),
    sectorIds:       uniqueIds(input.sectorIds),
    personnelIds:    uniqueIds(input.personnelIds),
    customerIds:     uniqueIds(input.customerIds),
    customerTypeIds: uniqueIds(input.customerTypeIds),
  };
}

function buildTargetRows(audience: NewsAudienceSelection): Array<{
  targetType: NewsTargetType;
  targetId: string | null;
}> {
  const rows: Array<{ targetType: NewsTargetType; targetId: string | null }> = [];

  if (audience.allPersonnel) rows.push({ targetType: "all_personnel", targetId: null });
  if (audience.allCustomers) rows.push({ targetType: "all_customers", targetId: null });
  rows.push(...audience.sectorIds.map((id) => ({ targetType: "sector" as const, targetId: id })));
  rows.push(...audience.personnelIds.map((id) => ({ targetType: "personnel" as const, targetId: id })));
  rows.push(...audience.customerIds.map((id) => ({ targetType: "customer" as const, targetId: id })));
  rows.push(...audience.customerTypeIds.map((id) => ({ targetType: "customer_type" as const, targetId: id })));

  return rows;
}

function audienceFromTargets(
  targets: Array<{ targetType: NewsTargetType | string; targetId: string | null }>,
): NewsAudienceSelection {
  return {
    allPersonnel:    targets.some((target) => target.targetType === "all_personnel"),
    allCustomers:    targets.some((target) => target.targetType === "all_customers"),
    sectorIds:       targets.filter((target) => target.targetType === "sector" && target.targetId).map((target) => target.targetId!),
    personnelIds:    targets.filter((target) => target.targetType === "personnel" && target.targetId).map((target) => target.targetId!),
    customerIds:     targets.filter((target) => target.targetType === "customer" && target.targetId).map((target) => target.targetId!),
    customerTypeIds: targets.filter((target) => target.targetType === "customer_type" && target.targetId).map((target) => target.targetId!),
  };
}

function summarizeAudience(audience: NewsAudienceSelection): string {
  const parts: string[] = [];
  if (audience.allPersonnel) parts.push("Alle medewerkers");
  if (audience.allCustomers) parts.push("Alle klanten");
  if (audience.sectorIds.length) parts.push(`${audience.sectorIds.length} sector${audience.sectorIds.length === 1 ? "" : "en"}`);
  if (audience.personnelIds.length) parts.push(`${audience.personnelIds.length} medewerker${audience.personnelIds.length === 1 ? "" : "s"}`);
  if (audience.customerIds.length) parts.push(`${audience.customerIds.length} klant${audience.customerIds.length === 1 ? "" : "en"}`);
  if (audience.customerTypeIds.length) parts.push(`${audience.customerTypeIds.length} klanttype${audience.customerTypeIds.length === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "Geen doelgroep";
}

function normalizeStatus(value: string): NewsPostStatus {
  if (["draft", "scheduled", "published", "archived"].includes(value)) {
    return value as NewsPostStatus;
  }
  return "draft";
}

function parsePublishAt(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function loadTargets(postIds: string[]): Promise<Map<string, Array<{ targetType: NewsTargetType; targetId: string | null }>>> {
  if (postIds.length === 0) return new Map();

  const targets = await db
    .select({
      postId:     newsPostTargetsTable.postId,
      targetType: newsPostTargetsTable.targetType,
      targetId:   newsPostTargetsTable.targetId,
    })
    .from(newsPostTargetsTable)
    .where(inArray(newsPostTargetsTable.postId, postIds));

  const map = new Map<string, Array<{ targetType: NewsTargetType; targetId: string | null }>>();
  for (const target of targets) {
    const list = map.get(target.postId) ?? [];
    list.push({ targetType: target.targetType, targetId: target.targetId ?? null });
    map.set(target.postId, list);
  }
  return map;
}

export async function listNewsPosts(): Promise<NewsPostListRow[]> {
  const canRead = await hasPermission("news", "read");
  if (!canRead) return [];

  const posts = await db
    .select({
      id:            newsPostsTable.id,
      slug:          newsPostsTable.slug,
      title:         newsPostsTable.title,
      excerpt:       newsPostsTable.excerpt,
      heroImageUrl:  newsPostsTable.heroImageUrl,
      status:        newsPostsTable.status,
      publishAt:     newsPostsTable.publishAt,
      publishedAt:   newsPostsTable.publishedAt,
      updatedAt:     newsPostsTable.updatedAt,
      createdAt:     newsPostsTable.createdAt,
    })
    .from(newsPostsTable)
    .orderBy(desc(newsPostsTable.updatedAt), desc(newsPostsTable.createdAt));

  const targetMap = await loadTargets(posts.map((post) => post.id));

  return posts.map((post) => {
    const targets = targetMap.get(post.id) ?? [];
    const audience = audienceFromTargets(targets);
    return {
      id:              post.id,
      slug:            post.slug,
      title:           post.title,
      excerpt:         post.excerpt ?? null,
      heroImageUrl:    post.heroImageUrl ?? null,
      status:          post.status,
      publishAt:       iso(post.publishAt ?? null),
      publishedAt:     iso(post.publishedAt ?? null),
      updatedAt:       post.updatedAt.toISOString(),
      createdAt:       post.createdAt.toISOString(),
      audienceSummary: summarizeAudience(audience),
      targetCount:     targets.length,
    };
  });
}

export async function getNewsPost(id: string): Promise<NewsPostDetail | null> {
  await requirePermission("news", "read");

  const [post] = await db
    .select()
    .from(newsPostsTable)
    .where(eq(newsPostsTable.id, id))
    .limit(1);

  if (!post) return null;

  const targetMap = await loadTargets([id]);
  const targets = targetMap.get(id) ?? [];
  const audience = audienceFromTargets(targets);

  return {
    id:              post.id,
    slug:            post.slug,
    title:           post.title,
    excerpt:         post.excerpt ?? null,
    contentHtml:     post.contentHtml,
    contentJson:     post.contentJson ?? null,
    heroImageUrl:    post.heroImageUrl ?? null,
    heroImagePath:   post.heroImagePath ?? null,
    status:          post.status,
    publishAt:       iso(post.publishAt ?? null),
    publishedAt:     iso(post.publishedAt ?? null),
    updatedAt:       post.updatedAt.toISOString(),
    createdAt:       post.createdAt.toISOString(),
    audience,
    audienceSummary: summarizeAudience(audience),
    targetCount:     targets.length,
  };
}

export async function getNewsAudienceOptions(): Promise<NewsAudienceOptions> {
  await requirePermission("news", "read");

  const [sectors, personnel, customers, customerTypes] = await Promise.all([
    db
      .select({
        id: sectorsTable.id,
        name: sectorsTable.name,
        description: sectorsTable.description,
      })
      .from(sectorsTable)
      .where(eq(sectorsTable.isActive, true))
      .orderBy(asc(sectorsTable.name)),

    db
      .select({
        id: personnelTable.id,
        firstName: personnelTable.firstName,
        lastName: personnelTable.lastName,
        email: personnelTable.email,
        region: personnelTable.region,
      })
      .from(personnelTable)
      .where(eq(personnelTable.isActive, true))
      .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName)),

    db
      .select({
        id: customersTable.id,
        name: customersTable.name,
        contactEmail: customersTable.contactEmail,
        city: customersTable.city,
      })
      .from(customersTable)
      .where(eq(customersTable.isActive, true))
      .orderBy(asc(customersTable.name)),

    db
      .select({
        id: customerTypesTable.id,
        name: customerTypesTable.name,
      })
      .from(customerTypesTable)
      .where(eq(customerTypesTable.isActive, true))
      .orderBy(asc(customerTypesTable.name)),
  ]);

  return {
    sectors: sectors.map((sector) => ({
      id: sector.id,
      label: sector.name,
      subtitle: sector.description ?? null,
    })),
    personnel: personnel.map((person) => ({
      id: person.id,
      label: `${person.firstName} ${person.lastName}`.trim(),
      subtitle: [person.region, person.email].filter(Boolean).join(" - ") || null,
    })),
    customers: customers.map((customer) => ({
      id: customer.id,
      label: customer.name,
      subtitle: [customer.city, customer.contactEmail].filter(Boolean).join(" - ") || null,
    })),
    customerTypes: customerTypes.map((type) => ({
      id: type.id,
      label: type.name,
      subtitle: null,
    })),
  };
}

export async function saveNewsPost(input: SaveNewsPostInput): Promise<ActionResult<{ id: string }>> {
  try {
    const status = normalizeStatus(input.status);
    const wantsPublish = status === "published" || status === "scheduled";
    await requirePermission("news", status === "archived" ? "delete" : wantsPublish ? "send" : "write");

    const userId = await currentUserId();
    if (!userId) return { success: false, message: "Niet geauthenticeerd." };

    const title = input.title.trim();
    if (!title) return { success: false, message: "Titel is verplicht." };
    if (title.length > 180) return { success: false, message: "Titel mag maximaal 180 tekens zijn." };

    const contentHtml = sanitizeHtmlFragment(input.contentHtml);
    if (!contentHtml || contentHtml === "<p></p>") {
      return { success: false, message: "Berichtinhoud is verplicht." };
    }

    const audience = cleanAudience(input.audience);
    const targets = buildTargetRows(audience);
    if (status !== "draft" && status !== "archived" && targets.length === 0) {
      return { success: false, message: "Kies minimaal een doelgroep voordat u publiceert." };
    }

    const requestedSlug = input.slug?.trim() || title;
    const slug = slugifyNewsTitle(requestedSlug);
    const publishAt = status === "scheduled" || status === "published"
      ? parsePublishAt(input.publishAt) ?? new Date()
      : parsePublishAt(input.publishAt);
    const now = new Date();

    const existing = input.id
      ? await db
          .select({
            id: newsPostsTable.id,
            publishedAt: newsPostsTable.publishedAt,
          })
          .from(newsPostsTable)
          .where(eq(newsPostsTable.id, input.id))
          .limit(1)
      : [];

    if (input.id && existing.length === 0) {
      return { success: false, message: "Nieuwsbericht niet gevonden." };
    }

    const duplicateSlug = await db
      .select({ id: newsPostsTable.id })
      .from(newsPostsTable)
      .where(eq(newsPostsTable.slug, slug))
      .limit(1);

    if (duplicateSlug[0] && duplicateSlug[0].id !== input.id) {
      return { success: false, message: "Deze slug is al in gebruik." };
    }

    const publishedAt = status === "published"
      ? (existing[0]?.publishedAt ?? now)
      : null;

    let savedId = input.id ?? "";

    await db.transaction(async (tx) => {
      if (input.id) {
        await tx
          .update(newsPostsTable)
          .set({
            slug,
            title,
            excerpt:       input.excerpt?.trim() || null,
            contentHtml,
            contentJson:    input.contentJson ?? null,
            heroImageUrl:  input.heroImageUrl?.trim() || null,
            heroImagePath: input.heroImagePath?.trim() || null,
            status,
            publishAt,
            publishedAt,
            updatedBy: userId,
            updatedAt: now,
          })
          .where(eq(newsPostsTable.id, input.id));

        await tx
          .delete(newsPostTargetsTable)
          .where(eq(newsPostTargetsTable.postId, input.id));
      } else {
        const [inserted] = await tx
          .insert(newsPostsTable)
          .values({
            slug,
            title,
            excerpt:       input.excerpt?.trim() || null,
            contentHtml,
            contentJson:    input.contentJson ?? null,
            heroImageUrl:  input.heroImageUrl?.trim() || null,
            heroImagePath: input.heroImagePath?.trim() || null,
            status,
            publishAt,
            publishedAt,
            createdBy: userId,
            updatedBy: userId,
          })
          .returning({ id: newsPostsTable.id });
        savedId = inserted.id;
      }

      if (targets.length > 0) {
        await tx.insert(newsPostTargetsTable).values(
          targets.map((target) => ({
            postId: savedId,
            targetType: target.targetType,
            targetId: target.targetId,
          })),
        );
      }

      await tx.insert(auditLogTable).values({
        userId,
        action: input.id ? "update" : "create",
        resource: "news",
        resourceId: savedId,
        metadata: {
          status,
          title,
          targetCount: targets.length,
          published: status === "published",
        } as Record<string, unknown>,
      });
    });

    revalidatePath("/news");
    return { success: true, data: { id: savedId } };
  } catch (err) {
    return {
      success: false,
      message: (err as Error).message ?? "Nieuwsbericht opslaan mislukt.",
    };
  }
}

export async function archiveNewsPost(id: string): Promise<ActionResult> {
  try {
    await requirePermission("news", "delete");

    const userId = await currentUserId();
    if (!userId) return { success: false, message: "Niet geauthenticeerd." };

    await db
      .update(newsPostsTable)
      .set({
        status: "archived",
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(newsPostsTable.id, id));

    await db.insert(auditLogTable).values({
      userId,
      action: "archive",
      resource: "news",
      resourceId: id,
      metadata: {},
    });

    revalidatePath("/news");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      message: (err as Error).message ?? "Nieuwsbericht archiveren mislukt.",
    };
  }
}

export async function uploadNewsHeroImage(formData: FormData): Promise<ActionResult<{ url: string; path: string }>> {
  try {
    await requirePermission("news", "write");

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return { success: false, message: "Geen afbeelding geselecteerd." };
    if (file.size > MAX_HERO_BYTES) return { success: false, message: "Afbeelding mag maximaal 5 MB zijn." };
    if (!HERO_MIME_TYPES.has(file.type)) {
      return { success: false, message: "Gebruik JPG, PNG, WebP of GIF als hero image." };
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
    const date = new Date();
    const path = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
    const bytes = await file.arrayBuffer();

    const supabase = createAdminClient();
    const { error } = await supabase.storage
      .from(HERO_BUCKET)
      .upload(path, bytes, {
        contentType: file.type,
        upsert: false,
      });

    if (error) return { success: false, message: `Upload mislukt: ${error.message}` };

    const { data: { publicUrl } } = supabase.storage
      .from(HERO_BUCKET)
      .getPublicUrl(path);

    return { success: true, data: { url: publicUrl, path } };
  } catch (err) {
    return {
      success: false,
      message: (err as Error).message ?? "Hero image upload mislukt.",
    };
  }
}

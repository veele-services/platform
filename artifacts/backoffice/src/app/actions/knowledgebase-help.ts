"use server";

import {
  db,
  getKnowledgebaseArticleByIdForContext,
  getKnowledgebaseArticleBySlugForContext,
  getKnowledgebaseMediaByIdForContext,
  kbArticleFeedbackTable,
  kbArticlesTable,
  listEnabledKnowledgebaseModuleKeysForTenant,
  listKnowledgebaseHelpIndexForContext,
  recordKnowledgebaseSearchEvent,
  TENANT_RUNTIME_ACTIVE_STATUSES,
  tenantsTable,
  type KnowledgebaseArticleSummary,
  type KnowledgebaseMediaAccess,
  type KnowledgebaseHelpIndex,
} from "@workspace/db";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentEffectiveUserPermissions, getEffectiveUserPermissions } from "@/lib/auth/permissions";
import { requireCurrentTenantId, userHasActiveTenant } from "@/lib/auth/tenant";
import {
  knowledgebaseSupportPath,
  knowledgebaseSupportUrl,
  normalizeKnowledgebaseTenantCode,
} from "@/lib/knowledgebase-support-links";
import { createClient } from "@/lib/supabase/server";

type KnowledgebaseResolvedTenant = {
  id: string;
  slug: string;
  name: string;
};

type ShortcodeKnowledgebaseBaseResult = {
  tenantCode: string;
  slug: string;
  nextPath: string;
};

export type ShortcodeKnowledgebaseArticleResult =
  | (ShortcodeKnowledgebaseBaseResult & { status: "login_required" })
  | (ShortcodeKnowledgebaseBaseResult & { status: "tenant_not_found" })
  | (ShortcodeKnowledgebaseBaseResult & { status: "module_inactive"; tenant: KnowledgebaseResolvedTenant })
  | (ShortcodeKnowledgebaseBaseResult & { status: "access_denied"; tenant: KnowledgebaseResolvedTenant })
  | (ShortcodeKnowledgebaseBaseResult & { status: "article_not_found"; tenant: KnowledgebaseResolvedTenant })
  | (ShortcodeKnowledgebaseBaseResult & {
    status: "ok";
    tenant: KnowledgebaseResolvedTenant;
    article: KnowledgebaseArticleSummary;
    supportUrl: string;
  });

type ShortcodeKnowledgebaseContextResult =
  | (ShortcodeKnowledgebaseBaseResult & { status: "login_required" })
  | (ShortcodeKnowledgebaseBaseResult & { status: "tenant_not_found" })
  | (ShortcodeKnowledgebaseBaseResult & { status: "module_inactive"; tenant: KnowledgebaseResolvedTenant })
  | (ShortcodeKnowledgebaseBaseResult & { status: "access_denied"; tenant: KnowledgebaseResolvedTenant })
  | (ShortcodeKnowledgebaseBaseResult & {
    status: "ok";
    tenant: KnowledgebaseResolvedTenant;
    context: {
      tenantId: string;
      surface: "tenant_backoffice";
      audiences: [];
      activeModuleKeys: string[];
      permissionKeys: string[];
    };
  });

async function tenantKnowledgebaseContext() {
  const tenantId = await requireCurrentTenantId();
  const permissionSet = await getCurrentEffectiveUserPermissions();
  if (!permissionSet.has("kb:view")) return null;

  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(tenantId);
  if (!activeModuleKeys.includes("knowledgebase")) return null;

  return {
    tenantId,
    surface: "tenant_backoffice" as const,
    audiences: [],
    activeModuleKeys,
    permissionKeys: [...permissionSet],
  };
}

async function resolveTenantByKnowledgebaseCode(tenantCode: string): Promise<KnowledgebaseResolvedTenant | null> {
  const normalizedTenantCode = normalizeKnowledgebaseTenantCode(tenantCode);
  if (!normalizedTenantCode) return null;

  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      name: tenantsTable.name,
    })
    .from(tenantsTable)
    .where(
      and(
        eq(tenantsTable.slug, normalizedTenantCode),
        eq(tenantsTable.isActive, true),
        inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
      ),
    )
    .limit(1);

  return tenant ?? null;
}

async function publishedArticleExistsForTenant(tenantId: string, slug: string): Promise<boolean> {
  const [article] = await db
    .select({ id: kbArticlesTable.id })
    .from(kbArticlesTable)
    .where(
      and(
        eq(kbArticlesTable.slug, slug),
        eq(kbArticlesTable.status, "published"),
        isNull(kbArticlesTable.archivedAt),
        or(
          eq(kbArticlesTable.scope, "platform_global"),
          and(eq(kbArticlesTable.scope, "tenant"), eq(kbArticlesTable.tenantId, tenantId)),
        ),
      ),
    )
    .limit(1);

  return Boolean(article);
}

async function shortcodeKnowledgebaseContext(
  tenantCode: string,
  slug: string,
): Promise<ShortcodeKnowledgebaseContextResult> {
  const normalizedTenantCode = normalizeKnowledgebaseTenantCode(tenantCode);
  const normalizedSlug = slug.trim();
  const nextPath = knowledgebaseSupportPath(normalizedTenantCode, normalizedSlug);
  const base = { tenantCode: normalizedTenantCode, slug: normalizedSlug, nextPath };

  const tenant = await resolveTenantByKnowledgebaseCode(normalizedTenantCode);
  if (!tenant) return { ...base, status: "tenant_not_found" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ...base, status: "login_required" };

  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(tenant.id);
  if (!activeModuleKeys.includes("knowledgebase")) {
    return { ...base, status: "module_inactive", tenant };
  }

  if (!await userHasActiveTenant(user.id, tenant.id)) {
    return { ...base, status: "access_denied", tenant };
  }

  const permissionSet = await getEffectiveUserPermissions(user.id, tenant.id);
  if (!permissionSet.has("kb:view")) {
    return { ...base, status: "access_denied", tenant };
  }

  return {
    ...base,
    status: "ok",
    tenant,
    context: {
      tenantId: tenant.id,
      surface: "tenant_backoffice",
      audiences: [],
      activeModuleKeys,
      permissionKeys: [...permissionSet],
    },
  };
}

export async function getTenantKnowledgebaseHelpIndex(query?: string | null): Promise<KnowledgebaseHelpIndex> {
  const context = await tenantKnowledgebaseContext();
  if (!context) return { articles: [], categories: [], featured: [], recent: [], suggestions: [] };

  const index = await listKnowledgebaseHelpIndexForContext(context, { query });
  if (query?.trim()) {
    try {
      await recordKnowledgebaseSearchEvent({
        tenantId: context.tenantId,
        audienceKey: "tenant_admin",
        query,
        resultCount: index.articles.length,
        metadata: { surface: "tenant_backoffice" },
      });
    } catch (error) {
      console.error("[kb] search event failed", error);
    }
  }
  return index;
}

export async function getTenantKnowledgebaseArticle(slug: string): Promise<KnowledgebaseArticleSummary | null> {
  const context = await tenantKnowledgebaseContext();
  if (!context) return null;
  return getKnowledgebaseArticleBySlugForContext(context, slug);
}

export async function getTenantKnowledgebaseSupportLink(slug: string): Promise<string | null> {
  const tenantId = await requireCurrentTenantId();
  const [tenant] = await db
    .select({ slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) return null;
  return knowledgebaseSupportUrl(tenant.slug, slug);
}

export async function getShortcodeKnowledgebaseArticle(
  tenantCode: string,
  slug: string,
): Promise<ShortcodeKnowledgebaseArticleResult> {
  const contextResult = await shortcodeKnowledgebaseContext(tenantCode, slug);
  if (contextResult.status !== "ok") return contextResult;

  const article = await getKnowledgebaseArticleBySlugForContext(contextResult.context, contextResult.slug);
  if (!article) {
    const exists = await publishedArticleExistsForTenant(contextResult.tenant.id, contextResult.slug);
    return {
      tenantCode: contextResult.tenantCode,
      slug: contextResult.slug,
      nextPath: contextResult.nextPath,
      status: exists ? "access_denied" : "article_not_found",
      tenant: contextResult.tenant,
    };
  }

  return {
    tenantCode: contextResult.tenantCode,
    slug: contextResult.slug,
    nextPath: contextResult.nextPath,
    status: "ok",
    tenant: contextResult.tenant,
    article,
    supportUrl: knowledgebaseSupportUrl(contextResult.tenant.slug, article.slug),
  };
}

export async function getShortcodeKnowledgebaseMedia(
  tenantCode: string,
  slug: string,
  mediaId: string,
): Promise<
  | { status: "ok"; media: KnowledgebaseMediaAccess }
  | { status: Exclude<ShortcodeKnowledgebaseArticleResult["status"], "ok"> }
> {
  const contextResult = await shortcodeKnowledgebaseContext(tenantCode, slug);
  if (contextResult.status !== "ok") return { status: contextResult.status };

  const article = await getKnowledgebaseArticleBySlugForContext(contextResult.context, contextResult.slug);
  if (!article) {
    const exists = await publishedArticleExistsForTenant(contextResult.tenant.id, contextResult.slug);
    return { status: exists ? "access_denied" : "article_not_found" };
  }

  const media = await getKnowledgebaseMediaByIdForContext(contextResult.context, mediaId);
  if (!media || media.articleSlug !== article.slug) return { status: "article_not_found" };

  return { status: "ok", media };
}

export async function submitTenantKnowledgebaseFeedback(formData: FormData): Promise<void> {
  const context = await tenantKnowledgebaseContext();
  if (!context) return;

  const articleId = String(formData.get("articleId") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const isHelpful = String(formData.get("isHelpful") ?? "") === "true";
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 1000) || null;
  if (!articleId) return;

  const article = await getKnowledgebaseArticleByIdForContext(context, articleId);
  if (!article) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await db.insert(kbArticleFeedbackTable).values({
    articleId,
    tenantId: context.tenantId,
    userId: user?.id ?? null,
    audienceKey: "tenant_admin",
    isHelpful,
    comment,
    metadata: { surface: "tenant_backoffice", slug: article.slug },
  });

  revalidatePath(slug ? `/help/${slug}` : `/help/${article.slug}`);
}

"use server";

import {
  db,
  getKnowledgebaseArticleByIdForContext,
  getKnowledgebaseArticleBySlugForContext,
  kbArticleFeedbackTable,
  listEnabledKnowledgebaseModuleKeysForTenant,
  listKnowledgebaseHelpIndexForContext,
  recordKnowledgebaseSearchEvent,
  type KnowledgebaseArticleSummary,
  type KnowledgebaseHelpIndex,
} from "@workspace/db";
import { revalidatePath } from "next/cache";
import { getCurrentEffectiveUserPermissions } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";

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

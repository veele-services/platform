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
import { createClient } from "@/lib/supabase/server";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";
import { getMyPersonnel } from "@/actions/personnel";

async function personnelKnowledgebaseContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const tenantId = await requireCurrentPersonnelPortalTenantId();
  if (!tenantId) return null;

  const personnel = await getMyPersonnel();
  if (!personnel) return null;

  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(tenantId);
  if (!activeModuleKeys.includes("knowledgebase")) return null;

  return {
    tenantId,
    surface: "personnel_pwa" as const,
    audiences: ["tenant_personnel" as const],
    activeModuleKeys,
    permissionKeys: [],
  };
}

export async function getPersonnelKnowledgebaseHelpIndex(query?: string | null): Promise<KnowledgebaseHelpIndex> {
  const context = await personnelKnowledgebaseContext();
  if (!context) return { articles: [], categories: [], featured: [], recent: [], suggestions: [] };

  const index = await listKnowledgebaseHelpIndexForContext(context, { query });
  if (query?.trim()) {
    try {
      await recordKnowledgebaseSearchEvent({
        tenantId: context.tenantId,
        audienceKey: "tenant_personnel",
        query,
        resultCount: index.articles.length,
        metadata: { surface: "personnel_pwa" },
      });
    } catch (error) {
      console.error("[kb] personnel search event failed", error);
    }
  }

  return index;
}

export async function getPersonnelKnowledgebaseArticle(slug: string): Promise<KnowledgebaseArticleSummary | null> {
  const context = await personnelKnowledgebaseContext();
  if (!context) return null;
  return getKnowledgebaseArticleBySlugForContext(context, slug);
}

export async function submitPersonnelKnowledgebaseFeedback(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const personnel = await getMyPersonnel();
  const context = await personnelKnowledgebaseContext();
  if (!user || !personnel || !context) return;

  const articleId = String(formData.get("articleId") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const isHelpful = String(formData.get("isHelpful") ?? "") === "true";
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 1000) || null;
  if (!articleId) return;

  const article = await getKnowledgebaseArticleByIdForContext(context, articleId);
  if (!article) return;

  await db.insert(kbArticleFeedbackTable).values({
    articleId,
    tenantId: context.tenantId,
    userId: user.id,
    personnelId: personnel.id,
    audienceKey: "tenant_personnel",
    isHelpful,
    comment,
    metadata: { surface: "personnel_pwa", slug: article.slug },
  });

  revalidatePath(slug ? `/help/${slug}` : `/help/${article.slug}`);
}

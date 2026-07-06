"use server";

import {
  getKnowledgebaseArticleBySlugForContext,
  listEnabledKnowledgebaseModuleKeysForTenant,
  listKnowledgebaseHelpIndexForContext,
  recordKnowledgebaseSearchEvent,
  type KnowledgebaseArticleSummary,
  type KnowledgebaseHelpIndex,
} from "@workspace/db";
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
  if (!context) return { articles: [], categories: [], featured: [], recent: [] };

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

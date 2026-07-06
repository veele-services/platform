"use server";

import {
  getKnowledgebaseArticleBySlugForContext,
  listEnabledKnowledgebaseModuleKeysForTenant,
  listKnowledgebaseHelpIndexForContext,
  recordKnowledgebaseSearchEvent,
  type KnowledgebaseArticleSummary,
  type KnowledgebaseHelpIndex,
} from "@workspace/db";
import { getCurrentEffectiveUserPermissions } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";

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
  if (!context) return { articles: [], categories: [], featured: [], recent: [] };

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

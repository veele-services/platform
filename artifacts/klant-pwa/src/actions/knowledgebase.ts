"use server";

import {
  getKnowledgebaseArticleBySlugForContext,
  listEnabledKnowledgebaseModuleKeysForTenant,
  listKnowledgebaseHelpIndexForContext,
  recordKnowledgebaseSearchEvent,
  type KnowledgebaseArticleSummary,
  type KnowledgebaseHelpIndex,
} from "@workspace/db";
import { getMyCustomerIdentity } from "@/actions/customer";

async function customerKnowledgebaseContext() {
  const identity = await getMyCustomerIdentity();
  if (!identity) return null;

  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(identity.tenantId);
  if (!activeModuleKeys.includes("knowledgebase")) return null;

  return {
    tenantId: identity.tenantId,
    surface: "customer_pwa" as const,
    audiences: ["tenant_customer" as const],
    activeModuleKeys,
    permissionKeys: [],
  };
}

export async function getCustomerKnowledgebaseHelpIndex(query?: string | null): Promise<KnowledgebaseHelpIndex> {
  const context = await customerKnowledgebaseContext();
  if (!context) return { articles: [], categories: [], featured: [], recent: [] };

  const index = await listKnowledgebaseHelpIndexForContext(context, { query });
  if (query?.trim()) {
    try {
      await recordKnowledgebaseSearchEvent({
        tenantId: context.tenantId,
        audienceKey: "tenant_customer",
        query,
        resultCount: index.articles.length,
        metadata: { surface: "customer_pwa" },
      });
    } catch (error) {
      console.error("[kb] customer search event failed", error);
    }
  }

  return index;
}

export async function getCustomerKnowledgebaseArticle(slug: string): Promise<KnowledgebaseArticleSummary | null> {
  const context = await customerKnowledgebaseContext();
  if (!context) return null;
  return getKnowledgebaseArticleBySlugForContext(context, slug);
}

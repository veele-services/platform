"use server";

import {
  db,
  getKnowledgebaseArticleByIdForContext,
  getKnowledgebaseArticleBySlugForContext,
  getKnowledgebaseFeatureHelpForContext,
  kbArticleFeedbackTable,
  listEnabledKnowledgebaseModuleKeysForTenant,
  listKnowledgebaseHelpIndexForContext,
  listKnowledgebaseSearchSuggestionsForContext,
  recordKnowledgebaseSearchEvent,
  type KnowledgebaseArticleSummary,
  type KnowledgebaseFeatureHelp,
  type KnowledgebaseHelpIndex,
  type KnowledgebaseSearchSuggestion,
} from "@workspace/db";
import { revalidatePath } from "next/cache";
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
  if (!context) return { articles: [], categories: [], featured: [], recent: [], suggestions: [] };

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

export async function getCustomerKnowledgebaseSearchSuggestions(query?: string | null): Promise<KnowledgebaseSearchSuggestion[]> {
  const context = await customerKnowledgebaseContext();
  if (!context) return [];

  return listKnowledgebaseSearchSuggestionsForContext(context, query, 10);
}

export async function getCustomerKnowledgebaseArticle(slug: string): Promise<KnowledgebaseArticleSummary | null> {
  const context = await customerKnowledgebaseContext();
  if (!context) return null;
  return getKnowledgebaseArticleBySlugForContext(context, slug);
}

export async function getCustomerFeatureHelp(
  featureKey: string,
  moduleKey?: string | null,
): Promise<KnowledgebaseFeatureHelp | null> {
  const context = await customerKnowledgebaseContext();
  if (!context) return null;

  return getKnowledgebaseFeatureHelpForContext(context, featureKey, {
    moduleKey,
    audience: "tenant_customer",
    articleHrefPrefix: "/help",
  });
}

export async function submitCustomerKnowledgebaseFeedback(formData: FormData): Promise<void> {
  const identity = await getMyCustomerIdentity();
  const context = await customerKnowledgebaseContext();
  if (!identity || !context) return;

  const articleId = String(formData.get("articleId") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const isHelpful = String(formData.get("isHelpful") ?? "") === "true";
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 1000) || null;
  if (!articleId) return;

  const article = await getKnowledgebaseArticleByIdForContext(context, articleId);
  if (!article) return;

  await db.insert(kbArticleFeedbackTable).values({
    articleId,
    tenantId: identity.tenantId,
    userId: identity.userId,
    customerId: identity.customerId,
    audienceKey: "tenant_customer",
    isHelpful,
    comment,
    metadata: { surface: "customer_pwa", slug: article.slug },
  });

  revalidatePath(slug ? `/help/${slug}` : `/help/${article.slug}`);
}

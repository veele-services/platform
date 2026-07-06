import { NextResponse } from "next/server";
import { listKnowledgebaseManagementArticles } from "@/app/actions/knowledgebase";

type PlatformKnowledgebaseSuggestion = {
  type: "article" | "category" | "term";
  label: string;
  value: string;
  description?: string;
  href?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const articles = await listKnowledgebaseManagementArticles(query);
  const suggestions = new Map<string, PlatformKnowledgebaseSuggestion>();

  function add(suggestion: PlatformKnowledgebaseSuggestion) {
    const key = `${suggestion.type}:${suggestion.value.toLowerCase()}`;
    if (!suggestions.has(key)) suggestions.set(key, suggestion);
  }

  for (const article of articles) {
    add({
      type: "article",
      label: article.title,
      value: article.title,
      description: article.summary ?? undefined,
      href: `/platform/knowledgebase/articles/${article.id}`,
    });

    if (article.category?.name) {
      add({
        type: "category",
        label: article.category.name,
        value: article.category.name,
        description: "Categorie",
      });
    }

    for (const term of [...article.keywords, ...article.smartTerms, ...article.moduleKeys]) {
      add({
        type: "term",
        label: term,
        value: term,
        description: "Zoekterm",
      });
    }
  }

  return NextResponse.json({ suggestions: [...suggestions.values()].slice(0, 10) });
}

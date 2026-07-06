import { NextResponse } from "next/server";
import { getTenantKnowledgebaseSearchSuggestions } from "@/app/actions/knowledgebase-help";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const suggestions = await getTenantKnowledgebaseSearchSuggestions(query);

  return NextResponse.json({ suggestions });
}

import { NextResponse } from "next/server";
import { getPersonnelKnowledgebaseSearchSuggestions } from "@/actions/knowledgebase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const suggestions = await getPersonnelKnowledgebaseSearchSuggestions(query);

  return NextResponse.json({ suggestions });
}

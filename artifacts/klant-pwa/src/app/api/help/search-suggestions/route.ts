import { NextResponse } from "next/server";
import { getCustomerKnowledgebaseSearchSuggestions } from "@/actions/knowledgebase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const suggestions = await getCustomerKnowledgebaseSearchSuggestions(query);

  return NextResponse.json({ suggestions });
}

import { z } from "zod";
import { knowledgeArticle, knowledgeList } from "@/lib/knowledge/data";
import { knowledgeQuerySchema, knowledgeWorkspaceSchema } from "@/lib/knowledge/model";
const responseHeaders = { "cache-control": "private, no-store", "vary": "Cookie" };
export async function GET(request: Request) {
  try {
    const url = new URL(request.url), workspace = knowledgeWorkspaceSchema.parse(url.searchParams.get("workspace"));
    const value = url.searchParams.has("slug") ? await knowledgeArticle(workspace, url.searchParams.get("slug")!) : await knowledgeList(workspace, knowledgeQuerySchema.parse(Object.fromEntries([...url.searchParams].filter(([key]) => key !== "workspace"))));
    return Response.json(value, { headers: responseHeaders });
  } catch (error) {
    const code = (error as { code?: string }).code;
    return Response.json({ error: "Kennisbank niet beschikbaar." }, { status: error instanceof z.ZodError ? 400 : code === "P0002" ? 404 : code === "42501" ? 403 : 503, headers: responseHeaders });
  }
}

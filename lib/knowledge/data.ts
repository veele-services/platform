import "server-only";
import { headers } from "next/headers";
import { getAuthContext } from "@/lib/auth/context";
import { getObjectActor } from "@/lib/objects/auth";
import { createClient } from "@/lib/supabase/server";
import { TENANT_SLUG_HEADER, tenantAppUrl } from "@/lib/tenancy/hostname";
import { ticketRpc } from "@/lib/tickets/rpc";
import { getTicketActor } from "@/lib/tickets/auth";
import { ticketWorkspaceSchema } from "@/lib/tickets/model";
import { z } from "zod";
import { knowledgeArticleSchema, knowledgeListSchema, knowledgePaths, knowledgeQuerySchema, knowledgeSlug, knowledgeWorkspaceSchema, type KnowledgeWorkspace } from "./model";

export async function getKnowledgeActor(input: KnowledgeWorkspace) {
  const workspace = knowledgeWorkspaceSchema.parse(input);
  if (workspace === "customer") { const a = await getObjectActor().catch(()=>{throw Object.assign(new Error("Geen klanttoegang."),{code:"42501"});}); return { db: a.db, tenantId: a.tenant.id, userId: a.user.id, workspace }; }
  const db = await createClient(), { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw Object.assign(new Error("Geen toegang."), { code: "42501" });
  const context = await getAuthContext().catch(()=>{throw Object.assign(new Error("Geen actuele toegang."),{code:"42501"});});
  if (workspace === "platform") {
    if ((await headers()).get(TENANT_SLUG_HEADER)) throw Object.assign(new Error("Geen platformtoegang."), { code: "42501" });
    return { db, tenantId: null, userId: user.id, workspace };
  }
  if (!context.tenant) throw Object.assign(new Error("Open je eigen organisatie."), { code: "42501" });
  return { db, tenantId: context.tenant.id, userId: user.id, workspace };
}
export async function knowledgeQuery(workspace: KnowledgeWorkspace, operation: string, payload: Record<string, unknown> = {}) {
  const a = await getKnowledgeActor(workspace);
  return ticketRpc(a.db, "knowledge_query", { target_tenant: a.tenantId, actor_context: a.workspace, operation, payload });
}
export async function knowledgeList(workspace: KnowledgeWorkspace, input: unknown = {}) { return knowledgeListSchema.parse(await knowledgeQuery(workspace, "list", knowledgeQuerySchema.parse(input))); }
export async function knowledgeArticle(workspace: KnowledgeWorkspace, slug: string) { return knowledgeArticleSchema.parse(await knowledgeQuery(workspace, "article", { slug: knowledgeSlug.parse(slug) })); }
export async function knowledgeTicketSearch(input: unknown) {
  const p = z.object({ workspace: ticketWorkspaceSchema, ticketId: z.uuid(), audience: z.enum(["reporter", "tenant", "platform"]), search: z.string().trim().max(160) }).strict().parse(input);
  const a = await getTicketActor(p.workspace);
  const raw = z.object({ portal: knowledgeWorkspaceSchema, tenantSlug: z.string(), items: z.array(knowledgeArticleSchema) }).parse(await ticketRpc(a.db, "knowledge_ticket_search", { target_tenant: a.tenantId, actor_context: p.workspace, ticket_id: p.ticketId, message_audience: p.audience, search: p.search }));
  return { portal: raw.portal, items: raw.items.map(item => ({ ...item, href: raw.portal === "platform" ? `${new URL(process.env.APP_URL!).origin}${knowledgePaths.platform}/${item.slug}` : p.workspace === "platform" ? tenantAppUrl(raw.tenantSlug, `${knowledgePaths[raw.portal]}/${item.slug}`) : `${knowledgePaths[raw.portal]}/${item.slug}` })) };
}

import {z} from "zod";
import {customerContentHref} from "@/lib/customer-portal/content-href";
import { notFound, redirect } from "next/navigation";
import { knowledgeArticle, knowledgeList, getKnowledgeActor } from "@/lib/knowledge/data";
import { knowledgePaths, knowledgeSlug, type KnowledgeWorkspace } from "@/lib/knowledge/model";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import { createClient } from "@/lib/supabase/server";
import { BackofficeShell } from "../backoffice-shell";
import { StaffRouteShell } from "../staff/route-shell";
import { CustomerProductFrame } from "../product/routes";
import { KnowledgeHub } from "./hub";
export async function KnowledgePage({ workspace, slug, account:rawAccount }: { workspace: KnowledgeWorkspace; slug?: string;account?:string|string[] }) {
  const account=workspace==="customer"?z.uuid().optional().safeParse(rawAccount):{success:true as const,data:undefined};if(!account.success)notFound();
  if(slug&&!knowledgeSlug.safeParse(slug).success)notFound();
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)redirect(`/login?next=${encodeURIComponent(customerContentHref(`${knowledgePaths[workspace]}${slug?`/${slug}`:""}`,account.data))}`);
  let actor:Awaited<ReturnType<typeof getKnowledgeActor>>, initial:Awaited<ReturnType<typeof knowledgeList>>, article:Awaited<ReturnType<typeof knowledgeArticle>>|undefined;
  try { actor=await getKnowledgeActor(workspace);[initial,article]=await Promise.all([knowledgeList(workspace),slug?knowledgeArticle(workspace,slug):Promise.resolve(undefined)]); }
  catch(error){if(["42501","P0002"].includes((error as {code?:string}).code??""))notFound();throw error;}
  const content=<KnowledgeHub key={`${actor.tenantId}:${actor.userId}:${workspace}:${slug??"list"}`} actorKey={`${actor.tenantId}:${actor.userId}:${workspace}`} workspace={workspace} initial={initial} article={article}/>;
  if(workspace==="platform")return content;
  if(workspace==="staff")return <StaffRouteShell active="knowledge">{content}</StaffRouteShell>;
  if(workspace==="customer")return <CustomerProductFrame active="knowledge" account={account.data}>{content}</CustomerProductFrame>;
  const context=await getAuthContext();if(!context.tenant)notFound();
  return <BackofficeShell context={{...context,tenant:context.tenant}} data={await getPlanningShellData(context.tenant.id)} initialView="kennisbank" presentation="sites-management">{content}</BackofficeShell>;
}

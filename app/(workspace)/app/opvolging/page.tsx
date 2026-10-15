import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { ControlCenter } from "@/components/fieldgrid/management-cockpit/control-center";
import { loadFollowup } from "@/lib/management-cockpit/data";
import { followupQuerySchema } from "@/lib/management-cockpit/followup";
import { createClient } from "@/lib/supabase/server";
export default async function FollowupPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const context = await getAuthContext();
  if (!context.tenant || !context.tenant.roles.some(r => ["tenant_admin", "management", "hr", "planner", "finance"].includes(r))) notFound();
  const raw=await searchParams;
  const query=followupQuerySchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([key])=>['filter','search','page','pageSize'].includes(key))));
  if(!query.success)notFound();
  const db=await createClient();
  const [data, initial] = await Promise.all([
    getPlanningShellData(context.tenant.id),
    loadFollowup({context:{...context,tenant:context.tenant},db},query.data),
  ]);
  return <BackofficeShell context={{ ...context, tenant: context.tenant }} data={data} initialView="opvolging" presentation="sites-management"><ControlCenter key={`${context.tenant.id}:${context.user.id}`} initial={initial} tenantName={context.tenant.name}/></BackofficeShell>;
}

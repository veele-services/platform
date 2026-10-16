import { redirect,notFound } from "next/navigation";
import { headers } from "next/headers";
import { getAuthContext } from "@/lib/auth/context";
import {hasManagementPermission} from '@/lib/management/model';
import {PageHeading,Panel,Empty} from '@/components/fieldgrid/crm/ui';
import type { TenantContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import {Overview} from "@/components/fieldgrid/management-cockpit/overview";
import {overviewQuerySchema} from "@/lib/management-cockpit/overview";
import {loadOverview} from "@/lib/management-cockpit/overview-data";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { NoAccess } from "./no-access";
import { createClient } from "@/lib/supabase/server";
import { ticketRpc } from "@/lib/tickets/rpc";
import { HOST_KIND_HEADER,TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";

export default async function BackofficePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const context = await getAuthContext();
  if (!context.tenant) {
    if (context.isPlatformAdmin) redirect("/platform");
    if (!(await headers()).get(TENANT_SLUG_HEADER) && await ticketRpc(await createClient(), "platform_workspace_access", {}) === true) redirect("/platform");
    return <NoAccess email={context.user.email} />;
  }
  const host=await headers();if(host.get(HOST_KIND_HEADER)!=='tenant'||host.get(TENANT_SLUG_HEADER)!==context.tenant.slug)notFound();
  if (context.tenant.roles.length === 1 && context.tenant.roles[0] === "staff") {
    if (context.tenant.enabledServices.includes("personeel")) redirect("/staff");
    return <NoAccess email={context.user.email} />;
  }
  const parsed=overviewQuerySchema.safeParse(await searchParams);if(!parsed.success)notFound();
  const scoped={...context,tenant:context.tenant as TenantContext},db=await createClient();
  if(!hasManagementPermission(context.tenant,'backoffice.overview.read')||!hasManagementPermission(context.tenant,'backoffice.functions.cockpit_overview_query'))return <BackofficeShell context={scoped} data={await getPlanningShellData(context.tenant.id)} initialView="overzicht" presentation="sites-management"><PageHeading eyebrow="WERKRUIMTE" title="Overzicht"/><Panel><Empty title="Dit overzicht valt buiten je huidige rechten" text="Kies in de zijbalk een onderdeel waarvoor je toegang hebt."/></Panel></BackofficeShell>;
  const [data,initial]=await Promise.all([getPlanningShellData(context.tenant.id),loadOverview({context:scoped,db},parsed.data)]).catch(error=>{if(error&&typeof error==='object'&&'code'in error&&error.code==='42501')notFound();throw error});
  return <BackofficeShell context={scoped} data={data} initialView="overzicht" presentation="sites-management"><Overview key={context.tenant.id+context.user.id} initial={initial}/></BackofficeShell>;
}

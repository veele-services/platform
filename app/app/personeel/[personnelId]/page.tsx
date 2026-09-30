import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/data/workspace";
import { getDossierData } from "@/lib/personnel/dossier-data";
import { canReadDossier, dossierTabs, type DossierTab } from "@/lib/personnel/dossier";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { PersonnelDossier } from "@/components/fieldgrid/personnel-dossier";

export default async function PersonnelDossierPage({params,searchParams}:{params:Promise<{personnelId:string}>;searchParams:Promise<{tab?:string}>}) {
 const context=await getAuthContext();const {personnelId}=await params;const {tab:requested}=await searchParams;
 if(!context.tenant||!context.tenant.enabledServices.includes("personeel")||!canReadDossier(context.tenant.roles)||!/^[a-f0-9-]{36}$/i.test(personnelId))notFound();
 const db=await createClient();const {data:person}=await db.from("personnel").select("id").eq("tenant_id",context.tenant.id).eq("id",personnelId).maybeSingle();if(!person)notFound();
 const [workspace,data]=await Promise.all([getWorkspaceData(context.tenant.id),getDossierData(context.tenant.id,person.id,context.tenant.roles)]);
 const gaps=await db.rpc("personnel_qualification_gaps",{target_tenant:context.tenant.id});if(gaps.error)throw new Error("Inzetcontrole tijdelijk niet beschikbaar.");workspace.qualificationGaps=gaps.data;
 const {error}=await db.from("personnel_dossier_access").insert({tenant_id:context.tenant.id,personnel_id:person.id,actor_user_id:context.user.id,action:"view"});if(error)throw new Error("Dossiercontrole tijdelijk niet beschikbaar.");
 const tab=(dossierTabs.some(([key])=>key===requested)?requested:"overzicht") as DossierTab;
 return <BackofficeShell context={{...context,tenant:context.tenant}} data={workspace} initialView="personeel"><PersonnelDossier key={`${person.id}:${tab}`} tenant={context.tenant} personnelId={person.id} data={data} workspace={workspace} tab={tab}/></BackofficeShell>;
}

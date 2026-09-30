import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/data/workspace";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { PersonnelActions, type PersonnelActionRow } from "@/components/fieldgrid/personnel-actions";
import { canReadDossier, recordDeadline, noticeDeadline, type DossierValues, type RecordKind } from "@/lib/personnel/dossier";

export default async function PersonnelActionsPage(){
 const context=await getAuthContext();if(!context.tenant||!context.tenant.enabledServices.includes("personeel")||!canReadDossier(context.tenant.roles))notFound();
 const tenant=context.tenant;const db=await createClient();const workspace=await getWorkspaceData(tenant.id);
 const [items,contracts,certificates]=await Promise.all([
  db.from("personnel_dossier_items").select("id,personnel_id,kind,title,due_on,owner_user_id,dossier_status,dossier_revision").eq("tenant_id",tenant.id).in("kind",["task","checklist","review","asset","absence","vog"]),
  db.from("personnel_contracts").select("id,personnel_id,review_on,ends_on,dossier_data,dossier_status,dossier_revision").eq("tenant_id",tenant.id).eq("dossier_managed",true).neq("dossier_status","draft"),
  db.from("certificates").select("id,personnel_id,name,expires_on,dossier_data,dossier_status,dossier_revision").eq("tenant_id",tenant.id).eq("dossier_managed",true),
 ]);
 if(items.error||contracts.error||certificates.error)throw new Error("Actieoverzicht niet beschikbaar.");
 const employee=(id:string)=>workspace.personnel.find(p=>p.id===id)?.full_name||"Medewerker";
 const owner=(id:unknown)=>workspace.personnel.find(p=>p.user_id===id)?.full_name||(id?"Bevoegde beheerder":"");
 const rows:PersonnelActionRow[]=(items.data??[]).map(r=>({id:r.id,personnelId:r.personnel_id,name:employee(r.personnel_id),kind:r.kind as RecordKind,title:r.title,date:r.due_on,owner:owner(r.owner_user_id),status:r.dossier_status,revision:r.dossier_revision}));
 for(const r of contracts.data??[]){const values=r.dossier_data as DossierValues;const date=recordDeadline("contract",values)||r.review_on||r.ends_on;if(date)rows.push({id:r.id,personnelId:r.personnel_id,name:employee(r.personnel_id),kind:"contract",title:noticeDeadline(values)?"Aanzegging opvolgen":"Contract bespreken",date,owner:owner(values.ownerId),status:r.dossier_status,revision:r.dossier_revision});}
 for(const r of certificates.data??[])if(r.expires_on||r.dossier_status!=="approved")rows.push({id:r.id,personnelId:r.personnel_id,name:employee(r.personnel_id),kind:"certificate",title:`Kwalificatie controleren · ${r.name}`,date:r.expires_on,owner:owner((r.dossier_data as DossierValues).ownerId),status:r.dossier_status,revision:r.dossier_revision});
 rows.sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999"));
 return <BackofficeShell context={{...context,tenant}} data={workspace} initialView="personeel"><PersonnelActions rows={rows} primary={tenant.primaryColor} accent={tenant.accentColor}/></BackofficeShell>;
}

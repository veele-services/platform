import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ObjectData } from "./model";

export async function getObjectData(tenantId:string,id:string):Promise<ObjectData|null> {
 const db=await createClient();
 const {data:object,error}=await db.from("objects").select("*").eq("tenant_id",tenantId).eq("id",id).maybeSingle();
 if(error)throw new Error("Het object kon niet worden geladen.");if(!object)return null;
 const r=await Promise.all([
  db.from("customers").select("*").eq("tenant_id",tenantId).eq("id",object.customer_id).single(),
  db.from("object_nodes").select("*").eq("tenant_id",tenantId).eq("object_id",id).order("position").order("name"),
  db.from("object_records").select("*").eq("tenant_id",tenantId).eq("object_id",id).order("updated_at",{ascending:false}),
  db.from("work_orders").select("*").eq("tenant_id",tenantId).eq("object_id",id).order("projected_start_at",{ascending:false}),
  db.from("customer_contacts").select("*").eq("tenant_id",tenantId).eq("customer_id",object.customer_id),
  db.from("object_documents").select("*").eq("tenant_id",tenantId).eq("object_id",id).order("created_at",{ascending:false}),
  db.from("object_history").select("*").eq("tenant_id",tenantId).eq("object_id",id).order("created_at",{ascending:false}).limit(100),
  db.from("object_visit_requests").select("*").eq("tenant_id",tenantId).eq("object_id",id).order("created_at",{ascending:false}),
  db.from("object_request_proposals").select("*").eq("tenant_id",tenantId).eq("object_id",id).order("version",{ascending:false}),
  db.from("task_catalog").select("*").eq("tenant_id",tenantId).eq("active",true),
  db.from("task_revisions").select("*").eq("tenant_id",tenantId).is("valid_until",null),
  db.from("personnel").select("id,full_name").eq("tenant_id",tenantId),
  db.rpc("object_dossier_owners",{target_tenant:tenantId}),
  db.from("object_customer_bindings").select("*").eq("tenant_id",tenantId).eq("object_id",id),
  db.from("personnel_dossier_items").select("id,title,personnel_id").eq("tenant_id",tenantId).eq("kind","asset"),
  db.from("qualification_requirements").select("*").eq("tenant_id",tenantId).eq("scope","object").eq("subject_id",id),
  db.from("qualification_types").select("*").eq("tenant_id",tenantId).eq("active",true),
  db.from("object_reminder_recipients").select("*").eq("tenant_id",tenantId).eq("object_id",id),
  db.rpc("object_customer_accounts",{target_tenant:tenantId,target_object:id}),
 ]);
 // Planner may not read HR owners/assets; these optional catalogues stay empty.
 for(let i=0;i<r.length;i++)if(![12,14].includes(i)&&r[i].error)throw new Error("Het objectdossier kon niet volledig worden geladen.");
 const ids=r[3].data?.map(w=>w.id)??[];
 const [assignments,reports]=await Promise.all([db.from("work_order_assignments").select("*").eq("tenant_id",tenantId).in("work_order_id",ids),db.from("report_entries").select("*").eq("tenant_id",tenantId).in("work_order_id",ids).is("deleted_at",null)]);
 if(assignments.error||reports.error||!r[0].data)throw new Error("Uitvoeringsgegevens tijdelijk niet beschikbaar.");
 return {object,customer:r[0].data,nodes:r[1].data??[],records:r[2].data??[],orders:r[3].data??[],contacts:r[4].data??[],documents:r[5].data??[],history:r[6].data??[],requests:r[7].data??[],proposals:r[8].data??[],tasks:r[9].data??[],taskRevisions:r[10].data??[],personnel:r[11].data??[],owners:r[12].data??[],bindings:r[13].data??[],assets:r[14].data??[],requirements:r[15].data??[],qualificationTypes:r[16].data??[],assignments:assignments.data??[],reports:reports.data??[],reminderRecipients:r[17].data??[],customerAccounts:r[18].data??[]};
}

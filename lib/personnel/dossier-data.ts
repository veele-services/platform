import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/database.types";
import { canReadDossier, type DossierRecord, type DossierValues, type RecordKind } from "./dossier";

export const dossierTables = { contract: "personnel_contracts", certificate: "certificates", note: "personnel_notes", profile: "personnel_dossier_items", review: "personnel_dossier_items", asset: "personnel_dossier_items", absence: "personnel_dossier_items", task: "personnel_dossier_items", checklist: "personnel_dossier_items", vog: "personnel_dossier_items" } as const;
export type DossierTable = typeof dossierTables[RecordKind];
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type DossierData = {
 records: DossierRecord[]; documents: Row<"personnel_documents">[];
 history: Array<Omit<Row<"personnel_dossier_history">,"snapshot"> & { snapshot?: Json }>;
 deliveries: Row<"personnel_dossier_deliveries">[]; types: Row<"qualification_types">[]; requirements: Row<"qualification_requirements">[];
 owners: Array<{id:string;label:string}>;
 accountStatus: string | null;
};
function unpack(value: Json): DossierValues { return (value && typeof value==="object"&&!Array.isArray(value)?value:{}) as DossierValues; }
export async function getDossierData(tenantId: string, personnelId: string, roles: string[]): Promise<DossierData> {
 if(!canReadDossier(roles)) throw new Error("Geen toegang tot dit dossier.");
 const db=await createClient();
 const results=await Promise.all([
  db.from("personnel_contracts").select("*").eq("tenant_id",tenantId).eq("personnel_id",personnelId),
  db.from("certificates").select("*").eq("tenant_id",tenantId).eq("personnel_id",personnelId),
  db.from("personnel_notes").select("*").eq("tenant_id",tenantId).eq("personnel_id",personnelId),
  db.from("personnel_dossier_items").select("*").eq("tenant_id",tenantId).eq("personnel_id",personnelId),
  db.from("personnel_documents").select("*").eq("tenant_id",tenantId).eq("personnel_id",personnelId).order("created_at",{ascending:false}),
  db.from("personnel_dossier_history").select("id,tenant_id,personnel_id,source_table,source_id,revision,actor_user_id,created_at").eq("tenant_id",tenantId).eq("personnel_id",personnelId).order("created_at",{ascending:false}).limit(250),
  db.from("personnel_dossier_deliveries").select("*").eq("tenant_id",tenantId).eq("personnel_id",personnelId).order("due_on"),
  db.from("qualification_types").select("*").eq("tenant_id",tenantId).order("name"),
  db.from("qualification_requirements").select("*").eq("tenant_id",tenantId),
  db.rpc("personnel_dossier_owners",{target_tenant:tenantId}),
  db.from("personnel").select("user_id").eq("tenant_id",tenantId).eq("id",personnelId).single(),
 ]);
 for(const result of results) if(result.error) throw new Error("Het dossier kon niet volledig worden geladen. Probeer opnieuw.");
 const records:DossierRecord[]=[];
 for(const r of results[0].data??[]) records.push({id:r.id,kind:"contract",title:String(unpack(r.dossier_data).title||({fixed:"Tijdelijke overeenkomst",permanent:"Overeenkomst voor onbepaalde tijd",hire:"Inhuurovereenkomst",other:"Samenwerking"} as Record<string,string>)[r.employment_type]||"Bestaande overeenkomst"),status:r.dossier_managed?r.dossier_status:(r.active?"active":"ended"),revision:r.dossier_revision,previousId:r.previous_id,updatedAt:r.updated_at,dueOn:r.review_on,data:{...unpack(r.dossier_data),startsOn:r.starts_on,endsOn:r.ends_on||"",hours:r.hours_per_week??"",employmentType:r.employment_type,reviewOn:r.review_on||"",functionId:r.function_id||""}});
 for(const r of results[1].data??[]) records.push({id:r.id,kind:"certificate",title:r.name,status:r.dossier_managed?r.dossier_status:"unverified",revision:r.dossier_revision,previousId:r.previous_id,updatedAt:r.updated_at,dueOn:r.expires_on,data:{...unpack(r.dossier_data),code:r.code,title:r.name,issuedOn:r.issued_on||"",startsOn:r.valid_from||"",endsOn:r.expires_on||"",verifiedAt:r.verified_at||"",verifiedBy:r.verified_by||""}});
 for(const r of results[2].data??[]) records.push({id:r.id,kind:"note",title:String(unpack(r.dossier_data).title||"Bestaande notitie"),status:r.dossier_status,revision:r.dossier_revision,previousId:r.previous_id,updatedAt:r.updated_at,dueOn:null,data:{...unpack(r.dossier_data),body:r.body}});
 for(const r of results[3].data??[]) records.push({id:r.id,kind:r.kind as RecordKind,title:r.title,status:r.dossier_status,revision:r.dossier_revision,previousId:r.previous_id,updatedAt:r.updated_at,dueOn:r.due_on,data:unpack(r.dossier_data)});
 const userId=results[10].data?.user_id;
 const membership=userId?await db.from("tenant_memberships").select("status").eq("tenant_id",tenantId).eq("user_id",userId).maybeSingle():null;
 if(membership?.error)throw new Error("Accountstatus kon niet worden geladen.");
 return {records,documents:results[4].data??[],history:results[5].data??[],deliveries:results[6].data??[],types:results[7].data??[],requirements:results[8].data??[],accountStatus:membership?.data?.status??null,owners:results[9].data??[]};
}

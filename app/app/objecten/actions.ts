"use server";

import { addressFromForm } from "@/lib/addresses/form";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/actions/result";
import type { Json } from "@/lib/database.types";
import { canManageObjects, objectSchema, recordSchema, optionalId } from "@/lib/objects/model";
import { validateDossierDocumentName, customerDocumentExtension, customerDocumentFileName, CUSTOMER_DOCUMENT_MAX_BYTES } from "@/lib/customers/documents";
import { localToInstant } from "@/lib/planning/time";

async function authorize(objectId?:string) {
 const context=await getAuthContext();
 if(!context.tenant||!canManageObjects(context.tenant.roles)||!context.tenant.enabledServices.includes("planning"))throw new Error("Je hebt geen toegang tot dit objectdossier.");
 const db=await createClient();
 if(objectId){z.string().uuid().parse(objectId);const r=await db.from("objects").select("id").eq("tenant_id",context.tenant.id).eq("id",objectId).maybeSingle();if(!r.data)throw new Error("Object niet gevonden.");}
 return {context,tenant:context.tenant,db};
}
function fail():ActionResult<never>{return {ok:false,error:"Opslaan is niet gelukt. Controleer de gegevens, koppelingen en actuele versie; vernieuw zo nodig het dossier."};}
function refresh(id:string){revalidatePath("/app/objecten");revalidatePath(`/app/objecten/${id}`);revalidatePath("/app/klanten");revalidatePath("/staff");revalidatePath("/klant");}

export async function saveObject(form:FormData):Promise<ActionResult<{id:string}>>{
 try{const input=objectSchema.parse(Object.fromEntries(form));const {tenant,db}=await authorize(input.version?input.id:undefined);
 const address=await addressFromForm(form,"addressPayload",true);
 const r=await db.rpc("save_object_dossier",{target_tenant:tenant.id,input:{...input,address}});if(r.error) return fail();refresh(r.data);return {ok:true,id:r.data};}catch{return fail();}
}
export async function archiveObjectDossier(form:FormData):Promise<ActionResult>{
 try{const id=z.string().uuid().parse(form.get("id"));const version=z.coerce.number().int().positive().parse(form.get("version"));const {db,tenant}=await authorize(id);
 const r=await db.from("objects").update({dossier_status:"archived"}).eq("tenant_id",tenant.id).eq("id",id).eq("version",version).select("id").maybeSingle();if(r.error||!r.data)return fail();refresh(id);return {ok:true};}catch{return fail();}
}
export async function saveObjectNode(form:FormData):Promise<ActionResult>{
 try{
 const v=z.object({objectId:z.string().uuid(),id:z.string().uuid(),version:z.coerce.number().int().min(0),parentId:optionalId,name:z.string().trim().min(2).max(160),kind:z.enum(["building","floor","zone","room","component"]),code:z.string().max(50),position:z.coerce.number().int(),active:z.enum(["true","false"]),address:z.string().max(500),quantity:z.string().max(50),material:z.string().max(200),usage:z.string().max(500),accessibility:z.string().max(1000)}).parse(Object.fromEntries(form));
 const {db,tenant}=await authorize(v.objectId);const data={id:v.id,tenant_id:tenant.id,object_id:v.objectId,parent_id:v.parentId||null,name:v.name,kind:v.kind,code:v.code,position:v.position,active:v.active==="true",details:{address:v.address,quantity:v.quantity,material:v.material,usage:v.usage,accessibility:v.accessibility}};
 const r=v.version?await db.from("object_nodes").update(data).eq("tenant_id",tenant.id).eq("object_id",v.objectId).eq("id",v.id).eq("version",v.version).select("id").maybeSingle():await db.from("object_nodes").insert(data).select("id").single();
 if(r.error||!r.data)return fail();refresh(v.objectId);return {ok:true};}catch{return fail();}
}
export async function saveObjectRecord(form:FormData):Promise<ActionResult>{
 try{
 const input=recordSchema.parse({...Object.fromEntries(form),acknowledgement:form.get("acknowledgement")==="on"});const {db,tenant}=await authorize(input.objectId);
 const instant=(v:string)=>v?localToInstant(v,tenant.timezone):null;
 const data={agreement_line_id:input.agreementLineId||null,id:input.id,tenant_id:tenant.id,object_id:input.objectId,node_id:input.nodeId||null,work_order_id:input.workOrderId||null,kind:input.kind,title:input.title,body:input.body,state:input.state,service:input.service,instruction_type:input.instructionType||null,starts_at:instant(input.startsAt),ends_at:instant(input.endsAt),due_on:input.dueOn||null,owner_user_id:input.ownerId||null,task_revision_id:input.taskRevisionId||null,contact_id:input.contactId||null,personnel_asset_id:input.assetId||null,details:{category:input.category,frequency:input.frequency,window:input.window,checklist:input.checklist,equipment:input.equipment,evidence:input.evidence,acknowledgement:input.acknowledgement,quantity:input.quantity,unit:input.unit}};
 const r=input.version?await db.from("object_records").update(data).eq("tenant_id",tenant.id).eq("object_id",input.objectId).eq("id",input.id).eq("version",input.version).select("id").maybeSingle():await db.from("object_records").insert(data).select("id").single();
 if(r.error||!r.data)return fail();refresh(input.objectId);return {ok:true};}catch{return fail();}
}
export async function reviewObjectRequest(form:FormData):Promise<ActionResult>{
 try{
 const v=z.object({objectId:z.string().uuid(),id:z.string().uuid(),version:z.coerce.number().int().positive(),agreementLineId:optionalId.default(""),decision:z.enum(["contract_extra","regular","proposal","rejected","review","completed","partial","not_done"]),reason:z.string().trim().min(2).max(3000),response:z.string().max(3000),taskRevisionId:optionalId,quantity:z.coerce.number().positive(),price:z.coerce.number().min(0)}).parse(Object.fromEntries(form));
 const {tenant,db}=await authorize(v.objectId);const r=await db.rpc("review_object_visit_request",{target_tenant:tenant.id,target_request:v.id,expected_version:v.version,decision:v.decision,input:{agreementLineId:v.agreementLineId,reason:v.reason,response:v.response,taskRevisionId:v.taskRevisionId,quantity:v.quantity,priceCents:Math.round(v.price*100)}});if(r.error)return fail();refresh(v.objectId);return {ok:true};}catch{return fail();}
}
export async function saveCustomerObjectBinding(form:FormData):Promise<ActionResult>{
 try{const v=z.object({objectId:z.string().uuid(),email:z.string().trim().email().max(254),active:z.enum(["true","false"])}).parse(Object.fromEntries(form));const {db,tenant}=await authorize(v.objectId);
 if(!tenant.roles.some(r=>["tenant_admin","management"].includes(r)))return fail();
 const r=await db.rpc("bind_object_customer",{target_tenant:tenant.id,target_object:v.objectId,email_address:v.email,is_active:v.active==="true",allow_secrets:form.get("manageSecrets")==="on"});if(r.error)return fail();refresh(v.objectId);return {ok:true};}catch{return fail();}
}
export async function extendObjectAccess(form:FormData):Promise<ActionResult>{
 try{const v=z.object({objectId:z.string().uuid(),assignmentId:z.string().uuid(),endsAt:z.string(),reason:z.string().trim().min(5).max(1000)}).parse(Object.fromEntries(form));const {tenant,db}=await authorize(v.objectId);
 const r=await db.rpc("extend_object_access",{target_tenant:tenant.id,target_assignment:v.assignmentId,until_time:localToInstant(v.endsAt,tenant.timezone),reason:v.reason});if(r.error)return fail();refresh(v.objectId);return {ok:true};}catch{return fail();}
}
export async function saveObjectRequirement(form:FormData):Promise<ActionResult>{
 try{const v=z.object({objectId:z.string().uuid(),code:z.string().min(1).max(32)}).parse(Object.fromEntries(form));const {tenant,db}=await authorize(v.objectId);
 const r=await db.from("qualification_requirements").insert({tenant_id:tenant.id,scope:"object",subject_id:v.objectId,code:v.code,hard_requirement:form.get("hard")==="on"});if(r.error)return fail();refresh(v.objectId);return {ok:true};}catch{return fail();}
}
export async function uploadObjectDocument(form:FormData):Promise<ActionResult>{
 try{
 const v=z.object({objectId:z.string().uuid(),title:z.string().trim().min(2).max(180),category:z.enum(["instruction","floorplan","report","agreement","photo","other","security"]),nodeId:optionalId,recordId:optionalId,orderId:optionalId,previousId:optionalId,validUntil:z.string().date().or(z.literal("")),service:z.string().max(100)}).parse(Object.fromEntries(form));
 const {db,tenant,context}=await authorize(v.objectId);if(v.category==="security"&&!tenant.roles.some(r=>["tenant_admin","management"].includes(r)))return fail();
 const file=form.get("document");if(!(file instanceof File)||file.size<1||file.size>CUSTOMER_DOCUMENT_MAX_BYTES)return fail();
 validateDossierDocumentName(v.title,file.name);
 const bytes=new Uint8Array(await file.arrayBuffer());const ext=customerDocumentExtension(file.type,bytes);const path=`${tenant.id}/${v.objectId}/${randomUUID()}.${ext}`;
 let version=1;
 if(v.previousId){const r=await db.from("object_documents").select("version,category").eq("tenant_id",tenant.id).eq("object_id",v.objectId).eq("id",v.previousId).single();if(!r.data||r.data.category==="security"&&v.category!=="security")return fail();version=r.data.version+1;}
 const admin=createAdminClient();const bucket=admin.storage.from("object-documents");const upload=await bucket.upload(path,bytes,{contentType:file.type,upsert:false});if(upload.error)return fail();
 const r=await db.from("object_documents").insert({tenant_id:tenant.id,object_id:v.objectId,title:v.title,category:v.category,node_id:v.nodeId||null,record_id:v.recordId||null,work_order_id:v.orderId||null,previous_id:v.previousId||null,version,valid_until:v.validUntil||null,service:v.service,storage_path:path,mime_type:file.type,file_name:customerDocumentFileName(file.name),size_bytes:file.size,created_by:context.user.id});
 if(r.error){await bucket.remove([path]);return fail();}refresh(v.objectId);return {ok:true};}catch{return fail();}
}
export async function objectRecordVersions(objectId:string,sourceId:string):Promise<ActionResult<{versions:Json[]}>>{
 try{z.string().uuid().parse(sourceId);const {db,tenant}=await authorize(objectId);const r=await db.from("object_history").select("snapshot").eq("tenant_id",tenant.id).eq("object_id",objectId).eq("source_id",sourceId).order("version",{ascending:false});if(r.error)return fail();return {ok:true,versions:r.data.map(h=>h.snapshot)};}catch{return fail();}
}

export async function setObjectReminderRecipient(form:FormData):Promise<ActionResult>{
 try{const v=z.object({objectId:z.string().uuid(),userId:z.string().uuid(),active:z.enum(["true","false"])}).parse(Object.fromEntries(form));const {db,tenant}=await authorize(v.objectId);
 const r=await db.from("object_reminder_recipients").upsert({tenant_id:tenant.id,object_id:v.objectId,user_id:v.userId,active:v.active==="true"},{onConflict:"tenant_id,object_id,user_id"});if(r.error)return fail();refresh(v.objectId);return {ok:true};}catch{return fail();}
}

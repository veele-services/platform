"use server";
import { uploadScannedFile } from "@/lib/files/scanned-storage";
import {randomUUID} from "node:crypto";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getObjectActor} from "@/lib/objects/auth";
import type {ActionResult} from "@/lib/actions/result";
import {validateDossierDocumentName,customerDocumentExtension,customerDocumentFileName,CUSTOMER_DOCUMENT_MAX_BYTES} from "@/lib/customers/documents";

export async function getVisitSignals(orderId:string):Promise<{instructions:number;requests:number;review:number}|null>{
 try{const id=z.string().uuid().parse(orderId);const {db,tenant}=await getObjectActor();const r=await db.rpc("object_visit_signals",{target_tenant:tenant.id,target_order:id});
 if(r.error||!r.data)return null;return z.object({instructions:z.number(),requests:z.number(),review:z.number()}).parse(r.data);}catch{return null;}
}

export async function submitVisitRequest(form:FormData):Promise<ActionResult<{id:string}>>{
 try{const v=z.object({id:z.string().uuid(),objectId:z.string().uuid(),orderId:z.string().uuid(),nodeId:z.string().uuid().or(z.literal("")),title:z.string().trim().min(2).max(180),body:z.string().trim().min(2).max(10000),kind:z.enum(["attention","change","problem","extra"]),priority:z.enum(["normal","high","urgent"]),feedback:z.string().max(1000)}).parse(Object.fromEntries(form));const {db,tenant}=await getObjectActor();
 const r=await db.rpc("submit_object_visit_request",{target_tenant:tenant.id,target_object:v.objectId,target_order:v.orderId,request_id:v.id,input:v});if(r.error)return {ok:false,error:"Dit bezoek is gewijzigd of niet meer beschikbaar. Vernieuw de pagina."};revalidatePath("/klant");revalidatePath(`/staff/objecten/${v.objectId}`);revalidatePath(`/app/objecten/${v.objectId}`);return {ok:true,id:r.data};}catch{return {ok:false,error:"Je verzoek kon niet worden opgeslagen. Controleer de gegevens en je toegang."};}
}
export async function withdrawVisitRequest(form:FormData):Promise<ActionResult>{
 try{const v=z.object({requestId:z.uuid(),version:z.coerce.number().int().positive(),reason:z.string().trim().min(2).max(1000)}).parse(Object.fromEntries(form));const {db,tenant}=await getObjectActor();const r=await db.rpc("withdraw_object_request",{target_tenant:tenant.id,target_request:v.requestId,expected_version:v.version,reason:v.reason});if(r.error)throw new Error();revalidatePath("/klant");return {ok:true};}catch{return {ok:false,error:"Het verzoek is al gewijzigd of in uitvoering. Vernieuw de pagina en stem zo nodig een correctie af."};}
}
export async function acceptVisitProposal(form:FormData):Promise<ActionResult>{
 try{const id=z.string().uuid().parse(form.get("proposalId"));const {db,tenant}=await getObjectActor();const r=await db.rpc("accept_object_proposal",{target_tenant:tenant.id,target_proposal:id});if(r.error)return {ok:false,error:"Dit voorstel is gewijzigd of niet beschikbaar. Bekijk de nieuwste versie."};revalidatePath("/klant");return {ok:true};}catch{return {ok:false,error:"Akkoord kon niet worden opgeslagen."};}
}
export async function acknowledgeVisitRequest(form:FormData):Promise<ActionResult>{
 try{const id=z.string().uuid().parse(form.get("requestId"));const version=z.coerce.number().int().positive().parse(form.get("version"));const {db,tenant}=await getObjectActor();const r=await db.rpc("acknowledge_object_request",{target_tenant:tenant.id,target_request:id,expected_version:version});if(r.error)throw new Error("Gewijzigd");revalidatePath("/klant");revalidatePath("/staff");return {ok:true};}catch{return {ok:false,error:"Dit verzoek is gewijzigd of niet meer toegankelijk. Vernieuw de pagina."};}
}
export async function updateVisitRequest(form:FormData):Promise<ActionResult>{
 try{const v=z.object({id:z.string().uuid(),version:z.coerce.number().int().positive(),nodeId:z.string().uuid().or(z.literal("")),title:z.string().trim().min(2).max(180),body:z.string().trim().min(2).max(10000),kind:z.enum(["attention","change","problem","extra"]),priority:z.enum(["normal","high","urgent"]),feedback:z.string().max(1000)}).parse(Object.fromEntries(form));const {db,tenant}=await getObjectActor();const r=await db.rpc("update_object_visit_request",{target_tenant:tenant.id,target_request:v.id,expected_version:v.version,input:v});if(r.error)throw new Error("Gewijzigd");revalidatePath("/klant");revalidatePath("/staff");revalidatePath("/app/objecten");return {ok:true};}catch{return {ok:false,error:"Dit verzoek is gewijzigd, al ingepland of afgesloten. Vernieuw de pagina of maak een afzonderlijk vervolgverzoek."};}
}
export async function acknowledgeVisitInstruction(form:FormData):Promise<ActionResult>{
 try{const v=z.object({orderId:z.string().uuid(),recordId:z.string().uuid(),version:z.coerce.number().int().positive()}).parse(Object.fromEntries(form));const {db,tenant}=await getObjectActor();const r=await db.rpc("acknowledge_object_instruction",{target_tenant:tenant.id,target_order:v.orderId,target_record:v.recordId,expected_version:v.version});if(r.error)return {ok:false,error:"De instructie of toewijzing is gewijzigd. Vernieuw de pagina."};revalidatePath("/staff");return {ok:true};}catch{return {ok:false,error:"Bevestigen is niet gelukt."};}
}
export async function uploadVisitAttachment(form:FormData):Promise<ActionResult>{
 try{const v=z.object({objectId:z.string().uuid(),orderId:z.string().uuid(),requestId:z.string().uuid(),title:z.string().trim().min(2).max(180)}).parse(Object.fromEntries(form));const {db,admin,tenant}=await getObjectActor();
 const {error}=await db.rpc("object_visit_context",{target_tenant:tenant.id,target_object:v.objectId,target_order:v.orderId});if(error)throw new Error("Geen toegang");
 const file=form.get("document");if(!(file instanceof File)||file.size<1||file.size>CUSTOMER_DOCUMENT_MAX_BYTES)throw new Error("Bestand ontbreekt");validateDossierDocumentName(v.title,file.name);const bytes=new Uint8Array(await file.arrayBuffer());const ext=customerDocumentExtension(file.type,bytes);const path=`${tenant.id}/${v.objectId}/${randomUUID()}.${ext}`;
 const bucket=admin.storage.from("object-documents");await uploadScannedFile(db,"object-documents",path,bytes,file.type,v.requestId);
 const registered=await db.rpc("register_visit_attachment",{target_tenant:tenant.id,target_request:v.requestId,input:{title:v.title,path,mime:file.type,fileName:customerDocumentFileName(file.name),size:file.size}});
 if(registered.error){await bucket.remove([path]);throw new Error("Registratie mislukt");}revalidatePath("/klant");revalidatePath(`/app/objecten/${v.objectId}`);return {ok:true};
 }catch{return {ok:false,error:"Bijlage niet opgeslagen. Gebruik PDF, JPG of PNG van maximaal 10 MB en controleer of je toegang nog geldig is."};}
}

"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { publishScannedFile } from "@/lib/files/scanned-storage";
import { customerDocumentExtension,customerDocumentFileName,CUSTOMER_DOCUMENT_MAX_BYTES,validateDossierDocumentName } from "@/lib/customers/documents";
import { visitRequestCommand } from "./visit-command-model";
import { customerVisitDetailSchema } from "./visit-model";
const refresh=()=>{revalidatePath("/klant","layout");revalidatePath("/app","layout");revalidatePath("/staff","layout");};
const failure=(code?:string)=>({ok:false as const,error:code==="40001"?"Dit verzoek of deze afspraak is gewijzigd. Controleer de actuele versie; je invoer blijft bewaard.":"De wijziging kon niet worden bevestigd. Controleer je klanttoegang en of het verzoek nog open is."});
export async function saveCustomerVisitRequest(input:unknown){
 try{
  const value=visitRequestCommand.parse(input),actor=await getObjectActor();
  const result=await actor.db.rpc("customer_portal_visit_command",{target_tenant:actor.tenant.id,target_account:value.accountId,target_visit:value.visitId,request_id:value.commandId,operation:value.action.operation,input:value.action});
  if(result.error)return failure(result.error.code);refresh();return {ok:true as const};
 }catch{return failure();}
}
export async function uploadCustomerVisitAttachment(form:FormData){
 try{
  for(const key of form.keys())if(form.getAll(key).length!==1)throw new Error();
  const entries=Object.fromEntries(form),file=entries.document;delete entries.document;
  const value=z.object({accountId:z.uuid(),visitId:z.uuid(),requestId:z.uuid(),commandId:z.uuid(),version:z.coerce.number().int().positive().safe(),title:z.string().trim().min(2).max(180)}).strict().parse(entries);
  if(!(file instanceof File)||file.size<1||file.size>CUSTOMER_DOCUMENT_MAX_BYTES)throw new Error();
  validateDossierDocumentName(value.title,file.name);
  const actor=await getObjectActor();
  const authorize=async()=>{
   const result=await actor.db.rpc("customer_portal_visit",{target_tenant:actor.tenant.id,target_account:value.accountId,target_visit:value.visitId});
   if(result.error)throw new Error();const detail=customerVisitDetailSchema.parse(result.data),request=detail.requests.find(request=>request.id===value.requestId);
   if(!detail.canAddRequest||!request?.canEdit||request.version!==value.version)throw new Error();
   return detail.visit.objectId;
  };
  const objectId=await authorize(),bytes=new Uint8Array(await file.arrayBuffer()),extension=customerDocumentExtension(file.type,bytes);
  const path=`${actor.tenant.id}/${objectId}/${value.requestId}-${value.commandId}.${extension}`;
  await publishScannedFile({bucket:"object-documents",path,bytes,mime:file.type,authorize:async()=>{if(await authorize()!==objectId)throw new Error();}});
  const result=await actor.db.rpc("customer_portal_visit_command",{target_tenant:actor.tenant.id,target_account:value.accountId,target_visit:value.visitId,request_id:value.commandId,operation:"attachment",input:{requestId:value.requestId,version:value.version,title:value.title,path,mime:file.type,fileName:customerDocumentFileName(file.name),size:file.size}});
  if(result.error)return failure(result.error.code);refresh();return {ok:true as const};
 }catch{return {ok:false as const,error:"Bijlage niet opgeslagen. Gebruik een veilig PDF-, JPG- of PNG-bestand van maximaal 10 MB bij een actueel verzoek."};}
}

import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/providers/sendgrid";
import { mailSnapshotSchema,mailFailureOutcome } from "./mail-snapshot";
import { NotificationDeferredError } from "./provider-policy";
import { readMailAttachment } from "./mail-attachment";

async function call(operation:string,tenantId:string|null,id:string|null,input:Record<string,unknown>={}) {
 const db=createAdminClient();const rpc=db.rpc.bind(db) as unknown as (name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
 const r=await rpc("notification_deferred_mail",{operation,target_tenant:tenantId,target_mail_id:id,input});
 if(r.error)throw new Error("De uitgestelde verzending kon niet worden vastgelegd.");return r.data;
}
export async function deferNotificationMail(error:unknown,tenantId:string,id:string,type:string,context:"customer"|"backoffice"|"staff",actorId?:string) {
 if(!(error instanceof NotificationDeferredError))return false;
 const result=await call("defer",tenantId,id,{type,context,available_at:error.retryAt,actor_id:actorId});
 if(!z.object({ok:z.literal(true)}).safeParse(result).success)throw new Error("Het uitstel kon niet worden bevestigd.");
 return true;
}
/** Call only from a document action after its normal source authorization. */
export async function retryDeferredDocumentMail(tenantId:string,id:string) {
 return z.object({ok:z.boolean()}).parse(await call("retry",tenantId,id)).ok;
}
const delivery=z.object({id:z.uuid(),tenant_id:z.uuid(),type:z.string(),context:z.enum(["customer","backoffice","staff"]),lease_id:z.uuid(),key:z.string(),template:z.string(),snapshot:mailSnapshotSchema});
export async function processDeferredMail() {
 const jobs=z.array(delivery).parse(await call("claim",null,null));let sent=0,failed=0,deferred=0,suppressed=0;
 for(const job of jobs){let providerStarted=false;
  try{
   const snapshot=job.snapshot;let attachment:{filename:string;bytes:Uint8Array}|undefined;
   if(snapshot.attachmentPath){
    attachment=await readMailAttachment(job.tenant_id,job.id,snapshot.attachmentPath);
   }
   providerStarted=true;
   const result=await sendEmail({...snapshot,attachment,deliveryKey:job.key,disableTracking:true,policy:{kind:"notification",tenantId:job.tenant_id,type:job.type,context:job.context,sourceId:job.id}});
   const saved=await call("finish",job.tenant_id,job.id,{lease_id:job.lease_id,outcome:"sent",provider_id:result.id});
   if(!z.object({ok:z.literal(true)}).safeParse(saved).success)throw new Error("Verzending niet bevestigd");sent++;
  }catch(error){
   if(await deferNotificationMail(error,job.tenant_id,job.id,job.type,job.context)){deferred++;continue;}
   const outcome=providerStarted?mailFailureOutcome(error):"failed";
   await call("finish",job.tenant_id,job.id,{lease_id:job.lease_id,outcome});
   if(outcome==="suppressed")suppressed++;else failed++;
  }
 }
 return{claimed:jobs.length,sent,failed,deferred,suppressed};
}

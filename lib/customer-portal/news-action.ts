"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";

const inputSchema=z.object({
 accountId:z.uuid(),notificationId:z.uuid(),version:z.number().int().positive().safe(),
 operation:z.enum(["read","ack"]),commandId:z.uuid(),
}).strict();
const resultSchema=z.object({notificationId:z.uuid(),version:z.number().int().positive().safe()}).strict();
export type CustomerNewsMarkResult={ok:true;notificationId:string;version:number}|{ok:false;error:string;code?:string};

/** Durable read/ack writes use the existing central inbox command through the
 * selected live customer-account guard. No broad inbox_read_all operation. */
export async function markCustomerPortalNews(input:unknown):Promise<CustomerNewsMarkResult>{
 try{
  const value=inputSchema.parse(input),actor=await getObjectActor();
  const response=await actor.db.rpc("customer_portal_news_mark",{
   target_tenant:actor.tenant.id,target_account:value.accountId,target_notification:value.notificationId,
   expected_version:value.version,operation:value.operation,request_id:value.commandId,
  });
  if(response.error){
   const messages:Record<string,string>={
    "40001":"Dit bericht is gewijzigd. Controleer het actuele bericht en probeer opnieuw.",
    "42501":"Dit klantbericht is niet meer toegankelijk. Controleer je actuele klanttoegang.",
    "23514":"Deze leesactie is niet mogelijk voor dit bericht.",
    "23505":"Deze opdrachtsleutel hoort bij een andere leesactie.",
    "54000":"Je hebt te veel leesacties uitgevoerd. Probeer het later opnieuw.",
   };
   const error=messages[response.error.code];
   return error?{ok:false,code:response.error.code,error}:{ok:false,error:"De leesstatus kon niet worden opgeslagen. Probeer dezelfde actie opnieuw."};
  }
  const result=resultSchema.parse(response.data);
  if(result.notificationId!==value.notificationId||result.version<value.version)throw new Error("Ongeldige leesbevestiging");
  revalidatePath("/klant","layout");
  return {ok:true,...result};
 }catch{return {ok:false,error:"Opslaan kon niet worden bevestigd. Probeer dezelfde leesactie opnieuw."};}
}

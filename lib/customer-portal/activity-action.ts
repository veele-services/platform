"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";

const base={accountId:z.uuid(),commandId:z.uuid()};
const inputSchema=z.discriminatedUnion("operation",[
 z.object({...base,operation:z.literal("read"),notificationId:z.uuid(),version:z.number().int().positive().safe()}).strict(),
 z.object({...base,operation:z.literal("read_all")}).strict(),
]);
const resultSchema=z.object({updated:z.number().int().nonnegative().max(1000)}).strict();
export type CustomerActivityMarkResult={ok:true;updated:number}|{ok:false;error:string;code?:string};

/** Read-all is scoped by the database to the explicitly selected account, not
 * the tenant-wide inbox. The central inbox keeps its versions and read state. */
export async function readCustomerPortalActivity(input:unknown):Promise<CustomerActivityMarkResult>{
 try{
  const value=inputSchema.parse(input),actor=await getObjectActor();
  const response=await actor.db.rpc("customer_portal_activity_mark",{
   target_tenant:actor.tenant.id,target_account:value.accountId,operation:value.operation,request_id:value.commandId,
   ...(value.operation==="read"?{target_notification:value.notificationId,expected_version:value.version}:{}),
  });
  if(response.error){
   const messages:Record<string,string>={"40001":"Dit bericht is gewijzigd. Vernieuw je meldingen en probeer opnieuw.","42501":"Deze klantmelding is niet meer toegankelijk.","23505":"Deze opdrachtsleutel hoort bij een andere leesactie.","54000":"Er zijn te veel leesacties. Probeer het later opnieuw."};
   const error=messages[response.error.code];
   return error?{ok:false,code:response.error.code,error}:{ok:false,error:"De leesstatus kon niet worden opgeslagen. Probeer opnieuw."};
  }
  const result=resultSchema.parse(response.data);
  revalidatePath("/klant","layout");
  return {ok:true,...result};
 }catch{return {ok:false,error:"Opslaan kon niet worden bevestigd. Probeer dezelfde leesactie opnieuw."};}
}

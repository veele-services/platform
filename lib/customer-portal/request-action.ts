"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { customerServiceRequestInputSchema } from "./model";
const inputSchema=z.object({accountId:z.uuid(),request:customerServiceRequestInputSchema,commandId:z.uuid()}).strict();
const resultSchema=z.object({groupId:z.uuid(),requestIds:z.array(z.uuid()).min(1).max(25)}).strict();
/** Persistence and receipt only. This action deliberately imports no provider
 * or mail flush and performs no external delivery. */
export async function createCustomerPortalRequest(input:unknown){
 try{
  const value=inputSchema.parse(input),actor=await getObjectActor();
  const response=await actor.db.rpc("customer_portal_request_create",{target_tenant:actor.tenant.id,target_account:value.accountId,input:value.request,request_id:value.commandId});
  if(response.error)return {ok:false as const,code:response.error.code,error:response.error.code==="23514"?"Controleer de beschikbare dienst, objecten, voorkeursdatum en wensen.":response.error.code==="54000"?"Je hebt veel aanvragen verstuurd. Neem contact op met je accountmanager.":"Je aanvraag kon niet worden verstuurd. Controleer je actuele objecttoegang."};
  const result=resultSchema.parse(response.data);
  if(result.groupId!==value.commandId||result.requestIds.length!==value.request.objectIds.length||new Set(result.requestIds).size!==result.requestIds.length)throw new Error("Ongeldig ontvangstbewijs");
  revalidatePath("/klant","layout");revalidatePath("/app","layout");return {ok:true as const,...result};
 }catch{return {ok:false as const,error:"Versturen kon niet worden bevestigd. Probeer dezelfde aanvraag opnieuw; je invoer blijft staan."};}
}

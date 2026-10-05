"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getObjectActor } from "@/lib/objects/auth";
import { customerCommercialCommandSchema } from "./commercial-model";
const schema=z.object({accountId:z.uuid(),commandId:z.uuid(),action:customerCommercialCommandSchema}).strict();
export async function saveCustomerCommercial(input:unknown){
 try{
  const v=schema.parse(input),actor=await getObjectActor();
  const result=await actor.db.rpc("customer_portal_commercial_command",{target_tenant:actor.tenant.id,target_account:v.accountId,command_id:v.commandId,command:v.action.command,input:v.action.input});
  if(result.error)return {ok:false as const,error:result.error.code==="40001"?"De aanvraag of offerte is gewijzigd. Controleer de actuele versie voordat je opnieuw reageert.":result.error.code==="23514"?"Deze offerte kan niet meer worden beantwoord, of je bevestiging is onvolledig. Controleer de actuele versie.":"De actie kon niet worden opgeslagen. Controleer je actuele klanttoegang.",code:result.error.code};
  const receipt=z.object({id:z.uuid(),version:z.number().int().positive(),status:z.string()}).strict().parse(result.data);
  if(receipt.id!==v.action.input.id)throw new Error();
  revalidatePath("/klant","layout");revalidatePath("/app","layout");return {ok:true as const,...receipt};
 }catch{return {ok:false as const,error:"Je antwoord kon niet worden bevestigd. Je invoer blijft staan; probeer opnieuw."};}
}

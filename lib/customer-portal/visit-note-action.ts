"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { customerVisitNoteInputSchema } from "./visit-model";
const resultSchema=z.object({requestId:z.uuid(),version:z.number().int().positive().safe()}).strict();

export async function addCustomerPortalVisitNote(input:unknown){
 try{
  const value=customerVisitNoteInputSchema.parse(input),actor=await getObjectActor();
  const response=await actor.db.rpc("customer_portal_visit_note_add",{target_tenant:actor.tenant.id,target_account:value.accountId,target_visit:value.visitId,expected_version:value.version,input_body:value.body,request_id:value.commandId});
  if(response.error)return {ok:false as const,code:response.error.code,error:response.error.code==="40001"?"Deze afspraak is gewijzigd. Controleer de actuele afspraak voordat je de instructie deelt.":response.error.code==="23514"?"Deze afspraak is afgesloten of je instructie is niet geldig.":"Je instructie kon niet worden gedeeld. Controleer je actuele klanttoegang."};
  const result=resultSchema.parse(response.data);
  if(result.requestId!==value.commandId)throw new Error("Ongeldige opdrachtsbevestiging");
  revalidatePath("/klant","layout");revalidatePath("/app","layout");revalidatePath("/staff","layout");return {ok:true as const,...result};
 }catch{return {ok:false as const,error:"Opslaan kon niet worden bevestigd. Probeer dezelfde instructie opnieuw."};}
}

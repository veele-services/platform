"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { customerInstructionInputSchema } from "./model";
const version=z.number().int().positive().safe();
const inputSchema=z.object({accountId:z.uuid(),instruction:customerInstructionInputSchema,commandId:z.uuid()}).strict();
const resultSchema=z.object({objectVersion:version,accountVersion:version}).strict();
export async function addCustomerPortalInstruction(input:unknown){
 try{
  const value=inputSchema.parse(input),actor=await getObjectActor();
  const response=await actor.db.rpc("customer_portal_instruction_add",{target_tenant:actor.tenant.id,target_account:value.accountId,target_object:value.instruction.objectId,expected_version:value.instruction.version,input_body:value.instruction.body,request_id:value.commandId});
  if(response.error)return {ok:false as const,code:response.error.code,error:response.error.code==="40001"?"Het object is gewijzigd. Controleer je instructie en de actuele gegevens voordat je opnieuw opslaat.":"Je instructie kon niet worden toegevoegd. Controleer je toegang en invoer."};
  const result=resultSchema.parse(response.data);revalidatePath("/klant","layout");revalidatePath("/app","layout");revalidatePath("/staff","layout");return {ok:true as const,...result};
 }catch{return {ok:false as const,error:"Opslaan kon niet worden bevestigd. Probeer dezelfde instructie opnieuw."};}
}

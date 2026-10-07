"use server";

import { verifiedAddress } from "@/lib/addresses/form";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { customerOnboardingInputSchema } from "./model";

const inputSchema=z.object({accountId:z.uuid(),onboarding:customerOnboardingInputSchema,commandId:z.uuid()}).strict();
const resultSchema=z.object({accountVersion:z.number().int().positive().safe(),step:z.number().int().min(0).max(3),completed:z.boolean(),objectId:z.uuid().optional()}).strict()
 .refine(result=>result.completed?!!result.objectId:!result.objectId);
export async function saveCustomerPortalOnboarding(input:unknown){
 try{
  const value=inputSchema.parse(input),actor=await getObjectActor();
  if(value.onboarding.object?.address)value.onboarding.object.address=await verifiedAddress(value.onboarding.object.address);
  const response=await actor.db.rpc("customer_portal_onboarding_save",{target_tenant:actor.tenant.id,target_account:value.accountId,input:value.onboarding,request_id:value.commandId});
  if(response.error)return {ok:false as const,code:response.error.code,error:response.error.code==="40001"?"Je concept of de brongegevens zijn gewijzigd. Controleer je invoer en de actuele gegevens voordat je verdergaat.":response.error.code==="23514"?"Controleer alle stappen en bevestig je gegevens.":"Je introductie kon niet worden opgeslagen. Controleer je toegang."};
  const result=resultSchema.parse(response.data);revalidatePath("/klant","layout");
  if(result.completed){revalidatePath("/app","layout");revalidatePath("/staff","layout");}
  return {ok:true as const,...result};
 }catch{return {ok:false as const,error:"Opslaan kon niet worden bevestigd. Controleer je gegevens en probeer dezelfde opdracht opnieuw."};}
}

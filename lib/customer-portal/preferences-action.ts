"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { customerPreferencesSchema } from "./model";

const revision=z.number().int().nonnegative().safe();
const inputSchema=z.object({accountId:z.uuid(),version:revision,preferences:customerPreferencesSchema,commandId:z.uuid()}).strict();
const resultSchema=z.object({preferenceVersion:revision}).strict();
export async function saveCustomerPortalPreferences(input:unknown){
 try{
  const value=inputSchema.parse(input),actor=await getObjectActor();
  const response=await actor.db.rpc("customer_portal_preferences_save",{target_tenant:actor.tenant.id,target_account:value.accountId,expected_version:value.version,input:value.preferences,request_id:value.commandId});
  if(response.error)return {ok:false as const,code:response.error.code,error:response.error.code==="40001"?"Je voorkeuren zijn intussen gewijzigd. Vernieuw en controleer je keuzes.":"Je voorkeuren konden niet worden opgeslagen. Controleer je toegang."};
  const result=resultSchema.parse(response.data);revalidatePath("/klant","layout");
  return {ok:true as const,...result};
 }catch{return {ok:false as const,error:"Opslaan kon niet worden bevestigd. Probeer dezelfde voorkeuren opnieuw."};}
}

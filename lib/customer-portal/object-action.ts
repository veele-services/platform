"use server";

import { verifiedAddress } from "@/lib/addresses/form";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { customerObjectInputSchema } from "./model";

const version=z.number().int().positive().safe();
const inputSchema=z.object({accountId:z.uuid(),accountVersion:version,object:customerObjectInputSchema,commandId:z.uuid()}).strict();
const resultSchema=z.object({accountVersion:version,objectId:z.uuid()}).strict();
export async function saveCustomerPortalObject(input:unknown){
 try{
  const value=inputSchema.parse(input),actor=await getObjectActor();
  if(value.object.address)value.object.address=await verifiedAddress(value.object.address);
  const response=await actor.db.rpc("customer_portal_object_save",{target_tenant:actor.tenant.id,target_account:value.accountId,expected_account_version:value.accountVersion,input:value.object,request_id:value.commandId});
  if(response.error)return {ok:false as const,code:response.error.code,error:response.error.code==="40001"?"Het object of contact is intussen gewijzigd. Vernieuw en controleer je invoer voordat je opnieuw opslaat.":response.error.code==="23514"?"Controleer de object-, adres- en contactgegevens.":"Dit object kon niet worden opgeslagen. Controleer je toegang."};
  const result=resultSchema.parse(response.data);revalidatePath("/klant","layout");revalidatePath("/app","layout");revalidatePath("/staff","layout");
  return {ok:true as const,...result};
 }catch{return {ok:false as const,error:"Dit object kon niet worden opgeslagen. Controleer je gegevens en je toegang."};}
}

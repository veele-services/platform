"use server";

import { verifiedAddress } from "@/lib/addresses/form";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { customerProfileInputSchema } from "./model";

const version=z.number().int().positive().safe();
const inputSchema=z.object({accountId:z.uuid(),accountVersion:version,customerVersion:version,contactVersion:version,profile:customerProfileInputSchema,commandId:z.uuid()}).strict();
const resultSchema=z.object({accountVersion:version,customerVersion:version,contactVersion:version}).strict();
export async function saveCustomerPortalProfile(input:unknown){
 try{
  const value=inputSchema.parse(input),actor=await getObjectActor();
  if(value.profile.address)value.profile.address=await verifiedAddress(value.profile.address);
  // Hostname-derived tenant only; the body contains no tenant/customer owner.
  // Current session, account, contact, capability, module and CAS are checked
  // again by the authenticated RPC, including idempotent receipt replays.
  const response=await actor.db.rpc("customer_portal_profile_save",{target_tenant:actor.tenant.id,target_account:value.accountId,
   expected_account_version:value.accountVersion,expected_customer_version:value.customerVersion,expected_contact_version:value.contactVersion,input:value.profile,request_id:value.commandId});
  if(response.error)return {ok:false as const,code:response.error.code,error:response.error.code==="40001"?"Je profiel is intussen gewijzigd. Vernieuw en controleer je invoer voordat je opnieuw opslaat.":response.error.code==="23514"?"Controleer je contact- en factuurgegevens.":"Je klantprofiel kon niet worden opgeslagen. Controleer je toegang."};
  const result=resultSchema.parse(response.data);
  revalidatePath("/klant","layout");revalidatePath("/app","layout");
  return {ok:true as const,accountVersion:result.accountVersion,profileVersions:{customer:result.customerVersion,contact:result.contactVersion}};
 }catch{return {ok:false as const,error:"Je klantprofiel kon niet worden opgeslagen. Controleer je gegevens en je toegang."};}
}

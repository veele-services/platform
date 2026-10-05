"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getObjectActor } from "@/lib/objects/auth";
import { managedCustomerAccountSchema,manageCustomerAccountSchema } from "./management-model";

export async function readCustomerAccounts(customerId:string){
 try{
  const actor=await getObjectActor(),customer=z.uuid().parse(customerId);
  const response=await actor.db.rpc("customer_portal_management",{target_tenant:actor.tenant.id,target_customer:customer});
  if(response.error)throw response.error;
  return {ok:true as const,accounts:z.array(managedCustomerAccountSchema).parse(response.data)};
 }catch{return {ok:false as const,error:"De klanttoegang kon niet worden geladen. Controleer je beheerrechten."};}
}
export async function saveCustomerAccount(input:unknown){
 try{
  const value=manageCustomerAccountSchema.parse(input),actor=await getObjectActor();
  const authorize=async()=>{
   const result=await actor.db.rpc("customer_portal_management",{target_tenant:actor.tenant.id,target_customer:value.customerId});
   if(result.error)throw result.error;
   const contact=await actor.db.from("customer_contacts").select("id").eq("tenant_id",actor.tenant.id).eq("customer_id",value.customerId).eq("id",value.contactId).eq("active",true).maybeSingle();
   if(contact.error||!contact.data)throw new Error("Contact niet beschikbaar");
  };
  await authorize();
  let userId:string|undefined;
  // Supabase's admin API has no exact-email lookup. Read bounded pages only
  // on the server after explicit customer-management authorization.
  for(let page=1;page<=100;page++){
   const result=await actor.admin.auth.admin.listUsers({page,perPage:100});
   if(result.error)throw result.error;
   const found=result.data.users.find(user=>user.email?.toLowerCase()===value.email);
   if(found){userId=found.id;break;}
   if(result.data.users.length<100)break;
   if(page===100)throw new Error("Account niet veilig op te zoeken");
  }
  if(!userId){
   if(value.version!==0||!value.active)throw new Error("Account bestaat niet");
   await authorize();
   // No password, session or implicit role. Only possession of the one-use
   // email code can establish a login; the following RPC grants exact scope.
   const result=await actor.admin.auth.admin.createUser({email:value.email,email_confirm:true});
   if(result.error||!result.data.user)throw new Error("Account niet aangemaakt");
   userId=result.data.user.id;
  }
  const result=await actor.db.rpc("customer_portal_bind",{target_tenant:actor.tenant.id,target_customer:value.customerId,target_user:userId,target_contact:value.contactId,
   expected_version:value.version,can_create:value.canCreateObjects,can_edit_objects:value.canEditObjects,can_edit_profile:value.canEditProfile,enabled:value.active});
  if(result.error)return {ok:false as const,error:result.error.code==="40001"?"Deze klanttoegang is gewijzigd. Laad het overzicht opnieuw en controleer je keuze.":"Klanttoegang kon niet worden opgeslagen. Controleer het contact en je bevoegdheid."};
  revalidatePath("/app/klanten","layout");revalidatePath("/klant","layout");
  return {ok:true as const};
 }catch{return {ok:false as const,error:"Klanttoegang kon niet worden opgeslagen. Controleer het e-mailadres, het contact en je beheerrechten."};}
}

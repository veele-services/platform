"use server";
import { flushCommercialMail } from "@/lib/commercial/mail";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getObjectActor } from "@/lib/objects/auth";
import { requireBackofficePermission } from "@/lib/management/auth";
import { hasManagementPermission } from "@/lib/management/model";
import type { Json } from "@/lib/database.types";
import type { ActionResult } from "@/lib/actions/result";
import { filtersSchema,type CommercialList,type CommercialOptions,type CommercialDetail,type VisitDetail,type SourceKind } from "@/lib/commercial/model";

function errorText(error:unknown){
 if(error instanceof z.ZodError)return "Controleer de verplichte velden en de ingevoerde waarden.";
 const e=error as {code?:string;message?:string};
 if(e?.code==="23514"||e?.code==="40001")return e.message??"De gegevens zijn gewijzigd. Herlaad het dossier.";
 return "Deze actie is niet gelukt. Controleer je toegang en probeer opnieuw.";
}
export async function readCommercialList(filters:unknown):Promise<ActionResult<{data:CommercialList}>>{
 try{const {db,tenant}=await getObjectActor();const {data,error}=await db.rpc("commercial_list",{target_tenant:tenant.id,filters:filtersSchema.parse(filters)});if(error)throw error;return{ok:true,data:data as unknown as CommercialList};}catch(e){return{ok:false,error:errorText(e)};}
}
export async function readCommercialDetail(id:string,source:SourceKind):Promise<ActionResult<{data:CommercialDetail|VisitDetail}>>{
 try{const {db,tenant}=await getObjectActor();const {data,error}=await db.rpc("commercial_detail",{target_tenant:tenant.id,target_id:z.uuid().parse(id),source_kind:z.enum(["request","quote","visit","proposal"]).parse(source)});if(error)throw error;return{ok:true,data:data as unknown as CommercialDetail|VisitDetail};}catch(e){return{ok:false,error:errorText(e)};}
}
export async function readCommercialOptions(query="",customer=""):Promise<ActionResult<{data:CommercialOptions}>>{
 try{const {db,tenant}=await getObjectActor();const {data,error}=await db.rpc("commercial_options",{target_tenant:tenant.id,query:z.string().max(200).parse(query),customer:customer?z.uuid().parse(customer):undefined});if(error)throw error;return{ok:true,data:data as unknown as CommercialOptions};}catch(e){return{ok:false,error:errorText(e)};}
}
export async function commercialAction(command:string,input:Record<string,unknown>,commandId:string):Promise<ActionResult<{data:Record<string,string|boolean>}>>{
 try{
  const {db,tenant}=await getObjectActor();
  const kind=z.enum(["request_save","quote_save","publish","revise","decide","convert","quote_archive","quote_delete","quote_followup","information","request_status","request_archive","request_delete","note","request_direct","inspection"]).parse(command);
  if(JSON.stringify(input).length>250000)throw new Error("Te veel gegevens");
  const {data,error}=await db.rpc("commercial_command",{target_tenant:tenant.id,command_id:z.uuid().parse(commandId),command:kind,input:input as Json});if(error)throw error;
  const entity=(data as {id?:string})?.id||input.id;
  if(typeof entity==="string"&&z.uuid().safeParse(entity).success)await flushCommercialMail(tenant.id,entity).catch(()=>{});
  revalidatePath("/app","layout");revalidatePath("/klant","layout");
  return{ok:true,data:data as Record<string,string|boolean>};
 }catch(e){return{ok:false,error:errorText(e)};}
}

export async function retryCommercialMessages(id:string,kind:"request"|"quote"):Promise<ActionResult>{
 try{
  const {db,tenant,user}=await getObjectActor();z.uuid().parse(id);z.enum(["request","quote"]).parse(kind);
  const confirmAccess=async()=>{
   const context=await requireBackofficePermission("backoffice.commercial.write");
   if(context.tenant?.id!==tenant.id||context.user.id!==user.id||!hasManagementPermission(context.tenant,"backoffice.functions.retry_commercial_messages"))throw new Error("Geen toegang tot deze verzendfunctie.");
   const access=await db.rpc("commercial_detail",{target_tenant:tenant.id,target_id:id,source_kind:kind});if(access.error||!access.data)throw new Error("Geen actuele toegang tot dit dossier.");
  };
  await flushCommercialMail(tenant.id,id,true,confirmAccess);return{ok:true};
 }catch(e){return{ok:false,error:errorText(e)};}
}

export async function createNextCommercialVisit(id:string,day:string,commandId:string):Promise<ActionResult<{id:string}>>{
 try{const {db,tenant}=await getObjectActor();const r=await db.rpc("commercial_next_visit",{target_tenant:tenant.id,quote_id:z.uuid().parse(id),visit_date:z.iso.date().parse(day),command_id:z.uuid().parse(commandId)});if(r.error)throw r.error;revalidatePath("/app","layout");return{ok:true,id:r.data};}catch(e){return{ok:false,error:errorText(e)};}
}

export async function readCommercialOrder(id:string):Promise<ActionResult<{data:Record<string,string|null>}>>{
 try{const {db,tenant}=await getObjectActor();const r=await db.rpc("commercial_order_context",{target_tenant:tenant.id,target_order:z.uuid().parse(id)});if(r.error)throw r.error;return{ok:true,data:r.data as Record<string,string|null>};}catch(e){return{ok:false,error:errorText(e)};}
}

export async function cancelCommercialBooking(id:string,reason:string,commandId:string):Promise<ActionResult>{
 try{const {db,tenant}=await getObjectActor();const r=await db.rpc("commercial_cancel_booking",{target_tenant:tenant.id,target_order:z.uuid().parse(id),command_id:z.uuid().parse(commandId),reason:z.string().trim().min(3).max(2000).parse(reason)});if(r.error)throw r.error;revalidatePath("/app","layout");return{ok:true};}catch(e){return{ok:false,error:errorText(e)};}
}

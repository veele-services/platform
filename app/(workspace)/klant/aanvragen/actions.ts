"use server";
import {flushCommercialMail} from "@/lib/commercial/mail";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {getObjectActor} from "@/lib/objects/auth";
import type {Json} from "@/lib/database.types";
import type {ActionResult} from "@/lib/actions/result";
export async function customerCommercialAction(command:string,input:Record<string,unknown>,id:string):Promise<ActionResult>{
 try{const {db,tenant}=await getObjectActor();if(JSON.stringify(input).length>20000)throw new Error("Gebruik een kortere toelichting.");const r=await db.rpc("commercial_customer_action",{target_tenant:tenant.id,command_id:z.uuid().parse(id),command:z.enum(["intake","reply","decide"]).parse(command),input:input as Json});if(r.error)throw new Error(r.error.code==="23514"?r.error.message:"Geen toegang tot deze aanvraag of offerte.");await flushCommercialMail(tenant.id,command==="intake"?id:String(input.id)).catch(()=>{});revalidatePath("/klant","layout");revalidatePath("/app","layout");return{ok:true};}catch(e){return{ok:false,error:e instanceof Error?e.message:"Niet opgeslagen."};}
}

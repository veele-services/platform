"use server";
import {flushCommercialMail} from "@/lib/commercial/mail";
import {z} from "zod";
import {quoteAccess} from "@/lib/commercial/access";
import type {ActionResult} from "@/lib/actions/result";
export async function acceptQuote(form:FormData):Promise<ActionResult>{
 try{
  const input=z.object({token:z.string().min(32).max(100),name:z.string().trim().min(2).max(180),decision:z.enum(["accepted","change_requested","rejected"]),evidence:z.string().max(3000).default(""),accepted:z.literal("on")}).parse(Object.fromEntries(form));
  const access=await quoteAccess(input.token);if(!access||!access.active)throw new Error("Deze offerte is verlopen, vervangen of niet beschikbaar. Neem contact op met de afzender voor een actueel voorstel.");
  const result=await access.admin.rpc("commercial_external_decision",{token_hash_input:access.hash,target_tenant:access.tenant.id,input:{decision:input.decision,name:input.name,evidence:input.evidence,confirmed:true}});
  if(result.error)throw new Error(result.error.code==="23514"?result.error.message:"Je besluit kon niet worden opgeslagen. Probeer opnieuw.");
  await flushCommercialMail(access.tenant.id,access.quote.id).catch(()=>{});
  return{ok:true};
 }catch(e){return{ok:false,error:e instanceof z.ZodError?"Vul je naam in en bevestig je besluit.":e instanceof Error?e.message:"Je besluit is niet opgeslagen."};}
}

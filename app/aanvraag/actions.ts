"use server";
import {flushCommercialMail} from "@/lib/commercial/mail";
import {createHmac} from "node:crypto";
import {headers} from "next/headers";
import {z} from "zod";
import {createAdminClient} from "@/lib/supabase/admin";
import {TENANT_SLUG_HEADER} from "@/lib/tenancy/hostname";
import {getServerEnv} from "@/lib/env/server";
import type {ActionResult} from "@/lib/actions/result";

export async function submitPublicRequest(form:FormData):Promise<ActionResult>{
 try{
  const input=z.object({id:z.uuid(),name:z.string().trim().min(2).max(180),email:z.email().max(254),phone:z.string().max(40),subject:z.string().trim().min(2).max(180),description:z.string().trim().min(3).max(10000),discipline:z.string().trim().min(2).max(100),work_kind:z.enum(["once","recurring","extra"]),location:z.string().max(1000),date:z.iso.date().or(z.literal("")),frequency:z.string().max(300),website:z.literal("")}).parse(Object.fromEntries(form));
  const h=await headers();const slug=h.get(TENANT_SLUG_HEADER);if(!slug)throw new Error("Open het aanvraagformulier van het bedrijf.");
  const admin=createAdminClient();const {data:tenant}=await admin.from("tenants").select("id").eq("slug",slug).eq("status","active").single();
  const key=getServerEnv().ADMIN_API_SECRET;if(!tenant||!key)throw new Error("Het aanvraagformulier is tijdelijk niet beschikbaar.");
  // Never persist/log network identifiers. The proxy appends the connecting IP.
  const ip=h.get("x-forwarded-for")?.split(",").at(-1)?.trim()||"unknown";
  const clientHash=createHmac("sha256",key).update(`${tenant.id}:${ip}`).digest("hex");
  const saved=await admin.rpc("commercial_public_intake",{target_tenant:tenant.id,request_id:input.id,input,client_hash:clientHash});
  if(saved.error)throw new Error(saved.error.code==="23514"?saved.error.message:"Je aanvraag kon niet worden opgeslagen. Probeer opnieuw.");
  await flushCommercialMail(tenant.id,input.id).catch(()=>{});
  return{ok:true};
 }catch(e){return{ok:false,error:e instanceof z.ZodError?"Controleer je contactgegevens, onderwerp en omschrijving.":e instanceof Error?e.message:"Aanvraag niet opgeslagen."};}
}

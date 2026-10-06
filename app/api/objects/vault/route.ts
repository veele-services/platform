import { withTenantEmailBrand } from "@/lib/communications/tenant-email-brand";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { getServerEnv } from "@/lib/env/server";
import { sendEmail } from "@/lib/providers/sendgrid";
import { renderTenantEmailHtml } from "@/lib/communications/email";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import type { Json } from "@/lib/database.types";
import {localToInstant} from "@/lib/planning/time";

const noStore={"Cache-Control":"private, no-store, max-age=0","Pragma":"no-cache","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const schema=z.object({objectId:z.string().uuid(),orderId:z.string().uuid().nullable().default(null),itemId:z.string().uuid().nullable().default(null),operation:z.enum(["dossier","metadata","request","verify","read","check","hide","save","scope"]),input:z.record(z.string(),z.union([z.string().max(4000),z.number(),z.boolean(),z.null()])).default({})});
export async function POST(request:Request){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:noStore});
 try{
  const origin=request.headers.get("origin");const host=request.headers.get("host");
  if(!origin||new URL(origin).host!==host||((process.env.DEPLOY_TARGET??"local")!=="local"&&new URL(origin).protocol!=="https:")||!request.headers.get("content-type")?.startsWith("application/json"))return reply({ok:false,error:"Deze aanvraag is niet toegestaan."},403);
  if(Number(request.headers.get("content-length")||0)>12000)return reply({ok:false,error:"Aanvraag te groot."},413);
  const reader=request.body?.getReader();if(!reader)throw new Error("Geen aanvraag");
  const decoder=new TextDecoder();let raw="",size=0;
  for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>12000){await reader.cancel();return reply({ok:false,error:"Aanvraag te groot."},413);}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();
  const v=schema.parse(JSON.parse(raw));const {admin,user,sessionId,tenant}=await getObjectActor();
  const call=async(operation:string,input:Json)=>{
   const r=await admin.rpc("object_vault_operation",{target_tenant:tenant.id,actor:user.id,session_id:sessionId,target_object:v.objectId,target_order:v.orderId!,target_item:v.itemId!,operation,input});
   if(r.error)throw new Error("Verificatie niet beschikbaar");return r.data as Record<string,Json>;
  };
  if(v.operation==="save"&&v.input.validUntil)v.input.validUntil=localToInstant(String(v.input.validUntil),tenant.timezone);
  if(v.operation!=="request")return reply(await call(v.operation,v.input));
  const code=String(randomInt(0,1000000)).padStart(6,"0");
  const result=await call("request",{code});if(!result.ok)return reply(result);
  try{
   const env=getServerEnv();const {data:brand,error}=await admin.from("tenant_branding").select("primary_color,accent_color,logo_path,sender_name").eq("tenant_id",tenant.id).single();
   if(error||!brand||!env.SENDGRID_FROM_EMAIL)throw new Error("E-mail niet beschikbaar");
   const subject="Je verificatiecode voor beveiligde objectgegevens";
   const text=`Je verificatiecode is ${code}.\n\nDeze code is maximaal twee minuten geldig. Vul hem alleen in de geopende omgeving van je organisatie in. Deel de code niet. Heb je geen code aangevraagd? Neem contact op met je leidinggevende.\n\nDit bericht bevat geen alarm- of toegangscode.`;
   const html=renderTenantEmailHtml({brand:await withTenantEmailBrand(tenant.id, {company:tenant.name,domain:new URL(tenantAppUrl(tenant.slug)).host,primary:brand.primary_color,accent:brand.accent_color,senderEmail:env.SENDGRID_FROM_EMAIL,emailLogoUrl:brand.logo_path?`${env.APP_URL}/api/branding/${tenant.id}/email-logo`:null}),kind:"object_otp",message:{subject,body:text},targetUrl:tenantAppUrl(tenant.slug,"/staff"),allowLocalLinks:env.DEPLOY_TARGET==="local"});
   await sendEmail({to:String(result.email),fromEmail:env.SENDGRID_FROM_EMAIL,fromName:brand.sender_name||tenant.name,subject,text,html,deliveryKey:`object-otp:${result.challengeId}`,disableTracking:true,policy:{kind:"security",flow:"object_otp",tenantId:tenant.id}});
   const delivered=await call("delivered",{challengeId:result.challengeId});if(!delivered.ok)throw new Error("Toegang gewijzigd");
   return reply({ok:true,challengeId:result.challengeId,expiresAt:result.expiresAt});
  }catch{
   await call("delivery_failed",{challengeId:result.challengeId});
   return reply({ok:false,error:"De verificatiemail kon niet worden verstuurd. Neem contact op met je leidinggevende; deel geen toegangscodes via gewone berichten."},503);
  }
 }catch{
  // Never serialize provider/DB exceptions, request bodies, OTPs or secret values.
  return reply({ok:false,error:"Toegang niet beschikbaar. Vernieuw je sessie of neem contact op met je leidinggevende."},403);
 }
}

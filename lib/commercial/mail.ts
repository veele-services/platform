import "server-only";
import {createAdminClient} from "@/lib/supabase/admin";
import {getServerEnv} from "@/lib/env/server";
import {tenantAppUrl} from "@/lib/tenancy/hostname";
import {renderTenantEmailHtml} from "@/lib/communications/email";
import {sendEmail,SendGridDeliveryError} from "@/lib/providers/sendgrid";

type Snapshot={subject:string;body:string;recipients:Array<{email:string;audience:string;path:string}>;brand:{company:string;slug:string;primary:string;accent:string;logo_path:string|null}};
/** Called only after a scoped, committed action. Failure never rolls back consent.
 * Pending/failed events stay visible for an explicit retry; ambiguous sends do not retry.
 */
export async function flushCommercialMail(tenantId:string,entityId:string){
 const admin=createAdminClient();const env=getServerEnv();if(!env.SENDGRID_API_KEY||!env.SENDGRID_FROM_EMAIL)return;
 const events=await admin.from("commercial_events").select("id,mail_snapshot").eq("tenant_id",tenantId).or(`request_id.eq.${entityId},quote_id.eq.${entityId}`).not("mail_snapshot","is",null).order("created_at",{ascending:false}).limit(12);
 for(const e of events.data??[]){const s=e.mail_snapshot as unknown as Snapshot;
  for(const recipient of s.recipients){
   const claim=await admin.rpc("commercial_mail_claim",{target_tenant:tenantId,event_id:e.id,recipient_input:recipient.email});if(claim.error)continue;const c=claim.data as {id:string;send:boolean;key:string};if(!c.send)continue;
   try{
    const url=tenantAppUrl(s.brand.slug,recipient.path);
    const html=renderTenantEmailHtml({kind:"commercial_event",brand:{...s.brand,domain:new URL(tenantAppUrl(s.brand.slug)).hostname,senderEmail:env.SENDGRID_FROM_EMAIL,emailLogoUrl:s.brand.logo_path?tenantAppUrl(s.brand.slug,`/api/branding/${tenantId}/email-logo`):null},message:{subject:s.subject,body:s.body},targetUrl:url,allowLocalLinks:env.DEPLOY_TARGET==="local"});
    const sent=await sendEmail({fromEmail:env.SENDGRID_FROM_EMAIL,fromName:s.brand.company,to:recipient.email,subject:s.subject,text:`${s.body}\n\n${url}`,html,deliveryKey:c.key,disableTracking:true});
    await admin.from("mail_deliveries").update({status:"sent",provider_message_id:sent.id,sent_at:new Date().toISOString(),locked_until:null}).eq("tenant_id",tenantId).eq("id",c.id);
   }catch(error){const retry=error instanceof SendGridDeliveryError&&error.httpStatus>=400&&error.httpStatus<500;await admin.from("mail_deliveries").update({status:retry?"failed":"processing",last_error:retry?"Provider heeft verzending geweigerd; handmatig opnieuw proberen is mogelijk.":"Verzending niet bevestigd. Controleer de provider vóór opnieuw verzenden.",locked_until:null}).eq("tenant_id",tenantId).eq("id",c.id);}
  }
 }
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { sendEmail, SendGridDeliveryError } from "@/lib/providers/sendgrid";
import { renderTenantEmailHtml } from "@/lib/communications/email";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { canReadDossier } from "./dossier";

export async function processDossierReminders() {
 const admin=createAdminClient();const env=getServerEnv();let sent=0,failed=0;
 // An interrupted provider request cannot be retried blindly: acceptance is unknown.
 await admin.from("personnel_dossier_deliveries").update({status:"uncertain",last_error:"Verwerking onderbroken. Controleer de provider vóór opnieuw verzenden."}).eq("status","processing").lt("available_at",new Date(Date.now()-600000).toISOString());
 const {data:deliveries,error}=await admin.rpc("claim_personnel_dossier_deliveries",{batch_size:env.NOTIFICATION_WORKER_LIMIT});
 if(error)throw new Error("Dossierreminders konden niet worden opgehaald.");
 for(const delivery of deliveries??[]){
  try{
   const table=delivery.source_table;
   if(!["personnel_contracts","certificates","personnel_notes","personnel_dossier_items"].includes(table))throw new Error("Onbekende bron");
   const {data:source}=await admin.from(table as "personnel_dossier_items").select("dossier_revision,dossier_status").eq("tenant_id",delivery.tenant_id).eq("personnel_id",delivery.personnel_id).eq("id",delivery.source_id).maybeSingle();
   const {data:tenant}=await admin.from("tenants").select("slug,name,status").eq("id",delivery.tenant_id).single();
   const {data:settings}=await admin.from("tenant_settings").select("enabled_services").eq("tenant_id",delivery.tenant_id).single();
   if(!source||source.dossier_revision!==delivery.source_revision||["completed","ended","returned","recovered","draft","archived","revoked","rejected"].includes(source.dossier_status)||tenant?.status!=="active"||!settings?.enabled_services.includes("personeel")){
    await admin.from("personnel_dossier_deliveries").update({status:"cancelled"}).eq("id",delivery.id);continue;
   }
   const path=`/app/personeel/${delivery.personnel_id}?tab=tijdlijn`;
   if(delivery.recipient_user_id){
    const {data:member}=await admin.from("tenant_memberships").select("roles,status").eq("tenant_id",delivery.tenant_id).eq("user_id",delivery.recipient_user_id).maybeSingle();
    if(member?.status!=="active"||!canReadDossier(member.roles)){await admin.from("personnel_dossier_deliveries").update({status:"cancelled"}).eq("id",delivery.id);continue;}
    const {error:notificationError}=await admin.from("notifications").upsert({id:delivery.id,tenant_id:delivery.tenant_id,user_id:delivery.recipient_user_id,channel:"in_app",title:"Een dossieractie vraagt aandacht",body:"Open het afgeschermde dossier om de opvolging te bekijken.",target_path:path,status:"sent",sent_at:new Date().toISOString()},{onConflict:"id",ignoreDuplicates:true});
    if(notificationError)throw new SendGridDeliveryError("In-app melding niet opgeslagen",503);
   }else{
    if(!env.SENDGRID_FROM_EMAIL||!env.SENDGRID_API_KEY)throw new SendGridDeliveryError("E-mailconfiguratie ontbreekt",503);
    const {data:brand}=await admin.from("tenant_branding").select("primary_color,accent_color,logo_path,sender_name").eq("tenant_id",delivery.tenant_id).single();
    if(!brand)throw new SendGridDeliveryError("Huisstijl niet beschikbaar",503);
    const target=new URL(tenantAppUrl(tenant.slug,`/app/personeel/${delivery.personnel_id}`));target.searchParams.set("tab","tijdlijn");const targetUrl=target.href;const subject=`Dossierherinnering · ${tenant.name}`;
    const body="Er staat een dossieractie klaar voor opvolging. Open het afgeschermde personeelsdossier om de deadline en afspraken te bekijken. Deze melding bevat bewust geen vertrouwelijke dossierinhoud. Een melding lezen is niet hetzelfde als de taak afronden.";
    await sendEmail({fromEmail:env.SENDGRID_FROM_EMAIL,fromName:brand.sender_name||tenant.name,to:delivery.recipient,subject,text:`${body}\n\n${targetUrl}`,deliveryKey:`dossier-${delivery.id}`,disableTracking:true,html:renderTenantEmailHtml({brand:{company:tenant.name,domain:new URL(targetUrl).hostname,primary:brand.primary_color,accent:brand.accent_color,senderEmail:env.SENDGRID_FROM_EMAIL,emailLogoUrl:brand.logo_path?`${env.APP_URL}/api/branding/${delivery.tenant_id}/email-logo`:null},kind:"dossier_reminder",message:{subject,body},targetUrl,allowLocalLinks:env.DEPLOY_TARGET==="local"})});
   }
   const {error:saveError}=await admin.from("personnel_dossier_deliveries").update({status:"sent",sent_at:new Date().toISOString(),last_error:null}).eq("id",delivery.id);
   if(saveError)throw new Error("Verzendregistratie niet bevestigd");sent++;
  }catch(error){
   const retryable=error instanceof SendGridDeliveryError;
   await admin.from("personnel_dossier_deliveries").update({status:retryable?"failed":"uncertain",last_error:retryable?"Aflevering niet bevestigd; automatische herkansing gepland (maximaal 5 pogingen).":"Verzending onzeker. Controleer de provider; geen automatische dubbele verzending.",available_at:new Date(Date.now()+Math.min(3600000,30000*2**delivery.attempts)).toISOString()}).eq("id",delivery.id);failed++;
  }
 }
 return {claimed:deliveries?.length??0,sent,failed};
}

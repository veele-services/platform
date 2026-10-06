import { withTenantEmailBrand } from "@/lib/communications/tenant-email-brand";
import "server-only";
import {createAdminClient} from "@/lib/supabase/admin";
import {getServerEnv} from "@/lib/env/server";
import {tenantAppUrl} from "@/lib/tenancy/hostname";
import {renderTenantEmailHtml} from "@/lib/communications/email";
import {sendEmail} from "@/lib/providers/sendgrid";
import {freezeMailSnapshot,mailSnapshotSchema,mailFailureOutcome,mailFailureMessage,type MailSnapshot} from "@/lib/notifications/mail-snapshot";
import {resolveMailTemplate,renderNotificationMailText} from "@/lib/notifications/mail-template";
import {freezeEmailLogo} from "@/lib/notifications/brand-asset";
import {deferNotificationMail} from "@/lib/notifications/deferred-mail";

type Snapshot={subject:string;body:string;recipients:Array<{email:string;audience:string;path:string}>;brand:{company:string;slug:string;primary:string;accent:string;logo_path:string|null}};
/** Called only after a scoped, committed action. Failure never rolls back consent.
 * Pending/failed events stay visible for an explicit retry; ambiguous sends do not retry.
 */
export async function flushCommercialMail(tenantId:string,entityId:string,includeHistory=false){
 const admin=createAdminClient();const env=getServerEnv();if(!env.SENDGRID_API_KEY||!env.SENDGRID_FROM_EMAIL)throw new Error("E-mailverzending is niet geconfigureerd.");
 const batchSize=includeHistory?100:12;let lastFailure:string|null=null;
 for(let offset=0;;offset+=batchSize){
 const events=await admin.from("commercial_events").select("id,kind,mail_snapshot").eq("tenant_id",tenantId).or(`request_id.eq.${entityId},quote_id.eq.${entityId}`).not("mail_snapshot","is",null).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+batchSize-1);
 if(events.error)throw new Error("De openstaande berichten konden niet worden opgehaald.");
 const batch=events.data??[];if(!batch.length)break;
 // Skip already accepted or uncertain sends in one read, rather than making a
 // claim roundtrip for every historical message. The claim still arbitrates races.
 const delivered=await admin.from("mail_deliveries").select("recipient,render_snapshot").eq("tenant_id",tenantId).in("render_snapshot->>event_id",batch.map(e=>e.id)).not("status","in","(queued,failed)");
 if(delivered.error)throw new Error("De verzendhistorie kon niet worden gecontroleerd.");
 const settled=new Set((delivered.data??[]).map(m=>`${(m.render_snapshot as {event_id?:string})?.event_id}:${m.recipient}`));
 for(const e of batch){const s=e.mail_snapshot as unknown as Snapshot;
  for(const recipient of s.recipients){
   if(settled.has(`${e.id}:${recipient.email}`))continue;
   const claim=await admin.rpc("commercial_mail_claim",{target_tenant:tenantId,event_id:e.id,recipient_input:recipient.email});if(claim.error)throw new Error("Een bericht kon niet veilig voor verzending worden vastgelegd.");const c=claim.data as {id:string;send:boolean;key:string};if(!c.send)continue;
   let providerStarted=false;try{
    const previous=await admin.from("mail_deliveries").select("render_snapshot").eq("tenant_id",tenantId).eq("id",c.id).single();if(previous.error)throw new Error("De vaste berichtversie kon niet worden gelezen.");
    const saved=mailSnapshotSchema.safeParse((previous.data.render_snapshot as Record<string,unknown>)?.delivery);let frozen:MailSnapshot;
    if(saved.success)frozen=saved.data;else{
    const url=tenantAppUrl(s.brand.slug,recipient.path);
    const template=await resolveMailTemplate(admin,tenantId,e.kind,recipient.audience==="customer"?"customer":"backoffice");
    const values={bedrijfsnaam:s.brand.company,onderwerp:s.subject,bericht:s.body,nummer:""};
    const subject=renderNotificationMailText(template.title,template.variables,values),body=renderNotificationMailText(template.body,template.variables,values);
    const logoUrl=await freezeEmailLogo(admin,tenantId,s.brand.slug,s.brand.logo_path);
    const html=renderTenantEmailHtml({kind:"commercial_event",brand:await withTenantEmailBrand(tenantId, {...s.brand,domain:new URL(tenantAppUrl(s.brand.slug)).hostname,senderEmail:env.SENDGRID_FROM_EMAIL,emailLogoUrl:logoUrl}),message:{subject,body},targetUrl:url,targetLabel:template.cta_label,allowLocalLinks:env.DEPLOY_TARGET==="local"});
    frozen=await freezeMailSnapshot(admin,tenantId,c.id,{fromEmail:env.SENDGRID_FROM_EMAIL,fromName:s.brand.company,to:recipient.email,subject,text:`${body}\n\n${url}`,html,targetUrl:url,templateRevision:template.revision,templateVersionId:template.version_id,templateBaseVersionId:template.base_version_id,attachmentPath:null,attachmentFilename:null});
    }
    providerStarted=true;const sent=await sendEmail({...frozen,deliveryKey:c.key,disableTracking:true,policy:{kind:"notification",tenantId,type:e.kind,context:recipient.audience==="customer"?"customer":"backoffice",sourceId:c.id}});
    const stored=await admin.from("mail_deliveries").update({status:"sent",provider_message_id:sent.id,sent_at:new Date().toISOString(),locked_until:null}).eq("tenant_id",tenantId).eq("id",c.id);
    if(stored.error)throw new Error("De verzendstatus kon niet worden bevestigd.");
   }catch(error){if(await deferNotificationMail(error,tenantId,c.id,e.kind,recipient.audience==="customer"?"customer":"backoffice")){lastFailure="Het bericht is klaargezet na de persoonlijke rusttijden; er is nog niets verzonden.";continue;}const status=providerStarted?mailFailureOutcome(error):"failed";lastFailure=providerStarted?mailFailureMessage(status):"De berichtvoorbereiding is niet voltooid; er is nog geen verzending gestart.";await admin.from("mail_deliveries").update({status,last_error:lastFailure,locked_until:null}).eq("tenant_id",tenantId).eq("id",c.id).eq("status","processing");}
  }
 }
 if(!includeHistory||batch.length<batchSize)break;
 }
 if(lastFailure)throw new Error(lastFailure);
}

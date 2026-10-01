import "server-only";
import webpush from "web-push";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { sendEmail, SendGridDeliveryError } from "@/lib/providers/sendgrid";
import { renderTenantEmailHtml } from "@/lib/communications/email";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { ticketRpc } from "../tickets/rpc";
import { ticketPushEndpointAllowed } from "../tickets/push-validation";
import { NotificationDeferredError, NotificationSuppressedError, withNotificationProviderPermit } from "./provider-policy";
import { freezeEmailLogo } from "./brand-asset";

const claimsSchema=z.array(z.object({id:z.uuid(),lease:z.uuid()}).strict()).max(100);
const emailSnapshot=z.object({fromEmail:z.email(),fromName:z.string(),subject:z.string(),text:z.string(),html:z.string()});
const deliverySchema=z.object({id:z.uuid(),tenantId:z.uuid(),type:z.string(),context:z.enum(["platform","backoffice","staff","customer"]),recipientUserId:z.uuid().nullable(),channel:z.enum(["email","push"]),ttl_seconds:z.number().int().min(0).max(2419200),snapshot:z.object({title:z.string(),body:z.string(),pushTitle:z.string().nullable().optional(),pushBody:z.string().nullable().optional(),actionLabel:z.string(),path:z.string(),recipient:z.email(),slug:z.string(),priority:z.string(),brand:z.object({company:z.string(),primary:z.string(),accent:z.string(),logo_path:z.string().nullable().optional()})}),transport:emailSnapshot.nullable(),subscription:z.object({endpoint:z.string(),keys:z.object({p256dh:z.string(),auth:z.string()})}).nullable()});

export async function prepareNotificationEvent(outboxId:string){return ticketRpc(createAdminClient(),"notification_outbox_prepare",{target_event:outboxId});}
export async function prepareDossierNotifications(){return ticketRpc(createAdminClient(),"notification_prepare_dossier",{batch_size:25});}
export async function processNotificationDeliveries(){
 // Five external sends plus the other worker jobs fit inside the staging
 // systemd deadline even when each provider exhausts its 15-second timeout.
 const claims=claimsSchema.parse(await ticketRpc(createAdminClient(),"notification_delivery_claim",{batch_size:5}));
 return processNotificationDeliveryClaims(claims);
}
/** Exact leased rows only: usable for fixture-isolated transport verification. */
export async function processNotificationDeliveryClaims(input:Array<{id:string;lease:string}>){
 const claims=claimsSchema.parse(input),db=createAdminClient(),env=getServerEnv();let sent=0,failed=0,uncertain=0,suppressed=0,deferred=0,cancelled=0;
 for(const claim of claims){let submitted=false;let channel:string|undefined;
  const finish=async(outcome:string,providerId?:string)=>{const ok=await ticketRpc(db,"notification_delivery_finish",{delivery_id:claim.id,lease_id:claim.lease,outcome,provider_id:providerId??null});if(ok!==true)throw new Error("Afleveruitkomst niet bevestigd");};
  try{
   const raw=await ticketRpc(db,"notification_delivery_begin",{delivery_id:claim.id,lease_id:claim.lease});if(!raw)continue;
   const delivery=deliverySchema.parse(raw);channel=delivery.channel;
   const policy={kind:"notification" as const,tenantId:delivery.tenantId,type:delivery.type,context:delivery.context,recipientUserId:delivery.recipientUserId,sourceId:delivery.id,sourceKind:"delivery" as const};
   if(delivery.channel==="email"){
    if(!env.SENDGRID_API_KEY||!env.SENDGRID_FROM_EMAIL)throw new Error("Mailconfiguratie ontbreekt");
    let frozen=delivery.transport;
    if(!frozen){
     const s=delivery.snapshot,externalContact=delivery.context==="customer"&&delivery.recipientUserId===null;
     // An email-only contact has no portal login. Do not promise a source view
     // they cannot open; the safe email carries the update and links our public
     // tenant website. Authenticated recipients retain their scoped deeplink.
     const target=delivery.context==="platform"?new URL(s.path,env.APP_URL).href:tenantAppUrl(s.slug,externalContact?"/":s.path);
     const logo=await freezeEmailLogo(db,delivery.tenantId,s.slug,s.brand.logo_path);
     const brand={company:s.brand.company,domain:new URL(target).hostname,primary:s.brand.primary,accent:s.brand.accent,senderEmail:env.SENDGRID_FROM_EMAIL,emailLogoUrl:logo};
     const prepared={fromEmail:env.SENDGRID_FROM_EMAIL,fromName:brand.company,subject:s.title,text:`${s.body}\n\n${target}`,html:renderTenantEmailHtml({brand,kind:"notification_event",message:{subject:s.title,body:s.body},targetUrl:target,targetLabel:externalContact?"Website openen":s.actionLabel,allowLocalLinks:env.DEPLOY_TARGET==="local"})};
     frozen=emailSnapshot.parse(await ticketRpc(db,"notification_delivery_freeze",{delivery_id:claim.id,lease_id:claim.lease,input:prepared}));
    }
    submitted=true;const result=await sendEmail({...frozen,to:delivery.snapshot.recipient,deliveryKey:`notification-${delivery.id}`,disableTracking:true,policy});await finish("sent",result.id);sent++;
   }else{
    if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT||!delivery.subscription||!ticketPushEndpointAllowed(delivery.subscription.endpoint))throw new Error("Pushconfiguratie ontbreekt");
    webpush.setVapidDetails(env.VAPID_SUBJECT,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
    // Older immutable snapshots predate safe push fields; keep their historical
    // generic projection instead of exposing full inbox/campaign text.
    const title=(delivery.snapshot.pushTitle??delivery.snapshot.brand.company).slice(0,80),body=(delivery.snapshot.pushBody??"Er staat een nieuwe melding klaar in de beveiligde omgeving.").slice(0,160);
    submitted=true;await withNotificationProviderPermit({policy,channel:"push",deliveryKey:`notification-${delivery.id}`},()=>webpush.sendNotification(delivery.subscription!,JSON.stringify({title,body,target:delivery.snapshot.path,context:delivery.context,tag:`notification-${delivery.id}`}),{TTL:delivery.ttl_seconds,urgency:delivery.snapshot.priority==="urgent"?"high":"normal",timeout:15000}));
    await finish("sent");sent++;
   }
  }catch(error){
   if(error instanceof NotificationDeferredError){await ticketRpc(db,"notification_delivery_defer",{delivery_id:claim.id,lease_id:claim.lease,retry_at:error.retryAt});deferred++;continue;}
   if(error instanceof NotificationSuppressedError){await ticketRpc(db,"notification_delivery_finish",{delivery_id:claim.id,lease_id:claim.lease,outcome:"suppressed",provider_id:null});suppressed++;continue;}
   const status=error instanceof SendGridDeliveryError?error.httpStatus:typeof error==="object"&&error&&"statusCode"in error?Number(error.statusCode):0;
   if(channel==="push"&&[404,410].includes(status)){await finish("cancelled");cancelled++;}
   else if(!submitted||(status>=400&&status<500&&status!==408)){await finish("failed");failed++;}
   else{await finish("uncertain");uncertain++;}
  }
 }
 return {claimed:claims.length,sent,failed,uncertain,suppressed,deferred,cancelled};
}

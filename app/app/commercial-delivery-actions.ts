"use server";

import { withTenantEmailBrand } from "@/lib/communications/tenant-email-brand";
import { readScannedFile, uploadScannedFile } from "@/lib/files/scanned-storage";
import {createHash,createHmac,randomUUID} from "node:crypto";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {getObjectActor} from "@/lib/objects/auth";
import {getServerEnv} from "@/lib/env/server";
import {tenantAppUrl} from "@/lib/tenancy/hostname";
import {sendEmail} from "@/lib/providers/sendgrid";
import {freezeMailSnapshot,mailSnapshotSchema,mailFailureOutcome,mailFailureMessage,type MailSnapshot} from "@/lib/notifications/mail-snapshot";
import {resolveMailTemplate} from "@/lib/notifications/mail-template";
import {deferNotificationMail,retryDeferredDocumentMail} from "@/lib/notifications/deferred-mail";
import {renderTenantEmailHtml} from "@/lib/communications/email";
import {renderPlainEmail} from "@/lib/communications/templates";
import {renderQuotePdf} from "@/lib/pdf/quote";
import {customerDocumentExtension,validateDossierDocumentName,CUSTOMER_DOCUMENT_MAX_BYTES} from "@/lib/customers/documents";
import type {ActionResult} from "@/lib/actions/result";
import type {CommercialDetail,QuoteSnapshot} from "@/lib/commercial/model";
import {localToInstant} from "@/lib/planning/time";
import {assertPrivateFile} from "@/lib/files/private-download";
import {readMailAttachment} from "@/lib/notifications/mail-attachment";

export async function createCommercialBooking(form:FormData):Promise<ActionResult<{url:string}>>{
 try{const {db,tenant}=await getObjectActor();const id=z.uuid().parse(form.get("commandId"));const key=getServerEnv().ADMIN_API_SECRET;if(!key)throw new Error("Beveiligde links zijn niet geconfigureerd.");const token=createHmac("sha256",key).update(`fieldgrid:booking:${tenant.id}:${id}`).digest("base64url");const r=await db.rpc("commercial_booking",{target_tenant:tenant.id,command_id:id,input:{work_order_id:z.uuid().parse(form.get("workOrderId")),starts_at:localToInstant(z.string().parse(form.get("start")),tenant.timezone),ends_at:localToInstant(z.string().parse(form.get("end")),tenant.timezone),capacity:z.coerce.number().int().min(1).max(20).parse(form.get("capacity")),token_hash:createHash("sha256").update(token).digest("hex")}});if(r.error)throw new Error(r.error.code==="23514"?r.error.message:"Boekingslink kon niet worden vastgelegd.");return{ok:true,url:tenantAppUrl(tenant.slug,`/booking/${token}`)};}catch(e){return{ok:false,error:e instanceof Error?e.message:"Controleer het tijdvak."};}
}

export async function uploadCommercialAttachment(form:FormData):Promise<ActionResult>{
 try{
  const {db,admin,tenant,user}=await getObjectActor();const id=z.uuid().parse(form.get("entityId"));const kind=z.enum(["request","quote"]).parse(form.get("kind"));
  const access=await db.rpc("commercial_detail",{target_tenant:tenant.id,target_id:id,source_kind:kind});if(access.error)throw new Error("Geen toegang tot dit dossier.");
  const file=form.get("file");if(!(file instanceof File)||file.size<1||file.size>CUSTOMER_DOCUMENT_MAX_BYTES)throw new Error("Gebruik een bestand van maximaal 10 MB.");
  const title=z.string().trim().min(2).max(250).parse(form.get("title"));validateDossierDocumentName(title,file.name);const bytes=new Uint8Array(await file.arrayBuffer());const ext=customerDocumentExtension(file.type,bytes);const hash=createHash("sha256").update(bytes).digest("hex");
	  const path=`${tenant.id}/${kind}/${id}/${hash}.${ext}`;
	  const existing=await admin.from("commercial_attachments").select("id").eq("tenant_id",tenant.id).eq("storage_path",path).maybeSingle();if(existing.data)return{ok:true};
	  await uploadScannedFile(db,"commercial-documents",path,bytes,file.type);
	  const currentAccess=await db.rpc("commercial_detail",{target_tenant:tenant.id,target_id:id,source_kind:kind});if(currentAccess.error||!currentAccess.data)throw new Error("Je toegang is gewijzigd. De bijlage is niet gekoppeld.");
	  const inserted=await admin.from("commercial_attachments").insert({id:randomUUID(),tenant_id:tenant.id,request_id:kind==="request"?id:null,quote_id:kind==="quote"?id:null,title,storage_path:path,mime_type:file.type,size_bytes:file.size,sha256:hash,public_in_offer:kind==="quote"&&form.get("public")==="true",created_by:user.id});
  if(inserted.error){const replay=await admin.from("commercial_attachments").select("id").eq("tenant_id",tenant.id).eq("storage_path",path).maybeSingle();if(!replay.data)throw new Error("De bijlage is niet gekoppeld. Een aangeboden offerteversie kan niet meer worden gewijzigd.");}
  revalidatePath("/app","layout");return{ok:true};
 }catch(e){return{ok:false,error:e instanceof Error?e.message:"Bijlage niet opgeslagen."};}
}

export async function sendCommercialQuote(id:string,commandId:string,reminder=false):Promise<ActionResult>{
 let beforeProviderFailure:(()=>Promise<void>)|null=null;let providerStarted=false;
 try{
  z.uuid().parse(id);z.uuid().parse(commandId);const {db,admin,tenant,user}=await getObjectActor();const env=getServerEnv();
  if(!env.SENDGRID_API_KEY||!env.SENDGRID_FROM_EMAIL||!env.ADMIN_API_SECRET)throw new Error("E-mailverzending is niet beschikbaar. Vraag de platformbeheerder om de configuratie te controleren.");
  const access=await db.rpc("commercial_detail",{target_tenant:tenant.id,target_id:id,source_kind:"quote"});if(access.error)throw new Error("Geen toegang tot deze offerte.");
  const detail=access.data as unknown as CommercialDetail;let q=detail.record;if(!("quote_number"in q))throw new Error("Offerte niet gevonden.");
  if(q.status==="draft"&&!reminder){const published=await db.rpc("commercial_command",{target_tenant:tenant.id,command_id:commandId,command:"publish",input:{id,version:q.version}});if(published.error)throw new Error(published.error.code==="23514"?published.error.message:"De offerte is gewijzigd. Herlaad en controleer de versie.");}
  const current=await admin.from("quotes").select("*").eq("tenant_id",tenant.id).eq("id",id).single();if(current.error)throw new Error("De offerte kon niet worden opgehaald.");q=current.data;
  if(q.status!=="awaiting_acceptance"||q.archived_at||q.superseded_at||!q.expires_at||Date.parse(q.expires_at)<=Date.now()||!q.published_at)throw new Error("Alleen een actuele, openstaande offerte kan worden verzonden. Maak voor een historische prijsopgave een nieuwe versie.");
  const snapshot=q.snapshot as unknown as QuoteSnapshot;const recipient=z.email().parse(snapshot.contact.email);const deliveryKey=reminder?`commercial-reminder-${id}-${commandId}`:`commercial-quote-${id}`;
  const previous=await admin.from("mail_deliveries").select("id,status,last_error,render_snapshot").eq("tenant_id",tenant.id).eq("idempotency_key",deliveryKey).maybeSingle();
  if(previous.error)throw new Error("De verzendstatus kon niet worden gecontroleerd.");
  if(previous.data?.status==="failed" && await retryDeferredDocumentMail(tenant.id,previous.data.id)) return {ok:false,error:"De eerdere offertemail is opnieuw ingepland. De worker controleert de ontvanger en verzendt dezelfde vastgelegde versie; er is nu nog niets verzonden."};
  if(previous.data?.status==="sent")return{ok:true};
  if(previous.data&&!["failed","queued"].includes(previous.data.status))throw new Error(previous.data.status==="suppressed"?mailFailureMessage("suppressed"):"Deze verzending is nog bezig of de providerbevestiging is onzeker. Controleer de verzendregistratie vóór opnieuw verzenden.");
  const saved=mailSnapshotSchema.safeParse((previous.data?.render_snapshot as Record<string,unknown>|null)?.delivery);
  let logo:Uint8Array|undefined;let logoPath=q.logo_path;
  if(!saved.success&&snapshot.brand.logo_source){
   logoPath=logoPath||`${tenant.id}/quote/${id}/logo.${snapshot.brand.logo_source.split('.').at(-1)}`;
   assertPrivateFile({bucket:"commercial-documents",path:logoPath,scope:[tenant.id,"quote",id],name:"logo",mime:"image/png"});
   if(!snapshot.brand.logo_source.startsWith(`${tenant.id}/`)||/[\\%?#\u0000-\u001f\u007f]/.test(snapshot.brand.logo_source)||snapshot.brand.logo_source.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error("Huisstijlbestand niet beschikbaar.");
   const existingLogo=await readScannedFile("commercial-documents",logoPath);if(existingLogo)logo=existingLogo.bytes;else{
    const source=await readScannedFile("branding",snapshot.brand.logo_source);if(!source)throw new Error("Het logo voor deze aangeboden versie is niet beschikbaar.");logo=source.bytes;
    await uploadScannedFile(db,"commercial-documents",logoPath,logo,source.mime);
   }
  }
  const pdfPath=(saved.success?saved.data.attachmentPath:null)||q.pdf_path||`${tenant.id}/quote/${id}/offerte.pdf`;
  assertPrivateFile({bucket:"commercial-documents",path:pdfPath,scope:[tenant.id,"quote",id],name:"offerte.pdf",mime:"application/pdf"});
  const storedPdf=await readScannedFile("commercial-documents",pdfPath);let pdf:Uint8Array;
  if(storedPdf)pdf=storedPdf.bytes;else{if(saved.success)throw new Error("Het vastgelegde offertedocument is niet beschikbaar.");pdf=await renderQuotePdf(snapshot,logo);await uploadScannedFile(db,"commercial-documents",pdfPath,pdf,"application/pdf");}
  // Existing-file/lazy-scan retries must reauthorize the initiating actor too,
  // not only the later service-role mail source and intended recipient.
  const confirmAccess=async()=>{const current=await db.rpc("commercial_detail",{target_tenant:tenant.id,target_id:id,source_kind:"quote"});if(current.error||!current.data)throw new Error("Je toegang is gewijzigd. De offerte is niet verzonden.");};
  await confirmAccess();
  const attach=await admin.from("quotes").update({pdf_path:pdfPath,logo_path:logoPath}).eq("tenant_id",tenant.id).eq("id",id);if(attach.error)throw new Error("Het document kon niet aan de offerte worden gekoppeld.");
  const token=createHmac("sha256",env.ADMIN_API_SECRET).update(`fieldgrid:quote:v1:${tenant.id}:${id}:${recipient}`).digest("base64url");const tokenHash=createHash("sha256").update(token).digest("hex");
  const tokenWrite=await admin.from("external_action_tokens").upsert({tenant_id:tenant.id,purpose:"quote_acceptance",subject_id:id,token_hash:tokenHash,expires_at:q.expires_at,recipient},{onConflict:"token_hash",ignoreDuplicates:true});if(tokenWrite.error)throw new Error("De beveiligde offertelink kon niet worden vastgelegd.");
  const url=tenantAppUrl(tenant.slug,`/quote/${token}`);
  let draft:MailSnapshot;
  if(saved.success)draft=saved.data;
  else {
  const domains=await admin.from("tenant_domains").select("host").eq("tenant_id",tenant.id).not("verified_at","is",null);
  const senderDomain=snapshot.brand.sender_email?.split("@")[1]?.toLowerCase();
  const fromEmail=senderDomain&&domains.data?.some(d=>d.host.toLowerCase()===senderDomain)?snapshot.brand.sender_email!:env.SENDGRID_FROM_EMAIL;
  const template=await resolveMailTemplate(admin,tenant.id,reminder?"quote.reminder":"quote.available","customer");
  const values={bedrijfsnaam:snapshot.brand.name,klantnaam:snapshot.contact.name,offertelink:url};
  const message={subject:template.title,body:template.body};const plain=renderPlainEmail({...message,values,targetUrl:url,targetLabel:template.cta_label||"Offerte bekijken"});
  const html=renderTenantEmailHtml({kind:"quote",brand:await withTenantEmailBrand(tenant.id, {company:snapshot.brand.name,domain:new URL(tenantAppUrl(tenant.slug)).hostname,primary:snapshot.brand.primary,accent:snapshot.brand.accent,senderEmail:fromEmail,emailLogoUrl:logoPath?tenantAppUrl(tenant.slug,`/api/files/commercial/${id}?token=${token}&asset=logo`):null}),message,values,targetUrl:url,targetLabel:template.cta_label,allowLocalLinks:env.DEPLOY_TARGET==="local"});
  draft={fromEmail,fromName:snapshot.brand.sender_name||snapshot.brand.name,to:recipient,subject:plain.subject,text:plain.text,html,targetUrl:url,templateRevision:template.revision,templateVersionId:template.version_id,templateBaseVersionId:template.base_version_id,attachmentPath:pdfPath,attachmentFilename:`${q.quote_number}-v${q.revision}.pdf`};
  }
  await confirmAccess();
  const claimed=await admin.rpc("commercial_quote_mail_claim",{target_tenant:tenant.id,target_quote:id,command_id:commandId,reminder});
  if(claimed.error||!claimed.data)throw new Error(claimed.error?.code==="23514"?claimed.error.message:"Verzending kon niet worden geregistreerd.");const claim=claimed.data as {id:string;send:boolean;status?:string};if(!claim.send){if(claim.status==="sent")return{ok:true};throw new Error("Deze offerte wordt al verzonden of de ontvangst door de provider is onzeker.");}
  beforeProviderFailure=async()=>{await admin.from("mail_deliveries").update({status:"failed",locked_until:null,last_error:"De voorbereiding is niet voltooid; er is nog geen verzending gestart."}).eq("tenant_id",tenant.id).eq("id",claim.id).eq("status","processing");};
  const frozen=await freezeMailSnapshot(admin,tenant.id,claim.id,draft);
  if(!frozen.attachmentPath)throw new Error("Het vaste offertedocument is niet beschikbaar.");
  const attachment=await readMailAttachment(tenant.id,claim.id,frozen.attachmentPath);
  const log=await admin.from("mail_deliveries").update({branding_snapshot:q.snapshot}).eq("id",claim.id);if(log.error)throw new Error("Verzending is gepauzeerd omdat de documentregistratie niet kon worden opgeslagen.");
  await confirmAccess();
  let sent:{id:string};try{providerStarted=true;sent=await sendEmail({...frozen,attachment,deliveryKey,disableTracking:true,policy:{kind:"notification",tenantId:tenant.id,type:reminder?"quote.reminder":"quote.available",context:"customer",sourceId:claim.id}});}catch(e){
   if(await deferNotificationMail(e,tenant.id,claim.id,reminder?"quote.reminder":"quote.available","customer",user.id))throw new Error("De offertemail is klaargezet na de persoonlijke rusttijden. Er is nog niets verzonden.");
   const status=mailFailureOutcome(e);
   await admin.from("mail_deliveries").update({status,last_error:mailFailureMessage(status),locked_until:null}).eq("tenant_id",tenant.id).eq("id",claim.id).eq("status","processing");
   throw new Error(mailFailureMessage(status));
  }
  const finished=await admin.rpc("commercial_quote_mail_finish",{target_tenant:tenant.id,delivery_id:claim.id,message_id:sent.id,actor:user.id});if(finished.error)throw new Error("De provider heeft de e-mail aangenomen, maar de status kon niet worden opgeslagen. Niet opnieuw verzenden zonder controle.");
  revalidatePath("/app","layout");return{ok:true};
 }catch(e){if(!providerStarted&&beforeProviderFailure)await beforeProviderFailure();return{ok:false,error:e instanceof Error?e.message:"Verzenden is niet gelukt."};}
}

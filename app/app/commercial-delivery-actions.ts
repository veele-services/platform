"use server";
import {createHash,createHmac,randomUUID} from "node:crypto";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {getObjectActor} from "@/lib/objects/auth";
import {getServerEnv} from "@/lib/env/server";
import {tenantAppUrl} from "@/lib/tenancy/hostname";
import {sendEmail,SendGridDeliveryError} from "@/lib/providers/sendgrid";
import {renderTenantEmailHtml} from "@/lib/communications/email";
import {renderPlainEmail} from "@/lib/communications/templates";
import {renderQuotePdf} from "@/lib/pdf/quote";
import {customerDocumentExtension,validateDossierDocumentName,CUSTOMER_DOCUMENT_MAX_BYTES} from "@/lib/customers/documents";
import type {ActionResult} from "@/lib/actions/result";
import type {CommercialDetail,QuoteSnapshot} from "@/lib/commercial/model";
import {localToInstant} from "@/lib/planning/time";

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
  const upload=await admin.storage.from("commercial-documents").upload(path,bytes,{contentType:file.type,upsert:false});
  if(upload.error){const exists=await admin.storage.from("commercial-documents").download(path);if(exists.error)throw new Error("Het bestand kon niet worden opgeslagen.");}
  const inserted=await admin.from("commercial_attachments").insert({id:randomUUID(),tenant_id:tenant.id,request_id:kind==="request"?id:null,quote_id:kind==="quote"?id:null,title,storage_path:path,mime_type:file.type,size_bytes:file.size,sha256:hash,public_in_offer:kind==="quote"&&form.get("public")==="true",created_by:user.id});
  if(inserted.error){const replay=await admin.from("commercial_attachments").select("id").eq("tenant_id",tenant.id).eq("storage_path",path).maybeSingle();if(!replay.data)throw new Error("De bijlage is niet gekoppeld. Een aangeboden offerteversie kan niet meer worden gewijzigd.");}
  revalidatePath("/app","layout");return{ok:true};
 }catch(e){return{ok:false,error:e instanceof Error?e.message:"Bijlage niet opgeslagen."};}
}

export async function sendCommercialQuote(id:string,commandId:string,reminder=false):Promise<ActionResult>{
 try{
  z.uuid().parse(id);z.uuid().parse(commandId);const {db,admin,tenant,user}=await getObjectActor();const env=getServerEnv();
  if(!env.SENDGRID_API_KEY||!env.SENDGRID_FROM_EMAIL||!env.ADMIN_API_SECRET)throw new Error("E-mailverzending is niet beschikbaar. Vraag de platformbeheerder om de configuratie te controleren.");
  const access=await db.rpc("commercial_detail",{target_tenant:tenant.id,target_id:id,source_kind:"quote"});if(access.error)throw new Error("Geen toegang tot deze offerte.");
  const detail=access.data as unknown as CommercialDetail;let q=detail.record;if(!("quote_number"in q))throw new Error("Offerte niet gevonden.");
  if(q.status==="draft"&&!reminder){const published=await db.rpc("commercial_command",{target_tenant:tenant.id,command_id:commandId,command:"publish",input:{id,version:q.version}});if(published.error)throw new Error(published.error.code==="23514"?published.error.message:"De offerte is gewijzigd. Herlaad en controleer de versie.");}
  const current=await admin.from("quotes").select("*").eq("tenant_id",tenant.id).eq("id",id).single();if(current.error)throw new Error("De offerte kon niet worden opgehaald.");q=current.data;
  if(q.status!=="awaiting_acceptance"||q.archived_at||q.superseded_at||!q.expires_at||Date.parse(q.expires_at)<=Date.now()||!q.published_at)throw new Error("Alleen een actuele, openstaande offerte kan worden verzonden. Maak voor een historische prijsopgave een nieuwe versie.");
  const snapshot=q.snapshot as unknown as QuoteSnapshot;const recipient=z.email().parse(snapshot.contact.email);const deliveryKey=reminder?`commercial-reminder-${id}-${commandId}`:`commercial-quote-${id}`;
  const previous=await admin.from("mail_deliveries").select("status,last_error").eq("tenant_id",tenant.id).eq("idempotency_key",deliveryKey).maybeSingle();
  if(previous.error)throw new Error("De verzendstatus kon niet worden gecontroleerd.");
  if(previous.data?.status==="sent")return{ok:true};
  if(previous.data?.status==="processing")throw new Error("Deze verzending is nog bezig of de providerbevestiging is onzeker. Controleer de verzendregistratie vóór opnieuw verzenden.");
  const bucket=admin.storage.from("commercial-documents");let logo:Uint8Array|undefined;let logoPath=q.logo_path;
  if(snapshot.brand.logo_source){
   logoPath=logoPath||`${tenant.id}/quote/${id}/logo.${snapshot.brand.logo_source.split('.').at(-1)}`;
   const existingLogo=await bucket.download(logoPath);if(existingLogo.data)logo=new Uint8Array(await existingLogo.data.arrayBuffer());else{
    const source=await admin.storage.from("branding").download(snapshot.brand.logo_source);if(source.error)throw new Error("Het logo voor deze aangeboden versie is niet beschikbaar.");logo=new Uint8Array(await source.data.arrayBuffer());
    const stored=await bucket.upload(logoPath,logo,{contentType:source.data.type,upsert:false});if(stored.error){const raced=await bucket.download(logoPath);if(raced.error)throw new Error("Huisstijl kon niet worden vastgelegd.");logo=new Uint8Array(await raced.data.arrayBuffer());}
   }
  }
  const pdfPath=q.pdf_path||`${tenant.id}/quote/${id}/offerte.pdf`;const storedPdf=await bucket.download(pdfPath);let pdf:Uint8Array;
  if(storedPdf.data)pdf=new Uint8Array(await storedPdf.data.arrayBuffer());else{pdf=await renderQuotePdf(snapshot,logo);const upload=await bucket.upload(pdfPath,pdf,{contentType:"application/pdf",upsert:false});if(upload.error){const raced=await bucket.download(pdfPath);if(raced.error)throw new Error("Offertedocument kon niet worden opgeslagen.");pdf=new Uint8Array(await raced.data.arrayBuffer());}}
  const attach=await admin.from("quotes").update({pdf_path:pdfPath,logo_path:logoPath}).eq("tenant_id",tenant.id).eq("id",id);if(attach.error)throw new Error("Het document kon niet aan de offerte worden gekoppeld.");
  const token=createHmac("sha256",env.ADMIN_API_SECRET).update(`fieldgrid:quote:v1:${tenant.id}:${id}:${recipient}`).digest("base64url");const tokenHash=createHash("sha256").update(token).digest("hex");
  const tokenWrite=await admin.from("external_action_tokens").upsert({tenant_id:tenant.id,purpose:"quote_acceptance",subject_id:id,token_hash:tokenHash,expires_at:q.expires_at,recipient},{onConflict:"token_hash",ignoreDuplicates:true});if(tokenWrite.error)throw new Error("De beveiligde offertelink kon niet worden vastgelegd.");
  const url=tenantAppUrl(tenant.slug,`/quote/${token}`);
  const domains=await admin.from("tenant_domains").select("host").eq("tenant_id",tenant.id).not("verified_at","is",null);
  const senderDomain=snapshot.brand.sender_email?.split("@")[1]?.toLowerCase();
  const fromEmail=senderDomain&&domains.data?.some(d=>d.host.toLowerCase()===senderDomain)?snapshot.brand.sender_email!:env.SENDGRID_FROM_EMAIL;
  const template=await admin.from("tenant_message_templates").select("subject,body,revision").eq("tenant_id",tenant.id).eq("template_key","quote").single();if(template.error)throw new Error("De offertemailtemplate is niet beschikbaar.");
  const values={bedrijfsnaam:snapshot.brand.name,klantnaam:snapshot.contact.name,offertelink:url};
  const message={subject:`${reminder?"Herinnering: ":""}${template.data.subject}`,body:template.data.body};const plain=renderPlainEmail({...message,values,targetUrl:url,targetLabel:"Offerte bekijken"});
  const html=renderTenantEmailHtml({kind:"quote",brand:{company:snapshot.brand.name,domain:new URL(tenantAppUrl(tenant.slug)).hostname,primary:snapshot.brand.primary,accent:snapshot.brand.accent,senderEmail:fromEmail,emailLogoUrl:logoPath?tenantAppUrl(tenant.slug,`/api/files/commercial/${id}?token=${token}&asset=logo`):null},message,values,targetUrl:url,allowLocalLinks:env.DEPLOY_TARGET==="local"});
  const claimed=await admin.rpc("commercial_quote_mail_claim",{target_tenant:tenant.id,target_quote:id,command_id:commandId,reminder});
  if(claimed.error||!claimed.data)throw new Error(claimed.error?.code==="23514"?claimed.error.message:"Verzending kon niet worden geregistreerd.");const claim=claimed.data as {id:string;send:boolean;status?:string};if(!claim.send){if(claim.status==="sent")return{ok:true};throw new Error("Deze offerte wordt al verzonden of de ontvangst door de provider is onzeker.");}
  const log=await admin.from("mail_deliveries").update({template_revision:template.data.revision,render_snapshot:{quote_id:id,request_id:q.request_id,revision:q.revision,pdf_path:pdfPath,subject:plain.subject},branding_snapshot:q.snapshot}).eq("id",claim.id);if(log.error)throw new Error("Verzending is gepauzeerd omdat de documentregistratie niet kon worden opgeslagen.");
  let sent:{id:string};try{sent=await sendEmail({fromEmail,fromName:snapshot.brand.sender_name||snapshot.brand.name,to:recipient,subject:plain.subject,text:plain.text,html,attachment:{filename:`${q.quote_number}-v${q.revision}.pdf`,bytes:pdf},deliveryKey,disableTracking:true});}catch(e){
   const safeRetry=e instanceof SendGridDeliveryError&&e.httpStatus>=400&&e.httpStatus<500;
   await admin.from("mail_deliveries").update({status:safeRetry?"failed":"processing",last_error:safeRetry?"Provider heeft verzending geweigerd; opnieuw proberen is mogelijk.":"Providerbevestiging onzeker; controleer vóór opnieuw verzenden.",locked_until:null}).eq("id",claim.id);
   throw new Error(safeRetry?"De e-mailprovider heeft de verzending geweigerd. Je kunt veilig opnieuw proberen.":"De ontvangst door de e-mailprovider is onzeker. Laat de verzendregistratie controleren; er wordt niet automatisch nogmaals verzonden.");
  }
  const saved=await admin.rpc("commercial_quote_mail_finish",{target_tenant:tenant.id,delivery_id:claim.id,message_id:sent.id,actor:user.id});if(saved.error)throw new Error("De provider heeft de e-mail aangenomen, maar de status kon niet worden opgeslagen. Niet opnieuw verzenden zonder controle.");
  revalidatePath("/app","layout");return{ok:true};
 }catch(e){return{ok:false,error:e instanceof Error?e.message:"Verzenden is niet gelukt."};}
}

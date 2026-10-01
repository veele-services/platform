"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadScannedFile } from "@/lib/files/scanned-storage";
import type { Json } from "@/lib/database.types";
import type { ActionResult } from "@/lib/actions/result";
import { canReadDossier, recordKinds, validateDossierInput, recordDeadline, privacyText, type RecordKind } from "@/lib/personnel/dossier";
import type { DossierTable } from "@/lib/personnel/dossier-data";
import { customerDocumentExtension, customerDocumentFileName } from "@/lib/customers/documents";

async function authorize(personnelId: string) {
 z.string().uuid().parse(personnelId);
 const context=await getAuthContext();
 if(!context.tenant || !canReadDossier(context.tenant.roles)||!context.tenant.enabledServices.includes("personeel")) throw new Error("Je hebt geen toegang tot dit personeelsdossier.");
 const db=await createClient();
 const {data:person,error}=await db.from("personnel").select("id,user_id,version,full_name,email,phone,employee_number").eq("tenant_id",context.tenant.id).eq("id",personnelId).single();
 if(error||!person) throw new Error("Medewerker niet gevonden.");
 return {context,tenant:context.tenant,db,person};
}
function failure(error:unknown):{ok:false;error:string} {
 if(error instanceof z.ZodError) return {ok:false,error:"Controleer de ingevulde velden en datums."};
 if(error instanceof Error) return {ok:false,error:error.message};
 return {ok:false,error:"Opslaan is niet gelukt. Vernieuw het dossier en probeer opnieuw."};
}
function refresh(id:string) { revalidatePath(`/app/personeel/${id}`);revalidatePath("/app/personeel"); }

export async function prepareDossierChecklist(personnelId:string,type:"onboarding"|"offboarding"):Promise<ActionResult> {
 try{
  z.enum(["onboarding","offboarding"]).parse(type);const {db,tenant,person}=await authorize(personnelId);
  const {error}=await db.rpc("prepare_personnel_checklist",{target_tenant:tenant.id,target_personnel:person.id,checklist_type:type});
  if(error)throw new Error("Checklist kon niet worden klaargezet.");refresh(person.id);return {ok:true};
 }catch(error){return failure(error);}
}

export async function saveDossierRecord(form:FormData):Promise<ActionResult<{id:string}>> {
 try {
  const input=z.object({personnelId:z.string().uuid(),kind:z.enum(recordKinds),id:z.string().uuid(),revision:z.coerce.number().int().min(0),status:z.string(),previousId:z.string().uuid().or(z.literal("")),values:z.string().max(50000)}).parse(Object.fromEntries(form));
  const {db,tenant,person}=await authorize(input.personnelId);
  const data=validateDossierInput(input.kind,JSON.parse(input.values),input.status);
  for(const key of ["ownerId","managerId"]) if(data[key]) {
   const {data:member}=await db.from("tenant_memberships").select("roles").eq("tenant_id",tenant.id).eq("user_id",String(data[key])).eq("status","active").maybeSingle();
   if(!member || (key==="ownerId"&&!canReadDossier(member.roles))) throw new Error("Selecteer een actieve verantwoordelijke binnen jouw organisatie.");
  }
  if(data.functionId) {const {data:fn}=await db.from("function_catalog").select("id").eq("tenant_id",tenant.id).eq("id",String(data.functionId)).maybeSingle();if(!fn)throw new Error("Functie niet gevonden.");}
  if(input.kind==="certificate") {const {data:type}=await db.from("qualification_types").select("id,active").eq("tenant_id",tenant.id).eq("code",String(data.code)).maybeSingle();if(!type||(!type.active&&!input.revision))throw new Error("Kies een actief type uit de kwalificatiecatalogus.");if(input.revision===0&&input.status==="approved")throw new Error("Bewaar een nieuw bewijs eerst ongecontroleerd. Keur het daarna afzonderlijk goed.");}
  if(data.relatedId) {
   const checks=await Promise.all(["personnel_contracts","certificates","personnel_notes","personnel_dossier_items"].map(t=>db.from(t as DossierTable).select("id").eq("tenant_id",tenant.id).eq("personnel_id",person.id).eq("id",String(data.relatedId)).maybeSingle()));
   if(!checks.some(r=>r.data))throw new Error("De gerelateerde registratie hoort niet bij deze medewerker.");
  }
  const common={id:input.id,tenant_id:tenant.id,personnel_id:person.id,dossier_data:data as Json,dossier_managed:true,dossier_status:input.status,previous_id:input.previousId||null};
  const save = async (name:DossierTable,payload:Record<string,unknown>) => {
   // Typed table-specific values are assembled below; the whitelist never comes from the client.
   const query=input.revision ? db.from(name).update(payload as never).eq("tenant_id",tenant.id).eq("personnel_id",person.id).eq("id",input.id).eq("dossier_revision",input.revision).select("id") : db.from(name).insert(payload as never).select("id");
   const result=await query.maybeSingle();
   if(result.error) throw new Error(result.error.code==="23505"?"Deze registratie bestaat al. Vernieuw het dossier.":result.error.code==="23514"?"Controleer de datums, documentkoppelingen en toegestane gegevens.":"Opslaan is niet gelukt; controleer je gegevens en toegang.");
   if(!result.data) throw new Error("Deze registratie is intussen gewijzigd. Vernieuw het dossier en probeer opnieuw.");
  };
  if(input.kind==="contract") await save("personnel_contracts",{...common,starts_on:data.startsOn||new Date().toISOString().slice(0,10),ends_on:data.endsOn||null,review_on:data.reviewOn||null,employment_type:data.employmentType||"fixed",hours_per_week:data.hours?Number(data.hours):null,function_id:data.functionId||null,active:input.status==="active"});
  else if(input.kind==="certificate") await save("certificates",{...common,code:data.code,name:data.title,issued_on:data.issuedOn||null,valid_from:data.startsOn||null,expires_on:data.endsOn||null});
  else if(input.kind==="note") await save("personnel_notes",{...common,body:data.body||"Concept",...(input.revision?{}:{created_by:(await getAuthContext()).user.id})});
  else await save("personnel_dossier_items",{...common,kind:input.kind,title:data.title||({profile:"Persoonsgegevens",absence:"Verzuimproces",vog:"VOG-controle"} as Partial<Record<RecordKind,string>>)[input.kind]||"Concept",due_on:recordDeadline(input.kind,data),owner_user_id:data.ownerId||null});
  refresh(person.id);return {ok:true,id:input.id};
 }catch(error){return failure(error);}
}

export async function uploadDossierDocument(form:FormData):Promise<ActionResult> {
 try {
  const input=z.object({personnelId:z.string().uuid(),title:z.string().trim().min(2).max(160),category:z.enum(["contract","addendum","certificate","review","training","instruction","asset","notice"]),previousId:z.string().uuid().or(z.literal("")),relatedId:z.string().uuid().or(z.literal("")).default(""),documentDate:z.string().date().or(z.literal("")),expiresOn:z.string().date().or(z.literal("")).default(""),retention:z.string().max(500),privacyConfirmed:z.literal("on")}).parse(Object.fromEntries(form));
  const {db,tenant,context,person}=await authorize(input.personnelId);
  const file=form.get("document");if(!(file instanceof File)||!file.size)throw new Error("Selecteer een bestand.");
  privacyText(`${input.title} ${file.name}`);if(/\bVOG\b|verklaring.omtrent.gedrag|medisch|paspoort/i.test(`${input.title} ${file.name}`))throw new Error("VOG, identiteitskopieën en medische bestanden horen niet in dit dossier.");
  const bytes=new Uint8Array(await file.arrayBuffer());const extension=customerDocumentExtension(file.type,bytes);
  let version=1;
  if(input.previousId){const {data:previous}=await db.from("personnel_documents").select("version").eq("tenant_id",tenant.id).eq("personnel_id",person.id).eq("id",input.previousId).single();if(!previous)throw new Error("Vorige versie niet gevonden.");version=previous.version+1;}
  const path=`${tenant.id}/${person.id}/${randomBytes(16).toString("hex")}.${extension}`;
  const bucket=createAdminClient().storage.from("personnel-documents");
  await uploadScannedFile(db,"personnel-documents",path,bytes,file.type);
  const {data:document,error}=await db.from("personnel_documents").insert({tenant_id:tenant.id,personnel_id:person.id,title:input.title,document_type:input.category,storage_path:path,file_name:customerDocumentFileName(file.name),mime_type:file.type,size_bytes:file.size,sha256:createHash("sha256").update(bytes).digest("hex"),created_by:context.user.id,version,previous_id:input.previousId||null,dossier_managed:true,dossier_status:"stored",visible_to_employee:false,dossier_data:{documentDate:input.documentDate,expiresOn:input.expiresOn,retention:input.retention||"Nog te beoordelen",classification:"Vertrouwelijk HR",malwareScan:"Gecontroleerd met ClamAV"}}).select("id").single();
  if(error){await bucket.remove([path]);throw new Error("Documentregistratie is niet gelukt.");}
  if(input.relatedId){
   const {data:contract}=await db.from("personnel_contracts").select("dossier_data,dossier_revision").eq("tenant_id",tenant.id).eq("personnel_id",person.id).eq("id",input.relatedId).single();
   const values=(contract?.dossier_data??{}) as Record<string,Json>;const ids=Array.isArray(values.document_ids)?values.document_ids:[];
   const linked=contract?await db.from("personnel_contracts").update({dossier_managed:true,dossier_data:{...values,document_ids:[...ids,document.id]}}).eq("tenant_id",tenant.id).eq("personnel_id",person.id).eq("id",input.relatedId).eq("dossier_revision",contract.dossier_revision).select("id").maybeSingle():null;
   if(!linked?.data){refresh(person.id);throw new Error("Document opgeslagen. De overeenkomst is gewijzigd; koppel het document via Bewerken.");}
  }
  refresh(person.id);return {ok:true};
 }catch(error){return failure(error);}
}

export async function updateDossierDocument(form:FormData):Promise<ActionResult> {
 try {
  const input=z.object({personnelId:z.string().uuid(),id:z.string().uuid(),revision:z.coerce.number().int().positive(),title:z.string().trim().min(2).max(160),category:z.enum(["contract","addendum","certificate","review","training","instruction","asset","notice"]),documentDate:z.string().date().or(z.literal("")),expiresOn:z.string().date().or(z.literal("")),retention:z.string().max(500)}).parse(Object.fromEntries(form));
  privacyText(input.title);privacyText(input.retention);
  const {db,tenant,person}=await authorize(input.personnelId);
  const {data:document}=await db.from("personnel_documents").select("dossier_data").eq("tenant_id",tenant.id).eq("personnel_id",person.id).eq("id",input.id).eq("dossier_managed",true).single();
  if(!document)throw new Error("Document niet gevonden. Bewaar oudere bestanden eerst als nieuwe HR-documentversie.");
  const {data,error}=await db.from("personnel_documents").update({title:input.title,document_type:input.category,dossier_data:{...(document.dossier_data as Record<string,Json>),documentDate:input.documentDate,expiresOn:input.expiresOn,retention:input.retention}}).eq("tenant_id",tenant.id).eq("personnel_id",person.id).eq("id",input.id).eq("dossier_revision",input.revision).select("id").maybeSingle();
  if(error||!data)throw new Error("Metadata niet opgeslagen. Controleer de gegevens of vernieuw het dossier.");
  refresh(person.id);return {ok:true};
 }catch(error){return failure(error);}
}

export async function saveQualificationCatalog(form:FormData):Promise<ActionResult> {
 try {
  const {db,tenant}=await authorize(String(form.get("personnelId")));
  const input=z.object({code:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_.-]{0,31}$/),name:z.string().trim().min(2).max(160),scope:z.enum(["","function","customer","object","work_order","service"]),subjectId:z.string().uuid().or(z.literal("")),service:z.string().max(100),hard:z.string().optional(),reminderDays:z.string().default("90,60,30,14,7"),active:z.string().optional()}).parse(Object.fromEntries(form));
  if(input.code==="VOG")throw new Error("VOG gebruikt een aparte controleregistratie.");
  const days=String(validateDossierInput("task",{title:"Catalogus",reminderDays:input.reminderDays},"open").reminderDays).split(",").filter(Boolean).map(Number);
  const {error}=await db.from("qualification_types").upsert({tenant_id:tenant.id,code:input.code,name:input.name,reminder_days:days,active:input.active==="on"},{onConflict:"tenant_id,code"});if(error)throw new Error("Het type kon niet worden opgeslagen.");
  if(input.scope){const {error:ruleError}=await db.from("qualification_requirements").insert({tenant_id:tenant.id,code:input.code,scope:input.scope,subject_id:input.subjectId||null,service_name:input.service||null,hard_requirement:input.hard==="on"});if(ruleError)throw new Error("Het type is opgeslagen; controleer de gekozen koppeling voor de eis.");}
  refresh(String(form.get("personnelId")));return {ok:true};
 }catch(error){return failure(error);}
}

export async function dossierRecordHistory(personnelId:string,sourceId:string):Promise<ActionResult<{versions:Json[]}>> {
 try{z.string().uuid().parse(sourceId);const {db,tenant,person}=await authorize(personnelId);const {data,error}=await db.from("personnel_dossier_history").select("snapshot").eq("tenant_id",tenant.id).eq("personnel_id",person.id).eq("source_id",sourceId).order("revision",{ascending:false});if(error)throw new Error("Historie niet beschikbaar.");return {ok:true,versions:(data??[]).map(r=>r.snapshot)};}catch(error){return failure(error);}
}

export async function setQualificationRequirementActive(personnelId:string,id:string,active:boolean):Promise<ActionResult> {
 try {
  z.string().uuid().parse(id);z.boolean().parse(active);
  const {db,tenant}=await authorize(personnelId);
  const {data,error}=await db.from("qualification_requirements").update({active}).eq("tenant_id",tenant.id).eq("id",id).select("id").maybeSingle();
  if(error||!data)throw new Error("De eis kon niet worden gewijzigd.");
  refresh(personnelId);revalidatePath("/app/planning");return {ok:true};
 } catch(error) {return failure(error);}
}

export async function updateDossierTaskState(form:FormData):Promise<ActionResult> {
 try{
  const input=z.object({personnelId:z.string().uuid(),id:z.string().uuid(),revision:z.coerce.number().positive(),status:z.enum(["progress","completed"]),evidence:z.string().trim().max(2000)}).parse(Object.fromEntries(form));
  if(input.status==="completed"&&!input.evidence)throw new Error("Beschrijf kort de uitgevoerde opvolging.");privacyText(input.evidence);
  const {db,tenant,person}=await authorize(input.personnelId);
  const {data:record}=await db.from("personnel_dossier_items").select("dossier_data").eq("tenant_id",tenant.id).eq("personnel_id",person.id).eq("id",input.id).in("kind",["task","checklist"]).single();
  if(!record)throw new Error("Taak niet gevonden.");
  const {data,error}=await db.from("personnel_dossier_items").update({dossier_status:input.status,dossier_data:{...(record.dossier_data as Record<string,Json>),evidence:input.evidence}}).eq("tenant_id",tenant.id).eq("personnel_id",person.id).eq("id",input.id).eq("dossier_revision",input.revision).select("id").maybeSingle();
  if(error||!data)throw new Error("De taak is intussen gewijzigd. Vernieuw het overzicht.");
  refresh(person.id);revalidatePath("/app/personeel/acties");return {ok:true};
 }catch(error){return failure(error);}
}

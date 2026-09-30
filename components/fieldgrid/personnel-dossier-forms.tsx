"use client";

import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { X, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { brandThemeStyle } from "@/lib/branding/palette";
import { dossierDefinitions, validateDossierInput, noticeDeadline, type DossierRecord, type DossierValues, type RecordKind } from "@/lib/personnel/dossier";
import type { DossierData } from "@/lib/personnel/dossier-data";
import type { WorkspaceData } from "@/lib/data/workspace";
import { saveDossierRecord, saveQualificationCatalog, uploadDossierDocument, updateDossierDocument } from "@/app/app/personeel/dossier-actions";

type Common = {personnelId:string;primary:string;accent:string;onClose:()=>void};
export function useUnsaved(dirty:boolean) {
 useEffect(()=>{if(!dirty)return;const before=(e:BeforeUnloadEvent)=>{e.preventDefault();};const pop=(e:PopStateEvent)=>{if(!confirm("Je wijzigingen zijn nog niet opgeslagen. Wil je dit scherm verlaten?")){e.stopImmediatePropagation();history.forward();}};window.addEventListener("beforeunload",before);window.addEventListener("popstate",pop,true);return()=>{window.removeEventListener("beforeunload",before);window.removeEventListener("popstate",pop,true);};},[dirty]);
 return ()=>!dirty||confirm("Wijzigingen niet opslaan en sluiten?");
}
function EditorDialog({title,description,children,primary,accent,onClose}:{title:string;description:string;children:ReactNode;primary:string;accent:string;onClose:()=>void}) {
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="dossier-dialog" showCloseButton={false} style={brandThemeStyle(primary,accent)}><header><div><span className="eyebrow">PERSONEELSDOSSIER</span><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div><button className="icon-button" aria-label="Sluiten" onClick={onClose}><X size={20}/></button></header>{children}</DialogContent></Dialog>;
}

export function DossierRecordEditor({kind,record,previousId="",data,workspace,initialValues={},...common}:Common & {kind:RecordKind;record?:DossierRecord;previousId?:string;data:DossierData;workspace:WorkspaceData;initialValues?:DossierValues}) {
 const def=dossierDefinitions[kind];const router=useRouter();
 const [id]=useState(()=>record?.id||crypto.randomUUID());
 const [draftValues,setValues]=useState<DossierValues>(()=>({...Object.fromEntries(def.fields.map(f=>[f.key,f.type==="documents"?[]:f.options?.[0]?.[0]||""])),...initialValues,...record?.data}));
 const [useCatalogDays,setUseCatalogDays]=useState(kind==="certificate"&&!record&&!initialValues.reminderDays);
 const values:DossierValues=useCatalogDays&&draftValues.code?{...draftValues,reminderDays:(data.types.find(t=>t.code===draftValues.code)?.reminder_days??[90,60,30,14,7]).join(",")}:draftValues;
 const [status,setStatus]=useState(record?.status||def.statuses[0][0]);const [step,setStep]=useState(1);const [dirty,setDirty]=useState(false);const [pending,start]=useTransition();const [error,setError]=useState("");const mayClose=useUnsaved(dirty);
 const close=()=>{if(!pending&&mayClose())common.onClose();};
 const update=(key:string,value:DossierValues[string])=>{if(key==="reminderDays")setUseCatalogDays(false);setValues(v=>({...v,[key]:value}));setDirty(true);};
 const save=(asDraft=false)=>start(async()=>{
  const nextStatus=asDraft?"draft":status;setError("");
  try{validateDossierInput(kind,values,nextStatus);}catch(e){setError(e instanceof Error?e.message:"Controleer de gegevens.");return;}
  const form=new FormData();Object.entries({personnelId:common.personnelId,kind,id,revision:String(record?.revision||0),previousId:record?.previousId||previousId,status:nextStatus,values:JSON.stringify(values)}).forEach(([k,v])=>form.set(k,v));
  const result=await saveDossierRecord(form);if(!result.ok){setError(result.error);return;}setDirty(false);toast.success(asDraft?"Concept bewaard":"Dossier bijgewerkt");router.refresh();common.onClose();
 });
 const fields=def.fields.filter(f=>!def.steps||(f.step||1)===step);
 return <EditorDialog {...common} onClose={close} title={`${record?"Bewerk":previousId?"Vervolgregistratie":"Nieuwe registratie"} · ${def.title}`} description="Bewaar alleen noodzakelijke zakelijke gegevens. Wijzigingen blijven terug te vinden in de historie.">
  {def.steps&&<ol className="dossier-steps">{def.steps.map((s,i)=><li key={s} aria-current={step===i+1?"step":undefined} className={step>=i+1?"active":""}><b>{i+1}</b><span>{s}</span></li>)}</ol>}
  <form className="dossier-form" noValidate onSubmit={e=>{e.preventDefault();if(def.steps&&step<def.steps.length)setStep(s=>s+1);else save();}}>
   <div className="dossier-form-fields">
    {kind==="absence"&&<p className="dossier-notice wide"><ShieldCheck/>Alleen procesgegevens. Geen diagnose, oorzaak, behandeling, medische bijlagen of vrije medische toelichting. Termijnen worden handmatig afgestemd met de arbodienst.</p>}
    {kind==="vog"&&<p className="dossier-notice wide">Leg alleen vast dat een passende VOG is gezien. Geen kopie bewaren; een VOG heeft geen algemene vaste verloopdatum.</p>}
    {fields.map(field=>{
     let options=field.options??[];
     if(field.key==="functionId")options=workspace.functions.map(f=>[f.id,f.name]);
     if(field.key==="ownerId")options=data.owners.map(o=>[o.id,o.label]);
     if(field.key==="managerId")options=[...new Map([...data.owners.map(o=>[o.id,o.label] as [string,string]),...workspace.personnel.filter(p=>p.user_id&&p.status==="active").map(p=>[p.user_id!,p.full_name] as [string,string])]).entries()];
     if(field.key==="code")options=data.types.filter(t=>t.active||t.code===record?.data.code).map(t=>[t.code,`${t.code} · ${t.name}`]);
     if(field.key==="relatedId")options=data.records.filter(r=>r.id!==record?.id).map(r=>[r.id,r.title]);
     if(field.type==="documents")return <fieldset key={field.key} className="wide dossier-document-choices"><legend>{field.label}</legend><p>{field.hint}</p>{data.documents.filter(d=>d.dossier_managed).map(d=><label key={d.id}><input type="checkbox" checked={(values.document_ids as string[]??[]).includes(d.id)} onChange={e=>update("document_ids",e.target.checked?[...(values.document_ids as string[]??[]),d.id]:(values.document_ids as string[]??[]).filter(id=>id!==d.id))}/>{d.title} · v{d.version}</label>)}{!data.documents.some(d=>d.dossier_managed)&&<p>Nog geen privédocumenten. Je kunt de registratie als concept bewaren en later bewijs koppelen.</p>}</fieldset>;
     return <label key={field.key} className={field.type==="textarea"?"wide":""}>{field.label}{field.required&&<span aria-hidden="true"> *</span>}
      {field.type==="select"?<select aria-label={field.label} value={String(values[field.key]??"")} disabled={field.key==="code"&&!!record} onChange={e=>update(field.key,e.target.value)}><option value="">Selecteer…</option>{options.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>:field.type==="textarea"?<textarea aria-label={field.label} rows={3} maxLength={6000} value={String(values[field.key]??"")} onChange={e=>update(field.key,e.target.value)}/>:<input aria-label={field.label} type={field.type||"text"} min={field.type==="number"?0:undefined} max={field.type==="number"?168:undefined} step={field.type==="number"?"0.25":undefined} value={String(values[field.key]??"")} onChange={e=>update(field.key,e.target.value)}/>}
      {field.hint&&<small>{field.hint}</small>}
     </label>;
    })}
    {(!def.steps||step===def.steps.length)&&<><label className="wide">Status<select aria-label="Status" value={status} onChange={e=>{setStatus(e.target.value);setDirty(true);}}>{def.statuses.map(([key,label])=><option key={key} value={key} disabled={kind==="certificate"&&!record&&key==="approved"}>{label}</option>)}</select></label>
     {def.steps&&<div className="dossier-review wide"><h3>Controleer de registratie</h3><dl>{def.fields.filter(f=>values[f.key]&&f.type!=="documents").map(f=><div key={f.key}><dt>{f.label}</dt><dd>{f.options?.find(([v])=>v===values[f.key])?.[1]||String(values[f.key])}</dd></div>)}</dl>{kind==="contract"&&<p>{noticeDeadline(values)?`Aanzegdeadline: ${noticeDeadline(values)}. Een reminder is geen schriftelijke aanzegging.`:"Aanzegging: niet automatisch vastgesteld. Controleer toepasselijkheid en cao."}</p>}</div>}
    </>}
    {error&&<p className="auth-message error wide" role="alert">{error}</p>}
   </div>
   <footer><button type="button" className="secondary-button" onClick={step>1?()=>setStep(s=>s-1):close} disabled={pending}><ChevronLeft size={16}/>{step>1?"Vorige":"Annuleren"}</button>
    {def.statuses.some(([key])=>key==="draft")&&<button type="button" className="text-link" disabled={pending} onClick={()=>save(true)}>Concept bewaren</button>}
    {def.steps&&step<def.steps.length?<button key="next-step" type="button" className="primary-button" onClick={()=>setStep(s=>s+1)}>Volgende<ChevronRight size={16}/></button>:<button key="save-record" type="submit" className="primary-button" disabled={pending}>{pending?"Opslaan…":"Opslaan"}</button>}
   </footer>
  </form>
 </EditorDialog>;
}

export function DossierUpload({previous,metadataOnly=false,relatedId="",category="contract",...common}:Common & {previous?:DossierData["documents"][number];metadataOnly?:boolean;relatedId?:string;category?:string}) {
 const metadata=(previous?.dossier_data??{}) as Record<string,string>;
 const [pending,start]=useTransition();const [error,setError]=useState("");const [dirty,setDirty]=useState(false);const mayClose=useUnsaved(dirty);const router=useRouter();
 const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=new FormData(e.currentTarget);form.set("personnelId",common.personnelId);form.set("previousId",previous?.id||"");form.set("relatedId",relatedId);form.set("id",previous?.id||"");form.set("revision",String(previous?.dossier_revision||0));start(async()=>{const result=await (metadataOnly?updateDossierDocument(form):uploadDossierDocument(form));if(!result.ok)setError(result.error);else{setDirty(false);toast.success("Document veilig opgeslagen");router.refresh();common.onClose();}});};
 return <EditorDialog {...common} onClose={()=>{if(!pending&&mayClose())common.onClose();}} title={metadataOnly?"Documentgegevens bewerken":previous?"Nieuwe documentversie":"Document toevoegen"} description="Privé HR-opslag · PDF, JPG of PNG · maximaal 10 MB"><form className="dossier-form" onChange={()=>setDirty(true)} onSubmit={submit}><div className="dossier-form-fields">
  <label>Titel<input name="title" defaultValue={previous?.title} required maxLength={160}/></label><label>Categorie<select aria-label="Categorie" name="category" defaultValue={previous?.document_type||category}>{[["contract","Contract"],["addendum","Addendum"],["certificate","Certificaatbewijs"],["review","Gesprek"],["training","Opleiding"],["instruction","Instructie"],["asset","Middelenbevestiging"],["notice","Schriftelijke aanzegging"]].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
  <label>Documentdatum<input type="date" name="documentDate" defaultValue={metadata.documentDate}/></label><label>Relevante einddatum<input type="date" name="expiresOn" defaultValue={metadata.expiresOn}/></label><label>Bewaarbeleid / beoordelingsmoment<input name="retention" defaultValue={metadata.retention} placeholder="Nog te beoordelen" maxLength={500}/></label>{!metadataOnly&&<label className="wide">Bestand<input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" required/></label>}
  <p className="dossier-notice wide">Geen medische dossiers, VOG-kopieën, identiteitskopieën of geheime codes. Malwarecontrole en digitale ondertekening zijn niet aangesloten. Een upload is geen goedkeuring.</p>
  <label className="dossier-check wide"><input name="privacyConfirmed" type="checkbox" required/>Ik heb gecontroleerd dat het bestand noodzakelijk is en geen uitgesloten inhoud bevat.</label>{error&&<p role="alert" className="auth-message error wide">{error}</p>}
 </div><footer><button type="button" className="secondary-button" disabled={pending} onClick={()=>{if(!pending&&mayClose())common.onClose();}}>Annuleren</button><button className="primary-button" disabled={pending}>{pending?"Opslaan…":"Document opslaan"}</button></footer></form></EditorDialog>;
}

export function QualificationCatalogEditor({workspace,data,...common}:Common & {workspace:WorkspaceData;data:DossierData}) {
 const [selected,setSelected]=useState("");const [scope,setScope]=useState("");const [pending,start]=useTransition();const [error,setError]=useState("");const [dirty,setDirty]=useState(false);const router=useRouter();const mayClose=useUnsaved(dirty);
 const current=data.types.find(t=>t.code===selected);
 const close=()=>{if(!pending&&mayClose())common.onClose();};
 const options=scope==="function"?workspace.functions.map(r=>[r.id,r.name]):scope==="customer"?workspace.customers.map(r=>[r.id,r.name]):scope==="object"?workspace.objects.map(r=>[r.id,r.name]):workspace.workOrders.map(r=>[r.id,r.work_order_number]);
 return <EditorDialog {...common} onClose={close} title="Kwalificatiecatalogus" description="Beheer typen, standaardreminders en werkgerelateerde eisen. Dit zijn geen toegangsrollen.">
  <div className="dossier-form-fields"><label>Bestaand type bewerken<select aria-label="Bestaand type bewerken" value={selected} onChange={e=>{if(mayClose()){setSelected(e.target.value);setScope("");setDirty(false);}}}><option value="">Nieuw kwalificatietype</option>{data.types.map(t=><option key={t.code} value={t.code}>{t.code} · {t.name}{!t.active?" (niet actief)":""}</option>)}</select></label></div>
  <form key={selected} className="dossier-form" onChange={()=>setDirty(true)} onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);form.set("personnelId",common.personnelId);start(async()=>{const result=await saveQualificationCatalog(form);if(!result.ok)setError(result.error);else{setDirty(false);toast.success("Kwalificatietype opgeslagen");router.refresh();common.onClose();}});}}>
   <div className="dossier-form-fields">
    <label>Code<input name="code" pattern="[A-Za-z0-9][A-Za-z0-9_.-]{0,31}" defaultValue={current?.code} readOnly={!!current} required/></label><label>Naam<input name="name" defaultValue={current?.name} required/></label>
    <label>Standaardherinneringen (dagen vooraf)<input aria-label="Standaardherinneringen" name="reminderDays" defaultValue={(current?.reminder_days??[90,60,30,14,7]).join(",")}/><small>Bijvoorbeeld 90,60,30,14,7. Nieuwe bewijzen nemen dit over; bestaande afspraken blijven intact.</small></label>
    <label className="dossier-check"><input name="active" type="checkbox" defaultChecked={current?.active??true}/>Beschikbaar voor nieuwe registraties</label>
    <label>Eis koppelen aan<select aria-label="Eis koppelen aan" name="scope" value={scope} onChange={e=>setScope(e.target.value)}><option value="">Geen nieuwe eis toevoegen</option>{[["function","Functie"],["service","Werkzaamheden / discipline"],["customer","Klant"],["object","Object"],["work_order","Werkbon"]].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label>Registratie<select aria-label="Registratie" name="subjectId" disabled={!scope||scope==="service"} required={!!scope&&scope!=="service"}><option value="">Selecteer…</option>{options.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>{(!scope||scope==="service")&&<input name="subjectId" type="hidden" value=""/>}</label>
    <label>Discipline<input name="service" required={scope==="service"} disabled={scope!=="service"}/>{scope!=="service"&&<input name="service" type="hidden" value=""/>}</label>
    <label className="dossier-check"><input name="hard" type="checkbox" defaultChecked/>Harde eis voor inzet</label>
    <p className="dossier-notice wide">Stel eisen alleen in waar ze werkelijk nodig zijn. Een type uitschakelen verwijdert geen bestaande bewijzen of eisen. Werkgerelateerde eisen kun je afzonderlijk pauzeren op het tabblad Certificaten.</p>
    {error&&<p role="alert" className="auth-message error wide">{error}</p>}
   </div><footer><button type="button" className="secondary-button" onClick={close} disabled={pending}>Annuleren</button><button className="primary-button" disabled={pending}>{pending?"Opslaan…":"Opslaan"}</button></footer>
  </form>
 </EditorDialog>;
}

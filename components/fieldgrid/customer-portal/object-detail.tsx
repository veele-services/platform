"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Building2, Check, ChevronRight, Info, MapPin, Plus } from "lucide-react";
import type { CustomerObject,CustomerVisit } from "@/lib/customer-portal/model";
import { customerDate,customerTime,customerVisitLabel } from "@/lib/customer-portal/presentation";
import { CustomerDialog } from "./dialog";
import { ContentTabs } from "../content-tabs";
import { EmptyState } from "../empty-state";
import { customerObjectTypes } from "./fields";
import {editCustomerObject,type CustomerFormResult} from "./forms";
import {useSourcePortal} from "../portals/context";
import type {CustomerObjectInput} from "@/lib/customer-portal/model";

export function CustomerObjectDetail({object,visits,timezone,tenant,editable,close,edit,request,openVisit,saveInstruction,accountVersion,saveObject}:{
 object:CustomerObject;visits:CustomerVisit[];timezone:string;tenant:string;editable:boolean;close:()=>void;edit:()=>void;request:()=>void;openVisit:(id:string)=>void;
 saveInstruction:(objectId:string,version:number,body:string,id:string)=>Promise<CustomerFormResult&{objectVersion?:number}>;
 accountVersion:number;saveObject:(object:CustomerObjectInput,version:number,id:string)=>Promise<CustomerFormResult>;
}){
 const source=useSourcePortal(),formId=useId();
 const [initial]=useState(()=>({object:editCustomerObject(object),accountVersion}));
 const [contact,setContact]=useState(initial.object.contact),[phone,setPhone]=useState(initial.object.phone);
 const [tab,setTab]=useState("overview"),[body,setBody]=useState(""),[sourceVersion,setSourceVersion]=useState(object.version),[error,setError]=useState(""),[pending,start]=useTransition(),keys=useRef(new Map<string,string>());
 const dirty=!!body.trim()||contact!==initial.object.contact||phone!==initial.object.phone;
 const leave=(action:()=>void)=>{if(!pending&&(!dirty||window.confirm("Je wijzigingen zijn nog niet opgeslagen. Toch verdergaan?")))action();};
 const instructions=<>{object.instructions.map(instruction=><article className="instruction" key={instruction.id}><div className="row"><strong>{instruction.author}</strong><small>{customerDate(instruction.createdAt,timezone)}</small></div><p>{instruction.body}</p><div className="shared-label"><Check/>Gedeeld met planning en uitvoerend team</div></article>)}</>;
 const panel=<div className="card card-pad customer-tab-surface">
  {error&&<p className="form-error" role="alert">{error}</p>}
  {tab==="overview"&&<><div className="object-detail-title"><span className="object-icon"><Building2/></span><div><h3>{object.name}</h3><p>{object.street}, {object.postalCode} {object.city}</p></div><span className="chip green">{object.status==="active"?"Actief":object.status==="paused"?"Gepauzeerd":object.status==="archived"?"Gearchiveerd":"In voorbereiding"}</span></div><div className="details section-gap"><div><small>Type object</small><strong>{customerObjectTypes[object.type]}</strong></div><div><small>Oppervlakte</small><strong>{object.size?`${object.size} m²`:"Niet opgegeven"}</strong></div><div><small>Contactpersoon</small><strong>{object.contact||"Niet opgegeven"}</strong></div><div><small>Telefoonnummer</small><strong>{object.phone||"Niet opgegeven"}</strong></div></div><hr className="divider"/><h3>Onze diensten op deze locatie</h3><div className="service-tags section-gap">{object.services.map(service=><span className="chip green" key={service}>{service}</span>)}{!object.services.length&&<p>Vraag een passende dienst aan.</p>}</div><hr className="divider"/><div className="row"><h3>Vaste instructies</h3>{editable&&<button className="button small" type="button" onClick={()=>setTab("instructions")}><Plus/>Toevoegen</button>}</div>{object.instructions.length?instructions:<EmptyState title="Nog geen vaste instructies" description="Praktische aanwijzingen voor deze locatie verschijnen hier."/>}</>}
  {tab==="instructions"&&<><div className="banner"><Info/><p>Deze instructies gelden voor ieder bezoek en zijn zichtbaar voor de backoffice en het uitvoerende team.</p></div>{instructions}{editable&&<form onSubmit={event=>{event.preventDefault();const key=JSON.stringify({body:body.trim(),version:sourceVersion});let id=keys.current.get(key);if(!id){id=crypto.randomUUID();keys.current.set(key,id);}
   start(async()=>{try{const result=await saveInstruction(object.id,sourceVersion,body.trim(),id);if(!result.ok){setError(result.error);return;}if(result.objectVersion)setSourceVersion(result.objectVersion);setBody("");setError("");}catch{setError("Opslaan kon niet worden bevestigd. Probeer dezelfde instructie opnieuw.");}});
  }}><label className="field"><span>Vaste instructie toevoegen</span><textarea name="instruction" rows={4} required minLength={2} maxLength={10000} value={body} disabled={pending} onChange={event=>setBody(event.target.value)}/></label><small className="meta">Gebruik deze plek voor werkinstructies; deel toegangscodes via je accountmanager.</small><div className="section-gap"><button className="button primary" disabled={pending}>{pending?"Opslaan…":"Instructie opslaan"}</button></div></form>}</>}
  {tab==="visits"&&<>{visits.filter(visit=>visit.objectId===object.id).map(visit=><button className="ticket-row" type="button" key={visit.id} onClick={()=>leave(()=>openVisit(visit.id))}><div><strong>{customerDate(visit.start,timezone,true)} · {customerTime(visit.start,timezone)}</strong><p>{visit.service}</p></div><span className="chip green">{customerVisitLabel(visit)}</span><ChevronRight/></button>)}{!visits.some(visit=>visit.objectId===object.id)&&<EmptyState title="Nog geen afspraken" description="Vraag een dienst aan voor deze locatie."><button className="button primary" type="button" onClick={()=>leave(request)}>Dienst aanvragen</button></EmptyState>}</>}
 </div>;
 const advanced=<ContentTabs label="Objectgegevens" value={tab} onValueChange={setTab} tabs={[["overview","Overzicht"],["instructions","Vaste instructies"],["visits","Afspraken"]].map(([id,title])=>({id,title,content:tab===id?panel:null}))}/>;
 if(source)return <CustomerDialog guideKey="feature.customer-object" title={object.name} kicker={`${object.number} · OBJECT`} close={close} busy={pending} dirty={dirty}
  footer={editable?<button className="primary-button" type="submit" form={formId} disabled={pending}>{pending?"Opslaan…":"Object opslaan"}</button>:<button className="secondary-button" type="button" onClick={close}>Sluiten</button>}>
  {error&&<p className="form-error" role="alert">{error}</p>}
  <form id={formId} className="portal-demo-form" onSubmit={event=>{event.preventDefault();if(!editable||pending)return;
   const input={...initial.object,contact:contact.trim(),phone:phone.trim(),instruction:body.trim()},key=JSON.stringify({input,version:initial.accountVersion});let id=keys.current.get(key);if(!id){id=crypto.randomUUID();keys.current.set(key,id);}
   start(async()=>{try{const result=await saveObject(input,initial.accountVersion,id);if(!result.ok){setError(result.error);return;}close();}catch{setError("Opslaan kon niet worden bevestigd. Je invoer blijft bewaard; probeer dezelfde wijzigingen opnieuw.");}});
  }}>
   <p><MapPin size={15}/> {object.street}, {object.postalCode} {object.city}</p>
   <div className="portal-demo-two"><label className="mc-field"><span>Contactpersoon</span><input required maxLength={180} value={contact} disabled={!editable||pending} onChange={event=>setContact(event.target.value)}/></label><label className="mc-field"><span>Telefoonnummer</span><input required type="tel" minLength={5} maxLength={40} value={phone} disabled={!editable||pending} onChange={event=>setPhone(event.target.value)}/></label></div>
   <label className="mc-field"><span>Vaste instructies</span><textarea rows={5} maxLength={10000} value={body} disabled={!editable||pending} placeholder="Voeg een vaste instructie toe. Eerdere instructies blijven in de historie staan." onChange={event=>setBody(event.target.value)}/></label>
   <div className="portal-demo-info"><Info/><p>Vaste instructies gelden voor dit object. Instructies voor één bezoek voeg je toe bij de afspraak. Nieuwe instructies worden toegevoegd aan de bestaande historie.</p></div>
  </form>
  <details className="sites-native-controls"><summary>Objectdossier en instructiehistorie</summary><div className="row section-gap">{editable&&<button className="secondary-button" type="button" disabled={pending} onClick={()=>leave(edit)}>Object wijzigen</button>}<button className="secondary-button" type="button" disabled={pending} onClick={()=>leave(request)}>Dienst aanvragen</button></div>{advanced}</details>
 </CustomerDialog>;
 return <CustomerDialog guideKey="feature.customer-object" title={object.name} kicker={`${tenant} · Klantportaal`} close={close} busy={pending} dirty={dirty}
  footer={<>{editable&&<button className="button" type="button" disabled={pending} onClick={()=>leave(edit)}>Object wijzigen</button>}<button className="button primary" type="button" onClick={()=>leave(request)} disabled={pending}><Plus/>Dienst aanvragen</button></>}>
  {advanced}
 </CustomerDialog>;
}

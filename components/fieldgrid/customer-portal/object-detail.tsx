"use client";

import { useRef, useState, useTransition } from "react";
import { Building2, Check, ChevronRight, Info, Plus } from "lucide-react";
import type { CustomerObject,CustomerVisit } from "@/lib/customer-portal/model";
import { customerDate,customerTime,customerVisitLabel } from "@/lib/customer-portal/presentation";
import { CustomerDialog } from "./dialog";
import { ContentTabs } from "../content-tabs";
import { EmptyState } from "../empty-state";
import { customerObjectTypes } from "./fields";
import type { CustomerFormResult } from "./forms";

export function CustomerObjectDetail({object,visits,timezone,tenant,editable,close,edit,request,openVisit,saveInstruction}:{
 object:CustomerObject;visits:CustomerVisit[];timezone:string;tenant:string;editable:boolean;close:()=>void;edit:()=>void;request:()=>void;openVisit:(id:string)=>void;
 saveInstruction:(objectId:string,version:number,body:string,id:string)=>Promise<CustomerFormResult&{objectVersion?:number}>;
}){
 const [tab,setTab]=useState("overview"),[body,setBody]=useState(""),[sourceVersion,setSourceVersion]=useState(object.version),[error,setError]=useState(""),[pending,start]=useTransition(),keys=useRef(new Map<string,string>());
 const leave=(action:()=>void)=>{if(!pending&&(!body.trim()||window.confirm("Je instructie is nog niet opgeslagen. Toch verdergaan?")))action();};
 const instructions=<>{object.instructions.map(instruction=><article className="instruction" key={instruction.id}><div className="row"><strong>{instruction.author}</strong><small>{customerDate(instruction.createdAt,timezone)}</small></div><p>{instruction.body}</p><div className="shared-label"><Check/>Gedeeld met planning en uitvoerend team</div></article>)}</>;
 const panel=<div className="card card-pad customer-tab-surface">
  {error&&<p className="form-error" role="alert">{error}</p>}
  {tab==="overview"&&<><div className="object-detail-title"><span className="object-icon"><Building2/></span><div><h3>{object.name}</h3><p>{object.street}, {object.postalCode} {object.city}</p></div><span className="chip green">{object.status==="active"?"Actief":object.status==="paused"?"Gepauzeerd":object.status==="archived"?"Gearchiveerd":"In voorbereiding"}</span></div><div className="details section-gap"><div><small>Type object</small><strong>{customerObjectTypes[object.type]}</strong></div><div><small>Oppervlakte</small><strong>{object.size?`${object.size} m²`:"Niet opgegeven"}</strong></div><div><small>Contactpersoon</small><strong>{object.contact||"Niet opgegeven"}</strong></div><div><small>Telefoonnummer</small><strong>{object.phone||"Niet opgegeven"}</strong></div></div><hr className="divider"/><h3>Onze diensten op deze locatie</h3><div className="service-tags section-gap">{object.services.map(service=><span className="chip green" key={service}>{service}</span>)}{!object.services.length&&<p>Vraag een passende dienst aan.</p>}</div><hr className="divider"/><div className="row"><h3>Vaste instructies</h3>{editable&&<button className="button small" type="button" onClick={()=>setTab("instructions")}><Plus/>Toevoegen</button>}</div>{object.instructions.length?instructions:<EmptyState title="Nog geen vaste instructies" description="Praktische aanwijzingen voor deze locatie verschijnen hier."/>}</>}
  {tab==="instructions"&&<><div className="banner"><Info/><p>Deze instructies gelden voor ieder bezoek en zijn zichtbaar voor de backoffice en het uitvoerende team.</p></div>{instructions}{editable&&<form onSubmit={event=>{event.preventDefault();const key=JSON.stringify({body:body.trim(),version:sourceVersion});let id=keys.current.get(key);if(!id){id=crypto.randomUUID();keys.current.set(key,id);}
   start(async()=>{try{const result=await saveInstruction(object.id,sourceVersion,body.trim(),id);if(!result.ok){setError(result.error);return;}if(result.objectVersion)setSourceVersion(result.objectVersion);setBody("");setError("");}catch{setError("Opslaan kon niet worden bevestigd. Probeer dezelfde instructie opnieuw.");}});
  }}><label className="field"><span>Vaste instructie toevoegen</span><textarea name="instruction" rows={4} required minLength={2} maxLength={10000} value={body} disabled={pending} onChange={event=>setBody(event.target.value)}/></label><small className="meta">Gebruik deze plek voor werkinstructies; deel toegangscodes via je accountmanager.</small><div className="section-gap"><button className="button primary" disabled={pending}>{pending?"Opslaan…":"Instructie opslaan"}</button></div></form>}</>}
  {tab==="visits"&&<>{visits.filter(visit=>visit.objectId===object.id).map(visit=><button className="ticket-row" type="button" key={visit.id} onClick={()=>leave(()=>openVisit(visit.id))}><div><strong>{customerDate(visit.start,timezone,true)} · {customerTime(visit.start,timezone)}</strong><p>{visit.service}</p></div><span className="chip green">{customerVisitLabel(visit)}</span><ChevronRight/></button>)}{!visits.some(visit=>visit.objectId===object.id)&&<EmptyState title="Nog geen afspraken" description="Vraag een dienst aan voor deze locatie."><button className="button primary" type="button" onClick={()=>leave(request)}>Dienst aanvragen</button></EmptyState>}</>}
 </div>;
 return <CustomerDialog guideKey="feature.customer-object" title={object.name} kicker={`${tenant} · Klantportaal`} close={close} busy={pending} dirty={!!body.trim()}
  footer={<>{editable&&<button className="button" type="button" disabled={pending} onClick={()=>leave(edit)}>Object wijzigen</button>}<button className="button primary" type="button" onClick={()=>leave(request)} disabled={pending}><Plus/>Dienst aanvragen</button></>}>
  <ContentTabs label="Objectgegevens" value={tab} onValueChange={setTab} tabs={[["overview","Overzicht"],["instructions","Vaste instructies"],["visits","Afspraken"]].map(([id,title])=>({id,title,content:tab===id?panel:null}))}/>
 </CustomerDialog>;
}

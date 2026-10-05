"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Mail } from "lucide-react";
import type { CustomerPreferences } from "@/lib/customer-portal/model";
import type { CustomerFormResult } from "./forms";

export const customerPreferenceLabels:Record<keyof CustomerPreferences,[string,string]>={
 appointments:["Afspraken & planning","Bevestigingen en wijzigingen van bezoeken."],reports:["Nieuwe rapporten","Een bericht zodra een rapport klaarstaat."],
 invoices:["Facturen & betalingen","Nieuwe facturen en betaalbevestigingen."],tickets:["Tickets & aanvragen","Reacties van je accountmanager of support."],news:["Nieuws & dienstverlening","Praktische updates van je organisatie."],
};
export function CustomerPreferenceFields({value,change,disabled=false}:{value:CustomerPreferences;change:(value:CustomerPreferences)=>void;disabled?:boolean}){
 return <>{Object.entries(customerPreferenceLabels).map(([key,[label,description]])=><label className="switch-row" key={key}><div><b>{label}</b><p>{description}</p></div>
  <input className="switch" type="checkbox" name={key} aria-label={`E-mail ${label.toLowerCase()}`} checked={value[key as keyof CustomerPreferences]} disabled={disabled} onChange={event=>change({...value,[key]:event.target.checked})}/></label>)}</>;
}
export function CustomerPreferencesForm({value,version,save}:{value:CustomerPreferences;version:number;save:(value:CustomerPreferences,version:number,id:string)=>Promise<CustomerFormResult&{preferenceVersion?:number}>}){
 const [draft,setDraft]=useState(value),[sourceVersion,setSourceVersion]=useState(version),[error,setError]=useState(""),[success,setSuccess]=useState(false),[pending,start]=useTransition(),keys=useRef(new Map<string,string>());
 return <form className="card card-pad" onSubmit={event=>{event.preventDefault();const key=JSON.stringify({value:draft,version:sourceVersion});let id=keys.current.get(key);if(!id){id=crypto.randomUUID();keys.current.set(key,id);}
  start(async()=>{try{const result=await save(draft,sourceVersion,id);if(!result.ok){setError(result.error);return;}if(result.preferenceVersion!==undefined)setSourceVersion(result.preferenceVersion);setError("");setSuccess(true);}catch{setError("Opslaan kon niet worden bevestigd. Probeer dezelfde voorkeuren opnieuw.");}});
 }}><div className="section-heading"><h2>E-mailnotificaties</h2><Mail/></div><p className="meta">Kies welke updates je per e-mail ontvangt. Ze blijven ook zichtbaar in het portaal.</p>
  {error&&<p className="form-error" role="alert">{error}</p>}{success&&<p className="notice" role="status"><Check/>Je voorkeuren zijn opgeslagen.</p>}
  <CustomerPreferenceFields value={draft} change={next=>{setDraft(next);setSuccess(false);}} disabled={pending}/><div className="section-gap"><button className="button primary" disabled={pending}>{pending?"Opslaan…":"Voorkeuren opslaan"}</button></div>
 </form>;
}

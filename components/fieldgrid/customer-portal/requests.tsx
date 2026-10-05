"use client";

import { useId,useRef,useState,useTransition } from "react";
import { Check,Clock3,Info,Ticket } from "lucide-react";
import { customerServiceRequestInputSchema,type CustomerServiceRequestInput,type CustomerWorkspace } from "@/lib/customer-portal/model";
import { requestLabels } from "@/lib/commercial/model";
import { customerDate,type CustomerRequest,type CustomerResources } from "@/lib/customer-portal/presentation";
import { CustomerDialog } from "./dialog";
import { CustomerField } from "./fields";
import type { CustomerFormResult } from "./forms";

export function CustomerServiceRequestForm({workspace,services,service,objectId,close,newObject,save}:{workspace:CustomerWorkspace;services:CustomerResources["services"];service?:string;objectId?:string;close:()=>void;newObject:()=>void;save:(input:CustomerServiceRequestInput,id:string)=>Promise<CustomerFormResult>}){
 const formId=useId(),keys=useRef(new Map<string,string>()),[initial]=useState<CustomerServiceRequestInput>(()=>({service:services.some(item=>item.name===service)?service!:services[0]?.name??"Andere dienstverlening",objectIds:objectId&&workspace.objects.some(object=>object.id===objectId)?[objectId]:[],frequency:"Eenmalig",preferredOn:null,description:""}));
 const [draft,setDraft]=useState(initial),[error,setError]=useState(""),[pending,start]=useTransition();
 const dirty=JSON.stringify(draft)!==JSON.stringify(initial),cancel=()=>{if(!pending&&(!dirty||window.confirm("Je aanvraag is nog niet verstuurd. Toch sluiten?")))close();};
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:workspace.tenant.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 return <CustomerDialog title={workspace.objects.length?"Dienst aanvragen":"Voeg eerst een object toe"} kicker="Diensten & aanvragen" close={close} busy={pending} dirty={dirty}
  footer={workspace.objects.length?<><button className="button" type="button" disabled={pending} onClick={cancel}>Annuleren</button><button className="button primary" form={formId} disabled={pending}>{pending?"Versturen…":"Aanvraag versturen"}</button></>:<button className="button" type="button" onClick={close}>Sluiten</button>}>
  {!workspace.objects.length?<div className="empty"><h3>Voor welke locatie kunnen we helpen?</h3><p>Maak een object aan om een dienst aan te vragen.</p>{workspace.account.canCreateObjects&&<button className="button primary" type="button" onClick={newObject}>Object toevoegen</button>}</div>:<>
   <p className="form-intro">Vertel ons wat je nodig hebt. Je accountmanager beoordeelt je aanvraag en neemt contact met je op.</p>{error&&<p className="form-error" role="alert">{error}</p>}
   <form id={formId} onSubmit={event=>{event.preventDefault();const parsed=customerServiceRequestInputSchema.safeParse(draft);if(!parsed.success){setError(parsed.error.issues[0]?.message??"Controleer je gegevens.");return;}
    const input=parsed.data,key=JSON.stringify(input);let id=keys.current.get(key);if(!id){id=crypto.randomUUID();keys.current.set(key,id);}
    start(async()=>{try{const result=await save(input,id);if(!result.ok){setError(result.error);return;}close();}catch{setError("Versturen kon niet worden bevestigd. Probeer dezelfde aanvraag opnieuw; je invoer blijft staan.");}});
   }}><label className="field"><span>Gewenste dienst *</span><select name="service" value={draft.service} disabled={pending} onChange={event=>setDraft({...draft,service:event.target.value})}>
    {services.map(item=><option key={item.name}>{item.name}</option>)}<option>Andere dienstverlening</option></select></label>
    <fieldset className="choice-box" disabled={pending}><legend>Voor welke objecten? *</legend>{workspace.objects.map(object=><label className="check-option" key={object.id}><input type="checkbox" name="objects" value={object.id} checked={draft.objectIds.includes(object.id)} onChange={event=>setDraft({...draft,objectIds:event.target.checked?[...draft.objectIds,object.id]:draft.objectIds.filter(id=>id!==object.id)})}/><span><strong>{object.name}</strong><small>{object.street}, {object.postalCode} {object.city}</small></span></label>)}</fieldset>
    <div className="grid2"><label className="field"><span>Frequentie</span><select name="frequency" value={draft.frequency} disabled={pending} onChange={event=>setDraft({...draft,frequency:event.target.value as CustomerServiceRequestInput["frequency"]})}>{["Eenmalig","Wekelijks","Maandelijks","In overleg"].map(value=><option key={value}>{value}</option>)}</select></label>
     <CustomerField label="Voorkeursdatum" name="preferred" type="date" min={today} value={draft.preferredOn??""} disabled={pending} onChange={event=>setDraft({...draft,preferredOn:event.target.value||null})}/></div>
    <label className="field"><span>Wat zijn je wensen? *</span><textarea name="description" rows={4} required minLength={3} maxLength={10000} value={draft.description} disabled={pending} onChange={event=>setDraft({...draft,description:event.target.value})}/></label>
    <div className="banner"><Info/><p>Je aanvraag is nog geen bevestigde afspraak. We stemmen de uitvoering en prijs eerst met je af.</p></div>
   </form></>}
 </CustomerDialog>;
}

export function CustomerRequestDetail({request,workspace,close,question,openPart}:{request:CustomerRequest;workspace:CustomerWorkspace;close:()=>void;question:()=>void;openPart:(id:string)=>void}){
 return <CustomerDialog title={request.subject} kicker="Mijn aanvragen" close={close} footer={<><button className="button" type="button" onClick={close}>Sluiten</button>{workspace.tenant.tickets&&<button className="button primary" type="button" onClick={question}><Ticket/>Stel een vraag</button>}</>}>
  <div className="row"><span className="meta">{request.number}</span><span className="chip gray">{request.status==="mixed"?"Verschillende statussen":requestLabels[request.status]??request.status}</span></div>
  <div className="details section-gap"><div><small>Objecten</small><strong>{request.objectIds.map(id=>workspace.objects.find(object=>object.id===id)?.name).filter(Boolean).join(", ")||"Locatie nog vaststellen"}</strong></div><div><small>Frequentie</small><strong>{request.frequency}</strong></div><div><small>Voorkeursdatum</small><strong>{request.preferredOn?customerDate(request.preferredOn,workspace.tenant.timezone,true):"In overleg"}</strong></div><div><small>Behandelaar</small><strong>{workspace.tenant.name}</strong></div></div>
  <hr className="divider"/><h3>Je aanvraag</h3><p className="section-gap preserved">{request.description}</p>
  <div className="request-timeline section-gap"><div className="done"><Check/>Aanvraag ontvangen · {customerDate(request.createdAt,workspace.tenant.timezone)}</div><div><Clock3/>Per object worden je wensen en eventuele offertes afzonderlijk afgehandeld.</div></div>
  {request.parts.map(part=><button className="ticket-row" type="button" key={part.id} onClick={()=>openPart(part.id)}><div><strong>{part.number}</strong><p>{workspace.objects.find(object=>object.id===part.objectId)?.name??"Locatie nog vaststellen"}</p></div><span className="chip gray">{requestLabels[part.status]??part.status}</span><span>Bekijk aanvraag & offerte →</span></button>)}
 </CustomerDialog>;
}

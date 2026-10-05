"use client";

import { useId,useRef,useState,useTransition,type FormEvent } from "react";
import { CalendarDays,Check,Download,Info,Plus,Ticket } from "lucide-react";
import type { CustomerObject } from "@/lib/customer-portal/model";
import { customerDate,customerTime,customerVisitLabel,type CustomerReport } from "@/lib/customer-portal/presentation";
import { customerVisitRequestLabel,type CustomerVisitDetail } from "@/lib/customer-portal/visit-model";
import { visitRequestFields,type VisitRequestAction } from "@/lib/customer-portal/visit-command-model";
import { saveCustomerVisitRequest,uploadCustomerVisitAttachment } from "@/lib/customer-portal/visit-command-action";
import { money } from "@/lib/commercial/model";
import { CustomerDialog } from "./dialog";

type Request=CustomerVisitDetail["requests"][number];
type Editor={kind:"create";visitVersion:number}|{kind:"update"|"withdraw"|"attachment";request:Request};
export function CustomerVisitDetailDialog({detail,object,report,tenant,timezone,initialNotes=false,close,question,onSaved,downloadAllowed=true,accountId}:{
 detail:CustomerVisitDetail;object:CustomerObject;report?:CustomerReport;tenant:string;timezone:string;initialNotes?:boolean;close:()=>void;question:()=>void;downloadAllowed?:boolean;accountId:string;onSaved:()=>Promise<unknown>;
}){
 const [tab,setTab]=useState(initialNotes?"notes":"overview"),[editor,setEditor]=useState<Editor|null>(null),[dirty,setDirty]=useState(false);
 const [error,setError]=useState(""),[pending,start]=useTransition(),keys=useRef(new Map<string,string>()),tabsId=useId(),{visit}=detail;
 const notes=detail.requests.filter(request=>request.status!=="withdrawn"),validReport=report?.visitId===visit.id&&report.objectId===object.id?report:undefined;
 const leave=(action:()=>void)=>{if(!pending&&(!dirty||window.confirm("Je wijzigingen zijn nog niet opgeslagen. Toch verdergaan?")))action();};
 const begin=(value:Editor)=>leave(()=>{setEditor(value);setDirty(false);setError("");setTab("notes");});
 const run=(action:VisitRequestAction)=>{
  const key=JSON.stringify(action);let id=keys.current.get(key);if(!id){id=crypto.randomUUID();keys.current.set(key,id);}
  start(async()=>{try{const result=await saveCustomerVisitRequest({accountId,visitId:visit.id,commandId:id,action});if(!result.ok){setError(result.error);return;}keys.current.delete(key);setEditor(null);setDirty(false);setError("");await onSaved();}catch{setError("Opslaan kon niet worden bevestigd. Je invoer blijft bewaard; probeer opnieuw.");}});
 };
 const submit=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!editor||pending)return;const form=new FormData(event.currentTarget);
  if(editor.kind==="attachment"){
   const file=form.get("document"),key=JSON.stringify({request:editor.request.id,version:editor.request.version,title:form.get("title"),file:file instanceof File?[file.name,file.size,file.lastModified]:null});let commandId=keys.current.get(key);if(!commandId){commandId=crypto.randomUUID();keys.current.set(key,commandId);}form.set("commandId",commandId);
   for(const [key,value] of Object.entries({accountId,visitId:visit.id,requestId:editor.request.id,version:String(editor.request.version)}))form.set(key,value);
   start(async()=>{try{const result=await uploadCustomerVisitAttachment(form);if(!result.ok){setError(result.error);return;}keys.current.delete(key);setEditor(null);setDirty(false);setError("");await onSaved();}catch{setError("Bijlage niet bevestigd. Controleer de actuele versie en probeer opnieuw.");}});return;
  }
  if(editor.kind==="withdraw"){run({operation:"withdraw",requestId:editor.request.id,version:editor.request.version,reason:String(form.get("reason")??"")});return;}
  const fields=visitRequestFields.safeParse(Object.fromEntries(form));if(!fields.success){setError("Controleer titel, omschrijving en verzoekgegevens.");return;}
  run(editor.kind==="create"?{operation:"create",visitVersion:editor.visitVersion,fields:fields.data}:{operation:"update",requestId:editor.request.id,version:editor.request.version,fields:fields.data});
 };
 const currentVersion=editor?.kind==="create"?visit.version:editor?detail.requests.find(request=>request.id===editor.request.id)?.version:undefined;
 const sourceVersion=editor?.kind==="create"?editor.visitVersion:editor?.request.version;
 const changed=!!editor&&currentVersion!==sourceVersion;
 const fixedInstructions=object.instructions.map(instruction=><article className="instruction" key={instruction.id}><div className="row"><strong>{instruction.author}</strong><small>{customerDate(instruction.createdAt,timezone)}</small></div><p>{instruction.body}</p><div className="shared-label"><Check/>Gedeeld met planning en uitvoerend team</div></article>);
 return <CustomerDialog title={`Afspraak · ${object.name}`} kicker={`${tenant} · Klantportaal`} close={close} busy={pending} dirty={dirty}
  footer={<><button className="button" type="button" disabled={pending} onClick={()=>leave(question)}><Ticket/>Vraag over afspraak</button>{detail.canAddRequest?<button className="button primary" type="button" disabled={pending} onClick={()=>begin({kind:"create",visitVersion:visit.version})}><Plus/>Instructie of verzoek toevoegen</button>:validReport&&downloadAllowed&&<a className="button primary" href={`/api/customer-portal/files/report/${validReport.id}?account=${accountId}`}><Download/>PDF downloaden</a>}</>}>
  <div className="detail-tabs" role="tablist" aria-label="Afspraakgegevens" onKeyDown={event=>{const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')),index=buttons.indexOf(event.target as HTMLButtonElement);if(index<0)return;const next=event.key==="ArrowRight"?(index+1)%buttons.length:event.key==="ArrowLeft"?(index+buttons.length-1)%buttons.length:event.key==="Home"?0:event.key==="End"?buttons.length-1:null;if(next!==null){event.preventDefault();buttons[next].click();buttons[next].focus();}}}>
   {[["overview","Overzicht"],["notes",`Instructies${notes.length?` (${notes.length})`:""}`],["report","Rapport"]].map(([id,label])=><button key={id} id={`${tabsId}-${id}`} type="button" role="tab" tabIndex={tab===id?0:-1} aria-selected={tab===id} aria-controls={`${tabsId}-panel`} className={tab===id?"active":""} onClick={()=>leave(()=>setTab(id))}>{label}</button>)}</div>
  <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`}>
   {error&&<p className="form-error" role="alert">{error}</p>}
   {tab==="overview"&&<><div className="row"><h3>{object.name}</h3><span className="chip green">{customerVisitLabel(visit)}</span></div><p className="section-gap">{object.street}, {object.postalCode} {object.city}</p>
    <div className="visit-time-banner"><CalendarDays/><div><strong>{customerDate(visit.start,timezone,true)}</strong><p>{customerTime(visit.start,timezone)} – {customerTime(visit.end,timezone)}</p></div></div>
    <div className="details"><div><small>Dienst</small><strong>{visit.service}</strong></div><div><small>Uitvoerend team</small><strong>{tenant}</strong></div>{visit.actualStart&&<div><small>Werkelijk gestart</small><strong>{customerDate(visit.actualStart,timezone)} · {customerTime(visit.actualStart,timezone)}</strong></div>}{visit.actualEnd&&<div><small>Werkelijk afgerond</small><strong>{customerDate(visit.actualEnd,timezone)} · {customerTime(visit.actualEnd,timezone)}</strong></div>}</div>
    <hr className="divider"/><h3>Werkzaamheden</h3><ul className="task-list">{detail.tasks.map((task,index)=><li key={`${index}:${task}`}><Check/>{task}</li>)}</ul>{!detail.tasks.length&&<p className="section-gap">De werkzaamheden worden met je afgestemd.</p>}
    <div className={`banner ${notes.length?"success":""}`}><Info/><p>{notes.length?`${notes.length} extra instructie(s) gedeeld voor dit bezoek.`:detail.canAddRequest?"Iets waar we rekening mee moeten houden? Voeg een instructie toe.":"Deze afspraak is afgesloten. Neem contact op als je nog iets wilt doorgeven."}</p></div><small className="meta">{visit.number}</small></>}
   {tab==="notes"&&<><div className="banner"><Info/><p>Een verzoek geldt alleen voor deze afspraak. Lezen is geen akkoord voor uitvoering of kosten.</p></div>
    {editor&&<form key={editor.kind==="create"?"create":`${editor.kind}:${editor.request.id}`} onSubmit={submit} onChange={()=>setDirty(true)} className="customer-visit-form section-gap">
     <fieldset disabled={pending}>
      {editor.kind==="create"||editor.kind==="update"?<><h3>{editor.kind==="create"?"Instructie of verzoek toevoegen":"Verzoek wijzigen"}</h3>
       <label className="field">Titel<input name="title" required minLength={2} maxLength={180} defaultValue={editor.kind==="update"?editor.request.title:""}/></label>
       <label className="field">Wat wil je doorgeven?<textarea name="body" rows={4} required minLength={2} maxLength={10000} defaultValue={editor.kind==="update"?editor.request.body:""}/></label>
       <div className="form-grid"><label className="field">Locatieonderdeel<select name="nodeId" defaultValue={editor.kind==="update"?editor.request.nodeId??"":""}><option value="">Gehele object</option>{detail.nodes.map(node=><option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
       <label className="field">Soort verzoek<select name="kind" defaultValue={editor.kind==="update"?editor.request.kind:"attention"}><option value="attention">Aandachtspunt</option><option value="change">Praktische wijziging</option><option value="problem">Probleem</option><option value="extra">Extra werkzaamheden aanvragen</option></select></label>
       <label className="field">Prioriteit<select name="priority" defaultValue={editor.kind==="update"?editor.request.priority:"normal"}><option value="normal">Normaal</option><option value="high">Hoog</option><option value="urgent">Urgent</option></select></label>
       <label className="field">Gewenste terugkoppeling<input name="feedback" maxLength={1000} defaultValue={editor.kind==="update"?editor.request.feedback:""}/></label></div>
       <p className="meta">Deel geen toegangscodes. Extra werk wordt pas na beoordeling en zo nodig afzonderlijk prijsakkoord uitgevoerd.</p></>:editor.kind==="withdraw"?<><h3>Verzoek intrekken / voorstel niet aannemen</h3><label className="field">Reden<textarea name="reason" required minLength={2} maxLength={1000}/></label><p className="meta">De geschiedenis blijft bewaard. Er wordt geen uitvoering of factuur aangemaakt.</p></>:<><h3>Bijlage toevoegen aan dit verzoek</h3><label className="field">Titel<input name="title" required minLength={2} maxLength={180}/></label><label className="field">Bestand (PDF, JPG of PNG)<input type="file" name="document" accept=".pdf,.jpg,.jpeg,.png" required/></label><p className="meta">Maximaal 10 MB. Bestanden worden voor opslaan op veiligheid gecontroleerd. Deel geen geheime waarden.</p></>}
      {changed&&<div className="banner"><Info/><p>Deze afspraak of dit verzoek is gewijzigd. Je invoer blijft bewaard. Controleer de actuele gegevens hieronder voordat je opslaat.</p><button className="text-button" type="button" onClick={()=>{if(!window.confirm("Heb je de actuele afspraak en verzoekversie gecontroleerd? Je invoer blijft behouden."))return;if(editor.kind==="create")setEditor({...editor,visitVersion:visit.version});else{const current=detail.requests.find(request=>request.id===editor.request.id);if(current)setEditor({...editor,request:{...editor.request,version:current.version}});}setError("");}}>Actuele versie gebruiken</button></div>}
      <div className="row section-gap"><button className="button" type="button" onClick={()=>leave(()=>{setEditor(null);setDirty(false);})}>Annuleren</button><button className="button primary" disabled={pending||changed}>{pending?"Opslaan…":editor.kind==="create"?"Verzoek versturen":editor.kind==="update"?"Wijziging versturen":editor.kind==="withdraw"?"Verzoek intrekken":"Bijlage uploaden"}</button></div>
     </fieldset>
    </form>}
    {detail.requests.map(request=><article className="instruction" key={request.id}><div className="row"><h3>{request.title}</h3><span className="chip gray">{customerVisitRequestLabel(request.status)}</span></div><small className="meta">{customerDate(request.createdAt,timezone)} · versie {request.version} · {detail.nodes.find(node=>node.id===request.nodeId)?.name??"Gehele object"}</small><p>{request.body}</p><p className="meta">{{attention:"Aandachtspunt",change:"Praktische wijziging",problem:"Probleem",extra:"Extra werkzaamheden aanvragen"}[request.kind]} · {{normal:"Normaal",high:"Hoog",urgent:"Urgent"}[request.priority]}</p>{request.feedback&&<p>Gewenste terugkoppeling: {request.feedback}</p>}
     <div className="row section-gap">{request.read?<span className="shared-label"><Check/>Deze versie gelezen</span>:<button className="button" type="button" disabled={pending||!!editor} onClick={()=>run({operation:"read",requestId:request.id,version:request.version})}>Verzoek gelezen</button>}{request.canEdit&&<button className="button" type="button" disabled={pending} onClick={()=>begin({kind:"update",request})}>Verzoek wijzigen</button>}{request.canWithdraw&&<button className="text-button" type="button" disabled={pending} onClick={()=>begin({kind:"withdraw",request})}>Verzoek intrekken / voorstel niet aannemen</button>}</div>
     {request.response&&<p className="section-gap"><strong>{tenant}:</strong> {request.response}</p>}
     {request.proposals.map(proposal=><section className="visit-proposal section-gap" key={proposal.id}><h4>Voorstel versie {proposal.version}</h4><h4>{proposal.title}</h4><p>{proposal.scope}</p><strong>{money(proposal.priceCents*proposal.quantity)} excl. btw</strong><p>{proposal.quantity} × {money(proposal.priceCents)} · btw {proposal.vatBasisPoints/100}%</p>{proposal.acceptedAt?<p>Akkoord vastgelegd op {customerDate(proposal.acceptedAt,timezone,true)}.</p>:proposal.canAccept?<form onSubmit={event=>{event.preventDefault();run({operation:"accept",requestId:request.id,version:request.version,proposalId:proposal.id,proposalVersion:proposal.version,confirmed:true});}}><label className="visit-consent"><input type="checkbox" required disabled={pending||!!editor}/>Ik ga akkoord met deze voorstelversie, de omschreven werkzaamheden en het genoemde bedrag.</label><button className="button primary section-gap" disabled={pending||!!editor}>Akkoord met deze omvang en prijs</button></form>:<p>Nog geen akkoord op deze versie.</p>}</section>)}
     {request.documents.map(document=><p key={document.id}><a href={`/api/customer-portal/visit-files/${document.id}?account=${accountId}&order=${visit.id}`} target="_blank" rel="noopener noreferrer">{document.title} · versie {document.version}</a></p>)}
     {request.canEdit&&<button className="text-button section-gap" type="button" disabled={pending} onClick={()=>begin({kind:"attachment",request})}>Bijlage toevoegen aan dit verzoek</button>}
    </article>)}
    {!detail.requests.length&&<p className="meta section-gap">Er zijn nog geen verzoeken bij deze afspraak.</p>}
    <hr className="divider"/><h3>Vaste instructies van dit object</h3>{fixedInstructions.length?fixedInstructions:<p className="section-gap">Er zijn geen vaste instructies.</p>}</>}
   {tab==="report"&&(validReport?<CustomerReportBody report={validReport} object={object.name} tenant={tenant} timezone={timezone}/>:<div className="empty"><h3>Rapport volgt na uitvoering</h3><p>Zodra het rapport is vrijgegeven, vind je het hier.</p></div>)}
  </div>
 </CustomerDialog>;
}

const resultLabels:Record<string,string>={completed:"Uitgevoerd",partial:"Deels uitgevoerd",not_done:"Niet uitgevoerd",pending:"Nog niet uitgevoerd",withdrawn:"Ingetrokken",transferred:"Vervolg ingepland"};
export function CustomerReportBody({report,object,tenant,timezone}:{report:CustomerReport;object:string;tenant:string;timezone:string}){
 return <><div className="row"><div><span className="eyebrow">{report.number}</span><h3>{report.title}</h3><p>{object}</p></div><span className="chip green">Vrijgegeven</span></div>
  <div className="report-overview section-gap"><div><small>Vrijgegeven op</small><strong>{customerDate(report.approvedAt,timezone,true)}</strong></div><div><small>Uitvoerende organisatie</small><strong>{tenant}</strong></div></div>
  <hr className="divider"/><h3>Samenvatting</h3><p className="section-gap">{report.summary||"De werkzaamheden staan hieronder per taak."}</p><hr className="divider"/><h3>Uitgevoerde werkzaamheden</h3>
  <ul className="task-list">{report.tasks.map((task,index)=><li key={`${index}:${task.name}`}><Check/><div><strong>{task.name}</strong><p>{resultLabels[task.result]??task.result} · {task.quantity} {task.unit}</p></div></li>)}</ul>
 </>;
}

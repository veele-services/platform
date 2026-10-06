"use client";

import { useEffect,useId,useRef,useState,useTransition } from "react";
import { Check,UserRound } from "lucide-react";
import type { z } from "zod";
import { customerObjectInputSchema,customerOnboardingContactSchema,customerOnboardingInputSchema,type CustomerOnboardingDraft,type CustomerOnboardingInput,type CustomerPreferences,type CustomerWorkspace } from "@/lib/customer-portal/model";
import { CustomerDialog } from "./dialog";
import { CustomerField,ObjectFields,customerObjectTypes } from "./fields";
import { newCustomerObject } from "./forms";
import { CustomerPreferenceFields,customerPreferenceLabels } from "./preferences";

const labels=["Jouw gegevens","Eerste object","Voorkeuren","Controleren"];
type Result={ok:true;accountVersion:number;step:number;completed:boolean;objectId?:string}|{ok:false;code?:string;error:string};
type Sources={workspace:CustomerWorkspace;draft:CustomerOnboardingDraft;preferences:CustomerPreferences;preferenceVersion:number};
const errorsFor=(error:z.ZodError)=>Object.fromEntries(error.issues.map(issue=>[String(issue.path[0]),issue.message]));

export function CustomerOnboarding({workspace,draft,preferenceVersion,save,refresh,close,complete}:{workspace:CustomerWorkspace;draft:CustomerOnboardingDraft;preferenceVersion:number;
 save:(input:CustomerOnboardingInput,id:string)=>Promise<Result>;refresh:()=>Promise<Sources>;close:()=>void;complete:(objectId:string)=>void}) {
 const formId=useId(),heading=useRef<HTMLHeadingElement>(null),keys=useRef(new Map<string,string>());
 const [step,setStep]=useState(draft.step),[furthest,setFurthest]=useState(draft.step),[version,setVersion]=useState(draft.version);
 const [sources,setSources]=useState({customerVersion:workspace.profile.customerVersion,contactVersion:workspace.profile.contactVersion,preferenceVersion});
 const [contact,setContact]=useState({firstName:"",lastName:"",company:"",phone:"",...draft.contact});
 const [object,setObject]=useState(()=>draft.object??newCustomerObject(workspace.profile)),[preferences,setPreferences]=useState(draft.preferences),[confirmed,setConfirmed]=useState(false);
 const [saved,setSaved]=useState(()=>JSON.stringify({contact:{firstName:"",lastName:"",company:"",phone:"",...draft.contact},object:draft.object??newCustomerObject(workspace.profile),preferences:draft.preferences}));
 const [error,setError]=useState(""),[errors,setErrors]=useState<Record<string,string>>({}),[conflict,setConflict]=useState(false),[review,setReview]=useState<Sources|null>(null),[reviewConfirmed,setReviewConfirmed]=useState(false),[pending,start]=useTransition();
 const dirty=JSON.stringify({contact,object,preferences})!==saved;
 useEffect(()=>{heading.current?.focus({preventScroll:true});},[step]);
 const changeStep=(next:number)=>{if(!pending){setStep(next);setErrors({});setConfirmed(false);}};
 const submit=(mode:"save"|"complete"|"review")=>{
  const parsedContact=customerOnboardingContactSchema.safeParse(contact);
  if(!parsedContact.success){changeStep(0);setErrors(errorsFor(parsedContact.error));setError("Controleer je contactgegevens.");return;}
  const parsedObject=customerObjectInputSchema.safeParse(object);
  if(step>0&&!parsedObject.success){changeStep(1);setErrors(errorsFor(parsedObject.error));setError("Controleer het eerste object.");return;}
  const source=mode==="review"&&review?{customerVersion:review.workspace.profile.customerVersion,contactVersion:review.workspace.profile.contactVersion,preferenceVersion:review.preferenceVersion}:sources;
  const input=customerOnboardingInputSchema.safeParse({mode,expectedVersion:mode==="review"&&review?review.draft.version:version,...source,step,contact:parsedContact.data,object:parsedObject.success?parsedObject.data:null,preferences,confirmed:mode==="review"?reviewConfirmed:confirmed});
  if(!input.success){setError(mode==="review"?"Bevestig dat je de actuele gegevens hebt gecontroleerd.":"Controleer en bevestig je gegevens.");return;}
  const payload=input.data,key=JSON.stringify(payload);let id=keys.current.get(key);if(!id){id=crypto.randomUUID();keys.current.set(key,id);}
  start(async()=>{try{
   const result=await save(payload,id);
   if(!result.ok){setError(result.error);setConflict(result.code==="40001");return;}
   setVersion(result.accountVersion);setFurthest(result.step);setError("");setConflict(false);setSaved(JSON.stringify({contact,object,preferences}));
   if(mode==="review"){setSources(source);setReview(null);setReviewConfirmed(false);}
   else if(result.completed&&result.objectId)complete(result.objectId);else changeStep(Math.min(step+1,3));
  }catch{setError("Opslaan kon niet worden bevestigd. Probeer dezelfde stap opnieuw; je invoer blijft staan.");}});
 };
 return <CustomerDialog guideKey="feature.account-setup" title="Je klantomgeving instellen" kicker="Welkom" close={close} busy={pending} dirty={dirty}
  footer={<><button className="button" type="button" disabled={pending} onClick={()=>{if(!dirty||window.confirm("Je laatste wijzigingen zijn nog niet opgeslagen. Toch sluiten?"))close();}}>Later verder</button>
   {step>0&&<button className="button" type="button" disabled={pending} onClick={()=>changeStep(step-1)}>Vorige</button>}
   <button className="button primary" form={formId} disabled={pending||!!review}>{pending?"Opslaan…":step===3?"Afronden en naar cockpit":"Opslaan en verder"}</button></>}>
  <div className="wizard-progress" aria-label="Voortgang">{labels.map((label,index)=><div key={label} className={index===step?"current":index<furthest?"done":""} aria-current={index===step?"step":undefined}><span>{index<furthest&&index!==step?<Check/>:index+1}</span><b>{label}</b></div>)}</div>
  <p className="meta wizard-step">Stap {step+1} van 4 · {labels[step]}</p>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {conflict&&!review&&<button className="button" type="button" disabled={pending} onClick={()=>start(async()=>{try{setReview(await refresh());setReviewConfirmed(false);}catch{setError("Actuele gegevens konden niet worden gecontroleerd. Je concept blijft staan.");}})}>Actuele brongegevens controleren</button>}
  {review&&<section className="onboarding-box section-gap"><h3>Controleer de actuele gegevens</h3><p>Je eigen invoer hieronder blijft staan. Vergelijk die met de huidige gegevens voordat je opnieuw opslaat.</p>
   <dl><dt>Contactpersoon</dt><dd>{review.workspace.profile.fullName}</dd><dt>Organisatie</dt><dd>{review.workspace.profile.company}</dd><dt>Telefoon</dt><dd>{review.workspace.profile.phone}</dd><dt>Opgeslagen concept</dt><dd>{review.draft.contact.company} · {review.draft.object?.name??"Nog geen object"} · stap {review.draft.step+1}</dd></dl>
   <p className="meta">Actuele e-mailkeuzes: {Object.entries(review.preferences).map(([key,value])=>`${customerPreferenceLabels[key as keyof CustomerPreferences][0]}: ${value?"aan":"uit"}`).join(", ")}</p>
   <label className="check-option"><input type="checkbox" checked={reviewConfirmed} onChange={event=>setReviewConfirmed(event.target.checked)} disabled={pending}/><span>Ik heb de actuele gegevens en het opgeslagen concept vergeleken. Mijn invoer hieronder is de juiste.</span></label>
   <button className="button primary" type="button" disabled={pending||!reviewConfirmed} onClick={()=>submit("review")}>Concept opnieuw bevestigen</button>
  </section>}
  <form id={formId} onSubmit={event=>{event.preventDefault();submit(step===3?"complete":"save");}}>
   {step===0&&<><div className="wizard-intro"><span className="object-icon"><UserRound/></span><h3 ref={heading} tabIndex={-1}>Welkom bij {workspace.tenant.name}.</h3><p>Controleer je gegevens. Daarna voegen we je eerste object toe, zodat je een dienst kunt aanvragen.</p></div>
    <div className="grid2">{(["firstName","lastName"] as const).map((key,index)=><CustomerField key={key} label={`${index?"Achternaam":"Voornaam"} *`} name={key} value={contact[key]} required maxLength={index?100:80} error={errors[key]} disabled={pending} autoComplete={index?"family-name":"given-name"} onChange={event=>setContact({...contact,[key]:event.target.value})}/>)}</div>
    <CustomerField label="Organisatie *" name="company" value={contact.company} maxLength={180} required error={errors.company} disabled={pending} autoComplete="organization" onChange={event=>setContact({...contact,company:event.target.value})}/>
    <CustomerField label="E-mailadres voor inloggen" type="email" value={workspace.profile.email} disabled/>
    <CustomerField label="Telefoonnummer *" name="phone" type="tel" value={contact.phone} maxLength={40} required error={errors.phone} disabled={pending} autoComplete="tel" onChange={event=>setContact({...contact,phone:event.target.value})}/>
   </>}
   {step===1&&<><h3 ref={heading} tabIndex={-1}>Waar kunnen we je helpen?</h3><p className="form-intro">Geef de locatie op waar de werkzaamheden plaatsvinden. Je kunt later meer objecten toevoegen.</p><ObjectFields value={object} change={setObject} disabled={pending} errors={errors}/></>}
   {step===2&&<><h3 ref={heading} tabIndex={-1}>Op de hoogte, zoals jij dat wilt.</h3><p className="form-intro">Kies de updates die je per e-mail wilt ontvangen. Je kunt dit later wijzigen bij Mijn gegevens.</p><CustomerPreferenceFields value={preferences} change={setPreferences} disabled={pending}/></>}
   {step===3&&<><h3 ref={heading} tabIndex={-1}>Klaar voor een goede start.</h3><p className="form-intro">Controleer je gegevens en rond de inrichting af.</p>
    <div className="card card-pad"><div className="row"><h3>{contact.company}</h3><button type="button" className="button small" disabled={pending} onClick={()=>changeStep(0)}>Wijzigen</button></div><p>{contact.firstName} {contact.lastName}</p><p>{workspace.profile.email}</p></div>
    <div className="card card-pad section-gap"><div className="row"><h3>{object.name}</h3><button type="button" className="button small" disabled={pending} onClick={()=>changeStep(1)}>Wijzigen</button></div><p>{object.street}, {object.postalCode} {object.city}</p><p>{customerObjectTypes[object.type]}{object.size?` · ${object.size} m²`:""}</p>{object.instruction&&<p className="section-gap">{object.instruction}</p>}</div>
    <div className="banner success section-gap"><Check/><p>Na afronden kun je diensten aanvragen, afspraken volgen en rapporten bekijken.</p></div>
    <label className="check-option"><input name="confirmed" type="checkbox" required checked={confirmed} disabled={pending} onChange={event=>setConfirmed(event.target.checked)}/><span>Mijn gegevens en objectgegevens zijn correct.</span></label>
   </>}
  </form>
 </CustomerDialog>;
}

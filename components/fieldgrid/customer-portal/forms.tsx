"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Check, Save } from "lucide-react";
import { z } from "zod";
import { customerObjectInputSchema, customerProfileInputSchema, profileInput, type CustomerObject, type CustomerObjectInput, type CustomerProfile, type CustomerProfileInput } from "@/lib/customer-portal/model";
import { CustomerDialog } from "./dialog";
import { ObjectFields, ProfileFields } from "./fields";

export type CustomerFormResult={ok:true;accountVersion?:number;profileVersions?:{customer:number;contact:number}}|{ok:false;error:string;code?:string};
const fieldErrors=(error:z.ZodError)=>Object.fromEntries(error.issues.map(issue=>[String(issue.path[0]),issue.message]));
export const newCustomerObject=(profile:CustomerProfile):CustomerObjectInput=>({version:0,name:"",type:"office",size:null,street:"",postalCode:"",city:"",contact:profile.fullName,phone:profile.phone,contactVersion:0,contactRecordVersion:0,instruction:""});
export const editCustomerObject=(object:CustomerObject):CustomerObjectInput=>({id:object.id,version:object.version,name:object.name,type:object.type,size:object.size,street:object.street,postalCode:object.postalCode,city:object.city,contact:object.contact,phone:object.phone,contactVersion:object.contactVersion,contactRecordVersion:object.contactRecordVersion,instruction:"",...(object.address?{address:object.address}:{})});

/** Drafts are initialized once, not replaced by a background server refresh.
 * An ambiguous retry keeps its idempotency key and original source versions. */
export function CustomerObjectForm({ profile, object, accountVersion, close, save }: {profile:CustomerProfile;object?:CustomerObject;accountVersion:number;close:()=>void;save:(value:CustomerObjectInput,sourceAccountVersion:number,id:string)=>Promise<CustomerFormResult>}) {
 const formId=useId(),[initial]=useState(()=>object?editCustomerObject(object):newCustomerObject(profile));
 const [sourceAccountVersion]=useState(accountVersion);
 const [draft,setDraft]=useState(initial),[error,setError]=useState(""),[errors,setErrors]=useState<Record<string,string>>({}),[pending,start]=useTransition();
 const keys=useRef(new Map<string,string>());
 const submit=()=>{const parsed=customerObjectInputSchema.safeParse(draft);if(!parsed.success){setErrors(fieldErrors(parsed.error));setError("Controleer de gemarkeerde velden.");return;}
  const input=parsed.data,key=JSON.stringify(input);let id=keys.current.get(key);if(!id){id=crypto.randomUUID();keys.current.set(key,id);}
  start(async()=>{try{const result=await save(input,sourceAccountVersion,id);if(!result.ok){setError(result.error);return;}close();}catch{setError("Opslaan kon niet worden bevestigd. Probeer dezelfde wijzigingen opnieuw.");}});
 };
 const cancel=()=>{if(!pending&&(JSON.stringify(initial)===JSON.stringify(draft)||window.confirm("Je wijzigingen zijn nog niet opgeslagen. Wil je het venster toch sluiten?")))close();};
 return <CustomerDialog guideKey="customer.objects" title={object?"Object wijzigen":"Object toevoegen"} kicker="Mijn objecten" description="Alle gegevens en instructies blijven gekoppeld aan dit object." close={close} busy={pending} dirty={JSON.stringify(initial)!==JSON.stringify(draft)}
  footer={<><button className="button" type="button" onClick={cancel} disabled={pending}>Annuleren</button><button className="button primary" form={formId} disabled={pending}><Save/>{pending?"Opslaan…":"Object opslaan"}</button></>}>
  {error&&<p className="form-error" role="alert">{error}</p>}<form id={formId} onSubmit={event=>{event.preventDefault();submit();}}><ObjectFields value={draft} change={value=>{setDraft(value);setErrors({});}} disabled={pending} errors={errors}/></form>
 </CustomerDialog>;
}

export function CustomerProfileForm({profile,allowed,accountVersion,save}:{profile:CustomerProfile;allowed:boolean;accountVersion:number;save:(value:CustomerProfileInput,versions:{account:number;customer:number;contact:number},id:string)=>Promise<CustomerFormResult>}) {
 const [initial,setInitial]=useState(()=>({profile:profileInput(profile),account:accountVersion,customer:profile.customerVersion,contact:profile.contactVersion}));
 const [draft,setDraft]=useState(initial.profile),[error,setError]=useState(""),[success,setSuccess]=useState(false),[errors,setErrors]=useState<Record<string,string>>({}),[pending,start]=useTransition();
 const keys=useRef(new Map<string,string>());
 return <form className="card card-pad" onSubmit={event=>{event.preventDefault();setSuccess(false);const parsed=customerProfileInputSchema.safeParse(draft);if(!parsed.success){setErrors(fieldErrors(parsed.error));setError("Controleer de gemarkeerde velden.");return;}
  const value=parsed.data,key=JSON.stringify({value,account:initial.account,customer:initial.customer,contact:initial.contact});let id=keys.current.get(key);if(!id){id=crypto.randomUUID();keys.current.set(key,id);}
  start(async()=>{try{const result=await save(value,{account:initial.account,customer:initial.customer,contact:initial.contact},id);if(!result.ok){setError(result.error);return;}
   if(result.profileVersions&&result.accountVersion)setInitial({profile:value,account:result.accountVersion,...result.profileVersions});
   setError("");setSuccess(true);}catch{setError("Opslaan kon niet worden bevestigd. Probeer dezelfde wijzigingen opnieuw.");}});
 }}><div className="section-heading"><h2>Contact & organisatie</h2></div>{!allowed&&<p className="form-intro">Je contactpersoon beheert deze gegevens. Je kunt ze hier bekijken.</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}{success&&<p className="notice" role="status"><Check/>Je gegevens zijn opgeslagen.</p>}
  <ProfileFields value={draft} change={value=>{setDraft(value);setErrors({});setSuccess(false);}} email={profile.email} disabled={!allowed||pending} errors={errors}/>
  {allowed&&<button className="button primary" disabled={pending}><Save/>{pending?"Opslaan…":"Gegevens opslaan"}</button>}
 </form>;
}

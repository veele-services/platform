"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import type { CustomerObjectInput, CustomerProfileInput } from "@/lib/customer-portal/model";

export function CustomerField({ label, error, children, ...input }: InputHTMLAttributes<HTMLInputElement>&{label:string;error?:string;children?:ReactNode}) {
 const id=useId(),errorId=`${id}-error`;
 return <label className="field" htmlFor={id}><span>{label}</span>{children??<input {...input} id={id} aria-invalid={!!error||undefined} aria-describedby={error?errorId:undefined}/>}
  {error&&<small id={errorId} className="field-error">{error}</small>}</label>;
}
export function ProfileFields({ value, change, section="all", disabled=false, email, errors={} }: {
 value:CustomerProfileInput;change:(value:CustomerProfileInput)=>void;section?:"person"|"billing"|"all";disabled?:boolean;email:string;errors?:Record<string,string>;
}) {
 const field=(key:keyof CustomerProfileInput,label:string,props:InputHTMLAttributes<HTMLInputElement>={})=><CustomerField key={key} label={label} name={key} value={value[key]} disabled={disabled} error={errors[key]} required={key!=="companyNumber"} maxLength={180}
  onChange={event=>change({...value,[key]:event.target.value})} {...props}/>;
 return <>{section!=="billing"&&<><div className="grid2">{field("firstName","Voornaam",{autoComplete:"given-name",maxLength:80})}{field("lastName","Achternaam",{autoComplete:"family-name",maxLength:100})}</div>
  {field("company","Organisatie",{autoComplete:"organization"})}
  <CustomerField label="E-mailadres voor inloggen" name="loginEmail" type="email" value={email} disabled/><p className="meta email-note">Je accountmanager beheert dit e-mailadres.</p>
  {field("phone","Telefoonnummer",{type:"tel",autoComplete:"tel",maxLength:40})}</>}
  {section!=="person"&&<><hr className="divider"/><h3>Factuurgegevens</h3><div className="section-gap">{field("invoiceEmail","E-mailadres voor facturen",{type:"email",maxLength:254})}{field("street","Straat en huisnummer",{autoComplete:"street-address",maxLength:200})}
   <div className="grid2">{field("postalCode","Postcode",{autoComplete:"postal-code",maxLength:7,pattern:"[1-9][0-9]{3} ?[A-Za-z]{2}"})}{field("city","Plaats",{autoComplete:"address-level2",maxLength:100})}</div>
   {field("companyNumber","KvK-nummer",{inputMode:"numeric",maxLength:8,pattern:"[0-9]{8}"})}</div></>}
 </>;
}
export const customerObjectTypes:Record<CustomerObjectInput["type"],string>={office:"Kantoor",residential:"Wooncomplex",school:"School",care:"Zorg",retail:"Winkel",industrial:"Industrieel",other:"Overig"};
export function ObjectFields({value,change,disabled=false,errors={}}:{value:CustomerObjectInput;change:(value:CustomerObjectInput)=>void;disabled?:boolean;errors?:Record<string,string>}) {
 const field=(key:"name"|"street"|"postalCode"|"city"|"contact"|"phone",label:string,props:InputHTMLAttributes<HTMLInputElement>={})=><CustomerField key={key} label={label} name={key} value={value[key]} disabled={disabled} error={errors[key]} required maxLength={180}
  onChange={event=>change({...value,[key]:event.target.value})} {...props}/>;
 return <>{field("name","Naam object",{maxLength:160})}<div className="grid2"><label className="field"><span>Type object</span><select name="type" value={value.type} disabled={disabled} onChange={event=>change({...value,type:event.target.value as CustomerObjectInput["type"]})}>
  {Object.entries(customerObjectTypes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <CustomerField label="Oppervlakte (m²)" name="size" type="number" min="0.01" max="1000000" step="0.01" value={value.size??""} disabled={disabled} error={errors.size} onChange={event=>change({...value,size:event.target.value===""?null:Number(event.target.value)})}/></div>
  {field("street","Adres",{autoComplete:"street-address",maxLength:200})}<div className="grid2">{field("postalCode","Postcode",{maxLength:7,pattern:"[1-9][0-9]{3} ?[A-Za-z]{2}"})}{field("city","Plaats",{maxLength:100})}</div>
  <div className="grid2">{field("contact","Contactpersoon op locatie")}{field("phone","Telefoon op locatie",{type:"tel",maxLength:40})}</div>
  <label className="field"><span>Vaste instructie{value.id?" toevoegen":" (optioneel)"}</span><textarea name="instruction" rows={4} maxLength={10000} value={value.instruction} disabled={disabled} onChange={event=>change({...value,instruction:event.target.value})}/></label>
  <p className="meta">Vaste instructies zijn gewone werkinformatie voor planning en het uitvoerende team. Deel hier geen sleutels, toegangscodes of andere kluisgegevens.</p>
 </>;
}

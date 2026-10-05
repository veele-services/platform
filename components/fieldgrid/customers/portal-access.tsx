"use client";
import { useEffect,useState,useTransition } from "react";
import { readCustomerAccounts,saveCustomerAccount } from "@/lib/customer-portal/management-action";
import type { ManagedCustomerAccount } from "@/lib/customer-portal/management-model";
type Contact={id:string;full_name:string;email:string|null;active:boolean};
export function CustomerPortalAccess({customerId,contacts}:{customerId:string;contacts:Contact[]}){
 const [accounts,setAccounts]=useState<ManagedCustomerAccount[]>([]),[error,setError]=useState(""),[message,setMessage]=useState(""),[revision,setRevision]=useState(0),[ready,setReady]=useState(false),[pending,start]=useTransition();
 const [selected,setSelected]=useState<ManagedCustomerAccount|null>(null),[email,setEmail]=useState(""),[contact,setContact]=useState(""),[active,setActive]=useState(true),[create,setCreate]=useState(false),[edit,setEdit]=useState(false),[profile,setProfile]=useState(false);
 useEffect(()=>{let live=true;void readCustomerAccounts(customerId).then(result=>{if(!live)return;if(result.ok){setAccounts(result.accounts);setReady(true);}else setError(result.error);});return()=>{live=false;};},[customerId,revision]);
 const choose=(account:ManagedCustomerAccount|null)=>{setSelected(account);setEmail(account?.email??"");setContact(account?.contactId??"");setActive(account?.active??true);setCreate(account?.canCreateObjects??false);setEdit(account?.canEditObjects??false);setProfile(account?.canEditProfile??false);setMessage("");setError("");};
 return <section className="dossier-card"><h2>Klantportaaltoegang</h2><p>Geef een contact expliciet toegang tot deze klantomgeving. Toegang tot bestaande objecten stel je afzonderlijk in bij het object.</p>
 <div className="dossier-actions"><button type="button" className="secondary-button" onClick={()=>choose(null)} disabled={pending}>Nieuw klantaccount</button><button type="button" className="secondary-button" onClick={()=>setRevision(v=>v+1)} disabled={pending}>Overzicht vernieuwen</button></div>
 {accounts.map(account=><p key={account.id}><button type="button" className="text-button" onClick={()=>choose(account)} disabled={pending}>{account.email}</button> · {account.active?"Actief":"Ingetrokken"}</p>)}
 <form className="dossier-form" onSubmit={event=>{event.preventDefault();setError("");setMessage("");start(async()=>{const result=await saveCustomerAccount({customerId,contactId:contact,email,version:selected?.version??0,active,canCreateObjects:create,canEditObjects:edit,canEditProfile:profile});if(!result.ok){setError(result.error);return;}choose(null);setMessage(active?"Toegang opgeslagen. De klant kan via /klant inloggen met een eenmalige e-mailcode.":"Klanttoegang en bestaande objectkoppelingen zijn ingetrokken.");setRevision(v=>v+1);});}}>
 <label>Contactpersoon<select required value={contact} onChange={event=>{setContact(event.target.value);const found=contacts.find(c=>c.id===event.target.value);if(!selected&&found?.email)setEmail(found.email);}} disabled={pending}><option value="">Kies een actief contact</option>{contacts.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>
 <label>E-mailadres voor inlogcodes<input type="email" required value={email} onChange={event=>setEmail(event.target.value)} disabled={pending||Boolean(selected)}/></label>
 <label className="dossier-check"><input type="checkbox" checked={active} onChange={event=>setActive(event.target.checked)} disabled={pending}/>Toegang actief</label>
 <label className="dossier-check"><input type="checkbox" checked={create} onChange={event=>setCreate(event.target.checked)} disabled={pending}/>Eigen objecten aanmaken</label>
 <label className="dossier-check"><input type="checkbox" checked={edit} onChange={event=>setEdit(event.target.checked)} disabled={pending}/>Toegewezen objecten bewerken</label>
 <label className="dossier-check"><input type="checkbox" checked={profile} onChange={event=>setProfile(event.target.checked)} disabled={pending}/>Contact- en factuurgegevens bewerken</label>
 <p>Intrekken sluit ook de bestaande objecttoegang. Opnieuw activeren herstelt die objectkoppelingen niet automatisch.</p>
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}<button className="primary-button" disabled={pending||!ready||!contacts.some(c=>c.active)}>{pending?"Opslaan…":"Klanttoegang opslaan"}</button>
 </form></section>;
}

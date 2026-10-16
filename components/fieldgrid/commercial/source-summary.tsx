"use client";
import {useEffect,useRef,useState,useTransition} from 'react';
import type {TenantContext} from '@/lib/auth/context';
import {hasManagementPermission} from '@/lib/management/model';
import {commercialAction,readCommercialDetail,readCommercialOptions} from '@/app/(workspace)/app/commercial-actions';
import type {CommercialDetail,CommercialOptions} from '@/lib/commercial/model';
import {sourceCommercialSave,sourceCommercialStatus} from '@/lib/commercial/source-presentation';
import {Button,Field,Modal} from '@/components/fieldgrid/crm/ui';
import {EntityActionsMenu} from '@/components/fieldgrid/management-cockpit/entity-actions';
/** The source summary edits the mutable native subject/draft scope. Customer,
 * status and amount use the full native lifecycle instead of bypassing it. */
export function SourceCommercialSummary({id,kind,tenant,options,onClose,onChanged,onWorkflow,onEdit,onForbidden}:{id:string;kind:'request'|'quote';tenant:TenantContext;options:CommercialOptions;onClose:()=>void;onChanged:()=>void;onWorkflow:()=>void;onEdit:()=>void;onForbidden:(error:string)=>void}){
 const[detail,setDetail]=useState<CommercialDetail|null>(null),[customerName,setCustomerName]=useState(''),[subject,setSubject]=useState(''),[scope,setScope]=useState(''),[error,setError]=useState(''),[pending,start]=useTransition(),[dirty,setDirty]=useState(false);
 const current=useRef({dirty:false,version:0}),mutation=useRef(crypto.randomUUID());
 useEffect(()=>{let active=true;const load=async()=>{try{const result=await readCommercialDetail(id,kind);if(!active)return;if(!result.ok){setDetail(null);onForbidden(result.error);return}if('proposals'in result.data)throw new Error('Onverwacht dossier');const d=result.data;if(d.record.customer_id){if(d.preview?.customer.name)setCustomerName(d.preview.customer.name);else if(!options.customers.some(c=>c.id===d.record.customer_id)){const selected=await readCommercialOptions('',d.record.customer_id);if(active&&selected.ok)setCustomerName(selected.data.customers.find(c=>c.id===d.record.customer_id)?.name||'')}}if(!active)return;setDetail(previous=>current.current.dirty?previous:d);if(!current.current.dirty){setSubject(d.record.subject);setScope('quote_number'in d.record?String((d.record.terms as Record<string,unknown>).scope||''):d.record.description);current.current.version=d.record.version}else if(d.record.version!==current.current.version)setError('Dit dossier is gewijzigd. Bewaar je tekst en heropen het actuele dossier voordat je opslaat.')}catch{if(active)setError('De actuele bron kon niet worden geladen. Controleer je verbinding.')}};void load();const focus=()=>{if(document.visibilityState==='visible')void load()},timer=setInterval(focus,30000);window.addEventListener('focus',focus);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus)}},[id,kind,onForbidden,options.customers]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(current.current.dirty)event.preventDefault()};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[]);
 const record=detail?.record,quote=record&&'quote_number'in record?record:null,canWrite=tenant.roles.some(r=>['tenant_admin','management','planner','finance'].includes(r))&&hasManagementPermission(tenant,'backoffice.commercial.write')&&hasManagementPermission(tenant,'backoffice.functions.commercial_command')&&hasManagementPermission(tenant,kind==='quote'?'backoffice.functions.commercial_save_quote':'backoffice.functions.commercial_save_request'),writable=canWrite&&!!record&&!record.archived_at&&(!quote||quote.status==='draft');
 const change=(set:(v:string)=>void,value:string)=>{set(value);setDirty(true);current.current.dirty=true;mutation.current=crypto.randomUUID()};
 const close=()=>{if(!pending&&(!current.current.dirty||confirm('Je wijzigingen zijn nog niet opgeslagen. Wil je ze weggooien?')))onClose()};
 const full=(action:()=>void)=>{if(!pending&&(!current.current.dirty||confirm('Je wijzigingen zijn nog niet opgeslagen. Wil je ze weggooien?')))action()};
 const save=()=>start(async()=>{if(!record||!writable)return;try{const{command,input}=sourceCommercialSave(record,subject,scope),result=await commercialAction(command,input,mutation.current);if(!result.ok){setError(result.error);return}current.current.dirty=false;setDirty(false);onChanged();onClose()}catch{setError('Opslaan kon niet worden bevestigd. Je tekst blijft bewaard; probeer dezelfde actie opnieuw.')}});
 const title=record?('quote_number'in record?record.quote_number:record.request_number):'Dossier openen';
 return <Modal title={title} subtitle="AANVRAGEN & OFFERTES" onClose={close} footer={<><EntityActionsMenu name={title}><button disabled={pending} onClick={()=>full(onWorkflow)}>Dossier en historie</button><button disabled={pending||!canWrite} onClick={()=>full(onEdit)}>Volledige aanvraag / offerte bewerken</button></EntityActionsMenu><Button disabled={pending} onClick={close}>Annuleren</Button><Button primary disabled={!writable||pending||!subject.trim()||!dirty} onClick={save}>{pending?'Opslaan…':'Opslaan'}</Button></>}>
 {error&&<p role="alert" className="gov-error">{error}</p>}{!record?<p role="status">Actuele brongegevens laden…</p>:<div className="ed-form-grid">
 <Field label="Onderwerp"><input value={subject} maxLength={180} readOnly={!writable} onChange={e=>change(setSubject,e.target.value)}/></Field>
 <Field label="Klant"><select value={record.customer_id||''} disabled><option value={record.customer_id||''}>{options.customers.find(c=>c.id===record.customer_id)?.name||customerName||'Klant niet beschikbaar'}</option></select></Field>
 <Field label="Status"><select value={record.status} disabled><option value={record.status}>{sourceCommercialStatus({source_kind:kind,status:record.status})}</option></select></Field>
 <Field label="Bedrag excl. btw"><input type="number" min="0" value={quote?quote.subtotal_cents/100:''} readOnly placeholder="Nog geen offerte"/></Field>
 <Field label="Omschrijving"><textarea value={scope} rows={4} readOnly={!writable||!quote} onChange={e=>change(setScope,e.target.value)}/></Field>
 </div>}
 </Modal>;
}

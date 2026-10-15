"use client";
import {useCallback,useEffect,useRef,useState,useTransition} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {readWorkOrderSource,saveWorkOrder} from '@/app/(workspace)/app/work-order-actions';
import type {WorkOrderDossier,WorkOrderListRow} from '@/lib/work-orders/model';
import {sourceExecutionLabel,sourceWorkOrderMetadata} from '@/lib/work-orders/source-presentation';
import {localDateTime} from '@/lib/planning/time';
import {Button,Field} from '../crm/ui';
import {SourceNativeDialog} from '../source-native-dialog';

export function SourceWorkOrderSummary({row,timezone,onClose,onSaved,onSource,onForbidden}:{row:WorkOrderListRow;timezone:string;onClose:()=>void;onSaved:()=>void;onSource:()=>void;onForbidden:()=>void}){
 const [data,setData]=useState<WorkOrderDossier|null>(null),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[error,setError]=useState(''),[warnings,setWarnings]=useState<Array<{key:string;message:string}>>([]),[pending,start]=useTransition();
 const snapshot=useRef<WorkOrderDossier|null>(null),changed=useRef(false),writing=useRef(false),mutation=useRef(crypto.randomUUID()),alive=useRef(false),sequence=useRef(0);
 const dirty=Boolean(data&&(title!==data.order.title||description!==data.order.description));
 useEffect(()=>{changed.current=dirty;writing.current=pending},[dirty,pending]);
 const invalidate=useCallback(()=>{sequence.current++},[]);
 const load=useCallback(async()=>{
  const request=++sequence.current;
  const result=await readWorkOrderSource(row.id);
  if(!alive.current||request!==sequence.current)return;
  if(!result.ok){if(result.code==='42501'){snapshot.current=null;setData(null);onForbidden()}else setError(result.error);return;}
  setError('');
  if(!snapshot.current||!changed.current){snapshot.current=result.data;setData(result.data);setTitle(result.data.order.title);setDescription(result.data.order.description)}
  else{const merged={...snapshot.current,canManage:result.data.canManage,canReview:result.data.canReview,order:{...snapshot.current.order,canEdit:result.data.order.canEdit,canDelete:result.data.order.canDelete}};snapshot.current=merged;setData(merged)}
 },[row.id,onForbidden]);
 useEffect(()=>{
  alive.current=true;const refresh=()=>{if(alive.current&&!writing.current&&document.visibilityState==='visible')void load().catch(()=>{if(alive.current)setError('Het dossier kon niet worden vernieuwd. Je invoer is behouden.')})};
  const first=setTimeout(refresh,0),timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);
  return()=>{alive.current=false;invalidate();clearTimeout(first);clearInterval(timer);window.removeEventListener('focus',refresh)};
 },[load,invalidate]);
 const edit=(field:'title'|'description',value:string)=>{mutation.current=crypto.randomUUID();setWarnings([]);setError('');if(field==='title')setTitle(value);else setDescription(value)};
 const save=(confirm=false)=>{
  if(!data?.order.canEdit||pending)return;
  let input;try{input=sourceWorkOrderMetadata(data,{title,description,mutationId:mutation.current,confirmedWarnings:confirm?warnings.map(w=>w.key):[]})}catch{setError('Controleer de titel of gebruik de volledige werkbonbewerking om de bestaande bedrijfsvelden aan te vullen. Je invoer is behouden.');return;}
  writing.current=true;
  start(async()=>{try{const result=await saveWorkOrder(input);if(!alive.current)return;if(!result.ok){setError(result.error);setWarnings(result.warnings??[]);return;}onSaved()}catch{if(alive.current)setError('Opslaan kon niet worden bevestigd. Je invoer is behouden; opnieuw bewaren gebruikt hetzelfde verzoek.')}finally{writing.current=false}});
 };
 const planned=data?.order.start?localDateTime(data.order.start,timezone).slice(0,10):data?.order.requestedDate??'';
 return <SourceNativeDialog sourceForm title={row.number} eyebrow="UITVOERING" description="" dirty={dirty} busy={pending} onClose={onClose} footer={<><Button disabled={pending} onClick={()=>{if(!dirty||confirm('Je wijzigingen zijn nog niet opgeslagen. Wil je ze weggooien?'))onClose()}}>Annuleren</Button>{data?.order.canEdit&&<Button primary disabled={pending||title.trim().length<2} onClick={()=>save(Boolean(warnings.length))}>{pending?'Opslaan…':warnings.length?'Bevestigen en opslaan':'Opslaan'}</Button>}</>}>
  {error&&<p className="gov-error" role="alert">{error}</p>}{!data?<p role="status">Geautoriseerde werkbongegevens laden…</p>:<><div className="ed-form-grid">
   <Field label="Object / titel"><input value={title} readOnly={!data.order.canEdit||pending} maxLength={180} onChange={e=>edit('title',e.target.value)}/></Field>
   <Field label="Geplande datum"><input type="date" value={planned} readOnly title="Wijzig de datum via de bestaande planning of volledige werkbonbewerking."/></Field>
   <Field label="Uitvoering"><select value={data.order.status} disabled><option value={data.order.status}>{sourceExecutionLabel(data.order.status)}</option></select></Field>
   <Field label="Notitie / terugkoppeling"><textarea rows={4} value={description} readOnly={!data.order.canEdit||pending} maxLength={10000} onChange={e=>edit('description',e.target.value)}/></Field>
  </div>{warnings.length>0&&<div className="ed-review-checks" role="alert"><p>De native planningscontrole vraagt je deze afwijkingen eerst te bevestigen.</p><ul>{warnings.map(w=><li key={w.key}>{w.message}</li>)}</ul></div>}
  <button className="ed-link" disabled={pending} onClick={()=>{if(!dirty||confirm('Niet-opgeslagen wijzigingen sluiten?'))onSource()}}>Open verbonden bron <ArrowUpRight size={14}/></button></>}
 </SourceNativeDialog>;
}

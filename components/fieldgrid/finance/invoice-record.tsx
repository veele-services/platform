"use client";
import {useCallback,useEffect,useRef,useState,useTransition} from 'react';
import type {InvoiceResources} from '@/lib/finance/invoice-resource';
import {invoiceOutstanding} from '@/lib/finance/invoice-resource';
import {registerManualPayment} from '@/app/(workspace)/app/finance-actions';
import {Button,Field,SourceLink} from '../crm/ui';
import {SourceNativeDialog} from '../source-native-dialog';
import {NativeInvoiceResourceModal} from '../resource-pages';
import {managementRequest} from '../management-cockpit/request';

type View='summary'|'details'|'payment'|'finalize'|'bundle';
const money=(value:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(value/100);
export function InvoiceRecord({kind,ids,view,tab='preview',today,onClose,onSaved,onView,onForbidden}:{kind:'invoice'|'concept';ids:string[];view:View;tab?:string;today:string;onClose:()=>void;onSaved:()=>void;onView:(view:View,tab?:string)=>void;onForbidden:()=>void}){
 const[wire,setWire]=useState<InvoiceResources|null>(null),[error,setError]=useState('');const busy=useRef(false),key=kind+':'+ids.join(',');
 const setBusy=useCallback((value:boolean)=>{busy.current=value},[]);
 useEffect(()=>{let alive=true,c:AbortController|null=null;const load=()=>{if(busy.current)return;c?.abort();const request=new AbortController();c=request;void managementRequest<InvoiceResources>('/api/invoices?'+new URLSearchParams({kind:key.split(':')[0],ids:key.split(':')[1]}),undefined,request.signal).then(data=>{if(alive&&!request.signal.aborted){setWire(data);setError('')}}).catch(e=>{if(alive&&!request.signal.aborted){setError(e.message);if(e.status===403){setWire(null);onForbidden()}}})};load();const focus=()=>{if(document.visibilityState==='visible')load()};const timer=setInterval(focus,30000);window.addEventListener('focus',focus);return()=>{alive=false;c?.abort();clearInterval(timer);window.removeEventListener('focus',focus)}},[key,onForbidden]);
 if(wire&&['details','finalize','bundle'].includes(view)){
  const modal=view==='bundle'?{type:'bundle' as const,rows:wire.rows}:view==='finalize'&&wire.rows.every(r=>r.kind==='concept')?{type:'finalize' as const,rows:wire.rows}:{type:'view' as const,row:wire.rows[0],tab};
  return <NativeInvoiceResourceModal key={key+view} modal={modal} setModal={next=>{if(!next)onClose();else if(next.type==='view')onView('details',next.tab);else onView(next.type)}} data={wire.data} presentation="sites" actions={wire.actions} onFinished={onSaved} onBusyChange={setBusy}/>;
 }
 if(!wire)return <SourceNativeDialog sourceForm title="Factuurgegevens" eyebrow="FACTUUR" description="" onClose={onClose}>{error?<p className="gov-error" role="alert">{error}</p>:<p role="status">Geautoriseerde factuurgegevens laden…</p>}</SourceNativeDialog>;
 return <InvoiceSummary key={key} wire={wire} view={view} today={today} onClose={onClose} onSaved={onSaved} onView={onView} onBusyChange={setBusy}/>;
}
function InvoiceSummary({wire,view,today,onClose,onSaved,onView,onBusyChange}:{wire:InvoiceResources;view:View;today:string;onClose:()=>void;onSaved:()=>void;onView:(view:View,tab?:string)=>void;onBusyChange:(value:boolean)=>void}){
 const row=wire.rows[0],item=row.item,invoice=row.kind==='invoice'?row.item:null;
 const number=invoice?.invoice_number??(row.kind==='concept'?'Concept '+row.item.number:'Conceptfactuur');
 const customer=wire.data.customers.find(c=>c.id===(invoice?.customer_id??(row.kind==='concept'?row.item.customerId:'')))?.name??'Factuurklant';
 const total=invoice?.total_cents??(row.kind==='concept'?row.item.totalCents:0),outstanding=invoice?invoiceOutstanding(invoice):0;
 const canPay=Boolean(invoice?.finalized_at&&['final','sent','partially_paid','overdue'].includes(invoice.status)&&outstanding>0&&wire.actions.manualPayment);
 const description=invoice?wire.data.invoiceLines.find(l=>l.invoice_id===invoice.id)?.description??'Factuur '+number:row.kind==='concept'?row.item.title:'';
 const[pending,start]=useTransition(),[amount,setAmount]=useState((outstanding/100).toFixed(2)),[date,setDate]=useState(today),[reference,setReference]=useState(''),[error,setError]=useState('');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const dirty=view==='payment'&&Boolean(reference||date!==today||amount!==(outstanding/100).toFixed(2));
 const close=()=>{if(!pending&&(!dirty||confirm('Je betalingsgegevens zijn nog niet opgeslagen. Wil je ze weggooien?')))onClose()};
 const save=()=>{if(!invoice||!canPay||pending)return;const payload=new FormData();payload.set('invoiceId',item.id);payload.set('amount',amount);payload.set('date',date);payload.set('reference',reference);onBusyChange(true);start(async()=>{try{const r=await registerManualPayment(payload);if(!alive.current)return;if(!r.ok){setError(r.error);return;}onSaved()}catch{if(alive.current)setError('De betaling kon niet worden bevestigd. Je invoer is behouden; opnieuw bewaren gebruikt dezelfde factuur en betalingsreferentie.')}finally{onBusyChange(false)}})};
 return <SourceNativeDialog sourceForm title={view==='payment'?'Betaling registreren':number} eyebrow={'FACTUUR / '+customer} description="" dirty={dirty} busy={pending} onClose={onClose} footer={<><Button disabled={pending} onClick={close}>{view==='payment'?'Annuleren':'Sluiten'}</Button>{view==='payment'?canPay&&<Button primary disabled={pending||reference.trim().length<2||!date||!(Number(amount)>0)||Number(amount)>outstanding/100} onClick={save}>{pending?'Betaling bewaren…':'Betaling boeken'}</Button>:canPay?<Button primary onClick={()=>onView('payment')}>Volledige betaling registreren</Button>:row.kind==='concept'&&wire.actions.finalize?<Button primary onClick={()=>onView('finalize')}>Definitief maken</Button>:null}</>}>
  <div className="ed-facts"><div><span>Klant</span><strong>{customer}</strong></div><div><span>Omschrijving</span><strong>{description}</strong></div><div><span>{row.kind==='concept'?'Conceptbedrag':'Openstaand bedrag'}</span><strong>{money(row.kind==='concept'?total:outstanding)}</strong></div></div>
  {view==='payment'&&<>{!canPay?<p>Deze factuur kan binnen je actuele bevoegdheden niet worden betaald of is al voldaan.</p>:<div className="ed-form-grid"><Field label="Bedrag"><input type="number" min="0.01" max={outstanding/100} step="0.01" value={amount} readOnly={pending} onChange={e=>{setAmount(e.target.value);setError('')}}/></Field><Field label="Datum"><input type="date" value={date} readOnly={pending} onChange={e=>{setDate(e.target.value);setError('')}}/></Field><Field label="Referentie"><input value={reference} readOnly={pending} minLength={2} maxLength={200} onChange={e=>{setReference(e.target.value);setError('')}}/></Field></div>}</>}
  {error&&<p role="alert" className="gov-error">{error}</p>}
  <SourceLink id={number} onClick={()=>{if(!pending&&(!dirty||confirm('Je betalingsgegevens zijn nog niet opgeslagen. Wil je ze weggooien?')))onView('details')}}/>
 </SourceNativeDialog>;
}

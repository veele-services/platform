"use client";
import {useState} from 'react';
import {Check,Eye} from 'lucide-react';
import {money} from '@/lib/commercial/model';
import type {CustomerWorkspace} from '@/lib/customer-portal/model';
import {customerInvoiceLabel,customerInvoiceOverdue,customerInvoicePayable,type CustomerResources} from '@/lib/customer-portal/presentation';
import type {CustomerPortalActions} from './portal';

/** The source invoice presentation uses canonical balances and the existing
 * payment command. A click never marks an invoice paid in the browser. */
export function SourceCustomerInvoices({resources,workspace,actions,available}:{resources:CustomerResources;workspace:CustomerWorkspace;actions:CustomerPortalActions;available:boolean}){
 const [selected,setSelected]=useState<string[]>([]),[filter,setFilter]=useState('all');
 const open=resources.invoices.filter(invoice=>invoice.balance>0&&invoice.status!=='credited'),paid=resources.invoices.filter(invoice=>invoice.balance===0&&invoice.status!=='credited');
 const payable=open.filter(customerInvoicePayable),selection=payable.filter(invoice=>selected.includes(invoice.id));
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:workspace.tenant.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(resources.now));
 const rows=resources.invoices.filter(invoice=>filter==='all'||(filter==='open'?invoice.balance>0&&invoice.status!=='credited':invoice.balance===0&&invoice.status!=='credited'));
 return <><div className="portal-demo-invoice-summary"><div className="card card-pad"><small>Openstaand</small><strong>{money(open.reduce((sum,invoice)=>sum+invoice.balance,0))}</strong></div><div className="card card-pad"><small>Te betalen facturen</small><strong>{open.length}</strong></div><div className="card card-pad"><small>Betaald</small><strong>{paid.length}</strong></div></div>
 <div className="portal-demo-section-actions"><p>{!available||!resources.paymentEnabled?'Je organisatie heeft online betalen nog niet aangesloten. Neem bij vragen contact op.':'Selecteer een of meer facturen om een betaling te bekijken.'}</p><button type="button" className="primary-button" disabled={!available||!resources.paymentEnabled||!selection.length} onClick={()=>actions.pay(selection.map(invoice=>invoice.id))}>Geselecteerd betalen ({selection.length})</button></div>
 <div className="card">{rows.map(invoice=><div className="portal-demo-listrow" key={invoice.id}>{invoice.balance===0?<Check/>:<input aria-label={`Selecteer ${invoice.number}`} type="checkbox" checked={selection.some(item=>item.id===invoice.id)} disabled={!customerInvoicePayable(invoice)} onChange={event=>setSelected(event.target.checked?[...selected,invoice.id]:selected.filter(id=>id!==invoice.id))}/>}<span><strong>{invoice.number}</strong><small>{invoice.description}</small></span><b>{money(invoice.balance||invoice.total)}</b><span className={`chip ${invoice.balance===0?'green':customerInvoiceOverdue(invoice,today)?'red':'gray'}`}>{customerInvoiceOverdue(invoice,today)?'Verlopen':customerInvoiceLabel(invoice)}</span><button type="button" className="fg-action-icon" aria-label={`Factuur ${invoice.number} bekijken`} onClick={()=>actions.openInvoice(invoice)}><Eye/></button></div>)}{!rows.length&&<div className="card-pad"><h3>Geen facturen in deze selectie</h3><p>Je vindt hier de facturen die voor jou beschikbaar zijn.</p></div>}</div>
 <details className="sites-native-controls"><summary>Facturen filteren en selecteren</summary><div className="portal-demo-buttonrow"><label className="mc-field"><span>Facturen tonen</span><select value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">Alle facturen</option><option value="open">Openstaand</option><option value="paid">Betaald</option></select></label><button type="button" className="secondary-button" onClick={()=>setSelected(selection.length===payable.length?[]:payable.map(invoice=>invoice.id))}>{selection.length===payable.length?'Selectie wissen':'Selecteer alle openstaande'}</button></div><p>Een betaling telt pas na bevestiging van de betaalprovider.</p></details></>;
}

"use client";

import {Download,Eye} from "lucide-react";
import type {CustomerWorkspace} from "@/lib/customer-portal/model";
import {customerDate,customerInvoiceLabel,type CustomerInvoice} from "@/lib/customer-portal/presentation";
import {money} from "@/lib/commercial/model";
import {FieldgridBrand} from "../brand";
import {useSourcePortal} from "../portals/context";
import {CustomerDialog} from "./dialog";

/** The supplied document composition uses the native invoice projection.
 * Original protected bytes and provider-confirmed payment remain separate. */
export function CustomerInvoiceDialog({invoice,workspace,tenantId,paymentEnabled,close,pay}:{invoice:CustomerInvoice;workspace:CustomerWorkspace;tenantId:string;paymentEnabled:boolean;close:()=>void;pay:(ids:string[])=>void}){
 const source=useSourcePortal(),button=source?"secondary-button":"button",primary=source?"primary-button":"button primary";
 const file=`/api/customer-portal/files/invoice/${invoice.id}?account=${workspace.account.id}`;
 const details=<div className="details section-gap"><div><small>Factuurdatum</small><strong>{customerDate(invoice.issuedOn,workspace.tenant.timezone)}</strong></div><div><small>Vervaldatum</small><strong>{customerDate(invoice.dueOn,workspace.tenant.timezone)}</strong></div><div><small>Totaal</small><strong>{money(invoice.total)}</strong></div><div><small>Betaald</small><strong>{money(invoice.paid)}</strong></div><div><small>Gecrediteerd</small><strong>{money(invoice.credited)}</strong></div><div><small>Resterend</small><strong>{money(invoice.balance)}</strong></div></div>;
 return <CustomerDialog title={invoice.number} guideKey="feature.payment" kicker="Facturen" close={close} footer={<><button className={button} type="button" onClick={close}>Sluiten</button>{invoice.hasPdf&&<><a className={button} href={file+"&preview=1"} target="_blank" rel="noopener noreferrer"><Eye/>PDF bekijken</a><a className={button} href={file}><Download/>PDF opslaan</a></>}{invoice.balance>0&&invoice.status!=="credited"&&<button className={primary} disabled={!paymentEnabled} onClick={()=>pay(invoice.paymentInvoiceIds??[invoice.id])}>{invoice.paymentPending?"Betaling hervatten":"Betalen"}</button>}</>}>
  {source?<><div className="portal-demo-document sites-invoice-document"><FieldgridBrand tenantName={workspace.tenant.name} logoUrl={workspace.tenant.hasLogo?`/api/branding/${tenantId}/email-logo`:null}/><h2>{invoice.description}</h2><p>{workspace.tenant.name} → {workspace.profile.company}</p><div className="portal-demo-listrow"><span>{invoice.number}</span><strong>{money(invoice.total)}</strong></div><p>{customerInvoiceLabel(invoice)} · Vervaldatum {customerDate(invoice.dueOn,workspace.tenant.timezone,true)}</p></div><details className="sites-native-controls"><summary>Factuurgegevens en betaaloverzicht</summary>{details}</details></>:<><div className="row"><h3>{invoice.description}</h3><span className="chip gray">{customerInvoiceLabel(invoice)}</span></div>{details}</>}
  {!!invoice.sources?.length&&<section className="section-gap" aria-labelledby={`invoice-sources-${invoice.id}`}><h3 id={`invoice-sources-${invoice.id}`}>Werkbonnen op deze factuur</h3><div className="portal-demo-list">{invoice.sources.map(item=><div className="portal-demo-listrow" key={item.id}><span><strong>{item.number}</strong><small>{item.object}{item.executionOn?` · ${customerDate(item.executionOn,workspace.tenant.timezone)}`:""}</small></span><strong>{money(item.total)}</strong><a className={button} href={`/klant?view=appointments&visit=${item.id}`}>Open bezoek</a></div>)}</div></section>}
  {invoice.balance>0&&!paymentEnabled&&<p className={source?"mc-muted":""} role="status">Je organisatie heeft online betalen nog niet aangesloten. Neem bij vragen contact op.</p>}
 </CustomerDialog>;
}

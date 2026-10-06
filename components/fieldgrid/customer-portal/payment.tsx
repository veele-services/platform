"use client";
import { useRef,useState,useTransition } from "react";
import { LockKeyhole } from "lucide-react";
import type { CustomerInvoice } from "@/lib/customer-portal/presentation";
import { customerInvoicePayable } from "@/lib/customer-portal/presentation";
import { money } from "@/lib/commercial/model";
import { startCustomerPayment } from "@/lib/customer-portal/payment-action";
import { CustomerDialog } from "./dialog";
export function CustomerPaymentDialog({accountId,invoices,paymentEnabled,close,refresh}:{accountId:string;invoices:CustomerInvoice[];paymentEnabled:boolean;close:()=>void;refresh:()=>Promise<unknown>}){
 const commandId=useRef(crypto.randomUUID()),[pending,start]=useTransition(),[error,setError]=useState(""),[settled,setSettled]=useState(false);
 const selectedIds=new Set(invoices.map(invoice=>invoice.id)),valid=invoices.length>0&&invoices.every(invoice=>customerInvoicePayable(invoice)||(invoice.paymentPending&&!!invoice.paymentInvoiceIds?.length&&invoice.paymentInvoiceIds.length===selectedIds.size&&invoice.paymentInvoiceIds.every(id=>selectedIds.has(id))));
 return <CustomerDialog guideKey="feature.payment" title="Betaling controleren" kicker="Facturen" close={close} busy={pending} footer={<><button className="button" type="button" disabled={pending} onClick={close}>Sluiten</button>{!settled&&<button className="button primary" type="button" disabled={pending||!valid||!paymentEnabled} onClick={()=>start(async()=>{try{const result=await startCustomerPayment({accountId,invoiceIds:invoices.map(invoice=>invoice.id),commandId:commandId.current});if(!result.ok){setError(result.error??"De betaling kon niet worden gestart.");return;}if(result.checkoutUrl){window.location.assign(result.checkoutUrl);return;}if(result.settled){setSettled(true);await refresh();}else setError("Er is nog geen betaalbevestiging ontvangen. Controleer de factuurstatus opnieuw.");}catch{setError("De betaling kon niet worden gestart. Probeer opnieuw; de factuurstatus blijft leidend.");}})}><LockKeyhole/>{pending?"Betaling voorbereiden…":"Veilig verder naar Mollie"}</button>}</>}>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {!paymentEnabled&&!settled&&<p role="status">Je organisatie heeft online betalen nog niet aangesloten. Neem bij vragen contact op.</p>}
  {settled?<p role="status">De geselecteerde facturen zijn volgens de actuele administratie voldaan.</p>:<><p className="form-intro">Je betaalt het actuele resterende bedrag. De betaalprovider bevestigt de betaling aan je organisatie.</p><div className="pay-invoices">{invoices.map(invoice=><div className="ticket-row" key={invoice.id}><div><strong>{invoice.number}</strong><p>{invoice.description}</p></div><strong>{money(invoice.balance)}</strong></div>)}</div><div className="payment-check-total section-gap"><span>Totaal resterend</span><strong>{money(invoices.reduce((sum,invoice)=>sum+invoice.balance,0))}</strong></div>{!valid&&<p className="form-error" role="alert">Deze selectie is gewijzigd of bevat een lopende betaling. Controleer de actuele facturen.</p>}<p className="meta section-gap">Terugkeren naar het portaal is geen betaalbevestiging. Je factuur wordt bijgewerkt zodra de geverifieerde bevestiging is ontvangen.</p></>}
 </CustomerDialog>;
}

"use client";
import { ContentSection } from "../content-section";
import { ReportDocument } from "./report-document";
export { ReportDocument, ReportSignatures } from "./report-document";
import { ReportReviewDetails } from "./review-details";
import "../staff/staff-report.css";
import {useRef} from "react";
import {useReportReview} from "./use-report-review";
import { changeWorkOrderSignaturePolicy,waiveWorkOrderSignature } from "@/lib/work-orders/report-actions";
import { reportStateLabels,signatureModeLabels,signatureSourceLabels } from "@/lib/work-orders/report-model";

/** Backoffice is deliberately a receiving/reviewing surface. No capture action
 * or signature-upload control is imported into this component. */
export function ReportPanel(props:{orderId:string;canReview:boolean}){return <NativeReportPanel key={props.orderId} {...props}/>;}
function NativeReportPanel({orderId,canReview}:{orderId:string;canReview:boolean}){
 const {data,dossier,error,reason,pending,current,load,review,setError,setReason,startTransition,changed,acknowledge}=useReportReview(orderId,canReview);
 const policyMutation=useRef<string|null>(null);
 return <section className="report-panel" aria-label="Rapport en handtekening">{error&&<p role="alert">{error}</p>}{!data&&!error&&<p>Rapport laden…</p>}
  {changed&&data&&<div role="alert"><p>Er is een nieuwe rapportversie ontvangen. Bekijk de actuele versie voordat je beoordeelt. Je controleopmerking is behouden.</p><button type="button" className="secondary-button" onClick={acknowledge}>Actuele rapportversie bekeken</button></div>}
  {data&&<><ContentSection title="Opleverrapport"><div className="report-document-facts"><div><small>Rapportstatus</small><strong>{reportStateLabels[data.state]??data.state}</strong></div><div><small>Klantondertekening</small><strong>{signatureModeLabels[data.policy.mode]}</strong><small>{signatureSourceLabels[data.policy.source]??"Ondertekenafspraak"}</small></div></div>
  {data.canEditPolicy&&<details><summary>Ondertekenafspraak gemotiveerd wijzigen</summary><form key={data.orderVersion} onChange={()=>{policyMutation.current=null;}} onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);policyMutation.current??=crypto.randomUUID();startTransition(async()=>{const result=await changeWorkOrderSignaturePolicy({orderId,version:data.orderVersion,mode:String(form.get("mode")),employeeRequired:form.get("employeeRequired")==="on",reason:String(form.get("reason")),mutationId:policyMutation.current!});if(!result.ok)setError(result.error);else{setError("");policyMutation.current=null;await load();}});}}><label>Klantondertekening<select name="mode" defaultValue={data.configuredMode??"inherit"}><option value="inherit">Volg object, template of tenant</option><option value="none">Niet nodig</option><option value="optional">Optioneel</option><option value="required">Verplicht</option></select></label><label><input name="employeeRequired" type="checkbox" defaultChecked={data.employeeSignatureRequired}/> Aanvullende medewerkerondertekening</label><label>Reden<textarea name="reason" required minLength={5} maxLength={2000}/></label><p>Bestaande rapportversies en handtekeningen blijven ongewijzigd. Een bestaande rapportplicht kan hier niet worden verlaagd.</p><button className="secondary-button" disabled={pending}>Afspraak met reden vastleggen</button></form></details>}
  {data.state==="waiting_signature"&&<p>Wacht op handtekening — vast te leggen in de personeelsapp.</p>}
  {!current&&<p>Nog geen vastgelegde rapportversie ontvangen. Bestaande notities blijven in het dossier beschikbaar.</p>}
  {!!data.historicalSignatures.length&&<section><h3>Eerder vastgelegde handtekeningen</h3><p>Historisch bewijs zonder vastgelegde inhoudsreferentie. Dit bevestigt geen nieuwe rapportversie.</p>{data.historicalSignatures.map(s=><p key={s.id}>{s.name} · versie {s.version} · {new Date(s.signedAt).toLocaleString("nl-NL")}</p>)}</section>}
  </ContentSection>{dossier&&data.canReview?<ReportReviewDetails dossier={dossier} report={data} current={current}/>:current&&<ReportDocument report={current}/>}{current&&<>
   {canReview&&data.canReview&&["review","waiting_signature","correction"].includes(current.state)&&<ContentSection title="Rapportcontrole">
    <label>Controleopmerking / reden correctie<textarea disabled={pending} value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000}/></label>
    <div className="review-decision-grid"><button className="secondary-button" disabled={pending||changed||reason.trim().length<3} onClick={()=>review("returned")}>Vraag correctie</button><button className="primary-button" disabled={pending||changed||current.state!=="review"||!dossier} onClick={()=>review("approved")}>Keur goed</button></div>
    {data.canWaive&&current.state==="waiting_signature"&&<button className="secondary-button" disabled={pending||reason.trim().length<5} onClick={()=>startTransition(async()=>{const r=await waiveWorkOrderSignature({reportId:current.id,reason});if(!r.ok)setError(r.error);else await load();})}>Klantondertekening vrijstellen met reden</button>}
   </ContentSection>}
  </>}
  {data.versions.slice(1).map(r=><details key={r.id}><summary>Versie {r.version} · {reportStateLabels[r.state]??r.state}</summary><ReportDocument report={r}/></details>)}
  </>}
 </section>;
}

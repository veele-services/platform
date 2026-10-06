"use client";
import { ReportSummary } from "./report-summary";
import { useCallback,useEffect,useRef,useState,useTransition } from "react";
import { changeWorkOrderSignaturePolicy,loadWorkOrderReport,reviewWorkOrderReport,waiveWorkOrderSignature } from "@/lib/work-orders/report-actions";
import { reportStateLabels,signatureModeLabels,signatureSourceLabels,type ReportVersion,type WorkOrderReport } from "@/lib/work-orders/report-model";

export function ReportDocument({report,signaturePreview=false}:{report:ReportVersion;signaturePreview?:boolean}){
 return <section className="report-detail" aria-label={`Klantrapport versie ${report.version}`}>
  <ReportSummary snapshot={report.snapshot}/><p className="preserved">{report.snapshot.summary}</p><small>Rapportversie {report.version} · {report.contentHash}</small>
  {report.snapshot.attachments.map(a=><a key={a.id} href={`/api/files/work-order-report/${report.id}?asset=${a.id}${signaturePreview?`&signatureHash=${report.contentHash}`:""}`} target="_blank" rel="noreferrer">{a.name}</a>)}
  {!signaturePreview&&report.signatures.map(s=><figure key={s.id}>
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img style={{maxWidth:"100%",width:280}} src={`/api/files/work-order-report/${report.id}?asset=${s.id}`} alt={`Ontvangen handtekening van ${s.name}`}/>
   <figcaption>{s.name} · {s.capacity} · versie {report.version} · {new Intl.DateTimeFormat("nl-NL",{dateStyle:"short",timeStyle:"short",timeZone:report.snapshot.timezone}).format(new Date(s.signedAt))} · personeelsapp op locatie{s.capturedBy&&` · vastgelegd door ${s.capturedBy}`}</figcaption>
  </figure>)}
  {!signaturePreview&&<a className="secondary-button" href={`/api/files/work-order-report/${report.id}`} target="_blank" rel="noreferrer">Rapport-PDF openen</a>}
 </section>;
}

/** Backoffice is deliberately a receiving/reviewing surface. No capture action
 * or signature-upload control is imported into this component. */
export function ReportPanel({orderId,canReview}:{orderId:string;canReview:boolean}){
 const [data,setData]=useState<WorkOrderReport|null>(null),[error,setError]=useState(""),[reason,setReason]=useState(""),[pending,startTransition]=useTransition();
 const policyMutation=useRef<string|null>(null);
 const load=useCallback(async()=>{const result=await loadWorkOrderReport(orderId);if(result.ok)setData(result.data);else setError(result.error);},[orderId]);
 useEffect(()=>{const handle=window.setTimeout(()=>{void load();},0);return()=>window.clearTimeout(handle);},[load]);
 const current=data?.versions[0];
 const review=(decision:"approved"|"returned")=>{if(!current)return;startTransition(async()=>{const result=await reviewWorkOrderReport({orderId,reportId:current.id,decision,reason});if(!result.ok)setError(result.error);else{setError("");setReason("");await load();}});};
 return <section aria-label="Rapport en handtekening">
  <h2>Rapport en handtekening</h2>{error&&<p role="alert">{error}</p>}{!data&&!error&&<p>Rapport laden…</p>}
  {data&&<><p>{reportStateLabels[data.state]??data.state}</p><p>Klantondertekening: {signatureModeLabels[data.policy.mode]} — {signatureSourceLabels[data.policy.source]??data.policy.source}</p>
  {data.canEditPolicy&&<details><summary>Ondertekenafspraak gemotiveerd wijzigen</summary><form key={data.orderVersion} onChange={()=>{policyMutation.current=null;}} onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);policyMutation.current??=crypto.randomUUID();startTransition(async()=>{const result=await changeWorkOrderSignaturePolicy({orderId,version:data.orderVersion,mode:String(form.get("mode")),employeeRequired:form.get("employeeRequired")==="on",reason:String(form.get("reason")),mutationId:policyMutation.current!});if(!result.ok)setError(result.error);else{setError("");policyMutation.current=null;await load();}});}}><label>Klantondertekening<select name="mode" defaultValue={data.configuredMode??"inherit"}><option value="inherit">Volg object, template of tenant</option><option value="none">Niet nodig</option><option value="optional">Optioneel</option><option value="required">Verplicht</option></select></label><label><input name="employeeRequired" type="checkbox" defaultChecked={data.employeeSignatureRequired}/> Aanvullende medewerkerondertekening</label><label>Reden<textarea name="reason" required minLength={5} maxLength={2000}/></label><p>Bestaande rapportversies en handtekeningen blijven ongewijzigd. Een bestaande rapportplicht kan hier niet worden verlaagd.</p><button className="secondary-button" disabled={pending}>Afspraak met reden vastleggen</button></form></details>}
  {data.state==="waiting_signature"&&<p>Wacht op handtekening — vast te leggen in de personeelsapp.</p>}
  {!current&&<p>Nog geen vastgelegde rapportversie ontvangen. Bestaande notities blijven in het dossier beschikbaar.</p>}
  {!!data.historicalSignatures.length&&<section><h3>Eerder vastgelegde handtekeningen</h3><p>Historisch bewijs zonder vastgelegde inhoudsreferentie. Dit bevestigt geen nieuwe rapportversie.</p>{data.historicalSignatures.map(s=><p key={s.id}>{s.name} · versie {s.version} · {new Date(s.signedAt).toLocaleString("nl-NL")}</p>)}</section>}
  {current&&<><h3>Rapportversie {current.version}</h3><ReportDocument report={current}/>
   {canReview&&data.canReview&&["review","waiting_signature","correction"].includes(current.state)&&<section>
    <label>Controleopmerking / reden correctie<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000}/></label>
    <div className="review-decision-grid"><button className="secondary-button" disabled={pending||reason.trim().length<3} onClick={()=>review("returned")}>Vraag correctie</button><button className="primary-button" disabled={pending||current.state!=="review"} onClick={()=>review("approved")}>Keur goed</button></div>
    {data.canWaive&&current.state==="waiting_signature"&&<button className="secondary-button" disabled={pending||reason.trim().length<5} onClick={()=>startTransition(async()=>{const r=await waiveWorkOrderSignature({reportId:current.id,reason});if(!r.ok)setError(r.error);else await load();})}>Klantondertekening vrijstellen met reden</button>}
   </section>}
  </>}
  {data.versions.slice(1).map(r=><details key={r.id}><summary>Versie {r.version} · {reportStateLabels[r.state]??r.state}</summary><ReportDocument report={r}/></details>)}
  </>}
 </section>;
}

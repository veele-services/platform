import { ReportSummary } from "./report-summary";
import { ContentSection } from "../content-section";
import { FileText } from "lucide-react";
import type { ReportVersion } from "@/lib/work-orders/report-model";
export function ReportDocument({ report, signaturePreview = false }: { report: ReportVersion; signaturePreview?: boolean }) {
 return <div className="report-detail" aria-label={`Klantrapport versie ${report.version}`}>
  <ContentSection title={`Werkrapport · versie ${report.version}`} subtitle={report.snapshot.number} actions={!signaturePreview && <a className="secondary-button" href={`/api/files/work-order-report/${report.id}`} target="_blank" rel="noreferrer"><FileText size={16}/>Rapport-PDF openen</a>}>
   <div className="report-document-facts"><div><small>Opdrachtgever</small><strong>{report.snapshot.customer.name}</strong></div><div><small>Locatie</small><strong>{report.snapshot.object.name}</strong></div></div>
   <p className="preserved report-customer-summary">{report.snapshot.summary}</p>
  </ContentSection>
  <ReportSummary snapshot={report.snapshot}/>
  {!!report.snapshot.attachments.length && <ContentSection title="Documenten bekijken"><div className="report-asset-links">{report.snapshot.attachments.map(attachment => <a className="secondary-button" key={attachment.id} href={`/api/files/work-order-report/${report.id}?asset=${attachment.id}${signaturePreview ? `&signatureHash=${report.contentHash}` : ""}`} target="_blank" rel="noreferrer"><FileText size={16}/>{attachment.name}</a>)}</div></ContentSection>}
  {!signaturePreview && <ReportSignatures report={report}/>}
 </div>;
}

export function ReportSignatures({report}:{report:ReportVersion}) {
 return <div className="report-detail">  {report.signatures.filter(signature => report.projection !== "customer_copy" || signature.kind === "customer").map(signature => <ContentSection key={signature.id} title={signature.kind === "customer" ? "Handtekening opdrachtgever" : "Handtekening medewerker"}>
   <figure className="report-signature-proof">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/api/files/work-order-report/${report.id}?asset=${signature.id}`} alt={`Ontvangen handtekening van ${signature.name}`}/>
    <figcaption><strong>{signature.name}</strong><span>{signature.capacity}</span><small>{new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: report.snapshot.timezone }).format(new Date(signature.signedAt))}{report.projection !== "customer_copy" && signature.capturedBy && ` · vastgelegd door ${signature.capturedBy}`}</small></figcaption>
   </figure>
  </ContentSection>)}
  {report.waiver&&<ContentSection title="Vrijstelling klantondertekening"><p>{report.waiver.reason}</p></ContentSection>}
  {!report.signatures.length&&!report.waiver&&<ContentSection title="Handtekeningen"><p>Geen handtekeningen ontvangen bij deze rapportversie.</p></ContentSection>}
 </div>;
}

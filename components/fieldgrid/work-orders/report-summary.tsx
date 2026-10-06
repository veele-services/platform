import { ContentSection } from "../content-section";
import type { ReportSnapshot } from "@/lib/work-orders/report-model";
import { reportExtraTotal } from "@/lib/work-orders/report-model";

const money = (value: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(value / 100);

/** The customer summary deliberately has no employee identity field. */
export function ReportSummary({ snapshot }: { snapshot: ReportSnapshot }) {
  const stamp = (at?: string) => at ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: snapshot.timezone }).format(new Date(at)) : "";
  return <div className="delivery-report-summary">
    <ContentSection className="report-summary-section" title="Uitgevoerde werkzaamheden">{snapshot.tasks.filter(task => !task.extraWork).map(task => <div className="content-row" key={task.id}><div><strong>{task.name}</strong><small>{task.executedQuantity} van {task.quantity} {task.unit} · {({ completed: "Uitgevoerd", partial: "Deels uitgevoerd", not_done: "Niet uitgevoerd", not_applicable: "Niet van toepassing" } as Record<string, string>)[task.result] ?? task.result}</small></div></div>)}</ContentSection>
    {snapshot.notes.length > 0 && <ContentSection className="report-summary-section" title="Notities">{snapshot.notes.map(note => <div className="content-row" key={note.id}><div><strong>Werknotitie</strong><p>{note.body}</p><small>{stamp(note.createdAt)}</small></div></div>)}</ContentSection>}
    {snapshot.tasks.some(task => task.extraWork) && <ContentSection className="report-summary-section" title="Meerwerk">{snapshot.tasks.filter(task => task.extraWork).map(task => <div className="content-row" key={task.id}><div><strong>{task.name}</strong><small>{task.executedQuantity} {task.unit}</small></div><strong className="content-row-amount">{task.extraUnitPriceCents == null ? "Ter beoordeling" : money(Math.round(task.extraUnitPriceCents * task.executedQuantity))}</strong></div>)}</ContentSection>}
    {((snapshot.materials?.length ?? 0) + (snapshot.expenses?.length ?? 0)) > 0 && <ContentSection className="report-summary-section" title="Materiaal & onkosten">{snapshot.materials?.map((material, index) => <div className="content-row" key={`material-${index}`}><div><strong>{material.description}</strong><small>{material.quantity} {material.unit}</small></div><strong className="content-row-amount">{money(Math.round((material.unitPriceCents ?? 0) * material.quantity))}</strong></div>)}{snapshot.expenses?.map(expense => <div className="content-row" key={expense.id}><div><strong>{expense.description}</strong><small>Onkosten</small></div><strong className="content-row-amount">{money(expense.amountCents)}</strong></div>)}</ContentSection>}
    {(snapshot.checklists?.length ?? 0) > 0 && <ContentSection className="report-summary-section" title="Controles">{snapshot.checklists?.map((answer,index)=><div className="content-row" key={index}><div><strong>{answer.question}</strong><small>{answer.name}</small><p>{answer.notApplicable ? `Niet van toepassing: ${answer.reason ?? ""}` : answer.type === "photo" ? "Bewijsfoto bijgevoegd" : answer.value === true ? "Ja / gecontroleerd" : answer.value === false ? "Nee" : String(answer.value ?? "")}{answer.unit && ` ${answer.unit}`}</p></div></div>)}</ContentSection>}
    {snapshot.attachments.length > 0 && <ContentSection className="report-summary-section" title="Bijlagen">{snapshot.attachments.map(file=><div className="content-row" key={file.id}><strong>{file.name}</strong></div>)}</ContentSection>}
    <div className="content-total"><span>Totaal extra kosten</span><strong>{money(reportExtraTotal(snapshot))}</strong></div>
  </div>;
}

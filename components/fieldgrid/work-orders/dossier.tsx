"use client";

import { PageHeading } from "../page-heading";
import { ContentSection } from "../content-section";
import { EmptyState } from "../empty-state";
import { ActionIcon } from "../action-icon";
import { DossierNavigation } from "../dossier-navigation";
import { HelpTip } from "../help-tip";
import { WorkOrderManagementDialog } from "./management";
import { canReleaseWorkOrder, WorkOrderReleaseDialog } from "./release";
import { ChecklistLinkDialog } from "./checklist-link";
import { WorkOrderTravelCrew } from "./travel-crew";
import { WorkOrderFinancial } from "./financial";
import { WorkOrderNotes } from "./notes";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Download, MoreHorizontal, Pencil, Plus, Send, UserMinus, RefreshCw, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TenantContext } from "@/lib/auth/context";
import { workOrderTabs, type WorkOrderDossier, type WorkOrderOptions } from "@/lib/work-orders/model";
import { historyActor, historyMessage } from "@/lib/work-orders/history";
import { mutateWorkOrder } from "@/app/app/work-order-actions";
import { executionLabels } from "@/lib/dossiers/status";
import { CommercialOrderContext } from "@/components/fieldgrid/commercial/order-context";
import { DossierChainPanel } from "@/components/fieldgrid/dossier-chain";
import { TicketContextPanel } from "../tickets/context";
import { ObjectVisitSignals } from "@/components/fieldgrid/objects/visit-signals";
import { TaskExecution } from "@/components/fieldgrid/task-execution";
import { businessToday } from "@/lib/personnel/dossier";
import { ReportPanel } from "./report";
import { WorkOrderRelatedActions } from "./related";
import { WorkOrderWizard } from "./wizard";
import { ChecklistPanel } from "./checklists";
import { WorkOrderCommunication } from "./communication";
import { billingLabels, contactRoleLabels, orderDate, orderHours, planningLabels, priorityLabels, reportLabels, signatureLabels, sourceLabels } from "./presentation";
import "./work-orders.css";
import "../dossier-consistency.css";

export function WorkOrderDossierPage({ data, options, tenant, tab, back, edit = false }: { data: WorkOrderDossier; options: WorkOrderOptions | null; tenant: TenantContext; tab: string; back: string; edit?: boolean }) {
  const order = data.order, router = useRouter();
  const reportingEnabled = tenant.enabledServices.includes("rapportage"), personnelEnabled = tenant.enabledServices.includes("personeel");
  const [editing, setEditing] = useState(edit && order.canEdit), [pending, transition] = useTransition(), [error, setError] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [management, setManagement] = useState<string | null>(null), [linkingChecklist, setLinkingChecklist] = useState(false);
  const href = (target: string) => `/app/werkbonnen/${order.id}?tab=${target}&return=${encodeURIComponent(back)}`;
  const date = (value: string | null | undefined) => orderDate(value, tenant.timezone);
  const refresh = () => transition(() => router.refresh());
  const command = (action: "publish" | "archive" | "cancel" | "delete") => {
    const reason = action === "cancel" ? window.prompt("Waarom wordt deze werkbon geannuleerd?") : undefined;
    if (action === "cancel" && !reason?.trim()) return;
    if (["archive", "delete"].includes(action) && !window.confirm(action === "archive" ? "Deze werkbon archiveren? Alle historie blijft bewaard." : "Dit ongebruikte concept verwijderen?")) return;
    setError(""); transition(async () => {
      try {
        const result = await mutateWorkOrder({ orderId: order.id, version: order.version, mutationId: crypto.randomUUID(), action, ...(reason ? { reason } : {}) });
        if (!result.ok) { setError(result.error); return; }
        toast.success(action === "publish" ? "Planning gepubliceerd" : "Werkbon bijgewerkt");
        if (action === "delete") router.push(back);
        router.refresh();
      } catch { setError("De wijziging is niet bevestigd. Vernieuw het dossier en probeer opnieuw."); }
    });
  };
  const activeAssignments = data.assignments.filter(assignment => !["cancelled", "returned"].includes(assignment.status));
  const historicalAssignments = data.assignments.filter(assignment => ["cancelled", "returned"].includes(assignment.status));
  const openReport = ["draft", "correction", "correction_required"].includes(order.reportState);
  const frozen = order.archived || ["approved", "invoice_ready", "invoiced", "cancelled"].includes(order.status);
  const canAdmin = data.canManage && tenant.roles.some(role => ["tenant_admin", "management"].includes(role)) && !frozen;
  const canLinkChecklist = reportingEnabled && data.canManage && !frozen && openReport;
  const editableResults = reportingEnabled && data.canManage && ["in_progress", "correction_required", "completed"].includes(order.status) && openReport;
  const plannedMinutes = activeAssignments.reduce((sum, assignment) => sum + Math.max(0, (Date.parse(assignment.end) - Date.parse(assignment.start)) / 60000), 0);
  const actualMinutes = data.times.filter(entry => entry.kind === "work" && entry.end).reduce((sum, entry) => sum + Math.max(0, (Date.parse(entry.end!) - Date.parse(entry.start)) / 60000), 0);
  const assignmentAction = (assignment: WorkOrderDossier["assignments"][number]) => canAdmin && <div className="wo-assignment-action">{!["completed", "returned", "cancelled"].includes(assignment.status) && ["draft", "correction"].includes(order.reportState) ? <button className="resource-action danger" disabled={pending} onClick={() => setManagement(assignment.id)}><UserMinus size={14}/>Verwijder</button> : <span className="dossier-muted">Afgesloten inzet<HelpTip label={`Waarom kan ${assignment.name} niet worden verwijderd?`}>{["completed", "returned", "cancelled"].includes(assignment.status) ? "Afgesloten bijdragen, geregistreerde uren en rapportbewijs blijven in de historie bewaard. De medewerker kan de bon niet meer wijzigen." : "De inzet hoort bij een ingediend rapport. Vraag eerst gemotiveerd een rapportcorrectie via Status wijzigen."}</HelpTip></span>}</div>;
  return <div className="wo-workspace wo-dossier" aria-busy={pending}>
    <Link className="dossier-back" href={back}><ArrowLeft size={16}/>Terug naar overzicht</Link>
    <PageHeading eyebrow={order.number} title={order.title || order.discipline} actions={<>
      {data.canManage && !order.publishedAt && order.canEdit && canReleaseWorkOrder(tenant, order, activeAssignments) && <button className="primary-button" disabled={pending} onClick={() => setReleasing(true)}><Send size={15}/>Werkbon vrijgeven</button>}
      {order.canEdit && options && <button className="secondary-button" disabled={pending} onClick={() => setEditing(true)}><Pencil size={15}/>Bewerk</button>}
      {canAdmin && <button className="secondary-button" disabled={pending} onClick={() => setManagement("status")}><RefreshCw size={15}/>Status wijzigen</button>}
      <Popover><PopoverTrigger asChild><button className="secondary-button" aria-label="Meer werkbonacties"><MoreHorizontal size={16}/>Meer</button></PopoverTrigger><PopoverContent className="resource-more-content" align="end"><Link href={`/app/planning?order=${order.id}`}>Open planbord</Link><Link href={href("planning")}>Medewerkers beheren</Link><Link href={href("historie")}>Bekijk historie</Link>{data.canManage && !order.archived && <button disabled={pending} onClick={() => command("archive")}>Archiveren</button>}{data.canManage && order.status !== "cancelled" && <button disabled={pending} onClick={() => command("cancel")}>Annuleren met reden</button>}{order.canDelete && <button disabled={pending} onClick={() => command("delete")}>Ongebruikt concept verwijderen</button>}</PopoverContent></Popover>
    </>}/>
    <div className="wo-heading-metadata"><span>{order.customer} · {order.object}</span><span className="wo-status">{executionLabels[order.status] ?? "Nog niet gestart"}</span></div>
    {error && <p role="alert" className="wo-error">{error}</p>}
    {order.assignedPersonnel < order.requiredPersonnel && order.status !== "cancelled" && <p className="dossier-notice">Bezetting: {order.assignedPersonnel} van {order.requiredPersonnel} medewerkers ingepland.</p>}
    {reportingEnabled && order.signatureRequired && !["signed", "valid", "waived"].includes(order.signatureState) && order.reportState !== "draft" && <p className="dossier-notice">Wacht op handtekening — vast te leggen in de personeelsapp.</p>}
    <div className="dossier-tabbed-content"><DossierNavigation label="Onderdelen werkbondossier" current={tab} tabs={workOrderTabs.filter(([id]) => id !== "financieel" || data.finance).map(([id, title]) => ({ id, title, href: href(id) }))}/><div className="dossier-tab-surface">
    {tab === "overzicht" && <>
      <div className="wo-grid"><ContentSection className="wo-section" subtitle="WERKBON" title="Afspraak & werkzaamheden"><dl className="wo-facts">
        <div><dt>Klant</dt><dd><Link href={`/app/klanten/${order.customerId}`}>{order.customer}</Link></dd></div><div><dt>Object</dt><dd><Link href={`/app/objecten/${order.objectId}`}>{order.object}</Link></dd></div>
        <div><dt>Planning</dt><dd>{planningLabels[order.planningState] ?? "In te delen"}</dd></div><div><dt>Uitvoering</dt><dd>{date(order.start)}{order.end && <> – {date(order.end)}</>}</dd></div>
        <div><dt>Klantvenster</dt><dd>{order.windowStart ? `${date(order.windowStart)} – ${date(order.windowEnd)}` : "Niet vastgelegd"}</dd></div><div><dt>Deadline</dt><dd>{order.deadline ? date(order.deadline) : "Niet vastgelegd"}</dd></div>
        <div><dt>Dienst / prioriteit</dt><dd>{order.discipline} · {priorityLabels[order.priority] ?? order.priority}</dd></div><div><dt>Bron</dt><dd>{sourceLabels[order.source] ?? "Handmatig"}</dd></div>
        <div><dt>Klantreferentie</dt><dd>{order.customerReference || "Niet vastgelegd"}</dd></div><div><dt>Locatieonderdeel</dt><dd>{order.locationLabel || "Gehele object"}</dd></div>
      </dl>{order.description && <p className="wo-prewrap">{order.description}</p>}{order.labels.length > 0 && <p>{order.labels.join(" · ")}</p>}</ContentSection>
      <ContentSection className="wo-section" subtitle="KLANT" title="Contactpersonen"><div className="wo-list">{data.contacts.map(contact => <article key={contact.id} className="wo-record"><strong>{contact.name}</strong><small>{contact.roles.map(role => contactRoleLabels[role] ?? role).join(" · ")}</small><p>{contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}{contact.email && <> {contact.phone && " · "}<a href={`mailto:${contact.email}`}>{contact.email}</a></>}</p></article>)}{!data.contacts.length && <EmptyState title="Nog geen contactpersonen" description="Leg een contactpersoon vast voor deze werkbon of in het klantdossier."/>}</div></ContentSection></div>
      <ContentSection className="wo-section" title="Medewerkers" help="Actieve bezetting en individuele uitvoering staan hier. Beheer inzet en reisinformatie in Planning & personeel." actions={<Link className="secondary-button" href={href("planning")}>Medewerkers beheren</Link>}><div className="wo-assignment-list">{activeAssignments.map(assignment => <article className="wo-assignment-record" key={assignment.id}><div><strong>{assignment.name}</strong><small>{assignment.personnelId === order.leadPersonnelId ? "Uitvoeringsverantwoordelijke · " : ""}{date(assignment.start)} – {date(assignment.end)}</small></div><span className="wo-status">{executionLabels[assignment.status] ?? "Ingepland"}</span>{assignmentAction(assignment)}</article>)}</div>{!activeAssignments.length && <EmptyState title="Nog geen medewerkers ingepland" description="Open Planning & personeel om medewerkers voor deze werkbon in te plannen."/>}</ContentSection>
      <ContentSection className="wo-section" title="Instructies" help="De actuele objectinstructies staan hier. Klantverzoeken en opvolging vind je onder Communicatie & bijlagen.">{order.instructions && <p className="wo-prewrap">{order.instructions}</p>}<ObjectVisitSignals orderId={order.id}/></ContentSection>
    </>}
    {tab === "planning" && <>
      <ContentSection className="wo-section" title="Medewerkers & individuele inzet" subtitle="PLANNING" help="Verwijder actieve medewerkers met reden. Geregistreerde uren en afgesloten bijdragen blijven in de historie bewaard." actions={<Link className="secondary-button" href={`/app/planning?order=${order.id}`}><CalendarDays size={15}/>Open planbord</Link>}>
        <div className="wo-facts wo-planning-summary"><div><dt>Bezetting</dt><dd>{order.assignedPersonnel} van {order.requiredPersonnel} medewerkers</dd></div><div><dt>Geplande arbeidsuren</dt><dd>{orderHours(plannedMinutes)} uur</dd></div><div><dt>Bezoekduur</dt><dd>{order.start&&order.end?`${orderHours((Date.parse(order.end)-Date.parse(order.start))/60000)} uur`:"Nog niet gepland"}</dd></div></div>
        <div className="table-scroll"><table className="resource-table"><thead><tr>{["Medewerker", "Geplande inzet", "Uitvoering", "Gezien", ...(canAdmin ? ["Acties"] : [])].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{activeAssignments.map(assignment => <tr key={assignment.id}><td><strong>{assignment.name}</strong>{assignment.personnelId === order.leadPersonnelId && <small>Uitvoeringsverantwoordelijke</small>}</td><td>{date(assignment.start)}<small>tot {date(assignment.end)}</small></td><td>{executionLabels[assignment.status] ?? "Ingepland"}{assignment.actualStart && <small>Gestart {date(assignment.actualStart)}</small>}{assignment.actualEnd && <small>Gestopt {date(assignment.actualEnd)}</small>}</td><td>{assignment.seenAt ? date(assignment.seenAt) : "Nog niet gezien"}</td>{canAdmin && <td>{assignmentAction(assignment)}</td>}</tr>)}</tbody></table></div>{!activeAssignments.length && <EmptyState title="Nog geen actieve inzet" description="Deel medewerkers voor deze werkbon in via het planbord."/>}
        {historicalAssignments.length > 0 && <details className="wo-history-assignments"><summary>Eerdere inzet ({historicalAssignments.length})<ChevronDown size={16}/></summary><div className="wo-assignment-list">{historicalAssignments.map(assignment => <article key={assignment.id} className="wo-assignment-record"><div><strong>{assignment.name}</strong><small>{date(assignment.start)} – {date(assignment.end)}</small></div><span className="wo-status">{executionLabels[assignment.status] ?? "Teruggegeven"}</span></article>)}</div></details>}
      </ContentSection>
      <ContentSection className="wo-section" id="uren" title="Urenregistratie" subtitle="WERKTIJD" help="Afgeronde arbeidsuren komen uit de werkregistraties. Actieve registraties zijn afzonderlijk zichtbaar en geen automatische meerwerkkosten.">
        {personnelEnabled ? <><div className="wo-section-total"><span>Afgeronde arbeidsuren</span><strong>{orderHours(actualMinutes)} uur</strong></div><div className="table-scroll"><table className="resource-table"><thead><tr>{["Medewerker", "Start", "Einde", "Soort", "Status"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.times.map(entry => <tr key={entry.id}><td>{entry.name}</td><td>{date(entry.start)}</td><td>{entry.end ? date(entry.end) : "Actief"}</td><td>{({ work: "Werk", travel: "Reis", break: "Pauze", correction: "Correctie" } as Record<string, string>)[entry.kind] ?? "Registratie"}</td><td>{({ draft: "Concept", submitted: "Ingediend", approved: "Goedgekeurd", rejected: "Afgekeurd" } as Record<string, string>)[entry.status] ?? "Vastgelegd"}</td></tr>)}</tbody></table></div>{!data.times.length && <EmptyState title="Nog geen uren geregistreerd" description="De werkregistraties van medewerkers verschijnen hier zodra de uitvoering begint."/>}</> : <p>Urenregistratie is niet beschikbaar: de module Personeel is niet ingeschakeld.</p>}
      </ContentSection>
      {order.start && <WorkOrderTravelCrew day={businessToday(new Date(order.start), tenant.timezone)} orderId={order.id} assignments={data.assignments}/>}
    </>}
    {tab === "taken" && <>
      <ContentSection className="wo-section" id="uitvoering" title="Werkzaamheden" help="Open een taak voor de individuele bijdragen en een gecontroleerde resultaatcorrectie."><div className="wo-task-records">{data.tasks.map(task => <details className="wo-task-detail" key={task.id}><summary><div><strong>{task.task_name}</strong><small>{task.task_code} · {task.executed_quantity ?? (task.completed_at ? task.quantity : 0)} van {task.quantity} {task.unit} uitgevoerd</small></div><span className="wo-status">{executionLabels[task.execution_state] ?? "Gepland"}</span><ChevronDown size={16}/></summary><div className="wo-task-detail-body"><TaskExecution task={{ ...task, unit_price_cents: undefined }} editable={editableResults} reviewed={order.reportState === "approved"}/></div></details>)}{!data.tasks.length && <EmptyState title="Nog geen werkzaamheden" description="Voeg de afgesproken taken toe door de werkbon te bewerken."/>}</div></ContentSection>
      <ContentSection className="wo-section" title="Checklists" help="Voeg een gepubliceerde checklist toe aan een nog open rapport. Bestaande versies en antwoorden blijven behouden." actions={<><Link className="secondary-button" href="/app/taken/templates?kind=checklist">Templates beheren</Link>{canLinkChecklist && options && <ActionIcon className="primary-button" label="Checklist toevoegen" icon={<Plus size={15}/>} disabled={pending} onClick={() => setLinkingChecklist(true)}/>}</>}><ChecklistPanel orderId={order.id} checklists={data.checklists} editable={editableResults} attachments={data.attachments}/>{!canLinkChecklist && data.canManage && <p className="dossier-muted">Checklists kunnen worden toegevoegd zolang het rapport openstaat. Vraag bij een ingediend rapport eerst een correctie.</p>}</ContentSection>
      <WorkOrderRelatedActions orderId={order.id} tenant={tenant}/>
    </>}
    {tab === "communicatie" && <>
      <WorkOrderNotes notes={data.reports} timezone={tenant.timezone}/>
      <DossierChainPanel scope={{ orderId: order.id }} view="requests" timezone={tenant.timezone}/>
      <ContentSection className="wo-section" title="Foto’s en documenten"><div className="wo-document-list">{data.attachments.map(attachment => <article className="wo-record" key={attachment.id}><div><strong>{attachment.file_name}</strong><small>{date(attachment.created_at)}</small></div><a className="resource-action" href={`/api/files/attachment/${attachment.id}`} target="_blank" rel="noreferrer"><Download size={14}/>Bestand openen</a></article>)}</div>{!data.attachments.length && (reportingEnabled ? <EmptyState title="Nog geen bijlagen" description="Foto’s en documenten bij deze werkbon verschijnen hier na het toevoegen."/> : <p>Rapportage is niet ingeschakeld.</p>)}</ContentSection>
      <TicketContextPanel kind="work_order" id={order.id}/>
      {reportingEnabled && data.canManage && !order.archived && <ContentSection className="wo-section" title="Notitie of bestand toevoegen" help="Een notitie wordt op de rapporttijdlijn opgenomen. Klantzichtbare bijdragen komen pas na controle in het opleverrapport."><WorkOrderCommunication orderId={order.id}/></ContentSection>}
    </>}
    {tab === "rapport" && (reportingEnabled ? <ReportPanel orderId={order.id} canReview={data.canReview}/> : <ContentSection className="wo-section" title="Rapportage niet ingeschakeld"><p>Bestaande rapporten blijven bewaard. Vraag de platformbeheerder naar de module Rapportage.</p></ContentSection>)}
    {tab === "financieel" && data.finance && <>
      <ContentSection className="wo-section" title="Facturatie & afspraken" help="Financiële vrijgave volgt de goedgekeurde prestatie, actuele rapportversie en benodigde meerwerkakkoorden."><dl className="wo-facts"><div><dt>Facturatie</dt><dd>{billingLabels[order.billingState ?? ""] ?? "Nog niet gereed"}</dd></div><div><dt>Rapportcontrole</dt><dd>{reportLabels[order.reportState] ?? "Concept"}</dd></div><div><dt>Klantondertekening</dt><dd>{signatureLabels[order.signatureState] ?? (order.signatureRequired ? "Verplicht" : "Niet nodig")}</dd></div><div><dt>Inkoopnummer / kostenplaats</dt><dd>{[order.purchaseOrder, order.costCenter].filter(Boolean).join(" · ") || "Niet vastgelegd"}</dd></div></dl></ContentSection>
      <WorkOrderFinancial data={data} onRefresh={refresh} financeEnabled={tenant.enabledServices.includes("finance")}/><CommercialOrderContext orderId={order.id} timezone={tenant.timezone}/>
    </>}
    {tab === "historie" && <ContentSection className="wo-section" title="Wijzigingsgeschiedenis"><div className="wo-timeline">{data.history.map(event => <article key={event.id}><time dateTime={event.at}>{date(event.at)}</time><strong>{historyMessage(event.event)}</strong>{event.note && <p className="wo-prewrap">{event.note}</p>}<small>{historyActor(event.actor)}</small></article>)}{!data.history.length && <EmptyState title="Nog geen gebeurtenissen" description="Wijzigingen aan deze werkbon verschijnen hier in de tijdlijn."/>}</div></ContentSection>}
    </div></div>
    {releasing && <WorkOrderReleaseDialog order={order} tenant={tenant} onClose={() => setReleasing(false)} onSaved={() => { setReleasing(false); refresh(); }}/>}
    {management && <WorkOrderManagementDialog data={data} tenant={tenant} assignmentId={management === "status" ? undefined : management} onClose={() => setManagement(null)} onSaved={() => { setManagement(null); refresh(); }}/>}
    {linkingChecklist && options && <ChecklistLinkDialog orderId={order.id} version={order.version} templates={options.templates} linked={data.checklists.map(checklist => checklist.revisionId)} tenant={tenant} onClose={() => setLinkingChecklist(false)} onSaved={() => { setLinkingChecklist(false); refresh(); }}/>}
    {editing && options && <WorkOrderWizard tenant={tenant} options={options} dossier={data} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }}/>}
  </div>;
}

"use client";

import { SectionHeader } from "../section-header";
import { WorkOrderManagementDialog } from "./management";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Download, MoreHorizontal, Pencil, Send, UserMinus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TenantContext } from "@/lib/auth/context";
import { workOrderTabs, type WorkOrderDossier, type WorkOrderOptions } from "@/lib/work-orders/model";
import { mutateWorkOrder } from "@/app/app/work-order-actions";
import { executionLabels } from "@/lib/dossiers/status";
import { CommercialOrderContext } from "@/components/fieldgrid/commercial/order-context";
import { DossierChainPanel } from "@/components/fieldgrid/dossier-chain";
import { TicketContextPanel } from "../tickets/context";
import { ObjectVisitSignals } from "@/components/fieldgrid/objects/visit-signals";
import { TaskExecution } from "@/components/fieldgrid/task-execution";
import { TravelOrderPanel } from "@/components/fieldgrid/travel";
import { businessToday } from "@/lib/personnel/dossier";
import { ReportPanel } from "./report";
import { WorkOrderRelatedActions } from "./related";
import { WorkOrderWizard } from "./wizard";
import { ChecklistPanel } from "./checklists";
import { WorkOrderExceptions } from "./exceptions";
import { WorkOrderCommunication } from "./communication";
import { billingLabels, contactRoleLabels, orderDate, orderHours, planningLabels, priorityLabels, reportLabels, signatureLabels, sourceLabels } from "./presentation";
import "./work-orders.css";

export function WorkOrderDossierPage({ data, options, tenant, tab, back, edit = false }: { data: WorkOrderDossier; options: WorkOrderOptions | null; tenant: TenantContext; tab: string; back: string; edit?: boolean }) {
  const order = data.order, router = useRouter();
  const reportingEnabled = tenant.enabledServices.includes("rapportage");
  const personnelEnabled = tenant.enabledServices.includes("personeel");
  const [editing, setEditing] = useState(edit && order.canEdit), [pending, transition] = useTransition(), [error, setError] = useState("");
  const href = (target: string) => `/app/werkbonnen/${order.id}?tab=${target}&return=${encodeURIComponent(back)}`;
  const date = (value: string | null | undefined) => orderDate(value, tenant.timezone);
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
  const activeAssignments = data.assignments.filter(a => !["cancelled", "returned"].includes(a.status));
  const canAdmin = data.canManage && tenant.roles.some(role => ["tenant_admin", "management"].includes(role)) && !order.archived && !["approved", "invoice_ready", "invoiced", "cancelled"].includes(order.status);
  const [management, setManagement] = useState<string | null>(null);
  const editableResults = reportingEnabled && data.canManage && ["in_progress", "correction_required", "completed"].includes(order.status) && ["draft", "correction", "correction_required"].includes(order.reportState);
  const plannedMinutes = activeAssignments.reduce((sum, a) => sum + Math.max(0, (Date.parse(a.end) - Date.parse(a.start)) / 60000), 0);
  const actualMinutes = data.times.filter(t => t.kind === "work" && t.end).reduce((sum, t) => sum + Math.max(0, (Date.parse(t.end!) - Date.parse(t.start)) / 60000), 0);
  return <div className="wo-workspace wo-dossier" aria-busy={pending}>
    <Link className="dossier-back" href={back}><ArrowLeft size={16}/>Terug naar overzicht</Link>
    <header className="page-intro resource-intro"><div><span className="eyebrow">{order.number}</span><h1>{order.title || order.discipline}</h1><p>{order.customer} · {order.object}</p><span className="wo-status">{executionLabels[order.status] ?? "Nog niet gestart"}</span></div><div className="wo-heading-actions">
      {data.canManage && !order.publishedAt && activeAssignments.length > 0 && order.canEdit && <button className="primary-button" disabled={pending} onClick={() => command("publish")}><Send size={15}/>Publiceer planning</button>}
      {order.canEdit && options && <button className="secondary-button" disabled={pending} onClick={() => setEditing(true)}><Pencil size={15}/>Bewerk</button>}
      {canAdmin && <button className="secondary-button" disabled={pending} onClick={() => setManagement("status")}><RefreshCw size={15}/>Status wijzigen</button>}
      <Popover><PopoverTrigger asChild><button className="secondary-button" aria-label="Meer werkbonacties"><MoreHorizontal size={16}/>Meer</button></PopoverTrigger><PopoverContent className="resource-more-content" align="end"><Link href={`/app/planning?order=${order.id}`}>Open planbord</Link><Link href={href("historie")}>Bekijk historie</Link>{data.canManage && !order.archived && <button disabled={pending} onClick={() => command("archive")}>Archiveren</button>}{data.canManage && order.status !== "cancelled" && <button disabled={pending} onClick={() => command("cancel")}>Annuleren met reden</button>}{order.canDelete && <button disabled={pending} onClick={() => command("delete")}>Ongebruikt concept verwijderen</button>}</PopoverContent></Popover>
    </div></header>
    {error && <p role="alert" className="wo-error">{error}</p>}
    {order.assignedPersonnel < order.requiredPersonnel && order.status !== "cancelled" && <p className="dossier-notice">Bezetting: {order.assignedPersonnel} van {order.requiredPersonnel} medewerkers ingepland.</p>}
    {reportingEnabled && order.signatureRequired && !["signed", "valid", "waived"].includes(order.signatureState) && order.reportState !== "draft" && <p className="dossier-notice">Wacht op handtekening — vast te leggen in de personeelsapp.</p>}
    <nav className="wo-tabs" aria-label="Onderdelen werkbondossier">{workOrderTabs.filter(([id]) => id !== "financieel" || data.finance).map(([id, label]) => <Link key={id} href={href(id)} aria-current={id === tab ? "page" : undefined}>{label}</Link>)}</nav>
    {tab === "overzicht" && <>
      <div className="wo-grid"><section className="wo-card"><SectionHeader subtitle="WERKBON" title="Afspraak & werkzaamheden"/><dl className="wo-facts">
        <div><dt>Klant</dt><dd><Link href={`/app/klanten/${order.customerId}`}>{order.customer}</Link></dd></div><div><dt>Object</dt><dd><Link href={`/app/objecten/${order.objectId}`}>{order.object}</Link></dd></div>
        <div><dt>Planning</dt><dd>{planningLabels[order.planningState] ?? "In te delen"}</dd></div><div><dt>Uitvoering</dt><dd>{date(order.start)}{order.end && <> – {date(order.end)}</>}</dd></div>
        <div><dt>Klantvenster</dt><dd>{order.windowStart ? `${date(order.windowStart)} – ${date(order.windowEnd)}` : "Niet vastgelegd"}</dd></div><div><dt>Deadline</dt><dd>{order.deadline ? date(order.deadline) : "Niet vastgelegd"}</dd></div>
        <div><dt>Dienst / prioriteit</dt><dd>{order.discipline} · {priorityLabels[order.priority] ?? order.priority}</dd></div><div><dt>Bron</dt><dd>{sourceLabels[order.source] ?? order.source}</dd></div>
        <div><dt>Klantreferentie</dt><dd>{order.customerReference || "Niet vastgelegd"}</dd></div><div><dt>Locatieonderdeel</dt><dd>{order.locationLabel || "Gehele object"}</dd></div>
      </dl>{order.description && <p className="wo-prewrap">{order.description}</p>}{order.labels.length > 0 && <p>{order.labels.join(" · ")}</p>}</section>
      <section className="wo-card"><SectionHeader subtitle="KLANT & TEAM" title="Contactpersonen"/><div className="wo-list">{data.contacts.map(c => <article key={c.id} className="wo-record"><strong>{c.name}</strong><small>{c.roles.map(role => contactRoleLabels[role] ?? role).join(" · ")}</small><p>{c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}{c.email && <> {c.phone && " · "}<a href={`mailto:${c.email}`}>{c.email}</a></>}</p></article>)}{!data.contacts.length && <p>Er zijn nog geen contactpersonen voor deze werkbon vastgelegd.</p>}</div><h3>Bezetting</h3><div className="wo-list">{activeAssignments.map(a => <article className="wo-record" key={a.id}><strong>{a.name}{a.personnelId === order.leadPersonnelId && " · uitvoeringsverantwoordelijke"}</strong><small>{date(a.start)} – {date(a.end)}</small><span className="wo-status">{executionLabels[a.status] ?? a.status}</span></article>)}</div>{!activeAssignments.length && <p>Nog geen medewerkers ingepland.</p>}<Link className="text-link" href={href("planning")}>Planning en personeel</Link></section></div>
      <section className="wo-card"><SectionHeader title="Instructies" help="De actuele objectinstructies staan hier. Klantverzoeken en opvolging vind je onder Communicatie & bijlagen."/>{order.instructions && <p className="wo-prewrap">{order.instructions}</p>}<ObjectVisitSignals orderId={order.id}/></section>
    </>}
    {tab === "planning" && <><section className="wo-card"><SectionHeader title="Individuele inzet" subtitle="PLANNING & PERSONEEL" help="Verwijder een actieve medewerker met reden. Geregistreerde uren en afgesloten inzet blijven in de historie bewaard." actions={<Link className="secondary-button" href={`/app/planning?order=${order.id}`}><CalendarDays size={15}/>Open planbord</Link>}/><p>{order.assignedPersonnel} van {order.requiredPersonnel} medewerkers · {orderHours(plannedMinutes)} geplande arbeidsuren · {order.start && order.end ? orderHours((Date.parse(order.end) - Date.parse(order.start)) / 60000) : "—"} uur bezoekduur</p><div className="table-scroll"><table className="resource-table"><thead><tr>{["Medewerker", "Geplande inzet", "Uitvoering", "Gezien", ...(canAdmin ? ["Acties"] : [])].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{data.assignments.map(a => <tr key={a.id}><td>{a.name}{a.personnelId === order.leadPersonnelId && <small>Uitvoeringsverantwoordelijke</small>}</td><td>{date(a.start)}<small>tot {date(a.end)}</small></td><td>{executionLabels[a.status] ?? a.status}{a.actualStart && <small>Gestart {date(a.actualStart)}</small>}{a.actualEnd && <small>Gestopt {date(a.actualEnd)}</small>}</td><td>{a.seenAt ? date(a.seenAt) : "Nog niet gezien"}</td>{canAdmin && <td>{!["completed", "returned", "cancelled"].includes(a.status) && ["draft", "correction"].includes(order.reportState) ? <button className="resource-action danger" onClick={() => setManagement(a.id)}><UserMinus size={14}/>Verwijder</button> : <small>Historie bewaard</small>}</td>}</tr>)}</tbody></table></div>{!data.assignments.length && <p>Nog geen inzet. Deel medewerkers in via het planbord.</p>}</section>
      <section className="wo-card" id="uren"><SectionHeader title="Urenregistratie" subtitle="WERKTIJD"/><p>{personnelEnabled ? `${orderHours(actualMinutes)} afgeronde arbeidsuren. Actieve registraties zijn afzonderlijk zichtbaar.` : "Urenregistratie is niet beschikbaar: de module Personeel is niet ingeschakeld."}</p><div className="table-scroll"><table className="resource-table"><thead><tr>{["Medewerker", "Start", "Einde", "Soort", "Status"].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{data.times.map(t => <tr key={t.id}><td>{t.name}</td><td>{date(t.start)}</td><td>{t.end ? date(t.end) : "Actief"}</td><td>{({ work: "Werk", travel: "Reis", break: "Pauze", correction: "Correctie" } as Record<string, string>)[t.kind] ?? t.kind}</td><td>{({ draft: "Concept", submitted: "Ingediend", approved: "Goedgekeurd", rejected: "Afgekeurd" } as Record<string, string>)[t.status] ?? t.status}</td></tr>)}</tbody></table></div>{personnelEnabled && !data.times.length && <p>Er zijn nog geen uren geregistreerd.</p>}</section>{order.start && <section className="wo-card"><SectionHeader title="Reisinformatie"/><TravelOrderPanel day={businessToday(new Date(order.start), tenant.timezone)} orderId={order.id}/></section>}</>}
    {tab === "taken" && <><section className="wo-card" id="uitvoering"><SectionHeader title="Taken & resultaten"/><div className="wo-list">{data.tasks.map(t => <TaskExecution key={t.id} task={{ ...t, unit_price_cents: undefined }} editable={editableResults} reviewed={order.reportState === "approved"}/>)}{!data.tasks.length && <p>Nog geen taken vastgelegd.</p>}</div></section><section className="wo-card"><SectionHeader title="Checklists"/><ChecklistPanel orderId={order.id} checklists={data.checklists} editable={editableResults} attachments={data.attachments}/></section><WorkOrderRelatedActions orderId={order.id} tenant={tenant}/></>}
    {tab === "communicatie" && <><section className="wo-card"><SectionHeader title="Klantinstructies en opvolging"/><ObjectVisitSignals orderId={order.id}/><DossierChainPanel scope={{ orderId: order.id }} view="requests" timezone={tenant.timezone}/></section><div className="wo-grid"><section className="wo-card"><SectionHeader title="Rapportregels en opmerkingen"/>{data.reports.map(r => <article className="wo-record" key={r.id}><small>{date(r.created_at)} · {r.customer_visible ? "Klantzichtbaar" : "Intern"}</small><p className="wo-prewrap">{r.body}</p></article>)}{!data.reports.length && <p>{reportingEnabled ? "Nog geen opmerkingen ontvangen." : "Rapportage is niet ingeschakeld."}</p>}</section><section className="wo-card"><SectionHeader title="Foto’s en documenten"/>{data.attachments.map(a => <article className="wo-record" key={a.id}><strong>{a.file_name}</strong><small>{date(a.created_at)}</small><a className="resource-action" href={`/api/files/attachment/${a.id}`} target="_blank" rel="noreferrer"><Download size={14}/>Bestand openen</a></article>)}{!data.attachments.length && <p>{reportingEnabled ? "Nog geen bijlagen ontvangen." : "Rapportage is niet ingeschakeld."}</p>}</section></div></>}
    {tab === "communicatie" && <TicketContextPanel kind="work_order" id={order.id}/>}
    {tab === "communicatie" && reportingEnabled && data.canManage && !order.archived && <section className="wo-card"><SectionHeader title="Bericht of bestand toevoegen"/><WorkOrderCommunication orderId={order.id}/></section>}
    {tab === "rapport" && (reportingEnabled ? <><section className="wo-card"><ReportPanel orderId={order.id} canReview={data.canReview}/></section><WorkOrderExceptions orderId={order.id} attachments={data.attachments}/></> : <section className="wo-card"><h2>Rapportage niet ingeschakeld</h2><p>Bestaande rapporten blijven bewaard. Vraag de platformbeheerder naar de module Rapportage.</p></section>)}
    {tab === "financieel" && data.finance && <><section className="wo-card"><SectionHeader title="Factuurherkomst"/><dl className="wo-facts"><div><dt>Facturatie</dt><dd>{billingLabels[order.billingState ?? ""] ?? "Nog niet gereed"}</dd></div><div><dt>Rapportcontrole</dt><dd>{reportLabels[order.reportState] ?? "Concept"}</dd></div><div><dt>Klantondertekening</dt><dd>{signatureLabels[order.signatureState] ?? (order.signatureRequired ? "Verplicht" : "Niet nodig")}</dd></div><div><dt>Inkoopnummer / kostenplaats</dt><dd>{[order.purchaseOrder, order.costCenter].filter(Boolean).join(" · ") || "Niet vastgelegd"}</dd></div></dl><p>Vrijgave volgt de goedgekeurde prestatie, actuele rapportversie en eventuele meerwerkafspraak.</p><Link className="text-link" href="/app/facturen">Open facturen</Link></section><CommercialOrderContext orderId={order.id} timezone={tenant.timezone}/><DossierChainPanel scope={{ orderId: order.id }} view="finance" timezone={tenant.timezone}/></>}
    {tab === "historie" && <section className="wo-card"><SectionHeader title="Wijzigingsgeschiedenis"/><div className="wo-timeline">{data.history.map(h => <article key={h.id}><time>{date(h.at)}</time><p>{h.event}</p>{h.note && <p className="wo-prewrap">{h.note}</p>}{h.actor && <small>{h.actor}</small>}</article>)}{!data.history.length && <p>Nog geen gebeurtenissen beschikbaar.</p>}</div></section>}
    {management && <WorkOrderManagementDialog data={data} tenant={tenant} assignmentId={management === "status" ? undefined : management} onClose={() => setManagement(null)} onSaved={() => { setManagement(null); router.refresh(); }}/>}
    {editing && options && <WorkOrderWizard tenant={tenant} options={options} dossier={data} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh(); }}/>}
  </div>;
}

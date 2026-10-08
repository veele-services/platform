"use client";
import { useCallback, useEffect, useRef, useState, useTransition, type ComponentProps } from "react";
import Link from "next/link";
import { RefreshCw, FileText, History, ExternalLink, ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import { getDossierChain, saveCustomerAgreement } from "@/app/app/dossier-actions";
import { actionLabels, executionLabels, requestStatus, commercialStatus, isClosedAction } from "@/lib/dossiers/status";
import type { ChainScope, DossierChain, Agreement, ChainAction } from "@/lib/dossiers/model";
import type { WorkspaceData } from "@/lib/data/workspace";
import { ObjectForm } from "@/components/fieldgrid/objects/forms";
import { CompactFilterMenu } from "./compact-filter-menu";
import { ContentSection } from "./content-section";
import { PageHeading } from "./page-heading";
import { EmptyState } from "./empty-state";
import { ActionIcon, ActionLink } from "./action-icon";
import { RouteLoading } from "./session-loading";
import "./dossier-chain.css";
import { ListPagination, useListPagination } from "./list-pagination";

export type ChainView = "actions" | "requests" | "agreements" | "documents" | "timeline" | "finance";
const money = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
const actionKinds = { request: "Klantverzoek", execution: "Uitvoeringstaak", object: "Objectactie", personnel: "Personeelsactie" };
const actionStatus = (action: ChainAction) => action.kind === "request" ? requestStatus(action.status, action.needs_review) : (action.kind === "execution" ? executionLabels : actionLabels)[action.status] || "Controleren";
type DossierChainPanelProps = { initial?: DossierChain | null; pageHeading?: boolean; excludeSource?: string; scope: ChainScope; view: ChainView; workspace?: WorkspaceData; timezone?: string; canCommercial?: boolean };
export function DossierChainPanel(props: DossierChainPanelProps) {
  const { customerId, objectId, personnelId, orderId } = props.scope;
  return <DossierChainContent key={JSON.stringify([customerId, objectId, personnelId, orderId])} {...props}/>;
}
function DossierChainContent({ scope, view, workspace, timezone = "Europe/Amsterdam", canCommercial = false, excludeSource, initial = null, pageHeading = false }: DossierChainPanelProps) {
  const [data, setData] = useState<DossierChain | null>(initial); const [error, setError] = useState(""); const [pending, start] = useTransition();
  const requests = useRef({ inFlight: false, sequence: 0 });
  const [sort, setSort] = useState<{ field: "title" | "kind" | "status" | "due_on"; ascending: boolean }>({ field: "due_on", ascending: true });
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState("open"); const [kind, setKind] = useState(""); const [agreement, setAgreement] = useState<Agreement | "new" | null>(null);
  const { customerId, objectId, personnelId, orderId } = scope;
  const load = useCallback(() => {
    if (requests.current.inFlight) return;
    requests.current.inFlight = true;
    const sequence = ++requests.current.sequence;
    start(async () => {
      try {
        const result = await getDossierChain({ customerId, objectId, personnelId, orderId });
        if (sequence !== requests.current.sequence) return;
        if (result.ok) { setData(result.data); setError(""); }
        else { setData(null); setError(result.error); }
      } catch {
        if (sequence === requests.current.sequence) { setData(null); setError("De gekoppelde dossiers zijn niet beschikbaar. Probeer opnieuw."); }
      } finally {
        if (sequence === requests.current.sequence) requests.current.inFlight = false;
      }
    });
  }, [customerId, objectId, personnelId, orderId]);
  useEffect(() => {
    const requestState = requests.current;
    // The initial server projection is already authorised and fresh. Loading it
    // again on mount adds another auth + dossier roundtrip before any user action.
    if (initial) start(() => { setData(initial); setError(""); });
    else load();
    const focus = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 30000);
    return () => { window.removeEventListener("focus", focus); clearInterval(timer); requestState.sequence++; requestState.inFlight = false; };
  }, [load, initial]);
  const date = (value: string | null) => value ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeZone: timezone }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : "—";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const filteredActions = (data?.actions ?? []).filter(a => (!kind || a.kind === kind) && a.title.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || !isClosedAction(a.status) && (filter !== "late" || !!a.due_on && a.due_on < today)));
  const actionsPage = useListPagination(filteredActions.sort((a, b) => {
    const value = (action: ChainAction) => sort.field === "kind" ? actionKinds[action.kind] : sort.field === "status" ? actionStatus(action) : action[sort.field];
    const left = value(a), right = value(b);
    if (left === null || right === null) return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1;
    const difference = left.localeCompare(right, "nl", { numeric: true, sensitivity: "base" });
    return (sort.ascending ? difference : -difference) || a.id.localeCompare(b.id);
  }));
  const sortColumn = (field: typeof sort.field, label: string) => <th aria-sort={sort.field === field ? sort.ascending ? "ascending" : "descending" : "none"}><button type="button" className="table-sort-button" onClick={() => setSort(current => ({ field, ascending: current.field === field ? !current.ascending : true }))}>{label}{sort.field === field && (sort.ascending ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}</button></th>;
  const requestsPage = useListPagination(data?.requests ?? []);
  const documentsPage = useListPagination((data?.documents ?? []).filter(d => d.source_kind !== excludeSource));
  const timelinePage = useListPagination(data?.timeline ?? []);
  const financePage = useListPagination(data?.invoices ?? []);
  const agreementsPage = useListPagination(data?.agreements ?? []);
  const pagination = { actions: actionsPage, requests: requestsPage, documents: documentsPage, timeline: timelinePage, finance: financePage, agreements: agreementsPage }[view];
  if (error) return <div className="dossier-notice" role="alert">{error}<button className="secondary-button" onClick={load}>Opnieuw proberen</button></div>;
  if (!data) return <RouteLoading label="Opvolging laden" compact/>;
  if(view==="documents"&&excludeSource&&!data.documents.some(d=>d.source_kind!==excludeSource))return null;
  const titles = { actions: "Gezamenlijke opvolging", requests: "Verzoeken & meerwerk", agreements: "Klantafspraken & contracten", documents: "Gekoppelde documenten", timeline: "Dossierhistorie", finance: "Financiële opvolging" };
  const Section = pageHeading ? FollowupSection : ContentSection;
  return <><Section title={titles[view]} className="chain-section" bodyClassName={view === "actions" ? "chain-table-body" : undefined} help="Bekijk afspraken, documenten en opvolging uit de verbonden dossiers. Wijzig een taak bij de bron; alle dossierweergaven volgen dezelfde registratie." actions={
<div className="object-actions"><ActionIcon onClick={load} disabled={pending} label="Dossiergegevens vernieuwen" icon={<RefreshCw size={17}/>}/>{view === "actions"&&<CompactFilterMenu activeCount={[query,kind,filter!=="open"?filter:""].filter(Boolean).length} contentClassName="dossier-filter-popover"><div className="dossier-toolbar"><label>Zoeken<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Actie of taak…"/></label><label>Type<select value={kind} onChange={e => setKind(e.target.value)}><option value="">Alle typen</option><option value="request">Klantverzoek</option><option value="execution">Uitvoeringstaak</option><option value="object">Objectactie</option><option value="personnel">Personeelsactie</option></select></label><label>Filter<select value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Openstaand</option><option value="late">Deadline overschreden</option><option value="all">Alle statussen</option></select></label></div></CompactFilterMenu>}</div>}>

    {view === "actions" && <>
      <div className="table-scroll"><table className="resource-table"><thead><tr>{sortColumn("title", "Actie")}{sortColumn("kind", "Type")}{sortColumn("status", "Status")}{sortColumn("due_on", "Deadline")}<th>Acties</th></tr></thead><tbody>{actionsPage.items.map(a => <tr key={`${a.kind}:${a.id}`}><td><Link className="chain-title-link" href={a.href}>{a.title}</Link><small>Versie {a.version} · {a.owner_id ? "Verantwoordelijke vastgelegd" : "Nog toe te wijzen"}</small></td><td>{actionKinds[a.kind]}</td><td><span className="dossier-status">{actionStatus(a)}</span></td><td>{date(a.due_on)}{a.due_on && a.due_on < today && !isClosedAction(a.status) && <small>Deadline overschreden</small>}</td><td><ActionLink href={a.href} label="Open bron" icon={<ExternalLink size={16}/>}/></td></tr>)}</tbody></table></div>{!actionsPage.total && <EmptyState title={query || kind || filter !== "open" ? "Geen acties gevonden" : "Nog geen openstaande acties"} description={query || kind || filter !== "open" ? "Pas je zoekopdracht of filters aan om andere acties te bekijken." : "Acties uit klanten, objecten, werkbonnen en personeelsdossiers verschijnen hier zodra er iets moet worden opgevolgd."}/>}</>}
    {view === "requests" && <>{requestsPage.items.map(r => <article className="object-record" key={r.id} id={`request-${r.id}`}><header><h3>{r.title}</h3><span className="dossier-status">{requestStatus(r.state, r.needs_review)}</span></header><p>{r.body}</p><small>Verzoekversie {r.version} · {date(r.created_at)}</small>{r.response && <p>Terugkoppeling: {r.response}</p>}{r.needs_review && <p className="dossier-notice">De afspraak of het verzoek is gewijzigd. Beoordeling is opnieuw nodig.</p>}{r.proposals.map(p => <p key={p.id}>Voorstel v{p.version} · {money(p.price_cents * p.quantity)} excl. btw · {commercialStatus(r.state, !!p.accepted_at)}{p.accepted_at && ` · akkoord vastgelegd op ${date(p.accepted_at)}`}</p>)}{!r.proposals.length && r.state === "regular" && <p>Binnen contract · geen extra kosten</p>}<footer><Link className="resource-action" href={`/app/objecten/${r.object_id}?tab=instructies#request-${r.id}`}>Beoordelen bij object</Link><Link className="resource-action" href={`/app/werkbonnen/${r.work_order_id}`}>Concrete werkbon</Link></footer></article>)}{!data.requests.length && <EmptyState title="Nog geen verzoeken" description="Verzoeken en meerwerk bij deze selectie verschijnen hier."/>}</>}
    {view === "documents" && <>{documentsPage.items.map(d => <article className="dossier-event" key={d.id}><FileText size={18}/><div><strong>{d.title}</strong><small>{{ hr: "Vertrouwelijk personeel", commercial: "Interne klantafspraak", operational: "Operationeel", restricted: "Beperkte toegang" }[d.classification] || "Private opslag"} · versie {d.version}</small><small>Upload: {date(d.created_at)} · documentdatum: {date(d.document_on)} · geldig tot: {date(d.valid_until)}</small></div><a className="resource-action" href={d.href}>Openen</a></article>)}{!data.documents.some(d=>d.source_kind!==excludeSource) && <EmptyState title="Nog geen documenten" description="Documenten uit gekoppelde dossiers verschijnen hier wanneer je toegang hebt."/>}</>}
    {view === "timeline" && <>{timelinePage.items.map(e => <article className="dossier-event" key={e.id}><History size={18}/><div><strong>{{ object_visit_requests: "Klantverzoek", object_records: "Objectregistratie", objects: "Object", object_nodes: "Locatieonderdeel", object_request_proposals: "Meerwerkvoorstel", object_documents: "Document" }[e.type] || "Dossierregistratie"} {e.event === "created" ? "toegevoegd" : "bijgewerkt"}</strong><small>{date(e.at)} · versie {e.version}</small></div></article>)}{!data.timeline.length && <EmptyState title="Nog geen wijzigingen" description="Activiteiten in dit dossier verschijnen hier in de tijdlijn."/>}</>}
    {view === "finance" && <>{financePage.items.map(i => <article className="dossier-event" key={i.id}><div><strong>{i.number || "Concept"}</strong><small>{money(i.total)} · betaald {money(i.paid)} · vervalt {date(i.due)}</small></div><Link className="resource-action" href={`/app/facturen?record=${i.id}`}>Open factuur</Link></article>)}{!data.invoices.length && <EmptyState title="Geen facturen beschikbaar" description="Facturen verschijnen hier wanneer ze zijn aangemaakt en je financiële toegang hebt."/>}</>}
    {view === "agreements" && <>{canCommercial && workspace && customerId && <button className="primary-button" onClick={() => setAgreement("new")}>Klantafspraak vastleggen</button>}{agreementsPage.items.map(a => <article className="object-record" key={a.id}><header><h3>{a.title}</h3><span className="dossier-status">{a.state==='draft'?'Concept':a.state==='ended'?'Beëindigd':'Vastgelegd'} · versie {a.version}{data.agreements.some(n => n.previous_id === a.id) ? " · opvolger beschikbaar" : ""}</span></header><p>{date(a.starts_on)} – {date(a.ends_on)}{a.accepted_on&&<> · Akkoord: {a.accepted_by_name}, {date(a.accepted_on)}</>}</p>{a.lines.map(l => <p key={l.id}>{l.scope} · {l.quantity} eenheden × {money(l.price_cents)} · {{visit:"per bezoek",hour:"per uur",once:"eenmalig",week:"per week",month:"per maand"}[l.price_basis]||l.price_basis} · limiet {money(l.limit_cents)}{l.extra_work&&" · vooraf toegestaan meerwerk"}</p>)}<footer>{a.evidence_document_id && <a className="resource-action" href={`/api/files/customer-document/${a.evidence_document_id}`}>Akkoordbewijs</a>}{canCommercial && workspace && !data.agreements.some(n => n.previous_id === a.id) && <button className="resource-action" onClick={() => setAgreement(a)}>Nieuwe versie</button>}</footer></article>)}{!data.agreements.length && <EmptyState title="Geen klantafspraken beschikbaar" description="Vastgelegde klantafspraken verschijnen hier wanneer je commerciële toegang hebt."/>}{agreement && workspace && customerId && <AgreementForm key={agreement === "new" ? "new" : agreement.id} customerId={customerId} previous={agreement === "new" ? undefined : agreement} workspace={workspace} onClose={() => setAgreement(null)} onSaved={() => { setAgreement(null); load(); }}/>}</>}
  </Section><ListPagination noun={view === "actions" ? "acties" : "resultaten"} total={pagination.total} page={pagination.page} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} busy={pending} preferenceKey={`dossier:${customerId ?? objectId ?? personnelId ?? orderId ?? "workspace"}:${view}`}/></>;
}

function FollowupSection({ actions, children }: ComponentProps<typeof ContentSection>) {
  return <section className="chain-section chain-page">
    <PageHeading eyebrow="DOSSIER 360" title="Opvolging" help="Klantverzoeken, objectacties, uitvoeringstaken en bevoegde personeelsacties bij elkaar. Open de bron om een actie op te volgen." actions={actions}/>
    <div className="fg-section-body chain-table-body">{children}</div>
  </section>;
}

function AgreementForm({ customerId, previous, workspace, onClose, onSaved }: { customerId: string; previous?: Agreement; workspace: WorkspaceData; onClose: () => void; onSaved: () => void }) {
  const [id] = useState(() => crypto.randomUUID());
  const [lineIds,setLineIds]=useState(()=>(previous?.lines.length?previous.lines.map(l=>l.id):[crypto.randomUUID()]));
  return <div className="chain-agreement-form"><h3>{previous ? "Nieuwe contractversie" : "Klantafspraak vastleggen"}</h3><p className="dossier-notice">Leg alleen een werkelijk overeengekomen afspraak vast. Upload eerst het akkoordbewijs bij Documenten. Een wijziging bewaart de vorige versie.</p><ObjectForm action={saveCustomerAgreement} onSuccess={onSaved}>
    <input name="id" type="hidden" value={id}/><input name="customerId" type="hidden" value={customerId}/><input name="previousId" type="hidden" value={previous?.id || ""}/>
    <label className="wide">Titel<input name="title" required defaultValue={previous?.title}/></label><label>Geldig vanaf<input name="startsOn" type="date" required/></label><label>Geldig tot<input name="endsOn" type="date"/></label><label>Akkoordgever<input name="acceptedBy" required minLength={2}/></label><label>Akkoorddatum<input name="acceptedOn" type="date" required/></label>
    <label className="wide">Akkoordbewijs<select name="documentId" required><option value="">Kies een geüpload klantdocument</option>{workspace.customerDocuments.filter(d => d.customer_id === customerId).map(d => <option value={d.id} key={d.id}>{d.title} · versie {d.version}</option>)}</select></label>
    <input type="hidden" name="lineCount" value={lineIds.length}/>
    {lineIds.map((key,index)=>{const l=previous?.lines.find(line=>line.id===key);return <fieldset className="wide chain-contract-line" key={key}><legend>Contractregel {index+1}</legend><label>Object<select aria-label="Object" name={`objectId-${index}`} required defaultValue={l?.object_id || ""}><option value="">Kies een object</option>{workspace.objects.filter(o => o.customer_id === customerId).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Catalogustaak<select aria-label="Catalogustaak" name={`taskRevisionId-${index}`} required defaultValue={l?.task_revision_id || ""}><option value="">Kies een taakversie</option>{workspace.taskRevisions.map(r => <option key={r.id} value={r.id}>{workspace.tasks.find(t => t.id === r.task_id)?.name} · versie {r.revision}</option>)}</select></label>
    <label className="wide">Afgesproken omvang<textarea name={`scope-${index}`} required minLength={2} defaultValue={l?.scope}/></label><label>Maximale hoeveelheid per bezoek<input name={`quantity-${index}`} type="number" min="0.001" step="0.001" required defaultValue={l?.quantity || 1}/></label><label>Prijs per eenheid excl. btw<input name={`price-${index}`} type="number" min="0" step="0.01" required defaultValue={(l?.price_cents || 0) / 100}/></label><label>Maximumbedrag per bezoek excl. btw<input name={`limit-${index}`} type="number" min="0" step="0.01" required defaultValue={(l?.limit_cents || 0) / 100}/></label>{lineIds.length>1&&<button type="button" className="resource-action" onClick={()=>setLineIds(ids=>ids.filter(id=>id!==key))}>Regel verwijderen</button>}</fieldset>;})}
    <button type="button" className="secondary-button wide" disabled={lineIds.length>=100} onClick={()=>setLineIds(ids=>[...ids,crypto.randomUUID()])}>Contractregel toevoegen</button>
  </ObjectForm><button className="secondary-button" data-discard-form onClick={onClose}>Sluiten</button></div>;
}

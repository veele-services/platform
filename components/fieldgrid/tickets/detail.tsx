"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, History, LockKeyhole, RefreshCw, Send, Share2 } from "lucide-react";
import { loadTicketDetail, prepareTicketResponse, runTicketCommand } from "@/app/tickets/actions";
import { ticketPaths, type TicketAccess, type TicketAudience, type TicketDetail, type TicketOptions, type TicketStatus } from "@/lib/tickets/model";
import { TicketDialog } from "./dialog";
import { TicketFiles, TicketFilePicker, type DraftTicketFile } from "./files";
import { TicketShare } from "./share";
import { ticketAssigneeLabel, ticketAudienceLabels, ticketDate, ticketNextActor, ticketPriorityLabels, ticketSafeReturn, ticketStatusLabels, ticketTone } from "./presentation";
import "./tickets.css";

type EditAction = { kind: "status"; status: TicketStatus } | { kind: "assign" | "priority" | "transfer" | "archive" } | { kind: "redact"; messageId: string };
export function TicketDetailPage({ access, data, options, back, initialAction }: { access: TicketAccess; data: TicketDetail; options: TicketOptions; back?: string; initialAction?: string }) {
  const router = useRouter(), timezone = data.timezone;
  const [edit, setEdit] = useState<EditAction | null>(initialAction === "resolve" && data.allowedActions.includes("resolve") ? { kind: "status", status: "resolved" } : null);
  const [sharing, setSharing] = useState(false), [preparing, startPrepare] = useTransition(), [error, setError] = useState("");
  const [prepared, setPrepared] = useState<{ data: TicketDetail; body: string } | null>(null);
  const read = useRef<string | null>(null);
  const staff = access.workspace === "staff", platform = access.workspace === "platform";
  const manage = data.allowedActions.includes("manage"), canReply = data.allowedActions.includes("reply");
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [router]);
  useEffect(() => {
    const key = `${data.id}:${data.version}`;
    if (!data.unread || read.current === key) return;
    read.current = key;
    void runTicketCommand(access.workspace, "mark_read", { id: data.id, version: data.version }, crypto.randomUUID());
  }, [access.workspace, data.id, data.version, data.unread]);
  const prepare = (messageId: string) => {
    setError("");
    startPrepare(async () => {
      try {
        const result = await prepareTicketResponse(access.workspace, data.id, messageId);
        if (!result.ok || !result.data) { setError(result.ok ? "Het concept is niet beschikbaar." : result.error); return; }
        const target = await loadTicketDetail("tenant", result.data.sourceTicketId);
        if (!target.ok || !target.data || !target.data.allowedActions.includes("reply")) { setError("Je hebt geen actuele toegang tot het personeelsgesprek."); return; }
        setPrepared({ data: target.data, body: result.data.body });
      } catch { setError("Het concept kon niet worden voorbereid. Er is niets naar de medewerker verstuurd."); }
    });
  };
  const actionButtons = <div className="ticket-actions">
    {data.status === "resolved" && data.allowedActions.includes("close") && <button className="primary-button" onClick={() => setEdit({ kind: "status", status: "closed" })}><CheckCircle2 size={15}/>{staff || access.workspace === "support" ? "Oplossing bevestigen" : "Ticket sluiten"}</button>}
    {["resolved", "closed"].includes(data.status) && data.allowedActions.includes("reopen") && <button className="secondary-button" onClick={() => setEdit({ kind: "status", status: "in_progress" })}>{data.status === "resolved" ? "Nog niet opgelost" : "Heropenen"}</button>}
    {data.allowedActions.includes("resolve") && <button className="primary-button" onClick={() => setEdit({ kind: "status", status: "resolved" })}>Oplossen</button>}
  </div>;
  return <div className="ticket-workspace">
    <Link className="ticket-back" href={ticketSafeReturn(back, ticketPaths[access.workspace])}><ArrowLeft size={14}/>Terug naar overzicht</Link>
    <header className="ticket-intro"><div><span className="ticket-eyebrow">{data.number}{platform && data.tenantName ? ` · ${data.tenantName}` : ""}</span><h1>{data.subject}</h1><div className="ticket-actions"><span className="ticket-status" data-tone={ticketTone(data.status)}>{ticketStatusLabels[data.status]}</span><span className="ticket-muted">{ticketNextActor(data.nextActor, access.workspace)}</span>{data.category.confidential && <span className="ticket-status"><LockKeyhole size={12}/>Vertrouwelijk</span>}</div></div>{actionButtons}</header>
    {error && <p className="ticket-error" role="alert">{error}</p>}
    <div className="ticket-detail-grid"><div>
      {data.resolution && <section className="ticket-panel"><h2>Voorgestelde oplossing</h2><p className="ticket-prewrap">{data.resolution}</p>{data.status === "resolved" && <p className="ticket-muted">Controleer of je vraag is beantwoord. Bevestig de oplossing of geef aan wat nog niet is opgelost.{data.autoCloseAt && ` Zonder nieuwe reactie sluit deze melding op ${ticketDate(data.autoCloseAt, timezone)}.`}</p>}</section>}
      <section className="ticket-panel"><div className="ticket-panel-header"><div><h2>Gesprek</h2><p>{staff ? `Jouw gesprek met ${access.tenant?.name ?? "de organisatie"}.` : platform ? "Openbare antwoorden gaan naar de tenant. Platformnotities blijven intern." : access.workspace === "support" ? "Openbare antwoorden gaan naar Fieldgrid. Tenantnotities blijven intern." : "Antwoorden aan de melder en bevoegde interne notities."}</p></div><button className="resource-action" onClick={() => router.refresh()} aria-label="Gesprek vernieuwen"><RefreshCw size={15}/></button></div>
        <div className="ticket-conversation">{data.messages.map(message => <article className="ticket-message" data-private={message.audience !== "reporter"} key={message.id}><header><div><strong>{message.authorLabel}</strong><small>{message.isOwn ? "Jij" : ""}</small></div><time dateTime={message.createdAt}>{ticketDate(message.createdAt, timezone)}</time></header>{message.audience !== "reporter" && <span className="ticket-audience"><LockKeyhole size={12}/>{message.audience === "tenant" ? `Interne notitie · ${access.tenant?.name ?? "tenant"}` : "Interne notitie · Fieldgrid"}</span>}<p className="ticket-prewrap">{message.redacted ? "Dit bericht is gecontroleerd geredigeerd." : message.body}</p><TicketFiles files={message.attachments}/>{data.allowedActions.includes("redact") && !message.redacted && <button className="text-link" onClick={() => setEdit({ kind: "redact", messageId: message.id })}>Gecontroleerd redigeren</button>}{!platform && access.workspace === "support" && data.sourceTicket && message.audience === "reporter" && !message.isOwn && !message.redacted && <button className="text-link" disabled={preparing} onClick={() => prepare(message.id)}>Antwoord voorbereiden voor medewerker</button>}</article>)}</div>
        {!data.messages.length && <p className="ticket-empty">Nog geen zichtbare berichten.</p>}
        {(canReply || data.allowedActions.includes("note")) && data.allowedAudiences.length > 0 && <TicketComposer access={access} data={data} onSaved={() => router.refresh()}/>}
      </section>
      <section className="ticket-panel"><details><summary><History size={14}/> Afhandeling & historie</summary><ul className="ticket-history">{data.history.map(event => <li key={event.id}>{event.label}{event.audience !== "reporter" && <span className="ticket-status">Intern</span>}<time dateTime={event.createdAt}>{ticketDate(event.createdAt, timezone)} · {event.actorLabel}</time></li>)}</ul>{!data.history.length && <p className="ticket-muted">Geen verdere zichtbare gebeurtenissen.</p>}</details></section>
    </div><aside className="ticket-sidebar">
      <section className="ticket-panel"><h2>Afhandeling</h2><dl className="ticket-facts"><div><dt>Categorie</dt><dd>{data.category.name}</dd></div>{data.reporter && <div><dt>Melder</dt><dd>{data.reporter.label}</dd></div>}<div><dt>Behandelaar / groep</dt><dd>{ticketAssigneeLabel(data)}</dd></div><div><dt>Prioriteit</dt><dd>{ticketPriorityLabels[data.priority]}</dd></div>{data.nextStep && <div><dt>Volgende stap</dt><dd>{data.nextStep}</dd></div>}{data.neededBefore && <div><dt>Gewenste reactie vóór</dt><dd>{ticketDate(data.neededBefore, timezone)}</dd></div>}{data.deadlineAt && <div><dt>Volgende termijn</dt><dd>{ticketDate(data.deadlineAt, timezone)}</dd></div>}</dl><p className="ticket-muted">Tijden in {timezone}.</p>
        <div className="ticket-actions" style={{ marginTop: 16 }}>{data.allowedActions.includes("assign") && <button className="secondary-button" onClick={() => setEdit({ kind: "assign" })}>Toewijzen</button>}{data.allowedActions.includes("priority") && <button className="secondary-button" onClick={() => setEdit({ kind: "priority" })}>Prioriteit wijzigen</button>}{manage && ["new", "waiting_reporter", "waiting_external"].includes(data.status) && <button className="secondary-button" onClick={() => setEdit({ kind: "status", status: "in_progress" })}>In behandeling nemen</button>}{manage && ["new", "in_progress"].includes(data.status) && <><button className="secondary-button" onClick={() => setEdit({ kind: "status", status: "waiting_reporter" })}>Wacht op melder</button><button className="secondary-button" onClick={() => setEdit({ kind: "status", status: "waiting_external" })}>Wacht op externe partij</button></>}{data.allowedActions.includes("transfer") && <button className="secondary-button" onClick={() => setEdit({ kind: "transfer" })}>Categorie overdragen</button>}{data.allowedActions.includes("cancel") && <button className="text-link" onClick={() => setEdit({ kind: "status", status: "cancelled" })}>Melding intrekken</button>}{data.allowedActions.includes("archive") && ["closed", "cancelled"].includes(data.status) && <button className="text-link" onClick={() => setEdit({ kind: "archive" })}>Gecontroleerd archiveren</button>}</div>
      </section>
      {(data.context.length > 0 || data.module) && <section className="ticket-panel"><details><summary>Gekoppelde context</summary><div className="ticket-facts" style={{ marginTop: 13 }}>{data.module && <p>{data.module}</p>}{data.context.map(item => <div key={`${item.kind}:${item.id}`}>{item.href ? <Link className="text-link" href={item.href}>{item.label}<ExternalLink size={12}/></Link> : <span className="ticket-muted">{item.label} · context niet meer toegankelijk</span>}</div>)}</div><p className="ticket-muted">Een melding verandert geen planning, uren, rapport of factuur. Correcties voer je uit bij de bron.</p></details></section>}
      {!platform && !staff && (data.linkedSupport || data.allowedActions.includes("share")) && <section className="ticket-panel"><h2>Fieldgrid-support</h2>{data.linkedSupport ? <><p>Fieldgrid onderzoekt het gedeelde probleem. Het personeelsgesprek blijft afzonderlijk.</p><Link className="secondary-button" href={`/app/support/${data.linkedSupport.id}`}>{data.linkedSupport.number}<ExternalLink size={13}/></Link></> : <><p>Deel alleen noodzakelijke technische informatie via een aparte supportvraag.</p><button className="secondary-button" onClick={() => setSharing(true)}><Share2 size={14}/>Doorsturen naar Fieldgrid</button></>}</section>}
      {!platform && access.workspace === "support" && data.sourceTicket && <section className="ticket-panel"><h2>Personeelsmelding</h2><p>De medewerker ontvangt geen automatische kopie van dit supportgesprek.</p><Link className="text-link" href={`/app/meldingen/${data.sourceTicket.id}`}>Open {data.sourceTicket.number}<ExternalLink size={12}/></Link></section>}
    </aside></div>
    {edit && <TicketEdit access={access} data={data} options={options} edit={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); router.refresh(); }}/>}
    {sharing && <TicketShare access={access} data={data} options={options} onClose={() => setSharing(false)} onSaved={id => { setSharing(false); router.push(`/app/support/${id}`); router.refresh(); }}/>}
    {prepared && <TicketDialog title="Antwoord voorbereiden voor medewerker" description={`Bewerk het concept voor ${prepared.data.number}. Pas na verzenden ziet de medewerker dit antwoord.`} onClose={() => setPrepared(null)} dirty primaryColor={access.tenant?.primaryColor} accentColor={access.tenant?.accentColor}><TicketComposer key={prepared.data.id} access={{ ...access, workspace: "tenant" }} data={prepared.data} initialBody={prepared.body} publicOnly onSaved={() => { setPrepared(null); router.refresh(); }}/></TicketDialog>}
  </div>;
}

function TicketComposer({ access, data, onSaved, initialBody = "", publicOnly = false }: { access: TicketAccess; data: TicketDetail; onSaved: () => void; initialBody?: string; publicOnly?: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody), [audience, setAudience] = useState<TicketAudience>(publicOnly ? "reporter" : data.allowedAudiences[0]);
  const [files, setFiles] = useState<DraftTicketFile[]>([]), [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition(), [error, setError] = useState("");
  const request = useRef<{ key: string; fingerprint: string } | null>(null);
  const ready = files.every(file => file.status === "clean" && file.id);
  const audiences = publicOnly ? data.allowedAudiences.filter(value => value === "reporter") : data.allowedAudiences;
  useEffect(() => {
    if (!body && !files.length) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [body, files.length]);
  const label = (value: TicketAudience) => value === "tenant" ? `Interne notitie bij ${access.tenant?.name ?? "je organisatie"}` : value === "platform" ? "Interne notitie bij Fieldgrid" : access.workspace === "platform" ? `Antwoord aan ${data.tenantName ?? "de tenant"}` : access.workspace === "support" ? "Antwoord aan Fieldgrid" : access.workspace === "staff" ? `Bericht aan ${access.tenant?.name ?? "je organisatie"}` : "Antwoord aan de melder";
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (!ready) { setError("Wacht tot de gekozen bestanden beschikbaar zijn."); return; }
    const payload = { id: data.id, version: data.version, body, audience, uploadIds: files.map(file => file.id!) }, fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { key: crypto.randomUUID(), fingerprint };
    const key = request.current!.key;
    start(async () => {
      try { const result = await runTicketCommand(access.workspace, "reply", payload, key); if (!result.ok) { setError(result.error); return; } setBody(""); setFiles([]); setDraftId(crypto.randomUUID()); request.current = null; onSaved(); }
      catch { setError("De ontvangst is niet bevestigd. Je tekst en bijlagen zijn bewaard; probeer opnieuw."); }
    });
  };
  return <form className="ticket-form ticket-composer" onSubmit={submit}><h2>{label(audience)}</h2>{audiences.length > 1 && <label>Zichtbaarheid<select aria-label="Zichtbaarheid" value={audience} disabled={files.length > 0 || pending} onChange={event => setAudience(event.target.value as TicketAudience)}>{audiences.map(value => <option key={value} value={value}>{label(value)}</option>)}</select>{files.length > 0 && <small>Verwijder eerst de bijlagen om de zichtbaarheid te wijzigen.</small>}</label>}{audience !== "reporter" && <p className="ticket-notice"><LockKeyhole size={13}/> {ticketAudienceLabels[audience]}. De andere partij ontvangt hiervan geen nieuw-antwoordmelding.</p>}<label>{audience === "reporter" ? "Bericht" : "Interne notitie"}<textarea aria-label={audience === "reporter" ? "Bericht" : "Interne notitie"} value={body} onChange={event => setBody(event.target.value)} required minLength={1} maxLength={10000} rows={5}/></label><TicketFilePicker workspace={access.workspace} tenantId={data.tenantId} categoryId={data.category.id} ticketId={data.id} audience={audience} draftId={draftId} files={files} setFiles={setFiles} disabled={pending}/>{error && <p className="ticket-error" role="alert">{error}<button type="button" className="text-link" onClick={() => router.refresh()}>Gesprekgegevens vernieuwen</button></p>}<footer className="ticket-form-footer"><p>{audience === "reporter" ? "Je antwoord wordt zichtbaar in het gesprek. Vermeld geen toegangscodes of wachtwoorden." : "Deze notitie blijft binnen de gekozen interne doelgroep."}</p><button className="primary-button" disabled={pending || !ready || !body.trim()}><Send size={15}/>{pending ? "Versturen…" : audience === "reporter" ? "Antwoord versturen" : "Interne notitie plaatsen"}</button></footer></form>;
}

function TicketEdit({ access, data, options, edit, onClose, onSaved }: { access: TicketAccess; data: TicketDetail; options: TicketOptions; edit: EditAction; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(edit.kind === "assign" ? data.assignee?.id ?? "" : edit.kind === "priority" ? data.priority : edit.kind === "transfer" ? data.category.id : "");
  const targetCategory = options.categories.find(category => category.id === value);
  const [reason, setReason] = useState(""), [pending, start] = useTransition(), [error, setError] = useState("");
  const request = useRef<{ key: string; fingerprint: string } | null>(null);
  const status = edit.kind === "status" ? edit.status : null;
  const title = edit.kind === "assign" ? "Behandelaar toewijzen" : edit.kind === "priority" ? "Prioriteit wijzigen" : edit.kind === "transfer" ? "Categorie overdragen" : edit.kind === "archive" ? "Ticket archiveren" : edit.kind === "redact" ? "Bericht gecontroleerd redigeren" : status === "resolved" ? "Oplossing vastleggen" : status === "closed" ? "Oplossing bevestigen / sluiten" : status === "in_progress" ? "In behandeling nemen / heropenen" : status === "cancelled" ? "Melding intrekken" : ticketStatusLabels[status!];
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const payload = { id: data.id, version: data.version, ...(edit.kind === "assign" ? { assigneeId: value || null } : edit.kind === "priority" ? { priority: value, reason } : edit.kind === "transfer" ? { categoryId: value, reason } : edit.kind === "redact" ? { messageId: edit.messageId, reason } : status ? { status, ...(status === "resolved" ? { resolution: reason } : status.startsWith("waiting") ? { nextStep: reason } : { reason }) } : { reason }) };
    const fingerprint = JSON.stringify(payload); if (request.current?.fingerprint !== fingerprint) request.current = { key: crypto.randomUUID(), fingerprint }; const key = request.current!.key;
    start(async () => { try { const result = await runTicketCommand(access.workspace, edit.kind, payload, key); if (!result.ok) setError(result.error); else onSaved(); } catch { setError("De wijziging is niet bevestigd. Controleer de actuele status en probeer opnieuw."); } });
  };
  return <TicketDialog title={title} description={`${data.number} · ${data.subject}`} primaryColor={access.tenant?.primaryColor} accentColor={access.tenant?.accentColor} onClose={onClose} dirty={Boolean(reason)} busy={pending}><form className="ticket-form" onSubmit={submit}>{edit.kind === "assign" && <><label>Behandelaar<select aria-label="Behandelaar" value={value} onChange={event => setValue(event.target.value)}><option value="">Niet toegewezen</option>{data.assignees.map(person => <option key={person.id} value={person.id}>{person.label}</option>)}</select></label><p className="ticket-notice">Alleen actuele, bevoegde behandelaars zijn selecteerbaar. Toewijzing geeft geen extra toegang.</p></>}{edit.kind === "priority" && <label>Prioriteit<select aria-label="Prioriteit" value={value} onChange={event => setValue(event.target.value)}>{Object.entries(ticketPriorityLabels).filter(([key]) => key !== "critical" || data.allowedActions.includes("critical")).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>}{edit.kind === "transfer" && <><label>Nieuwe categorie<select aria-label="Nieuwe categorie" value={value} onChange={event => setValue(event.target.value)}>{options.categories.filter(category => category.active && category.route === data.route).map(category => <option key={category.id} value={category.id}>{category.name}{category.confidential ? " · vertrouwelijk" : ""}</option>)}</select></label><div className="ticket-review" aria-label="Nieuwe behandelgroep en leesbereik"><div><small>Nieuwe behandelgroep</small><strong>{targetCategory?.groupLabel || "Bevoegde categorie-intake; geen vaste groep"}</strong></div><div><small>Leesbereik na overdracht</small><p>{targetCategory?.confidential ? "De melder en uitsluitend behandelaars met het afzonderlijke vertrouwelijke recht én toegang tot deze categorie en melding." : "De melder en behandelaars met actuele toegang tot de gekozen categorie en het bereik van deze melding."}</p></div></div><p className="ticket-notice">De behandelgroep bepaalt de routing, niet het leesrecht. Groepslidmaatschap alleen geeft geen inzage. De server controleert je rechten op de oude én nieuwe categorie; vertrouwelijkheid kan niet worden verlaagd.</p></>}{edit.kind !== "assign" && <label>{status === "resolved" ? "Oplossing voor de melder" : status?.startsWith("waiting") ? "Volgende stap en wie aan zet is" : "Reden / toelichting"}<textarea required minLength={3} maxLength={10000} value={reason} onChange={event => setReason(event.target.value)} rows={4}/></label>}{status === "resolved" && <p className="ticket-notice">De melder ziet deze oplossing en kan bevestigen of aangeven dat het probleem nog niet is opgelost.</p>}{error && <p className="ticket-error" role="alert">{error}</p>}<footer className="ticket-form-footer"><button type="button" className="secondary-button" disabled={pending} onClick={onClose}>Annuleren</button><button className="primary-button" disabled={pending}>{pending ? "Opslaan…" : "Bevestigen"}</button></footer></form></TicketDialog>;
}

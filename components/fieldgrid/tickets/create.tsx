"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { runTicketCommand } from "@/app/tickets/actions";
import { ticketCreateSchema, type TicketAccess, type TicketOptions } from "@/lib/tickets/model";
import { localToInstant } from "@/lib/planning/time";
import { TicketDialog } from "./dialog";
import { TicketFilePicker, type DraftTicketFile } from "./files";

export function TicketCreate({ access, options, onClose, onSaved, contextId }: {
  access: TicketAccess; options: TicketOptions; onClose: () => void; onSaved: (id: string) => void; contextId?: string;
}) {
  const [subject, setSubject] = useState(""), [body, setBody] = useState(""), [categoryId, setCategoryId] = useState("");
  const [urgency, setUrgency] = useState("normal"), [neededBefore, setNeededBefore] = useState("");
  const [context, setContext] = useState(options.contexts.find(item => item.id === contextId)?.id ?? "");
  const [module, setModule] = useState("overig"), [files, setFiles] = useState<DraftTicketFile[]>([]);
  const [draftId] = useState(() => crypto.randomUUID()), [pending, start] = useTransition(), [error, setError] = useState("");
  const request = useRef<{ key: string; payload: string } | null>(null);
  const support = access.workspace === "support" || access.workspace === "platform";
  const category = options.categories.find(item => item.id === categoryId);
  const selectedContext = options.contexts.find(item => item.id === context);
  const ready = files.every(file => file.status === "clean" && file.id);
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!ready) { setError("Wacht tot de gekozen bestanden beschikbaar zijn."); return; }
    let date: string | undefined;
    try { date = neededBefore ? localToInstant(neededBefore, access.tenant?.timezone ?? "Europe/Amsterdam") : undefined; }
    catch (error) { setError(error instanceof Error ? error.message : "Controleer de gewenste reactiedatum."); return; }
    const parsed = ticketCreateSchema.safeParse({ subject, body, categoryId, urgency, neededBefore: date,
      ...(selectedContext?.kind === "work_order" ? { workOrderId: selectedContext.id } : selectedContext?.kind === "object" ? { objectId: selectedContext.id } : {}),
      ...(support ? { module } : {}), uploadIds: files.map(file => file.id!),
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Controleer je gegevens."); return; }
    const fingerprint = JSON.stringify(parsed.data);
    if (!request.current || request.current.payload !== fingerprint) request.current = { key: crypto.randomUUID(), payload: fingerprint };
    const key = request.current.key;
    start(async () => {
      try {
        const result = await runTicketCommand(access.workspace, "create", parsed.data, key);
        if (!result.ok) { setError(result.error); return; }
        if (!result.id) { setError("Het ticketnummer is nog niet bevestigd. Probeer dezelfde aanvraag opnieuw."); return; }
        onSaved(result.id);
      } catch { setError("De ontvangst is niet bevestigd. Je invoer is bewaard; probeer opnieuw."); }
    });
  };
  return <TicketDialog workspace={access.workspace} title={support ? "Nieuw supportticket" : "Nieuwe melding"} description={support ? "Stel je vraag aan de technische ondersteuning. Deel alleen de informatie die nodig is om je te helpen." : `Stuur je vraag of probleem naar ${access.tenant?.name ?? "je organisatie"}.`} primaryColor={access.tenant?.primaryColor} accentColor={access.tenant?.accentColor} dirty={Boolean(subject || body || files.length)} busy={pending || files.some(file => file.status === "uploading")} onClose={onClose}>
    <form className="ticket-form" onSubmit={submit}>
      <label>Onderwerp<input autoFocus required minLength={3} maxLength={180} value={subject} onChange={event => setSubject(event.target.value)} placeholder="Waar kunnen we je mee helpen?"/></label>
      <label>Categorie<select aria-label="Categorie" required value={categoryId} disabled={files.length > 0} onChange={event => setCategoryId(event.target.value)}><option value="">Kies een categorie</option>{options.categories.filter(item => item.active && item.route === (support ? "platform_support" : "internal")).map(item => <option key={item.id} value={item.id}>{item.name}{item.confidential ? " · vertrouwelijk" : ""}</option>)}</select>{files.length > 0 && <small>Verwijder eerst de bijlagen om de categorie te wijzigen.</small>}</label>
      {category && <p className="ticket-notice">{category.description}{category.confidential && <> <ShieldCheck size={14}/> Deze categorie is vertrouwelijk.</>}{category.warning && <> {category.warning}</>}</p>}
      {support ? <><label>Betrokken module<select aria-label="Betrokken module" value={module} onChange={event => setModule(event.target.value)}>{options.modules.map(item => <option key={item} value={item}>{item}</option>)}</select></label><p className="ticket-muted">Technische context: {options.technicalContext.environment} · versie {options.technicalContext.release || "onbekend"}. Geen consolegegevens, toegangscodes of andere dossiers worden meegestuurd.</p></> : <><div className="ticket-form-grid"><label>Urgentie<select aria-label="Urgentie" value={urgency} onChange={event => setUrgency(event.target.value)}><option value="normal">Normaal</option><option value="urgent">Urgent</option></select></label><label>Gewenste reactie vóór<input type="datetime-local" value={neededBefore} onChange={event => setNeededBefore(event.target.value)}/><small>Optioneel · {access.tenant?.timezone ?? "Europe/Amsterdam"}</small></label></div><label>Werkbon of object<select aria-label="Werkbon of object" value={context} onChange={event => setContext(event.target.value)}><option value="">Geen context koppelen</option>{options.contexts.filter(item => ["work_order", "object"].includes(item.kind)).map(item => <option key={`${item.kind}:${item.id}`} value={item.id}>{item.kind === "work_order" ? "Werkbon" : "Object"}: {item.label}</option>)}</select><small>Je kunt alleen een momenteel toegankelijke werkbon of locatie kiezen.</small></label></>}
      <label>Omschrijving<textarea required minLength={3} maxLength={10000} rows={5} value={body} onChange={event => setBody(event.target.value)} placeholder="Beschrijf je vraag, wat er gebeurt en wat je nodig hebt."/></label>
      <p className="ticket-notice">Vermeld geen wachtwoorden, alarmcodes, sleutelkluiscodes of andere toegangsbewijzen.</p>
      {access.tenant && <TicketFilePicker workspace={access.workspace} tenantId={access.tenant.id} categoryId={categoryId} audience="reporter" draftId={draftId} files={files} setFiles={setFiles} disabled={pending}/>}
      {error && <p className="ticket-error" role="alert">{error}</p>}
      <footer className="ticket-form-footer"><button type="button" className="secondary-button" disabled={pending} onClick={() => { if ((!subject && !body && !files.length) || window.confirm("Deze melding is nog niet verstuurd. Wil je stoppen?")) onClose(); }}>Annuleren</button><button className="primary-button" disabled={pending || !ready}>{pending ? "Versturen…" : support ? "Supportticket versturen" : "Melding versturen"}<ArrowRight size={15}/></button></footer>
    </form>
  </TicketDialog>;
}

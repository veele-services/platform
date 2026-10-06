"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { runTicketCommand } from "@/app/tickets/actions";
import type { TicketAccess, TicketDetail, TicketOptions } from "@/lib/tickets/model";
import { TicketDialog } from "./dialog";
import { ticketBytes } from "./presentation";

export function TicketShare({ access, data, options, onClose, onSaved }: { access: TicketAccess; data: TicketDetail; options: TicketOptions; onClose: () => void; onSaved: (id: string) => void }) {
  const [step, setStep] = useState(0), [subject, setSubject] = useState(""), [body, setBody] = useState("");
  const [module, setModule] = useState("overig"), [categoryId, setCategoryId] = useState(""), [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState(""), [pending, start] = useTransition();
  const request = useRef<{ key: string; fingerprint: string } | null>(null);
  const eligible = (data.shareOptions ?? []).filter(file => file.scanState === "clean");
  const share = () => {
    setError("");
    const payload = { id: data.id, version: data.version, subject, body, module, categoryId, attachmentIds: selected };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { key: crypto.randomUUID(), fingerprint };
    const key = request.current!.key;
    start(async () => {
      try { const result = await runTicketCommand(access.workspace, "share", payload, key); if (!result.ok) setError(result.error); else if (result.id) onSaved(result.id); else setError("De nieuwe supportmelding is nog niet bevestigd. Probeer opnieuw."); }
      catch { setError("Het delen is niet bevestigd. Je selectie is bewaard; probeer opnieuw."); }
    });
  };
  const next = () => { if (subject.trim().length < 3 || body.trim().length < 3 || !categoryId) { setError("Vul een zelfstandig onderwerp, omschrijving en supportcategorie in."); return; } setError(""); setStep(current => current + 1); };
  return <TicketDialog title="Doorsturen naar support" description="Maak een aparte technische supportvraag. Het personeelsgesprek blijft binnen de organisatie." primaryColor={access.tenant?.primaryColor} accentColor={access.tenant?.accentColor} onClose={onClose} dirty={Boolean(subject || body || selected.length)} busy={pending} footer={<><button type="button" className="secondary-button" disabled={pending} onClick={() => step ? setStep(current => current - 1) : onClose()}><ArrowLeft size={15}/>{step ? "Vorige" : "Annuleren"}</button><button type="button" className="primary-button" disabled={pending} onClick={step === 2 ? share : next}>{pending ? "Delen…" : step === 2 ? "Supportticket aanmaken" : "Volgende"}{step === 2 ? <Send size={15}/> : <ArrowRight size={15}/>}</button></>}>
    <ol className="ticket-steps" aria-label="Stappen doorsturen">{["Omschrijving", "Bijlagen", "Controle"].map((name, index) => <li key={name} aria-current={index === step ? "step" : undefined}><span>{index + 1}</span>{name}</li>)}</ol>
    {step === 0 && <div className="ticket-form"><p className="ticket-notice">Neem geen namen van medewerkers, HR-inhoud, interne notities of geheime objectgegevens over. Beschrijf alleen wat Fieldgrid nodig heeft om het technische probleem te onderzoeken.</p><label>Onderwerp voor Fieldgrid<input autoFocus value={subject} onChange={event => setSubject(event.target.value)} minLength={3} maxLength={180} required/></label><label>Supportcategorie<select aria-label="Supportcategorie" value={categoryId} onChange={event => setCategoryId(event.target.value)} required><option value="">Kies een categorie</option>{options.supportCategories.filter(category => category.active).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Betrokken module<select aria-label="Betrokken module" value={module} onChange={event => setModule(event.target.value)}>{options.modules.map(item => <option key={item} value={item}>{item}</option>)}</select></label><label>Technische omschrijving<textarea value={body} onChange={event => setBody(event.target.value)} minLength={3} maxLength={10000} rows={6} required/></label><p className="ticket-muted">Technische context: {options.technicalContext.environment} · {options.technicalContext.release}. Geen inhoud uit de bronmelding wordt automatisch overgenomen.</p></div>}
    {step === 1 && <div className="ticket-form"><p className="ticket-notice">Selecteer bewust welke vrijgegeven bestanden de technische ondersteuning mag ontvangen. Standaard wordt niets gedeeld. Interne en vertrouwelijke bestanden worden hier niet aangeboden.</p>{eligible.map(file => <label className="ticket-file-check" key={file.id}><input type="checkbox" checked={selected.includes(file.id)} disabled={!selected.includes(file.id) && selected.length >= 5} onChange={event => setSelected(current => event.target.checked ? [...current, file.id] : current.filter(id => id !== file.id))}/><span>{file.name}<small>{file.mime} · {ticketBytes(file.size)} · vrijgegeven versie</small></span></label>)}{!eligible.length && <p className="ticket-empty">Geen deelbare bijlagen. Je kunt de technische vraag zonder bestanden doorsturen.</p>}</div>}
    {step === 2 && <div className="ticket-review"><p className="ticket-notice">Dit is exact de inhoud voor Fieldgrid. De twee tickets krijgen een eigen gesprek en status. Fieldgrid krijgt geen toegang tot het interne bronticket.</p><div><small>Onderwerp</small><strong>{subject}</strong></div><div><small>Omschrijving</small><p className="ticket-prewrap">{body}</p></div><div><small>Categorie / module</small><strong>{options.supportCategories.find(category => category.id === categoryId)?.name} · {module}</strong></div><div><small>Technische context</small><p>{options.technicalContext.environment} · {options.technicalContext.release}</p></div><div><small>Geselecteerde bijlagen</small>{selected.length ? eligible.filter(file => selected.includes(file.id)).map(file => <p key={file.id}>{file.name} · {file.mime} · {ticketBytes(file.size)}</p>) : <p>Geen bijlagen</p>}</div></div>}
    {error && <p className="ticket-error" role="alert">{error}</p>}
  </TicketDialog>;
}

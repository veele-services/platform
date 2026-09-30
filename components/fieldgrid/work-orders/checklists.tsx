"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerWorkOrderChecklist } from "@/app/app/work-order-actions";
import type { ChecklistInstance, ChecklistQuestion } from "@/lib/work-orders/model";
import "./work-orders.css";
import "./templates.css";

type Photo = { id: string; file_name: string; mime_type: string };
function Question({ checklist, question, editable, attachments }: { checklist: ChecklistInstance; question: ChecklistQuestion; editable: boolean; attachments: Photo[] }) {
  const existing = checklist.answers.find(a => a.questionId === question.id);
  const [value, setValue] = useState<string | number | boolean | null>(existing && ["string", "number", "boolean"].includes(typeof existing.value) ? existing.value as string | number | boolean : null);
  const [na, setNA] = useState(existing?.notApplicable ?? false), [reason, setReason] = useState(existing?.reason ?? ""), [photo, setPhoto] = useState(existing?.attachmentId ?? ""), [error, setError] = useState(""), [saved, setSaved] = useState(false), [pending, startTransition] = useTransition();
  const [mutationId, setMutationId] = useState(() => crypto.randomUUID());
  const router = useRouter(), id = `${checklist.id}-${question.id}`;
  const changed = () => { setSaved(false); setMutationId(crypto.randomUUID()); };
  const save = () => startTransition(async () => {
    const r = await answerWorkOrderChecklist({ mutationId, checklistId: checklist.id, questionId: question.id, version: existing?.version ?? 0, value, notApplicable: na, reason, attachmentId: photo || null });
    if (!r.ok) setError(r.error); else { setError(""); setSaved(true); router.refresh(); }
  });
  return <section className="wo-checklist-question">
    <label htmlFor={id}><strong>{question.label}{question.required ? " *" : ""}</strong></label>
    {question.help && <p id={`${id}-help`} className="dossier-muted">{question.help}</p>}
    {editable ? <>
      {question.allowNA && <label className="check"><input type="checkbox" checked={na} onChange={e => { setNA(e.target.checked); changed(); }}/>{" "}Niet van toepassing</label>}
      {na ? <label>Waarom niet van toepassing?<textarea value={reason} onChange={e => { setReason(e.target.value); changed(); }} maxLength={2000} required/></label> : <>
        {question.type === "check" && <label className="check"><input id={id} type="checkbox" checked={value === true} onChange={e => { setValue(e.target.checked); changed(); }}/> Gecontroleerd</label>}
        {question.type === "boolean" && <select id={id} value={value === null ? "" : String(value)} onChange={e => { setValue(e.target.value === "" ? null : e.target.value === "true"); changed(); }}><option value="">Kies antwoord</option><option value="true">Ja</option><option value="false">Nee</option></select>}
        {question.type === "choice" && <select id={id} value={String(value ?? "")} onChange={e => { setValue(e.target.value); changed(); }}><option value="">Kies antwoord</option>{question.options.map(o => <option key={o}>{o}</option>)}</select>}
        {question.type === "text" && <textarea id={id} value={String(value ?? "")} onChange={e => { setValue(e.target.value); changed(); }} maxLength={10000}/>}
        {question.type === "number" && <label><input id={id} type="number" step="any" value={typeof value === "number" ? value : ""} onChange={e => { setValue(e.target.value === "" ? null : e.target.valueAsNumber); changed(); }}/>{question.unit}</label>}
        {(question.type === "photo" || question.proof) && <label>Bewijsfoto<select id={question.type === "photo" ? id : `${id}-photo`} value={photo} onChange={e => { setPhoto(e.target.value); if (question.type === "photo") setValue(e.target.value || null); changed(); }}><option value="">Kies een foto uit dit rapport</option>{attachments.filter(a => /^image\/(jpeg|png|webp)$/.test(a.mime_type)).map(a => <option value={a.id} key={a.id}>{a.file_name}</option>)}</select><small>Voeg de foto eerst toe aan deze werkbon bij het rapport.</small></label>}
      </>}
      {error && <p role="alert" className="wo-error">{error}</p>}
      <button type="button" className="resource-action" onClick={save} disabled={pending || saved}>{pending ? "Opslaan…" : saved ? "Opgeslagen" : "Antwoord opslaan"}</button>
    </> : <p>{na ? `Niet van toepassing — ${reason}` : value === true ? "Ja / gecontroleerd" : value === false ? "Nee" : value === null ? "Nog niet beantwoord" : question.type === "photo" ? "Foto vastgelegd" : String(value)}{photo && <> · <a href={`/api/files/attachment/${photo}`} target="_blank" rel="noreferrer">Bewijsfoto</a></>}</p>}
    {existing && <small className="dossier-muted">Laatst opgeslagen {new Date(existing.updatedAt).toLocaleString("nl-NL")} · antwoordversie {existing.version}</small>}
  </section>;
}
export function ChecklistPanel({ orderId, checklists, editable, attachments }: { orderId: string; checklists: ChecklistInstance[]; editable: boolean; attachments: Photo[] }) {
  return <div className="wo-list" data-order={orderId}>
    {!checklists.length && <p>Geen checklists aan deze werkbon gekoppeld.</p>}
    {checklists.map(c => <section className="wo-card" key={c.id} aria-label={c.name}><h3>{c.name} <small>Versie {c.version}</small></h3>{c.questions.filter(q => !q.condition || c.answers.find(a => a.questionId === q.condition!.questionId)?.value === q.condition.equals).map(q => <Question key={`${q.id}:${c.answers.find(a => a.questionId === q.id)?.version ?? 0}`} checklist={c} question={q} editable={editable} attachments={attachments}/>)}</section>)}
  </div>;
}

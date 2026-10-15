"use client";

import {useRef, useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {runTicketCommand} from "@/app/(workspace)/tickets/actions";
import type {TicketCategory, TicketSettings} from "@/lib/tickets/model";
import {Panel, Field, Empty} from "../crm/ui";
import {useUnsavedDraft, confirmDiscard} from "../unsaved-form";

/** Defaults belong to the real intake category, not a second support registry. */
export function PlatformSupportDefaults({data}: {data: TicketSettings}) {
  const categories = data.categories.filter(item => item.active && item.route === "platform_support");
  const [selected, setSelected] = useState(categories[0]?.id ?? "");
  const category = categories.find(item => item.id === selected);
  return <Panel title="Supportinstellingen" action={categories.length > 1 && <select className="secondary-button" aria-label="Intakecategorie" value={selected} onChange={event => {if(confirmDiscard())setSelected(event.target.value);}}>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}>
    {category ? <SupportCategoryDefaults key={category.id} category={category} data={data}/> : <Empty title="Nog geen supportcategorieën" text="Voeg onder de uitgebreide instellingen een intakecategorie toe."/>}
  </Panel>;
}

function SupportCategoryDefaults({category, data}: {category: TicketCategory; data: TicketSettings}) {
  const router = useRouter();
  const [response, setResponse] = useState(category.responseMinutes), [choice, setChoice] = useState(String(category.responseMinutes)), [assignee, setAssignee] = useState(category.defaultAssigneeId ?? "");
  const [revision, setRevision] = useState(category.version), [original, setOriginal] = useState({response, assignee});
  const [error, setError] = useState(""), [saved, setSaved] = useState(false), [pending, start] = useTransition();
  const request = useRef({signature: "", key: ""});
  const dirty = response !== original.response || assignee !== original.assignee;
  const ref = useUnsavedDraft<HTMLFormElement>(dirty);
  const minutes = (time: string) => Number(time.slice(0,2)) * 60 + Number(time.slice(3));
  const day = minutes(data.openingHours.end) - minutes(data.openingHours.start);
  return <form ref={ref} onSubmit={event => {
    event.preventDefault(); setError(""); setSaved(false);
    const payload = {id: category.id, version: revision, name: category.name, description: category.description, active: category.active, order: category.order, defaultAssigneeId: assignee || null, groupId: category.groupId ?? null, fallbackCategoryId: category.fallbackCategoryId ?? null, responseMinutes: response, followupMinutes: category.followupMinutes, autoCloseDays: category.autoCloseDays, pauseWhileWaiting: category.pauseWhileWaiting, canEscalate: category.canEscalate, confidential: category.confidential, retentionProfile: category.retentionProfile ?? null};
    const signature = JSON.stringify(payload);
    if (request.current.signature !== signature) request.current = {signature, key: crypto.randomUUID()};
    start(async () => {
      try {
        const result = await runTicketCommand("platform", "save_category", payload, request.current.key);
        if (!result.ok) {setError(result.error); return;}
        setOriginal({response, assignee}); setRevision(result.version ?? revision + 1); setSaved(true); router.refresh();
      } catch {setError("Opslaan is niet bevestigd. Je invoer is bewaard; probeer opnieuw met dezelfde wijziging.");}
    });
  }}>
    <div className="ed-form-grid">
      <Field label="Reactietermijn"><select value={choice} disabled={pending} onChange={event => {setChoice(event.target.value);setResponse(event.target.value === 'day' ? day : Number(event.target.value));}}>
        <option value={480}>Binnen 8 werkuren</option><option value={240}>Binnen 4 werkuren</option>
        {day > 0 && <option value="day">Binnen 1 werkdag</option>}
        {![480,240].includes(response) && <option value={response}>Binnen {response} werkminuten</option>}
      </select></Field>
      <Field label="Standaard verantwoordelijke"><select value={assignee} disabled={pending} onChange={event => setAssignee(event.target.value)}>
        {data.members.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}<option value="">Niet toegewezen</option>
      </select></Field>
    </div>
    {error && <p className="ticket-error" role="alert">{error}</p>}{saved && <p className="ticket-success" role="status">Supportinstellingen opgeslagen.</p>}
    <button className="primary-button" disabled={pending || !dirty}>{pending ? "Opslaan…" : "Opslaan"}</button>
    {error && <button className="text-link" type="button" disabled={pending} onClick={() => {if(confirmDiscard())location.reload();}}>Actuele instellingen laden</button>}
  </form>;
}

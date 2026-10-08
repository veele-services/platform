"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Eye, ListChecks } from "lucide-react";
import { EmptyState } from "./empty-state";
import { PageHeading } from "./page-heading";
import { ActionIcon, ActionLink } from "./action-icon";
import "./dossier-consistency.css";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { brandThemeStyle } from "@/lib/branding/palette";
import { businessToday, dossierDefinitions, type RecordKind } from "@/lib/personnel/dossier";
import { useUnsaved } from "./personnel-dossier-forms";
import { updateDossierTaskState } from "@/app/app/personeel/dossier-actions";
import { CompactFilterMenu } from "./compact-filter-menu";

export type PersonnelActionKind=RecordKind|"time_correction";
export type PersonnelActionRow={id:string;personnelId:string;name:string;kind:PersonnelActionKind;title:string;date:string|null;owner:string;status:string;revision:number;href?:string};
const actionTitle=(kind:PersonnelActionKind)=>kind==="time_correction"?"Urencorrectie":dossierDefinitions[kind].title;
const actionStatus=(row:PersonnelActionRow)=>row.kind==="time_correction"?(row.status==="pending"?"Te beoordelen":row.status):dossierDefinitions[row.kind].statuses.find(([key])=>key===row.status)?.[1]||"Controleren";
export function PersonnelActions({rows,primary,accent,timezone}:{rows:PersonnelActionRow[];primary:string;accent:string;timezone:string}){
 const [query,setQuery]=useState("");const [kind,setKind]=useState("");const [state,setState]=useState("open");const [selected,setSelected]=useState<PersonnelActionRow|null>(null);const [error,setError]=useState("");const [pending,start]=useTransition();const router=useRouter();
 const [dirty,setDirty]=useState(false);const mayClose=useUnsaved(dirty);
 const close=()=>{if(!pending&&mayClose()){setDirty(false);setSelected(null);}};
 const today=businessToday(new Date(),timezone);
 const closed=(status:string)=>["completed","ended","returned","recovered","archived","approved","rejected","withdrawn"].includes(status);
 const shown=rows.filter(r=>[r.name,r.title].join(" ").toLowerCase().includes(query.toLowerCase())&&(!kind||r.kind===kind)&&(state==="all"||state==="late"?state==="all"||!!r.date&&r.date<today&&!closed(r.status):!closed(r.status)));
 const activeFilters=[query,kind,state!=="open"?state:""].filter(Boolean).length;
 const filters=<CompactFilterMenu activeCount={activeFilters} contentClassName="dossier-filter-popover"><div className="dossier-toolbar"><label>Zoeken<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Medewerker of actie…"/></label><label>Type<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">Alle typen</option>{[...new Set(rows.map(r=>r.kind))].map(k=><option key={k} value={k}>{actionTitle(k)}</option>)}</select></label><label>Status<select value={state} onChange={e=>setState(e.target.value)}><option value="open">Openstaand</option><option value="late">Deadline overschreden</option><option value="all">Alle statussen</option></select></label></div></CompactFilterMenu>;
 return <div className="personnel-dossier"><Link className="dossier-back" href="/app/personeel"><ArrowLeft size={16}/>Terug naar personeel</Link><PageHeading eyebrow="PERSONEEL" title="Actie nodig" help="Deadlines en opvolging over alle personeelsdossiers. Een verstuurde of gelezen melding rondt geen taak af." actions={filters}/>
 <div className="compact-filter-bar"><span className="compact-filter-result">{shown.length} {shown.length===1?"actie":"acties"}</span></div>
 <section className="dossier-card"><div className="table-scroll"><table className="resource-table"><thead><tr>{["Actie","Medewerker","Deadline","Verantwoordelijke","Status","Acties"].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{shown.map(r=><tr key={`${r.kind}:${r.id}`}><td><strong>{r.title}</strong><small>{actionTitle(r.kind)}</small></td><td>{r.name}</td><td>{r.date?new Intl.DateTimeFormat("nl-NL",{dateStyle:"medium"}).format(new Date(`${r.date}T12:00:00Z`)):"Nog af te spreken"}</td><td>{r.owner||"Nog toe te wijzen"}</td><td><span className="dossier-status">{actionStatus(r)}</span>{r.date&&r.date<today&&!closed(r.status)&&<small>Deadline overschreden</small>}</td><td><div className="resource-actions"><ActionLink className="resource-action" label="Open dossier" icon={<Eye size={16}/>} href={r.href??`/app/personeel/${r.personnelId}?tab=${dossierDefinitions[r.kind as RecordKind].tab}#record-${r.id}`}/>{["task","checklist"].includes(r.kind)&&r.status!=="completed"&&<ActionIcon className="resource-action" label="Opvolgen" icon={<ListChecks size={16}/>} onClick={()=>{setError("");setDirty(false);setSelected(r);}}/>}</div></td></tr>)}</tbody></table></div>{!shown.length&&<EmptyState title="Geen acties gevonden" description="Geen acties voor deze selectie."/>}<p className="dossier-muted">Escaleren: open de registratie en kies een andere verantwoordelijke of expliciete managementadressen bij de reminders. Er worden geen nieuwe toegangsrechten toegekend.</p></section>
 {selected&&<Dialog open onOpenChange={v=>{if(!v)close();}}><DialogContent className="dossier-dialog" style={brandThemeStyle(primary,accent)}><header><div><DialogTitle>Taak opvolgen</DialogTitle><DialogDescription>{selected.name} · {selected.title}</DialogDescription></div></header><form className="dossier-form" onChange={()=>setDirty(true)} onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);Object.entries({personnelId:selected.personnelId,id:selected.id,revision:String(selected.revision)}).forEach(([k,v])=>form.set(k,v));start(async()=>{const r=await updateDossierTaskState(form);if(!r.ok)setError(r.error);else{toast.success("Taak bijgewerkt");setDirty(false);setSelected(null);router.refresh();}});}}><div className="dossier-form-fields"><label className="wide">Status<select aria-label="Status" name="status"><option value="progress">In behandeling</option><option value="completed">Afgerond</option></select></label><label className="wide">Uitgevoerde opvolging / bewijs<textarea name="evidence" maxLength={2000} rows={4}/></label>{error&&<p role="alert" className="auth-message error">{error}</p>}</div><footer><button type="button" className="secondary-button" disabled={pending} onClick={close}>Annuleren</button><button className="primary-button" disabled={pending}>Opslaan</button></footer></form></DialogContent></Dialog>}
 </div>;
}

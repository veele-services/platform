"use client";

import {useEffect,useId,useMemo,useState} from "react";
import Link from "next/link";
import {loadPlanningCapacity} from "@/app/(workspace)/app/planning/actions";
import {EmptyState} from "@/components/fieldgrid/empty-state";
import {SectionHeader} from "@/components/fieldgrid/section-header";
import {localToInstant} from "@/lib/planning/time";
import type {PlanningCapacity} from "@/lib/planning/model";
import "./capacity-overview.css";

const addDays=(day:string,days:number)=>{const value=new Date(`${day}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);};
const hours=(minutes:number)=>new Intl.NumberFormat("nl-NL",{maximumFractionDigits:1}).format(minutes/60);

export function CapacityOverview({day,timezone}:{day:string;timezone:string}){
 const bodyId=useId(),[open,setOpen]=useState(false),[mode,setMode]=useState<"day"|"week">("day"),[selectedDay,setSelectedDay]=useState(day),[discipline,setDiscipline]=useState(""),[functionId,setFunctionId]=useState("");
 const [response,setResponse]=useState<{key:string;data:PlanningCapacity|null;error:string}|null>(null);
 const range=useMemo(()=>{const endDay=addDays(selectedDay,mode==="day"?1:7);return{start:localToInstant(`${selectedDay}T00:00`,timezone,"later"),end:localToInstant(`${endDay}T00:00`,timezone,"later")};},[mode,selectedDay,timezone]);
 const requestKey=`${range.start}|${range.end}|${discipline}|${functionId}`;
 useEffect(()=>{if(!open)return;let active=true;void loadPlanningCapacity({...range,discipline,functionId}).then(result=>{if(active)setResponse({key:requestKey,data:result,error:""});}).catch(()=>{if(active)setResponse({key:requestKey,data:null,error:"De capaciteitsberekening kon niet worden geladen."});});return()=>{active=false;};},[open,range,discipline,functionId,requestKey]);
 const current=response?.key===requestKey?response:null,data=current?.data??null,error=current?.error??"",loading=current===null;
 const stateLabel={covered:"Gedekt",attention:"Aandachtspunt",shortage:"Tekort"} as const;
 return <section className="fg-section capacity-overview" data-open={open} aria-label="Capaciteit"><SectionHeader subtitle="PLANNING" title="Capaciteit" help="Deze momentopname telt concrete vraag en geplande inzet. Potentiële kandidaten worden niet als gereserveerde capaciteit opgeteld." actions={<div className="capacity-actions"><button className="secondary-button" aria-expanded={open} aria-controls={bodyId} onClick={()=>setOpen(value=>!value)}>{open?"Capaciteit sluiten":"Capaciteit openen"}</button>{open&&<div className="object-actions"><button className={mode==="day"?"primary-button":"secondary-button"} onClick={()=>setMode("day")}>Dag</button><button className={mode==="week"?"primary-button":"secondary-button"} onClick={()=>setMode("week")}>Week</button></div>}</div>}/>
  {open&&<div id={bodyId} className="fg-section-body capacity-body">
  <div className="capacity-filter-grid"><label>Vanaf<input type="date" value={selectedDay} onChange={event=>setSelectedDay(event.target.value)}/></label><label>Discipline<select value={discipline} onChange={event=>setDiscipline(event.target.value)}><option value="">Alle disciplines</option>{(data?.disciplines??[]).map(value=><option key={value}>{value}</option>)}</select></label><label>Vereiste functie<select value={functionId} onChange={event=>setFunctionId(event.target.value)}><option value="">Alle functies</option>{(data?.functions??[]).map(value=><option key={value.id} value={value.id}>{value.name}</option>)}</select></label></div>
  {loading&&<p role="status">Capaciteit berekenen…</p>}{error&&<p role="alert" className="auth-message error">{error}</p>}
  {data&&!loading&&<><div className="capacity-summary-grid"><article><span>Concrete vraag</span><strong>{hours(data.requiredMinutes)} uur</strong></article><article><span>Ingepland</span><strong>{hours(data.scheduledMinutes)} uur</strong></article><article><span>Ontbreekt</span><strong>{hours(data.missingMinutes)} uur</strong></article><article><span>Onbekende beschikbaarheid</span><strong>{data.unknownCandidates}</strong></article></div>
   <div className="capacity-rows">{data.rows.map(row=><article key={row.id}><div><Link className="text-link" href={`/app/werkbonnen/${row.id}`}><strong>{row.number} · {row.title}</strong></Link><small>{row.discipline} · {row.requiredPersonnel} medewerker{row.requiredPersonnel===1?"":"s"} · {hours(row.requiredMinutes)} uur vraag / {hours(row.scheduledMinutes)} uur gepland</small><small>{row.knownCandidates} bekend inzetbaar · {row.unknownCandidates} onbekend · {row.attentionCandidates} met aandachtspunt</small></div><span className={`resource-status ${row.state==="covered"?"resource-status-green":row.state==="shortage"?"resource-status-red":"resource-status-orange"}`}>{stateLabel[row.state]}</span></article>)}</div>
   {!data.rows.length&&<EmptyState title="Geen concrete capaciteitsvraag" description="Binnen dit tijdvak vallen geen ingeplande werkbonnen met een uitvoeringsvenster."/>}<p className="dossier-muted">Bronmoment: {new Intl.DateTimeFormat("nl-NL",{dateStyle:"short",timeStyle:"short",timeZone:timezone}).format(new Date(data.sourceAt))}. Onbekende tijd telt niet als zekere vrije capaciteit.</p></>}
  </div>}
 </section>;
}

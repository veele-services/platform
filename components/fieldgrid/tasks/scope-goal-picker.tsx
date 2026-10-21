"use client";
import {useEffect,useState} from "react";
import {loadTaskControls} from "@/lib/tasks/control-actions";
import type {TaskControlContext} from "@/lib/tasks/controls-model";
export function ScopeGoalPicker({taskId,transferring,selected,onChange}:{taskId:string;transferring:boolean;selected:Array<{id:string;quantity:number}>;onChange:(value:Array<{id:string;quantity:number}>)=>void}){
 const [data,setData]=useState<TaskControlContext|null>(null),[query,setQuery]=useState(""),[page,setPage]=useState(0),[error,setError]=useState("");
 useEffect(()=>{let active=true;void loadTaskControls(taskId,page*25,query).then(r=>{if(active){if(r.ok){setData(r.data);setError("");}else setError(r.error);}});return()=>{active=false;};},[taskId,page,query]);
 return <div className="task-control-panel"><label>Concrete doelen zoeken<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>{error&&<p role="alert">{error}</p>}{data?.targets.map(goal=><label className="dossier-check" key={goal.id}><input type="checkbox" disabled={transferring&&goal.state==="completed"} checked={selected.some(s=>s.id===goal.id)} onChange={e=>onChange(e.target.checked?[...selected,{id:goal.id,quantity:goal.quantity}]:selected.filter(s=>s.id!==goal.id))}/>{goal.number} · {goal.name}{goal.state==="completed"?" · Reeds uitgevoerd":""}</label>)}<div className="object-actions"><button type="button" className="secondary-button" disabled={!page} onClick={()=>setPage(p=>p-1)}>Vorige doelen</button><span>Pagina {page+1} · {selected.length} geselecteerd</span><button type="button" className="secondary-button" disabled={(data?.targets.length??0)<25} onClick={()=>setPage(p=>p+1)}>Volgende doelen</button></div></div>;
}

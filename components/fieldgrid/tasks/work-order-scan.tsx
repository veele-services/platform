"use client";
import {useCallback,useState,useTransition} from "react";
import {findWorkOrderScan,type ScanMatch} from "@/lib/tasks/control-actions";
import {CameraScan} from "./controls";
export function WorkOrderScan({orderId,onSelect}:{orderId:string;onSelect:(taskId:string,itemId:string)=>void}){
 const [identity,setIdentity]=useState(""),[matches,setMatches]=useState<ScanMatch[]>([]),[error,setError]=useState(""),[pending,start]=useTransition();
 const scan=useCallback((value:string)=>{setIdentity(value);start(async()=>{const r=await findWorkOrderScan(orderId,value);if(!r.ok){setError(r.error);setMatches([]);return;}setError(r.data.length?"":"Geen gekoppeld item gevonden. Zoek in de taak of laat een bevoegde planner het item koppelen.");setMatches(r.data);if(r.data.length===1)onSelect(r.data[0].taskId,r.data[0].itemId);});},[orderId,onSelect]);
 return <details className="task-control-panel"><summary>Item zoeken of scannen op deze werkbon</summary><form className="task-target-form" onSubmit={e=>{e.preventDefault();scan(identity);}}><label>Itemnummer, scan-ID of serienummer<input value={identity} maxLength={200} required onChange={e=>setIdentity(e.target.value)}/></label><button type="submit" className="secondary-button" disabled={pending}>Passende taken zoeken</button></form><CameraScan onScan={scan}/>{error&&<p role="status">{error}</p>}{matches.length>1&&<><p>Kies welke taak je op dit item wilt uitvoeren.</p>{matches.map(match=><button type="button" className="secondary-button" key={match.targetId} onClick={()=>onSelect(match.taskId,match.itemId)}>{match.number} · {match.name} · {match.taskName}</button>)}</>}</details>;
}

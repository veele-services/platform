"use client";
import {useRef,useState,useTransition} from "react";
import {toast} from "sonner";
import type {TenantContext} from "@/lib/auth/context";
import type {WorkOrderDossier} from "@/lib/work-orders/model";
import {manageWorkOrder} from "@/app/app/work-order-actions";
import {WorkOrderDialog} from "./dialog";

export function WorkOrderManagementDialog({data,tenant,assignmentId,onClose,onSaved}:{data:WorkOrderDossier;tenant:TenantContext;assignmentId?:string;onClose:()=>void;onSaved:()=>void}){
 const order=data.order,assignment=data.assignments.find(a=>a.id===assignmentId),[reason,setReason]=useState(""),[status,setStatus]=useState(""),[error,setError]=useState(""),[pending,start]=useTransition(),mutation=useRef(crypto.randomUUID());
 const choices:Array<{value:"planned"|"released"|"returned"|"correction_required"|"approved"|"cancelled";label:string}>=[];
 if(order.status==="returned" && !data.assignments.some(a=>a.actualStart))choices.push({value:"planned",label:"Opnieuw in te delen"});
 if(order.canEdit&&!order.publishedAt&&data.assignments.some(a=>!["returned","cancelled"].includes(a.status)))choices.push({value:"released",label:"Planning vrijgeven"});
 if(order.start && order.end && ["draft","correction"].includes(order.reportState))choices.push({value:"returned",label:"Terug naar planning / geblokkeerd"});
 if(["review","waiting_signature","correction"].includes(order.reportState))choices.push({value:"correction_required",label:"Rapportcorrectie aanvragen"});
 if(order.reportState==="review")choices.push({value:"approved",label:"Rapport goedkeuren"});
 if(order.canEdit)choices.push({value:"cancelled",label:"Annuleren"});
 return <WorkOrderDialog title={assignment?"Medewerker van werkbon verwijderen":"Status wijzigen"} description={assignment?`${assignment.name} · ${order.number}`:order.number} tenant={tenant} dirty={reason.length>0||status.length>0} busy={pending} onClose={onClose}><form className="wo-dialog-body wo-form" id="management-command" onSubmit={e=>{e.preventDefault();start(async()=>{const result=await manageWorkOrder({orderId:order.id,version:order.version,mutationId:mutation.current,action:assignment?"remove_assignment":"status",...(assignment?{assignmentId:assignment.id}:{status:status as typeof choices[number]["value"]}),reason});if(!result.ok){setError(result.error);return;}toast.success(assignment?"Medewerker verwijderd; historie bewaard":"Status bijgewerkt");onSaved();});}} onChange={()=>{mutation.current=crypto.randomUUID();setError("");}}>
 {assignment?<p className="wide">De medewerker verdwijnt uit de actieve bezetting en verliest toegang tot deze werkbon. Lopende uren worden gestopt. Reeds geregistreerde werkzaamheden en uren blijven bewaard.</p>:<><label className="wide">Nieuwe status<select aria-label="Nieuwe status" required value={status} onChange={e=>setStatus(e.target.value)}><option value="" disabled>Kies een statuswijziging</option>{choices.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label><p className="wide">Starten en gereedmelden volgen de echte uitvoering. Goedkeuren vereist een compleet, geldig rapport met de vereiste ondertekening.</p></>}
 <label className="wide">Reden<textarea required minLength={3} maxLength={1000} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>{error&&<p className="wo-error wide" role="alert">{error}</p>}
 </form><footer className="wizard-footer"><button className="secondary-button" disabled={pending} onClick={onClose}>Annuleren</button><button type="submit" form="management-command" className="primary-button" disabled={pending||reason.trim().length<3||(!assignment&&!status)}>{pending?"Opslaan…":assignment?"Medewerker verwijderen":"Status vastleggen"}</button></footer></WorkOrderDialog>;
}

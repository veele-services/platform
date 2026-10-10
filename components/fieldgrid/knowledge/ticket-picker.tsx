"use client";
import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { findTicketKnowledge } from "@/lib/knowledge/actions";
import type { TicketAudience, TicketWorkspace } from "@/lib/tickets/model";
import { knowledgeLabels, type KnowledgeArticle, type KnowledgeWorkspace } from "@/lib/knowledge/model";
import { KnowledgeBody } from "./article";
import "./knowledge.css";
export function TicketKnowledgePicker({ workspace, ticketId, audience, disabled, onInsert }: { workspace: TicketWorkspace; ticketId: string; audience: TicketAudience; disabled: boolean; onInsert: (text: string) => void }) {
  const [open,setOpen]=useState(false),[search,setSearch]=useState(""),[response,setResponse]=useState<{key:string;data:{portal:KnowledgeWorkspace;items:Array<KnowledgeArticle & {href:string}>}}|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const key=`${workspace}:${ticketId}:${audience}:${search}`,result=response?.key===key?response.data:null;
  useEffect(()=>{
    if(!open)return;let live=true;const run=async()=>{setBusy(true);setResponse(null);setError("");const r=await findTicketKnowledge({workspace,ticketId,audience,search});if(!live)return;if(r.ok)setResponse({key,data:r.data});else setError(r.error);setBusy(false);};
    const timer=window.setTimeout(run,250),poll=window.setInterval(run,30000);window.addEventListener("focus",run);
    const clear=()=>{live=false;setOpen(false);setResponse(null);};window.addEventListener("notifications-account-cleared",clear);
    return()=>{live=false;window.clearTimeout(timer);window.clearInterval(poll);window.removeEventListener("focus",run);window.removeEventListener("notifications-account-cleared",clear);};
  },[open,workspace,ticketId,audience,search,key]);
  if(!["tenant","support","platform"].includes(workspace))return null;
  return <div><button type="button" className="secondary-button" disabled={disabled} onClick={()=>setOpen(v=>!v)}><BookOpen size={15}/>{open?"Kennisbank sluiten":"Artikel uit kennisbank"}</button>{open&&<section className="kb-ticket-picker" aria-label="Kennisbank bij dit ticket"><label>Zoek een handleiding<input type="search" value={search} maxLength={160} placeholder="Bijvoorbeeld inlogcode, planning of factuur" onChange={e=>setSearch(e.target.value)}/></label><p className="ticket-muted">{result?`Artikelen voor ${knowledgeLabels[result.portal]}.`:"Artikelen worden afgestemd op de ontvanger en zichtbaarheid van dit bericht."} De link wordt aan je concept toegevoegd; verzenden doe je zelf.</p>{busy&&<p role="status">Artikelen zoeken…</p>}{error&&<p role="alert">{error}</p>}{result?.items.map(item=><article className="kb-ticket-result" key={item.slug}><h3>{item.title}</h3><p>{item.summary}</p><details><summary>Artikel lezen</summary><KnowledgeBody body={item.body}/></details><button type="button" className="secondary-button" disabled={disabled} onClick={()=>{onInsert(`${item.title}\n${item.href}`);setOpen(false);}}>Link in antwoord invoegen</button></article>)}{result&&!result.items.length&&<p>Geen passende artikelen. Probeer andere kernwoorden.</p>}</section>}</div>;
}

"use client";

import { useRef,useState,useTransition } from "react";
import { Check,CheckCheck,Info } from "lucide-react";
import type { CustomerNewsMarkResult } from "@/lib/customer-portal/news-action";
import { customerDate,type CustomerNews } from "@/lib/customer-portal/presentation";
import { CustomerDialog } from "./dialog";

/** The body is ordinary text, never campaign HTML. Read/ack status is confirmed
 * by a scoped server receipt; merely rendering this dialog does not invent it. */
export function CustomerNewsDetailDialog({news,tenant,timezone,close,mark}:{
 news:CustomerNews;tenant:string;timezone:string;close:()=>void;
 mark:(notificationId:string,version:number,operation:"read"|"ack",commandId:string)=>Promise<CustomerNewsMarkResult>;
}){
 const [sourceVersion,setSourceVersion]=useState(news.version),[readConfirmed,setReadConfirmed]=useState(false),[ackConfirmed,setAckConfirmed]=useState(false);
 const [error,setError]=useState(""),[pending,start]=useTransition(),keys=useRef(new Map<string,string>());
 const stale=news.version>sourceVersion,read=Boolean(news.readAt)||readConfirmed,acknowledged=Boolean(news.acknowledgedAt)||ackConfirmed;
 const submit=(operation:"read"|"ack")=>{
  const receiptKey=JSON.stringify({notificationId:news.id,version:sourceVersion,operation});
  let commandId=keys.current.get(receiptKey);if(!commandId){commandId=crypto.randomUUID();keys.current.set(receiptKey,commandId);}
  start(async()=>{
   try{
    const result=await mark(news.id,sourceVersion,operation,commandId);
    if(!result.ok){setError(result.error);return;}
    if(result.notificationId!==news.id||result.version<sourceVersion){setError("Opslaan kon niet worden bevestigd. Probeer dezelfde leesactie opnieuw.");return;}
    setSourceVersion(result.version);setError("");
    if(operation==="read")setReadConfirmed(true);else setAckConfirmed(true);
   }catch{setError("Opslaan kon niet worden bevestigd. Probeer dezelfde leesactie opnieuw.");}
  });
 };
 return <CustomerDialog guideKey="customer.news" title={news.title} kicker="Nieuws & dienstverlening" close={close} busy={pending}
  description={`${news.category} · ${customerDate(news.createdAt,timezone,true)}`}
  footer={<><button className="button" type="button" disabled={pending} onClick={close}>Sluiten</button>
   {!read&&<button className="button" type="button" disabled={pending||stale} onClick={()=>submit("read")}><Check/>{pending?"Opslaan…":"Als gelezen markeren"}</button>}
   {news.ackRequired&&!acknowledged&&<button className="button primary" type="button" disabled={pending||stale} onClick={()=>submit("ack")}><CheckCheck/>{pending?"Opslaan…":"Ontvangst bevestigen"}</button>}
  </>}>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {stale&&<div className="banner warn" role="status"><Info/><div><p>Dit bericht is bijgewerkt. Controleer de actuele tekst voordat je de leesstatus opslaat.</p>
   <button className="button small" type="button" disabled={pending} onClick={()=>{if(window.confirm("Heb je het actuele bericht gecontroleerd?")){setSourceVersion(news.version);setError("");}}}>Actueel bericht gebruiken</button></div></div>}
  <div className="card card-pad"><p className="meta">{tenant}</p><div style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{news.body}</div></div>
  {(read||acknowledged)&&<p className="notice section-gap" role="status"><Check/>{acknowledged?"Ontvangst bevestigd.":"Dit bericht is gelezen."}</p>}
 </CustomerDialog>;
}

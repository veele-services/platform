"use client";
import {useEffect,useState} from "react";
import {getVisitSignals} from "@/app/klant/actions";

// Counts only; secrets and request bodies never enter generic work-order cards.
export function ObjectVisitSignals({orderId}:{orderId:string}) {
 const [signals,setSignals]=useState<{instructions:number;requests:number;review:number}|null>(null);
 useEffect(()=>{
  let active=true;
  const load=async()=>{const result=await getVisitSignals(orderId);if(active)setSignals(result);};
  void load();const timer=window.setInterval(()=>{if(!document.hidden)void load();},30000);
  window.addEventListener("focus",load);
  return()=>{active=false;clearInterval(timer);window.removeEventListener("focus",load);};
 },[orderId]);
 if(!signals||!(signals.instructions+signals.requests+signals.review))return null;
 return <p className="dossier-notice" aria-live="polite">{signals.instructions>0&&`${signals.instructions} nieuwe of gewijzigde instructie(s). `}{signals.requests>0&&`${signals.requests} ongelezen bezoekverzoek(en). `}{signals.review>0&&`${signals.review} verzoek(en) vragen beoordeling. `}Open het objectdossier bij deze werkbon.</p>;
}

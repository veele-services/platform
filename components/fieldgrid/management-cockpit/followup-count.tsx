"use client";
import {useEffect,useState} from 'react';

/** A source sidebar badge is an aggregate of the same authorized register.
 * Missing access or an unconfirmed response is never presented as zero. */
export function FollowupCount({actorKey}:{actorKey:string}){
 const [snapshot,setSnapshot]=useState<{key:string;count:number}|null>(null);
 useEffect(()=>{
  let live=true,serial=0,controller:AbortController|null=null;
  const load=async()=>{if(!live||document.visibilityState!=='visible')return;controller?.abort();const c=new AbortController(),n=++serial;controller=c;
   try{const response=await fetch('/api/management-cockpit?summary=1',{cache:'no-store',signal:c.signal});if(!response.ok)throw new Error('Unavailable');const data=await response.json();if(!Number.isSafeInteger(data.count)||data.count<0)throw new Error('Invalid count');if(live&&!c.signal.aborted&&n===serial)setSnapshot({key:actorKey,count:data.count})}
   catch{if(live&&!c.signal.aborted&&n===serial)setSnapshot(null)}
  };
  const refresh=()=>void load(),clear=()=>{live=false;serial++;controller?.abort();setSnapshot(null)};
  void load();const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);window.addEventListener('cockpit-followup-changed',refresh);window.addEventListener('notifications-account-cleared',clear);
  return()=>{live=false;serial++;controller?.abort();clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('cockpit-followup-changed',refresh);window.removeEventListener('notifications-account-cleared',clear)};
 },[actorKey]);
 return snapshot?.key===actorKey?<em aria-label={`${snapshot.count} open opvolgacties`}>{snapshot.count}</em>:null;
}

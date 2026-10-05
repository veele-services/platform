"use client";

import { useEffect,useMemo,useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { createCustomerRefreshStore,loadCustomerCoreSnapshot,observeCustomerRefresh } from "@/lib/customer-portal/refresh";
import type { CustomerCoreSnapshot } from "@/lib/customer-portal/snapshot-model";

export function useCustomerRefresh(initial:CustomerCoreSnapshot,tenantId:string,actorKey:string){
 const accountId=initial.workspace.account.id;
 const store=useMemo(()=>{
  if(!tenantId||!/^[a-f0-9]{64}$/.test(actorKey))throw new Error("Ongeldige klantcontext.");
  return createCustomerRefreshStore(initial,signal=>loadCustomerCoreSnapshot(accountId,signal));
 },[initial,accountId,tenantId,actorKey]);
 const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getServerSnapshot);
 useEffect(()=>{
  store.start();
  const cleanup=observeCustomerRefresh(store,{window,document,visible:()=>document.visibilityState==="visible",online:()=>navigator.onLine,
   repeat:(callback,ms)=>{const timer=window.setInterval(callback,ms);return()=>window.clearInterval(timer);}});
  const client=createClient(),channel=client.channel(`customer-revision:${actorKey}:${accountId}`)
   .on("postgres_changes",{event:"UPDATE",schema:"public",table:"customer_portal_revisions",filter:`account_id=eq.${accountId}`},()=>{void store.refresh();})
   .subscribe(status=>{if(status==="SUBSCRIBED")void store.refresh();else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")store.markStale();});
  return()=>{cleanup();store.stop();void client.removeChannel(channel);};
 },[store,tenantId,actorKey,accountId]);
 return {...state,refresh:store.refresh,revoke:store.revoke};
}

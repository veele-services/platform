import { customerCoreSnapshotSchema,type CustomerCoreSnapshot } from "./snapshot-model";

export type CustomerRefreshResult={kind:"ok";snapshot:CustomerCoreSnapshot}|{kind:"denied"}|{kind:"temporary"};
export type CustomerRefreshState={snapshot:CustomerCoreSnapshot|null;stale:boolean;denied:boolean};

/** No localStorage, service-worker cache, source-row payloads or account
 * fallback. A denied refresh is terminal for this rendered account instance. */
export function createCustomerRefreshStore(initial:CustomerCoreSnapshot,load:(signal:AbortSignal)=>Promise<CustomerRefreshResult>){
 const serverState:CustomerRefreshState={snapshot:initial,stale:false,denied:false};
 let state=serverState,closed=false,epoch=0,queued=false;
 let pending:Promise<void>|null=null,abort:AbortController|null=null;
 const listeners=new Set<()=>void>();
 const publish=(next:CustomerRefreshState)=>{state=next;for(const listener of listeners)listener();};
 const revoke=()=>{if(closed||state.denied)return;epoch++;abort?.abort();abort=null;pending=null;queued=false;publish({snapshot:null,stale:false,denied:true});};
 const refresh=():Promise<void>=>{
  if(closed||state.denied)return Promise.resolve();
  if(pending){queued=true;return pending;}
  const sequence=epoch;
  publish({...state,stale:true});
  pending=(async()=>{
   do{
    queued=false;abort=new AbortController();
    let result:CustomerRefreshResult;
    try{result=await load(abort.signal);}catch{result={kind:"temporary"};}
    if(closed||sequence!==epoch||state.denied)return;
    if(result.kind==="denied"){revoke();return;}
    if(result.kind==="ok"){
     const parsed=customerCoreSnapshotSchema.safeParse(result.snapshot);
     if(parsed.success&&parsed.data.workspace.account.id===initial.workspace.account.id)
      publish({snapshot:parsed.data,stale:queued,denied:false});
     else if(parsed.success){revoke();return;}
     else publish({...state,stale:true});
    }else publish({...state,stale:true});
   }while(queued&&!closed&&!state.denied);
  })().finally(()=>{if(sequence===epoch){pending=null;abort=null;}});
  return pending;
 };
 return {
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  getSnapshot:()=>state,getServerSnapshot:()=>serverState,
  refresh,revoke,markStale:()=>{if(!closed&&!state.denied&&!state.stale)publish({...state,stale:true});},
  start:()=>{closed=false;},
  stop:()=>{closed=true;epoch++;queued=false;abort?.abort();abort=null;pending=null;},
 };
}
export type CustomerRefreshStore=ReturnType<typeof createCustomerRefreshStore>;

export async function loadCustomerCoreSnapshot(accountId:string,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<CustomerRefreshResult>{
 const response=await fetcher(`/api/customer-portal/state?account=${encodeURIComponent(accountId)}`,{cache:"no-store",credentials:"same-origin",redirect:"error",signal});
 if(response.status===401||response.status===403)return {kind:"denied"};
 if(!response.ok)return {kind:"temporary"};
 const parsed=customerCoreSnapshotSchema.safeParse(await response.json());
 if(!parsed.success)return {kind:"temporary"};
 if(parsed.data.workspace.account.id!==accountId)return {kind:"denied"};
 return {kind:"ok",snapshot:parsed.data};
}

/** Strict active RLS can suppress a revocation event. Foreground checks are
 * therefore independent of Realtime, and logout clears private memory now. */
export function observeCustomerRefresh(store:Pick<CustomerRefreshStore,"refresh"|"revoke"|"markStale">,environment:{
 window:EventTarget;document:EventTarget;visible:()=>boolean;online:()=>boolean;repeat:(callback:()=>void,ms:number)=>()=>void;
}){
 const check=()=>{if(environment.visible()&&environment.online())void store.refresh();};
 const offline=()=>store.markStale(),cleared=()=>store.revoke();
 environment.window.addEventListener("focus",check);environment.window.addEventListener("online",check);
 environment.window.addEventListener("offline",offline);environment.window.addEventListener("notifications-account-cleared",cleared);
 environment.document.addEventListener("visibilitychange",check);
 const cancel=environment.repeat(check,20000);check();
 return()=>{cancel();environment.window.removeEventListener("focus",check);environment.window.removeEventListener("online",check);
  environment.window.removeEventListener("offline",offline);environment.window.removeEventListener("notifications-account-cleared",cleared);
  environment.document.removeEventListener("visibilitychange",check);};
}

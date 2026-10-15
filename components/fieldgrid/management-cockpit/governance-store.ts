"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {governanceQuerySchema,type GovernanceState} from '@/lib/management-cockpit/governance';
import {managementRequest} from './request';
export function useGovernance(initial:GovernanceState,onDenied?:()=>void){
 const params=useSearchParams(),parsed=governanceQuerySchema.safeParse({filter:initial.module==='compliance'?'attention':'all',...Object.fromEntries(params),module:initial.module}),query=parsed.success?parsed.data:governanceQuerySchema.parse({module:initial.module});
 const key=new URLSearchParams(Object.entries(query).map(([k,v])=>[k,String(v)])).toString();
 const[state,setState]=useState<GovernanceState|null>(initial),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),latest=useRef<GovernanceState|null>(initial),loaded=useRef(key),controller=useRef<AbortController|null>(null),lock=useRef(false),attempt=useRef<{signature:string;key:string}|null>(null);
 const refresh=useCallback(async()=>{controller.current?.abort();const c=new AbortController();controller.current=c;try{const result=await managementRequest<GovernanceState>('/api/management-governance?'+key,undefined,c.signal);if(!c.signal.aborted){latest.current=result;setState(result);loaded.current=key}return result}catch(e){if(e&&typeof e==='object'&&'status'in e&&e.status===403){latest.current=null;setState(null);onDenied?.()};throw e}},[key,onDenied]);
 useEffect(()=>{let active=true;const load=()=>{void refresh().catch(e=>{if(active&&e.name!=='AbortError')setError(e.message)})};if(loaded.current!==key)load();const focus=()=>{if(document.visibilityState==='visible')load()};const timer=setInterval(focus,30000);window.addEventListener('focus',focus);return()=>{active=false;controller.current?.abort();clearInterval(timer);window.removeEventListener('focus',focus)}},[refresh,key]);
 const update=useCallback((values:Record<string,string|number|null>)=>{const next=new URLSearchParams(params.toString());for(const[k,v]of Object.entries(values)){if(v===null)next.delete(k);else next.set(k,String(v))}next.delete('module');window.history.replaceState(null,'',(initial.module==='decisions'?'/app/besluiten':'/app/compliance')+(next.size?'?'+next:''))},[params,initial.module]);
 const mutate=async(command:string,input:Record<string,unknown>,message:string,followup=false)=>{
  if(lock.current)return false;lock.current=true;setBusy(true);setError('');setNotice('');const signature=JSON.stringify({module:initial.module,command,input,followup});if(attempt.current?.signature!==signature)attempt.current={signature,key:crypto.randomUUID()};
  try{await managementRequest(followup?'/api/management-cockpit':'/api/management-governance',{...(followup?{}:{module:initial.module}),command,input,requestId:attempt.current.key});attempt.current=null;setNotice(message);try{await refresh()}catch{setError('De wijziging is opgeslagen. Het overzicht kon nog niet worden vernieuwd; laad de actuele versie.')}return true}catch(e){if(e&&typeof e==='object'&&'status'in e&&e.status===403){latest.current=null;setState(null);onDenied?.()};setError(e instanceof Error?e.message:'Opslaan is nog niet bevestigd. Je invoer blijft behouden.');return false}finally{lock.current=false;setBusy(false)}
 };
 return{state,query,error,notice,busy,refresh,update,mutate,peek:()=>latest.current,clear:()=>{setError('');setNotice('')}};
}
export type GovernanceStore=ReturnType<typeof useGovernance>;

"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {toast} from 'sonner';
import {useSearchParams} from 'next/navigation';
import {slaQuerySchema,type SlaState} from '@/lib/management-cockpit/service-levels';
import {managementRequest} from './request';
export function useServiceLevels(initial:SlaState,onDenied:()=>void){
 const params=useSearchParams(),parsed=slaQuerySchema.safeParse(Object.fromEntries(params)),query=parsed.success?parsed.data:slaQuerySchema.parse({}),key=new URLSearchParams(Object.entries(query).map(([k,v])=>[k,String(v)])).toString();
 const[data,setData]=useState<SlaState|null>(initial),[error,setError]=useState(''),[busy,setBusy]=useState(false),loaded=useRef(key),controller=useRef<AbortController|null>(null),lock=useRef(false),attempt=useRef<{signature:string;id:string}|null>(null);
 const refresh=useCallback(async()=>{controller.current?.abort();const c=new AbortController();controller.current=c;try{const result=await managementRequest<SlaState>('/api/management-sla?'+key,undefined,c.signal);if(!c.signal.aborted){setData(result);loaded.current=key}return result}catch(e){if(e&&typeof e==='object'&&'status'in e&&e.status===403){setData(null);onDenied()}throw e}},[key,onDenied]);
 useEffect(()=>{let active=true;const load=()=>{void refresh().catch(e=>{if(active&&e.name!=='AbortError')setError(e.message)})};if(loaded.current!==key)load();const focus=()=>{if(document.visibilityState==='visible')load()};const timer=setInterval(focus,30000);window.addEventListener('focus',focus);return()=>{active=false;controller.current?.abort();clearInterval(timer);window.removeEventListener('focus',focus)}},[refresh,key]);
 const update=useCallback((values:Record<string,string|number|null>)=>{const next=new URLSearchParams(params.toString());for(const[k,v]of Object.entries(values)){if(v===null)next.delete(k);else next.set(k,String(v))}window.history.replaceState(null,'','/app/sla'+(next.size?'?'+next:''))},[params]);
 const mutate=async(command:string,input:Record<string,unknown>,message:string)=>{if(lock.current)return false;lock.current=true;setBusy(true);setError('');const signature=JSON.stringify({command,input});if(attempt.current?.signature!==signature)attempt.current={signature,id:crypto.randomUUID()};try{await managementRequest('/api/management-sla',{command,input,requestId:attempt.current.id});attempt.current=null;toast.success(message);try{await refresh()}catch{setError('De wijziging is opgeslagen. Het overzicht is nog niet vernieuwd; laad de actuele versie.')}return true}catch(e){if(e&&typeof e==='object'&&'status'in e&&e.status===403){setData(null);onDenied()}setError(e instanceof Error?e.message:'De wijziging is nog niet bevestigd. Je invoer blijft behouden.');return false}finally{lock.current=false;setBusy(false)}};
 return{data,query,error,busy,refresh,update,mutate,clear:()=>setError('')};
}
export type ServiceLevelsStore=ReturnType<typeof useServiceLevels>;

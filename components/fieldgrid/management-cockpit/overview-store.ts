"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {overviewQuerySchema,type OverviewState} from '@/lib/management-cockpit/overview';
import {managementRequest} from './request';
export function useOverview(initial:OverviewState,onDenied:()=>void){
 const params=useSearchParams(),parsed=overviewQuerySchema.safeParse(Object.fromEntries(params)),query=parsed.success?parsed.data:overviewQuerySchema.parse({}),key=new URLSearchParams(Object.entries(query).map(([k,v])=>[k,String(v)])).toString();
 const[data,setData]=useState<OverviewState|null>(initial),[snapshotKey,setSnapshotKey]=useState(key),[error,setError]=useState(''),loaded=useRef(key),controller=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{controller.current?.abort();const c=new AbortController();controller.current=c;try{const result=await managementRequest<OverviewState>('/api/management-overview?'+key,undefined,c.signal);if(!c.signal.aborted){setData(result);setSnapshotKey(key);loaded.current=key;setError('')}return result}catch(e){if(e&&typeof e==='object'&&'status'in e&&e.status===403){setData(null);onDenied()}throw e}},[key,onDenied]);
 useEffect(()=>{let active=true;const load=()=>{void refresh().catch(e=>{if(active&&e.name!=='AbortError')setError(e.message)})};if(loaded.current!==key)load();const focus=()=>{if(document.visibilityState==='visible')load()};const timer=setInterval(focus,30000);window.addEventListener('focus',focus);return()=>{active=false;controller.current?.abort();clearInterval(timer);window.removeEventListener('focus',focus)}},[key,refresh]);
 const update=useCallback((values:Record<string,string|number|null>)=>{const next=new URLSearchParams(params.toString());for(const[k,v]of Object.entries(values)){if(v===null)next.delete(k);else next.set(k,String(v))}window.history.replaceState(null,'','/app'+(next.size?'?'+next:''))},[params]);
 return{data,query,error,isCurrent:snapshotKey===key,refresh,update};
}

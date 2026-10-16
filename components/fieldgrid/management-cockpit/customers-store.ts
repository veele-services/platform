"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {customerFilters} from '@/lib/customers/model';
import type {CustomerCards} from '@/lib/management-cockpit/entities';
import {managementRequest} from './request';
export function useCustomerCards(initial:CustomerCards,onDenied:()=>void){
 const params=useSearchParams(),filters=customerFilters.parse(Object.fromEntries(params)),key=new URLSearchParams(Object.entries(filters).map(([k,v])=>[k,String(v)])).toString();
 const[data,setData]=useState<CustomerCards|null>(initial),[snapshotKey,setSnapshotKey]=useState(key),[error,setError]=useState(''),loaded=useRef(key),lastInitial=useRef(initial),controller=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{controller.current?.abort();const c=new AbortController();controller.current=c;try{const result=await managementRequest<CustomerCards>('/api/management-entities/customers?'+key,undefined,c.signal);if(!c.signal.aborted){setData(result);setSnapshotKey(key);loaded.current=key;setError('')}return result}catch(e){if(e&&typeof e==='object'&&'status'in e&&e.status===403){setData(null);onDenied()}throw e}},[key,onDenied]);
 useEffect(()=>{let active=true;const load=()=>{void refresh().catch(e=>{if(active&&e.name!=='AbortError')setError(e.message)})};if(loaded.current!==key||lastInitial.current!==initial)load();lastInitial.current=initial;const focus=()=>{if(document.visibilityState==='visible')load()};const timer=setInterval(focus,30000);window.addEventListener('focus',focus);return()=>{active=false;controller.current?.abort();clearInterval(timer);window.removeEventListener('focus',focus)}},[initial,key,refresh]);
 const update=useCallback((name:string,value:string)=>{const next=new URLSearchParams(params);next.set(name,value);if(name!=='page')next.set('page','1');window.history.replaceState(null,'','/app/klanten?'+next)},[params]);
 const reset=()=>window.history.replaceState(null,'','/app/klanten');
 return{data,filters,error,isCurrent:snapshotKey===key,refresh,update,reset};
}

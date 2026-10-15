"use client";
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {SlidersHorizontal} from 'lucide-react';
import {cosmeticDisclosurePreferences,type DisclosurePreferences} from '@/lib/auth/browser-state';
// Only open/focus/cursor mechanics. Query values remain in the authorized route.
const disclosureState=new Map<string,DisclosurePreferences>();
export function EntityFilter({active,children,preserveKey}:{active:boolean;children:ReactNode;preserveKey?:string}){
 const ref=useRef<HTMLDetailsElement>(null),[opened,setOpened]=useState(false);
 const storageKey=preserveKey?'fieldgrid:disclosure:'+preserveKey:null;
 const read=useCallback(()=>{
  if(!preserveKey)return;
  let state=disclosureState.get(preserveKey);
  if(!state&&storageKey){try{state=cosmeticDisclosurePreferences(JSON.parse(sessionStorage.getItem(storageKey)??'null'))??undefined}catch{}}
  if(!state)return;
  if(!disclosureState.has(preserveKey)&&disclosureState.size>=50)disclosureState.delete(disclosureState.keys().next().value!);
  disclosureState.set(preserveKey,state);return state;
 },[preserveKey,storageKey]);
 const remember=()=>{
  if(!preserveKey)return;
  let state=read();
  if(!state){if(disclosureState.size>=50)disclosureState.delete(disclosureState.keys().next().value!);state={open:false,focus:-1,selection:null};disclosureState.set(preserveKey,state)}
  return state;
 };
 const persist=(state:DisclosurePreferences)=>{
  if(!storageKey)return;
  try{
   if(!state.open){sessionStorage.removeItem(storageKey);return;}
   const keys=Array.from({length:sessionStorage.length},(_,i)=>sessionStorage.key(i)).filter((key):key is string=>Boolean(key?.startsWith('fieldgrid:disclosure:')));
   if(keys.length>=50&&!keys.includes(storageKey))sessionStorage.removeItem(keys[0]);
   sessionStorage.setItem(storageKey,JSON.stringify(cosmeticDisclosurePreferences(state)));
  }catch{/* Restricted storage still allows ordinary disclosure interaction. */}
 };
 useEffect(()=>{
  const state=read(),element=ref.current;if(!element||!state?.open)return;
  element.open=true;
  let frame=0;
  const restore=()=>{
   cancelAnimationFrame(frame);
   frame=requestAnimationFrame(()=>{
    if(!state.open||document.documentElement.dataset.accountBlocked==='true')return;
    const fields=element.querySelectorAll<HTMLElement>('input,select,textarea,button'),field=fields[state.focus];
    if(field&&(document.activeElement===document.body||element.contains(document.activeElement))){field.focus({preventScroll:true});if(state.selection&&field instanceof HTMLInputElement&&field.type==='text')field.setSelectionRange(...state.selection)}
   });
  };
  // The account fence can temporarily hide and blur controls during its live
  // identity check. Restore only after that unchanged security check clears it.
  const observer=new MutationObserver(restore);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-account-blocked']});restore();
  return()=>{cancelAnimationFrame(frame);observer.disconnect()};
 },[read,opened,children]);
 useEffect(()=>{
  const dismiss=()=>{const state=preserveKey?disclosureState.get(preserveKey):undefined;if(state){state.open=false;state.focus=-1;state.selection=null}if(storageKey)try{sessionStorage.removeItem(storageKey)}catch{}setOpened(false);if(ref.current)ref.current.open=false};
  const close=(event:PointerEvent)=>{if(ref.current&&!ref.current.contains(event.target as Node))dismiss()};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&ref.current?.open){dismiss();ref.current.querySelector('summary')?.focus()}};
  const reset=()=>{disclosureState.clear();dismiss()};
  document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);window.addEventListener('notifications-account-cleared',reset);
  return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);window.removeEventListener('notifications-account-cleared',reset)};
 },[preserveKey,storageKey]);
 return <details className="ed-filter" ref={ref} open={opened}
  onToggle={event=>{if(!event.currentTarget.isConnected)return;setOpened(event.currentTarget.open);const state=remember();if(state){state.open=event.currentTarget.open;if(!state.open){state.focus=-1;state.selection=null}persist(state)}}}
  onFocusCapture={event=>{const state=remember();if(state){state.focus=[...event.currentTarget.querySelectorAll('input,select,textarea,button')].indexOf(event.target);persist(state)}}}
  onSelectCapture={event=>{const state=remember();if(state&&event.target instanceof HTMLInputElement&&event.target.selectionStart!==null&&event.target.selectionEnd!==null){state.selection=[event.target.selectionStart,event.target.selectionEnd];persist(state)}}}>
  <summary className="fg-action-icon" aria-label="Filters"><SlidersHorizontal size={17}/>{active&&<i/>}</summary><div className="ed-filter-pop" style={{maxHeight:'calc(100dvh - 165px)',overflowY:'auto'}}>{children}</div>
 </details>;
}

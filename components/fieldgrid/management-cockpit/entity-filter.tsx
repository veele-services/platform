"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {SlidersHorizontal} from 'lucide-react';
type DisclosureState={open:boolean;focus:number;selection:[number,number]|null};
// Transient UI state only: no query, business data or authorization is stored.
// Next's refreshed page segment can remount when URL filters change.
const disclosureState=new Map<string,DisclosureState>();
/** The source disclosure/overlay DOM, with Escape and outside-click dismissal. */
export function EntityFilter({active,children,preserveKey}:{active:boolean;children:ReactNode;preserveKey?:string}){
 const ref=useRef<HTMLDetailsElement>(null);
 const[opened,setOpened]=useState(false);
 const remember=()=>{if(!preserveKey)return;let state=disclosureState.get(preserveKey);if(!state){if(disclosureState.size>=50)disclosureState.delete(disclosureState.keys().next().value!);state={open:false,focus:-1,selection:null};disclosureState.set(preserveKey,state)}return state};
 useEffect(()=>{
  const state=preserveKey?disclosureState.get(preserveKey):undefined,element=ref.current;if(!element||!state?.open)return;
  element.open=true;
  const frame=requestAnimationFrame(()=>{const fields=element.querySelectorAll<HTMLElement>('input,select,textarea,button'),field=fields[state.focus];if(field&&(document.activeElement===document.body||element.contains(document.activeElement))){field.focus({preventScroll:true});if(state.selection&&field instanceof HTMLInputElement&&field.type==='text')field.setSelectionRange(...state.selection)}});
  return()=>cancelAnimationFrame(frame);
 });
 useEffect(()=>{const dismiss=()=>{const state=preserveKey?disclosureState.get(preserveKey):undefined;if(state){state.open=false;state.focus=-1;state.selection=null}setOpened(false);if(ref.current)ref.current.open=false};const close=(e:PointerEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))dismiss()};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&ref.current?.open){dismiss();ref.current.querySelector('summary')?.focus()}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape)}},[preserveKey]);
 return <details className="ed-filter" ref={ref} open={opened} onToggle={event=>{setOpened(event.currentTarget.open);const state=remember();if(state){state.open=event.currentTarget.open;if(!state.open){state.focus=-1;state.selection=null}}}} onFocusCapture={event=>{const state=remember();if(state)state.focus=[...event.currentTarget.querySelectorAll('input,select,textarea,button')].indexOf(event.target)}} onSelectCapture={event=>{const state=remember();if(state&&event.target instanceof HTMLInputElement&&event.target.selectionStart!==null&&event.target.selectionEnd!==null)state.selection=[event.target.selectionStart,event.target.selectionEnd]}}><summary className="fg-action-icon" aria-label="Filters"><SlidersHorizontal size={17}/>{active&&<i/>}</summary><div className="ed-filter-pop" style={{maxHeight:'calc(100dvh - 165px)',overflowY:'auto'}}>{children}</div></details>;
}

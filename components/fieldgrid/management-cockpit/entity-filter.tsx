"use client";
import {useEffect,useRef,type ReactNode} from 'react';
import {SlidersHorizontal} from 'lucide-react';
/** The source disclosure/overlay DOM, with Escape and outside-click dismissal. */
export function EntityFilter({active,children}:{active:boolean;children:ReactNode}){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))ref.current.open=false};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&ref.current?.open){ref.current.open=false;ref.current.querySelector('summary')?.focus()}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape)}},[]);
 return <details className="ed-filter" ref={ref}><summary className="fg-action-icon" aria-label="Filters"><SlidersHorizontal size={17}/>{active&&<i/>}</summary><div className="ed-filter-pop" style={{maxHeight:'calc(100dvh - 165px)',overflowY:'auto'}}>{children}</div></details>;
}

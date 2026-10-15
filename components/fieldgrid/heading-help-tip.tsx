"use client";
import {useId,useState,type ReactNode} from 'react';
import {CircleHelp} from 'lucide-react';
/** Sites heading help; associated tooltip and Escape keep touch/keyboard access. */
export function HeadingHelpTip({label,children}:{label:string;children:ReactNode}){
 const[open,setOpen]=useState(false),[offset,setOffset]=useState(0),id=useId();
 return <span className="help-tip-wrap"><button type="button" className="help-tip" aria-label={label} aria-expanded={open} aria-describedby={open?id:undefined} onClick={e=>{const left=e.currentTarget.getBoundingClientRect().left;setOffset(Math.min(0,window.innerWidth-16-left-Math.min(270,window.innerWidth*.7)));setOpen(!open)}} onBlur={()=>setOpen(false)} onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false)}}}><CircleHelp size={16}/></button>{open&&<span id={id} role="tooltip" className="help-bubble" style={offset?{marginLeft:offset}:undefined}>{children}</span>}</span>;
}

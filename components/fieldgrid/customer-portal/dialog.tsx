"use client";
import { GuideBanner, GuideForTitle } from "@/components/fieldgrid/guides/guide";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { ActionIcon } from "../action-icon";

/** Native top-layer dialog keeps the rest of the page inert, including keyboard
 * focus. Its dimensions/scrolling mirror the supplied fixed-frame prototype. */
export function CustomerDialog({ title, kicker, description, children, footer, close, dirty=false, busy=false, guideKey }: {
 guideKey?:string;title:string;kicker:string;description?:string;children:ReactNode;footer?:ReactNode;close:()=>void;dirty?:boolean;busy?:boolean;
}) {
 const dialog=useRef<HTMLDialogElement>(null),titleId=useId(),descriptionId=useId();
 const dismiss=()=>{if(!busy&&(!dirty||window.confirm("Je wijzigingen zijn nog niet opgeslagen. Wil je het venster toch sluiten?")))close();};
 useEffect(()=>{
  const element=dialog.current;if(!element)return;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const overflow=document.body.style.overflow;document.body.style.overflow="hidden";
  element.showModal();
  return()=>{element.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[]);
 useEffect(()=>{
  if(!dirty)return;
  const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener("beforeunload",warn);
  return()=>window.removeEventListener("beforeunload",warn);
 },[dirty]);
 return <dialog ref={dialog} data-customer-dialog aria-labelledby={titleId} aria-describedby={description?descriptionId:undefined}
  onCancel={event=>{event.preventDefault();dismiss();}}
  onClick={event=>{if(event.target!==event.currentTarget)return;const bounds=event.currentTarget.getBoundingClientRect();
   if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dismiss();}}>
  <div className="modal-shell"><header className="modal-head"><div><span className="eyebrow">{kicker}</span><h2 id={titleId}>{title}</h2>
   {description&&<p id={descriptionId}>{description}</p>}</div><ActionIcon className="icon-btn" label="Sluiten" icon={<X/>} disabled={busy} onClick={dismiss}/></header>
   <div className="modal-body">{guideKey?<GuideBanner guideKey={guideKey}/>:<GuideForTitle title={title}/>}{children}</div>{footer&&<footer className="modal-footer">{footer}</footer>}
  </div>
 </dialog>;
}

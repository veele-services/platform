"use client";
import type {CSSProperties,ReactNode} from 'react';
import {Dialog} from 'radix-ui';
import {X} from 'lucide-react';
import {SourceNativeDialog} from '../source-native-dialog';

export function PlanningConfirmationFrame({sites,title,description,theme,busy=false,onClose,children}:{sites:boolean;title:string;description:string;theme:CSSProperties;busy?:boolean;onClose:()=>void;children:ReactNode}){
 const close=()=>{if(!busy)onClose()};
 if(sites)return <SourceNativeDialog title={title} description={description} eyebrow="PLANNING" busy={busy} onClose={close}>{children}</SourceNativeDialog>;
 return <Dialog.Root open onOpenChange={open=>{if(!open)close()}}><Dialog.Portal><Dialog.Overlay className="pb-confirm-overlay"/><Dialog.Content className="pb-confirm" style={theme} onEscapeKeyDown={event=>{if(busy)event.preventDefault()}}><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description>{children}<Dialog.Close className="pb-close" disabled={busy} aria-label="Bevestiging sluiten"><X size={18}/></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

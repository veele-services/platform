"use client";
import {useEffect,type ReactNode} from 'react';
import {Modal} from './crm/ui';
import './source-native-dialog.css';
/** Native business forms share the supplied source frame without changing
 * their commands, fields, pending state or discard protection. */
export function SourceNativeDialog({title,description,eyebrow,onClose,children,footer,dirty=false,busy=false,wide=false,sourceForm=false}:{title:string;description:string;eyebrow:string;onClose:()=>void;children:ReactNode;footer?:ReactNode;dirty?:boolean;busy?:boolean;wide?:boolean;sourceForm?:boolean}){
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 const close=()=>{if(!busy&&(!dirty||confirm('Je wijzigingen zijn nog niet opgeslagen. Wil je ze weggooien?')))onClose()};
 return <Modal title={title} subtitle={eyebrow} onClose={close} wide={wide} closeDisabled={busy} footer={footer}><div className={sourceForm?'sites-source-editor':'sites-native-editor'}>{description&&<p className="mc-muted">{description}</p>}{children}</div></Modal>;
}

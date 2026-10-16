"use client";
import {Children,Fragment,isValidElement,useEffect,type ReactNode} from 'react';
import {Modal} from './crm/ui';
import './source-native-dialog.css';
/** Native business forms share the supplied source frame without changing
 * their commands, fields, pending state or discard protection. */
export function SourceNativeDialog({title,description,eyebrow,onClose,children,footer,dirty=false,busy=false,wide=false,sourceForm=false}:{title:string;description:string;eyebrow:string;onClose:()=>void;children:ReactNode;footer?:ReactNode;dirty?:boolean;busy?:boolean;wide?:boolean;sourceForm?:boolean}){
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 const close=()=>{if(!busy&&(!dirty||confirm('Je wijzigingen zijn nog niet opgeslagen. Wil je ze weggooien?')))onClose()};
 // Native forms already expose their actions as a direct footer. Put those
 // actions in the source frame's fixed footer, retaining their real form IDs
 // and handlers. Never extract a footer from inside a form or another component.
 const content:ReactNode[]=[];let nativeFooter:ReactNode;
 const collect=(node:ReactNode)=>{
  if(isValidElement<{children?:ReactNode}>(node)&&node.type===Fragment)Children.forEach(node.props.children,collect);
  else if(footer===undefined&&isValidElement<{children?:ReactNode}>(node)&&node.type==='footer'&&nativeFooter===undefined)nativeFooter=node.props.children;
  else content.push(node);
 };
 Children.forEach(children,collect);
 return <Modal title={title} subtitle={eyebrow} onClose={close} wide={wide} closeDisabled={busy} footer={footer??nativeFooter}><div className={sourceForm?'sites-source-editor':'sites-native-editor'}>{description&&<p className="mc-muted">{description}</p>}{Children.toArray(content)}</div></Modal>;
}

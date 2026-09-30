"use client";
import type {ReactNode} from "react";
import {X} from "lucide-react";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import type {TenantContext} from "@/lib/auth/context";
import {brandThemeStyle} from "@/lib/branding/palette";

export function CommercialDialog({title,description,tenant,onClose,children,dirty=false,busy=false}:{title:string;description:string;tenant:TenantContext;onClose:()=>void;children:ReactNode;dirty?:boolean;busy?:boolean}){
 const close=()=>{if(!busy&&(!dirty||confirm("Je wijzigingen zijn nog niet opgeslagen. Wil je ze weggooien?")))onClose();};
 return <Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent className="commercial-dialog" showCloseButton={false} style={brandThemeStyle(tenant.primaryColor,tenant.accentColor)}><header><div><span className="eyebrow">COMMERCIEEL DOSSIER</span><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div><button type="button" className="icon-button" aria-label="Sluiten" onClick={close}><X size={20}/></button></header>{children}</DialogContent></Dialog>;
}

"use client";
import {useState,type ReactNode} from 'react';
import {MoreHorizontal} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
/** Native dialogs occupy the browser top layer. Portal overlays into their
 * owning dialog, so they remain visible, themed and keyboard-accessible. */
export function EntityActionsMenu({name,children}:{name:string;children:ReactNode}){
 const[container,setContainer]=useState<HTMLElement|null>(null);
 return <Popover><PopoverTrigger asChild><button type="button" className="fg-action-icon" aria-label={`Meer acties voor ${name}`} onClick={e=>setContainer(e.currentTarget.closest('dialog'))}><MoreHorizontal size={15}/></button></PopoverTrigger><PopoverContent portalContainer={container} className="resource-more-content" align="end">{children}</PopoverContent></Popover>;
}

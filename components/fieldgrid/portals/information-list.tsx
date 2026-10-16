"use client";
import {BookOpen,ChevronRight} from 'lucide-react';
import {EmptyState} from '../empty-state';
/** The supplied portal's HelpView, backed by actual authorized article/release IDs. */
export function PortalInformationList({items,onOpen,staff,emptyTitle}:{items:Array<{id:string;title:string;detail:string}>;onOpen:(id:string)=>void;staff:boolean;emptyTitle:string}){
 return <div className="portal-demo-stack">{items.map(item=><button type="button" className={staff?'ps-panel portal-demo-help':'card card-pad portal-demo-help'} key={item.id} onClick={()=>onOpen(item.id)}><BookOpen/><span><strong>{item.title}</strong><small>{item.detail}</small></span><ChevronRight/></button>)}{!items.length&&<EmptyState title={emptyTitle} description="Gepubliceerde informatie voor jouw portaal verschijnt hier. Pas eventueel de filters aan."/>}</div>;
}

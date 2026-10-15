"use client";
import {createContext,useContext,type ReactNode} from 'react';
const PresentationContext=createContext<'existing'|'sites'>('existing');
/** Presentation only. Authorization remains in the native page/API/DB guards. */
export function DashboardPresentation({value,children}:{value:'existing'|'sites';children:ReactNode}){return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>}
export function useDashboardPresentation(){return useContext(PresentationContext)}
/** Radix portals leave the workspace DOM. Keep their source selector/font
 * scope without introducing a layout box or changing the native overlay. */
export function PresentationPortal({children}:{children:ReactNode}){return useDashboardPresentation()==='sites'?<div className="sites-cockpit sites-portal">{children}</div>:children}

"use client";
import {createContext,useContext,type ReactNode} from 'react';
const PresentationContext=createContext<'existing'|'sites'>('existing');
/** Presentation only. Authorization remains in the native page/API/DB guards. */
export function DashboardPresentation({value,children}:{value:'existing'|'sites';children:ReactNode}){return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>}
export function useDashboardPresentation(){return useContext(PresentationContext)}

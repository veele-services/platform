"use client";
import { createContext,useContext,type CSSProperties,type ReactNode } from "react";
import { brandThemeStyle } from "@/lib/branding/palette";

const TenantThemeContext=createContext<CSSProperties|null>(null);
/** React context crosses DOM portals; branded dialogs render with the correct
 * tenant palette immediately, without reading a different page's DOM/CSS. */
export function TenantThemeProvider({primary,accent,children}:{primary?:string|null;accent?:string|null;children:ReactNode}){
 return <TenantThemeContext.Provider value={brandThemeStyle(primary,accent)}>{children}</TenantThemeContext.Provider>;
}
export function useTenantTheme(){return useContext(TenantThemeContext)??brandThemeStyle();}
export function useOptionalTenantTheme(){return useContext(TenantThemeContext);}

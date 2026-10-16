"use client";
import type {ReactNode} from 'react';
import {DashboardPresentation} from '../presentation';
import {SourcePortalContext} from './context';
/** Presentation scope only: all sessions, bindings and commands remain native. */
export function SourcePortalFrame({children}:{children:ReactNode}){
 return <SourcePortalContext.Provider value><DashboardPresentation value="sites"><div className="sites-portals">{children}</div></DashboardPresentation></SourcePortalContext.Provider>;
}

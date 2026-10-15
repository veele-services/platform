"use client";

import { useEffect, type ReactNode } from "react";
import { GuideForTitle } from "../guides/guide";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { TenantContext } from "@/lib/auth/context";
import { brandThemeStyle } from "@/lib/branding/palette";
import {useDashboardPresentation} from '../presentation';
import {SourceNativeDialog} from '../source-native-dialog';
import "./work-orders.css";

export function WorkOrderDialog({ title, description, tenant, eyebrow = "WERKBON", onClose, children, dirty = false, busy = false, size = "workspace" }: {
  title: string;
  eyebrow?: string;
  description: string;
  tenant: Pick<TenantContext, "primaryColor" | "accentColor">;
  onClose: () => void;
  children: ReactNode;
  dirty?: boolean;
  busy?: boolean;
  size?: "workspace" | "compact";
}) {
  const sites=useDashboardPresentation()==='sites';
  useEffect(() => {
    if (!dirty||sites) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty,sites]);
  const close = () => {
    if (!busy && (!dirty || window.confirm("Je wijzigingen zijn nog niet opgeslagen. Wil je ze weggooien?"))) onClose();
  };
  if(sites)return <SourceNativeDialog title={title} eyebrow={eyebrow} description={description} onClose={onClose} dirty={dirty} busy={busy} wide={size==='workspace'}>{children}</SourceNativeDialog>;
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent className="commercial-dialog wo-dialog" data-dialog-size={size} showCloseButton={false} style={brandThemeStyle(tenant.primaryColor, tenant.accentColor)}>
      <header>
        <div><span className="eyebrow">{eyebrow}</span><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div>
        <button type="button" className="icon-button" aria-label="Sluiten" disabled={busy} onClick={close}><X size={20}/></button>
      </header>
      <GuideForTitle title={title} className="fg-guide-modal"/>
      {children}
    </DialogContent>
  </Dialog>;
}

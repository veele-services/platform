"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { brandThemeStyle } from "@/lib/branding/palette";
import { useStaffDialogFocus } from "@/lib/staff/use-dialog-focus";
import { personnelThemeStyle } from "@/lib/staff/theme";
import type { TicketWorkspace } from "@/lib/tickets/model";
import "./tickets.css";

export function TicketDialog({ title, description, children, footer, onClose, dirty = false, busy = false, primaryColor, accentColor, workspace }: {
  title: string; description: string; children: ReactNode; footer?: ReactNode; onClose: () => void;
  dirty?: boolean; busy?: boolean; primaryColor?: string; accentColor?: string;
  workspace?: TicketWorkspace;
}) {
  const focus = useStaffDialogFocus(workspace === "staff");
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const close = () => { if (!busy && (!dirty || window.confirm("Je bericht is nog niet verstuurd. Wil je het venster toch sluiten?"))) onClose(); };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className={`ticket-dialog${workspace === "staff" ? " ps-staff-dialog" : ""}`} aria-modal={workspace === "staff" ? true : undefined} showCloseButton={false} {...focus} style={workspace === "staff" ? personnelThemeStyle() : brandThemeStyle(primaryColor, accentColor)}>
    <header><div><span className="ticket-eyebrow">Hulp & meldingen</span><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div><button type="button" className="icon-button" aria-label="Sluiten" disabled={busy} onClick={close}><X size={19}/></button></header>
    <div className="ticket-dialog-body">{children}</div>{footer && <footer className="ticket-dialog-footer">{footer}</footer>}
  </DialogContent></Dialog>;
}

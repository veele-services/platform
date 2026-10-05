"use client";

import Link from "next/link";
import { Ticket } from "lucide-react";
import type { ReactNode } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { personnelThemeStyle } from "@/lib/staff/theme";

export function StaffTicketsEntry({ enabled, active = false, className, children }: {
  enabled: boolean;
  active?: boolean;
  className: string;
  children?: ReactNode;
}) {
  const content = children ?? <><Ticket/><span>Tickets</span></>;
  if (enabled) return <Link className={className} href="/staff/meldingen" aria-current={active ? "page" : undefined}>{content}</Link>;
  return <Dialog>
    <DialogTrigger asChild><button type="button" className={className}>{content}</button></DialogTrigger>
    <DialogContent className="personnel-app ps-ticket-help" style={personnelThemeStyle()} showCloseButton={false}>
      <DialogHeader><DialogTitle>Tickets nog niet actief</DialogTitle><DialogDescription>Je organisatie heeft Tickets &amp; support nog niet ingeschakeld. Vraag de platformbeheerder om dit bij de modules van je organisatie te activeren.</DialogDescription></DialogHeader>
      <DialogClose asChild><button type="button" className="ps-primary">Sluiten</button></DialogClose>
    </DialogContent>
  </Dialog>;
}

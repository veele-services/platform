"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Headset, LayoutDashboard, LogOut, Menu, Settings2, X } from "lucide-react";
import { FieldgridBrand, ProductBrand } from "@/components/fieldgrid/brand";
import { NotificationBell } from "@/components/fieldgrid/notifications/inbox";
import { NotificationNavigation } from "@/components/fieldgrid/notifications/navigation";
import { brandThemeStyle } from "@/lib/branding/palette";
import { ticketPaths, ticketWorkspaceLabels, type TicketAccess } from "@/lib/tickets/model";
import "./tickets.css";

export function TicketStandaloneShell({ access, logoUrl, children, canPlatformAdmin = false }: { access: TicketAccess; logoUrl?: string | null; children: ReactNode; canPlatformAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  if (access.workspace === "staff") return <div className="ticket-staff-shell" style={brandThemeStyle(access.tenant?.primaryColor, access.tenant?.accentColor)}><header><FieldgridBrand tenantName={access.tenant?.name} logoUrl={logoUrl}/><div className="nt-actions"><Link className="text-link" href="/staff"><ArrowLeft size={14}/>Mijn werk</Link><NotificationBell workspace="staff" actorKey={`${access.tenant?.id}:${access.userId}`}/></div></header><main>{children}</main></div>;
  return <div className="ticket-shell" style={brandThemeStyle()}><aside className="ticket-shell-sidebar" data-open={open}><div className="ticket-shell-brand"><ProductBrand tone="light"/><small>Platform-support</small></div><button className="ticket-shell-menu icon-button" onClick={() => setOpen(false)} aria-label="Sluit menu"><X size={18}/></button><nav><NotificationNavigation workspace="platform" actorKey={access.userId}/>{canPlatformAdmin && <Link href="/platform"><LayoutDashboard size={17}/>Platformoverzicht</Link>}<Link href={ticketPaths.platform} aria-current="page"><Headset size={17}/>Supportdesk</Link>{access.canConfigure && <Link href={`${ticketPaths.platform}/instellingen`}><Settings2 size={17}/>Supportinstellingen</Link>}</nav><footer>Uitsluitend expliciet gedeelde supportvragen.<br/>Geen toegang tot interne tenantdossiers.</footer></aside><div className="ticket-shell-main"><header className="ticket-shell-topbar"><div className="ticket-actions"><button className="ticket-shell-menu icon-button" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={19}/></button><span>Fieldgrid / {ticketWorkspaceLabels[access.workspace]}</span></div><div className="nt-actions"><NotificationBell workspace="platform" actorKey={access.userId}/><form method="post" action="/auth/signout"><button className="icon-button" aria-label="Uitloggen"><LogOut size={17}/></button></form></div></header><main className="ticket-shell-content">{children}</main></div></div>;
}

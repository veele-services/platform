"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bell, LogOut, Settings, UserRound } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTenantTheme } from "./tenant-theme";
import "./shell-chrome.css";

export const accountInitials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "FG";

export function AccountMenu({ name, email, role, profileHref, settingsHref, preferencesHref, onProfile, onSettings, onPreferences, triggerLabel, profileLabel = "Mijn profiel", preferencesLabel = "Notificatievoorkeuren", additionalActions = [] }: {
  name: string; email: string | null; role: string; profileHref?: string; settingsHref?: string; preferencesHref?: string;
  onProfile?: () => void; onSettings?: () => void; onPreferences?: () => void; triggerLabel?: string; profileLabel?: string; preferencesLabel?: string;
  additionalActions?: Array<{ label: string; icon: ReactNode; onSelect: () => void }>;
}) {
  const signout = useRef<HTMLFormElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const theme = useTenantTheme();
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" className="shell-account-button" aria-label={triggerLabel ?? `Accountmenu van ${name}`} title={name}><span aria-hidden="true">{accountInitials(name)}</span></button></DropdownMenuTrigger>
      <DropdownMenuContent className="shell-account-menu" align="end" sideOffset={10} collisionPadding={12}>
        <DropdownMenuLabel><strong>{name}</strong><small>{role}</small></DropdownMenuLabel>
        <DropdownMenuSeparator/>
        {onProfile ? <DropdownMenuItem onSelect={onProfile}><UserRound/>{profileLabel}</DropdownMenuItem> : profileHref ? <DropdownMenuItem asChild><Link href={profileHref}><UserRound/>{profileLabel}</Link></DropdownMenuItem> : <DropdownMenuItem onSelect={() => setProfileOpen(true)}><UserRound/>{profileLabel}</DropdownMenuItem>}
        {onSettings ? <DropdownMenuItem onSelect={onSettings}><Settings/>Instellingen</DropdownMenuItem> : settingsHref && <DropdownMenuItem asChild><Link href={settingsHref}><Settings/>Instellingen</Link></DropdownMenuItem>}
        {onPreferences ? <DropdownMenuItem onSelect={onPreferences}><Bell/>{preferencesLabel}</DropdownMenuItem> : preferencesHref && <DropdownMenuItem asChild><Link href={preferencesHref}><Bell/>{preferencesLabel}</Link></DropdownMenuItem>}
        {additionalActions.map(action => <DropdownMenuItem key={action.label} onSelect={action.onSelect}>{action.icon}{action.label}</DropdownMenuItem>)}
        <DropdownMenuSeparator/>
        <DropdownMenuItem onSelect={() => signout.current?.requestSubmit()}><LogOut/>Uitloggen</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <form ref={signout} action="/auth/signout" method="post" hidden/>
    <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent style={theme} className="shell-profile-dialog"><DialogTitle>Mijn profiel</DialogTitle><DialogDescription>Je account in deze omgeving.</DialogDescription><dl><div><dt>Naam</dt><dd>{name}</dd></div><div><dt>E-mailadres</dt><dd>{email || "Niet vastgelegd"}</dd></div><div><dt>Functie</dt><dd>{role}</dd></div></dl></DialogContent></Dialog>
  </>;
}

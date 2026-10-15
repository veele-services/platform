"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { Bell, LogOut, Settings, UserRound } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTenantTheme } from "./tenant-theme";
import { useDashboardPresentation } from './presentation';
import { SourceNativeDialog } from './source-native-dialog';
import { confirmDiscard } from './unsaved-form';

export const accountInitials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "FG";

export function AccountMenu({ name, email, role, organisation, profileHref, settingsHref, preferencesHref, onProfile, onSettings, onPreferences, triggerLabel, profileLabel = "Mijn profiel", preferencesLabel = "Notificatievoorkeuren", additionalActions = [] }: {
  name: string; email: string | null; role: string; organisation?:string;profileHref?: string; settingsHref?: string; preferencesHref?: string;
  onProfile?: () => void; onSettings?: () => void; onPreferences?: () => void; triggerLabel?: string; profileLabel?: string; preferencesLabel?: string;
  additionalActions?: Array<{ label: string; icon: ReactNode; onSelect: () => void }>;
}) {
  const signout = useRef<HTMLFormElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const theme = useTenantTheme();
  const sites=useDashboardPresentation()==='sites';
  const router=useRouter();
  const navigate=(href:string)=>{if(confirmDiscard())router.push(href)};
  const sourceEntries=[
    {label:profileLabel,icon:<UserRound/>,action:onProfile||(()=>profileHref?navigate(profileHref):setProfileOpen(true))},
    ...(onSettings||settingsHref?[{label:'Instellingen',icon:<Settings/>,action:()=>{if(onSettings){if(confirmDiscard())onSettings()}else if(settingsHref)navigate(settingsHref)}}]:[]),
    ...(onPreferences||preferencesHref?[{label:preferencesLabel,icon:<Bell/>,action:()=>{if(onPreferences){if(confirmDiscard())onPreferences()}else if(preferencesHref)navigate(preferencesHref)}}]:[]),
    ...additionalActions.map(a=>({label:a.label,icon:a.icon,action:a.onSelect})),
  ];
  const profile=<dl className={sites?'mc-facts':undefined}><div><dt>Naam</dt><dd>{name}</dd></div><div><dt>E-mailadres</dt><dd>{email || "Niet vastgelegd"}</dd></div><div><dt>Functie</dt><dd>{role}</dd></div></dl>;
  const trigger=<DropdownMenuTrigger asChild><button type="button" className="shell-account-button" aria-label={triggerLabel ?? `Accountmenu van ${name}`} title={name}><span aria-hidden="true">{accountInitials(name)}</span></button></DropdownMenuTrigger>;
  return <>
    <DropdownMenu>
      {sites?<div className="mc-account-wrap">{trigger}</div>:trigger}
      <DropdownMenuContent className={sites?'mc-account-menu native-source-menu':'shell-account-menu'} align="end" sideOffset={10} collisionPadding={12}>
        <DropdownMenuLabel><strong>{name}</strong><small>{role}{sites&&organisation&&` · ${organisation}`}</small></DropdownMenuLabel>
        {sites?<>{sourceEntries.map(entry=><DropdownMenuItem key={entry.label} asChild onSelect={()=>entry.action()}><button type="button">{entry.icon}{entry.label}</button></DropdownMenuItem>)}<DropdownMenuItem asChild onSelect={()=>{if(confirmDiscard())signout.current?.requestSubmit()}}><button type="button"><LogOut/>Uitloggen</button></DropdownMenuItem></>:<>
        <DropdownMenuSeparator/>
        {onProfile ? <DropdownMenuItem onSelect={onProfile}><UserRound/>{profileLabel}</DropdownMenuItem> : profileHref ? <DropdownMenuItem asChild><Link href={profileHref}><UserRound/>{profileLabel}</Link></DropdownMenuItem> : <DropdownMenuItem onSelect={() => setProfileOpen(true)}><UserRound/>{profileLabel}</DropdownMenuItem>}
        {onSettings ? <DropdownMenuItem onSelect={onSettings}><Settings/>Instellingen</DropdownMenuItem> : settingsHref && <DropdownMenuItem asChild><Link href={settingsHref}><Settings/>Instellingen</Link></DropdownMenuItem>}
        {onPreferences ? <DropdownMenuItem onSelect={onPreferences}><Bell/>{preferencesLabel}</DropdownMenuItem> : preferencesHref && <DropdownMenuItem asChild><Link href={preferencesHref}><Bell/>{preferencesLabel}</Link></DropdownMenuItem>}
        {additionalActions.map(action => <DropdownMenuItem key={action.label} onSelect={action.onSelect}>{action.icon}{action.label}</DropdownMenuItem>)}
        <DropdownMenuSeparator/>
        <DropdownMenuItem onSelect={() => signout.current?.requestSubmit()}><LogOut/>Uitloggen</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
    <form ref={signout} action="/auth/signout" method="post" hidden/>
    {sites?profileOpen&&<SourceNativeDialog title="Mijn profiel" eyebrow="ACCOUNT" description="Je account in deze omgeving." onClose={()=>setProfileOpen(false)}>{profile}</SourceNativeDialog>:<Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent style={theme} className="shell-profile-dialog"><DialogTitle>Mijn profiel</DialogTitle><DialogDescription>Je account in deze omgeving.</DialogDescription>{profile}</DialogContent></Dialog>}
  </>;
}

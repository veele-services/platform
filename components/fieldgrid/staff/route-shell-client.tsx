"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { FieldgridBrand } from "../brand";
import { useRouter } from "next/navigation";
import {
  CalendarCheck, CalendarDays, ChevronRight, Clock3, FileText, LogOut,
  MoreHorizontal, Newspaper, Settings, Settings2, Umbrella, UserRound,
} from "lucide-react";
import { NotificationBell } from "@/components/fieldgrid/notifications/inbox";
import { createClient } from "@/lib/supabase/client";
import { StaffTicketsEntry } from "./tickets-entry";

type StaffRoute = "tickets" | "notifications";
type SyncState = "offline" | "connecting" | "syncing" | "current";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

function syncLabel(sync: SyncState, compact = false) {
  if (sync === "current") return compact ? "Bijgewerkt" : "Alles bijgewerkt";
  if (sync === "offline") return "Offline";
  if (sync === "syncing") return compact ? "Synchroniseren" : "Synchroniseren…";
  return compact ? "Verbinden" : "Verbinden…";
}

export function StaffRouteShellClient({
  tenantName, logoUrl, whiteLabel,
  active,
  actorKey,
  children,
  name,
  style,
  tenantId,
  ticketsEnabled,
}: {
  tenantName: string; logoUrl: string | null; whiteLabel: boolean;
  active: StaffRoute;
  actorKey: string;
  children: ReactNode;
  name: string;
  style: CSSProperties;
  tenantId: string;
  ticketsEnabled: boolean;
}) {
  const router = useRouter();
  const [sync, setSync] = useState<SyncState>("connecting");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [refreshPending, startRefresh] = useTransition();
  const profileMenuWrap = useRef<HTMLDivElement>(null);
  const refreshRequested = useRef(false);
  const subscriptionReady = useRef(false);
  const title = active === "tickets" ? "Tickets" : "Notificaties";

  const refresh = useCallback(() => {
    if (!navigator.onLine) {
      refreshRequested.current = false;
      setSync("offline");
      return;
    }
    refreshRequested.current = true;
    setSync("syncing");
    startRefresh(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (refreshPending || !refreshRequested.current) return;
    refreshRequested.current = false;
    setSync(!navigator.onLine ? "offline" : subscriptionReady.current ? "current" : "connecting");
  }, [refreshPending]);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    let activeConnection = true;
    let refreshTimer = 0;
    const scheduleRefresh = () => {
      if (!activeConnection) return;
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refresh, 180);
    };
    const online = () => { setSync("connecting"); scheduleRefresh(); };
    const offline = () => {
      subscriptionReady.current = false;
      refreshRequested.current = false;
      setSync("offline");
    };
    const visible = () => { if (document.visibilityState === "visible") scheduleRefresh(); };

    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", scheduleRefresh);
    document.addEventListener("visibilitychange", visible);

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const connect = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!activeConnection || error || !session?.access_token) { setSync(navigator.onLine ? "connecting" : "offline"); return; }
      await supabase.realtime.setAuth(session.access_token);
      if (!activeConnection) return;
      channel = supabase
        .channel(`staff-route-shell-${tenantId}`, { config: { postgres_changes_options: { wait: true } } })
        .on("postgres_changes", { event: "*", schema: "public", table: "staff_workspace_revisions", filter: `tenant_id=eq.${tenantId}` }, scheduleRefresh);
      channel.subscribe((state) => {
        if (!activeConnection) return;
        if (state === "SUBSCRIBED") {
          subscriptionReady.current = true;
          scheduleRefresh();
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          subscriptionReady.current = false;
          setSync(navigator.onLine ? "connecting" : "offline");
        }
      });
    };
    void connect().catch(() => { if (activeConnection) setSync(navigator.onLine ? "connecting" : "offline"); });

    const interval = window.setInterval(visible, 20_000);
    const onlineCheckTimer = window.setTimeout(() => { if (!navigator.onLine) offline(); }, 0);
    return () => {
      activeConnection = false;
      subscriptionReady.current = false;
      window.clearTimeout(refreshTimer);
      window.clearTimeout(onlineCheckTimer);
      window.clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", scheduleRefresh);
      document.removeEventListener("visibilitychange", visible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refresh, tenantId]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const wrap = profileMenuWrap.current;
    const trigger = wrap?.querySelector<HTMLButtonElement>(".ps-profile-button");
    const items = () => [...(wrap?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const closeOutside = (event: PointerEvent) => {
      if (!wrap?.contains(event.target as Node)) setProfileMenuOpen(false);
    };
    const closeOnFocusLoss = (event: FocusEvent) => {
      if (!wrap?.contains(event.target as Node)) setProfileMenuOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setProfileMenuOpen(false);
        trigger?.focus();
        return;
      }
      const menuItems = items();
      const current = menuItems.indexOf(document.activeElement as HTMLElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        menuItems[(current + (event.key === "ArrowDown" ? 1 : -1) + menuItems.length) % menuItems.length]?.focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        menuItems[0]?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        menuItems.at(-1)?.focus();
      }
    };

    items()[0]?.focus();
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOnFocusLoss);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOnFocusLoss);
      document.removeEventListener("keydown", key);
    };
  }, [profileMenuOpen]);

  return <div className="personnel-app ps-route-shell" style={style}>
    <aside className="ps-sidebar">
      <div className="ps-sidebar-brand"><div className="ps-sidebar-logo"><FieldgridBrand tenantName={tenantName} logoUrl={logoUrl}/></div><small>PERSONEELSAPP</small></div>
      <nav className="ps-nav" aria-label="Hoofdnavigatie">
        <Link className="ps-nav-button" href="/staff?tab=planning"><CalendarDays/><span>Dagplanning</span></Link>
        <Link className="ps-nav-button" href="/staff?tab=nieuws"><Newspaper/><span>Nieuws</span></Link>
        <Link className="ps-nav-button" href="/staff?tab=uren"><Clock3/><span>Mijn uren</span></Link>
        <StaffTicketsEntry className={`ps-nav-button${active === "tickets" ? " active" : ""}`} active={active === "tickets"} enabled={ticketsEnabled}/>
        <span className="ps-nav-section">PERSONEELSZAKEN</span>
        <Link className="ps-nav-button" href="/staff?tab=meer&section=verlof"><Umbrella/><span>Verlof</span></Link>
        <Link className="ps-nav-button" href="/staff?tab=meer&section=beschikbaarheid"><CalendarCheck/><span>Beschikbaarheid</span></Link>
        <Link className="ps-nav-button" href="/staff?tab=meer&section=documenten"><FileText/><span>Documenten</span></Link>
        <Link className="ps-nav-button" href="/staff?tab=meer&section=instellingen"><Settings/><span>Instellingen</span></Link>
      </nav>
      <footer className="ps-sidebar-footer"><div className="ps-sidebar-person"><span>{initials(name)}</span><span><strong>{name}</strong><small>Medewerker</small></span></div>{!whiteLabel && <small className="ps-powered">Powered by Fieldgrid</small>}</footer>
    </aside>
    <div className="ps-workspace">
      <header className="ps-topbar">
        <div className="ps-topbar-leading"><div className="ps-mobile-brand"><FieldgridBrand tenantName={tenantName} logoUrl={logoUrl}/></div><div className={`ps-sync ${sync}`} role="status" aria-label={syncLabel(sync)}><i/><span>{syncLabel(sync, true)}</span></div><div className="ps-breadcrumb"><span>Mijn werkplek</span><span aria-hidden="true">/</span><strong>{title}</strong></div></div>
        <div className="ps-top-actions"><NotificationBell workspace="staff" actorKey={actorKey}/><div className="ps-profile-wrap" ref={profileMenuWrap}><button className="ps-profile-button" aria-label={`Profielmenu van ${name}`} aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}><span>{initials(name)}</span><small>{name}</small><ChevronRight/></button><form id="staff-route-signout" action="/auth/signout" method="post"/>{profileMenuOpen && <div className="ps-profile-menu" role="menu"><Link role="menuitem" href="/staff?tab=meer&section=profiel" onClick={() => setProfileMenuOpen(false)}><UserRound/>Profiel</Link><Link role="menuitem" href="/staff?tab=meer&section=instellingen" onClick={() => setProfileMenuOpen(false)}><Settings2/>Instellingen</Link><button role="menuitem" type="submit" form="staff-route-signout"><LogOut/>Uitloggen</button></div>}</div></div>
      </header>
      <main className="ps-content ps-route-content">{children}</main>
      <nav className="ps-bottom-nav" aria-label="Mobiele navigatie">
        <Link href="/staff?tab=planning"><CalendarDays/><span>Planning</span></Link>
        <Link href="/staff?tab=nieuws"><Newspaper/><span>Nieuws</span></Link>
        <Link href="/staff?tab=uren"><Clock3/><span>Mijn uren</span></Link>
        <StaffTicketsEntry className={active === "tickets" ? "active" : ""} active={active === "tickets"} enabled={ticketsEnabled}/>
        <Link href="/staff?tab=meer"><MoreHorizontal/><span>Meer</span></Link>
      </nav>
    </div>
  </div>;
}

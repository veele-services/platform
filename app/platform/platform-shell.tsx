"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, Building2, ChevronRight, Headset, LayoutDashboard, Menu, MessageSquareText, Plus, Settings2, Sparkles, Users, X } from "lucide-react";
import { AccountMenu, accountInitials } from "@/components/fieldgrid/account-menu";
import { ProductBrand } from "@/components/fieldgrid/brand";
import { NotificationBell } from "@/components/fieldgrid/notifications/inbox";
import { TenantThemeProvider } from "@/components/fieldgrid/tenant-theme";
import { brandThemeStyle } from "@/lib/branding/palette";
import "./platform.css";
import "./platform-consistency.css";

export type PlatformShellAccess = { userId: string; name: string; email: string | null; canManage: boolean; canSupport: boolean; canConfigureSupport: boolean; canNotifications: boolean };

/** A single platform shell wraps the cockpit, support, notifications and their detail routes. */
export function PlatformShell({ access, children }: { access: PlatformShellAccess; children: ReactNode }) {
  const path = usePathname(), params = useSearchParams();
  const [open, setOpen] = useState(false);
  const view = params.get("view") ?? "overview";
  const support = path.startsWith("/platform/support"), notifications = path.startsWith("/platform/notificaties");
  const settings = path === "/platform/support/instellingen";
  const team = path.startsWith("/platform/team"), product = path.startsWith("/platform/productbeheer");
  const label = product ? "Productbeheer" : team ? "Supportteam" : support ? settings ? "Supportinstellingen" : "Supportdesk" : notifications ? "Notificaties" : view === "tenants" || view === "detail" ? "Tenants" : view === "templates" ? "Berichttemplates" : view === "onboarding" ? "Nieuwe tenant" : "Platformoverzicht";
  const links = [
    ...(access.canManage ? [
      { href: "/platform", label: "Overzicht", icon: LayoutDashboard, active: !product && !team && !support && !notifications && view === "overview" },
      { href: "/platform?view=tenants", label: "Tenants", icon: Building2, active: !product && !team && !support && !notifications && ["tenants", "detail"].includes(view) },
      { href: "/platform?view=onboarding", label: "Nieuwe tenant", icon: Plus, active: !product && !team && !support && !notifications && view === "onboarding" },
      { href: "/platform/productbeheer", label: "Productbeheer", icon: Sparkles, active: product },
      { href: "/platform/team", label: "Supportteam", icon: Users, active: team },
    ] : []),
    ...(access.canSupport ? [{ href: "/platform/support", label: "Supportdesk", icon: Headset, active: support && !settings }] : []),
    ...(access.canConfigureSupport ? [{ href: "/platform/support/instellingen", label: "Supportinstellingen", icon: Settings2, active: settings }] : []),
    ...(access.canNotifications ? [{ href: "/platform/notificaties", label: "Notificaties", icon: Bell, active: notifications }] : []),
    ...(access.canManage ? [{ href: "/platform?view=templates", label: "Berichttemplates", icon: MessageSquareText, active: !product && !team && !support && !notifications && view === "templates" }] : []),
  ];
  return <TenantThemeProvider><div className="fg-console" style={brandThemeStyle()}>
    <aside className={`fg-sidebar${open ? " open" : ""}`} aria-label="Platformnavigatie"><div className="fg-sidebar-brand"><ProductBrand tone="light"/><small>Platformbeheer</small><button type="button" onClick={() => setOpen(false)} aria-label="Sluit menu"><X/></button></div><nav><span>PLATFORM</span>{links.map(item => <Link key={item.href} href={item.href} className={item.active ? "active" : undefined} aria-current={item.active ? "page" : undefined} prefetch={false} onClick={() => setOpen(false)}><item.icon/>{item.label}</Link>)}</nav><footer className="fg-account-footer"><span className="fg-account-initials" aria-hidden="true">{accountInitials(access.name)}</span><div><strong>{access.name}</strong><small>{access.canManage ? "Platformbeheerder" : "Platform-support"}</small></div></footer></aside>
    {open && <button className="fg-sidebar-shade" aria-label="Sluit navigatie" onClick={() => setOpen(false)}/>}
    <div className="fg-workspace" inert={open || undefined}><header className="fg-topbar"><div><button className="fg-menu-button" type="button" onClick={() => setOpen(true)} aria-label="Open menu"><Menu/></button><span className="fg-workspace-tag"><ProductBrand variant="wordmark"/></span><ChevronRight size={15}/><strong>{label}</strong></div><div className="fg-top-right">{access.canNotifications && <NotificationBell workspace="platform" actorKey={access.userId}/>}<AccountMenu name={access.name} email={access.email} role={access.canManage ? "Platformbeheerder" : "Platform-support"} settingsHref={access.canConfigureSupport ? "/platform/support/instellingen" : undefined} preferencesHref={access.canNotifications ? "/platform/notificaties/instellingen" : undefined}/></div></header><main className="fg-main">{children}</main></div>
  </div></TenantThemeProvider>;
}

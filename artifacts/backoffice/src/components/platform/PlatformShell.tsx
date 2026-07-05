"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Bell,
  Building2,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Settings,
  ShieldCheck,
  Ticket,
  UserCog,
  UsersRound,
  X,
} from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { PlatformUserRole } from "@/lib/auth/platform";

type PlatformShellProps = {
  children: ReactNode;
  userEmail: string;
  platformRole: PlatformUserRole;
};

type PlatformNavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

const NAV_ITEMS: PlatformNavItem[] = [
  { href: "/platform", label: "Dashboard", icon: LayoutDashboard },
  { href: "/platform/onboarding", label: "Onboarding", icon: Rocket, adminOnly: true },
  { href: "/platform/tenants", label: "Tenants", icon: Building2, adminOnly: true },
  { href: "/platform/subscriptions", label: "Subscriptions", icon: CreditCard, adminOnly: true },
  { href: "/platform/tickets", label: "Tickets", icon: Ticket, adminOnly: true },
  { href: "/platform/notifications", label: "Meldingen", icon: Bell, adminOnly: true },
  { href: "/platform/security", label: "Security en audit", icon: ShieldCheck, adminOnly: true },
  { href: "/platform/operations", label: "Operations", icon: Activity, adminOnly: true },
  { href: "/platform/staging-smoke", label: "Staging smoke", icon: Activity, adminOnly: true },
  { href: "/platform/users", label: "Platformgebruikers", icon: UsersRound, adminOnly: true },
  { href: "/platform/settings", label: "Instellingen", icon: Settings, adminOnly: true },
];

const ROUTE_LABELS: Array<{ test: (pathname: string) => boolean; title: string; crumbs: Array<{ label: string; href?: string }> }> = [
  {
    test: (pathname) => pathname === "/platform",
    title: "Dashboard",
    crumbs: [{ label: "Platformbeheer" }],
  },
  {
    test: (pathname) => pathname === "/platform/tenants",
    title: "Tenants",
    crumbs: [{ label: "Platformbeheer", href: "/platform" }, { label: "Tenants" }],
  },
  {
    test: (pathname) => pathname.startsWith("/platform/onboarding"),
    title: "Onboarding",
    crumbs: [{ label: "Platformbeheer", href: "/platform" }, { label: "Onboarding" }],
  },
  {
    test: (pathname) => pathname.startsWith("/platform/tenants/"),
    title: "Tenantdetail",
    crumbs: [{ label: "Platformbeheer", href: "/platform" }, { label: "Tenants", href: "/platform/tenants" }, { label: "Detail" }],
  },
  {
    test: (pathname) => pathname.startsWith("/platform/subscriptions"),
    title: "Subscriptions",
    crumbs: [{ label: "Platformbeheer", href: "/platform" }, { label: "Subscriptions" }],
  },
  {
    test: (pathname) => pathname.startsWith("/platform/tickets"),
    title: "Tickets",
    crumbs: [{ label: "Platformbeheer", href: "/platform" }, { label: "Tickets" }],
  },
  {
    test: (pathname) => pathname.startsWith("/platform/notifications"),
    title: "Meldingen",
    crumbs: [{ label: "Platformbeheer", href: "/platform" }, { label: "Meldingen" }],
  },
  {
    test: (pathname) => pathname.startsWith("/platform/security"),
    title: "Security en audit",
    crumbs: [{ label: "Platformbeheer", href: "/platform" }, { label: "Security en audit" }],
  },
  {
    test: (pathname) => pathname.startsWith("/platform/operations"),
    title: "Operations",
    crumbs: [{ label: "Platformbeheer", href: "/platform" }, { label: "Operations" }],
  },
  {
    test: (pathname) => pathname.startsWith("/platform/staging-smoke"),
    title: "Staging smoke",
    crumbs: [{ label: "Platformbeheer", href: "/platform" }, { label: "Staging smoke" }],
  },
  {
    test: (pathname) => pathname.startsWith("/platform/users"),
    title: "Platformgebruikers",
    crumbs: [{ label: "Platformbeheer", href: "/platform" }, { label: "Platformgebruikers" }],
  },
  {
    test: (pathname) => pathname.startsWith("/platform/settings"),
    title: "Instellingen",
    crumbs: [{ label: "Platformbeheer", href: "/platform" }, { label: "Instellingen" }],
  },
];

function isPlatformAdmin(role: PlatformUserRole): boolean {
  return role === "owner" || role === "admin";
}
function isActive(pathname: string, href: string): boolean {
  if (href === "/platform") return pathname === "/platform";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function routeState(pathname: string) {
  return ROUTE_LABELS.find((route) => route.test(pathname)) ?? {
    title: "Platformbeheer",
    crumbs: [{ label: "Platformbeheer", href: "/platform" }],
  };
}

function userInitial(email: string): string {
  return (email.trim()[0] ?? "P").toUpperCase();
}

export function PlatformShell({ children, userEmail, platformRole }: PlatformShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const route = useMemo(() => routeState(pathname), [pathname]);
  const canUseAdminNavigation = isPlatformAdmin(platformRole);
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || canUseAdminNavigation);

  function closeNavigation() {
    setOpen(false);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-950">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[264px] select-none flex-col border-r border-slate-800/60 bg-slate-950 text-white shadow-xl transition-all duration-200 ease-out",
          "md:static md:h-full md:shrink-0 md:translate-x-0 md:shadow-none",
          collapsed ? "md:w-[76px]" : "md:w-[264px]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className={cn("flex h-16 shrink-0 items-center border-b border-white/10 px-4", collapsed && "md:justify-center md:px-0")}>
          <button
            type="button"
            onClick={closeNavigation}
            className="mr-3 rounded p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Navigatie sluiten"
            title="Navigatie sluiten"
          >
            <X className="h-5 w-5" />
          </button>
          <Link href="/platform" onClick={closeNavigation} className={cn("min-w-0", collapsed && "md:hidden")}>
            <span className="block text-sm font-bold uppercase tracking-[0.3em] text-white">Fieldgrid</span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300">Platform</span>
          </Link>
          <Link
            href="/platform"
            onClick={closeNavigation}
            className={cn(
              "hidden h-9 w-9 items-center justify-center rounded bg-cyan-500 text-sm font-bold text-slate-950",
              collapsed && "md:flex",
            )}
            aria-label="Fieldgrid platform"
            title="Fieldgrid platform"
          >
            F
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="grid gap-1">
            {visibleItems.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={closeNavigation}
                  title={label}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white",
                    collapsed && "md:justify-center md:px-0",
                    active && "bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-300/20",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.4 : 1.8} />
                  <span className={cn("min-w-0 truncate", collapsed && "md:hidden")}>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className={cn("border-t border-white/10 p-3", collapsed && "md:px-2")}>
          <div className={cn("rounded-md bg-white/5 px-3 py-2", collapsed && "md:flex md:justify-center md:px-0")}>
            <UserCog className={cn("h-4 w-4 text-cyan-200", !collapsed && "mb-2")} />
            <div className={cn("min-w-0", collapsed && "md:hidden")}>
              <p className="truncate text-xs font-medium text-white">{platformRole}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">{userEmail}</p>
            </div>
          </div>
        </div>
      </aside>

      {open && <button type="button" className="fixed inset-0 z-40 bg-slate-950/50 md:hidden" onClick={closeNavigation} aria-label="Navigatie sluiten" />}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            className="md:hidden"
            aria-label="Navigatie openen"
            title="Navigatie openen"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((value) => !value)}
            className="hidden md:inline-flex"
            aria-label={collapsed ? "Sidebar uitklappen" : "Sidebar inklappen"}
            title={collapsed ? "Sidebar uitklappen" : "Sidebar inklappen"}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </Button>

          <div className="min-w-0 flex-1">
            <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-xs text-slate-500 sm:flex">
              {route.crumbs.map((crumb, index) => (
                <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
                  {index > 0 && <span className="text-slate-300">/</span>}
                  {crumb.href ? (
                    <Link href={crumb.href} className="truncate underline-offset-2 hover:text-slate-900 hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="truncate text-slate-700">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <h1 className="truncate text-lg font-semibold tracking-normal text-slate-950 sm:mt-0.5">{route.title}</h1>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                  {userInitial(userEmail)}
                </span>
                <span className="hidden min-w-0 text-left lg:block">
                  <span className="block max-w-[220px] truncate text-sm font-medium text-slate-950">{userEmail}</span>
                  <span className="block max-w-[220px] truncate text-xs capitalize text-slate-500">{platformRole}</span>
                </span>
                <ChevronDown className="hidden h-4 w-4 text-slate-400 lg:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <span className="block truncate text-sm">{userEmail}</span>
                <span className="block truncate text-xs font-normal capitalize text-slate-500">{platformRole}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <form action={signOut}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full">
                    <LogOut className="h-4 w-4" />
                    Uitloggen
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/actions/auth";
import { useSidebar } from "@/providers/sidebar-provider";
import { TenantSwitcher } from "@/components/layout/TenantSwitcher";
import { FeatureHelp } from "@/components/knowledgebase/FeatureHelp";
import type { BackofficeTenantOption } from "@/lib/auth/tenant";

type DashboardHeaderProps = {
  userEmail: string;
  userName: string;
  userInitial: string;
  userRole: string;
  currentTenantId: string;
  tenantOptions: BackofficeTenantOption[];
};

const ROUTE_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: "/planning", title: "Planning" },
  { prefix: "/assignments", title: "Opdrachten" },
  { prefix: "/quotes", title: "Offertes" },
  { prefix: "/customers", title: "Klanten" },
  { prefix: "/objects", title: "Objecten" },
  { prefix: "/personnel/verlof", title: "Verlof-inbox" },
  { prefix: "/personnel", title: "Personeel" },
  { prefix: "/materials", title: "Materialen" },
  { prefix: "/inventory", title: "Inventaris" },
  { prefix: "/reports", title: "Rapporten" },
  { prefix: "/invoices", title: "Facturen" },
  { prefix: "/documents", title: "Documenten" },
  { prefix: "/tickets", title: "Tickets" },
  { prefix: "/settings", title: "Instellingen" },
  { prefix: "/instellingen", title: "Instellingen" },
  { prefix: "/profile", title: "Profiel" },
];

const ROUTE_HELP: Array<{ prefix: string; title: string; description: string }> = [
  {
    prefix: "/planning",
    title: "Planning",
    description: "Plan werkbonnen, bekijk dag-, maand- en kaartweergaven en bewaak conflicten.",
  },
  {
    prefix: "/assignments",
    title: "Opdrachten",
    description: "Beheer werkbonnen, taken, personeel, rapportage en opvolging.",
  },
  {
    prefix: "/quotes",
    title: "Offertes",
    description: "Volg offertevoorstellen, klantgoedkeuringen, bedragen en vervaldatums.",
  },
  {
    prefix: "/customers",
    title: "Klanten",
    description: "Beheer klantgegevens, sectoren, contacten, objecten en klantnotities.",
  },
];

function titleForPath(pathname: string, searchParams: URLSearchParams): string {
  if (pathname === "/") return "Dashboard";
  if (pathname === "/planning" && searchParams.get("view") === "map") return "Kaart";
  return ROUTE_TITLES.find((route) => pathname.startsWith(route.prefix))?.title ?? "Dashboard";
}

function helpForPath(pathname: string, searchParams: URLSearchParams) {
  if (pathname === "/planning" && searchParams.get("view") === "map") {
    return {
      title: "Kaart",
      description: "Bekijk geplande werkbonnen op de kaart met objectlocaties, routes en waarschuwingen.",
    };
  }
  return ROUTE_HELP.find((route) => pathname.startsWith(route.prefix)) ?? null;
}

function searchTargetForPath(pathname: string): string {
  if (pathname.startsWith("/customers")) return "/customers";
  if (pathname.startsWith("/objects")) return "/objects";
  if (pathname.startsWith("/personnel")) return "/personnel";
  if (pathname.startsWith("/materials")) return "/materials";
  if (pathname.startsWith("/inventory")) return "/inventory";
  if (pathname.startsWith("/quotes")) return "/quotes";
  if (pathname.startsWith("/reports")) return "/reports";
  if (pathname.startsWith("/invoices")) return "/invoices";
  if (pathname.startsWith("/documents")) return "/documents";
  if (pathname.startsWith("/tickets")) return "/tickets";
  return "/assignments";
}

export function DashboardHeader({
  userEmail,
  userName,
  userInitial,
  userRole,
  currentTenantId,
  tenantOptions,
}: DashboardHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toggle, collapsed, toggleCollapsed } = useSidebar();
  const [query, setQuery] = useState("");

  const title = useMemo(() => titleForPath(pathname, searchParams), [pathname, searchParams]);
  const help = useMemo(() => helpForPath(pathname, searchParams), [pathname, searchParams]);
  const target = useMemo(() => searchTargetForPath(pathname), [pathname]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`${target}?search=${encodeURIComponent(trimmed)}`);
  }

  return (
    <header
      className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b bg-white px-5"
      style={{ borderColor: "#E2E8F0" }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggle}
        className="md:hidden"
        aria-label="Navigatie openen"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggleCollapsed}
        className="hidden md:inline-flex"
        aria-label={collapsed ? "Sidebar uitklappen" : "Sidebar inklappen"}
        title={collapsed ? "Sidebar uitklappen" : "Sidebar inklappen"}
      >
        {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
      </Button>

      <div className="min-w-[150px] shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-xl font-semibold leading-tight" style={{ color: "#081D3A" }}>
            {title}
          </h1>
          {help && (
            <FeatureHelp
              title={help.title}
              description={help.description}
              placement="bottom"
              showRelatedArticles={false}
              className="h-6 w-6 shadow-none"
            />
          )}
        </div>
      </div>

      <form onSubmit={handleSearch} className="hidden min-w-0 flex-1 md:block">
        <label className="relative block max-w-[560px]">
          <span className="sr-only">Snel zoeken</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#94A3B8" }} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Snel zoeken..."
            className="h-10 w-full rounded-md border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[#00B7B3] focus:ring-4 focus:ring-[#00B7B3]/10"
            style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
          />
        </label>
      </form>

      <TenantSwitcher currentTenantId={currentTenantId} tenants={tenantOptions} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="ml-auto flex min-w-0 items-center gap-3 rounded-md px-2 py-1.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00B7B3]/30"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: "#133D6B" }}
            >
              {userInitial}
            </span>
            <span className="hidden min-w-0 text-left lg:block">
              <span className="block max-w-[190px] truncate text-sm font-medium" style={{ color: "#081D3A" }}>
                {userName}
              </span>
              <span className="block max-w-[190px] truncate text-xs" style={{ color: "#64748B" }}>
                {userRole}
              </span>
            </span>
            <ChevronDown className="hidden h-4 w-4 lg:block" style={{ color: "#94A3B8" }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>
            <span className="block truncate text-sm">{userName}</span>
            <span className="block truncate text-xs font-normal" style={{ color: "#64748B" }}>
              {userEmail}
            </span>
            <span className="block truncate text-xs font-normal" style={{ color: "#64748B" }}>
              {userRole}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <User className="h-4 w-4" />
              Profiel
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings className="h-4 w-4" />
              Instellingen
            </Link>
          </DropdownMenuItem>
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
  );
}

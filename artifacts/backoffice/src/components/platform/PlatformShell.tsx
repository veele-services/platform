"use client";

import {
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { signOut } from "@/app/actions/auth";
import { GlobalCommandPalette } from "@/components/navigation/GlobalCommandPalette";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PlatformUserRole } from "@/lib/auth/platform";
import { FIELDGRID_ROUTE_ICONS } from "@/lib/navigation/route-icons";
import {
  PLATFORM_NAVIGATION_GROUPS,
  PLATFORM_ROUTES,
  getFieldgridRoute,
  type FieldgridRouteDefinition,
  type PlatformNavigationGroup,
} from "@/lib/navigation/route-registry";
import { cn } from "@/lib/utils";

type PlatformShellProps = {
  children: ReactNode;
  userEmail: string;
  platformRole: PlatformUserRole;
};

const PLATFORM_SIDEBAR_STORAGE_KEY = "fieldgrid:platform-sidebar-collapsed";

function isPlatformAdmin(role: PlatformUserRole): boolean {
  return role === "owner" || role === "admin";
}

function userInitial(email: string): string {
  return (email.trim()[0] ?? "P").toUpperCase();
}

export function PlatformShell({
  children,
  userEmail,
  platformRole,
}: PlatformShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(PLATFORM_SIDEBAR_STORAGE_KEY) === "true";
  });
  const route = getFieldgridRoute(pathname, "platform");
  const canUseAdminNavigation = isPlatformAdmin(platformRole);
  const visibleRoutes = useMemo(
    () =>
      (PLATFORM_ROUTES as readonly FieldgridRouteDefinition[]).filter(
        (item) =>
          item.releaseVisibility === "primary" &&
          item.navGroup &&
          (!item.adminOnly || canUseAdminNavigation),
      ),
    [canUseAdminNavigation],
  );
  const groupedRoutes = new Map<
    PlatformNavigationGroup,
    FieldgridRouteDefinition[]
  >(
    PLATFORM_NAVIGATION_GROUPS.map((group) => [
      group.id,
      visibleRoutes.filter((item) => item.navGroup === group.id),
    ]),
  );

  useEffect(() => {
    window.localStorage.setItem(
      PLATFORM_SIDEBAR_STORAGE_KEY,
      String(collapsed),
    );
  }, [collapsed]);

  function closeNavigation() {
    setOpen(false);
  }

  function routeLink(item: FieldgridRouteDefinition) {
    const Icon = FIELDGRID_ROUTE_ICONS[item.icon];
    const active = route?.id === item.id;
    const link = (
      <Link
        href={item.href}
        onClick={closeNavigation}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200",
          collapsed && "md:justify-center md:px-0",
          active && "bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-300/20",
        )}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="size-4 shrink-0" strokeWidth={active ? 2.4 : 1.8} />
        <span className={cn("min-w-0 truncate", collapsed && "md:hidden")}>
          {item.title}
        </span>
      </Link>
    );

    if (!collapsed) return <div key={item.id}>{link}</div>;

    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.title}</TooltipContent>
      </Tooltip>
    );
  }

  const sidebarContent = (
    <>
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-white/10 px-4",
          collapsed && "md:justify-center md:px-0",
        )}
      >
        <Link
          href="/platform"
          onClick={closeNavigation}
          className={cn("min-w-0", collapsed && "md:hidden")}
        >
          <span className="block text-sm font-bold uppercase tracking-[0.3em] text-white">
            Fieldgrid
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Platform
          </span>
        </Link>
        <Link
          href="/platform"
          onClick={closeNavigation}
          className={cn(
            "hidden size-9 items-center justify-center rounded-lg bg-cyan-500 text-sm font-bold text-slate-950",
            collapsed && "md:flex",
          )}
          aria-label="Fieldgrid platformoverzicht"
        >
          FG
        </Link>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-3 py-4"
        aria-label="Platformnavigatie"
      >
        {collapsed ? (
          <div className="grid gap-1">
            {PLATFORM_NAVIGATION_GROUPS.flatMap((group) =>
              (groupedRoutes.get(group.id) ?? []).map(routeLink),
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            {PLATFORM_NAVIGATION_GROUPS.map((group) => {
              const items = groupedRoutes.get(group.id) ?? [];
              if (items.length === 0) return null;
              return (
                <Collapsible key={group.id} defaultOpen>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="group flex min-h-9 w-full items-center justify-between rounded-md px-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 transition hover:bg-white/5 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                    >
                      {group.label}
                      <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90 motion-reduce:transition-none" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="grid gap-0.5">
                    {items.map(routeLink)}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </nav>

      <div
        className={cn("border-t border-white/10 p-3", collapsed && "md:px-2")}
      >
        <div
          className={cn(
            "rounded-md bg-white/5 px-3 py-2",
            collapsed && "md:flex md:justify-center md:px-0",
          )}
        >
          <UserCog
            className={cn("size-4 text-cyan-200", !collapsed && "mb-2")}
          />
          <div className={cn("min-w-0", collapsed && "md:hidden")}>
            <p className="truncate text-xs font-medium capitalize text-white">
              {platformRole}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              {userEmail}
            </p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <TooltipProvider delayDuration={250}>
      <div className="platform-shell flex h-screen overflow-hidden bg-slate-50 text-slate-950">
        <Sheet
          open={open}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closeNavigation();
          }}
        >
          <SheetContent
            side="left"
            className="w-[264px] max-w-[calc(100vw-2rem)] select-none gap-0 overflow-hidden border-0 border-r border-slate-800/60 bg-slate-950 p-0 text-white sm:w-[264px]"
          >
            <SheetTitle className="sr-only">Platformnavigatie</SheetTitle>
            <div className="flex h-full flex-col">{sidebarContent}</div>
          </SheetContent>
        </Sheet>
        <aside
          className={cn(
            "hidden h-full shrink-0 select-none flex-col border-r border-slate-800/60 bg-slate-950 text-white md:flex",
            collapsed ? "w-[76px]" : "w-[264px]",
          )}
        >
          {sidebarContent}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-30 flex min-h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-3 sm:px-4 md:px-5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(true)}
              className="md:hidden"
              aria-label="Navigatie openen"
            >
              <Menu className="size-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed((value) => !value)}
              className="hidden md:inline-flex"
              aria-label={
                collapsed ? "Sidebar uitklappen" : "Sidebar inklappen"
              }
              title={collapsed ? "Sidebar uitklappen" : "Sidebar inklappen"}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-5" />
              ) : (
                <PanelLeftClose className="size-5" />
              )}
            </Button>

            <div className="min-w-0 flex-1 overflow-hidden md:max-w-[18rem] md:flex-none">
              <nav
                aria-label="Kruimelpad"
                className="hidden items-center gap-1 text-xs text-slate-500 sm:flex"
              >
                {route?.href !== "/platform" ? (
                  <>
                    <Link
                      href="/platform"
                      className="truncate underline-offset-2 hover:text-slate-900 hover:underline"
                    >
                      Platformbeheer
                    </Link>
                    <span className="text-slate-300">/</span>
                  </>
                ) : null}
                <span className="truncate text-slate-700">
                  {route?.breadcrumb ?? "Platformbeheer"}
                </span>
              </nav>
              <h1 className="truncate text-base font-semibold tracking-normal text-slate-950 sm:mt-0.5 sm:text-lg">
                {route?.title ?? "Platformbeheer"}
              </h1>
            </div>

            <GlobalCommandPalette
              scope="platform"
              platformAdmin={canUseAdminNavigation}
              className="hidden md:flex"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-auto flex min-h-11 min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 sm:px-2"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                    {userInitial(userEmail)}
                  </span>
                  <span className="hidden min-w-0 text-left xl:block">
                    <span className="block max-w-[220px] truncate text-sm font-medium text-slate-950">
                      {userEmail}
                    </span>
                    <span className="block max-w-[220px] truncate text-xs capitalize text-slate-500">
                      {platformRole}
                    </span>
                  </span>
                  <ChevronDown className="hidden size-4 text-slate-400 xl:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <span className="block truncate text-sm">{userEmail}</span>
                  <span className="block truncate text-xs font-normal capitalize text-slate-500">
                    {platformRole}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <form action={signOut}>
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full">
                      <LogOut className="size-4" />
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
    </TooltipProvider>
  );
}

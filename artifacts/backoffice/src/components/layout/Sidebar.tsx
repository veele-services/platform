"use client";

import type { CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FIELDGRID_ROUTE_ICONS } from "@/lib/navigation/route-icons";
import {
  TENANT_NAVIGATION_GROUPS,
  TENANT_ROUTES,
  getFieldgridRoute,
  routeIsVisibleForPermissions,
  type FieldgridRouteDefinition,
  type TenantNavigationGroup,
} from "@/lib/navigation/route-registry";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/providers/permissions-provider";
import { useSidebar } from "@/providers/sidebar-provider";
import {
  accessibleBrandTextColor,
  ensureAccessibleBrandTextColor,
} from "@workspace/db/brand-color-contrast";

interface SidebarProps {
  branding?: {
    displayName: string;
    logoUrl: string | null;
    customBrandingEnabled: boolean;
    sidebarBackgroundColor: string;
    sidebarTextColor: string;
    sidebarAccentColor: string;
  };
  pendingReportsCount?: number;
  outstandingInvoicesCount?: number;
  pendingQuotesCount?: number;
  pendingLeaveCount?: number;
}

function initialsFor(value: string): string {
  return (
    value
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "FG"
  );
}

function badgeForRoute(
  routeId: string,
  counts: {
    reports: number;
    invoices: number;
    quotes: number;
    leave: number;
  },
): number {
  if (routeId === "tenant-reports") return counts.reports;
  if (routeId === "tenant-invoices") return counts.invoices;
  if (routeId === "tenant-quotes") return counts.quotes;
  if (routeId === "tenant-leave") return counts.leave;
  return 0;
}

export function Sidebar({
  branding,
  pendingReportsCount = 0,
  outstandingInvoicesCount = 0,
  pendingQuotesCount = 0,
  pendingLeaveCount = 0,
}: SidebarProps) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const { open, close, collapsed } = useSidebar();
  const activeRoute = getFieldgridRoute(pathname, "tenant");
  const routes = (TENANT_ROUTES as readonly FieldgridRouteDefinition[]).filter(
    (route) =>
      route.releaseVisibility === "primary" &&
      route.navGroup &&
      routeIsVisibleForPermissions(route, permissions),
  );
  const groupedRoutes = new Map<
    TenantNavigationGroup,
    FieldgridRouteDefinition[]
  >(TENANT_NAVIGATION_GROUPS.map((group) => [group.id, []]));

  for (const route of routes) {
    const group = route.navGroup as TenantNavigationGroup;
    groupedRoutes.get(group)?.push(route);
  }

  const whitelabel = Boolean(branding?.customBrandingEnabled);
  const sidebarBackgroundColor = branding?.sidebarBackgroundColor ?? "#081D3A";
  const configuredSidebarTextColor = branding?.sidebarTextColor ?? "#FFFFFF";
  const sidebarAccentColor = branding?.sidebarAccentColor ?? "#00B7B3";
  const sidebarTextColor = ensureAccessibleBrandTextColor(
    sidebarBackgroundColor,
    configuredSidebarTextColor,
  );
  const sidebarActiveTextColor = accessibleBrandTextColor(sidebarAccentColor);
  const displayName = whitelabel
    ? branding?.displayName?.trim() || "Organisatie"
    : "Fieldgrid";
  const compactInitials = whitelabel ? initialsFor(displayName) : "FG";
  const counts = {
    reports: pendingReportsCount,
    invoices: outstandingInvoicesCount,
    quotes: pendingQuotesCount,
    leave: pendingLeaveCount,
  };

  function routeLink(route: FieldgridRouteDefinition) {
    const Icon = FIELDGRID_ROUTE_ICONS[route.icon];
    const active = activeRoute?.id === route.id;
    const badgeCount = badgeForRoute(route.id, counts);
    const link = (
      <Link
        href={route.href}
        onClick={close}
        className={cn(
          "sidebar-link min-h-11",
          collapsed ? "md:justify-center md:px-0" : "md:justify-start md:px-3",
          active && "active",
        )}
        aria-current={active ? "page" : undefined}
      >
        <span className="relative shrink-0">
          <Icon className="size-[15px]" strokeWidth={active ? 2.5 : 1.75} />
          {badgeCount > 0 && collapsed ? (
            <span
              className="absolute -right-1 -top-1 hidden size-2 rounded-full md:block"
              style={{ backgroundColor: sidebarAccentColor }}
            />
          ) : null}
        </span>
        <span
          className={cn("min-w-0 flex-1 truncate", collapsed && "md:hidden")}
        >
          {route.title}
        </span>
        {badgeCount > 0 ? (
          <span
            className={cn(
              "min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white",
              collapsed ? "md:hidden" : "md:flex",
            )}
            style={{
              backgroundColor: sidebarAccentColor,
              height: "18px",
            }}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
      </Link>
    );

    if (!collapsed) return <div key={route.id}>{link}</div>;

    return (
      <Tooltip key={route.id}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{route.title}</TooltipContent>
      </Tooltip>
    );
  }

  const sidebarContent = (
    <>
      <div
        className={cn(
          "flex h-20 shrink-0 items-center px-5",
          collapsed ? "md:justify-center md:px-0" : "md:justify-center md:px-6",
        )}
      >
        {whitelabel ? (
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center",
              collapsed && "md:hidden",
            )}
          >
            {branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt=""
                className="max-h-12 max-w-[170px] object-contain"
              />
            ) : (
              <span
                className="max-w-[170px] truncate text-center text-sm font-bold"
                style={{
                  color: sidebarTextColor,
                  fontFamily: "var(--font-poppins), Poppins, sans-serif",
                }}
              >
                {displayName}
              </span>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col leading-none",
              collapsed && "md:hidden",
            )}
          >
            <span
              className="font-bold tracking-widest text-white"
              style={{
                fontFamily: "var(--font-poppins), Poppins, sans-serif",
                fontSize: "15px",
              }}
            >
              FIELDGRID
            </span>
            <span
              className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-[#44D6D1]"
              style={{
                fontFamily: "var(--font-inter), Inter, sans-serif",
              }}
            >
              Services
            </span>
          </div>
        )}

        <div
          className={cn(
            "hidden size-9 items-center justify-center rounded-lg text-sm font-bold text-white",
            collapsed && "md:flex",
          )}
          style={{ backgroundColor: sidebarAccentColor }}
          aria-hidden="true"
        >
          {compactInitials.slice(0, 2)}
        </div>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-3 py-3"
        aria-label="Hoofdnavigatie"
      >
        {routes.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs leading-5 text-white/50">
            Geen modules toegewezen.
            <br />
            Neem contact op met uw beheerder.
          </p>
        ) : collapsed ? (
          <div className="grid gap-1">
            {TENANT_NAVIGATION_GROUPS.flatMap((group) =>
              (groupedRoutes.get(group.id) ?? []).map(routeLink),
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            {TENANT_NAVIGATION_GROUPS.map((group) => {
              const items = groupedRoutes.get(group.id) ?? [];
              if (items.length === 0) return null;
              return (
                <Collapsible key={group.id} defaultOpen>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="group flex min-h-9 w-full items-center justify-between rounded-md px-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50 transition hover:bg-white/5 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
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

      <div className="h-3 shrink-0 border-t border-white/10" />
    </>
  );
  const sidebarStyle = {
    backgroundColor: sidebarBackgroundColor,
    "--sidebar-text": sidebarTextColor,
    "--sidebar-accent": sidebarAccentColor,
    "--sidebar-active-text": sidebarActiveTextColor,
  } as CSSProperties;

  return (
    <TooltipProvider delayDuration={250}>
      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) close();
        }}
      >
        <SheetContent
          side="left"
          className="w-[240px] max-w-[calc(100vw-2rem)] select-none gap-0 overflow-hidden border-0 p-0 text-white sm:w-[240px]"
          style={sidebarStyle}
        >
          <SheetTitle className="sr-only">Hoofdnavigatie</SheetTitle>
          <div className="flex h-full flex-col">{sidebarContent}</div>
        </SheetContent>
      </Sheet>
      <aside
        className={cn(
          "hidden h-full shrink-0 select-none flex-col md:flex",
          collapsed ? "w-[72px]" : "w-[240px]",
        )}
        style={sidebarStyle}
      >
        {sidebarContent}
      </aside>
    </TooltipProvider>
  );
}

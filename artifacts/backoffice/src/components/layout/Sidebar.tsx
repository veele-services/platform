"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import {
  BarChart3,
  Boxes,
  Building2,
  Calendar,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  FileText,
  FolderOpen,
  Globe2,
  HelpCircle,
  LayoutDashboard,
  Lightbulb,
  Map,
  MessageSquare,
  Newspaper,
  PackageSearch,
  Settings,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/providers/permissions-provider";
import { useSidebar } from "@/providers/sidebar-provider";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard", permission: "dashboard:read" },
  { href: "/planning", icon: Calendar, label: "Planning", permission: "planning:read" },
  { href: "/planning?view=map", icon: Map, label: "Kaart", permission: "planning:read", feature: "planning-map" },
  { href: "/assignments", icon: ClipboardList, label: "Opdrachten", permission: "assignments:read" },
  { href: "/quotes", icon: FileCheck2, label: "Offertes", permission: "quotes:read" },
  { href: "/customers", icon: Users, label: "Klanten", permission: "customers:read" },
  { href: "/objects", icon: Building2, label: "Objecten", permission: "objects:read" },
  { href: "/personnel", icon: UserCog, label: "Personeel", permission: "personnel:read" },
  { href: "/materials", icon: Boxes, label: "Materialen", permission: "materials:view" },
  { href: "/inventory", icon: PackageSearch, label: "Inventaris", permission: "inventory:view" },
  { href: "/personnel/verlof", icon: CalendarClock, label: "Verlof-inbox", permission: "personnel:read" },
  { href: "/reports", icon: BarChart3, label: "Rapporten", permission: "reports:read" },
  { href: "/invoices", icon: FileText, label: "Facturen", permission: "invoices:read" },
  { href: "/documents", icon: FolderOpen, label: "Documenten", permission: "documents:read" },
  { href: "/tickets", icon: MessageSquare, label: "Tickets", permission: "tickets:read" },
  { href: "/news", icon: Newspaper, label: "Nieuws", permission: "news:read" },
  { href: "/website", icon: Globe2, label: "Website", permission: "website:read" },
  { href: "/help", icon: HelpCircle, label: "Help", permission: "kb:view" },
  { href: "/roadmap", icon: Lightbulb, label: "Roadmap", permission: "roadmap:view" },
  { href: "/releases", icon: FileText, label: "Releases", permission: "releases:view" },
  { href: "/settings", icon: Settings, label: "Instellingen", permission: "settings:read" },
] as const;

function accessibleTextColor(background: string): "#081D3A" | "#FFFFFF" {
  const match = /^#([0-9a-f]{6})$/iu.exec(background.trim());
  if (!match) return "#081D3A";
  const channels = [0, 2, 4].map((offset) => parseInt(match[1]!.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  const navyContrast = (luminance + 0.05) / (0.0099 + 0.05);
  const whiteContrast = 1.05 / (luminance + 0.05);
  return navyContrast >= whiteContrast ? "#081D3A" : "#FFFFFF";
}

function isActive(pathname: string, href: string, searchParams: URLSearchParams): boolean {
  if (href.includes("?")) {
    const [hrefPath, hrefSearch] = href.split("?");
    const expected = new URLSearchParams(hrefSearch);
    if (pathname !== hrefPath) return false;
    for (const [key, value] of expected.entries()) {
      if (searchParams.get(key) !== value) return false;
    }
    return true;
  }
  if (href === "/") return pathname === "/";
  if (href === "/planning" && searchParams.get("view") === "map") return false;
  if (href === "/settings") {
    return pathname.startsWith("/settings") || pathname.startsWith("/instellingen");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
  planningMapEnabled?: boolean;
}

function initialsFor(value: string): string {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "FG";
}

export function Sidebar({
  branding,
  pendingReportsCount = 0,
  outstandingInvoicesCount = 0,
  pendingQuotesCount = 0,
  pendingLeaveCount = 0,
  planningMapEnabled = false,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const permissions = usePermissions();
  const { open, close, collapsed } = useSidebar();
  const visibleItems = NAV_ITEMS.filter((item) => {
    if ("feature" in item && item.feature === "planning-map" && !planningMapEnabled) {
      return false;
    }
    return permissions.has(item.permission);
  });
  const whitelabel = Boolean(branding?.customBrandingEnabled);
  const sidebarBackgroundColor = branding?.sidebarBackgroundColor ?? "#081D3A";
  const sidebarTextColor = branding?.sidebarTextColor ?? "#FFFFFF";
  const sidebarAccentColor = branding?.sidebarAccentColor ?? "#00B7B3";
  const sidebarActiveTextColor = accessibleTextColor(sidebarAccentColor);
  const displayName = whitelabel ? branding?.displayName?.trim() || "Organisatie" : "Fieldgrid";
  const compactInitials = whitelabel ? initialsFor(displayName) : "FG";

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[240px] select-none flex-col transition-all duration-300 ease-in-out",
        "md:static md:h-full md:flex-shrink-0 md:translate-x-0",
        collapsed ? "md:w-[72px]" : "md:w-[240px]",
        open ? "translate-x-0" : "-translate-x-full",
      )}
      style={{
        backgroundColor: sidebarBackgroundColor,
        "--sidebar-text": sidebarTextColor,
        "--sidebar-accent": sidebarAccentColor,
        "--sidebar-active-text": sidebarActiveTextColor,
      } as CSSProperties}
    >
      <div
        className={cn(
          "flex h-20 flex-shrink-0 items-center px-5",
          collapsed ? "md:justify-center md:px-0" : "md:justify-center md:px-6",
        )}
      >
        <button
          type="button"
          onClick={close}
          className="mr-auto rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none md:hidden"
          aria-label="Navigatie sluiten"
        >
          <X size={18} strokeWidth={1.75} />
        </button>

        {whitelabel ? (
          <div className={cn("flex min-w-0 flex-1 items-center justify-center", collapsed && "md:hidden")}>
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
          <div className={cn("flex flex-col leading-none", collapsed && "md:hidden")}>
            <span
              className="font-bold tracking-widest text-white"
              style={{ fontFamily: "var(--font-poppins), Poppins, sans-serif", fontSize: "15px" }}
            >
              FIELDGRID
            </span>
            <span
              style={{
                fontFamily: "var(--font-inter), Inter, sans-serif",
                fontSize: "9px",
                color: "#44D6D1",
                marginTop: "2px",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
              }}
            >
              Services
            </span>
          </div>
        )}

        <div
          className={cn(
            "hidden h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white",
            collapsed && "md:flex",
          )}
          style={{ backgroundColor: sidebarAccentColor }}
        >
          {compactInitials.slice(0, 2)}
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {visibleItems.length === 0 ? (
          <p
            className="px-3 py-4 text-center md:hidden lg:block"
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              fontSize: "12px",
              color: "rgba(255,255,255,0.35)",
              lineHeight: "1.5",
            }}
          >
            Geen modules toegewezen.
            <br />
            Neem contact op met uw beheerder.
          </p>
        ) : (
          visibleItems.map(({ href, icon: Icon, label }) => {
            const active = isActive(pathname, href, searchParams);
            const hasBadge =
              (href === "/reports" && pendingReportsCount > 0) ||
              (href === "/invoices" && outstandingInvoicesCount > 0) ||
              (href === "/quotes" && pendingQuotesCount > 0) ||
              (href === "/personnel/verlof" && pendingLeaveCount > 0);
            const badgeCount =
              href === "/reports"
                ? pendingReportsCount
                : href === "/invoices"
                  ? outstandingInvoicesCount
                  : href === "/quotes"
                    ? pendingQuotesCount
                    : href === "/personnel/verlof"
                      ? pendingLeaveCount
                      : 0;

            return (
              <Link
                key={href}
                href={href}
                onClick={close}
                className={cn(
                  "sidebar-link",
                  collapsed ? "md:justify-center md:px-0" : "md:justify-start md:px-3",
                  active && "active",
                )}
                title={label}
              >
                <div className="relative flex-shrink-0">
                  <Icon
                    style={{ width: "15px", height: "15px" }}
                    strokeWidth={active ? 2.5 : 1.75}
                  />
                  {hasBadge && (
                    <span className="absolute -right-1 -top-1 hidden h-2 w-2 rounded-full md:block lg:hidden" style={{ backgroundColor: sidebarAccentColor }} />
                  )}
                </div>
                <span className={cn("flex-1", collapsed && "md:hidden")}>{label}</span>
                {hasBadge && (
                  <span
                    className={cn(
                      "flex-shrink-0 items-center justify-center rounded-full font-semibold text-white",
                      collapsed ? "md:hidden" : "md:flex",
                    )}
                    style={{
                      backgroundColor: sidebarAccentColor,
                      fontSize: "10px",
                      minWidth: "18px",
                      height: "18px",
                      padding: "0 4px",
                    }}
                  >
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </Link>
            );
          })
        )}
      </nav>

      <div className="h-3 flex-shrink-0 border-t border-white/10" />
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  Calendar,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MessageSquare,
  Newspaper,
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
  { href: "/assignments", icon: ClipboardList, label: "Opdrachten", permission: "assignments:read" },
  { href: "/quotes", icon: FileCheck2, label: "Offertes", permission: "quotes:read" },
  { href: "/customers", icon: Users, label: "Klanten", permission: "customers:read" },
  { href: "/objects", icon: Building2, label: "Objecten", permission: "objects:read" },
  { href: "/personnel", icon: UserCog, label: "Personeel", permission: "personnel:read" },
  { href: "/personnel/verlof", icon: CalendarClock, label: "Verlof-inbox", permission: "personnel:read" },
  { href: "/reports", icon: BarChart3, label: "Rapporten", permission: "reports:read" },
  { href: "/invoices", icon: FileText, label: "Facturen", permission: "invoices:read" },
  { href: "/documents", icon: FolderOpen, label: "Documenten", permission: "documents:read" },
  { href: "/tickets", icon: MessageSquare, label: "Tickets", permission: "tickets:read" },
  { href: "/news", icon: Newspaper, label: "Nieuws", permission: "news:read" },
  { href: "/settings", icon: Settings, label: "Instellingen", permission: "settings:read" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/settings") {
    return pathname.startsWith("/settings") || pathname.startsWith("/instellingen");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarProps {
  pendingReportsCount?: number;
  outstandingInvoicesCount?: number;
  pendingQuotesCount?: number;
  pendingLeaveCount?: number;
}

export function Sidebar({
  pendingReportsCount = 0,
  outstandingInvoicesCount = 0,
  pendingQuotesCount = 0,
  pendingLeaveCount = 0,
}: SidebarProps) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const { open, close } = useSidebar();
  const visibleItems = NAV_ITEMS.filter((item) => permissions.has(item.permission));

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[240px] select-none flex-col transition-transform duration-300 ease-in-out",
        "md:static md:h-full md:w-[60px] md:flex-shrink-0 md:translate-x-0 md:transition-none",
        "lg:w-[240px]",
        open ? "translate-x-0" : "-translate-x-full",
      )}
      style={{ backgroundColor: "#081D3A" }}
    >
      <div className="flex h-16 flex-shrink-0 items-center border-b border-white/10 px-5 md:justify-center md:px-0 lg:justify-start lg:px-6">
        <button
          type="button"
          onClick={close}
          className="mr-auto rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none md:hidden"
          aria-label="Navigatie sluiten"
        >
          <X size={18} strokeWidth={1.75} />
        </button>

        <div className="flex flex-col leading-none md:hidden lg:flex">
          <span
            className="font-bold tracking-widest text-white"
            style={{ fontFamily: "var(--font-poppins), Poppins, sans-serif", fontSize: "15px" }}
          >
            VEELE
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

        <div
          className="hidden h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white md:flex lg:hidden"
          style={{ backgroundColor: "#00B7B3" }}
        >
          V
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
            const active = isActive(pathname, href);
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
                  "sidebar-link md:justify-center md:px-0 lg:justify-start lg:px-3",
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
                    <span className="absolute -right-1 -top-1 hidden h-2 w-2 rounded-full bg-[#00B7B3] md:block lg:hidden" />
                  )}
                </div>
                <span className="flex-1 md:hidden lg:inline">{label}</span>
                {hasBadge && (
                  <span
                    className="flex-shrink-0 items-center justify-center rounded-full font-semibold text-white md:hidden lg:flex"
                    style={{
                      backgroundColor: "#00B7B3",
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Users,
  Building2,
  UserCog,
  BarChart3,
  FileText,
  FolderOpen,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/providers/permissions-provider";
import { signOut } from "@/app/actions/auth";

const NAV_ITEMS = [
  { href: "/",            icon: LayoutDashboard, label: "Dashboard",   permission: "dashboard:read"   },
  { href: "/planning",    icon: Calendar,        label: "Planning",    permission: "planning:read"    },
  { href: "/assignments", icon: ClipboardList,   label: "Opdrachten",  permission: "assignments:read" },
  { href: "/customers",   icon: Users,           label: "Klanten",     permission: "customers:read"   },
  { href: "/objects",     icon: Building2,       label: "Objecten",    permission: "objects:read"     },
  { href: "/personnel",   icon: UserCog,         label: "Personeel",   permission: "personnel:read"   },
  { href: "/reports",     icon: BarChart3,       label: "Rapporten",   permission: "reports:read"     },
  { href: "/invoices",    icon: FileText,        label: "Facturen",    permission: "invoices:read"    },
  { href: "/documents",   icon: FolderOpen,      label: "Documenten",  permission: "documents:read"   },
  { href: "/settings",    icon: Settings,        label: "Instellingen",permission: "settings:read"    },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

interface SidebarProps {
  userEmail:                string;
  userInitial:              string;
  userRole:                 string;
  pendingReportsCount?:     number;
  outstandingInvoicesCount?: number;
}

export function Sidebar({
  userEmail,
  userInitial,
  userRole,
  pendingReportsCount = 0,
  outstandingInvoicesCount = 0,
}: SidebarProps) {
  const pathname    = usePathname();
  const permissions = usePermissions();

  const visibleItems = NAV_ITEMS.filter((item) => permissions.has(item.permission));

  return (
    <aside
      className="flex flex-col w-[240px] flex-shrink-0 h-full select-none"
      style={{ backgroundColor: "#081D3A" }}
    >
      {/* ── Brand ── */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-white/10 flex-shrink-0">
        <div className="flex flex-col leading-none">
          <span
            className="text-white font-bold tracking-widest"
            style={{ fontFamily: "var(--font-poppins), Poppins, sans-serif", fontSize: "15px" }}
          >
            VEELE
          </span>
          <span
            className="uppercase tracking-[0.22em]"
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              fontSize: "9px",
              color: "#44D6D1",
              marginTop: "2px",
            }}
          >
            Services
          </span>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {visibleItems.length === 0 ? (
          <p
            className="px-3 py-4 text-center"
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
            const active  = isActive(pathname, href);
            const hasBadge =
              (href === "/reports"  && pendingReportsCount > 0) ||
              (href === "/invoices" && outstandingInvoicesCount > 0);
            const badgeCount =
              href === "/reports"  ? pendingReportsCount :
              href === "/invoices" ? outstandingInvoicesCount : 0;
            return (
              <Link
                key={href}
                href={href}
                className={cn("sidebar-link", active && "active")}
              >
                <Icon
                  className="flex-shrink-0"
                  style={{ width: "15px", height: "15px" }}
                  strokeWidth={active ? 2.5 : 1.75}
                />
                <span className="flex-1">{label}</span>
                {hasBadge && (
                  <span
                    className="flex-shrink-0 rounded-full flex items-center justify-center text-white font-semibold"
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

      {/* ── User footer ── */}
      <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{ width: "32px", height: "32px", backgroundColor: "#133D6B" }}
          >
            <span
              className="text-white font-semibold"
              style={{ fontFamily: "var(--font-inter), Inter, sans-serif", fontSize: "11px" }}
            >
              {userInitial}
            </span>
          </div>

          <div className="flex flex-col overflow-hidden flex-1 min-w-0">
            <span
              className="text-white font-medium truncate"
              style={{ fontFamily: "var(--font-inter), Inter, sans-serif", fontSize: "12px" }}
            >
              {userEmail}
            </span>
            <span
              className="truncate"
              style={{
                fontFamily: "var(--font-inter), Inter, sans-serif",
                fontSize: "10px",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              {userRole}
            </span>
          </div>

          {/* Logout */}
          <form action={signOut}>
            <button
              type="submit"
              title="Uitloggen"
              className="flex-shrink-0 rounded p-1 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            >
              <LogOut
                style={{ width: "14px", height: "14px", color: "rgba(255,255,255,0.45)" }}
                strokeWidth={1.75}
              />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

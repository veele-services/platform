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
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/",            icon: LayoutDashboard, label: "Dashboard"   },
  { href: "/planning",    icon: Calendar,        label: "Planning"    },
  { href: "/assignments", icon: ClipboardList,   label: "Assignments" },
  { href: "/customers",   icon: Users,           label: "Customers"   },
  { href: "/objects",     icon: Building2,       label: "Objects"     },
  { href: "/personnel",   icon: UserCog,         label: "Personnel"   },
  { href: "/reports",     icon: BarChart3,       label: "Reports"     },
  { href: "/invoices",    icon: FileText,        label: "Invoices"    },
  { href: "/documents",   icon: FolderOpen,      label: "Documents"   },
  { href: "/settings",    icon: Settings,        label: "Settings"    },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname();

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
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "sidebar-link",
                active && "active"
              )}
            >
              <Icon
                className="flex-shrink-0"
                style={{ width: "15px", height: "15px" }}
                strokeWidth={active ? 2.5 : 1.75}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── User avatar ── */}
      <div
        className="px-4 py-4 border-t border-white/10 flex-shrink-0"
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{
              width: "32px",
              height: "32px",
              backgroundColor: "#133D6B",
            }}
          >
            <span
              className="text-white font-semibold"
              style={{ fontFamily: "var(--font-inter), Inter, sans-serif", fontSize: "11px" }}
            >
              A
            </span>
          </div>
          <div className="flex flex-col overflow-hidden">
            <span
              className="text-white font-medium truncate"
              style={{ fontFamily: "var(--font-inter), Inter, sans-serif", fontSize: "12px" }}
            >
              Admin
            </span>
            <span
              className="truncate"
              style={{
                fontFamily: "var(--font-inter), Inter, sans-serif",
                fontSize: "10px",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              Management
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ClipboardList,
  ClipboardCheck,
  Clock,
  Calendar,
  Plane,
  FolderOpen,
  LogOut,
} from "lucide-react";
import { signOut } from "@/actions/auth";

const NAV_ITEMS = [
  { href: "/",                label: "Home",        Icon: Home },
  { href: "/opdrachten",      label: "Opdrachten",  Icon: ClipboardList },
  { href: "/openstaand",      label: "Openstaand",  Icon: ClipboardCheck },
  { href: "/uren",            label: "Uren",        Icon: Clock },
  { href: "/beschikbaarheid", label: "Beschikbaar", Icon: Calendar },
  { href: "/verlof",          label: "Verlof",      Icon: Plane },
  { href: "/documenten",      label: "Documenten",  Icon: FolderOpen },
];

export function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex w-60 shrink-0 flex-col h-screen sticky top-0 border-r"
      style={{ backgroundColor: "#FFFFFF", borderColor: "#E2E8F0" }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-5 py-5 border-b"
        style={{ borderColor: "#E2E8F0" }}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
          style={{ backgroundColor: "#00B7B3" }}
        >
          V
        </div>
        <div>
          <p className="text-sm font-bold leading-tight" style={{ color: "#081D3A" }}>Veele</p>
          <p className="text-xs leading-tight" style={{ color: "#64748B" }}>
            Personeelsportaal
          </p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: isActive ? "rgba(0,183,179,0.12)" : "transparent",
                color: isActive ? "#00B7B3" : "#475569",
              }}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer / logout */}
      <div
        className="px-3 py-4 border-t"
        style={{ borderColor: "#E2E8F0" }}
      >
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
            style={{ color: "#475569" }}
          >
            <LogOut size={18} strokeWidth={1.75} />
            Uitloggen
          </button>
        </form>
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  FileCheck2,
  Receipt,
  FolderOpen,
  LogOut,
} from "lucide-react";
import { signOut } from "@/actions/auth";

const NAV_ITEMS = [
  { href: "/klant",            label: "Dashboard",  Icon: LayoutDashboard },
  { href: "/klant/opdrachten", label: "Opdrachten", Icon: ClipboardList },
  { href: "/klant/rapporten",  label: "Rapporten",  Icon: FileCheck2 },
  { href: "/klant/facturen",   label: "Facturen",   Icon: Receipt },
  { href: "/klant/documenten", label: "Documenten", Icon: FolderOpen },
];

export function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex w-60 shrink-0 flex-col h-screen sticky top-0 bg-white"
      style={{ borderRight: "1px solid var(--color-border)", zIndex: 40 }}
    >
      {/* Logo / branding */}
      <div
        className="flex items-center gap-3 px-5 py-5 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          V
        </div>
        <div>
          <p className="text-sm font-bold leading-tight" style={{ color: "var(--color-primary)" }}>
            Veele
          </p>
          <p className="text-xs leading-tight" style={{ color: "var(--color-secondary)" }}>
            Klantportaal
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive =
            href === "/klant"
              ? pathname === "/klant" || pathname === "/klant/"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: isActive ? "rgba(0,183,179,0.12)" : "transparent",
                color:           isActive ? "var(--color-teal)" : "var(--color-secondary)",
              }}
            >
              {/* Left accent bar */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                  style={{
                    width:           "3px",
                    height:          "18px",
                    backgroundColor: "var(--color-teal)",
                  }}
                />
              )}
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.75} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer / logout */}
      <div
        className="px-3 py-4 border-t"
        style={{ borderColor: "var(--color-border)" }}
      >
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-slate-50"
            style={{ color: "var(--color-secondary)" }}
          >
            <LogOut size={18} strokeWidth={1.75} />
            Uitloggen
          </button>
        </form>
      </div>
    </aside>
  );
}

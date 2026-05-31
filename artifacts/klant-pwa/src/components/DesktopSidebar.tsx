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
      className="hidden md:flex w-60 shrink-0 flex-col h-screen sticky top-0"
      style={{ backgroundColor: "#081D3A" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
          style={{ backgroundColor: "#00B7B3" }}
        >
          V
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">Veele</p>
          <p className="text-xs leading-tight" style={{ color: "#94A3B8" }}>Klantportaal</p>
        </div>
      </div>

      {/* Nav items */}
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
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: isActive ? "rgba(0,183,179,0.15)" : "transparent",
                color: isActive ? "#00B7B3" : "#94A3B8",
              }}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer / logout */}
      <div className="px-3 py-4 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
            style={{ color: "#94A3B8" }}
          >
            <LogOut size={18} strokeWidth={1.75} />
            Uitloggen
          </button>
        </form>
      </div>
    </aside>
  );
}

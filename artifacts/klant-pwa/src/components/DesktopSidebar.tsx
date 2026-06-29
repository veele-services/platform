"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  CalendarDays,
  FileCheck2,
  FileText,
  Headphones,
  Home,
  LogOut,
  Receipt,
  Send,
  Settings,
  WalletCards,
} from "lucide-react";
import { signOut } from "@/actions/auth";
import { VeeleLogo } from "./MobileHeader";

const NAV_ITEMS = [
  { href: "/",                    label: "Dashboard",    Icon: Home },
  { href: "/objecten",            label: "Mijn objecten", Icon: Building2 },
  { href: "/opdrachten/aanvragen", label: "Aanvragen",    Icon: Send },
  { href: "/rapporten",           label: "Rapportages",  Icon: FileCheck2 },
  { href: "/facturen",            label: "Facturen",     Icon: Receipt },
  { href: "/betalingen",          label: "Betalingen",   Icon: WalletCards },
  { href: "/opdrachten",          label: "Afspraken",    Icon: CalendarDays },
  { href: "/meldingen",           label: "Meldingen",    Icon: Bell },
  { href: "/documenten",          label: "Documenten",   Icon: FileText },
];

export function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden h-screen w-[260px] shrink-0 flex-col md:flex"
      style={{
        background: "linear-gradient(180deg, #06224A 0%, #061F44 100%)",
        color:      "white",
      }}
    >
      <div className="px-6 pb-5 pt-7">
        <VeeleLogo />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-2">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition"
              style={{
                backgroundColor: isActive ? "rgba(0,183,179,0.18)" : "transparent",
                color:           isActive ? "#FFFFFF" : "rgba(255,255,255,0.72)",
              }}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.85} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-white/10 px-4 py-5">
        <Link
          href="/meer"
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-white/70"
        >
          <Headphones size={18} />
          Hulp & contact
        </Link>
        <Link
          href="/instellingen"
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-white/70"
        >
          <Settings size={18} />
          Instellingen
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-white/70"
          >
            <LogOut size={18} />
            Uitloggen
          </button>
        </form>
      </div>
    </aside>
  );
}

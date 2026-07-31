"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  Clock,
  MessageSquare,
  Menu,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/",           icon: Home,         label: "Home",     match: ["/"] },
  { href: "/uren",       icon: Clock,        label: "Uren",     match: ["/uren"] },
  { href: "/opdrachten", icon: CalendarDays, label: "Planning", match: ["/opdrachten", "/openstaand"] },
  { href: "/berichten",  icon: MessageSquare, label: "Inbox", match: ["/berichten", "/meldingen"] },
  { href: "/meer",       icon: Menu,         label: "Meer",     match: ["/meer", "/instellingen", "/profiel", "/beveiliging", "/documenten", "/verlof", "/beschikbaarheid", "/nieuws", "/help", "/releases"] },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div
        className="mx-2.5 mb-[calc(0.45rem+var(--safe-bottom))] flex items-stretch rounded-2xl bg-[var(--color-primary)] px-1.5 py-1 shadow-xl"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = item.match.some((path) =>
            path === "/" ? pathname === "/" : pathname.startsWith(path),
          );
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-colors"
              style={{ color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.62)" }}
            >
              <span
                className="relative flex items-center justify-center rounded-2xl transition-all"
                style={{
                  width:           "38px",
                  height:          "25px",
                  backgroundColor: isActive ? "rgba(255,255,255,0.12)" : "transparent",
                }}
              >
                <Icon
                  size={18}
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
              </span>

              <span
                className="font-semibold leading-none"
                style={{ fontSize: "9.5px", color: isActive ? "var(--color-accent)" : "rgba(255,255,255,0.72)" }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

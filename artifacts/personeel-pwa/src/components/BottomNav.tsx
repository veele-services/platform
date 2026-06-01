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
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/",                icon: Home,           label: "Home"       },
  { href: "/opdrachten",      icon: ClipboardList,  label: "Opdrachten" },
  { href: "/openstaand",      icon: ClipboardCheck, label: "Openstaand" },
  { href: "/uren",            icon: Clock,          label: "Uren"       },
  { href: "/beschikbaarheid", icon: Calendar,       label: "Beschikbaar"},
  { href: "/verlof",          icon: Plane,          label: "Verlof"     },
  { href: "/documenten",      icon: FolderOpen,     label: "Documenten" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 border-t bg-white"
      style={{
        borderColor:   "var(--color-border)",
        paddingBottom: "var(--safe-bottom)",
        boxShadow:     "0 -1px 8px rgba(8,29,58,0.06)",
        zIndex:        50,
      }}
    >
      <div className="flex items-stretch">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors"
              style={{ color: isActive ? "var(--color-accent)" : "var(--color-secondary)" }}
            >
              {/* Active indicator line at top */}
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-full"
                  style={{
                    width:           "28px",
                    height:          "3px",
                    backgroundColor: "var(--color-accent)",
                  }}
                />
              )}

              {/* Icon with filled-look background when active */}
              <span
                className="flex items-center justify-center rounded-xl transition-all"
                style={{
                  width:           "36px",
                  height:          "28px",
                  backgroundColor: isActive ? "rgba(0,183,179,0.12)" : "transparent",
                }}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
              </span>

              <span
                className="font-medium leading-none"
                style={{ fontSize: "10px" }}
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

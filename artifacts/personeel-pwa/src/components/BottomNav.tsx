"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardList, Calendar, Plane, User } from "lucide-react";

const NAV_ITEMS = [
  { href: "/",               icon: Home,          label: "Home" },
  { href: "/opdrachten",     icon: ClipboardList, label: "Opdrachten" },
  { href: "/beschikbaarheid",icon: Calendar,      label: "Beschikbaar" },
  { href: "/verlof",         icon: Plane,         label: "Verlof" },
  { href: "/profiel",        icon: User,          label: "Profiel" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 border-t bg-white"
      style={{
        borderColor: "var(--color-border)",
        paddingBottom: "var(--safe-bottom)",
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
              className="flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors"
              style={{
                color: isActive ? "var(--color-accent)" : "var(--color-secondary)",
              }}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.75} />
              <span
                className="text-[10px] font-medium leading-none"
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

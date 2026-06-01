"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, FileCheck2, Receipt, FolderOpen } from "lucide-react";

const ITEMS = [
  { href: "/klant",            label: "Dashboard",  Icon: LayoutDashboard },
  { href: "/klant/opdrachten", label: "Opdrachten", Icon: ClipboardList },
  { href: "/klant/rapporten",  label: "Rapporten",  Icon: FileCheck2 },
  { href: "/klant/facturen",   label: "Facturen",   Icon: Receipt },
  { href: "/klant/documenten", label: "Documenten", Icon: FolderOpen },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 border-t bg-white"
      style={{
        borderColor:   "var(--color-border)",
        paddingBottom: "var(--safe-bottom)",
        height:        "calc(4rem + var(--safe-bottom))",
        boxShadow:     "0 -1px 8px rgba(8,29,58,0.06)",
        zIndex:        50,
      }}
    >
      <div className="flex h-16 items-stretch">
        {ITEMS.map(({ href, label, Icon }) => {
          const isActive =
            href === "/klant"
              ? pathname === "/klant" || pathname === "/klant/"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 pt-2 text-xs font-medium transition-colors"
              style={{ color: isActive ? "var(--color-accent)" : "var(--color-secondary)" }}
            >
              {/* Active top indicator */}
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

              {/* Icon with subtle active bg */}
              <span
                className="flex items-center justify-center rounded-xl transition-all"
                style={{
                  width:           "36px",
                  height:          "28px",
                  backgroundColor: isActive ? "var(--color-accent-muted)" : "transparent",
                }}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.75} />
              </span>

              <span style={{ fontSize: "10px" }}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

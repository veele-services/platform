"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, FileText, Receipt, FolderOpen } from "lucide-react";

const ITEMS = [
  { href: "/klant",            label: "Dashboard",  Icon: LayoutDashboard },
  { href: "/klant/opdrachten", label: "Opdrachten", Icon: ClipboardList },
  { href: "/klant/offertes",   label: "Offertes",   Icon: FileText },
  { href: "/klant/facturen",   label: "Facturen",   Icon: Receipt },
  { href: "/klant/documenten", label: "Documenten", Icon: FolderOpen },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex items-stretch border-t bg-white"
      style={{
        borderColor: "var(--color-border)",
        paddingBottom: "var(--safe-bottom)",
        height: "calc(4rem + var(--safe-bottom))",
        zIndex: 50,
      }}
    >
      {ITEMS.map(({ href, label, Icon }) => {
        const isActive =
          href === "/klant"
            ? pathname === "/klant" || pathname === "/klant/"
            : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 pt-2 text-xs font-medium transition-colors"
            style={{ color: isActive ? "var(--color-accent)" : "var(--color-secondary)" }}
          >
            <Icon size={20} strokeWidth={isActive ? 2.5 : 1.75} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

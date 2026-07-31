"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/financieel", label: "Overzicht" },
  { href: "/facturen", label: "Facturen" },
  { href: "/offertes", label: "Offertes" },
  { href: "/betalingen", label: "Betalingen" },
] as const;

export function FinanceNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Financieel"
      className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1"
      style={{ borderColor: "var(--color-border)" }}
    >
      {ITEMS.map((item) => {
        const active =
          item.href === "/financieel"
            ? pathname === item.href
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors"
            style={{
              backgroundColor: active
                ? "color-mix(in srgb, var(--color-accent) 10%, white)"
                : "transparent",
              color: active
                ? "var(--color-accent-accessible)"
                : "var(--color-secondary)",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

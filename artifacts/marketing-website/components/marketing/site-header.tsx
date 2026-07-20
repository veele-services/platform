"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Logo } from "./logo";
import { navigation } from "@/lib/site";
import { Button } from "@/components/ui/button";

const utilityLinks = [
  { label: "Werken bij", href: "/werken-bij" },
  { label: "Contact", href: "/contact" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [open]);

  const isCurrent = (href: string) => href === "/" ? pathname === href : pathname.startsWith(href);

  return (
    <header className="absolute inset-x-0 top-0 z-50 border-b border-white/10 bg-[var(--navy-950)]/45 text-white backdrop-blur-md">
      <div className="container-shell flex h-[5.25rem] items-center justify-between gap-6">
        <Logo />
        <nav className="hidden items-center gap-5 xl:flex" aria-label="Hoofdnavigatie">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(item.href) ? "page" : undefined}
              className="relative py-3 text-[13px] font-semibold text-white/72 transition-colors hover:text-white after:absolute after:inset-x-0 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-[var(--aqua)] after:transition-transform hover:after:scale-x-100 aria-[current=page]:text-white aria-[current=page]:after:scale-x-100"
            >
              {item.label}
            </Link>
          ))}
          {utilityLinks.map((item) => (
            <Link key={item.href} href={item.href} className="py-3 text-[13px] font-semibold text-white/72 transition-colors hover:text-white">
              {item.label}
            </Link>
          ))}
          <Button asChild size="sm">
            <Link href="/offerte">Offerte aanvragen<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
          </Button>
        </nav>
        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-xl border border-white/15 bg-white/[.06] text-white transition-colors hover:bg-white/[.12] xl:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? "Menu sluiten" : "Menu openen"}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      <div
        id={menuId}
        className={`absolute inset-x-0 top-full h-[calc(100dvh-5.25rem)] overflow-y-auto border-t border-white/10 bg-[var(--navy-950)]/98 transition-[opacity,visibility] duration-200 xl:hidden ${open ? "visible opacity-100" : "invisible opacity-0"}`}
      >
        <nav className="container-shell flex flex-col py-5" aria-label="Mobiele navigatie">
          {[...navigation, ...utilityLinks].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(item.href) ? "page" : undefined}
              className="flex min-h-12 items-center justify-between border-b border-white/10 px-1 py-3 text-base font-semibold text-white/78 transition-colors hover:text-white aria-[current=page]:text-brand-aqua"
            >
              {item.label}<ArrowUpRight aria-hidden="true" className="size-4 opacity-45" />
            </Link>
          ))}
          <Button asChild size="lg" className="mt-6 w-full">
            <Link href="/offerte">Offerte aanvragen<ArrowUpRight aria-hidden="true" className="size-4" /></Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

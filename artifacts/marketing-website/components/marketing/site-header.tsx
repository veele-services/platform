"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
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
    <header className="absolute inset-x-0 top-0 z-50 border-b border-white/10 bg-[var(--navy-950)]/72 text-white shadow-[0_1px_0_rgba(255,255,255,.025)] backdrop-blur-xl">
      <div className="container-shell flex h-[5.25rem] items-center justify-between gap-6">
        <Logo priority />
        <nav className="hidden items-center gap-1 xl:flex" aria-label="Hoofdnavigatie">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(item.href) ? "page" : undefined}
              className="relative rounded-lg px-2.5 py-2 text-[13px] font-semibold text-white/68 transition-colors hover:bg-white/[.055] hover:text-white after:absolute after:inset-x-3 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-[var(--aqua)] after:transition-transform hover:after:scale-x-100 aria-[current=page]:bg-white/[.055] aria-[current=page]:text-white aria-[current=page]:after:scale-x-100"
            >
              {item.label}
            </Link>
          ))}
          <span aria-hidden="true" className="mx-2 h-5 w-px bg-white/14" />
          {utilityLinks.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg px-2.5 py-2 text-[13px] font-semibold text-white/68 transition-colors hover:bg-white/[.055] hover:text-white">
              {item.label}
            </Link>
          ))}
          <Button asChild size="sm">
            <Link href="/offerte">Offerte aanvragen<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
          </Button>
        </nav>
        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-xl border border-white/15 bg-white/[.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.08)] transition-colors hover:bg-white/[.14] xl:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? "Menu sluiten" : "Menu openen"}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <div id={menuId} className="absolute inset-x-0 top-full h-[calc(100dvh-5.25rem)] overflow-y-auto border-t border-white/10 bg-[var(--navy-950)]/98 shadow-2xl xl:hidden">
          <nav className="container-shell flex min-h-full flex-col py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" aria-label="Mobiele navigatie">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[.18em] text-white/42">Navigatie</p>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.035]">
              {[...navigation, ...utilityLinks].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isCurrent(item.href) ? "page" : undefined}
                  className="group flex min-h-14 items-center justify-between border-b border-white/10 px-4 py-3.5 text-[15px] font-semibold text-white/76 transition-colors last:border-0 hover:bg-white/[.06] hover:text-white aria-[current=page]:bg-[var(--aqua)]/10 aria-[current=page]:text-brand-aqua"
                >
                  {item.label}<ArrowRight aria-hidden="true" className="size-4 opacity-35 transition-transform group-hover:translate-x-0.5 group-hover:opacity-80" />
                </Link>
              ))}
            </div>
            <Button asChild size="lg" className="mt-5 w-full">
              <Link href="/offerte">Offerte aanvragen<ArrowUpRight aria-hidden="true" className="size-4" /></Link>
            </Button>
            <p className="mt-auto pt-7 text-center text-xs leading-5 text-white/40">Schoonmaak, beveiliging en facilitair vanuit Den Haag.</p>
          </nav>
        </div>
      )}
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ChevronDown, LogOut, MessageSquare, Settings, UserCircle } from "lucide-react";
import { signOut } from "@/actions/auth";

export function VeeleLogo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Veele Services home">
      <span className="relative flex h-8 w-8 items-center justify-center">
        <span
          className="absolute h-8 w-2 -rotate-[24deg] rounded-full"
          style={{ backgroundColor: "#00B7B3" }}
        />
        <span className="absolute h-8 w-2 rotate-[24deg] rounded-full bg-white" />
      </span>
      <span className="leading-none">
        <span className="block text-[16px] font-black tracking-[0.22em] text-white">
          VEELE
        </span>
        <span
          className="mt-1 block text-[7px] font-bold tracking-[0.42em]"
          style={{ color: "#BFECEA" }}
        >
          SERVICES
        </span>
      </span>
    </Link>
  );
}

export function MobileHeaderActions() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg active:scale-95"
        style={{ backgroundColor: "rgba(255,255,255,0.11)" }}
        aria-label="Meldingen"
      >
        <Bell size={18} strokeWidth={2.15} />
      </button>

      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg active:scale-95"
        style={{ backgroundColor: "rgba(255,255,255,0.11)" }}
        aria-label="Berichten"
      >
        <MessageSquare size={18} strokeWidth={2.15} />
      </button>

      <div className="relative">
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-full bg-white px-1.5 text-[#061F44] shadow-lg active:scale-95"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label="Profielmenu"
          onClick={() => setIsOpen((value) => !value)}
        >
          <UserCircle size={25} strokeWidth={2.5} />
          <ChevronDown
            size={14}
            strokeWidth={2.4}
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isOpen ? (
          <div
            className="absolute right-0 top-11 w-48 overflow-hidden rounded-2xl border bg-white py-1.5 text-sm shadow-2xl"
            role="menu"
            style={{ borderColor: "var(--color-border)", boxShadow: "0 18px 42px rgba(8,29,58,0.22)" }}
          >
            <Link
              href="/profiel"
              className="flex items-center gap-2.5 px-3.5 py-2.5 font-bold"
              role="menuitem"
              style={{ color: "var(--color-primary)" }}
            >
              <UserCircle size={17} strokeWidth={2.3} />
              Profiel
            </Link>
            <Link
              href="/meer"
              className="flex items-center gap-2.5 px-3.5 py-2.5 font-bold"
              role="menuitem"
              style={{ color: "var(--color-primary)" }}
            >
              <Settings size={17} strokeWidth={2.3} />
              Instellingen
            </Link>
            <div className="my-1 border-t" style={{ borderColor: "var(--color-border)" }} />
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left font-bold"
                role="menuitem"
                style={{ color: "var(--color-destructive)" }}
              >
                <LogOut size={17} strokeWidth={2.3} />
                Uitloggen
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MobileHeader() {
  const pathname = usePathname();
  const isAssignmentDetail = /^\/opdrachten\/[^/]+/.test(pathname);

  if (isAssignmentDetail) return null;

  return (
    <header
      className="sticky top-0 z-40 md:hidden"
      style={{ background: "linear-gradient(180deg, #06224A 0%, #061F44 100%)" }}
    >
      <div className="flex items-center justify-between px-4 pb-3 pt-[calc(0.7rem+var(--safe-top))]">
        <VeeleLogo />
        <MobileHeaderActions />
      </div>
    </header>
  );
}

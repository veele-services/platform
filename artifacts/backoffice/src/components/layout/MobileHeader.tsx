"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "@/providers/sidebar-provider";

export function MobileHeader() {
  const { toggle } = useSidebar();

  return (
    <header
      className="sticky top-0 z-40 flex h-14 flex-shrink-0 items-center gap-3 border-b px-4 lg:hidden"
      style={{ backgroundColor: "#081D3A", borderColor: "rgba(255,255,255,0.1)" }}
    >
      <button
        type="button"
        onClick={toggle}
        className="rounded p-1.5 transition-colors hover:bg-white/10 focus-visible:outline-none"
        aria-label="Navigatie openen"
        style={{ color: "rgba(255,255,255,0.75)" }}
      >
        <Menu size={20} strokeWidth={1.75} />
      </button>

      <div className="flex flex-col leading-none">
        <span
          className="font-bold tracking-widest text-white"
          style={{
            fontFamily: "var(--font-poppins), Poppins, sans-serif",
            fontSize:   "14px",
          }}
        >
          VEELE
        </span>
        <span
          style={{
            fontFamily:    "var(--font-inter), Inter, sans-serif",
            fontSize:      "8px",
            color:         "#44D6D1",
            marginTop:     "1px",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}
        >
          Services
        </span>
      </div>
    </header>
  );
}

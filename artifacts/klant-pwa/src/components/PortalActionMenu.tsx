"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

export function PortalActionMenu({
  label = "Acties",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative inline-flex justify-end">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white shadow-sm transition-colors hover:bg-slate-50"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-primary)",
        }}
      >
        <MoreHorizontal size={17} />
        <span className="sr-only">{label}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-30 min-w-44 rounded-2xl border bg-white p-2 text-left shadow-xl"
          style={{ borderColor: "var(--color-border)" }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

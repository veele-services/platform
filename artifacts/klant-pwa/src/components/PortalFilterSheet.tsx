"use client";

import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";

export function PortalFilterSheet({
  title = "Filters",
  description,
  activeCount = 0,
  triggerLabel = "Filters",
  children,
}: {
  title?: string;
  description?: string;
  activeCount?: number;
  triggerLabel?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border bg-white px-3 text-sm font-black shadow-sm transition-colors hover:bg-slate-50"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-primary)",
        }}
      >
        <SlidersHorizontal size={16} />
        {triggerLabel}
        {activeCount > 0 ? (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-black text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Filters sluiten"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute bottom-0 right-0 flex max-h-[86vh] w-full flex-col rounded-t-[24px] bg-white shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:w-[390px] md:rounded-l-[24px] md:rounded-t-none"
          >
            <header
              className="flex items-start justify-between gap-4 border-b px-5 py-4"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="text-lg font-black"
                  style={{ color: "var(--color-primary)" }}
                >
                  {title}
                </h2>
                {description ? (
                  <p
                    className="mt-1 text-sm font-semibold leading-5"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-primary)",
                }}
              >
                <X size={17} />
                <span className="sr-only">Sluiten</span>
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

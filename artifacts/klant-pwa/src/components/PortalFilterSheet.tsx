"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@workspace/shared-ui";
import { SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";

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
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium transition-colors hover:bg-slate-50 motion-reduce:transition-none sm:hidden"
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
              {activeCount > 99 ? "99+" : activeCount}
            </span>
          ) : null}
        </button>
      </DialogTrigger>
      <DialogContent className="right-0 left-auto max-h-[86dvh] translate-x-0 rounded-t-3xl p-0 md:top-0 md:bottom-0 md:h-dvh md:max-h-none md:w-[390px] md:max-w-[calc(100vw-1rem)] md:translate-y-0 md:rounded-none md:rounded-l-3xl">
        <header
          className="flex items-start justify-between gap-4 border-b px-5 py-4"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="min-w-0">
            <DialogTitle
              className="text-lg font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription
                className="mt-1 text-sm font-semibold leading-5"
                style={{ color: "var(--color-secondary)" }}
              >
                {description}
              </DialogDescription>
            ) : null}
          </div>
          <DialogClose asChild>
            <button
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-primary)",
              }}
            >
              <X size={17} />
              <span className="sr-only">Sluiten</span>
            </button>
          </DialogClose>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

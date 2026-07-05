"use client";

import { useId, useState, useTransition } from "react";
import type { ReactNode } from "react";

export function PortalConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Bevestigen",
  cancelLabel = "Annuleren",
  destructive = false,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const titleId = useId();
  const descriptionId = useId();

  function confirm() {
    startTransition(async () => {
      await onConfirm();
      setOpen(false);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="contents">
        {trigger}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center px-4">
          <button
            type="button"
            aria-label="Dialoog sluiten"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setOpen(false)}
          />
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="relative w-full max-w-md rounded-2xl border bg-white p-5 shadow-2xl"
            style={{ borderColor: "var(--color-border)" }}
          >
            <h2
              id={titleId}
              className="text-lg font-black"
              style={{ color: "var(--color-primary)" }}
            >
              {title}
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-sm font-semibold leading-6"
              style={{ color: "var(--color-secondary)" }}
            >
              {description}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-black disabled:opacity-60"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-primary)",
                }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-black text-white disabled:opacity-60"
                style={{
                  backgroundColor: destructive
                    ? "var(--color-destructive)"
                    : "var(--color-accent)",
                }}
              >
                {pending ? "Bezig..." : confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

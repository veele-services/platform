"use client";

import { useEffect, useId, useRef } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

type PersonnelConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "accent" | "danger";
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function PersonnelConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Annuleren",
  tone = "accent",
  pending = false,
  onConfirm,
  onClose,
}: PersonnelConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousActiveElement = document.activeElement;
    const focusTimer = window.setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus();
      }
    };
  }, [open, pending, onClose]);

  if (!open) return null;

  const isDanger = tone === "danger";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[#061F44]/35 px-4 pb-[calc(1rem+var(--safe-bottom))] pt-6 backdrop-blur-sm sm:items-center sm:pb-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-2xl outline-none"
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: isDanger ? "#FEF2F2" : "#E8FBFA",
              color: isDanger ? "#DC2626" : "var(--color-accent)",
            }}
          >
            <AlertTriangle size={20} strokeWidth={2.4} />
          </span>
          <div>
            <h2 id={titleId} className="text-[18px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
              {title}
            </h2>
            <p id={descriptionId} className="mt-2 text-[14px] leading-5" style={{ color: "var(--color-secondary)" }}>
              {description}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            className="rounded-2xl border px-4 py-3 text-[14px] font-black transition active:scale-[0.98] disabled:opacity-50"
            style={{
              borderColor: "#D7DDE8",
              backgroundColor: "#FFFFFF",
              color: "var(--color-secondary)",
            }}
            onClick={onClose}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-black text-white transition active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: isDanger ? "#DC2626" : "var(--color-accent)" }}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : null}
            {pending ? "Bezig..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

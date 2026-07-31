"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@workspace/shared-ui";
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
  const isDanger = tone === "danger";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) onClose();
      }}
    >
      <AlertDialogContent className="max-w-sm">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: isDanger ? "#FEF2F2" : "#E8FBFA",
              color: isDanger ? "#DC2626" : "var(--color-accent)",
            }}
          >
            <AlertTriangle size={20} strokeWidth={2.4} />
          </span>
          <div>
            <AlertDialogTitle
              className="text-base font-semibold leading-tight"
              style={{ color: "var(--color-primary)" }}
            >
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription
              className="mt-2 text-[14px] leading-5"
              style={{ color: "var(--color-secondary)" }}
            >
              {description}
            </AlertDialogDescription>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <AlertDialogCancel
            disabled={pending}
          className="min-h-11 rounded-xl border px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none"
            style={{
              borderColor: "#D7DDE8",
              backgroundColor: "#FFFFFF",
              color: "var(--color-secondary)",
            }}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={onConfirm}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none"
            style={{
              backgroundColor: isDanger ? "#DC2626" : "var(--color-accent)",
            }}
          >
            {pending ? (
              <Loader2
                size={16}
                className="animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {pending ? "Bezig..." : confirmLabel}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

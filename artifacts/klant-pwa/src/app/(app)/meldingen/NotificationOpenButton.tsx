"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function NotificationOpenButton({
  children,
  highlighted,
}: {
  children: ReactNode;
  highlighted: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="block min-h-11 w-full rounded-xl border bg-white p-3 text-left transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-65"
      style={{
        borderColor: highlighted ? "#FDE68A" : "var(--color-border)",
      }}
    >
      {children}
      {pending ? (
        <span className="sr-only" role="status">
          Melding openen…
        </span>
      ) : null}
    </button>
  );
}

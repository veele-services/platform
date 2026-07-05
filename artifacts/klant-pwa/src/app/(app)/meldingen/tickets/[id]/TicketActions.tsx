"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import {
  closeMyCustomerTicket,
  reopenMyCustomerTicket,
} from "@/actions/tickets";

export function TicketActions({
  ticketId,
  isClosed,
  variant = "light",
}: {
  ticketId: string;
  isClosed: boolean;
  variant?: "light" | "solid";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const className =
    variant === "solid"
      ? "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-white shadow-sm disabled:opacity-60"
      : "inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-2 text-xs font-black text-white shadow-lg disabled:opacity-60";

  function run() {
    startTransition(async () => {
      if (isClosed) {
        await reopenMyCustomerTicket(ticketId);
      } else {
        await closeMyCustomerTicket(ticketId);
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={run}
      className={className}
      style={variant === "solid" ? { backgroundColor: "var(--color-accent)" } : undefined}
    >
      {isClosed ? (
        <RotateCcw size={16} strokeWidth={2.4} />
      ) : (
        <CheckCircle2 size={16} strokeWidth={2.4} />
      )}
      {isClosed ? "Heropenen" : "Sluiten"}
    </button>
  );
}

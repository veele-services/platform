"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { closeMyTicket, reopenMyTicket } from "@/actions/messages";

export function TicketActions({
  ticketId,
  isClosed,
}: {
  ticketId: string;
  isClosed: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      if (isClosed) {
        await reopenMyTicket(ticketId);
      } else {
        await closeMyTicket(ticketId);
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={run}
      className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-2 text-xs font-semibold text-white shadow-lg disabled:opacity-60"
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

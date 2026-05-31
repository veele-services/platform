"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { approveQuote, rejectQuote } from "@/actions/assignments";
import { useRouter } from "next/navigation";

interface Props {
  assignmentId: string;
  title:        string;
}

export function OfferteActieButtons({ assignmentId, title }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done,  setDone]  = useState<"approved" | "rejected" | null>(null);
  const [pending, startTransition] = useTransition();

  if (done === "approved") {
    return (
      <div className="mt-3 flex items-center gap-1.5 text-xs font-medium" style={{ color: "#15803D" }}>
        <CheckCircle2 size={14} />
        Offerte goedgekeurd
      </div>
    );
  }

  if (done === "rejected") {
    return (
      <div className="mt-3 flex items-center gap-1.5 text-xs font-medium" style={{ color: "#DC2626" }}>
        <XCircle size={14} />
        Offerte afgewezen
      </div>
    );
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveQuote(assignmentId);
      if (result.success) {
        setDone("approved");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function handleReject() {
    if (!confirm(`Weet u zeker dat u de offerte voor "${title}" wilt afwijzen?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await rejectQuote(assignmentId);
      if (result.success) {
        setDone("rejected");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="mt-3">
      <div className="mb-2 rounded-lg px-3 py-2 text-xs font-medium" style={{ backgroundColor: "#FEF9C3", color: "#92400E" }}>
        Uw goedkeuring is vereist voor deze offerte.
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={pending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#16A34A" }}
        >
          <CheckCircle2 size={14} />
          Goedkeuren
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={pending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}
        >
          <XCircle size={14} />
          Afwijzen
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

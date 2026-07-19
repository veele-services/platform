"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { approveQuote, rejectQuote } from "@/actions/assignments";
import { useRouter } from "next/navigation";

interface Props {
  assignmentId: string;
  title:        string;
}

type Confirming = "approve" | "reject" | null;

export function OfferteActieButtons({ assignmentId, title }: Props) {
  const router = useRouter();
  const [error,        setError]        = useState<string | null>(null);
  const [done,         setDone]         = useState<"approved" | "rejected" | null>(null);
  const [confirming,   setConfirming]   = useState<Confirming>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [pending, startTransition]      = useTransition();

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
      <div className="mt-3 flex items-center gap-1.5 text-xs font-medium" style={{ color: "#B91C1C" }}>
        <XCircle size={14} />
        Offerte afgewezen
      </div>
    );
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result =
        confirming === "approve"
          ? await approveQuote(assignmentId)
          : await rejectQuote(assignmentId, rejectReason.trim() || undefined);

      if (result.success) {
        setDone(confirming === "approve" ? "approved" : "rejected");
        setConfirming(null);
        router.refresh();
      } else {
        setError(result.message);
        setConfirming(null);
      }
    });
  }

  if (confirming) {
    const isApprove = confirming === "approve";
    return (
      <div className="mt-3">
        <div
          className="rounded-xl p-3 mb-2"
          style={{
            backgroundColor: isApprove ? "#F0FDF4" : "#FEF2F2",
            border:          `1px solid ${isApprove ? "#BBF7D0" : "#FECACA"}`,
          }}
        >
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle
              size={15}
              className="mt-0.5 shrink-0"
              style={{ color: isApprove ? "#16A34A" : "#DC2626" }}
            />
            <p className="text-xs leading-relaxed" style={{ color: isApprove ? "#15803D" : "#991B1B" }}>
              {isApprove
                ? `Weet u zeker dat u de offerte voor "${title}" wilt goedkeuren? U gaat akkoord met het beschreven werk en bedrag.`
                : `Weet u zeker dat u de offerte voor "${title}" wilt afwijzen? We nemen contact met u op voor verdere afstemming.`}
            </p>
          </div>

          {!isApprove && (
            <div className="mb-3">
              <label
                htmlFor="rejectReason"
                className="block text-xs font-medium mb-1"
                style={{ color: "#991B1B" }}
              >
                Reden (optioneel)
              </label>
              <textarea
                id="rejectReason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Licht toe waarom u de offerte afwijst…"
                disabled={pending}
                className="w-full rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 disabled:opacity-50"
                style={{
                  backgroundColor: "#FFF",
                  border:          "1px solid #FECACA",
                  color:           "#1E293B",
                }}
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setConfirming(null); setRejectReason(""); }}
              disabled={pending}
              className="flex-1 inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-muted)",
                color:           "var(--color-secondary)",
              }}
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: isApprove ? "#15803D" : "#B91C1C" }}
            >
              {pending ? "Bezig…" : isApprove ? "Ja, goedkeuren" : "Ja, afwijzen"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div
        className="mb-2 rounded-lg px-3 py-2 text-xs font-medium"
        style={{ backgroundColor: "#FEF9C3", color: "#92400E" }}
      >
        Uw goedkeuring is vereist voor deze offerte.
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming("approve")}
          disabled={pending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#15803D" }}
        >
          <CheckCircle2 size={14} />
          Goedkeuren
        </button>
        <button
          type="button"
          onClick={() => setConfirming("reject")}
          disabled={pending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#FEE2E2", color: "#B91C1C" }}
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

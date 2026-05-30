"use client";

import { useState, useTransition } from "react";
import { Send, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { sendQuote, approveQuote, rejectQuote } from "@/app/actions/quotes";
import type { QuoteStatus } from "@/app/actions/quotes";
import { useRouter } from "next/navigation";

interface QuoteActionsProps {
  quoteId:     string;
  status:      QuoteStatus;
  isExpired:   boolean;
  canWrite:    boolean;
  canApprove:  boolean;
}

export function QuoteActions({ quoteId, status, isExpired, canWrite, canApprove }: QuoteActionsProps) {
  const router = useRouter();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason]         = useState("");
  const [error, setError]           = useState<string | null>(null);
  const [pending, startTransition]  = useTransition();

  function act(fn: () => Promise<{ success: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        setError(result.message ?? "Actie mislukt.");
      }
    });
  }

  const canSend    = canWrite   && status === "draft";
  const canAct     = canApprove && status === "sent" && !isExpired;

  if (!canSend && !canAct) return null;

  return (
    <div className="veele-card flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>
        Acties
      </p>

      {error && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm"
          style={{ backgroundColor: "#FEF2F2", color: "#B91C1C" }}
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Send */}
      {canSend && (
        <button
          onClick={() => act(() => sendQuote(quoteId))}
          disabled={pending}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#00B7B3" }}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Markeer als verzonden
        </button>
      )}

      {/* Approve */}
      {canAct && (
        <button
          onClick={() => act(() => approveQuote(quoteId))}
          disabled={pending}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#059669" }}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Goedkeuren
        </button>
      )}

      {/* Reject */}
      {canAct && !rejectOpen && (
        <button
          onClick={() => setRejectOpen(true)}
          disabled={pending}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#FEF2F2", color: "#B91C1C" }}
        >
          <XCircle className="h-4 w-4" />
          Afwijzen
        </button>
      )}

      {rejectOpen && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium" style={{ color: "#374151" }}>
            Reden voor afwijzing (optioneel)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Voer een toelichting in..."
            className="w-full px-3 py-2 rounded-lg text-sm border resize-none focus:outline-none"
            style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
            disabled={pending}
          />
          <div className="flex gap-2">
            <button
              onClick={() => act(() => rejectQuote(quoteId, reason))}
              disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "#DC2626" }}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Bevestig afwijzing
            </button>
            <button
              onClick={() => { setRejectOpen(false); setReason(""); }}
              disabled={pending}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{ color: "#64748B", backgroundColor: "#F1F5F9" }}
            >
              Annuleren
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

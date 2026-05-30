"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { approveDirectly } from "@/app/actions/assignments";

interface DirectApprovalButtonProps {
  assignmentId: string;
}

export function DirectApprovalButton({ assignmentId }: DirectApprovalButtonProps) {
  const [confirm, setConfirm]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveDirectly(assignmentId);
      if (!result.success) {
        setError(result.message);
        setConfirm(false);
      }
    });
  }

  return (
    <div className="veele-card" style={{ backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" }}>
      <h3
        className="font-heading text-sm font-semibold mb-2 flex items-center gap-2"
        style={{ color: "#065F46" }}
      >
        <CheckCircle2 className="h-4 w-4" />
        Direct goedkeuren
      </h3>
      <p className="text-xs mb-3" style={{ color: "#047857" }}>
        Sla de offerteflow over en zet de opdracht direct op planbaar.
      </p>

      {error && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs mb-3"
          style={{ backgroundColor: "#FEF2F2", color: "#B91C1C" }}
        >
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {!confirm ? (
        <button
          onClick={() => setConfirm(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-white transition-opacity"
          style={{ backgroundColor: "#059669" }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Direct goedkeuren
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium" style={{ color: "#065F46" }}>
            Weet u het zeker?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={pending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "#059669" }}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Bevestigen
            </button>
            <button
              onClick={() => setConfirm(false)}
              disabled={pending}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
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

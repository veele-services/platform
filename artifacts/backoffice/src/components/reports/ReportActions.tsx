"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { approveReport, rejectReport } from "@/app/actions/reports";

interface Props {
  reportId: string;
}

export function ReportActions({ reportId }: Props) {
  const router       = useRouter();
  const [, startT]   = useTransition();
  const [error, setError]  = useState<string | null>(null);
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  async function handleApprove() {
    setError(null);
    setLoading("approve");
    const result = await approveReport(reportId);
    setLoading(null);
    if (!result.success) {
      setError(result.message);
    } else {
      startT(() => router.refresh());
    }
  }

  async function handleReject() {
    if (!rejectNotes.trim()) {
      setError("Geef een reden op voor de afwijzing.");
      return;
    }
    setError(null);
    setLoading("reject");
    const result = await rejectReport(reportId, rejectNotes);
    setLoading(null);
    if (!result.success) {
      setError(result.message);
    } else {
      startT(() => router.refresh());
    }
  }

  return (
    <div className="veele-card flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>
        Beoordeling
      </p>

      {error && (
        <p className="text-xs rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B" }}>
          {error}
        </p>
      )}

      {/* Approve */}
      <button
        onClick={handleApprove}
        disabled={loading !== null}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}
      >
        {loading === "approve" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        Goedkeuren
      </button>

      {/* Reject toggle */}
      {!showReject ? (
        <button
          onClick={() => setShowReject(true)}
          disabled={loading !== null}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
        >
          <XCircle className="h-4 w-4" />
          Afwijzen
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Reden voor afwijzing…"
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none focus:ring-2 transition"
            style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setShowReject(false); setRejectNotes(""); setError(null); }}
              className="flex-1 px-3 py-2 rounded-lg text-sm border transition-colors hover:bg-slate-50"
              style={{ borderColor: "#E2E8F0", color: "#374151" }}
            >
              Annuleren
            </button>
            <button
              onClick={handleReject}
              disabled={loading !== null}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
              style={{ backgroundColor: "#DC2626", color: "#FFFFFF" }}
            >
              {loading === "reject" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              Afwijzen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

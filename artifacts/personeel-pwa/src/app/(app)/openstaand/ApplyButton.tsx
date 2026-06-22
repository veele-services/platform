"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, UserMinus, UserPlus } from "lucide-react";
import {
  applyForAssignment,
  declineAssignmentInterest,
} from "@/actions/open-assignments";

interface Props {
  assignmentId:     string;
  title:            string;
  isAlreadyApplied: boolean;
  interestStatus?:  string | null;
  canDecline?:      boolean;
}

const STATUS_LABELS: Record<string, string> = {
  invited: "Uitgenodigd",
  viewed: "Bekeken",
  interested: "Interesse getoond",
  unavailable: "Niet beschikbaar",
  question: "Vraag gesteld",
  selected: "Geselecteerd",
  reserve: "Reserve",
  confirmed: "Bevestigd",
};

export function ApplyButton({
  assignmentId,
  title,
  isAlreadyApplied,
  interestStatus,
  canDecline,
}: Props) {
  const [status, setStatus] = useState<string | null>(interestStatus ?? null);
  const [error,   setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const applied =
    isAlreadyApplied ||
    ["interested", "selected", "reserve", "confirmed"].includes(status ?? "");

  if (applied || status === "unavailable") {
    const isUnavailable = status === "unavailable";
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium"
        style={{
          backgroundColor: isUnavailable ? "#FEE2E2" : "#DCFCE7",
          color: isUnavailable ? "#991B1B" : "#166534",
        }}
      >
        {isUnavailable ? <UserMinus size={12} /> : <CheckCircle2 size={12} />}
        {status ? (STATUS_LABELS[status] ?? "Gereageerd") : "Aangemeld"}
      </div>
    );
  }

  function handleApply() {
    if (!confirm(`Wilt u interesse tonen voor "${title}"? De planner neemt de definitieve beslissing.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await applyForAssignment(assignmentId);
      if (result.success) {
        setStatus("interested");
      } else {
        setError(result.error ?? "Aanmelden mislukt");
      }
    });
  }

  function handleDecline() {
    if (!confirm(`Wilt u doorgeven dat u niet beschikbaar bent voor "${title}"?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await declineAssignmentInterest(assignmentId);
      if (result.success) {
        setStatus("unavailable");
      } else {
        setError(result.error ?? "Reactie opslaan mislukt");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {canDecline && (
          <button
            type="button"
            onClick={handleDecline}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#FEF2F2", color: "#B91C1C" }}
          >
            <UserMinus size={12} />
            Niet beschikbaar
          </button>
        )}
        <button
          type="button"
          onClick={handleApply}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
          Interesse tonen
        </button>
      </div>
      {error && (
        <p className="mt-1 text-xs" style={{ color: "var(--color-destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

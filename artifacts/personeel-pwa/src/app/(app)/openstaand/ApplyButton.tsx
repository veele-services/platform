"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, MessageSquare, Send, UserMinus, UserPlus } from "lucide-react";
import {
  applyForAssignment,
  declineAssignmentInterest,
} from "@/actions/open-assignments";
import { askQuestionAboutAssignment } from "@/actions/messages";

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
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const applied =
    isAlreadyApplied ||
    ["interested", "question", "selected", "reserve", "confirmed"].includes(status ?? "");

  if (applied || status === "unavailable") {
    const isUnavailable = status === "unavailable";
    const isQuestion = status === "question";
    return (
      <div className="flex flex-col items-end gap-1">
        <div
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium"
          style={{
            backgroundColor: isUnavailable ? "#FEE2E2" : isQuestion ? "#E8F2FF" : "#DCFCE7",
            color: isUnavailable ? "#991B1B" : isQuestion ? "#1D4ED8" : "#166534",
          }}
        >
          {isUnavailable ? (
            <UserMinus size={12} />
          ) : isQuestion ? (
            <MessageSquare size={12} />
          ) : (
            <CheckCircle2 size={12} />
          )}
          {status ? (STATUS_LABELS[status] ?? "Gereageerd") : "Aangemeld"}
        </div>
        {ticketId ? (
          <Link
            href={`/berichten/${ticketId}`}
            className="text-[11px] font-bold"
            style={{ color: "var(--color-accent)" }}
          >
            Ticket bekijken
          </Link>
        ) : null}
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

  function handleQuestion() {
    if (question.trim().length < 10) {
      setError("Vul een vraag van minimaal 10 tekens in.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await askQuestionAboutAssignment(
        assignmentId,
        question,
        "open_assignment",
      );
      if (result.success) {
        setStatus("question");
        setTicketId(result.ticketId ?? null);
        setQuestion("");
        setAsking(false);
      } else {
        setError(result.error ?? "Vraag opslaan mislukt");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {canDecline && (
          <button
            type="button"
            onClick={() => setAsking((value) => !value)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#E8F2FF", color: "#1D4ED8" }}
          >
            <MessageSquare size={12} />
            Vraag stellen
          </button>
        )}
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
      {asking ? (
        <div className="mt-2 w-full min-w-[220px] max-w-[320px] rounded-2xl border bg-white p-3 text-left shadow-sm">
          <label className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
            Vraag aan planning
          </label>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border px-3 py-2 text-sm font-medium outline-none focus:border-[#00B7B3]"
            placeholder="Stel je vraag over deze opdracht..."
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-500"
              disabled={pending}
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleQuestion}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Versturen
            </button>
          </div>
        </div>
      ) : null}
      {error && (
        <p className="mt-1 text-xs" style={{ color: "var(--color-destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

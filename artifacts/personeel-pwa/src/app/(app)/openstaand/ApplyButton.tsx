"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/shared-ui";
import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import {
  applyForAssignment,
  declineAssignmentInterest,
} from "@/actions/open-assignments";
import { askQuestionAboutAssignment } from "@/actions/messages";

interface Props {
  assignmentId: string;
  title: string;
  isAlreadyApplied: boolean;
  interestStatus?: string | null;
  canDecline?: boolean;
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

type SheetAction = "apply" | "decline" | "question" | null;

function ResponseBottomSheet({
  open,
  title,
  description,
  tone,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  tone: "accent" | "danger" | "info";
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  const isDanger = tone === "danger";
  const isInfo = tone === "info";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-w-md rounded-t-[26px] bg-white sm:rounded-[26px]">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: isDanger
                ? "#FEF2F2"
                : isInfo
                  ? "#E8F2FF"
                  : "#E8FBFA",
              color: isDanger
                ? "#DC2626"
                : isInfo
                  ? "#1D4ED8"
                  : "var(--color-accent)",
            }}
          >
            {isInfo ? (
              <MessageSquare size={20} strokeWidth={2.4} />
            ) : (
              <AlertTriangle size={20} strokeWidth={2.4} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle
              className="text-[18px] font-black leading-tight"
              style={{ color: "var(--color-primary)" }}
            >
              {title}
            </DialogTitle>
            <DialogDescription
              className="mt-2 text-[14px] font-semibold leading-5"
              style={{ color: "var(--color-secondary)" }}
            >
              {description}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Sluiten"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            >
              <X size={18} strokeWidth={2.4} />
            </button>
          </DialogClose>
        </div>

        <div className="mt-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

function statusDescription(status: string | null): string {
  if (status === "unavailable")
    return "Planning ziet dat je niet beschikbaar bent voor deze dienst.";
  if (status === "question")
    return "Je vraag is als bericht verstuurd. Volg het gesprek in Berichten.";
  if (status === "selected" || status === "reserve" || status === "confirmed") {
    return "Planning heeft je reactie verwerkt. Controleer je planning voor definitieve inzet.";
  }
  return "Planning ziet je interesse en bevestigt later wie wordt ingepland.";
}

export function ApplyButton({
  assignmentId,
  title,
  isAlreadyApplied,
  interestStatus,
  canDecline,
}: Props) {
  const [status, setStatus] = useState<string | null>(interestStatus ?? null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [sheetAction, setSheetAction] = useState<SheetAction>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const applied =
    isAlreadyApplied ||
    ["interested", "question", "selected", "reserve", "confirmed"].includes(
      status ?? "",
    );

  function closeSheet() {
    if (pending) return;
    setSheetAction(null);
    setError(null);
  }

  function handleDecisionAction(action: "apply" | "decline") {
    setError(null);
    startTransition(async () => {
      const result =
        action === "apply"
          ? await applyForAssignment(assignmentId)
          : await declineAssignmentInterest(assignmentId);

      if (!result.success) {
        setError(
          result.error ??
            (action === "apply"
              ? "Aanmelden mislukt"
              : "Reactie opslaan mislukt"),
        );
        return;
      }

      setSheetAction(null);
      setStatus(action === "apply" ? "interested" : "unavailable");
      setFeedback(
        action === "apply"
          ? "Interesse verstuurd. Planning ziet je reactie direct terug."
          : "Niet-beschikbaar doorgegeven. Planning ziet dat je deze dienst overslaat.",
      );
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
      if (!result.success) {
        setError(result.error ?? "Vraag opslaan mislukt");
        return;
      }

      setStatus("question");
      setTicketId(result.ticketId ?? null);
      setQuestion("");
      setSheetAction(null);
      setFeedback(
        "Vraag verstuurd naar planning. Het gesprek staat nu in Berichten.",
      );
    });
  }

  if (applied || status === "unavailable") {
    const isUnavailable = status === "unavailable";
    const isQuestion = status === "question";
    return (
      <div
        className="rounded-2xl border bg-white p-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black"
            style={{
              backgroundColor: isUnavailable
                ? "#FEE2E2"
                : isQuestion
                  ? "#E8F2FF"
                  : "#DCFCE7",
              color: isUnavailable
                ? "#991B1B"
                : isQuestion
                  ? "#1D4ED8"
                  : "#166534",
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
              className="text-[12px] font-black"
              style={{ color: "var(--color-accent)" }}
            >
              Ticket bekijken
            </Link>
          ) : null}
        </div>
        <p
          className="mt-2 text-[12px] font-semibold leading-5"
          style={{ color: "var(--color-secondary)" }}
        >
          {feedback ?? statusDescription(status)}
        </p>
      </div>
    );
  }

  const sheetTitle =
    sheetAction === "decline"
      ? "Niet beschikbaar doorgeven?"
      : sheetAction === "question"
        ? "Vraag via bericht stellen"
        : "Interesse tonen?";
  const sheetDescription =
    sheetAction === "decline"
      ? `Je geeft door dat je niet beschikbaar bent voor "${title}". Planning ziet dit direct terug.`
      : sheetAction === "question"
        ? `Stel je vraag over "${title}". Planning ontvangt dit als ticket en antwoordt via Berichten.`
        : `Je toont interesse in "${title}". De planner maakt daarna de definitieve keuze.`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        {canDecline ? (
          <button
            type="button"
            onClick={() => setSheetAction("question")}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#E8F2FF", color: "#1D4ED8" }}
          >
            <MessageSquare size={12} />
            Vraag via bericht
          </button>
        ) : null}
        {canDecline ? (
          <button
            type="button"
            onClick={() => setSheetAction("decline")}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#FEF2F2", color: "#B91C1C" }}
          >
            <UserMinus size={12} />
            Niet beschikbaar
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setSheetAction("apply")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          {pending && sheetAction === "apply" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <UserPlus size={12} />
          )}
          Interesse tonen
        </button>
      </div>

      {feedback ? (
        <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          {feedback}
        </p>
      ) : null}

      <ResponseBottomSheet
        open={sheetAction !== null}
        title={sheetTitle}
        description={sheetDescription}
        tone={
          sheetAction === "decline"
            ? "danger"
            : sheetAction === "question"
              ? "info"
              : "accent"
        }
        onClose={closeSheet}
      >
        {sheetAction === "question" ? (
          <div className="space-y-3">
            <label
              className="block rounded-2xl border bg-white px-3 py-2.5"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="block text-[11px] font-black uppercase tracking-wide text-slate-400">
                Bericht aan planning
              </span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={5}
                maxLength={4000}
                className="mt-2 w-full resize-none bg-transparent text-[14px] font-semibold outline-none"
                placeholder="Stel je vraag over planning, locatie of werkzaamheden..."
              />
            </label>
            {error ? (
              <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
                {error}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeSheet}
                disabled={pending}
                className="rounded-2xl border px-4 py-3 text-[14px] font-black disabled:opacity-60"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-secondary)",
                }}
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleQuestion}
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-black text-white disabled:opacity-60"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                {pending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
                Versturen
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {error ? (
              <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
                {error}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeSheet}
                disabled={pending}
                className="rounded-2xl border px-4 py-3 text-[14px] font-black disabled:opacity-60"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-secondary)",
                }}
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={() =>
                  handleDecisionAction(
                    sheetAction === "decline" ? "decline" : "apply",
                  )
                }
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-black text-white disabled:opacity-60"
                style={{
                  backgroundColor:
                    sheetAction === "decline"
                      ? "#DC2626"
                      : "var(--color-accent)",
                }}
              >
                {pending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : null}
                {sheetAction === "decline"
                  ? "Niet beschikbaar"
                  : "Interesse tonen"}
              </button>
            </div>
          </div>
        )}
      </ResponseBottomSheet>
    </div>
  );
}

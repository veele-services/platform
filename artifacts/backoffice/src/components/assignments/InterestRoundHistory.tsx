"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { BellRing, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";
import {
  sendAssignmentInterestReminder,
  type AssignmentInterestRoundHistory,
} from "@/app/actions/assignments";

type Props = {
  assignmentId: string;
  rounds: AssignmentInterestRoundHistory[];
  canWrite?: boolean;
};

const AUDIENCE_LABELS: Record<string, string> = {
  top_matches: "Ronde 1 · Topmatches",
  next_matches: "Volgende groep",
  flexpool: "Flexpool",
  spoedpool: "Spoedronde",
  manual: "Handmatig",
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function responseSummary(round: AssignmentInterestRoundHistory) {
  const interested = round.counts.interested + round.counts.selected + round.counts.reserve + round.counts.confirmed;
  const pending = round.counts.invited + round.counts.viewed + round.counts.question;
  const unavailable = round.counts.unavailable;
  return { interested, pending, unavailable };
}

export function InterestRoundHistory({ assignmentId, rounds, canWrite = false }: Props) {
  const [pending, startTransition] = useTransition();

  function sendReminder(roundId: string) {
    startTransition(async () => {
      const result = await sendAssignmentInterestReminder(assignmentId, roundId);
      if (result.success) {
        toast.success(`Reminder verstuurd naar ${result.data?.reminded ?? 0} medewerker(s).`);
      } else {
        toast.error(result.message);
      }
    });
  }

  if (rounds.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
        Nog geen interessepeilingen verstuurd. Start met Topmatches of Spoedpool zodra de capaciteit klopt.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rounds.map((round) => {
        const summary = responseSummary(round);
        const canRemind =
          canWrite &&
          summary.pending > 0 &&
          !round.reminderSentAt &&
          round.status === "sent";

        return (
          <section key={round.id} className="rounded-xl border bg-white p-3" style={{ borderColor: "#E2E8F0" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
                    Ronde {round.roundNumber}
                  </p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {AUDIENCE_LABELS[round.audienceType] ?? round.audienceType}
                  </span>
                </div>
                <p className="mt-1 text-xs" style={{ color: "#64748B" }}>
                  Verstuurd {formatDateTime(round.sentAt)} · verloopt {formatDateTime(round.expiresAt)}
                </p>
                <p className="mt-1 text-xs" style={{ color: "#64748B" }}>
                  Reminder na {round.reminderAfterMinutes} min.
                  {round.reminderSentAt
                    ? ` · verstuurd ${formatDateTime(round.reminderSentAt)}`
                    : round.reminderDueAt
                      ? ` · gepland ${formatDateTime(round.reminderDueAt)}`
                      : ""}
                </p>
              </div>

              {canWrite && <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canRemind || pending}
                onClick={() => sendReminder(round.id)}
                className="h-8 px-2 text-[11px]"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                Reminder
              </Button>}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <p className="font-semibold">{summary.interested}</p>
                <p>Interesse/selectie</p>
              </div>
              <div className="rounded-lg bg-sky-50 p-2 text-sky-700">
                <p className="font-semibold">{summary.pending}</p>
                <p>Geen reactie</p>
              </div>
              <div className="rounded-lg bg-red-50 p-2 text-red-700">
                <p className="font-semibold">{summary.unavailable}</p>
                <p>Geweigerd</p>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
              <span>Overgeslagen: {round.skippedCount}</span>
              <span>Anti-spam blokkades: {round.blockedCount}</span>
            </div>

            <div className="mt-3 space-y-1.5">
              {round.responses.map((response) => (
                <div
                  key={response.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium" style={{ color: "#081D3A" }}>
                      {response.personnelName}
                    </p>
                    <p className="text-[11px]" style={{ color: "#94A3B8" }}>
                      {response.matchScore !== null ? `${response.matchScore}% match · ` : ""}
                      {response.respondedAt
                        ? `reactie ${formatDateTime(response.respondedAt)}`
                        : response.viewedAt
                          ? `bekeken ${formatDateTime(response.viewedAt)}`
                          : "nog niet bekeken"}
                    </p>
                  </div>
                  <ProcessStatusBadge kind="interest" status={response.status} size="xs" />
                </div>
              ))}
            </div>

            {round.reminderSentAt && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                <RotateCcw className="h-3 w-3" />
                Reminder is al verstuurd voor deze ronde.
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

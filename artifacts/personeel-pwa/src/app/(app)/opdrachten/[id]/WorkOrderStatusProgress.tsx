"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Play, X } from "lucide-react";
import { startAssignment } from "@/actions/assignments";
import {
  FAILED_FINAL_STATUSES,
  FINISHED_STATUSES,
  getActiveStep,
  getDisplayedTimeSlot,
  type AssignmentView,
} from "./work-order-data";

type Props = {
  assignment: AssignmentView;
};

type StepKind = "seen" | "start" | "finish";

function StepCircle({
  kind,
  state,
}: {
  kind:  StepKind;
  state: "done" | "active" | "pending" | "failed";
}) {
  if (state === "failed") {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FEE2E2] text-[#DC2626] ring-4 ring-[#FFF1F1]">
        <X size={19} strokeWidth={2.7} />
      </span>
    );
  }

  if (state === "active") {
    return (
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full text-white ring-4 ring-[#B9F0EE]"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        {kind === "start" ? <Play size={18} fill="currentColor" strokeWidth={2.4} /> : <Check size={20} strokeWidth={2.7} />}
      </span>
    );
  }

  if (state === "done") {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#18BDB8] bg-white text-[#18BDB8]">
        <Check size={20} strokeWidth={2.7} />
      </span>
    );
  }

  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#D7DDE8] bg-[#E7EBF2] ring-4 ring-[#F1F3F7]">
      {kind === "start" ? <Play size={16} strokeWidth={2.35} className="text-[#8EA0B7]" /> : null}
    </span>
  );
}

function FinishChoiceDialog({
  assignmentId,
  onClose,
}: {
  assignmentId: string;
  onClose:      () => void;
}) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#061F44]/35 px-4 pb-[calc(1rem+var(--safe-bottom))] backdrop-blur-sm">
      <section className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-2xl" role="dialog" aria-modal="true">
        <h2 className="text-[18px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          Zijn alle werkzaamheden afgerond?
        </h2>
        <p className="mt-2 text-[14px] leading-5" style={{ color: "var(--color-secondary)" }}>
          Kies Ja voor de definitieve samenvatting met eventuele klantbevestiging, of Nee om de bon af te melden.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="rounded-2xl border px-4 py-3 text-[14px] font-black active:scale-[0.98]"
            style={{ borderColor: "#FCA5A5", backgroundColor: "#FEF2F2", color: "#DC2626" }}
            onClick={() => router.push(`/opdrachten/${assignmentId}/afronden?result=not_completed`)}
          >
            Nee
          </button>
          <button
            type="button"
            className="rounded-2xl px-4 py-3 text-[14px] font-black text-white active:scale-[0.98]"
            style={{ backgroundColor: "var(--color-accent)" }}
            onClick={() => router.push(`/opdrachten/${assignmentId}/afronden?result=completed`)}
          >
            Ja
          </button>
        </div>

        <button
          type="button"
          className="mt-3 w-full rounded-2xl px-4 py-3 text-[14px] font-bold"
          style={{ color: "var(--color-secondary)" }}
          onClick={onClose}
        >
          Annuleren
        </button>
      </section>
    </div>
  );
}

export function InteractiveStatusProgress({ assignment }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const status = assignment.status;
  const activeStep = getActiveStep(status);
  const failedFinal = FAILED_FINAL_STATUSES.has(status);
  const finished = FINISHED_STATUSES.has(status);
  const canStart = status === "scheduled" || status === "seen";
  const canFinish = status === "in_progress";

  async function handleStart() {
    setError(null);
    if (!canStart || isPending) return;
    const confirmed = window.confirm("Weet je zeker dat je aan de werkzaamheden gaat beginnen?");
    if (!confirmed) return;

    startTransition(async () => {
      const result = await startAssignment(assignment.id);
      if (!result.success) {
        setError(result.error ?? "Starten mislukt");
        return;
      }
      router.refresh();
    });
  }

  function handleFinish() {
    setError(null);
    if (!canFinish) {
      setError("Start de werkbon voordat je deze afrondt of afmeldt.");
      return;
    }
    setFinishDialogOpen(true);
  }

  const steps: Array<{
    kind:     StepKind;
    label:    string;
    state:    "done" | "active" | "pending" | "failed";
    onClick?: () => void;
    disabled?: boolean;
  }> = [
    {
      kind:  "seen",
      label: "Gezien",
      state: activeStep > 0 || status === "seen" || status === "scheduled" ? "done" : "active",
    },
    {
      kind:     "start",
      label:    status === "in_progress" || finished || failedFinal ? "Gestart" : "Start",
      state:    activeStep > 1 || finished || failedFinal ? "done" : activeStep === 1 ? "active" : "pending",
      onClick:  handleStart,
      disabled: !canStart || isPending,
    },
    {
      kind:     "finish",
      label:    failedFinal ? "Afgemeld" : finished ? "Afgerond" : "Afronden",
      state:    failedFinal ? "failed" : finished ? "done" : activeStep === 2 ? "active" : "pending",
      onClick:  handleFinish,
      disabled: !canFinish,
    },
  ];

  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          Status werkbon
        </h2>
        <span className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
          {getDisplayedTimeSlot(assignment)}
        </span>
      </div>

      {error ? (
        <p className="mt-3 rounded-2xl px-3 py-2 text-[13px] font-bold" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-start">
        {steps.map((step, index) => {
          const lineIsDone = index === 0
            ? activeStep > 0 || finished || failedFinal
            : finished;
          const lineIsFailed = failedFinal && index === 1;
          const clickable = Boolean(step.onClick) && !step.disabled;

          return (
            <div key={step.kind} className="contents">
              <button
                type="button"
                className={`flex w-16 shrink-0 flex-col items-center ${clickable ? "active:scale-95" : "cursor-default"}`}
                onClick={step.onClick}
                disabled={!clickable}
                aria-label={step.label}
              >
                <StepCircle kind={step.kind} state={step.state} />
                <span
                  className="mt-2 text-[12px] font-bold"
                  style={{
                    color: step.state === "active" && !failedFinal
                      ? "var(--color-accent)"
                      : step.state === "failed"
                        ? "#DC2626"
                        : "var(--color-secondary)",
                  }}
                >
                  {isPending && step.kind === "start" ? "Start..." : step.label}
                </span>
              </button>
              {index < steps.length - 1 ? (
                <div
                  className="mt-5 h-0.5 flex-1"
                  style={{ backgroundColor: lineIsFailed ? "#FCA5A5" : lineIsDone ? "var(--color-accent)" : "#D7DDE8" }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {finishDialogOpen ? (
        <FinishChoiceDialog assignmentId={assignment.id} onClose={() => setFinishDialogOpen(false)} />
      ) : null}
    </section>
  );
}

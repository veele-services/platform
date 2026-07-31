"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/shared-ui";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Navigation, Play, X } from "lucide-react";
import { markAssignmentEnRoute, startAssignment } from "@/actions/assignments";
import { PersonnelConfirmDialog } from "@/components/PersonnelConfirmDialog";
import {
  enqueueOfflineWorkOrderAction,
  isOfflineNow,
} from "@/lib/offline/work-order-queue";
import { personnelWorkOrderIsSigned } from "@/lib/work-order-lock";
import {
  FAILED_FINAL_STATUSES,
  FINISHED_STATUSES,
  formatDateTimeTime,
  getActiveStep,
  getDisplayedTimeSlot,
  getHeaderStatus,
  type AssignmentView,
} from "./work-order-data";

type Props = {
  assignment: AssignmentView;
};

type StepKind = "seen" | "en_route" | "start" | "finish";

function StepCircle({
  kind,
  state,
}: {
  kind: StepKind;
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
        {kind === "start" ? (
          <Play size={18} fill="currentColor" strokeWidth={2.4} />
        ) : kind === "en_route" ? (
          <Navigation size={18} fill="currentColor" strokeWidth={2.4} />
        ) : (
          <Check size={20} strokeWidth={2.7} />
        )}
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
      {kind === "start" ? (
        <Play size={16} strokeWidth={2.35} className="text-[#8EA0B7]" />
      ) : null}
      {kind === "en_route" ? (
        <Navigation size={16} strokeWidth={2.35} className="text-[#8EA0B7]" />
      ) : null}
    </span>
  );
}

function FinishChoiceDialog({
  assignmentId,
  onClose,
}: {
  assignmentId: string;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-w-sm rounded-t-[24px] bg-white sm:rounded-[24px]">
        <DialogTitle
          className="text-[18px] font-semibold leading-tight"
          style={{ color: "var(--color-primary)" }}
        >
          Zijn alle werkzaamheden afgerond?
        </DialogTitle>
        <DialogDescription
          className="mt-2 text-[14px] leading-5"
          style={{ color: "var(--color-secondary)" }}
        >
          Kies Ja voor de definitieve samenvatting met eventuele
          klantbevestiging, of Nee om de bon af te melden.
        </DialogDescription>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Link
            href={`/opdrachten/${assignmentId}/afronden?result=not_completed`}
            className="rounded-2xl border px-4 py-3 text-center text-[14px] font-semibold active:scale-[0.98]"
            style={{
              borderColor: "#FCA5A5",
              backgroundColor: "#FEF2F2",
              color: "#DC2626",
            }}
          >
            Nee
          </Link>
          <Link
            href={`/opdrachten/${assignmentId}/afronden?result=completed`}
            className="rounded-2xl px-4 py-3 text-center text-[14px] font-semibold text-white active:scale-[0.98]"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Ja
          </Link>
        </div>

        <DialogClose asChild>
          <button
            type="button"
            className="mt-3 min-h-11 w-full rounded-2xl px-4 py-3 text-[14px] font-bold"
            style={{ color: "var(--color-secondary)" }}
          >
            Annuleren
          </button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function InteractiveStatusProgress({ assignment }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [enRouteDialogOpen, setEnRouteDialogOpen] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const status = assignment.participantStatus ?? assignment.status;
  const workOrderLocked = personnelWorkOrderIsSigned(assignment);
  // The automatic seen transition owns the rendered participant version until
  // SeenMarker has refreshed the route with its canonical result. Letting a
  // second action race it would turn our own transition into a false conflict.
  const awaitingSeenRefresh =
    assignment.status === "scheduled" &&
    (status === "assigned" || status === "scheduled");
  const activeStep = getActiveStep(status);
  const currentStatus = getHeaderStatus(status);
  const failedFinal = FAILED_FINAL_STATUSES.has(status);
  const finished = FINISHED_STATUSES.has(status);
  const canMarkEnRoute =
    !workOrderLocked &&
    !awaitingSeenRefresh &&
    (status === "assigned" || status === "scheduled" || status === "seen");
  const canStart = !workOrderLocked && status === "en_route";
  const canFinish = !workOrderLocked && status === "in_progress";

  function handleEnRoute() {
    setError(null);
    setNotice(null);
    if (!canMarkEnRoute || isPending) return;
    setEnRouteDialogOpen(true);
  }

  function confirmEnRoute() {
    setError(null);
    setNotice(null);
    if (!canMarkEnRoute || isPending) return;

    if (isOfflineNow()) {
      enqueueOfflineWorkOrderAction({
        type: "mark-assignment-en-route",
        assignmentId: assignment.id,
        expectedParticipantVersion: assignment.participantVersion ?? null,
      });
      setEnRouteDialogOpen(false);
      setNotice(
        "Onderweg melden is offline opgeslagen en wordt automatisch gesynchroniseerd.",
      );
      return;
    }

    startTransition(async () => {
      const result = await markAssignmentEnRoute(assignment.id, {
        expectedParticipantVersion: assignment.participantVersion ?? null,
      });
      if (!result.success) {
        setEnRouteDialogOpen(false);
        setError(result.error ?? "Onderweg melden mislukt");
        return;
      }
      setEnRouteDialogOpen(false);
      router.refresh();
    });
  }

  function handleStart() {
    setError(null);
    setNotice(null);
    if (!canStart || isPending) return;
    setStartDialogOpen(true);
  }

  function confirmStart() {
    setError(null);
    setNotice(null);
    if (!canStart || isPending) return;

    if (isOfflineNow()) {
      enqueueOfflineWorkOrderAction({
        type: "start-assignment",
        assignmentId: assignment.id,
        expectedParticipantVersion: assignment.participantVersion ?? null,
      });
      setStartDialogOpen(false);
      setNotice(
        "Starten is offline opgeslagen en wordt automatisch gesynchroniseerd.",
      );
      return;
    }

    startTransition(async () => {
      const result = await startAssignment(assignment.id, {
        expectedParticipantVersion: assignment.participantVersion ?? null,
      });
      if (!result.success) {
        setStartDialogOpen(false);
        setError(result.error ?? "Starten mislukt");
        return;
      }
      setStartDialogOpen(false);
      router.refresh();
    });
  }

  function handleFinish() {
    setError(null);
    setNotice(null);
    if (!canFinish) {
      setError("Start de werkbon voordat je deze afrondt of afmeldt.");
      return;
    }
    setFinishDialogOpen(true);
  }

  const steps: Array<{
    kind: StepKind;
    label: string;
    time?: string | null;
    state: "done" | "active" | "pending" | "failed";
    onClick?: () => void;
    disabled?: boolean;
  }> = [
    {
      kind: "seen",
      label: "Gezien",
      time: formatDateTimeTime(assignment.seenAt),
      state:
        activeStep > 0 || status === "seen" || status === "scheduled"
          ? "done"
          : "active",
    },
    {
      kind: "en_route",
      label: "Onderweg",
      time: formatDateTimeTime(assignment.enRouteAt),
      state:
        activeStep > 1 || status === "en_route" || finished || failedFinal
          ? "done"
          : activeStep === 0
            ? "active"
            : "pending",
      onClick: handleEnRoute,
      disabled: !canMarkEnRoute || isPending,
    },
    {
      kind: "start",
      label:
        status === "in_progress" || finished || failedFinal
          ? "Gestart"
          : "Start",
      time: formatDateTimeTime(assignment.actualStartedAt),
      state:
        activeStep > 1 || finished || failedFinal
          ? "done"
          : activeStep === 1
            ? "active"
            : "pending",
      onClick: handleStart,
      disabled: !canStart || isPending,
    },
    {
      kind: "finish",
      label: failedFinal ? "Afgemeld" : finished ? "Afgerond" : "Afronden",
      time: formatDateTimeTime(assignment.actualCompletedAt),
      state: failedFinal
        ? "failed"
        : finished
          ? "done"
          : activeStep === 2
            ? "active"
            : "pending",
      onClick: handleFinish,
      disabled: !canFinish,
    },
  ];

  return (
    <section
      className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          className="text-[15px] font-semibold leading-tight"
          style={{ color: "var(--color-primary)" }}
        >
          Voortgang
        </h2>
        <span
          className="text-[15px] font-semibold"
          style={{ color: "var(--color-primary)" }}
        >
          {getDisplayedTimeSlot(assignment)}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--color-secondary)]">
        Huidige status:{" "}
        <span className="font-medium text-[var(--color-primary)]">
          {currentStatus.label}
        </span>
        . De gemarkeerde stap is de volgende actie.
      </p>

      {error ? (
        <p
          className="mt-3 rounded-2xl px-3 py-2 text-[13px] font-bold"
          style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          className="mt-3 rounded-2xl px-3 py-2 text-[13px] font-bold"
          style={{ backgroundColor: "#E9FBF8", color: "#0A837F" }}
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-6 flex items-start">
        {steps.map((step, index) => {
          const lineIsDone = activeStep > index || finished || failedFinal;
          const lineIsFailed = failedFinal && index === 2;
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
                    color:
                      step.state === "active" && !failedFinal
                        ? "var(--color-accent-accessible)"
                        : step.state === "failed"
                          ? "#DC2626"
                          : "var(--color-secondary)",
                  }}
                >
                  {isPending && step.kind === "en_route"
                    ? "Onderweg..."
                    : isPending && step.kind === "start"
                      ? "Start..."
                      : step.label}
                </span>
                {step.time ? (
                  <span
                    className="mt-0.5 text-[10px] font-semibold"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {step.time}
                  </span>
                ) : null}
              </button>
              {index < steps.length - 1 ? (
                <div
                  className="mt-5 h-0.5 flex-1"
                  style={{
                    backgroundColor: lineIsFailed
                      ? "#FCA5A5"
                      : lineIsDone
                        ? "var(--color-accent)"
                        : "#D7DDE8",
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {finishDialogOpen ? (
        <FinishChoiceDialog
          assignmentId={assignment.id}
          onClose={() => setFinishDialogOpen(false)}
        />
      ) : null}
      <PersonnelConfirmDialog
        open={enRouteDialogOpen}
        title="Onderweg naar klant?"
        description="Hiermee meldt u aan de klant dat onze medewerker onderweg is. Bij meerdere medewerkers wordt de klantmelding alleen de eerste keer verstuurd."
        confirmLabel="Onderweg melden"
        pending={isPending}
        onConfirm={confirmEnRoute}
        onClose={() => setEnRouteDialogOpen(false)}
      />
      <PersonnelConfirmDialog
        open={startDialogOpen}
        title="Werkzaamheden starten?"
        description="Hiermee zet je de werkbon op gestart. Gebruik dit zodra je daadwerkelijk met de werkzaamheden begint."
        confirmLabel="Start werkzaamheden"
        pending={isPending}
        onConfirm={confirmStart}
        onClose={() => setStartDialogOpen(false)}
      />
    </section>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { setAssignmentStatus, type AssignmentStatus } from "@/app/actions/assignments";
import {
  getProcessStatus,
  getProcessStatuses,
  processStatusStyle,
  type ProcessKind,
} from "@/lib/process-status";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ProcessStatusItem = ReturnType<typeof getProcessStatuses>[number];

type StepperWindow = {
  visibleStatuses: ProcessStatusItem[];
  windowStart: number;
  windowEnd: number;
  windowed: boolean;
};

function getWindow(
  statuses: ProcessStatusItem[],
  activeIndex: number,
  windowSize: number,
  enabled: boolean,
): StepperWindow {
  if (!enabled) {
    return {
      visibleStatuses: statuses,
      windowStart: 0,
      windowEnd: statuses.length,
      windowed: false,
    };
  }

  const windowed = statuses.length > windowSize;
  const windowStart = windowed
    ? Math.max(0, Math.min(activeIndex - Math.floor(windowSize / 2), Math.max(statuses.length - windowSize, 0)))
    : 0;
  const visibleStatuses = windowed ? statuses.slice(windowStart, windowStart + windowSize) : statuses;

  return {
    visibleStatuses,
    windowStart,
    windowEnd: windowStart + visibleStatuses.length,
    windowed,
  };
}

function StatusPill({
  kind,
  item,
  active,
  compact,
}: {
  kind: ProcessKind;
  item: ProcessStatusItem;
  active: ProcessStatusItem;
  compact: boolean;
}) {
  const style = processStatusStyle(kind, item.value);
  const current = item.value === active.value;
  const done = item.order < active.order && active.tone !== "danger";

  return (
    <div
      className="flex items-center gap-2 rounded-full border px-2.5 py-1"
      title={item.description}
      style={{
        backgroundColor: current ? style.bg : done ? "#ECFDF5" : "#FFFFFF",
        borderColor: current ? style.border : done ? "#A7F3D0" : "#E2E8F0",
        color: current ? style.text : done ? "#047857" : "#94A3B8",
      }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: current ? style.dot : done ? "#10B981" : "#CBD5E1" }}
      />
      <span className={`whitespace-nowrap font-semibold ${compact ? "text-[11px]" : "text-xs"}`}>
        {item.shortLabel ?? item.label}
      </span>
    </div>
  );
}

function StatusDropdownChip({
  label,
  statuses,
  active,
  canWrite,
  onSelectStatus,
}: {
  label: string;
  statuses: ProcessStatusItem[];
  active: ProcessStatusItem;
  canWrite: boolean;
  onSelectStatus: (status: ProcessStatusItem) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={!canWrite}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-400 shadow-sm outline-none transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          title={label}
        >
          ...
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-72 w-72 overflow-y-auto rounded-xl border-slate-200 p-1 shadow-lg"
      >
        <DropdownMenuLabel className="text-xs text-slate-500">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {statuses.map((status) => {
          const style = processStatusStyle("assignment", status.value);
          const current = status.value === active.value;

          return (
            <DropdownMenuItem
              key={status.value}
              disabled={current}
              onSelect={(event) => {
                event.preventDefault();
                if (!current) onSelectStatus(status);
              }}
              className="cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2"
            >
              <span className="mt-1 h-2 w-2 rounded-full" style={{ backgroundColor: style.dot }} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {status.label}
                  {current && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                </span>
                <span className="mt-0.5 line-clamp-2 text-xs leading-4 text-slate-500">
                  {status.description}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StepperTrack({
  window,
  statuses,
  active,
  compact,
  canWrite,
  onSelectStatus,
}: {
  window: StepperWindow;
  statuses: ProcessStatusItem[];
  active: ProcessStatusItem;
  compact: boolean;
  canWrite: boolean;
  onSelectStatus: (status: ProcessStatusItem) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {window.windowed && window.windowStart > 0 && (
        <div className="flex shrink-0 items-center gap-2">
          <StatusDropdownChip
            label={`${window.windowStart} eerdere statussen`}
            statuses={statuses}
            active={active}
            canWrite={canWrite}
            onSelectStatus={onSelectStatus}
          />
          <span className="h-px w-4 shrink-0 bg-slate-200" />
        </div>
      )}
      {window.visibleStatuses.map((item, index) => {
        const pending = item.order >= active.order || active.tone === "danger";

        return (
          <div key={item.value} className="flex min-w-0 items-center gap-2">
            <StatusPill kind="assignment" item={item} active={active} compact={compact} />
            {index < window.visibleStatuses.length - 1 && (
              <span
                className="h-px w-4 shrink-0"
                style={{ backgroundColor: pending ? "#E2E8F0" : "#A7F3D0" }}
              />
            )}
          </div>
        );
      })}
      {window.windowed && window.windowEnd < statuses.length && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="h-px w-4 shrink-0 bg-slate-200" />
          <StatusDropdownChip
            label={`${statuses.length - window.windowEnd} volgende statussen`}
            statuses={statuses}
            active={active}
            canWrite={canWrite}
            onSelectStatus={onSelectStatus}
          />
        </div>
      )}
    </div>
  );
}

export function AssignmentStatusStepper({
  assignmentId,
  status,
  canWrite,
  className = "",
  compact = false,
}: {
  assignmentId: string;
  status: AssignmentStatus;
  canWrite: boolean;
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [targetStatus, setTargetStatus] = useState<ProcessStatusItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const active = getProcessStatus("assignment", status);
  const allStatuses = useMemo(
    () => getProcessStatuses("assignment").sort((a, b) => a.order - b.order),
    [],
  );
  const visibleStatuses = useMemo(
    () =>
      allStatuses
        .filter((item) => !["rejected", "expired", "cancelled", "canceled", "failed", "not_completed"].includes(item.value) || item.value === status)
        .sort((a, b) => a.order - b.order),
    [allStatuses, status],
  );
  const activeStatusIndex = visibleStatuses.findIndex((item) => item.value === active.value);
  const activeIndex = activeStatusIndex >= 0 ? activeStatusIndex : 0;
  const desktopWindow = getWindow(visibleStatuses, activeIndex, compact ? 3 : 5, visibleStatuses.length > (compact ? 5 : 7));
  const mobileWindow = getWindow(visibleStatuses, activeIndex, 3, !compact);
  const showMobileSummary = !compact && mobileWindow.windowed;
  const showDesktopSummary = desktopWindow.windowed;

  function onSelectStatus(nextStatus: ProcessStatusItem) {
    if (!canWrite || nextStatus.value === status) return;
    setTargetStatus(nextStatus);
  }

  function confirmChange() {
    if (!targetStatus) return;
    const nextStatus = targetStatus;

    startTransition(async () => {
      const result = await setAssignmentStatus(assignmentId, nextStatus.value as AssignmentStatus);
      if (result.success) {
        toast.success(`Status gewijzigd naar "${nextStatus.label}"`);
        setTargetStatus(null);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className={className}>
      {showMobileSummary && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs sm:hidden">
          <span className="font-semibold" style={{ color: "#081D3A" }}>
            Actuele status: {active.shortLabel ?? active.label}
          </span>
          <span style={{ color: "#64748B" }}>
            Stap {activeIndex + 1} van {visibleStatuses.length}
          </span>
        </div>
      )}
      {showDesktopSummary && (
        <div className="mb-2 hidden flex-wrap items-center justify-between gap-2 text-xs sm:flex">
          <span className="font-semibold" style={{ color: "#081D3A" }}>
            Actuele status: {active.shortLabel ?? active.label}
          </span>
          <span style={{ color: "#64748B" }}>
            Stap {activeIndex + 1} van {visibleStatuses.length}
          </span>
        </div>
      )}
      {!canWrite && (
        <p className="mb-2 text-xs text-slate-500">
          Alleen lezen. Status wijzigen kan met opdrachtrechten.
        </p>
      )}
      {!compact ? (
        <>
          <div className="sm:hidden">
            <StepperTrack
              window={mobileWindow}
              statuses={allStatuses}
              active={active}
              compact
              canWrite={canWrite}
              onSelectStatus={onSelectStatus}
            />
          </div>
          <div className="hidden sm:block">
            <StepperTrack
              window={desktopWindow}
              statuses={allStatuses}
              active={active}
              compact={compact}
              canWrite={canWrite}
              onSelectStatus={onSelectStatus}
            />
          </div>
        </>
      ) : (
        <StepperTrack
          window={desktopWindow}
          statuses={allStatuses}
          active={active}
          compact={compact}
          canWrite={canWrite}
          onSelectStatus={onSelectStatus}
        />
      )}
      {showMobileSummary && (
        <p className="mt-1 text-xs leading-5 sm:hidden" style={{ color: "#64748B" }}>
          {active.description}
        </p>
      )}
      {showDesktopSummary && (
        <p className="mt-1 hidden text-xs leading-5 sm:block" style={{ color: "#64748B" }}>
          {active.description}
        </p>
      )}

      <AlertDialog open={Boolean(targetStatus)} onOpenChange={(open) => !open && !isPending && setTargetStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Status wijzigen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze opdracht wilt wijzigen van "{active.label}" naar "{targetStatus?.label}"?
              Dit is een handmatige backoffice-wijziging en wordt vastgelegd in de auditlog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={confirmChange} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Status wijzigen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

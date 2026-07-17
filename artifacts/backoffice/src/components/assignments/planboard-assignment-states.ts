export type PlanboardTimeWindowInput = {
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actualStartedAt?: string | null;
  actualCompletedAt?: string | null;
  effectiveStart?: string | null;
  effectiveEnd?: string | null;
};

export type PlanboardStaffingInput = {
  requiredSlots?: number | null;
  filledSlots?: number | null;
  requiredPersonnelCount?: number | null;
  assignedPersonnelIds?: readonly string[] | null;
};

export type PlanboardInterestStatus =
  | "interested"
  | "selected"
  | "reserve"
  | "confirmed"
  | "invited"
  | "declined"
  | "unavailable"
  | (string & {});

export type PlanboardStaffingState = "empty" | "partial" | "filled" | "overfilled";

export type PlanboardDisplayWindow = {
  label: string;
  kind: "actual" | "effective" | "planned" | "open";
  start: string | null;
  end: string | null;
};

function normalizeCount(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value ?? 0));
}

function countAssigned(input: PlanboardStaffingInput): number {
  const filledSlots = normalizeCount(input.filledSlots);
  if (filledSlots > 0) return filledSlots;
  return input.assignedPersonnelIds?.length ?? 0;
}

export function requiredPlanboardSlots(input: PlanboardStaffingInput): number {
  return Math.max(1, normalizeCount(input.requiredSlots) || normalizeCount(input.requiredPersonnelCount) || 1);
}

export function planboardStaffingState(input: PlanboardStaffingInput): PlanboardStaffingState {
  const required = requiredPlanboardSlots(input);
  const assigned = countAssigned(input);

  if (assigned === 0) return "empty";
  if (assigned < required) return "partial";
  if (assigned === required) return "filled";
  return "overfilled";
}

export function planboardStaffingLabel(input: PlanboardStaffingInput): string {
  return `${countAssigned(input)}/${requiredPlanboardSlots(input)}`;
}

export function planboardStaffingStateLabel(state: PlanboardStaffingState): string {
  if (state === "empty") return "Geen bezetting";
  if (state === "partial") return "Deels bezet";
  if (state === "filled") return "Volledig bezet";
  return "Overbezet";
}

export function formatPlanboardTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  if (start && end) return `${start}-${end}`;
  if (start) return `Vanaf ${start}`;
  if (end) return `Tot ${end}`;
  return "Tijd kiezen";
}

export function planboardDisplayWindow(input: PlanboardTimeWindowInput): PlanboardDisplayWindow {
  if (input.actualStartedAt || input.actualCompletedAt) {
    return {
      kind: "actual",
      start: input.actualStartedAt ?? null,
      end: input.actualCompletedAt ?? null,
      label: formatPlanboardTimeRange(input.actualStartedAt, input.actualCompletedAt),
    };
  }

  if (input.effectiveStart || input.effectiveEnd) {
    return {
      kind: "effective",
      start: input.effectiveStart ?? null,
      end: input.effectiveEnd ?? null,
      label: formatPlanboardTimeRange(input.effectiveStart, input.effectiveEnd),
    };
  }

  if (input.scheduledStart || input.scheduledEnd) {
    return {
      kind: "planned",
      start: input.scheduledStart ?? null,
      end: input.scheduledEnd ?? null,
      label: formatPlanboardTimeRange(input.scheduledStart, input.scheduledEnd),
    };
  }

  return { kind: "open", start: null, end: null, label: "Tijd kiezen" };
}

export function compactPlanboardDisplayWindow(input: PlanboardTimeWindowInput): string {
  const display = planboardDisplayWindow(input);
  if (display.kind === "open") return "Geen tijd";
  return display.label;
}

export function planboardInterestAsAssignedIndicator(status: PlanboardInterestStatus | null | undefined): {
  countsAsAssigned: boolean;
  label: string | null;
} {
  if (status === "confirmed") return { countsAsAssigned: true, label: "Bevestigd via interesse" };
  if (status === "selected") return { countsAsAssigned: true, label: "Geselecteerd via interesse" };
  if (status === "reserve") return { countsAsAssigned: false, label: "Reserve via interesse" };
  if (status === "interested") return { countsAsAssigned: false, label: "Interesse getoond" };
  return { countsAsAssigned: false, label: null };
}

export function planboardAssignmentCardLabels(input: PlanboardTimeWindowInput & PlanboardStaffingInput): {
  timeLabel: string;
  compactTimeLabel: string;
  staffingLabel: string;
  staffingState: PlanboardStaffingState;
  staffingStateLabel: string;
} {
  const staffingState = planboardStaffingState(input);
  return {
    timeLabel: planboardDisplayWindow(input).label,
    compactTimeLabel: compactPlanboardDisplayWindow(input),
    staffingLabel: planboardStaffingLabel(input),
    staffingState,
    staffingStateLabel: planboardStaffingStateLabel(staffingState),
  };
}

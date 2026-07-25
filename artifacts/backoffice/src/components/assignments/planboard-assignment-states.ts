export type PlanboardTimeWindowInput = {
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actualStartedAt?: string | null;
  actualCompletedAt?: string | null;
  effectiveStart?: string | null;
  effectiveEnd?: string | null;
  endMode?: "planned" | "actual" | "now" | "unknown";
  isRunning?: boolean;
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

const PLANBOARD_TIME_ZONE = "Europe/Amsterdam";
const PLANBOARD_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLANBOARD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type PlanboardTimestampParts = {
  date: string;
  hour: number;
  minute: number;
  minuteOfDay: number;
};

function planboardTimestampParts(value: string | Date): PlanboardTimestampParts | null {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;

  const parts = new Map(
    PLANBOARD_DATE_TIME_FORMATTER.formatToParts(timestamp).map((part) => [part.type, part.value]),
  );
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = Number(parts.get("hour"));
  const minute = Number(parts.get("minute"));
  if (!year || !month || !day || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;

  return {
    date: `${year}-${month}-${day}`,
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
  };
}

export function planboardDateKey(value: string | Date): string | null {
  return planboardTimestampParts(value)?.date ?? null;
}

export function planboardMinuteOfDay(value: string | Date): number | null {
  return planboardTimestampParts(value)?.minuteOfDay ?? null;
}

export function planboardTimestampMinute(value: string | null, boardDate: string): number | null {
  if (!value) return null;
  const parts = planboardTimestampParts(value);
  return parts?.date === boardDate ? parts.minuteOfDay : null;
}

function planboardDateOrdinal(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.trunc(date.getTime() / 86_400_000);
}

export function planboardRelativeTimestampMinute(
  value: string | Date | null,
  boardDate: string,
): number | null {
  if (!value) return null;
  const parts = planboardTimestampParts(value);
  const boardOrdinal = planboardDateOrdinal(boardDate);
  const valueOrdinal = parts ? planboardDateOrdinal(parts.date) : null;
  if (!parts || boardOrdinal === null || valueOrdinal === null) return null;

  return (valueOrdinal - boardOrdinal) * 24 * 60 + parts.minuteOfDay;
}

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

export function formatPlanboardActualTime(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);

  const parts = planboardTimestampParts(value);
  if (!parts) return null;
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function planboardDisplayWindow(input: PlanboardTimeWindowInput): PlanboardDisplayWindow {
  if (input.actualStartedAt || input.actualCompletedAt) {
    const actualStart = formatPlanboardActualTime(input.actualStartedAt);
    const actualEnd = formatPlanboardActualTime(input.actualCompletedAt);
    const displayEnd =
      actualEnd ??
      (input.endMode === "now" || input.isRunning
        ? "nu"
        : (input.effectiveEnd ?? null));
    return {
      kind: "actual",
      start: actualStart,
      end: displayEnd,
      label: formatPlanboardTimeRange(actualStart, displayEnd),
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

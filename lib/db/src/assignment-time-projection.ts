import type { AssignmentStatus } from "./schema/assignments";

export type AssignmentTimeProjectionInput = {
  scheduledDate?: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStartedAt: Date | string | null;
  actualCompletedAt: Date | string | null;
  status?: AssignmentStatus | string | null;
  now?: Date | string;
  timeZone?: string;
};

export type AssignmentTimeProjection = {
  plannedDate: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  effectiveDate: string | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
};

export type EffectiveAssignmentInterval = AssignmentTimeProjection & {
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  effectiveStartAt: string | null;
  effectiveEndAt: string | null;
  endMode: "planned" | "actual" | "now" | "unknown";
  source: "planned" | "partly_actual" | "actual";
  isRunning: boolean;
  hasDeviation: boolean;
  dataQualityWarning: string | null;
};

export const ASSIGNMENT_LIFECYCLE_STATUSES = [
  "seen",
  "en_route",
  "in_progress",
  "completed",
  "not_completed",
] as const satisfies readonly AssignmentStatus[];

const DEFAULT_TIME_ZONE = "Europe/Amsterdam";

type LocalTimestampParts = {
  date: string;
  time: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function dateFromTimestamp(value: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localTimestampParts(
  date: Date,
  timeZone: string,
): LocalTimestampParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const hour = part("hour");
  const minute = part("minute");
  const second = part("second");
  return {
    date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    year,
    month,
    day,
    hour,
    minute,
    second,
  };
}

function localDateTimeToDate(
  date: string | null,
  time: string | null,
  timeZone: string,
): Date | null {
  const match = `${date ?? ""}T${time ?? ""}`.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(desiredUtc);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const local = localTimestampParts(candidate, timeZone);
    const representedUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    candidate = new Date(candidate.getTime() - (representedUtc - desiredUtc));
  }

  const resolved = localTimestampParts(candidate, timeZone);
  return resolved.date === date && resolved.time === time ? candidate : null;
}

function minuteDifference(
  left: Date | null,
  right: Date | null,
): number | null {
  if (!left || !right) return null;
  return Math.round((left.getTime() - right.getTime()) / 60_000);
}

function isRunningStatus(
  status: AssignmentTimeProjectionInput["status"],
): boolean {
  return status === "in_progress";
}

export function resolveAssignmentEffectiveInterval(
  input: AssignmentTimeProjectionInput,
): EffectiveAssignmentInterval {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const actualStartAt = dateFromTimestamp(input.actualStartedAt);
  const actualEndAt = dateFromTimestamp(input.actualCompletedAt);
  const now = dateFromTimestamp(input.now ?? new Date()) ?? new Date();
  const actualStart = actualStartAt
    ? localTimestampParts(actualStartAt, timeZone)
    : null;
  const actualEnd = actualEndAt
    ? localTimestampParts(actualEndAt, timeZone)
    : null;
  const plannedStartAt = localDateTimeToDate(
    input.scheduledDate ?? null,
    input.scheduledStart,
    timeZone,
  );
  const plannedEndAt = localDateTimeToDate(
    input.scheduledDate ?? null,
    input.scheduledEnd,
    timeZone,
  );
  const running = Boolean(
    actualStartAt && !actualEndAt && isRunningStatus(input.status),
  );
  const hasCompleteActualInterval = Boolean(actualStartAt && actualEndAt);
  const hasPartialActualInterval = Boolean(actualStartAt || actualEndAt);
  const fallbackEndAt =
    actualStartAt &&
    !actualEndAt &&
    !running &&
    plannedEndAt &&
    plannedEndAt >= actualStartAt
      ? plannedEndAt
      : null;
  const effectiveStartAt = actualStartAt ?? plannedStartAt;
  const effectiveEndAt =
    actualEndAt ?? (running ? now : (fallbackEndAt ?? plannedEndAt));
  const effectiveStartParts = effectiveStartAt
    ? localTimestampParts(effectiveStartAt, timeZone)
    : null;
  const effectiveEndParts = effectiveEndAt
    ? localTimestampParts(effectiveEndAt, timeZone)
    : null;
  const startDeviation = minuteDifference(actualStartAt, plannedStartAt);
  const endDeviation = minuteDifference(actualEndAt, plannedEndAt);
  const invalidActualOrder = Boolean(
    actualStartAt && actualEndAt && actualEndAt < actualStartAt,
  );

  let dataQualityWarning: string | null = null;
  if (invalidActualOrder) {
    dataQualityWarning =
      "Werkelijke eindtijd ligt vóór de werkelijke starttijd.";
  } else if (actualStartAt && !actualEndAt && !running) {
    dataQualityWarning =
      "Werkelijke start is aanwezig, maar de werkbon is niet actief en mist een eindtijd.";
  } else if (!actualStartAt && actualEndAt) {
    dataQualityWarning =
      "Werkelijke eindtijd is aanwezig zonder werkelijke starttijd.";
  }

  return {
    plannedDate: input.scheduledDate ?? null,
    plannedStart: input.scheduledStart,
    plannedEnd: input.scheduledEnd,
    actualStart: actualStart?.time ?? null,
    actualEnd: actualEnd?.time ?? null,
    effectiveDate: effectiveStartParts?.date ?? input.scheduledDate ?? null,
    effectiveStart: effectiveStartParts?.time ?? input.scheduledStart,
    effectiveEnd: invalidActualOrder
      ? null
      : (effectiveEndParts?.time ??
        (!actualEndAt && !running ? input.scheduledEnd : null)),
    plannedStartAt: plannedStartAt?.toISOString() ?? null,
    plannedEndAt: plannedEndAt?.toISOString() ?? null,
    effectiveStartAt: effectiveStartAt?.toISOString() ?? null,
    effectiveEndAt: invalidActualOrder
      ? null
      : (effectiveEndAt?.toISOString() ?? null),
    endMode: actualEndAt
      ? "actual"
      : running
        ? "now"
        : fallbackEndAt || plannedEndAt || input.scheduledEnd
          ? "planned"
          : "unknown",
    source: hasCompleteActualInterval
      ? "actual"
      : hasPartialActualInterval
        ? "partly_actual"
        : "planned",
    isRunning: running,
    hasDeviation:
      hasPartialActualInterval &&
      (startDeviation !== 0 ||
        endDeviation !== 0 ||
        actualStart?.date !== (input.scheduledDate ?? null)),
    dataQualityWarning,
  };
}

export function buildAssignmentTimeProjection(
  input: AssignmentTimeProjectionInput,
): AssignmentTimeProjection {
  const interval = resolveAssignmentEffectiveInterval(input);
  return {
    plannedDate: interval.plannedDate,
    plannedStart: interval.plannedStart,
    plannedEnd: interval.plannedEnd,
    actualStart: interval.actualStart,
    actualEnd: interval.actualEnd,
    effectiveDate: interval.effectiveDate,
    effectiveStart: interval.effectiveStart,
    effectiveEnd: interval.effectiveEnd,
  };
}

export function effectiveAssignmentIntervalsOverlap(
  left: Pick<
    EffectiveAssignmentInterval,
    | "effectiveStartAt"
    | "effectiveEndAt"
    | "effectiveDate"
    | "effectiveStart"
    | "effectiveEnd"
  >,
  right: Pick<
    EffectiveAssignmentInterval,
    | "effectiveStartAt"
    | "effectiveEndAt"
    | "effectiveDate"
    | "effectiveStart"
    | "effectiveEnd"
  >,
): boolean {
  if (
    left.effectiveStartAt &&
    left.effectiveEndAt &&
    right.effectiveStartAt &&
    right.effectiveEndAt
  ) {
    return (
      left.effectiveStartAt < right.effectiveEndAt &&
      left.effectiveEndAt > right.effectiveStartAt
    );
  }
  if (
    left.effectiveDate &&
    right.effectiveDate &&
    left.effectiveDate !== right.effectiveDate
  ) {
    return false;
  }
  if (
    !left.effectiveStart ||
    !left.effectiveEnd ||
    !right.effectiveStart ||
    !right.effectiveEnd
  ) {
    return true;
  }
  return (
    left.effectiveStart < right.effectiveEnd &&
    left.effectiveEnd > right.effectiveStart
  );
}

export function assertGenericAssignmentEditDoesNotTouchLifecycle(
  payload: Record<string, unknown>,
): void {
  const forbidden = [
    "actualStartedAt",
    "actualCompletedAt",
    "seenAt",
    "enRouteAt",
  ];
  const touched = forbidden.filter((key) => key in payload);
  if (touched.length > 0) {
    throw new Error(
      `Lifecycle fields require explicit assignment actions: ${touched.join(", ")}`,
    );
  }
}

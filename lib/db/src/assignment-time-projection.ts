import type { AssignmentStatus } from "./schema/assignments";

export type AssignmentTimeProjectionInput = {
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStartedAt: Date | string | null;
  actualCompletedAt: Date | string | null;
};

export type AssignmentTimeProjection = {
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
};

export const ASSIGNMENT_LIFECYCLE_STATUSES = [
  "seen",
  "en_route",
  "in_progress",
  "completed",
  "not_completed",
] as const satisfies readonly AssignmentStatus[];

function timeFromTimestamp(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function buildAssignmentTimeProjection(
  input: AssignmentTimeProjectionInput,
): AssignmentTimeProjection {
  const actualStart = timeFromTimestamp(input.actualStartedAt);
  const actualEnd = timeFromTimestamp(input.actualCompletedAt);
  return {
    plannedStart: input.scheduledStart,
    plannedEnd: input.scheduledEnd,
    actualStart,
    actualEnd,
    effectiveStart: actualStart ?? input.scheduledStart,
    effectiveEnd: actualEnd ?? input.scheduledEnd,
  };
}

export function assertGenericAssignmentEditDoesNotTouchLifecycle(
  payload: Record<string, unknown>,
): void {
  const forbidden = ["actualStartedAt", "actualCompletedAt", "seenAt", "enRouteAt"];
  const touched = forbidden.filter((key) => key in payload);
  if (touched.length > 0) {
    throw new Error(`Lifecycle fields require explicit assignment actions: ${touched.join(", ")}`);
  }
}

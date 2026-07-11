import "server-only";

import type {
  AssignmentStatus,
  LegacyPersonnelVehicleType,
  PersonnelVehicleType,
  PlanningRouteSnapStatus,
} from "@workspace/db";

export type EtaAssignmentForSequence = {
  id: string;
  scheduledDate: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  status: AssignmentStatus;
  assignedAt: Date | null;
  actualCompletedAt: Date | null;
};

export type EtaPlanningSettings = {
  planningWorkdayStart: string;
  planningTimeSlotMinutes: number;
  routeBufferMinutesCar: number;
  routeBufferMinutesBicycle: number;
  routeBufferMinutesWalking: number;
  routeBufferMinutesMopedOrScooter: number;
  routeBufferMinutesPublicTransport: number;
};

export type EtaSnapInput = {
  scheduledDate: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  customerWindowStart?: string | null;
  customerWindowEnd?: string | null;
  departureTime: Date | null;
  routeDurationSeconds: number | null;
  bufferMinutes: number;
  slotMinutes: number;
  workdayStart: string;
  missingLocation?: boolean;
  providerError?: string | null;
};

export type EtaSnapResult = {
  snapStatus: PlanningRouteSnapStatus;
  computedEarliestStart: Date | null;
  snapSuggestedStart: string | null;
  snapSuggestedEnd: string | null;
  warningCode: string | null;
  warningMessage: string | null;
};

export function isDateKey(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
  );
}

export function isTimeKey(value: string | null | undefined): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function minutesToTime(value: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function dateTimeForTime(scheduledDate: string, time: string): Date {
  return new Date(`${scheduledDate}T${time}:00`);
}

export function timeForDateOnDay(date: Date, scheduledDate: string): string {
  const dayStart = new Date(`${scheduledDate}T00:00:00`);
  const minutes = Math.round((date.getTime() - dayStart.getTime()) / 60000);
  return minutesToTime(minutes);
}

export function durationMinutes(
  scheduledStart: string | null,
  scheduledEnd: string | null,
  fallbackMinutes = 60,
): number {
  if (!isTimeKey(scheduledStart) || !isTimeKey(scheduledEnd)) {
    return fallbackMinutes;
  }

  return Math.max(15, timeToMinutes(scheduledEnd) - timeToMinutes(scheduledStart));
}

export function addMinutesToTime(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

export function roundMinutesUpToPlanningSlot(
  minutes: number,
  slotMinutes: number,
  workdayStart: string,
): number {
  const interval = Number.isFinite(slotMinutes)
    ? Math.max(1, Math.min(240, Math.round(slotMinutes)))
    : 15;
  const base = isTimeKey(workdayStart) ? timeToMinutes(workdayStart) : 0;
  const delta = minutes - base;
  return base + Math.ceil(delta / interval) * interval;
}

export function getRouteBufferMinutes(
  settings: EtaPlanningSettings,
  vehicleType: PersonnelVehicleType | LegacyPersonnelVehicleType,
): number {
  switch (vehicleType) {
    case "BICYCLE":
    case "bicycle":
      return settings.routeBufferMinutesBicycle;
    case "WALK":
    case "walking":
      return settings.routeBufferMinutesWalking;
    case "moped_or_scooter":
      return settings.routeBufferMinutesMopedOrScooter;
    case "TRANSIT":
    case "public_transport":
      return settings.routeBufferMinutesPublicTransport;
    case "DRIVE":
    case "car":
    default:
      return settings.routeBufferMinutesCar;
  }
}

export function sortEtaAssignmentsForPersonnel<T extends EtaAssignmentForSequence>(
  assignments: T[],
): T[] {
  return [...assignments].sort((a, b) => {
    const start = (a.scheduledStart ?? "99:99").localeCompare(
      b.scheduledStart ?? "99:99",
    );
    if (start !== 0) return start;

    const end = (a.scheduledEnd ?? "99:99").localeCompare(
      b.scheduledEnd ?? "99:99",
    );
    if (end !== 0) return end;

    const assignedAtA = a.assignedAt?.getTime() ?? 0;
    const assignedAtB = b.assignedAt?.getTime() ?? 0;
    if (assignedAtA !== assignedAtB) return assignedAtA - assignedAtB;

    return a.id.localeCompare(b.id);
  });
}

export function selectDepartureTime(input: {
  previousAssignment: EtaAssignmentForSequence | null;
  now: Date;
}): Date | null {
  const previous = input.previousAssignment;
  if (!previous) return null;

  if (previous.actualCompletedAt) return previous.actualCompletedAt;

  if (!isTimeKey(previous.scheduledEnd)) return null;

  const scheduledEnd = dateTimeForTime(previous.scheduledDate, previous.scheduledEnd);
  if (previous.status === "in_progress") {
    return new Date(Math.max(input.now.getTime(), scheduledEnd.getTime()));
  }

  return scheduledEnd;
}

export function computeEtaSnapSuggestion(input: EtaSnapInput): EtaSnapResult {
  if (input.missingLocation) {
    return {
      snapStatus: "missing_location",
      computedEarliestStart: null,
      snapSuggestedStart: null,
      snapSuggestedEnd: null,
      warningCode: "missing_location",
      warningMessage:
        "Routecontext kan niet worden berekend omdat een vertrek- of bestemmingslocatie ontbreekt.",
    };
  }

  if (input.providerError) {
    return {
      snapStatus: "provider_error",
      computedEarliestStart: null,
      snapSuggestedStart: null,
      snapSuggestedEnd: null,
      warningCode: "provider_error",
      warningMessage: input.providerError,
    };
  }

  if (!input.departureTime || input.routeDurationSeconds === null) {
    const scheduledStart = isTimeKey(input.scheduledStart)
      ? dateTimeForTime(input.scheduledDate, input.scheduledStart)
      : null;
    return {
      snapStatus: "ok",
      computedEarliestStart: scheduledStart,
      snapSuggestedStart: null,
      snapSuggestedEnd: null,
      warningCode: null,
      warningMessage: null,
    };
  }

  const computedEarliestStart = new Date(
    input.departureTime.getTime() +
      input.routeDurationSeconds * 1000 +
      Math.max(0, input.bufferMinutes) * 60000,
  );
  const earliestMinutes = timeToMinutes(
    timeForDateOnDay(computedEarliestStart, input.scheduledDate),
  );
  const roundedEarliest = roundMinutesUpToPlanningSlot(
    earliestMinutes,
    input.slotMinutes,
    input.workdayStart,
  );

  const windowStart = isTimeKey(input.customerWindowStart)
    ? input.customerWindowStart
    : input.scheduledStart;
  const windowEnd = isTimeKey(input.customerWindowEnd)
    ? input.customerWindowEnd
    : input.scheduledEnd;
  const scheduledStartMinutes = isTimeKey(input.scheduledStart)
    ? timeToMinutes(input.scheduledStart)
    : null;
  const windowStartMinutes = isTimeKey(windowStart)
    ? timeToMinutes(windowStart)
    : scheduledStartMinutes;
  const windowEndMinutes = isTimeKey(windowEnd) ? timeToMinutes(windowEnd) : null;
  const plannedDuration = durationMinutes(
    input.scheduledStart,
    input.scheduledEnd,
    60,
  );
  const suggestedStartMinutes =
    windowStartMinutes !== null && earliestMinutes <= windowStartMinutes
      ? windowStartMinutes
      : roundedEarliest;
  const suggestedStart = minutesToTime(suggestedStartMinutes);
  const suggestedEnd = addMinutesToTime(suggestedStart, plannedDuration);

  if (windowEndMinutes !== null && suggestedStartMinutes > windowEndMinutes) {
    return {
      snapStatus: "outside_window",
      computedEarliestStart,
      snapSuggestedStart: suggestedStart,
      snapSuggestedEnd: suggestedEnd,
      warningCode: "outside_customer_window",
      warningMessage:
        "De berekende aankomsttijd valt buiten het klanttijdvak. Controleer planning of neem contact op.",
    };
  }

  if (
    scheduledStartMinutes !== null &&
    suggestedStartMinutes !== scheduledStartMinutes
  ) {
    return {
      snapStatus: "suggested",
      computedEarliestStart,
      snapSuggestedStart: suggestedStart,
      snapSuggestedEnd: suggestedEnd,
      warningCode: "time_suggestion",
      warningMessage: `Tijdvoorstel op basis van reistijd en buffer: ${suggestedStart}-${suggestedEnd}.`,
    };
  }

  return {
    snapStatus: "ok",
    computedEarliestStart,
    snapSuggestedStart: null,
    snapSuggestedEnd: null,
    warningCode: null,
    warningMessage: null,
  };
}

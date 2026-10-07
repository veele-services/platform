export type StaffAssignmentTime = {
  projected_start_at: string;
  projected_end_at: string;
  actual_start_at?: string | null;
  actual_end_at?: string | null;
  paused_at?: string | null;
};

export type StaffTimeEntry = {
  kind: string;
  starts_at: string;
  ends_at: string | null;
};

const dateParts = (value: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
};

export function staffDate(value: Date | string, timezone: string) {
  return dateParts(typeof value === "string" ? new Date(value) : value, timezone);
}

export function addStaffDays(day: string, amount: number) {
  const value = new Date(`${day}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function staffWeek(day: string) {
  const value = new Date(`${day}T12:00:00.000Z`);
  const weekday = value.getUTCDay() || 7;
  const monday = addStaffDays(day, 1 - weekday);
  return Array.from({ length: 7 }, (_, index) => addStaffDays(monday, index));
}

export function staffClock(value: string | Date, timezone: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function staffDayLabel(day: string, style: "short" | "long" = "long") {
  // `day` already denotes the tenant's calendar date, not an instant to convert again.
  const value = new Date(`${day}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("nl-NL", style === "short"
    ? { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }
    : { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(value);
}

export function assignmentInterval(assignment: StaffAssignmentTime, timezone: string, now = new Date()) {
  const actualStart = assignment.actual_start_at;
  if (!actualStart) {
    return {
      start: staffClock(assignment.projected_start_at, timezone),
      end: staffClock(assignment.projected_end_at, timezone),
      running: false,
      paused: false,
      source: "planned" as const,
    };
  }
  return {
    start: staffClock(actualStart, timezone),
    end: assignment.actual_end_at ? staffClock(assignment.actual_end_at, timezone) : "nu",
    running: !assignment.actual_end_at,
    paused: Boolean(assignment.paused_at && !assignment.actual_end_at),
    source: "actual" as const,
    now: staffClock(now, timezone),
  };
}

export function entryMinutes(entry: StaffTimeEntry, now = new Date()) {
  const start = new Date(entry.starts_at).getTime();
  const end = entry.ends_at ? new Date(entry.ends_at).getTime() : now.getTime();
  return Math.max(0, Math.round((end - start) / 60_000));
}

export function staffDuration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} u ${rest} min` : `${hours} u`;
}

export function summarizeEntries(entries: StaffTimeEntry[], now = new Date()) {
  const totals = { work: 0, travel: 0, break: 0, other: 0, paid: 0 };
  for (const entry of entries) {
    const minutes = entryMinutes(entry, now);
    if (entry.kind === "work") totals.work += minutes;
    else if (entry.kind === "travel") totals.travel += minutes;
    else if (entry.kind === "break") totals.break += minutes;
    else totals.other += minutes;
  }
  totals.paid = totals.work + totals.travel + totals.other;
  return totals;
}

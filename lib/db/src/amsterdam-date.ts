export const FIELDGRID_TIME_ZONE = "Europe/Amsterdam";

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const amsterdamDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: FIELDGRID_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

function formatDateParts(parts: CalendarDateParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseCalendarDateKey(value: string): CalendarDateParts | null {
  const match = DATE_KEY_RE.exec(value);
  if (!match) return null;

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() + 1 !== parts.month ||
    date.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return parts;
}

export function amsterdamDateKey(
  value: Date | string | number = new Date(),
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid timestamp");

  const parts = new Map(
    amsterdamDateFormatter
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

export function addCalendarDays(value: string, days: number): string {
  const parts = parseCalendarDateKey(value);
  if (!parts || !Number.isInteger(days)) throw new Error("invalid date");
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateParts({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function addCalendarMonths(
  value: string,
  months: number,
  preferredDay?: number,
): string {
  const parts = parseCalendarDateKey(value);
  if (!parts || !Number.isInteger(months)) throw new Error("invalid date");
  const day = preferredDay ?? parts.day;
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("invalid preferred day");
  }

  const target = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return formatDateParts({
    year: target.getUTCFullYear(),
    month: target.getUTCMonth() + 1,
    day: Math.min(day, lastDay),
  });
}

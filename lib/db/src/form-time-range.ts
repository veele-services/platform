const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/u;

export type TimeRangeValidation =
  | { valid: true; durationMinutes: number | null }
  | { valid: false; durationMinutes: null; message: string };

export function parseClockMinutes(value: string): number | null {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function validateTimeRange(
  start: string,
  end: string,
): TimeRangeValidation {
  if (!start && !end) return { valid: true, durationMinutes: null };
  if (!start || !end) {
    return {
      valid: false,
      durationMinutes: null,
      message: "Vul zowel een starttijd als een eindtijd in.",
    };
  }

  const startMinutes = parseClockMinutes(start);
  const endMinutes = parseClockMinutes(end);
  if (startMinutes === null || endMinutes === null) {
    return {
      valid: false,
      durationMinutes: null,
      message: "Gebruik een geldige tijd in het formaat uu:mm.",
    };
  }
  if (endMinutes <= startMinutes) {
    return {
      valid: false,
      durationMinutes: null,
      message: "De eindtijd moet na de starttijd liggen.",
    };
  }

  return { valid: true, durationMinutes: endMinutes - startMinutes };
}

export function suggestEndTime(
  start: string,
  durationMinutes = 60,
): string | null {
  const startMinutes = parseClockMinutes(start);
  if (
    startMinutes === null ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return null;
  }
  const endMinutes = startMinutes + durationMinutes;
  if (endMinutes >= 24 * 60) return null;

  return `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(
    endMinutes % 60,
  ).padStart(2, "0")}`;
}

export function formatDuration(durationMinutes: number): string {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} uur`;
  return `${hours} uur ${minutes} min`;
}

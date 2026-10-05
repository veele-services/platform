import { localDateTime, localToInstant, validDay } from "@/lib/planning/time";

export const customerTimeWindows = Array.from({ length: 12 }, (_, index) => {
  const start = `${String(index * 2).padStart(2, "0")}:00`;
  const end = `${String((index * 2 + 2) % 24).padStart(2, "0")}:00`;
  return { start, end, label: `${start} – ${end}` };
});

/** An arrival preference, never a projected visit or a task-duration estimate. */
export function twoHourCustomerWindow(day: string, start: string, timezone: string) {
  if (!validDay(day)) throw new Error("Kies een geldige gewenste dag.");
  const window = customerTimeWindows.find(item => item.start === start);
  if (!window) throw new Error("Kies een tijdsvenster van twee uur.");
  const nextDay = new Date(`${day}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const windowStart = localToInstant(`${day}T${window.start}`, timezone);
  const windowEnd = localToInstant(`${window.end === "00:00" ? nextDay.toISOString().slice(0, 10) : day}T${window.end}`, timezone);
  if (Date.parse(windowEnd) - Date.parse(windowStart) !== 120 * 60_000) {
    throw new Error("Dit venster duurt door de klokwisseling geen twee uur. Kies een ander tijdsvenster.");
  }
  return { windowStart, windowEnd, windowKind: "arrival" as const };
}

/** Keep nonstandard existing customer agreements intact until explicitly changed. */
export function customerWindowChoice(start: string | null | undefined, end: string | null | undefined, timezone: string) {
  if (!start || !end) return "";
  const local = localDateTime(start, timezone);
  try {
    const candidate = twoHourCustomerWindow(local.slice(0, 10), local.slice(11), timezone);
    if (Date.parse(candidate.windowStart) === Date.parse(start) && Date.parse(candidate.windowEnd) === Date.parse(end)) return local.slice(11);
  } catch { /* An existing agreement need not match the new two-hour choices. */ }
  return "existing";
}

function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
export function localDateTime(instant: string, timeZone: string) {
  return localParts(new Date(instant), timeZone);
}
export function tenantToday(timeZone: string) {
  return localParts(new Date(), timeZone).slice(0, 10);
}
export function validDay(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function clockLabel(instant: string, timeZone: string) {
  return localDateTime(instant, timeZone).slice(11);
}
export function localToInstant(
  value: string,
  timeZone: string,
  fold?: "earlier" | "later",
): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Vul een volledige datum en tijd op de minuut in.");
  const naive = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(naive)) throw new Error("Ongeldige datum of tijd.");
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = new Date(naive + hours * 3600000);
    offsets.add(
      Date.parse(`${localParts(sample, timeZone)}:00Z`) - sample.getTime(),
    );
  }
  const candidates = [...offsets]
    .map((offset) => naive - offset)
    .filter((ms) => localParts(new Date(ms), timeZone) === value)
    .sort((a, b) => a - b);
  if (!candidates.length)
    throw new Error(
      "Dit tijdstip bestaat niet door de overgang naar zomertijd. Kies een ander tijdstip.",
    );
  if (candidates.length > 1 && !fold)
    throw new Error(
      "Dit tijdstip komt tweemaal voor bij wintertijd. Kies de eerste of tweede keer.",
    );
  return new Date(
    fold === "later" ? candidates.at(-1)! : candidates[0],
  ).toISOString();
}
export function visibleWindow(
  day: string,
  from: string,
  to: string,
  timeZone: string,
) {
  const start = localToInstant(`${day}T${from}`, timeZone),
    end = localToInstant(`${day}T${to}`, timeZone);
  const minutes = (Date.parse(end) - Date.parse(start)) / 60000;
  if (minutes <= 0)
    throw new Error(
      "Tot moet later zijn dan Vanaf. Het vorige tijdvenster blijft zichtbaar.",
    );
  return { start, end, minutes };
}

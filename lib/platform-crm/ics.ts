import type { CrmAppointment, CrmLead } from "./types";
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
const utc = (s: string) => new Date(s).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
function fold(line: string) {
  const result: string[] = []; let part = "";
  for (const char of line) { if (Buffer.byteLength(part + char, "utf8") > 75) { result.push(part); part = " " + char; } else part += char; }
  return [...result, part].join("\r\n");
}
export function appointmentIcs(a: CrmAppointment, l: CrmLead, now = new Date()) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fieldgrid//Telefonische afspraken//NL", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${a.id}@fieldgrid.nl`, `DTSTAMP:${utc(now.toISOString())}`, `DTSTART:${utc(a.startsAt)}`, `DTEND:${utc(a.endsAt)}`, `SUMMARY:${escape(`Fieldgrid · ${l.company}`)}`, `DESCRIPTION:${escape(`Telefonische kennismaking met ${l.name}. Telefoon: ${l.phone}`)}`, "LOCATION:Telefonisch", `STATUS:${a.status === "cancelled" ? "CANCELLED" : a.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`, "END:VEVENT", "END:VCALENDAR", ""].map(fold).join("\r\n");
}

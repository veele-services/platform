export const ticketStatusLabels: Record<string, string> = {
  new: "Nieuw", in_progress: "In behandeling", waiting_reporter: "Wacht op melder", waiting_external: "Wacht op externe partij", resolved: "Opgelost", closed: "Gesloten", cancelled: "Ingetrokken",
};
export const ticketPriorityLabels: Record<string, string> = { low: "Laag", normal: "Normaal", high: "Hoog", critical: "Kritiek" };
export const ticketAudienceLabels: Record<string, string> = { reporter: "Gesprek met de melder", tenant: "Alleen intern binnen de organisatie", platform: "Alleen intern bij Fieldgrid" };
export function ticketDate(value: string | null | undefined, timezone = "Europe/Amsterdam") {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(date);
}
export function ticketBytes(size: number) { return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`; }
export function ticketTone(status: string) { return ["resolved", "closed"].includes(status) ? "green" : status === "critical" ? "red" : ["waiting_reporter", "waiting_external", "high"].includes(status) ? "amber" : status === "in_progress" ? "blue" : undefined; }
export function ticketSafeReturn(value: string | undefined, base: string) { return value && (value === base || value.startsWith(`${base}?`)) ? value : base; }
export function ticketContextLabel(row: Pick<TicketRow, "route" | "module" | "context">) {
  if (row.route === "platform_support") return row.module || "Geen module opgegeven";
  return row.context.filter(item => item.kind === "work_order" || item.kind === "object").map(item => item.label).join(" · ") || "Geen context gekoppeld";
}
export function ticketAssigneeLabel(row: Pick<TicketRow, "assignee" | "assignedGroupName">) {
  return [row.assignee?.label, row.assignedGroupName].filter(Boolean).join(" · ") || "Niet toegewezen";
}
export function ticketNextActor(value: string, workspace: string) {
  if (value === "reporter") return workspace === "staff" || workspace === "support" ? "Jouw reactie nodig" : "Reactie van melder nodig";
  if (value === "handler") return workspace === "support" ? "Fieldgrid onderzoekt" : workspace === "staff" ? "Je organisatie behandelt de melding" : "Behandeling nodig";
  if (value === "external") return "Externe partij aan zet";
  if (value === "none") return "Geen open vervolgstap";
  return value;
}
import type { TicketRow } from "@/lib/tickets/model";

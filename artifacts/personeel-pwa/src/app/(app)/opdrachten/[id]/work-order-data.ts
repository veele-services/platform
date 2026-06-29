import type { MyAssignmentDetail } from "@/actions/assignments";
import type { ExtraWorkItem } from "@/actions/extra-work";

export type WorkOrderTab = "home" | "werkzaamheden" | "rapportage";

export type AssignmentView = Pick<
  MyAssignmentDetail,
  | "id"
  | "code"
  | "title"
  | "description"
  | "scheduledDate"
  | "scheduledStart"
  | "scheduledEnd"
  | "seenAt"
  | "actualStartedAt"
  | "actualCompletedAt"
  | "completionReason"
  | "completionNotes"
  | "customerSignatureRequired"
  | "customerSignatureDataUrl"
  | "status"
  | "customerName"
  | "contactName"
  | "phone"
  | "objectName"
  | "objectAddress"
  | "objectCity"
  | "objectPostalCode"
  | "tasks"
>;

export type MaterialUsageItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitLabel?: string;
};

export const FINISHED_STATUSES = new Set([
  "completed",
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

export const FAILED_FINAL_STATUSES = new Set(["not_completed", "cancelled", "canceled", "afgemeld"]);

export const STEP_LABELS = ["Gezien", "Gestart", "Afgerond"];

export const NOT_COMPLETED_REASONS = [
  "Klant niet aanwezig",
  "Geen toegang tot object",
  "Sleutel / toegangscode werkt niet",
  "Klant niet akkoord op locatie",
  "Tijd tekort",
  "Meerwerk nodig",
  "Materiaal / middelen ontbreken",
  "Onveilige situatie",
  "Opdrachtinformatie onduidelijk of onvolledig",
  "Klant / locatie annuleert op locatie",
  "Overig",
] as const;

export function formatTimeSlot(start: string | null, end: string | null): string {
  if (start && end) return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
  if (start) return `Vanaf ${start.slice(0, 5)}`;
  return "Tijd nog niet bekend";
}

export function formatDateTimeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour:     "2-digit",
    minute:   "2-digit",
  }).format(date);
}

export function getDisplayedTimeSlot(assignment: Pick<AssignmentView, "scheduledStart" | "scheduledEnd" | "actualStartedAt" | "actualCompletedAt">): string {
  const start = formatDateTimeTime(assignment.actualStartedAt) ?? assignment.scheduledStart;
  const end = formatDateTimeTime(assignment.actualCompletedAt) ?? assignment.scheduledEnd;
  return formatTimeSlot(start ?? null, end ?? null);
}

export function getHeaderStatus(status: string): { label: string; background: string; color: string } {
  if (FAILED_FINAL_STATUSES.has(status)) {
    return { label: "NIET AFGEROND", background: "#FEE2E2", color: "#DC2626" };
  }
  if (FINISHED_STATUSES.has(status)) {
    return { label: "AFGEROND", background: "#E6F8ED", color: "#249357" };
  }
  if (status === "in_progress") {
    return { label: "GESTART", background: "#FFF4D8", color: "#B7790F" };
  }
  if (status === "seen" || status === "scheduled") {
    return { label: "GEZIEN", background: "#EAF5FF", color: "#2563A9" };
  }
  return { label: "NIEUW", background: "#EAF5FF", color: "#2563A9" };
}

export function getActiveStep(status: string): number {
  if (FAILED_FINAL_STATUSES.has(status) || FINISHED_STATUSES.has(status)) return 2;
  if (status === "in_progress") return 1;
  return 0;
}

export function getTaskCompletionCount(assignment: AssignmentView): number {
  if (assignment.tasks.length === 0) return 0;
  const explicitCompleted = assignment.tasks.filter((task) => Boolean(task.completedAt)).length;
  if (explicitCompleted > 0) return explicitCompleted;
  if (FINISHED_STATUSES.has(assignment.status)) return assignment.tasks.length;
  if (assignment.status === "in_progress") return Math.max(assignment.tasks.length - 1, 0);
  return 0;
}

export function parseNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style:                 "currency",
    currency:              "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function calculateExtraWorkLineTotal(item: Pick<ExtraWorkItem, "hours" | "price">): number {
  const price = parseNumber(item.price);
  const hours = parseNumber(item.hours);
  return hours > 0 ? hours * price : price;
}

export function calculateMaterialLineTotal(item: MaterialUsageItem): number {
  return item.quantity * item.unitPrice;
}

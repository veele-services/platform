import type {
  BackofficeTicketStatus,
  TicketKind,
} from "@/app/actions/tickets";
import { processStatusLabel } from "@/lib/process-status";

export const TICKET_STATUS_OPTIONS: Array<{
  value: BackofficeTicketStatus;
  label: string;
}> = [
  { value: "open", label: processStatusLabel("ticket", "open") },
  { value: "waiting_backoffice", label: processStatusLabel("ticket", "waiting_backoffice") },
  { value: "waiting_customer", label: processStatusLabel("ticket", "waiting_customer") },
  { value: "waiting_personnel", label: processStatusLabel("ticket", "waiting_personnel") },
  { value: "closed", label: processStatusLabel("ticket", "closed") },
];

export const TICKET_KIND_OPTIONS: Array<{
  value: TicketKind | "all";
  label: string;
}> = [
  { value: "all", label: "Alles" },
  { value: "customer", label: "Klanten" },
  { value: "personnel", label: "Personeel" },
];

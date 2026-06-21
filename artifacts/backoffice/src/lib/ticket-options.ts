import type {
  BackofficeTicketStatus,
  TicketKind,
} from "@/app/actions/tickets";

export const TICKET_STATUS_OPTIONS: Array<{
  value: BackofficeTicketStatus;
  label: string;
}> = [
  { value: "open", label: "Open" },
  { value: "waiting_backoffice", label: "Bij Veele" },
  { value: "waiting_customer", label: "Wacht op klant" },
  { value: "waiting_personnel", label: "Wacht op medewerker" },
  { value: "closed", label: "Gesloten" },
];

export const TICKET_KIND_OPTIONS: Array<{
  value: TicketKind | "all";
  label: string;
}> = [
  { value: "all", label: "Alles" },
  { value: "customer", label: "Klanten" },
  { value: "personnel", label: "Personeel" },
];

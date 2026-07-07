export type ProcessKind =
  | "assignment"
  | "quote"
  | "report"
  | "invoice"
  | "payment"
  | "ticket"
  | "interest";

export type ProcessTone =
  | "neutral"
  | "info"
  | "review"
  | "warning"
  | "success"
  | "danger"
  | "closed";

export type ProcessStatusConfig = {
  value: string;
  label: string;
  shortLabel?: string;
  description: string;
  tone: ProcessTone;
  order: number;
};

export const TONE_STYLES: Record<ProcessTone, { bg: string; text: string; border: string; dot: string }> = {
  neutral: { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0", dot: "#94A3B8" },
  info: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", dot: "#3B82F6" },
  review: { bg: "#EEF2FF", text: "#4F46E5", border: "#C7D2FE", dot: "#6366F1" },
  warning: { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "#F59E0B" },
  success: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0", dot: "#10B981" },
  danger: { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA", dot: "#EF4444" },
  closed: { bg: "#F1F5F9", text: "#334155", border: "#CBD5E1", dot: "#64748B" },
};

const assignment: ProcessStatusConfig[] = [
  { value: "requested", label: "Aangevraagd", description: "Aanvraag is binnengekomen.", tone: "info", order: 10 },
  { value: "review", label: "In beoordeling", description: "Backoffice beoordeelt inhoud, planning en capaciteit.", tone: "review", order: 20 },
  { value: "quote_preparation", label: "Offerte opstellen", shortLabel: "Offerte", description: "Prijsopgave wordt voorbereid.", tone: "review", order: 30 },
  { value: "awaiting_approval", label: "Wacht op klantakkoord", shortLabel: "Klantakkoord", description: "Klant moet akkoord geven.", tone: "warning", order: 40 },
  { value: "approved", label: "Goedgekeurd", description: "Opdracht is inhoudelijk akkoord.", tone: "success", order: 50 },
  { value: "plannable", label: "Planbaar", description: "Opdracht kan op het planbord worden geplaatst.", tone: "warning", order: 60 },
  { value: "scheduled", label: "Ingepland", description: "Medewerker(s) en tijdvak zijn ingepland.", tone: "info", order: 70 },
  { value: "seen", label: "Gezien door medewerker", shortLabel: "Gezien", description: "Werkbon is geopend door personeel.", tone: "info", order: 80 },
  { value: "en_route", label: "Onderweg", description: "Een medewerker is onderweg naar de locatie.", tone: "info", order: 90 },
  { value: "in_progress", label: "In uitvoering", description: "Werkzaamheden zijn gestart.", tone: "review", order: 100 },
  { value: "not_completed", label: "Afgemeld / niet afgerond", shortLabel: "Afgemeld", description: "Werkbon is niet volledig afgerond.", tone: "danger", order: 110 },
  { value: "completed", label: "Afgerond", description: "Werkbon is afgerond door personeel.", tone: "success", order: 120 },
  { value: "report_submitted", label: "Rapport ter controle", shortLabel: "Rapport controle", description: "Rapport wacht op backofficecontrole.", tone: "warning", order: 130 },
  { value: "report_approved", label: "Rapport goedgekeurd", description: "Rapport is goedgekeurd.", tone: "success", order: 140 },
  { value: "invoice_ready", label: "Factureerbaar", description: "Opdracht is klaar voor facturatie.", tone: "warning", order: 150 },
  { value: "invoiced", label: "Gefactureerd", description: "Factuur is aangemaakt/verzonden.", tone: "info", order: 160 },
  { value: "paid", label: "Betaald", description: "Betaling is ontvangen.", tone: "success", order: 170 },
  { value: "closed", label: "Afgehandeld", description: "Workflow is volledig afgesloten.", tone: "closed", order: 180 },
];

const quote: ProcessStatusConfig[] = [
  { value: "draft", label: "Concept", description: "Offerte is in voorbereiding.", tone: "neutral", order: 10 },
  { value: "sent", label: "Ter goedkeuring", description: "Offerte is verzonden naar de klant.", tone: "info", order: 20 },
  { value: "approved", label: "Akkoord", description: "Klant heeft akkoord gegeven.", tone: "success", order: 30 },
  { value: "rejected", label: "Afgewezen", description: "Klant heeft de offerte afgewezen.", tone: "danger", order: 40 },
  { value: "expired", label: "Verlopen", description: "Offerte is niet meer geldig.", tone: "warning", order: 50 },
];

const report: ProcessStatusConfig[] = [
  { value: "draft", label: "Concept", description: "Rapport is nog niet ingediend.", tone: "neutral", order: 10 },
  { value: "submitted", label: "Ter controle", description: "Rapport wacht op beoordeling.", tone: "warning", order: 20 },
  { value: "approved", label: "Goedgekeurd", description: "Rapport is goedgekeurd.", tone: "success", order: 30 },
  { value: "rejected", label: "Afgewezen", description: "Rapport is afgekeurd en moet worden aangepast.", tone: "danger", order: 40 },
];

const invoice: ProcessStatusConfig[] = [
  { value: "draft", label: "Concept", description: "Factuurvoorstel is in voorbereiding.", tone: "neutral", order: 10 },
  { value: "sent", label: "Verzonden", description: "Factuur is verstuurd naar de klant.", tone: "warning", order: 20 },
  { value: "paid", label: "Betaald", description: "Factuur is betaald.", tone: "success", order: 30 },
  { value: "cancelled", label: "Geannuleerd", description: "Factuur is geannuleerd.", tone: "danger", order: 40 },
];

const payment: ProcessStatusConfig[] = [
  { value: "open", label: "Openstaand", description: "Betaalverzoek staat open.", tone: "warning", order: 10 },
  { value: "paid", label: "Betaald", description: "Betaling is ontvangen.", tone: "success", order: 20 },
  { value: "canceled", label: "Geannuleerd", description: "Betaling is geannuleerd.", tone: "danger", order: 30 },
  { value: "cancelled", label: "Geannuleerd", description: "Betaling is geannuleerd.", tone: "danger", order: 30 },
  { value: "expired", label: "Verlopen", description: "Betaalverzoek is verlopen.", tone: "closed", order: 40 },
  { value: "failed", label: "Mislukt", description: "Betaling is mislukt.", tone: "danger", order: 50 },
];

const ticket: ProcessStatusConfig[] = [
  { value: "open", label: "Open", description: "Ticket is nieuw of actief.", tone: "info", order: 10 },
  { value: "waiting_backoffice", label: "Actie backoffice", description: "Backoffice moet reageren.", tone: "warning", order: 20 },
  { value: "waiting_customer", label: "Wacht op klant", description: "Klant moet reageren.", tone: "review", order: 30 },
  { value: "waiting_personnel", label: "Wacht op medewerker", description: "Medewerker moet reageren.", tone: "review", order: 30 },
  { value: "closed", label: "Afgesloten", description: "Ticket is afgerond.", tone: "closed", order: 40 },
];

const interest: ProcessStatusConfig[] = [
  { value: "invited", label: "Uitgenodigd", description: "Medewerker is uitgenodigd.", tone: "info", order: 10 },
  { value: "viewed", label: "Bekeken", description: "Medewerker heeft de uitnodiging gezien.", tone: "info", order: 20 },
  { value: "interested", label: "Interesse", description: "Medewerker heeft interesse getoond.", tone: "success", order: 30 },
  { value: "unavailable", label: "Niet beschikbaar", description: "Medewerker is niet beschikbaar.", tone: "danger", order: 30 },
  { value: "question", label: "Vraag gesteld", description: "Medewerker heeft een vraag gesteld.", tone: "warning", order: 30 },
  { value: "selected", label: "Geselecteerd", description: "Planning heeft medewerker geselecteerd.", tone: "success", order: 40 },
  { value: "reserve", label: "Reserve", description: "Medewerker staat reserve.", tone: "warning", order: 40 },
  { value: "confirmed", label: "Bevestigd", description: "Medewerker is definitief bevestigd.", tone: "success", order: 50 },
  { value: "cancelled", label: "Geannuleerd", description: "Uitnodiging is geannuleerd.", tone: "danger", order: 60 },
  { value: "expired", label: "Verlopen", description: "Uitnodiging is verlopen.", tone: "closed", order: 60 },
];

export const PROCESS_STATUS_CONFIG: Record<ProcessKind, ProcessStatusConfig[]> = {
  assignment,
  quote,
  report,
  invoice,
  payment,
  ticket,
  interest,
};

export function getProcessStatuses(kind: ProcessKind): ProcessStatusConfig[] {
  return PROCESS_STATUS_CONFIG[kind];
}

export function getProcessStatus(kind: ProcessKind, status: string): ProcessStatusConfig {
  const statuses = getProcessStatuses(kind);
  return statuses.find((item) => item.value === status) ?? {
    value: status,
    label: humanizeStatus(status),
    description: "Onbekende technische status.",
    tone: "neutral",
    order: 999,
  };
}

export function processStatusLabel(kind: ProcessKind, status: string): string {
  return getProcessStatus(kind, status).label;
}

export function processStatusStyle(kind: ProcessKind, status: string) {
  return TONE_STYLES[getProcessStatus(kind, status).tone];
}

function humanizeStatus(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

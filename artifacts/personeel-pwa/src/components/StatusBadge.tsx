const STATUS_LABELS: Record<string, string> = {
  requested:         "Aangevraagd",
  review:            "In beoordeling",
  quote_preparation: "Offerte opstellen",
  awaiting_approval: "Wacht op klantakkoord",
  approved:          "Akkoord",
  plannable:         "Planbaar",
  scheduled:         "Ingepland",
  seen:              "Gezien door medewerker",
  in_progress:       "In uitvoering",
  not_completed:     "Afgemeld / niet afgerond",
  completed:         "Afgerond",
  report_submitted:  "Rapport ter controle",
  report_approved:   "Rapport goedgekeurd",
  invoice_ready:     "Factureerbaar",
  invoiced:          "Gefactureerd",
  paid:              "Betaald",
  closed:            "Afgehandeld",
  pending:           "In behandeling",
  rejected:          "Afgewezen",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  requested:         { bg: "#F1F5F9", text: "#64748B" },
  review:            { bg: "#FFF7ED", text: "#EA580C" },
  quote_preparation: { bg: "#FFF7ED", text: "#EA580C" },
  awaiting_approval: { bg: "#FFFBEB", text: "#D97706" },
  approved:          { bg: "#F0FDF4", text: "#16A34A" },
  plannable:         { bg: "#F0F9FF", text: "#0284C7" },
  scheduled:         { bg: "#EFF6FF", text: "#3B82F6" },
  seen:              { bg: "#F5F3FF", text: "#7C3AED" },
  in_progress:       { bg: "#FFFBEB", text: "#F59E0B" },
  not_completed:     { bg: "#FEF2F2", text: "#EF4444" },
  completed:         { bg: "#F0FDF4", text: "#10B981" },
  report_submitted:  { bg: "#F0F9FF", text: "#0284C7" },
  report_approved:   { bg: "#F0FDF4", text: "#16A34A" },
  invoice_ready:     { bg: "#FFF7ED", text: "#EA580C" },
  invoiced:          { bg: "#F5F3FF", text: "#8B5CF6" },
  paid:              { bg: "#F0FDF4", text: "#10B981" },
  closed:            { bg: "#F1F5F9", text: "#334155" },
};

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const colors = STATUS_COLORS[status] ?? { bg: "#F1F5F9", text: "#64748B" };

  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  );
}

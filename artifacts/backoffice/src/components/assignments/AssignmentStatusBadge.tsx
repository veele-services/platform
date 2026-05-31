import type { AssignmentStatus, AssignmentPriority } from "@/app/actions/assignments";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AssignmentStatus, { label: string; bg: string; text: string }> = {
  requested:         { label: "Aangevraagd",             bg: "#EFF6FF", text: "#3B82F6" },
  review:            { label: "In beoordeling",          bg: "#EEF2FF", text: "#6366F1" },
  quote_preparation: { label: "Offerte i.v.",            bg: "#F5F3FF", text: "#8B5CF6" },
  awaiting_approval: { label: "Wacht op goedkeuring",    bg: "#FFFBEB", text: "#B45309" },
  approved:          { label: "Goedgekeurd",             bg: "#ECFDF5", text: "#10B981" },
  plannable:         { label: "Inplanbaar",              bg: "#FFF7ED", text: "#EA580C" },
  scheduled:         { label: "Ingepland",               bg: "#E0FAFB", text: "#00B7B3" },
  seen:              { label: "Gezien",                  bg: "#ECFEFF", text: "#0891B2" },
  in_progress:       { label: "In uitvoering",           bg: "#F5F3FF", text: "#7C3AED" },
  not_completed:     { label: "Niet afgerond",           bg: "#FEF2F2", text: "#DC2626" },
  completed:         { label: "Afgerond",                bg: "#F0FDF4", text: "#16A34A" },
  report_submitted:  { label: "Rapport ingediend",       bg: "#F0FDFA", text: "#0D9488" },
  report_approved:   { label: "Rapport goedgekeurd",     bg: "#DCFCE7", text: "#15803D" },
  invoice_ready:     { label: "Klaar voor facturatie",  bg: "#FFFBEB", text: "#D97706" },
  invoiced:          { label: "Gefactureerd",            bg: "#F8FAFC", text: "#64748B" },
  paid:              { label: "Betaald",                 bg: "#F0FDF4", text: "#166534" },
  closed:            { label: "Gesloten",                bg: "#F1F5F9", text: "#475569" },
};

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<AssignmentPriority, { label: string; bg: string; text: string }> = {
  low:    { label: "Laag",    bg: "#F1F5F9", text: "#64748B" },
  normal: { label: "Normaal", bg: "#EFF6FF", text: "#3B82F6" },
  high:   { label: "Hoog",    bg: "#FFF7ED", text: "#EA580C" },
  urgent: { label: "Urgent",  bg: "#FEF2F2", text: "#DC2626" },
};

// ─── Components ───────────────────────────────────────────────────────────────

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    bg:    "#F1F5F9",
    text:  "#64748B",
  };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

export function AssignmentPriorityBadge({ priority }: { priority: AssignmentPriority }) {
  const cfg = PRIORITY_CONFIG[priority] ?? {
    label: priority,
    bg:    "#F1F5F9",
    text:  "#64748B",
  };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

export function statusLabel(status: AssignmentStatus): string {
  return STATUS_CONFIG[status]?.label ?? status;
}

export function priorityLabel(priority: AssignmentPriority): string {
  return PRIORITY_CONFIG[priority]?.label ?? priority;
}

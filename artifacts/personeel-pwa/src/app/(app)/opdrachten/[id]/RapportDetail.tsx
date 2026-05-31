import { CheckCircle2, Clock, XCircle, FileText } from "lucide-react";
import type { MyReport } from "@/actions/reports";

const STATUS_CONFIG: Record<string, {
  label: string;
  bg: string;
  color: string;
  Icon: React.ElementType;
}> = {
  submitted: { label: "In behandeling", bg: "#FEF3C7", color: "#92400E", Icon: Clock },
  approved:  { label: "Goedgekeurd",    bg: "#DCFCE7", color: "#166534", Icon: CheckCircle2 },
  rejected:  { label: "Afgewezen",      bg: "#FEE2E2", color: "#991B1B", Icon: XCircle },
  draft:     { label: "Concept",        bg: "#F1F5F9", color: "#475569", Icon: FileText },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day:    "numeric",
    month:  "long",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

export function RapportDetail({ report }: { report: MyReport }) {
  const cfg = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.draft;
  const Icon = cfg.Icon;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: "var(--color-primary)" }}>
          Ingediend rapport
        </h3>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: cfg.bg, color: cfg.color }}
        >
          <Icon size={12} />
          {cfg.label}
        </span>
      </div>

      <p className="text-xs" style={{ color: "var(--color-secondary)" }}>
        Ingediend op {formatDate(report.submittedAt)}
      </p>

      {/* Content */}
      <div>
        <p
          className="mb-1 text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-secondary)" }}
        >
          Verslag
        </p>
        <p
          className="text-sm leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--color-primary)" }}
        >
          {report.content}
        </p>
      </div>

      {report.hoursWorked && (
        <div>
          <p
            className="mb-1 text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-secondary)" }}
          >
            Gewerkte uren
          </p>
          <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            {parseFloat(report.hoursWorked).toLocaleString("nl-NL")} uur
          </p>
        </div>
      )}

      {report.submitterNotes && (
        <div>
          <p
            className="mb-1 text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-secondary)" }}
          >
            Opmerkingen
          </p>
          <p
            className="text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--color-primary)" }}
          >
            {report.submitterNotes}
          </p>
        </div>
      )}

      {/* Management feedback */}
      {report.notes && (
        <div
          className="rounded-xl p-3"
          style={{
            backgroundColor: report.status === "approved" ? "#F0FDF4" : "#FEF2F2",
          }}
        >
          <p
            className="mb-1 text-xs font-semibold uppercase tracking-wide"
            style={{ color: report.status === "approved" ? "#166534" : "#991B1B" }}
          >
            Feedback van management
          </p>
          <p
            className="text-sm leading-relaxed"
            style={{ color: report.status === "approved" ? "#166534" : "#991B1B" }}
          >
            {report.notes}
          </p>
          {report.reviewedAt && (
            <p
              className="mt-1.5 text-xs"
              style={{ color: report.status === "approved" ? "#16A34A" : "#DC2626", opacity: 0.8 }}
            >
              Beoordeeld op {formatDate(report.reviewedAt)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

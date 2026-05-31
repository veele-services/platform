import Link from "next/link";
import type { AssignmentHistoryRow, AssignmentStatus } from "@/app/actions/assignments";

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  requested:        "Aangevraagd",
  review:           "Beoordeling",
  quote_preparation:"Offerte opstellen",
  awaiting_approval:"Wacht op goedkeuring",
  approved:         "Goedgekeurd",
  plannable:        "Inplanbaar",
  scheduled:        "Ingepland",
  seen:             "Gezien",
  in_progress:      "In uitvoering",
  not_completed:    "Niet voltooid",
  completed:        "Voltooid",
  report_submitted: "Rapport ingediend",
  report_approved:  "Rapport goedgekeurd",
  invoice_ready:    "Factuur gereed",
  invoiced:         "Gefactureerd",
  paid:             "Betaald",
  closed:           "Gesloten",
};

function statusStyle(status: AssignmentStatus): { bg: string; text: string } {
  switch (status) {
    case "in_progress":
      return { bg: "#E0FAFB", text: "#0A7E7A" };
    case "completed":
    case "report_approved":
    case "paid":
    case "closed":
      return { bg: "#D1FAE5", text: "#065F46" };
    case "not_completed":
      return { bg: "#FEE2E2", text: "#991B1B" };
    case "scheduled":
      return { bg: "#EDE9FE", text: "#5B21B6" };
    case "plannable":
    case "approved":
      return { bg: "#DBEAFE", text: "#1E40AF" };
    case "invoiced":
    case "invoice_ready":
      return { bg: "#FEF3C7", text: "#92400E" };
    default:
      return { bg: "#F1F5F9", text: "#475569" };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  rows:          AssignmentHistoryRow[];
  emptyMessage?: string;
}

export function AssignmentHistoryTable({
  rows,
  emptyMessage = "Geen opdrachten gevonden.",
}: Props) {
  if (rows.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm" style={{ color: "#94A3B8" }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr style={{ borderTop: "1px solid #E2E8F0", borderBottom: "1px solid #E2E8F0" }}>
            <th
              className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
              style={{ color: "#64748B" }}
            >
              Code
            </th>
            <th
              className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
              style={{ color: "#64748B" }}
            >
              Titel
            </th>
            <th
              className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
              style={{ color: "#64748B" }}
            >
              Status
            </th>
            <th
              className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
              style={{ color: "#64748B" }}
            >
              Object
            </th>
            <th
              className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
              style={{ color: "#64748B" }}
            >
              Datum
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const { bg, text } = statusStyle(r.status);
            return (
              <tr
                key={r.id}
                className="transition-colors hover:bg-slate-50/60"
                style={{
                  borderBottom: i < rows.length - 1 ? "1px solid #F1F5F9" : undefined,
                }}
              >
                <td className="px-5 py-3 text-xs font-mono" style={{ color: "#64748B" }}>
                  {r.code}
                </td>
                <td className="px-5 py-3">
                  <Link
                    href={`/assignments/${r.id}`}
                    className="text-sm font-medium hover:underline"
                    style={{ color: "#00B7B3" }}
                  >
                    {r.title}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <span
                    className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: bg, color: text }}
                  >
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                  {r.objectName ?? "—"}
                </td>
                <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                  {r.scheduledDate
                    ? new Date(r.scheduledDate).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

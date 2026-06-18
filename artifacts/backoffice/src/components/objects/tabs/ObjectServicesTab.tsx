import Link from "next/link";
import { ClipboardList } from "lucide-react";
import type { AssignmentHistoryRow } from "@/app/actions/assignments";

interface Props {
  objectId:    string;
  assignments: AssignmentHistoryRow[];
}

const STATUS_LABEL: Record<string, string> = {
  requested:         "Aangevraagd",
  review:            "Beoordeling",
  quote_preparation: "Offerte",
  awaiting_approval: "Wacht op goedkeuring",
  approved:          "Goedgekeurd",
  plannable:         "Planbaar",
  scheduled:         "Ingepland",
  seen:              "Gezien",
  in_progress:       "Bezig",
  not_completed:     "Niet voltooid",
  completed:         "Voltooid",
  report_submitted:  "Rapport ingediend",
  report_approved:   "Rapport goedgekeurd",
  invoice_ready:     "Factuur gereed",
  invoiced:          "Gefactureerd",
  paid:              "Betaald",
  closed:            "Afgesloten",
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  requested:     { bg: "#F1F5F9", color: "#64748B" },
  review:        { bg: "#FEF9C3", color: "#A16207" },
  completed:     { bg: "#DCFCE7", color: "#166534" },
  in_progress:   { bg: "#E0FAFB", color: "#0A7E7A" },
  scheduled:     { bg: "#EDE9FE", color: "#5B21B6" },
  closed:        { bg: "#F1F5F9", color: "#64748B" },
  paid:          { bg: "#DCFCE7", color: "#166534" },
  invoiced:      { bg: "#DBEAFE", color: "#1D4ED8" },
};

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? { bg: "#F1F5F9", color: "#64748B" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function ObjectServicesTab({ objectId, assignments }: Props) {
  if (assignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ClipboardList className="h-10 w-10 mb-3" style={{ color: "#CBD5E1" }} />
        <p className="text-sm font-medium" style={{ color: "#64748B" }}>Geen diensten gevonden</p>
        <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>
          Er zijn nog geen opdrachten gekoppeld aan dit object.
        </p>
        <Link
          href={`/assignments?objectId=${objectId}`}
          className="mt-4 text-sm font-medium hover:underline"
          style={{ color: "#00B7B3" }}
        >
          Alle opdrachten bekijken →
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: "#64748B" }}>
          {assignments.length} dienst{assignments.length !== 1 ? "en" : ""}
        </p>
        <Link
          href={`/assignments?objectId=${objectId}`}
          className="text-xs font-medium hover:underline"
          style={{ color: "#00B7B3" }}
        >
          Alle bekijken →
        </Link>
      </div>

      <div className="veele-card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
              {(["Code", "Omschrijving", "Status", "Gepland op"] as const).map((h) => (
                <th
                  key={h}
                  className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assignments.map((a, i) => (
              <tr
                key={a.id}
                className="transition-colors hover:bg-slate-50/60"
                style={{ borderBottom: i < assignments.length - 1 ? "1px solid #F1F5F9" : undefined }}
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/assignments/${a.id}`}
                    className="font-mono text-xs rounded px-1.5 py-0.5 bg-slate-100 hover:underline"
                    style={{ color: "#475569" }}
                  >
                    {a.code}
                  </Link>
                </td>
                <td className="px-5 py-3 text-sm font-medium" style={{ color: "#081D3A" }}>
                  {a.title ?? "—"}
                </td>
                <td className="px-5 py-3">
                  <StatusPill status={a.status} />
                </td>
                <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                  {a.scheduledDate
                    ? new Date(a.scheduledDate).toLocaleDateString("nl-NL", {
                        day: "numeric", month: "short", year: "numeric",
                      })
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

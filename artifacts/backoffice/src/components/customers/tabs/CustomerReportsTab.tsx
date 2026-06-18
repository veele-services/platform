import Link from "next/link";
import type { ReportRow } from "@/app/actions/reports";

const STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  submitted: "Ingediend",
  approved: "Goedgekeurd",
  rejected: "Afgewezen",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#F8FAFC", text: "#64748B" },
  submitted: { bg: "#EFF6FF", text: "#2563EB" },
  approved: { bg: "#ECFDF5", text: "#059669" },
  rejected: { bg: "#FEF2F2", text: "#DC2626" },
};

interface Props {
  customerId: string;
  reports: ReportRow[];
}

export function CustomerReportsTab({ customerId, reports }: Props) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: "#64748B" }}>
          {reports.length} rapport{reports.length !== 1 ? "en" : ""} (laatste 25)
        </p>
        <Link
          href={`/reports?customerId=${customerId}`}
          className="text-xs font-medium hover:underline"
          style={{ color: "#00B7B3" }}
        >
          Alle bekijken -&gt;
        </Link>
      </div>

      <div className="veele-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Opdracht</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Titel</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Ingediend door</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Datum</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Uren</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm" style={{ color: "#94A3B8" }}>
                    Nog geen rapporten voor deze klant.
                  </td>
                </tr>
              ) : (
                reports.map((report, i) => {
                  const colors = STATUS_COLORS[report.status] ?? STATUS_COLORS.draft;
                  return (
                    <tr
                      key={report.id}
                      className="transition-colors hover:bg-slate-50/60"
                      style={{ borderBottom: i < reports.length - 1 ? "1px solid #F1F5F9" : undefined }}
                    >
                      <td className="px-5 py-3 text-sm font-mono font-medium">
                        <Link href={`/reports/${report.id}`} className="hover:underline" style={{ color: "#00B7B3" }}>
                          {report.assignmentCode}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#081D3A" }}>{report.assignmentTitle}</td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                        >
                          {STATUS_LABELS[report.status] ?? report.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>{report.submittedByName}</td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                        {new Date(report.submittedAt).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>{report.hoursWorked ?? "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

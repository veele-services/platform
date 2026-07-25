import Link from "next/link";
import type { ReportRow } from "@/app/actions/reports";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";

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
          style={{ color: "var(--color-primary)" }}
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
                reports.map((report, i) => (
                    <tr
                      key={report.id}
                      className="transition-colors hover:bg-slate-50/60"
                      style={{ borderBottom: i < reports.length - 1 ? "1px solid #F1F5F9" : undefined }}
                    >
                      <td className="px-5 py-3 text-sm font-mono font-medium">
                        <Link href={`/reports/${report.id}`} className="hover:underline" style={{ color: "var(--color-primary)" }}>
                          {report.assignmentCode}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: "var(--color-foreground)" }}>{report.assignmentTitle}</td>
                      <td className="px-5 py-3">
                        <ProcessStatusBadge kind="report" status={report.status} />
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>{report.submittedByName}</td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                        {new Date(report.submittedAt).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>{report.hoursWorked ?? "-"}</td>
                    </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

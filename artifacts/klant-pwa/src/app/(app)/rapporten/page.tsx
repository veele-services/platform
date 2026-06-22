export const dynamic = "force-dynamic";

import { FileCheck2 } from "lucide-react";
import { getMyReports } from "@/actions/reports";
import { RapportCard } from "@/components/RapportCard";
import { PageShell } from "@/components/PageShell";

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function RapportenPage() {
  const reports = await getMyReports();

  return (
    <PageShell
      title="Rapporten"
      subtitle="Goedgekeurde werkrapportages en bijbehorende informatie."
    >
      {reports.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <FileCheck2
            size={32}
            className="mx-auto mb-3"
            style={{ color: "#94A3B8" }}
          />
          <p
            className="text-sm font-medium"
            style={{ color: "var(--color-primary)" }}
          >
            Nog geen goedgekeurde rapporten
          </p>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-secondary)" }}
          >
            Rapporten verschijnen hier zodra ze zijn goedgekeurd door de
            beheerder.
          </p>
        </div>
      ) : (
        <>
          <div
            className="hidden overflow-x-auto rounded-[22px] border bg-white shadow-sm md:block"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div
              className="grid grid-cols-[minmax(18rem,1.5fr)_10rem_8rem_minmax(18rem,1fr)] gap-4 border-b px-5 py-3 text-xs font-black uppercase tracking-[0.08em]"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-secondary)",
              }}
            >
              <span>Rapport</span>
              <span>Datum</span>
              <span>Uren</span>
              <span>Samenvatting</span>
            </div>
            <div
              className="divide-y"
              style={{ borderColor: "var(--color-border)" }}
            >
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="grid grid-cols-[minmax(18rem,1.5fr)_10rem_8rem_minmax(18rem,1fr)] items-start gap-4 px-5 py-4"
                >
                  <span className="min-w-0">
                    <span
                      className="block truncate text-sm font-black"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {report.assignmentTitle}
                    </span>
                    <span
                      className="mt-0.5 block text-xs font-semibold"
                      style={{ color: "var(--color-muted-fg)" }}
                    >
                      Goedgekeurd werkrapport
                    </span>
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {formatDate(report.submittedAt)}
                  </span>
                  <span
                    className="text-sm font-bold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {report.hoursWorked
                      ? `${parseFloat(report.hoursWorked).toLocaleString("nl-NL")} uur`
                      : "-"}
                  </span>
                  <span
                    className="line-clamp-2 text-sm font-semibold leading-5"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {report.content}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {reports.map((report) => (
              <RapportCard key={report.id} report={report} />
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}

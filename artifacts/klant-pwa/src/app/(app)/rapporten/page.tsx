export const dynamic = "force-dynamic";

import { FileCheck2 } from "lucide-react";
import { getMyReports } from "@/actions/reports";
import { RapportCard } from "@/components/RapportCard";
import { PageShell } from "@/components/PageShell";

export default async function RapportenPage() {
  const reports = await getMyReports();

  return (
    <PageShell title="Rapporten" subtitle="Goedgekeurde werkrapportages en bijbehorende informatie.">
      {reports.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <FileCheck2 size={32} className="mx-auto mb-3" style={{ color: "#94A3B8" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            Nog geen goedgekeurde rapporten
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-secondary)" }}>
            Rapporten verschijnen hier zodra ze zijn goedgekeurd door de beheerder.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {reports.map((report) => (
            <RapportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

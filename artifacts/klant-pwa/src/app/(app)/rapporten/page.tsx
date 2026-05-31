import { FileCheck2 } from "lucide-react";
import { getMyReports } from "@/actions/reports";
import { RapportCard } from "@/components/RapportCard";

export default async function RapportenPage() {
  const reports = await getMyReports();

  return (
    <div className="space-y-4 p-4 md:p-0">
      <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
        Rapporten
      </h1>

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
        <div className="space-y-3">
          {reports.map((report) => (
            <RapportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  );
}

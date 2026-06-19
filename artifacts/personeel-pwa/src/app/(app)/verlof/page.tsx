export const dynamic = "force-dynamic";

import { getMyLeavePeriods } from "@/actions/leave";
import { MobilePageShell } from "@/components/MobilePageShell";
import { VerlofForm } from "./VerlofForm";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  vakantie: "Vakantie",
  ziekte: "Ziekte",
  overig: "Overig",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "In behandeling",
  approved: "Goedgekeurd",
  rejected: "Afgewezen",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  approved: "#10B981",
  rejected: "#EF4444",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export default async function VerlofPage() {
  const periods = await getMyLeavePeriods();

  return (
    <MobilePageShell
      title="Verlof"
      subtitle="Vraag verlof aan en bekijk je verlofhistorie."
    >
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-4 font-semibold" style={{ color: "var(--color-primary)" }}>
          Nieuwe aanvraag
        </h2>
        <VerlofForm />
      </div>

      {periods.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold" style={{ color: "var(--color-primary)" }}>
            Mijn verlofhistorie
          </h2>
          <div className="space-y-2">
            {periods.map((p) => (
              <div
                key={p.id}
                className="rounded-xl p-3"
                style={{ backgroundColor: "var(--color-muted)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
                      {LEAVE_TYPE_LABELS[p.leaveType] ?? p.leaveType}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--color-secondary)" }}>
                      {formatDate(p.startDate)}
                      {p.endDate && p.endDate !== p.startDate && ` – ${formatDate(p.endDate)}`}
                    </p>
                    {p.reason && (
                      <p className="mt-1 text-xs" style={{ color: "var(--color-muted-fg)" }}>
                        {p.reason}
                      </p>
                    )}
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: STATUS_COLORS[p.status] ?? "#64748B" }}
                  >
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </MobilePageShell>
  );
}

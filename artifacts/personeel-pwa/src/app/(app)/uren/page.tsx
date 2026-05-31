import { Clock, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getMyHours } from "@/actions/hours";

type Props = {
  searchParams: Promise<{ month?: string }>;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function UrenPage({ searchParams }: Props) {
  const { month: monthParam } = await searchParams;
  const allMonths = await getMyHours();

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const selectedMonth = monthParam ?? allMonths[0]?.month ?? currentMonthKey;

  const summary = allMonths.find((m) => m.month === selectedMonth);
  const hasPrev = allMonths.some((m) => m.month === prevMonth(selectedMonth));
  const hasNext = allMonths.some((m) => m.month === nextMonth(selectedMonth));

  const totalAllTime = allMonths.reduce((sum, m) => sum + m.totalHours, 0);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
        Mijn uren
      </h1>

      {/* All-time summary */}
      <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "var(--color-primary)" }}>
        <p className="text-xs font-medium uppercase tracking-wide opacity-60 text-white">
          Totaal gewerkte uren
        </p>
        <p className="mt-1 text-3xl font-bold text-white">
          {totalAllTime % 1 === 0 ? totalAllTime.toFixed(0) : totalAllTime.toFixed(1)}u
        </p>
        <p className="mt-0.5 text-xs opacity-50 text-white">
          Uit {allMonths.reduce((s, m) => s + m.entries.length, 0)} goedgekeurde rapporten
        </p>
      </div>

      {allMonths.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <Clock size={32} className="mx-auto mb-3" style={{ color: "var(--color-muted-fg)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            Nog geen uren geregistreerd
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-secondary)" }}>
            Uren worden zichtbaar zodra rapporten zijn goedgekeurd.
          </p>
        </div>
      ) : (
        <>
          {/* Month navigator */}
          <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
            <Link
              href={hasPrev ? `?month=${prevMonth(selectedMonth)}` : "#"}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-opacity"
              style={{
                backgroundColor: hasPrev ? "var(--color-muted)" : "transparent",
                opacity: hasPrev ? 1 : 0.3,
                pointerEvents: hasPrev ? "auto" : "none",
              }}
              aria-disabled={!hasPrev}
            >
              <ChevronLeft size={18} style={{ color: "var(--color-primary)" }} />
            </Link>

            <div className="text-center">
              <p className="font-semibold capitalize" style={{ color: "var(--color-primary)" }}>
                {summary?.label ?? new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString("nl-NL", { month: "long", year: "numeric" })}
              </p>
              {summary && (
                <p className="text-xs" style={{ color: "var(--color-secondary)" }}>
                  {summary.totalHours % 1 === 0 ? summary.totalHours.toFixed(0) : summary.totalHours.toFixed(1)} uur gewerkt
                </p>
              )}
            </div>

            <Link
              href={hasNext ? `?month=${nextMonth(selectedMonth)}` : "#"}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-opacity"
              style={{
                backgroundColor: hasNext ? "var(--color-muted)" : "transparent",
                opacity: hasNext ? 1 : 0.3,
                pointerEvents: hasNext ? "auto" : "none",
              }}
              aria-disabled={!hasNext}
            >
              <ChevronRight size={18} style={{ color: "var(--color-primary)" }} />
            </Link>
          </div>

          {/* Month detail */}
          {!summary ? (
            <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
              <p className="text-sm" style={{ color: "var(--color-secondary)" }}>
                Geen uren in deze maand
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>
                  {summary.entries.length} opdracht{summary.entries.length !== 1 ? "en" : ""}
                </p>
              </div>
              <div className="divide-y" style={{ "--tw-divide-opacity": "1" } as React.CSSProperties}>
                {summary.entries.map((entry) => (
                  <div
                    key={entry.reportId}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" style={{ color: "var(--color-primary)" }}>
                        {entry.assignmentTitle}
                      </p>
                      {entry.scheduledDate && (
                        <p className="mt-0.5 text-xs" style={{ color: "var(--color-muted-fg)" }}>
                          {formatDate(entry.scheduledDate)}
                        </p>
                      )}
                    </div>
                    <div
                      className="shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold"
                      style={{ backgroundColor: "rgba(0,183,179,0.1)", color: "var(--color-accent)" }}
                    >
                      {entry.hoursWorked % 1 === 0
                        ? entry.hoursWorked.toFixed(0)
                        : entry.hoursWorked.toFixed(1)}u
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="flex items-center justify-between px-4 py-3 border-t"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-muted)" }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
                  Totaal
                </p>
                <p className="text-sm font-bold" style={{ color: "var(--color-primary)" }}>
                  {summary.totalHours % 1 === 0
                    ? summary.totalHours.toFixed(0)
                    : summary.totalHours.toFixed(1)} uur
                </p>
              </div>
            </div>
          )}

          {/* Month list (all months) */}
          {allMonths.length > 1 && (
            <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
                Overzicht per maand
              </p>
              <div className="divide-y">
                {allMonths.map((m) => (
                  <Link
                    key={m.month}
                    href={`?month=${m.month}`}
                    className="flex items-center justify-between px-4 py-3"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: m.month === selectedMonth ? "rgba(0,183,179,0.06)" : "transparent",
                    }}
                  >
                    <p className="text-sm capitalize font-medium" style={{ color: "var(--color-primary)" }}>
                      {m.label}
                    </p>
                    <p className="text-sm font-bold" style={{ color: "var(--color-accent)" }}>
                      {m.totalHours % 1 === 0 ? m.totalHours.toFixed(0) : m.totalHours.toFixed(1)}u
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

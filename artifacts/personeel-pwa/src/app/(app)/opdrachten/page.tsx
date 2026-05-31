import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getMyAssignments } from "@/actions/assignments";
import { StatusBadge } from "@/components/StatusBadge";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Geen datum";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

export default async function OpdrachtenPage() {
  const assignments = await getMyAssignments();

  const today = new Date().toISOString().slice(0, 10);
  const active = assignments.filter(
    (a) => ["scheduled", "seen", "in_progress"].includes(a.status),
  );
  const rest = assignments.filter(
    (a) => !["scheduled", "seen", "in_progress"].includes(a.status),
  );

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
        Mijn opdrachten
      </h1>

      {assignments.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-sm" style={{ color: "var(--color-secondary)" }}>
            Geen opdrachten gevonden
          </p>
        </div>
      )}

      {active.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
            Actief
          </h2>
          <div className="space-y-2">
            {active.map((a) => (
              <Link
                key={a.id}
                href={`/opdrachten/${a.id}`}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold" style={{ color: "var(--color-primary)" }}>
                    {a.title}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-secondary)" }}>
                    {formatDate(a.scheduledDate)}
                    {a.scheduledStart && ` · ${a.scheduledStart}`}
                  </p>
                  {(a.objectAddress || a.objectCity) && (
                    <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-muted-fg)" }}>
                      {[a.objectAddress, a.objectCity].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={a.status} />
                  <ChevronRight size={16} style={{ color: "var(--color-muted-fg)" }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
            Overig
          </h2>
          <div className="space-y-2">
            {rest.map((a) => (
              <Link
                key={a.id}
                href={`/opdrachten/${a.id}`}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold" style={{ color: "var(--color-primary)" }}>
                    {a.title}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-secondary)" }}>
                    {formatDate(a.scheduledDate)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={a.status} />
                  <ChevronRight size={16} style={{ color: "var(--color-muted-fg)" }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

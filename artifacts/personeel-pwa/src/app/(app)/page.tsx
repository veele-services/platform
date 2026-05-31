import Link from "next/link";
import { ClipboardList, Calendar, Plane, ChevronRight } from "lucide-react";
import { getMyPersonnel } from "@/actions/personnel";
import { getMyAssignments } from "@/actions/assignments";
import { StatusBadge } from "@/components/StatusBadge";

const TODAY_STATUSES = ["scheduled", "seen", "in_progress"];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

export default async function DashboardPage() {
  const [profile, allAssignments] = await Promise.all([
    getMyPersonnel(),
    getMyAssignments(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const todayAssignments = allAssignments.filter(
    (a) => a.scheduledDate === today && TODAY_STATUSES.includes(a.status),
  );
  const upcomingAssignments = allAssignments
    .filter(
      (a) =>
        a.scheduledDate &&
        a.scheduledDate > today &&
        TODAY_STATUSES.includes(a.status),
    )
    .slice(0, 3);

  const firstName = profile?.firstName ?? "Medewerker";

  return (
    <div className="space-y-4 p-4">
      <div
        className="rounded-2xl p-5 text-white"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <p className="text-sm opacity-70">Goedendag,</p>
        <h1 className="mt-0.5 text-2xl font-bold">{firstName}</h1>
        <p className="mt-1 text-sm opacity-60">
          {new Date().toLocaleDateString("nl-NL", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { href: "/opdrachten", icon: ClipboardList, label: "Opdrachten", count: allAssignments.length },
          { href: "/beschikbaarheid", icon: Calendar, label: "Beschikbaar", count: null },
          { href: "/verlof", icon: Plane, label: "Verlof", count: null },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-center shadow-sm"
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ backgroundColor: "rgba(0,183,179,0.1)" }}
              >
                <Icon size={22} style={{ color: "var(--color-accent)" }} />
              </div>
              {item.count !== null && (
                <span className="text-lg font-bold" style={{ color: "var(--color-primary)" }}>
                  {item.count}
                </span>
              )}
              <span className="text-xs font-medium" style={{ color: "var(--color-secondary)" }}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold" style={{ color: "var(--color-primary)" }}>
            Vandaag
          </h2>
          <Link
            href="/opdrachten"
            className="text-sm font-medium"
            style={{ color: "var(--color-accent)" }}
          >
            Alle opdrachten
          </Link>
        </div>

        {todayAssignments.length === 0 ? (
          <p className="py-4 text-center text-sm" style={{ color: "var(--color-muted-fg)" }}>
            Geen opdrachten voor vandaag
          </p>
        ) : (
          <div className="space-y-2">
            {todayAssignments.map((a) => (
              <Link
                key={a.id}
                href={`/opdrachten/${a.id}`}
                className="flex items-center gap-3 rounded-xl p-3 transition-colors"
                style={{ backgroundColor: "var(--color-muted)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
                    {a.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-secondary)" }}>
                    {[a.scheduledStart, a.objectCity].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <StatusBadge status={a.status} />
                <ChevronRight size={16} style={{ color: "var(--color-muted-fg)" }} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {upcomingAssignments.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold" style={{ color: "var(--color-primary)" }}>
            Aankomend
          </h2>
          <div className="space-y-2">
            {upcomingAssignments.map((a) => (
              <Link
                key={a.id}
                href={`/opdrachten/${a.id}`}
                className="flex items-center gap-3 rounded-xl p-3"
                style={{ backgroundColor: "var(--color-muted)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
                    {a.title}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--color-secondary)" }}>
                    {formatDate(a.scheduledDate)}
                  </p>
                </div>
                <StatusBadge status={a.status} />
                <ChevronRight size={16} style={{ color: "var(--color-muted-fg)" }} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

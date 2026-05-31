import Link from "next/link";
import { ClipboardList, ClipboardCheck, Clock, Calendar, Plane, ChevronRight } from "lucide-react";
import { getMyPersonnel } from "@/actions/personnel";
import { getMyAssignments } from "@/actions/assignments";
import { getOpenAssignments } from "@/actions/open-assignments";
import { getMyHours } from "@/actions/hours";
import { StatusBadge } from "@/components/StatusBadge";

const TODAY_STATUSES = ["scheduled", "seen", "in_progress"];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

export default async function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [profile, allAssignments, openAssignments, allHours] = await Promise.all([
    getMyPersonnel(),
    getMyAssignments(),
    getOpenAssignments(),
    getMyHours(),
  ]);

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

  const openCount          = openAssignments.filter((a) => !a.isAlreadyApplied).length;
  const currentMonthKey    = today.slice(0, 7);
  const currentMonthHours  = allHours.find((m) => m.month === currentMonthKey)?.totalHours ?? 0;

  const firstName = profile?.firstName ?? "Medewerker";

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <p className="text-sm opacity-70">Goedendag,</p>
        <h1 className="mt-0.5 text-2xl font-bold">{firstName}</h1>
        <p className="mt-1 text-sm opacity-60">
          {new Date().toLocaleDateString("nl-NL", {
            weekday: "long",
            day:     "numeric",
            month:   "long",
          })}
        </p>
      </div>

      {/* Quick action tiles — 3 top, 2 bottom */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { href: "/opdrachten",  icon: ClipboardList,  label: "Opdrachten",  count: allAssignments.length,  accent: false },
          { href: "/openstaand",  icon: ClipboardCheck, label: "Openstaand",  count: openCount,               accent: openCount > 0 },
          { href: "/beschikbaarheid", icon: Calendar,   label: "Beschikbaar", count: null,                    accent: false },
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
                style={{
                  backgroundColor: item.accent
                    ? "rgba(0,183,179,0.15)"
                    : "rgba(0,183,179,0.1)",
                }}
              >
                <Icon
                  size={22}
                  style={{ color: item.accent ? "var(--color-accent)" : "var(--color-accent)" }}
                />
              </div>
              {item.count !== null && (
                <span
                  className="text-lg font-bold"
                  style={{ color: item.accent ? "var(--color-accent)" : "var(--color-primary)" }}
                >
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

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/uren"
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-center shadow-sm"
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(0,183,179,0.1)" }}
          >
            <Clock size={22} style={{ color: "var(--color-accent)" }} />
          </div>
          <span className="text-lg font-bold" style={{ color: "var(--color-primary)" }}>
            {currentMonthHours % 1 === 0
              ? currentMonthHours.toFixed(0)
              : currentMonthHours.toFixed(1)}u
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--color-secondary)" }}>
            Uren deze maand
          </span>
        </Link>

        <Link
          href="/verlof"
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-center shadow-sm"
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(0,183,179,0.1)" }}
          >
            <Plane size={22} style={{ color: "var(--color-accent)" }} />
          </div>
          <span className="text-xs font-medium" style={{ color: "var(--color-secondary)" }}>
            Verlof
          </span>
        </Link>
      </div>

      {/* Today's assignments */}
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

      {/* Upcoming */}
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

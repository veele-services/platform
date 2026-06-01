import Link from "next/link";
import { ClipboardList, ClipboardCheck, Clock, Calendar, Plane, ChevronRight, ArrowRight } from "lucide-react";
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

function getDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Goedemorgen";
  if (hour < 18) return "Goedemiddag";
  return "Goedenavond";
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

  const openCount         = openAssignments.filter((a) => !a.isAlreadyApplied).length;
  const currentMonthKey   = today.slice(0, 7);
  const currentMonthHours = allHours.find((m) => m.month === currentMonthKey)?.totalHours ?? 0;
  const firstName         = profile?.firstName ?? "Medewerker";

  return (
    <div className="space-y-4 p-4 md:p-0">

      {/* ── Sfeer-header ─────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-3xl px-5 py-6 text-white"
        style={{
          background: "linear-gradient(135deg, #081D3A 0%, #0F2E5C 55%, #143A73 100%)",
        }}
      >
        {/* Decoratieve cirkels op achtergrond */}
        <span
          className="pointer-events-none absolute -right-6 -top-6 rounded-full opacity-10"
          style={{ width: "120px", height: "120px", backgroundColor: "#00B7B3" }}
        />
        <span
          className="pointer-events-none absolute -bottom-8 right-16 rounded-full opacity-10"
          style={{ width: "80px", height: "80px", backgroundColor: "#F97316" }}
        />

        <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.65)" }}>
          {getDayGreeting()},
        </p>
        <h1 className="mt-0.5 text-3xl font-bold tracking-tight">{firstName}</h1>
        <p className="mt-2 text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
          {new Date().toLocaleDateString("nl-NL", {
            weekday: "long",
            day:     "numeric",
            month:   "long",
          })}
        </p>

        {/* Vandaag-samenvatting in de header */}
        {todayAssignments.length > 0 && (
          <div
            className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold"
            style={{ backgroundColor: "rgba(249,115,22,0.25)", color: "#FED7AA" }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "#F97316" }}
            />
            {todayAssignments.length === 1
              ? "1 opdracht vandaag"
              : `${todayAssignments.length} opdrachten vandaag`}
          </div>
        )}
      </div>

      {/* ── Quick-action tegels ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/opdrachten"
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-center shadow-sm active:scale-95 transition-transform"
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(0,183,179,0.12)" }}
          >
            <ClipboardList size={22} style={{ color: "var(--color-accent)" }} />
          </div>
          <span className="text-lg font-bold" style={{ color: "var(--color-primary)" }}>
            {allAssignments.length}
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--color-secondary)" }}>
            Opdrachten
          </span>
        </Link>

        {/* Openstaand — oranje-amber als er iets is */}
        <Link
          href="/openstaand"
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-center shadow-sm active:scale-95 transition-transform"
          style={
            openCount > 0
              ? { boxShadow: "0 0 0 2px rgba(249,115,22,0.3), 0 1px 3px rgba(0,0,0,0.07)" }
              : undefined
          }
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{
              backgroundColor: openCount > 0
                ? "var(--color-action-muted)"
                : "rgba(100,116,139,0.1)",
            }}
          >
            <ClipboardCheck
              size={22}
              style={{ color: openCount > 0 ? "var(--color-action)" : "var(--color-secondary)" }}
            />
          </div>
          <span
            className="text-lg font-bold"
            style={{ color: openCount > 0 ? "var(--color-action)" : "var(--color-primary)" }}
          >
            {openCount}
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--color-secondary)" }}>
            Openstaand
          </span>
        </Link>

        <Link
          href="/beschikbaarheid"
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-center shadow-sm active:scale-95 transition-transform"
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(0,183,179,0.12)" }}
          >
            <Calendar size={22} style={{ color: "var(--color-accent)" }} />
          </div>
          <span className="text-xs font-medium mt-3" style={{ color: "var(--color-secondary)" }}>
            Beschikbaar
          </span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/uren"
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-center shadow-sm active:scale-95 transition-transform"
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(0,183,179,0.12)" }}
          >
            <Clock size={22} style={{ color: "var(--color-accent)" }} />
          </div>
          <span className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
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
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-center shadow-sm active:scale-95 transition-transform"
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(0,183,179,0.12)" }}
          >
            <Plane size={22} style={{ color: "var(--color-accent)" }} />
          </div>
          <span className="text-xs font-medium mt-3" style={{ color: "var(--color-secondary)" }}>
            Verlof aanvragen
          </span>
        </Link>
      </div>

      {/* ── Vandaag ───────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-white shadow-sm overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2 className="font-bold text-base" style={{ color: "var(--color-primary)" }}>
            Vandaag
          </h2>
          <Link
            href="/opdrachten"
            className="flex items-center gap-1 text-sm font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            Alles <ArrowRight size={14} />
          </Link>
        </div>

        {todayAssignments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "var(--color-muted)" }}
            >
              <ClipboardList size={22} style={{ color: "var(--color-muted-fg)" }} />
            </span>
            <p className="text-sm font-medium" style={{ color: "var(--color-secondary)" }}>
              Geen opdrachten vandaag
            </p>
            <p className="text-xs" style={{ color: "var(--color-muted-fg)" }}>
              Bekijk openstaande opdrachten om je beschikbaar te stellen.
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {todayAssignments.map((a) => (
              <Link
                key={a.id}
                href={`/opdrachten/${a.id}`}
                className="flex items-center gap-3 px-4 py-4 active:bg-slate-50 transition-colors"
              >
                {/* Accent strip */}
                <span
                  className="shrink-0 rounded-full self-stretch"
                  style={{
                    width:           "4px",
                    minHeight:       "40px",
                    backgroundColor: "var(--color-action)",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold" style={{ color: "var(--color-primary)" }}>
                    {a.title}
                  </p>
                  <p className="mt-0.5 truncate text-sm" style={{ color: "var(--color-secondary)" }}>
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

      {/* ── Aankomend ─────────────────────────────────────────────── */}
      {upcomingAssignments.length > 0 && (
        <div className="rounded-3xl bg-white shadow-sm overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "var(--color-border)" }}
          >
            <h2 className="font-bold text-base" style={{ color: "var(--color-primary)" }}>
              Aankomend
            </h2>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {upcomingAssignments.map((a) => (
              <Link
                key={a.id}
                href={`/opdrachten/${a.id}`}
                className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 transition-colors"
              >
                <div
                  className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl text-center"
                  style={{ backgroundColor: "rgba(0,183,179,0.1)" }}
                >
                  <span className="text-xs font-bold leading-none" style={{ color: "var(--color-accent)" }}>
                    {a.scheduledDate
                      ? new Date(a.scheduledDate + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric" })
                      : "—"}
                  </span>
                  <span className="text-[9px] font-medium uppercase" style={{ color: "var(--color-accent)" }}>
                    {a.scheduledDate
                      ? new Date(a.scheduledDate + "T00:00:00").toLocaleDateString("nl-NL", { month: "short" })
                      : ""}
                  </span>
                </div>
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

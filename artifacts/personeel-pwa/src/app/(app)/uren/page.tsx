export const dynamic = "force-dynamic";

import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { getMyWeeklyHours } from "@/actions/hours";
import { getMyAssignmentsAwaitingReport } from "@/actions/reports";
import { MobilePageShell } from "@/components/MobilePageShell";
import { UrenRapportForm } from "./UrenRapportForm";

type Props = {
  searchParams: Promise<{ week?: string }>;
};

function formatHours(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

function formatDateKey(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("nl-NL", options);
}

function formatDayLabel(dateKey: string): string {
  const label = formatDateKey(dateKey, {
    weekday: "long",
    day:     "numeric",
    month:   "long",
    year:    "numeric",
  });

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatCompactDate(dateKey: string | null): string {
  if (!dateKey) return "";
  return formatDateKey(dateKey, { day: "numeric", month: "short" });
}

function formatWeekRange(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const sameMonth = startDate.getMonth() === endDate.getMonth()
    && startDate.getFullYear() === endDate.getFullYear();

  if (sameMonth) {
    const monthYear = endDate.toLocaleDateString("nl-NL", {
      month: "long",
      year:  "numeric",
    });
    return `${startDate.getDate()} - ${endDate.getDate()} ${monthYear}`;
  }

  return `${formatCompactDate(start)} - ${endDate.toLocaleDateString("nl-NL", {
    day:   "numeric",
    month: "short",
    year:  "numeric",
  })}`;
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (start && end) return `${start} - ${end}`;
  if (start) return `Vanaf ${start}`;
  if (end) return `Tot ${end}`;
  return "Tijd niet ingesteld";
}

function todayKeyInAmsterdam(): string {
  const parts = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    year:     "numeric",
    month:    "2-digit",
    day:      "2-digit",
  }).formatToParts(new Date());

  const year  = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day   = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

export default async function UrenPage({ searchParams }: Props) {
  const { week: weekParam } = await searchParams;

  const [weeklyHours, pendingAssignments] = await Promise.all([
    getMyWeeklyHours(weekParam),
    getMyAssignmentsAwaitingReport(),
  ]);

  const todayKey = todayKeyInAmsterdam();

  return (
    <MobilePageShell
      title="Mijn uren"
      subtitle="Bekijk je gewerkte werkbonnen per week."
    >
      <div className="rounded-[22px] bg-white p-3.5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`?week=${weeklyHours.previousWeek}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            aria-label="Vorige week"
          >
            <ChevronLeft size={18} />
          </Link>

          <div className="min-w-0 text-center">
            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
              Weekoverzicht
            </p>
            <p className="mt-0.5 truncate text-[15px] font-black capitalize" style={{ color: "var(--color-primary)" }}>
              {formatWeekRange(weeklyHours.weekStart, weeklyHours.weekEnd)}
            </p>
          </div>

          <Link
            href={`?week=${weeklyHours.nextWeek}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            aria-label="Volgende week"
          >
            <ChevronRight size={18} />
          </Link>
        </div>

        <Link
          href="/uren"
          className="mt-3 flex h-10 items-center justify-center rounded-2xl text-[13px] font-black"
          style={{ backgroundColor: "rgba(0,183,179,0.1)", color: "var(--color-accent)" }}
        >
          Naar huidige week
        </Link>
      </div>

      <div className="rounded-[24px] p-4 shadow-sm" style={{ backgroundColor: "var(--color-primary)" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide text-white/55">
              Totaal deze week
            </p>
            <p className="mt-1 text-[34px] font-black leading-none text-white">
              {formatHours(weeklyHours.totalHours)}
              <span className="ml-1.5 text-[16px] font-black text-white/70">uur</span>
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2 text-right">
            <p className="text-[20px] font-black leading-none text-white">
              {weeklyHours.reportCount}
            </p>
            <p className="mt-1 text-[11px] font-bold text-white/60">
              werkbon{weeklyHours.reportCount === 1 ? "" : "nen"}
            </p>
          </div>
        </div>
      </div>

      {pendingAssignments.length > 0 && (
        <div className="rounded-[22px] bg-white shadow-sm">
          <div
            className="border-b px-4 py-3"
            style={{ borderColor: "var(--color-border)", backgroundColor: "rgba(249,115,22,0.06)" }}
          >
            <p className="text-[14px] font-black" style={{ color: "var(--color-action)" }}>
              Uren indienen ({pendingAssignments.length})
            </p>
            <p className="mt-0.5 text-[12px] font-medium" style={{ color: "var(--color-secondary)" }}>
              Deze opdrachten wachten nog op je urenregistratie.
            </p>
          </div>
          <div className="space-y-3 px-3.5 py-3">
            {pendingAssignments.map((assignment) => (
              <div key={assignment.id}>
                {assignment.scheduledDate && (
                  <p
                    className="mb-1.5 text-[11px] font-bold uppercase tracking-wide"
                    style={{ color: "var(--color-muted-fg)" }}
                  >
                    {formatCompactDate(assignment.scheduledDate)}
                    {assignment.status === "not_completed" && (
                      <span
                        className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-black"
                        style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}
                      >
                        Niet afgerond
                      </span>
                    )}
                  </p>
                )}
                <UrenRapportForm
                  assignmentId={assignment.id}
                  assignmentTitle={assignment.title}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        {weeklyHours.days.map((day) => {
          const isToday = day.date === todayKey;
          const hasEntries = day.entries.length > 0;

          return (
            <details
              key={day.date}
              className="group rounded-[22px] bg-white shadow-sm"
              open={isToday || hasEntries}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[14px] font-black" style={{ color: "var(--color-primary)" }}>
                      {formatDayLabel(day.date)}
                    </p>
                    {isToday && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
                        style={{ backgroundColor: "rgba(0,183,179,0.1)", color: "var(--color-accent)" }}
                      >
                        Vandaag
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                    {formatHours(day.totalHours)} uren
                    <span className="font-medium">
                      {" "}uit {day.entries.length} werkbon{day.entries.length === 1 ? "" : "nen"}
                    </span>
                  </p>
                </div>
                <ChevronDown
                  size={18}
                  className="shrink-0 transition-transform group-open:rotate-180"
                  style={{ color: "var(--color-secondary)" }}
                />
              </summary>

              <div className="border-t px-3.5 pb-3.5 pt-2" style={{ borderColor: "var(--color-border)" }}>
                {hasEntries ? (
                  <div className="space-y-2.5">
                    {day.entries.map((entry) => (
                      <Link
                        key={entry.reportId}
                        href={`/opdrachten/${entry.assignmentId}`}
                        className="block rounded-[18px] border bg-[#F8FAFC] px-3.5 py-3"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: "var(--color-muted-fg)" }}>
                              {entry.assignmentCode}
                            </p>
                            <p className="mt-1 line-clamp-2 text-[14px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
                              {entry.assignmentTitle}
                            </p>
                          </div>
                          <span
                            className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-black"
                            style={{ backgroundColor: "rgba(0,183,179,0.1)", color: "var(--color-accent)" }}
                          >
                            {formatHours(entry.hoursWorked)}u
                          </span>
                        </div>

                        <div className="mt-2.5 grid gap-1.5 text-[12px] font-semibold" style={{ color: "var(--color-secondary)" }}>
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="shrink-0" />
                            <span>{formatTimeRange(entry.scheduledStart, entry.scheduledEnd)}</span>
                          </div>
                          {entry.objectName && (
                            <div className="flex items-center gap-2">
                              <FileText size={14} className="shrink-0" />
                              <span className="truncate">{entry.objectName}</span>
                            </div>
                          )}
                          {entry.objectCity && (
                            <div className="flex items-center gap-2">
                              <MapPin size={14} className="shrink-0" />
                              <span className="truncate">{entry.objectCity}</span>
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[18px] border border-dashed px-4 py-5 text-center" style={{ borderColor: "var(--color-border)" }}>
                    <CalendarDays size={24} className="mx-auto mb-2" style={{ color: "var(--color-muted-fg)" }} />
                    <p className="text-[13px] font-bold" style={{ color: "var(--color-secondary)" }}>
                      Geen gewerkte werkbonnen op deze dag
                    </p>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </MobilePageShell>
  );
}

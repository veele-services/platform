export const dynamic = "force-dynamic";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock,
  ClipboardCheck,
  Newspaper,
} from "lucide-react";
import { getMyPersonnel } from "@/actions/personnel";
import { getMyAssignments, type MyAssignment } from "@/actions/assignments";
import { getOpenAssignments } from "@/actions/open-assignments";
import { getMyNotificationSummary } from "@/actions/notifications";
import { requireCurrentPortalModule } from "@/lib/auth/tenant";

const ACTIVE_ASSIGNMENT_STATUSES = [
  "plannable",
  "scheduled",
  "seen",
  "en_route",
  "in_progress",
];

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getDayGreeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("nl-NL", {
      timeZone: "Europe/Amsterdam",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );

  if (hour < 12) return "Goedemorgen";
  if (hour < 18) return "Goedemiddag";
  return "Goedenavond";
}

function dateValue(dateStr: string | null): number {
  if (!dateStr) return Number.POSITIVE_INFINITY;
  return new Date(`${dateStr}T00:00:00`).getTime();
}

function timeValue(timeStr: string | null): string {
  return timeStr?.slice(0, 5) || "00:00";
}

function formatDate(dateStr: string | null, today: string): string {
  if (!dateStr) return "Datum nog niet bekend";

  const date = new Date(`${dateStr}T00:00:00`);
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);

  const formatted = date.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (dateStr === today)
    return `Vandaag, ${formatted.replace(/^[a-z]+ /i, "")}`;
  if (dateStr === tomorrowKey)
    return `Morgen, ${formatted.replace(/^[a-z]+ /i, "")}`;
  return formatted;
}

function formatTime(start: string | null, end: string | null): string {
  if (start && end) return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
  if (start) return `Vanaf ${start.slice(0, 5)}`;
  return "Tijd nog niet bekend";
}

function getNextAssignment(
  assignments: MyAssignment[],
  today: string,
): MyAssignment | null {
  return (
    assignments
      .filter((assignment) => {
        const assignmentDate =
          assignment.effectiveDate ?? assignment.scheduledDate;
        return (
          Boolean(assignmentDate) &&
          (assignment.isRunning || assignmentDate! >= today) &&
          ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status)
        );
      })
      .sort((a, b) => {
        if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
        const byDate =
          dateValue(a.effectiveDate ?? a.scheduledDate) -
          dateValue(b.effectiveDate ?? b.scheduledDate);
        if (byDate !== 0) return byDate;
        return timeValue(a.effectiveStart).localeCompare(
          timeValue(b.effectiveStart),
        );
      })[0] ?? null
  );
}

type QuickLinkProps = {
  href: string;
  label: string;
  Icon: ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
  badge?: string | number;
};

function QuickLink({ href, label, Icon, badge }: QuickLinkProps) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-14 items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 shadow-sm transition active:scale-[0.98] sm:gap-3"
      style={{
        borderColor: "rgba(226,232,240,0.9)",
        boxShadow: "0 14px 30px rgba(8,29,58,0.06)",
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition"
        style={{
          backgroundColor: "rgba(0,183,179,0.09)",
          color: "var(--color-primary)",
        }}
      >
        <Icon size={17} strokeWidth={2.2} />
      </span>
      <span
        className="min-w-0 flex-1 text-xs font-bold leading-tight sm:text-sm"
        style={{ color: "var(--color-primary)" }}
      >
        {label}
      </span>
      {badge ? (
        <span
          className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
          style={{ backgroundColor: "#EF4444" }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export default async function DashboardPage() {
  const today = todayKey();
  const notificationsEnabled = Boolean(
    await requireCurrentPortalModule("notifications"),
  );

  const [profile, allAssignments, openAssignments, notificationSummary] =
    await Promise.all([
      getMyPersonnel(),
      getMyAssignments(),
      getOpenAssignments(),
      notificationsEnabled
        ? getMyNotificationSummary()
        : Promise.resolve({ unreadCount: 0, recentUnread: [] }),
    ]);

  const firstName = profile?.firstName ?? "Medewerker";
  const nextAssignment = getNextAssignment(allAssignments, today);
  const openCount = openAssignments.filter(
    (assignment) => !assignment.isAlreadyApplied,
  ).length;
  const objectName =
    nextAssignment?.objectName ||
    nextAssignment?.title ||
    "Object nog niet bekend";
  const nextAssignmentHasActualTime = Boolean(
    nextAssignment?.actualStart || nextAssignment?.actualEnd,
  );
  const objectCity = nextAssignment?.objectCity || "Plaats nog niet bekend";

  return (
    <div className="min-h-screen bg-[var(--color-muted)] md:min-h-0">
      <section className="relative z-0 overflow-hidden bg-[var(--color-primary)] px-5 pb-16 pt-4 text-white md:rounded-2xl md:px-6 md:pb-8 md:pt-6">
        <div>
          <h1 className="text-2xl font-semibold leading-tight md:text-[28px]">
            {getDayGreeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm font-normal text-white/70">Welkom terug</p>
        </div>
      </section>

      <section className="relative z-10 -mt-12 grid gap-4 px-3.5 pb-6 md:mt-4 md:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)] md:items-start md:px-0 md:pb-0">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm md:row-span-2">
          <h2
            className="pb-3 text-base font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            Eerstvolgende dienst
          </h2>

          {nextAssignment ? (
            <div>
              <div className="flex gap-3">
                <span
                  className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: "rgba(0,183,179,0.11)",
                    color: "var(--color-accent)",
                  }}
                >
                  <CalendarDays size={20} strokeWidth={2.4} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="grid gap-2.5 sm:gap-3">
                    <span>
                      <span
                        className="block text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: "var(--color-secondary)" }}
                      >
                        Datum
                      </span>
                      <span
                        className="block text-base font-semibold leading-tight"
                        style={{ color: "var(--color-primary)" }}
                      >
                        {formatDate(
                          nextAssignment.effectiveDate ??
                            nextAssignment.scheduledDate,
                          today,
                        )}
                      </span>
                    </span>

                    <span>
                      <span
                        className="block text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: "var(--color-secondary)" }}
                      >
                        Tijd
                      </span>
                      <span
                        className="block text-base font-semibold leading-tight"
                        style={{ color: "var(--color-primary)" }}
                      >
                        {nextAssignmentHasActualTime ? "Werkelijk " : ""}
                        {formatTime(
                          nextAssignment.effectiveStart,
                          nextAssignment.effectiveEnd,
                        )}
                        {nextAssignmentHasActualTime ? (
                          <span
                            className="mt-1 block text-xs font-bold"
                            style={{ color: "var(--color-secondary)" }}
                          >
                            Gepland{" "}
                            {formatTime(
                              nextAssignment.scheduledStart,
                              nextAssignment.scheduledEnd,
                            )}
                          </span>
                        ) : null}
                      </span>
                    </span>

                    <span>
                      <span
                        className="block text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: "var(--color-secondary)" }}
                      >
                        Object
                      </span>
                      <span
                        className="block truncate text-base font-semibold leading-tight"
                        style={{ color: "var(--color-primary)" }}
                      >
                        {objectName}
                      </span>
                      <span
                        className="mt-1 block text-sm font-medium sm:text-base"
                        style={{ color: "var(--color-secondary)" }}
                      >
                        {objectCity}
                      </span>
                    </span>
                  </span>
                </span>
              </div>

              <Link
                href={`/opdrachten/${nextAssignment.id}`}
                className="mt-4 flex min-h-11 items-center justify-center rounded-xl text-sm font-medium text-white active:scale-[0.99]"
                style={{
                  background:
                    "linear-gradient(135deg, #0FBDB8 0%, #089DA6 100%)",
                }}
              >
                Bekijk details
              </Link>
            </div>
          ) : (
            <div
              className="rounded-[18px] border bg-white p-3.5 text-center shadow-sm sm:p-5"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div
                className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl"
                style={{
                  backgroundColor: "rgba(0,183,179,0.09)",
                  color: "var(--color-accent)",
                }}
              >
                <CalendarDays size={18} strokeWidth={2.4} />
              </div>
              <p
                className="mt-2.5 text-sm font-semibold sm:mt-3 sm:text-base"
                style={{ color: "var(--color-primary)" }}
              >
                Geen dienst gepland
              </p>
              <p
                className="mt-1 text-xs leading-relaxed sm:text-sm"
                style={{ color: "var(--color-secondary)" }}
              >
                Bekijk open diensten om je beschikbaar te stellen.
              </p>
              <Link
                href="/openstaand"
                className="mt-3.5 flex h-11 items-center justify-center rounded-2xl text-sm font-semibold text-white sm:mt-5 sm:h-14 sm:text-base"
                style={{
                  background:
                    "linear-gradient(135deg, #0FBDB8 0%, #089DA6 100%)",
                }}
              >
                Open diensten bekijken
              </Link>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
          <h2
            className="mb-3 text-base font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            Snelle acties
          </h2>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-1 xl:grid-cols-2">
            <QuickLink
              href="/opdrachten"
              label="Mijn planning"
              Icon={CalendarDays}
            />
            <QuickLink
              href="/openstaand"
              label="Open diensten"
              Icon={ClipboardCheck}
              badge={openCount || undefined}
            />
            <QuickLink href="/uren" label="Uren registreren" Icon={Clock} />
            {notificationsEnabled ? (
              <QuickLink
                href="/meldingen"
                label="Meldingen"
                Icon={Bell}
                badge={notificationSummary.unreadCount || undefined}
              />
            ) : null}
          </div>
        </div>

        <Link
          href="/nieuws"
          className="flex min-h-14 items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 shadow-sm"
          style={{
            borderColor: "rgba(226,232,240,0.9)",
            boxShadow: "0 14px 30px rgba(8,29,58,0.05)",
          }}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EEF6FF] text-[#2563EB] sm:h-11 sm:w-11 sm:rounded-2xl">
            <Newspaper size={17} strokeWidth={2.3} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block text-sm font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              Laatste nieuws
            </span>
            <span
              className="block truncate text-sm"
              style={{ color: "var(--color-secondary)" }}
            >
              Updates en meldingen verschijnen hier.
            </span>
          </span>
          <ChevronRight size={20} style={{ color: "var(--color-secondary)" }} />
        </Link>
      </section>
    </div>
  );
}

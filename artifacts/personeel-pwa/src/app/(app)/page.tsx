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
  UserCircle,
} from "lucide-react";
import { getMyPersonnel } from "@/actions/personnel";
import { getMyAssignments, type MyAssignment } from "@/actions/assignments";
import { getOpenAssignments } from "@/actions/open-assignments";

const ACTIVE_ASSIGNMENT_STATUSES = ["scheduled", "seen", "in_progress"];

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year:     "numeric",
    month:    "2-digit",
    day:      "2-digit",
  }).format(new Date());
}

function getDayGreeting(): string {
  const hour = Number(new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour:     "numeric",
    hour12:   false,
  }).format(new Date()));

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
  const tomorrow = new Date(`${today}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);

  const formatted = date.toLocaleDateString("nl-NL", {
    weekday: "long",
    day:     "numeric",
    month:   "long",
  });

  if (dateStr === today) return `Vandaag, ${formatted.replace(/^[a-z]+ /i, "")}`;
  if (dateStr === tomorrowKey) return `Morgen, ${formatted.replace(/^[a-z]+ /i, "")}`;
  return formatted;
}

function formatTime(start: string | null, end: string | null): string {
  if (start && end) return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
  if (start) return `Vanaf ${start.slice(0, 5)}`;
  return "Tijd nog niet bekend";
}

function getNextAssignment(assignments: MyAssignment[], today: string): MyAssignment | null {
  return assignments
    .filter((assignment) =>
      assignment.scheduledDate &&
      assignment.scheduledDate >= today &&
      ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status),
    )
    .sort((a, b) => {
      const byDate = dateValue(a.scheduledDate) - dateValue(b.scheduledDate);
      if (byDate !== 0) return byDate;
      return timeValue(a.scheduledStart).localeCompare(timeValue(b.scheduledStart));
    })[0] ?? null;
}

type QuickLinkProps = {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  badge?: string | number;
};

function QuickLink({ href, label, Icon, badge }: QuickLinkProps) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-20 items-center gap-3 rounded-2xl border bg-white px-4 py-4 shadow-sm transition active:scale-[0.98]"
      style={{ borderColor: "rgba(226,232,240,0.9)", boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition"
        style={{ backgroundColor: "rgba(0,183,179,0.09)", color: "var(--color-primary)" }}
      >
        <Icon size={22} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1 text-sm font-bold leading-tight" style={{ color: "var(--color-primary)" }}>
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

  const [profile, allAssignments, openAssignments] = await Promise.all([
    getMyPersonnel(),
    getMyAssignments(),
    getOpenAssignments(),
  ]);

  const firstName = profile?.firstName ?? "Medewerker";
  const nextAssignment = getNextAssignment(allAssignments, today);
  const openCount = openAssignments.filter((assignment) => !assignment.isAlreadyApplied).length;
  const objectName = nextAssignment?.objectName || nextAssignment?.title || "Object nog niet bekend";
  const objectCity = nextAssignment?.objectCity || "Plaats nog niet bekend";

  return (
    <div className="min-h-screen bg-[#F6F8FB] md:rounded-[32px] md:bg-white">
      <section
        className="relative overflow-hidden px-6 pb-28 pt-9 text-white md:rounded-[32px]"
        style={{ background: "linear-gradient(180deg, #06224A 0%, #061F44 100%)" }}
      >
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="Veele Services home">
            <span className="relative flex h-12 w-12 items-center justify-center">
              <span
                className="absolute h-11 w-3 -rotate-[24deg] rounded-full"
                style={{ backgroundColor: "#00B7B3" }}
              />
              <span className="absolute h-11 w-3 rotate-[24deg] rounded-full bg-white" />
            </span>
            <span className="leading-none">
              <span className="block text-[22px] font-black tracking-[0.22em]">VEELE</span>
              <span className="mt-1 block text-[10px] font-bold tracking-[0.42em]" style={{ color: "#BFECEA" }}>
                SERVICES
              </span>
            </span>
          </Link>

          <Link
            href="/profiel"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#061F44] shadow-lg active:scale-95"
            aria-label="Profiel"
          >
            <UserCircle size={30} strokeWidth={2.5} />
          </Link>
        </div>

        <div className="mt-12">
          <h1 className="text-[34px] font-black leading-tight tracking-tight">
            {getDayGreeting()}, {firstName}
          </h1>
          <p className="mt-3 text-[22px] font-medium leading-none" style={{ color: "rgba(255,255,255,0.72)" }}>
            Welkom terug
          </p>
        </div>
      </section>

      <section className="-mt-20 space-y-8 px-5 pb-8">
        <div className="rounded-[24px] bg-white p-4 shadow-xl" style={{ boxShadow: "0 22px 55px rgba(8,29,58,0.14)" }}>
          <h2 className="px-1 pb-4 text-xl font-black" style={{ color: "var(--color-primary)" }}>
            Eerstvolgende dienst
          </h2>

          {nextAssignment ? (
            <div className="rounded-[18px] border bg-white p-4 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
              <Link href={`/opdrachten/${nextAssignment.id}`} className="flex gap-4">
                <span
                  className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: "rgba(0,183,179,0.11)", color: "var(--color-accent)" }}
                >
                  <CalendarDays size={22} strokeWidth={2.4} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="grid gap-3">
                    <span>
                      <span className="block text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
                        Datum
                      </span>
                      <span className="block text-lg font-black leading-tight" style={{ color: "var(--color-primary)" }}>
                        {formatDate(nextAssignment.scheduledDate, today)}
                      </span>
                    </span>

                    <span>
                      <span className="block text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
                        Tijd
                      </span>
                      <span className="block text-lg font-black leading-tight" style={{ color: "var(--color-primary)" }}>
                        {formatTime(nextAssignment.scheduledStart, nextAssignment.scheduledEnd)}
                      </span>
                    </span>

                    <span>
                      <span className="block text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
                        Object
                      </span>
                      <span className="block truncate text-[21px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
                        {objectName}
                      </span>
                      <span className="mt-1 block text-base font-medium" style={{ color: "var(--color-secondary)" }}>
                        {objectCity}
                      </span>
                    </span>
                  </span>
                </span>

                <ChevronRight className="mt-3 shrink-0" size={24} strokeWidth={2.4} />
              </Link>

              <Link
                href={`/opdrachten/${nextAssignment.id}`}
                className="mt-5 flex h-14 items-center justify-center rounded-2xl text-base font-black text-white shadow-md active:scale-[0.99]"
                style={{ background: "linear-gradient(135deg, #0FBDB8 0%, #089DA6 100%)" }}
              >
                Bekijk details
              </Link>
            </div>
          ) : (
            <div className="rounded-[18px] border bg-white p-5 text-center shadow-sm" style={{ borderColor: "var(--color-border)" }}>
              <div
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ backgroundColor: "rgba(0,183,179,0.09)", color: "var(--color-accent)" }}
              >
                <CalendarDays size={24} strokeWidth={2.4} />
              </div>
              <p className="mt-3 text-base font-black" style={{ color: "var(--color-primary)" }}>
                Geen dienst gepland
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--color-secondary)" }}>
                Bekijk open diensten om je beschikbaar te stellen.
              </p>
              <Link
                href="/openstaand"
                className="mt-5 flex h-14 items-center justify-center rounded-2xl text-base font-black text-white"
                style={{ background: "linear-gradient(135deg, #0FBDB8 0%, #089DA6 100%)" }}
              >
                Open diensten bekijken
              </Link>
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-4 text-xl font-black" style={{ color: "var(--color-primary)" }}>
            Snelle acties
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickLink href="/opdrachten" label="Mijn planning" Icon={CalendarDays} />
            <QuickLink href="/openstaand" label="Open diensten" Icon={ClipboardCheck} badge={openCount || undefined} />
            <QuickLink href="/uren" label="Uren registreren" Icon={Clock} />
            <QuickLink href="/nieuws" label="Nieuws" Icon={Bell} />
          </div>
        </div>

        <Link
          href="/nieuws"
          className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-4 shadow-sm"
          style={{ borderColor: "rgba(226,232,240,0.9)", boxShadow: "0 14px 30px rgba(8,29,58,0.05)" }}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF6FF] text-[#2563EB]">
            <Newspaper size={22} strokeWidth={2.3} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black" style={{ color: "var(--color-primary)" }}>
              Laatste nieuws
            </span>
            <span className="block truncate text-sm" style={{ color: "var(--color-secondary)" }}>
              Updates en meldingen verschijnen hier.
            </span>
          </span>
          <ChevronRight size={20} style={{ color: "var(--color-secondary)" }} />
        </Link>
      </section>
    </div>
  );
}

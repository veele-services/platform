export const dynamic = "force-dynamic";

import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { getMyAssignments, type MyAssignment } from "@/actions/assignments";
import { PlanningWeekStrip, type PlanningWeekDay } from "@/components/PlanningWeekStrip";
import { RealtimeStatusDot } from "@/components/RealtimeStatusDot";
import { FAILED_FINAL_STATUSES, FINISHED_STATUSES } from "./[id]/work-order-data";

type PlanningStatus = "NIEUW" | "GEZIEN" | "ONDERWEG" | "GESTART" | "AFGEROND" | "NIET AFGEROND";

type Props = {
  searchParams: Promise<{
    date?: string;
  }>;
};

const STATUS_STYLES: Record<PlanningStatus, { background: string; color: string }> = {
  NIEUW:          { background: "#EAF5FF", color: "#2563A9" },
  GEZIEN:         { background: "#E9FBF5", color: "#139873" },
  ONDERWEG:       { background: "#CCFBF1", color: "#115E59" },
  GESTART:        { background: "#FFF4D8", color: "#C68212" },
  AFGEROND:       { background: "#E6F8ED", color: "#249357" },
  "NIET AFGEROND": { background: "#FEE2E2", color: "#DC2626" },
};

const DAY_LABELS = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];
const DAYS_BEFORE_SELECTED = 14;
const TOTAL_PLANNING_DAYS = 35;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year:     "numeric",
    month:    "2-digit",
    day:      "2-digit",
  }).format(new Date());
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isValidDateKey(value: string | null | undefined): value is string {
  if (!value || !DATE_KEY_PATTERN.test(value)) return false;
  return !Number.isNaN(parseDateKey(value).getTime());
}

function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildPlanningHref(dateKey: string): string {
  return `/opdrachten?date=${encodeURIComponent(dateKey)}`;
}

function getPlanningDays(selectedDateKey: string): PlanningWeekDay[] {
  const selectedDate = parseDateKey(selectedDateKey);
  const firstDate = new Date(selectedDate);
  firstDate.setUTCDate(selectedDate.getUTCDate() - DAYS_BEFORE_SELECTED);

  return Array.from({ length: TOTAL_PLANNING_DAYS }, (_, index) => {
    const date = new Date(firstDate);
    date.setUTCDate(firstDate.getUTCDate() + index);
    const key = formatDateKey(date);

    return {
      key,
      label:    DAY_LABELS[date.getUTCDay()],
      day:      date.getUTCDate(),
      isActive: key === selectedDateKey,
      href:     buildPlanningHref(key),
    };
  });
}

function formatSelectedDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("nl-NL", {
    weekday: "long",
    day:     "numeric",
    month:   "long",
    year:    "numeric",
  });
}

function formatTime(start: string | null, end: string | null): string {
  if (start && end) return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
  if (start) return `Vanaf ${start.slice(0, 5)}`;
  if (end) return `Tot ${end.slice(0, 5)}`;
  return "Tijd nog niet bekend";
}

function timeValue(value: string | null): string {
  return value?.slice(0, 5) ?? "99:99";
}

function getPlanningStatus(assignment: MyAssignment): PlanningStatus {
  if (FAILED_FINAL_STATUSES.has(assignment.status)) return "NIET AFGEROND";
  if (FINISHED_STATUSES.has(assignment.status)) return "AFGEROND";
  if (assignment.status === "in_progress") return "GESTART";
  if (assignment.status === "en_route") return "ONDERWEG";
  if (assignment.status === "seen" || assignment.seenAt) return "GEZIEN";
  return "NIEUW";
}

function isAssignmentNow(assignment: MyAssignment, selectedDateKey: string): boolean {
  if (selectedDateKey !== todayKey()) return false;
  if (assignment.isRunning) return true;
  if (!assignment.effectiveStart || !assignment.effectiveEnd) return false;

  const now = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   false,
  }).format(new Date());

  return assignment.effectiveStart <= now && now <= assignment.effectiveEnd;
}

function StatusPill({ status }: { status: PlanningStatus }) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-semibold tracking-wide"
      style={{ backgroundColor: style.background, color: style.color }}
    >
      {status}
    </span>
  );
}

function PlanningCard({
  assignment,
  selectedDateKey,
}: {
  assignment: MyAssignment;
  selectedDateKey: string;
}) {
  const status = getPlanningStatus(assignment);
  const objectName = assignment.objectName || assignment.title || "Object nog niet bekend";
  const contactName = assignment.contactName || assignment.customerName || "Contactpersoon niet bekend";
  const postalCity = [assignment.objectPostalCode, assignment.objectCity].filter(Boolean).join(" ");
  const address = assignment.objectAddress || "Adres niet bekend";
  const phone = assignment.phone || "Telefoonnummer niet bekend";

  return (
    <Link
      href={`/opdrachten/${assignment.id}`}
      className="relative block rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 shadow-sm active:scale-[0.99]"
      aria-label={`Bekijk werkbon ${assignment.code || assignment.title}`}
      style={{ boxShadow: "0 10px 24px rgba(8,29,58,0.06)" }}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="whitespace-nowrap text-lg font-semibold leading-none" style={{ color: "var(--color-primary)" }}>
            {formatTime(
              assignment.effectiveStart,
              assignment.isRunning ? "nu" : assignment.effectiveEnd,
            )}
          </p>
          <p className="mt-1.5 truncate font-mono text-[12px] font-semibold leading-tight" style={{ color: "var(--color-secondary)" }}>
            {assignment.code || "Werkbon"}
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      {isAssignmentNow(assignment, selectedDateKey) ? (
        <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase" style={{ color: "var(--color-accent)" }}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
          Nu
        </span>
      ) : null}

      <div className="mt-2 min-w-0 pr-8">
        <h2 className="text-[15px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
          {objectName}
        </h2>
        <p className="mt-1 text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
          {contactName}
        </p>
        <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-primary)" }}>
          {address}
        </p>
        {postalCity ? (
          <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-primary)" }}>
            {postalCity}
          </p>
        ) : null}
        <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-primary)" }}>
          {phone}
        </p>
      </div>

      <ChevronRight
        className="absolute right-5 top-1/2 -translate-y-1/2"
        size={24}
        strokeWidth={2.2}
        style={{ color: "#96A3B6" }}
      />
    </Link>
  );
}

export default async function OpdrachtenPage({ searchParams }: Props) {
  const { date } = await searchParams;
  const selectedDateKey = isValidDateKey(date) ? date : todayKey();
  const planningDays = getPlanningDays(selectedDateKey);
  const assignments = await getMyAssignments();
  const selectedAssignments = assignments
    .filter(
      (assignment) =>
        (assignment.effectiveDate ?? assignment.scheduledDate) ===
        selectedDateKey,
    )
    .sort((a, b) => timeValue(a.effectiveStart).localeCompare(timeValue(b.effectiveStart)));
  const unscheduledAssignments = assignments
    .filter(
      (assignment) => !assignment.effectiveDate && !assignment.scheduledDate,
    )
    .sort((a, b) => a.code.localeCompare(b.code));
  const selectedListClassName = "grid gap-3 md:grid-cols-2 xl:grid-cols-3";

  return (
    <div className="min-h-screen bg-[var(--color-muted)] md:min-h-0">
      <section
        className="relative overflow-hidden bg-[var(--color-primary)] px-4 pb-3 pt-4 text-white md:rounded-2xl md:px-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold leading-none">Mijn planning</h1>
            <p className="mt-2 text-[13px] font-semibold capitalize text-white/65">
              {formatSelectedDate(selectedDateKey)}
            </p>
          </div>
          <RealtimeStatusDot />
        </div>

        <PlanningWeekStrip days={planningDays} />
      </section>

      <section className="space-y-4 px-3.5 pb-28 pt-3 md:px-0 md:pb-0 md:pt-4">
        {selectedAssignments.length > 0 ? (
          <div className={selectedListClassName}>
            {selectedAssignments.map((assignment) => (
              <PlanningCard
                key={assignment.id}
                assignment={assignment}
                selectedDateKey={selectedDateKey}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--color-border)] bg-white px-5 py-8 text-center shadow-sm">
            <CalendarDays size={30} className="mx-auto mb-3" style={{ color: "var(--color-muted-fg)" }} />
            <p className="text-[15px] font-semibold" style={{ color: "var(--color-primary)" }}>
              Geen werkbonnen op deze dag
            </p>
            <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-5" style={{ color: "var(--color-secondary)" }}>
              Zodra planning je op een werkbon inplant, verschijnt deze hier op de juiste datum.
            </p>
          </div>
        )}

        {unscheduledAssignments.length > 0 ? (
          <div className="space-y-3 pt-1">
            <div className="px-1">
              <p className="text-[13px] font-semibold" style={{ color: "var(--color-primary)" }}>
                Gekoppeld, nog niet ingepland
              </p>
              <p className="mt-0.5 text-[12px] leading-4" style={{ color: "var(--color-secondary)" }}>
                Deze werkbonnen zijn aan jou gekoppeld, maar hebben nog geen definitieve datum of tijd.
              </p>
            </div>
            <div className={selectedListClassName}>
              {unscheduledAssignments.map((assignment) => (
                <PlanningCard
                  key={assignment.id}
                  assignment={assignment}
                  selectedDateKey={selectedDateKey}
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

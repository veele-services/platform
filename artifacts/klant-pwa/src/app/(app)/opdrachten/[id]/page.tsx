import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin, Clock, Calendar, Building2, Hash, CheckSquare } from "lucide-react";
import { getMyAssignmentDetail } from "@/actions/assignments";
import { getMyReports } from "@/actions/reports";
import { STATUS_LABEL, STATUS_COLOR } from "@/types/assignments";
import type { AssignmentStatus } from "@workspace/db";

type Props = { params: Promise<{ id: string }> };

/**
 * Statuses for which the task breakdown is shown to the customer.
 * Tasks are only revealed after a report has been submitted/approved —
 * prior to that they reflect internal planning details not relevant to the client.
 */
const SHOW_TASKS_STATUSES = new Set<AssignmentStatus>([
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", {
    weekday: "long",
    day:     "numeric",
    month:   "long",
    year:    "numeric",
  });
}

function StatusPil({ status }: { status: AssignmentStatus }) {
  const cfg = STATUS_COLOR[status] ?? { bg: "#F1F5F9", color: "#64748B" };
  const lbl = STATUS_LABEL[status]  ?? status;
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {lbl}
    </span>
  );
}

export default async function KlantWerkbonDetailPage({ params }: Props) {
  const { id } = await params;

  const [assignment, reports] = await Promise.all([
    getMyAssignmentDetail(id),
    getMyReports(),
  ]);

  if (!assignment) notFound();

  // Only show the approved report for this specific assignment
  const rapport = reports.find((r) => r.assignmentId === assignment.id);

  const showTasks = SHOW_TASKS_STATUSES.has(assignment.status) && assignment.tasks.length > 0;

  const addressLine = [
    assignment.objectAddress,
    assignment.objectPostalCode,
    assignment.objectCity,
  ]
    .filter(Boolean)
    .join(", ");

  const timeSlot = [assignment.scheduledStart, assignment.scheduledEnd]
    .filter(Boolean)
    .join(" – ");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-muted)" }}>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3.5"
        style={{ backgroundColor: "white", borderColor: "var(--color-border)" }}
      >
        <Link href="/opdrachten">
          <ChevronLeft size={24} style={{ color: "var(--color-primary)" }} />
        </Link>
        <div className="min-w-0 flex-1">
          <span className="font-mono text-xs font-bold" style={{ color: "var(--color-accent)" }}>
            {assignment.code}
          </span>
          <h1
            className="truncate text-sm font-semibold leading-tight"
            style={{ color: "var(--color-primary)" }}
          >
            {assignment.title}
          </h1>
        </div>
        <StatusPil status={assignment.status} />
      </div>

      <div className="space-y-4 p-4">

        {/* Locatie & planning */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Hash size={14} style={{ color: "var(--color-accent)" }} />
            <span
              className="font-mono text-sm font-bold tracking-wide"
              style={{ color: "var(--color-accent)" }}
            >
              {assignment.code}
            </span>
          </div>

          <div className="space-y-2.5">
            {/* Object naam */}
            {assignment.objectName && (
              <div className="flex items-center gap-2.5">
                <Building2 size={15} style={{ color: "var(--color-secondary)" }} />
                <span className="font-semibold" style={{ color: "var(--color-primary)" }}>
                  {assignment.objectName}
                </span>
              </div>
            )}

            {/* Datum */}
            {assignment.scheduledDate && (
              <div className="flex items-center gap-2.5">
                <Calendar size={15} style={{ color: "var(--color-secondary)" }} />
                <span className="text-sm" style={{ color: "var(--color-primary)" }}>
                  {formatDate(assignment.scheduledDate)}
                </span>
              </div>
            )}

            {/* Tijdvak */}
            {timeSlot && (
              <div className="flex items-center gap-2.5">
                <Clock size={15} style={{ color: "var(--color-secondary)" }} />
                <span className="text-sm" style={{ color: "var(--color-primary)" }}>
                  {timeSlot}
                </span>
              </div>
            )}

            {/* Adres */}
            {addressLine && (
              <div className="flex items-start gap-2.5">
                <MapPin
                  size={15}
                  className="mt-0.5 shrink-0"
                  style={{ color: "var(--color-secondary)" }}
                />
                <span className="text-sm" style={{ color: "var(--color-primary)" }}>
                  {addressLine}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Status informatiekaart */}
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: (STATUS_COLOR[assignment.status] ?? STATUS_COLOR.requested).bg,
          }}
        >
          <p
            className="text-sm font-medium"
            style={{
              color: (STATUS_COLOR[assignment.status] ?? STATUS_COLOR.requested).color,
            }}
          >
            Status: <strong>{STATUS_LABEL[assignment.status] ?? assignment.status}</strong>
          </p>
        </div>

        {/* Omschrijving */}
        {assignment.description && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h3
              className="mb-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-secondary)" }}
            >
              Omschrijving
            </h3>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--color-primary)" }}
            >
              {assignment.description}
            </p>
          </div>
        )}

        {/* Geplande werkzaamheden — only shown once assignment is scheduled/active/done */}
        {showTasks && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <CheckSquare size={15} style={{ color: "var(--color-accent)" }} />
              <h3
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-secondary)" }}
              >
                Werkzaamheden
              </h3>
            </div>
            <div className="space-y-2">
              {assignment.tasks
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((task, i) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 rounded-xl p-3"
                    style={{ backgroundColor: "var(--color-muted)" }}
                  >
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: "var(--color-accent)" }}
                    >
                      {i + 1}
                    </span>
                    <p className="text-sm" style={{ color: "var(--color-primary)" }}>
                      {task.notes ?? "Werkzaamheid"}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Goedgekeurd werkrapport — only show approved reports (getMyReports filters to status='approved') */}
        {rapport && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h3
              className="mb-3 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-secondary)" }}
            >
              Werkrapport
            </h3>

            <p
              className="mb-3 text-sm leading-relaxed"
              style={{ color: "var(--color-primary)", whiteSpace: "pre-wrap" }}
            >
              {rapport.content}
            </p>

            {rapport.hoursWorked && (
              <div
                className="flex items-center justify-between rounded-xl px-3 py-2"
                style={{ backgroundColor: "var(--color-muted)" }}
              >
                <span className="text-xs font-medium" style={{ color: "var(--color-secondary)" }}>
                  Gewerkte uren
                </span>
                <span className="text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
                  {parseFloat(rapport.hoursWorked).toLocaleString("nl-NL")} uur
                </span>
              </div>
            )}

            <p className="mt-2.5 text-xs" style={{ color: "var(--color-muted-fg)" }}>
              Ingediend op{" "}
              {new Date(rapport.submittedAt).toLocaleDateString("nl-NL", {
                day:   "numeric",
                month: "long",
                year:  "numeric",
              })}
            </p>
          </div>
        )}

        {/* Rapport nog niet beschikbaar — shown for active/open statuses without an approved report */}
        {!rapport &&
          !["report_approved", "invoice_ready", "invoiced", "paid", "closed"].includes(
            assignment.status,
          ) && (
            <div
              className="rounded-2xl p-4 text-center"
              style={{ backgroundColor: "var(--color-muted)" }}
            >
              <p className="text-sm" style={{ color: "var(--color-muted-fg)" }}>
                Het werkrapport is nog niet beschikbaar.
              </p>
            </div>
          )}

      </div>
    </div>
  );
}

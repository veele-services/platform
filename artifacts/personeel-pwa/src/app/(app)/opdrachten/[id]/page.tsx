import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin, Clock, Calendar, Building2, Hash } from "lucide-react";
import { getMyAssignment } from "@/actions/assignments";
import { getMyReportForAssignment } from "@/actions/reports";
import { getExtraWorkForAssignment, getActiveTaskCodes } from "@/actions/extra-work";
import { StatusBadge } from "@/components/StatusBadge";
import { InProgressButton } from "./InProgressButton";
import { RapportForm } from "./RapportForm";
import { RapportDetail } from "./RapportDetail";
import { MeerwerkSection } from "@/components/MeerwerkSection";

type Props = { params: Promise<{ id: string }> };

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

export default async function WerkbonDetailPage({ params }: Props) {
  const { id } = await params;

  const [assignment, report, extraWork, taskCodes] = await Promise.all([
    getMyAssignment(id),
    getMyReportForAssignment(id),
    getExtraWorkForAssignment(id),
    getActiveTaskCodes(),
  ]);

  if (!assignment) notFound();

  const canStartWork    = ["plannable", "scheduled", "seen"].includes(assignment.status);
  const canSubmitReport = (assignment.status === "completed" || assignment.status === "not_completed") && !report;
  const showReport      = !!report || assignment.status === "report_submitted" || assignment.status === "report_approved";

  // Meerwerk is editable until a report is submitted
  const canEditMeerwerk = !["report_submitted", "report_approved", "invoice_ready", "invoiced", "paid", "closed"].includes(assignment.status);

  const addressLine = [assignment.objectAddress, assignment.objectPostalCode, assignment.objectCity]
    .filter(Boolean)
    .join(", ");
  const timeSlot = [assignment.scheduledStart, assignment.scheduledEnd].filter(Boolean).join(" – ");

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
            {assignment.code || "Werkbon"}
          </span>
          <h1 className="truncate text-sm font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
            {assignment.title}
          </h1>
        </div>
        <StatusBadge status={assignment.status} />
      </div>

      <div className="space-y-4 p-4">

        {/* Klant & locatie kaart */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          {/* Werkbonnummer */}
          <div className="mb-3 flex items-center gap-2">
            <Hash size={14} style={{ color: "var(--color-accent)" }} />
            <span className="font-mono text-sm font-bold tracking-wide" style={{ color: "var(--color-accent)" }}>
              {assignment.code || "—"}
            </span>
          </div>

          <div className="space-y-2.5">
            {/* Klantnaam */}
            {assignment.customerName && (
              <div className="flex items-center gap-2.5">
                <Building2 size={15} style={{ color: "var(--color-secondary)" }} />
                <span className="font-semibold" style={{ color: "var(--color-primary)" }}>
                  {assignment.customerName}
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
                <MapPin size={15} className="mt-0.5 shrink-0" style={{ color: "var(--color-secondary)" }} />
                <span className="text-sm" style={{ color: "var(--color-primary)" }}>
                  {addressLine}
                </span>
              </div>
            )}
          </div>
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
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-primary)" }}>
              {assignment.description}
            </p>
          </div>
        )}

        {/* Taken */}
        {assignment.tasks.length > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h3
              className="mb-3 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-secondary)" }}
            >
              Uit te voeren taken
            </h3>
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
                      {task.notes ?? "Taak"}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Start-opdracht knop */}
        {canStartWork && <InProgressButton assignmentId={assignment.id} />}

        {/* Meerwerk */}
        <MeerwerkSection
          assignmentId={assignment.id}
          initialItems={extraWork}
          taskCodes={taskCodes}
          canEdit={canEditMeerwerk}
        />

        {/* Rapport */}
        {canSubmitReport && (
          <RapportForm assignmentId={assignment.id} assignmentStatus={assignment.status} />
        )}
        {showReport && report && <RapportDetail report={report} />}

        {/* Niet-afgerond melding */}
        {assignment.status === "not_completed" && report && (
          <div
            className="rounded-2xl p-4 text-center text-sm"
            style={{ backgroundColor: "#FEF3C7" }}
          >
            <p className="font-semibold" style={{ color: "#92400E" }}>
              Opdracht niet afgerond
            </p>
            <p className="mt-1" style={{ color: "#B45309" }}>
              Uw rapport is ontvangen. De planner neemt contact op voor vervolgstappen.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

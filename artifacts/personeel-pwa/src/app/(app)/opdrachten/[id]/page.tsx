import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin, Clock, Calendar } from "lucide-react";
import { getMyAssignment } from "@/actions/assignments";
import { getMyReportForAssignment } from "@/actions/reports";
import { StatusBadge } from "@/components/StatusBadge";
import { InProgressButton } from "./InProgressButton";
import { RapportForm } from "./RapportForm";
import { RapportDetail } from "./RapportDetail";

type Props = { params: Promise<{ id: string }> };

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function OpdrachtenDetailPage({ params }: Props) {
  const { id } = await params;
  const [assignment, report] = await Promise.all([
    getMyAssignment(id),
    getMyReportForAssignment(id),
  ]);

  if (!assignment) notFound();

  const canStartWork    = ["plannable", "scheduled", "seen"].includes(assignment.status);
  const canSubmitReport = (assignment.status === "completed" || assignment.status === "not_completed") && !report;
  const showReport      = !!report || assignment.status === "report_submitted" || assignment.status === "report_approved";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-muted)" }}>
      <div
        className="sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3.5"
        style={{ backgroundColor: "white", borderColor: "var(--color-border)" }}
      >
        <Link href="/opdrachten">
          <ChevronLeft size={24} style={{ color: "var(--color-primary)" }} />
        </Link>
        <h1 className="flex-1 truncate font-semibold" style={{ color: "var(--color-primary)" }}>
          Opdracht
        </h1>
        <StatusBadge status={assignment.status} />
      </div>

      <div className="space-y-4 p-4">
        {/* Assignment info */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold" style={{ color: "var(--color-primary)" }}>
            {assignment.title}
          </h2>

          <div className="mt-3 space-y-2.5">
            {assignment.scheduledDate && (
              <div className="flex items-center gap-2.5">
                <Calendar size={16} style={{ color: "var(--color-accent)" }} />
                <span className="text-sm" style={{ color: "var(--color-primary)" }}>
                  {formatDate(assignment.scheduledDate)}
                </span>
              </div>
            )}
            {(assignment.scheduledStart || assignment.scheduledEnd) && (
              <div className="flex items-center gap-2.5">
                <Clock size={16} style={{ color: "var(--color-accent)" }} />
                <span className="text-sm" style={{ color: "var(--color-primary)" }}>
                  {[assignment.scheduledStart, assignment.scheduledEnd]
                    .filter(Boolean)
                    .join(" – ")}
                </span>
              </div>
            )}
            {(assignment.objectAddress || assignment.objectCity) && (
              <div className="flex items-start gap-2.5">
                <MapPin size={16} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
                <span className="text-sm" style={{ color: "var(--color-primary)" }}>
                  {/* Customer details are anonymised per privacy policy */}
                  Klant — {[assignment.objectAddress, assignment.objectCity]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {assignment.description && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h3
              className="mb-2 text-sm font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-secondary)" }}
            >
              Omschrijving
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-primary)" }}>
              {assignment.description}
            </p>
          </div>
        )}

        {/* Tasks */}
        {assignment.tasks.length > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h3
              className="mb-3 text-sm font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-secondary)" }}
            >
              Taken
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

        {/* In-progress button (only for pre-completion statuses) */}
        {canStartWork && <InProgressButton assignmentId={assignment.id} />}

        {/* Report section */}
        {canSubmitReport && (
          <RapportForm assignmentId={assignment.id} assignmentStatus={assignment.status} />
        )}
        {showReport && report && <RapportDetail report={report} />}

        {/* not_completed: after report is submitted, planner follows up */}
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

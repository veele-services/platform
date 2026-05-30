import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Calendar,
  Clock,
  FileText,
  StickyNote,
  Users,
} from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import {
  AssignmentStatusBadge,
  AssignmentPriorityBadge,
} from "@/components/assignments/AssignmentStatusBadge";
import { AssignmentDetailActions } from "@/components/assignments/AssignmentDetailActions";
import {
  getAssignment,
  getCustomerOptions,
  getPersonnelOptions,
  getTaskCodeOptions,
} from "@/app/actions/assignments";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const canRead = await hasPermission("assignments", "read");
    if (!canRead) return { title: "Geen toegang" };
    const { id } = await params;
    const assignment = await getAssignment(id);
    return { title: assignment?.title ?? "Assignment" };
  } catch {
    return { title: "Assignment" };
  }
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: "1px solid #F1F5F9" }}>
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#94A3B8" }} />
      <div className="min-w-0 flex-1">
        <p
          className="text-xs font-medium uppercase tracking-wider mb-0.5"
          style={{ color: "#94A3B8" }}
        >
          {label}
        </p>
        <div className="text-sm" style={{ color: "#081D3A" }}>
          {value}
        </div>
      </div>
    </div>
  );
}

export default async function AssignmentDetailPage({ params }: Props) {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return <ForbiddenPage resource="assignments" action="read" />;

  const { id } = await params;

  const [assignment, canWrite] = await Promise.all([
    getAssignment(id),
    hasPermission("assignments", "write"),
  ]);

  if (!assignment) notFound();

  const [customers, personnelList, taskCodes] = canWrite
    ? await Promise.all([
        getCustomerOptions(),
        getPersonnelOptions(),
        getTaskCodeOptions(),
      ])
    : [[], [], []];

  // ── Formatted dates ────────────────────────────────────────────────────────
  const createdAt = new Date(assignment.createdAt).toLocaleDateString("nl-NL", {
    day: "numeric", month: "long", year: "numeric",
  });
  const updatedAt = new Date(assignment.updatedAt).toLocaleDateString("nl-NL", {
    day: "numeric", month: "long", year: "numeric",
  });

  let scheduledLabel = "Nog niet ingepland";
  if (assignment.scheduledDate) {
    const d = new Date(assignment.scheduledDate + "T00:00:00");
    scheduledLabel = d.toLocaleDateString("nl-NL", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  }

  let timeLabel: string | null = null;
  if (assignment.scheduledStart) {
    timeLabel = assignment.scheduledEnd
      ? `${assignment.scheduledStart} – ${assignment.scheduledEnd}`
      : assignment.scheduledStart;
  }

  return (
    <div className="p-8 max-w-6xl">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-8">
        <Link
          href="/assignments"
          className="inline-flex items-center gap-1 text-sm mb-3 transition-colors hover:underline"
          style={{ color: "#64748B" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Opdrachten
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1
                className="font-heading text-2xl font-bold"
                style={{ color: "#081D3A" }}
              >
                {assignment.title}
              </h1>
              <span className="font-mono text-xs rounded px-1.5 py-0.5 bg-slate-100 self-center" style={{ color: "#475569" }}>
                {assignment.code}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <AssignmentStatusBadge status={assignment.status} />
              <AssignmentPriorityBadge priority={assignment.priority} />
            </div>
            <p className="mt-2 text-xs" style={{ color: "#94A3B8" }}>
              Aangemaakt {createdAt} · Bijgewerkt {updatedAt}
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Left: static details */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* General info */}
          <div className="veele-card">
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-4"
              style={{ color: "#94A3B8" }}
            >
              Opdrachtgegevens
            </p>

            <InfoRow
              icon={Building2}
              label="Klant"
              value={
                <Link
                  href={`/customers/${assignment.customerId}`}
                  className="hover:underline"
                  style={{ color: "#00B7B3" }}
                >
                  {assignment.customerName}
                </Link>
              }
            />

            {assignment.objectName && (
              <InfoRow
                icon={MapPin}
                label="Object"
                value={assignment.objectName}
              />
            )}

            <InfoRow
              icon={Calendar}
              label="Geplande datum"
              value={scheduledLabel}
            />

            {timeLabel && (
              <InfoRow
                icon={Clock}
                label="Tijdslot"
                value={timeLabel}
              />
            )}
          </div>

          {/* Description */}
          {assignment.description && (
            <div className="veele-card">
              <h2
                className="font-heading text-base font-semibold mb-3 flex items-center gap-2"
                style={{ color: "#081D3A" }}
              >
                <FileText className="h-4 w-4" style={{ color: "#00B7B3" }} />
                Beschrijving
              </h2>
              <p className="text-sm whitespace-pre-wrap" style={{ color: "#374151" }}>
                {assignment.description}
              </p>
            </div>
          )}

          {/* Internal notes — management only */}
          {canWrite && assignment.notes && (
            <div
              className="veele-card"
              style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}
            >
              <h2
                className="font-heading text-base font-semibold mb-3 flex items-center gap-2"
                style={{ color: "#92400E" }}
              >
                <StickyNote className="h-4 w-4" />
                Interne notities
              </h2>
              <p className="text-sm whitespace-pre-wrap" style={{ color: "#78350F" }}>
                {assignment.notes}
              </p>
            </div>
          )}
        </div>

        {/* Right: interactive actions panel (or read-only for viewers) */}
        <div className="flex flex-col gap-4">
          {canWrite ? (
            <AssignmentDetailActions
              assignmentId={assignment.id}
              title={assignment.title}
              status={assignment.status}
              priority={assignment.priority}
              canWrite={canWrite}
              customers={customers}
              personnelList={personnelList}
              taskCodes={taskCodes}
              personnel={assignment.personnel}
              tasks={assignment.tasks}
            />
          ) : (
            <>
              {/* Read-only: personnel */}
              <div className="veele-card">
                <h3
                  className="font-heading text-sm font-semibold mb-3 flex items-center gap-2"
                  style={{ color: "#081D3A" }}
                >
                  <Users className="h-4 w-4" style={{ color: "#00B7B3" }} />
                  Medewerkers
                </h3>
                {assignment.personnel.length === 0 ? (
                  <p className="text-sm" style={{ color: "#94A3B8" }}>
                    Geen medewerkers gekoppeld.
                  </p>
                ) : (
                  <ul className="divide-y" style={{ borderColor: "#F1F5F9" }}>
                    {assignment.personnel.map((p) => (
                      <li key={p.id} className="py-2 text-sm" style={{ color: "#081D3A" }}>
                        {p.firstName} {p.lastName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Read-only: tasks */}
              {assignment.tasks.length > 0 && (
                <div className="veele-card">
                  <h3
                    className="font-heading text-sm font-semibold mb-3"
                    style={{ color: "#081D3A" }}
                  >
                    Taken
                  </h3>
                  <ul className="divide-y" style={{ borderColor: "#F1F5F9" }}>
                    {assignment.tasks.map((t) => (
                      <li key={t.id} className="py-2">
                        <span className="text-sm" style={{ color: "#081D3A" }}>
                          {t.taskCodeCode && (
                            <span
                              className="text-xs font-mono px-1.5 py-0.5 rounded mr-1.5"
                              style={{ background: "#F1F5F9", color: "#64748B" }}
                            >
                              {t.taskCodeCode}
                            </span>
                          )}
                          {t.taskCodeName ?? "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

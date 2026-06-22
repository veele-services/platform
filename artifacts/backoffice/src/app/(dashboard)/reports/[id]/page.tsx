import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, XCircle, User, Calendar, MapPin, Download } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getReport, getReportTimelineNotes, type ReportTimelineNote } from "@/app/actions/reports";
import { ReportActions } from "@/components/reports/ReportActions";
import { ProcessStatusBadge, ProcessStepper } from "@/components/workflows/ProcessStatus";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const report = await getReport(id);
    return { title: report ? `Rapport — ${report.assignmentTitle}` : "Rapport" };
  } catch {
    return { title: "Rapport" };
  }
}

function formatScheduledDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: "1px solid #F1F5F9" }}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: "#94A3B8" }}>
          {label}
        </p>
        <div className="text-sm" style={{ color: "#081D3A" }}>{value}</div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("nl-NL", {
    maximumFractionDigits: 1,
  })} MB`;
}

function ReportTimeline({ notes }: { notes: ReportTimelineNote[] }) {
  if (notes.length === 0) {
    return (
      <div className="veele-card">
        <h2
          className="font-heading text-base font-semibold mb-2 flex items-center gap-2"
          style={{ color: "#081D3A" }}
        >
          <FileText className="h-4 w-4" style={{ color: "#00B7B3" }} />
          Rapportagenotities
        </h2>
        <p className="text-sm" style={{ color: "#64748B" }}>
          Er zijn nog geen losse rapportagenotities toegevoegd.
        </p>
      </div>
    );
  }

  return (
    <div className="veele-card">
      <h2
        className="font-heading text-base font-semibold mb-4 flex items-center gap-2"
        style={{ color: "#081D3A" }}
      >
        <FileText className="h-4 w-4" style={{ color: "#00B7B3" }} />
        Rapportagenotities
      </h2>

      <div className="space-y-3">
        {notes.map((note) => (
          <article
            key={note.id}
            className="rounded-xl border bg-white p-4"
            style={{ borderColor: "#E2E8F0" }}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "#64748B" }}>
              <span>
                {new Date(note.createdAt).toLocaleString("nl-NL", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span aria-hidden="true">-</span>
              <span className="font-semibold" style={{ color: "#081D3A" }}>
                {note.authorName}
              </span>
              {note.authorEmail ? <span>({note.authorEmail})</span> : null}
            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "#374151" }}>
              {note.body}
            </p>

            {note.attachments.length > 0 ? (
              <div className="mt-3 space-y-2">
                {note.attachments.map((attachment) => {
                  const meta = [attachment.mimeType, formatFileSize(attachment.fileSize)]
                    .filter(Boolean)
                    .join(" - ");

                  return (
                    <a
                      key={attachment.id}
                      href={attachment.signedUrl ?? undefined}
                      target={attachment.signedUrl ? "_blank" : undefined}
                      rel="noreferrer"
                      className="block rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: "#E2E8F0", background: "#F8FAFC", color: "#081D3A" }}
                    >
                      <span className="font-medium">{attachment.fileName}</span>
                      {meta ? (
                        <span className="ml-2 text-xs" style={{ color: "#64748B" }}>
                          {meta}
                        </span>
                      ) : null}
                    </a>
                  );
                })}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

export default async function ReportDetailPage({ params }: Props) {
  const canRead = await hasPermission("reports", "read");
  if (!canRead) return <ForbiddenPage resource="reports" action="read" />;

  const { id } = await params;
  const [report, reportNotes, canWrite] = await Promise.all([
    getReport(id),
    getReportTimelineNotes(id),
    hasPermission("reports", "write"),
  ]);

  if (!report) notFound();

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("nl-NL", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* ── Header ── */}
      <div className="mb-8">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm mb-3 transition-colors hover:underline"
          style={{ color: "#64748B" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Rapporten
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
                Rapport — {report.assignmentTitle}
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <ProcessStatusBadge kind="report" status={report.status} />
              <span
                className="font-mono text-xs rounded px-1.5 py-0.5"
                style={{ backgroundColor: "#F1F5F9", color: "#64748B" }}
              >
                {report.assignmentCode}
              </span>
            </div>
            <p className="mt-2 text-xs" style={{ color: "#94A3B8" }}>
              Ingediend {formatDate(report.submittedAt)}
            </p>
            <ProcessStepper kind="report" status={report.status} className="mt-4" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: report content */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Meta */}
          <div className="veele-card">
            <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#94A3B8" }}>
              Rapportgegevens
            </p>
            <InfoRow
              label="Opdracht"
              value={
                <Link
                  href={`/assignments/${report.assignmentId}`}
                  className="hover:underline"
                  style={{ color: "#00B7B3" }}
                >
                  {report.assignmentTitle}
                </Link>
              }
            />
            <InfoRow label="Klant" value={report.customerName} />
            {report.objectName && (
              <InfoRow
                label="Object"
                value={
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" style={{ color: "#94A3B8" }} />
                    {report.objectName}
                  </span>
                }
              />
            )}
            {report.scheduledDate && (
              <InfoRow
                label="Geplande datum"
                value={
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" style={{ color: "#94A3B8" }} />
                    {formatScheduledDate(report.scheduledDate)}
                  </span>
                }
              />
            )}
            {report.hoursWorked && (
              <InfoRow
                label="Gewerkte uren"
                value={
                  <span className="font-mono">{report.hoursWorked} uur</span>
                }
              />
            )}
            <InfoRow
              label="Ingediend op"
              value={
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" style={{ color: "#94A3B8" }} />
                  {formatDate(report.submittedAt)}
                </span>
              }
            />
            {report.reviewedAt && (
              <InfoRow
                label={report.status === "approved" ? "Goedgekeurd op" : "Afgewezen op"}
                value={
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" style={{ color: "#94A3B8" }} />
                    {formatDate(report.reviewedAt)}
                    {report.reviewedByName && (
                      <span style={{ color: "#64748B" }}>
                        &nbsp;door {report.reviewedByName}
                      </span>
                    )}
                  </span>
                }
              />
            )}
            <InfoRow
              label="Ingediend door"
              value={
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" style={{ color: "#94A3B8" }} />
                  {report.submittedByName}
                </span>
              }
            />
          </div>

          {/* Report body */}
          <div className="veele-card">
            <h2
              className="font-heading text-base font-semibold mb-3 flex items-center gap-2"
              style={{ color: "#081D3A" }}
            >
              <FileText className="h-4 w-4" style={{ color: "#00B7B3" }} />
              Rapportinhoud
            </h2>
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#374151" }}>
              {report.content}
            </p>

            {report.submitterNotes && (
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid #F1F5F9" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#94A3B8" }}>
                  Opmerkingen medewerker
                </p>
                <p className="text-sm whitespace-pre-wrap" style={{ color: "#374151" }}>
                  {report.submitterNotes}
                </p>
              </div>
            )}
          </div>

          <ReportTimeline notes={reportNotes} />

          {/* Management feedback (rejection notes) */}
          {report.notes && (
            <div
              className="veele-card"
              style={{ background: "#FEE2E2", borderColor: "#FECACA" }}
            >
              <h2
                className="font-heading text-base font-semibold mb-3 flex items-center gap-2"
                style={{ color: "#991B1B" }}
              >
                <XCircle className="h-4 w-4" />
                Reden afwijzing
              </h2>
              <p className="text-sm whitespace-pre-wrap" style={{ color: "#7F1D1D" }}>
                {report.notes}
              </p>
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex flex-col gap-4">
          {canWrite && report.status === "submitted" && (
            <ReportActions reportId={report.id} />
          )}

          {report.status !== "submitted" && (
            <div className="veele-card text-center py-6">
              <ProcessStatusBadge kind="report" status={report.status} size="md" />
              <p className="mt-3 text-xs" style={{ color: "#94A3B8" }}>
                Dit rapport is al beoordeeld.
              </p>
            </div>
          )}

          {report.status === "approved" && (
            <div className="veele-card">
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#94A3B8" }}>
                Exporteren
              </p>
              <Link
                href={`/api/reports/${report.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 w-full justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
                style={{ backgroundColor: "#081D3A", color: "#FFFFFF" }}
              >
                <Download className="h-4 w-4" />
                Download PDF
              </Link>
            </div>
          )}

          <div className="veele-card">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#94A3B8" }}>
              Navigeer naar
            </p>
            <Link
              href={`/assignments/${report.assignmentId}`}
              className="text-sm hover:underline block"
              style={{ color: "#00B7B3" }}
            >
              ↗ Opdracht openen
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

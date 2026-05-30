import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Clock, CheckCircle2, XCircle, User, Calendar } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getReport } from "@/app/actions/reports";
import { ReportActions } from "@/components/reports/ReportActions";

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

const STATUS_LABELS: Record<string, string> = {
  submitted: "Ingediend",
  approved:  "Goedgekeurd",
  rejected:  "Afgewezen",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  submitted: { bg: "#FEF3C7", text: "#92400E", icon: <Clock className="h-4 w-4" /> },
  approved:  { bg: "#D1FAE5", text: "#065F46", icon: <CheckCircle2 className="h-4 w-4" /> },
  rejected:  { bg: "#FEE2E2", text: "#991B1B", icon: <XCircle className="h-4 w-4" /> },
};

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

export default async function ReportDetailPage({ params }: Props) {
  const canRead = await hasPermission("reports", "read");
  if (!canRead) return <ForbiddenPage resource="reports" action="read" />;

  const { id } = await params;
  const [report, canWrite] = await Promise.all([
    getReport(id),
    hasPermission("reports", "write"),
  ]);

  if (!report) notFound();

  const statusStyle = STATUS_STYLES[report.status];

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
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
              >
                {statusStyle.icon}
                {STATUS_LABELS[report.status]}
              </span>
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
          </div>

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
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
              >
                {statusStyle.icon}
                {STATUS_LABELS[report.status]}
              </span>
              <p className="mt-3 text-xs" style={{ color: "#94A3B8" }}>
                Dit rapport is al beoordeeld.
              </p>
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

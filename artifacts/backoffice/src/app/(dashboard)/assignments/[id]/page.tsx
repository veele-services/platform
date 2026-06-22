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
  CheckCircle2,
  Clock3,
  Receipt,
  FileCheck2,
  AlertTriangle,
  TrendingUp,
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
  getAssignmentPlanningReadiness,
  getCustomerOptions,
  getPersonnelEligibilityForAssignment,
  getTaskCodeOptions,
} from "@/app/actions/assignments";
import { getReportForAssignment } from "@/app/actions/reports";
import { SubmitReportForm } from "@/components/reports/SubmitReportForm";
import { getInvoiceForAssignment, getAssignmentInvoiceData } from "@/app/actions/invoices";
import { CreateInvoiceForm } from "@/components/invoices/CreateInvoiceForm";
import { getQuoteForAssignment, getAssignmentQuoteData } from "@/app/actions/quotes";
import { CreateQuoteForm } from "@/components/quotes/CreateQuoteForm";
import { DirectApprovalButton } from "@/components/quotes/DirectApprovalButton";
import type { QuoteStatus } from "@/app/actions/quotes";
import { listDocuments } from "@/app/actions/documents";
import { AssignmentDocumentsPanel } from "@/components/documents/AssignmentDocumentsPanel";
import { InterestPollButton } from "@/components/assignments/InterestPollButton";
import { SmartCandidateActions } from "@/components/assignments/SmartCandidateActions";
import { ProcessStatusBadge, ProcessStepper } from "@/components/workflows/ProcessStatus";

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

function capacityStyle(status: "green" | "orange" | "red") {
  if (status === "green") {
    return {
      label: "Groen",
      bg: "#ECFDF5",
      text: "#047857",
      border: "#A7F3D0",
    };
  }
  if (status === "orange") {
    return {
      label: "Oranje",
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FCD34D",
    };
  }
  return {
    label: "Rood",
    bg: "#FEF2F2",
    text: "#B91C1C",
    border: "#FECACA",
  };
}

export default async function AssignmentDetailPage({ params }: Props) {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return <ForbiddenPage resource="assignments" action="read" />;

  const { id } = await params;

  const [
    assignment,
    canWrite,
    canReadReports,
    canSubmitReport,
    canReadInvoices,
    canWriteInvoices,
    canReadQuotes,
    canWriteQuotes,
    canReadDocuments,
    canWriteDocuments,
  ] = await Promise.all([
    getAssignment(id),
    hasPermission("assignments", "write"),
    hasPermission("reports", "read"),
    hasPermission("reports", "submit"),
    hasPermission("invoices", "read"),
    hasPermission("invoices", "write"),
    hasPermission("quotes", "read"),
    hasPermission("quotes", "write"),
    hasPermission("documents", "read"),
    hasPermission("documents", "write"),
  ]);

  if (!assignment) notFound();

  const assignmentDocuments = canReadDocuments
    ? await listDocuments({ entityType: "assignment", entityId: id })
    : [];

  const REPORT_STATUSES  = ["completed", "not_completed", "report_submitted", "report_approved", "invoice_ready", "invoiced", "paid", "closed"];
  const INVOICE_STATUSES = ["invoice_ready", "invoiced", "paid", "closed"];
  const QUOTE_STATUSES_SHOW = ["quote_preparation", "awaiting_approval", "approved", "plannable", "scheduled", "seen", "in_progress", "not_completed", "completed", "report_submitted", "report_approved", "invoice_ready", "invoiced", "paid", "closed"];

  const existingReport = canReadReports && REPORT_STATUSES.includes(assignment.status)
    ? await getReportForAssignment(id)
    : null;

  const [existingInvoice, invoicePrefill] = canReadInvoices
    ? await Promise.all([
        INVOICE_STATUSES.includes(assignment.status)
          ? getInvoiceForAssignment(id)
          : Promise.resolve(null),
        assignment.status === "report_approved" && canWriteInvoices
          ? getAssignmentInvoiceData(id)
          : Promise.resolve(null),
      ])
    : [null, null];

  const [existingQuote, quotePrefill] = canReadQuotes
    ? await Promise.all([
        QUOTE_STATUSES_SHOW.includes(assignment.status)
          ? getQuoteForAssignment(id)
          : Promise.resolve(null),
        assignment.status === "review" && canWriteQuotes
          ? getAssignmentQuoteData(id)
          : Promise.resolve(null),
      ])
    : [null, null];

  const [customers, personnelList, taskCodes] = canWrite
    ? await Promise.all([
        getCustomerOptions(),
        getPersonnelEligibilityForAssignment(id),
        getTaskCodeOptions(),
      ])
    : [[], [], []];

  const planningReadiness = canWrite
    ? await getAssignmentPlanningReadiness(id)
    : null;

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
            <ProcessStepper kind="assignment" status={assignment.status} className="mt-4" />
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

            {assignment.requiredRegion && (
              <InfoRow
                icon={MapPin}
                label="Regio"
                value={assignment.requiredRegion}
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

          {/* ── Quote section — status: review ────────────── */}
          {assignment.status === "review" && canReadQuotes && quotePrefill && (
            <CreateQuoteForm assignmentId={assignment.id} prefill={quotePrefill} />
          )}

          {/* ── Existing quote info card ──────────────────── */}
          {existingQuote && (
            <div className="veele-card">
              <h2
                className="font-heading text-base font-semibold mb-3 flex items-center gap-2"
                style={{ color: "#081D3A" }}
              >
                <FileCheck2 className="h-4 w-4" style={{ color: "#00B7B3" }} />
                Offerte
                <ProcessStatusBadge
                  kind="quote"
                  status={existingQuote.isExpired ? "expired" : existingQuote.status}
                  size="xs"
                />
              </h2>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-mono text-xs rounded px-1.5 py-0.5" style={{ background: "#F1F5F9", color: "#475569" }}>
                  {existingQuote.quoteNumber}
                </span>
                <span className="font-semibold" style={{ color: "#081D3A" }}>
                  {new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
                    parseFloat(existingQuote.amount) || 0
                  )}
                </span>
              </div>
              {existingQuote.validityDate && (
                <p className="text-xs mb-3" style={{ color: existingQuote.isExpired ? "#DC2626" : "#64748B" }}>
                  {existingQuote.isExpired && <AlertTriangle className="inline h-3 w-3 mr-1 mb-0.5" />}
                  Geldig tot{" "}
                  {new Date(existingQuote.validityDate + "T00:00:00").toLocaleDateString("nl-NL", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
              )}
              <Link
                href={`/quotes/${existingQuote.id}`}
                className="text-sm font-medium hover:underline"
                style={{ color: "#00B7B3" }}
              >
                Offerte bekijken →
              </Link>
            </div>
          )}

          {/* ── Report section ────────────────────────────── */}
          {(assignment.status === "completed" || assignment.status === "not_completed") &&
            (!existingReport || existingReport.status === "rejected") &&
            canSubmitReport && (
            <SubmitReportForm assignmentId={assignment.id} rejectedReport={existingReport ?? null} />
          )}

          {existingReport && (
            <div className="veele-card">
              <h2
                className="font-heading text-base font-semibold mb-3 flex items-center gap-2"
                style={{ color: "#081D3A" }}
              >
                <FileText className="h-4 w-4" style={{ color: "#00B7B3" }} />
                Rapport
                <ProcessStatusBadge kind="report" status={existingReport.status} size="xs" />
              </h2>
              <p className="text-sm whitespace-pre-wrap line-clamp-4 mb-3" style={{ color: "#374151" }}>
                {existingReport.content}
              </p>
              <Link
                href={`/reports/${existingReport.id}`}
                className="text-sm font-medium hover:underline"
                style={{ color: "#00B7B3" }}
              >
                Rapport bekijken →
              </Link>
            </div>
          )}

          {/* ── Invoice section ───────────────────────────── */}
          {invoicePrefill && (
            <CreateInvoiceForm assignmentId={assignment.id} prefill={invoicePrefill} />
          )}

          {existingInvoice && (
            <div className="veele-card">
              <h2
                className="font-heading text-base font-semibold mb-3 flex items-center gap-2"
                style={{ color: "#081D3A" }}
              >
                <Receipt className="h-4 w-4" style={{ color: "#00B7B3" }} />
                Factuur
                <ProcessStatusBadge kind="invoice" status={existingInvoice.status} size="xs" />
              </h2>
              <div className="flex items-center justify-between text-sm mb-3">
                <span className="font-mono text-xs rounded px-1.5 py-0.5" style={{ background: "#F1F5F9", color: "#475569" }}>
                  {existingInvoice.invoiceNumber}
                </span>
                <span className="font-semibold" style={{ color: "#081D3A" }}>
                  {new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
                    parseFloat(existingInvoice.totalAmount) || 0
                  )}
                </span>
              </div>
              <Link
                href={`/invoices/${existingInvoice.id}`}
                className="text-sm font-medium hover:underline"
                style={{ color: "#00B7B3" }}
              >
                Factuur bekijken →
              </Link>
            </div>
          )}
        </div>

        {/* Right: interactive actions panel (or read-only for viewers) */}
        <div className="flex flex-col gap-4">
          {planningReadiness && (
            <div className="veele-card">
              {(() => {
                const style = capacityStyle(planningReadiness.capacityStatus);
                return (
                  <>
              <h3
                className="font-heading text-sm font-semibold mb-3 flex items-center justify-between gap-2"
                style={{ color: "#081D3A" }}
              >
                <span className="inline-flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" style={{ color: "#00B7B3" }} />
                  Capaciteit & matching
                </span>
                <span
                  className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: style.bg,
                    borderColor: style.border,
                    color: style.text,
                  }}
                >
                  {style.label}
                </span>
              </h3>

              <div
                className="mb-3 rounded-xl border p-3 text-xs leading-5"
                style={{
                  borderColor: style.border,
                  backgroundColor: style.bg,
                  color: style.text,
                }}
              >
                {planningReadiness.advice}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="font-semibold" style={{ color: "#081D3A" }}>{planningReadiness.requiredSlots}</p>
                  <p style={{ color: "#64748B" }}>Benodigd</p>
                </div>
                <div className="rounded-xl bg-sky-50 p-3">
                  <p className="font-semibold text-sky-700">{planningReadiness.suitableCount}</p>
                  <p className="text-sky-700/75">Geschikt totaal</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="font-semibold text-emerald-700">{planningReadiness.fullyAvailableCount}</p>
                  <p className="text-emerald-700/75">Beschikbaar</p>
                </div>
                <div className="rounded-xl bg-violet-50 p-3">
                  <p className="font-semibold text-violet-700">{planningReadiness.topMatchCount}</p>
                  <p className="text-violet-700/75">Topmatches</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="font-semibold text-amber-700">{planningReadiness.interestedCount}</p>
                  <p className="text-amber-700/75">Interesse</p>
                </div>
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="font-semibold text-red-700">{planningReadiness.blockedCount}</p>
                  <p className="text-red-700/75">Blokkades</p>
                </div>
              </div>

              <div className="mt-3 rounded-xl border p-3 text-xs" style={{ borderColor: "#E2E8F0" }}>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: "#64748B" }}>Hoogste match</span>
                  <span className="font-semibold" style={{ color: "#081D3A" }}>
                    {planningReadiness.highestMatchScore}%
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span style={{ color: "#64748B" }}>Definitief gekoppeld</span>
                  <span className="font-semibold" style={{ color: "#081D3A" }}>
                    {planningReadiness.assignedCount}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span style={{ color: "#64748B" }}>Suggesties</span>
                  <span className="font-semibold" style={{ color: "#081D3A" }}>
                    {planningReadiness.suggestedCount}
                  </span>
                </div>
              </div>

              {planningReadiness.topMatches.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>
                    Beste matches
                  </p>
                  <ul className="space-y-1.5">
                    {planningReadiness.topMatches.map((person) => (
                      <li
                        key={person.id}
                        className="rounded-xl bg-slate-50 px-3 py-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium" style={{ color: "#081D3A" }}>{person.name}</p>
                            <p className="mt-0.5 truncate" style={{ color: "#64748B" }}>
                              {person.sectorName ?? "Geen sector"}
                            </p>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                            {person.matchScore}%
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {person.positives.slice(0, 3).map((reason) => (
                            <span key={reason} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                              + {reason}
                            </span>
                          ))}
                          {person.negatives.slice(0, 2).map((reason) => (
                            <span key={reason} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                              - {reason}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {planningReadiness.candidates.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>
                    Kandidaten
                  </p>
                  <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {planningReadiness.candidates.slice(0, 8).map((candidate) => (
                      <div
                        key={candidate.id}
                        className="rounded-xl border p-3 text-xs"
                        style={{
                          borderColor:
                            candidate.hardStatus === "eligible"
                              ? "#A7F3D0"
                              : candidate.hardStatus === "warning"
                                ? "#FCD34D"
                                : "#FECACA",
                          backgroundColor:
                            candidate.hardStatus === "eligible"
                              ? "#F8FFFC"
                              : candidate.hardStatus === "warning"
                                ? "#FFFCF3"
                                : "#FFF7F7",
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold" style={{ color: "#081D3A" }}>
                              {candidate.name}
                            </p>
                            <p className="mt-0.5 truncate" style={{ color: "#64748B" }}>
                              {candidate.sectorName ?? "Geen sector"}
                            </p>
                          </div>
                          <span className="rounded-full bg-white px-2 py-0.5 font-semibold" style={{ color: "#081D3A" }}>
                            {candidate.matchScore}%
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {candidate.positives.slice(0, 3).map((reason) => (
                            <span key={reason} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                              + {reason}
                            </span>
                          ))}
                          {candidate.negatives.slice(0, 3).map((reason) => (
                            <span key={reason} className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700">
                              - {reason}
                            </span>
                          ))}
                        </div>
                        {candidate.hardStatus !== "blocked" && (
                          <div className="mt-2">
                            <SmartCandidateActions
                              assignmentId={assignment.id}
                              personnelId={candidate.id}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!planningReadiness.hasMoment && (
                <p className="mt-3 text-xs" style={{ color: "#92400E" }}>
                  Vul eerst datum en tijdvak in om beschikbaarheid betrouwbaar te bepalen.
                </p>
              )}

              <div className="mt-4">
                <InterestPollButton
                  assignmentId={assignment.id}
                  disabled={!planningReadiness.canPoll}
                />
              </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Direct approval button — only when status is review and user can write quotes */}
          {assignment.status === "review" && canWrite && canReadQuotes && (
            <DirectApprovalButton assignmentId={assignment.id} />
          )}

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

      {/* ── Bijlagen ─────────────────────────────────────── */}
      {canReadDocuments && (
        <div className="mt-6">
          <AssignmentDocumentsPanel
            assignmentId={assignment.id}
            initialDocuments={assignmentDocuments}
            canWrite={canWriteDocuments}
          />
        </div>
      )}
    </div>
  );
}

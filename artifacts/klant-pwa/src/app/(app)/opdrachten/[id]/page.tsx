import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft, MapPin, Clock, Calendar, Building2, Hash,
  CheckSquare, ImageIcon, FileText, Receipt,
} from "lucide-react";
import { getMyAssignmentDetail } from "@/actions/assignments";
import { getMyReports } from "@/actions/reports";
import { STATUS_LABEL, STATUS_COLOR } from "@/types/assignments";
import type { AssignmentStatus, QuoteStatus, InvoiceStatus } from "@workspace/db";

type Props = { params: Promise<{ id: string }> };

const SHOW_TASKS_STATUSES = new Set<AssignmentStatus>([
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft:    "Concept",
  sent:     "Verstuurd",
  approved: "Geaccepteerd",
  rejected: "Afgewezen",
  expired:  "Verlopen",
};

const QUOTE_STATUS_COLOR: Record<QuoteStatus, { bg: string; color: string }> = {
  draft:    { bg: "#F1F5F9", color: "#64748B" },
  sent:     { bg: "#FEF9C3", color: "#A16207" },
  approved: { bg: "#DCFCE7", color: "#15803D" },
  rejected: { bg: "#FEE2E2", color: "#DC2626" },
  expired:  { bg: "#F1F5F9", color: "#64748B" },
};

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft:     "Concept",
  sent:      "Openstaand",
  paid:      "Betaald",
  cancelled: "Geannuleerd",
};

const INVOICE_STATUS_COLOR: Record<InvoiceStatus, { bg: string; color: string }> = {
  draft:     { bg: "#F1F5F9", color: "#64748B" },
  sent:      { bg: "#EDE9FE", color: "#6D28D9" },
  paid:      { bg: "#DCFCE7", color: "#15803D" },
  cancelled: { bg: "#FEE2E2", color: "#DC2626" },
};

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

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function formatAmount(amount: string): string {
  return parseFloat(amount).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
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

  const { quote, invoice } = assignment;

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
            {assignment.objectName && (
              <div className="flex items-center gap-2.5">
                <Building2 size={15} style={{ color: "var(--color-secondary)" }} />
                <span className="font-semibold" style={{ color: "var(--color-primary)" }}>
                  {assignment.objectName}
                </span>
              </div>
            )}
            {assignment.scheduledDate && (
              <div className="flex items-center gap-2.5">
                <Calendar size={15} style={{ color: "var(--color-secondary)" }} />
                <span className="text-sm" style={{ color: "var(--color-primary)" }}>
                  {formatDate(assignment.scheduledDate)}
                </span>
              </div>
            )}
            {timeSlot && (
              <div className="flex items-center gap-2.5">
                <Clock size={15} style={{ color: "var(--color-secondary)" }} />
                <span className="text-sm" style={{ color: "var(--color-primary)" }}>
                  {timeSlot}
                </span>
              </div>
            )}
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

        {/* ── Financieel — offerte + factuur ──────────────────────────────────── */}
        {(quote || invoice) && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h3
              className="mb-3 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-secondary)" }}
            >
              Financieel
            </h3>

            <div className="space-y-3">
              {/* Offerte */}
              {quote && (
                <div
                  className="rounded-xl p-3"
                  style={{ backgroundColor: "var(--color-muted)" }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <FileText size={14} style={{ color: "var(--color-accent)" }} />
                      <span className="text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>
                        Offerte
                      </span>
                      <span
                        className="font-mono text-xs rounded px-1.5 py-0.5"
                        style={{ backgroundColor: "var(--color-border)", color: "var(--color-secondary)" }}
                      >
                        {quote.quoteNumber}
                      </span>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: QUOTE_STATUS_COLOR[quote.status].bg,
                        color:           QUOTE_STATUS_COLOR[quote.status].color,
                      }}
                    >
                      {QUOTE_STATUS_LABEL[quote.status]}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-bold" style={{ color: "var(--color-primary)" }}>
                      {formatAmount(quote.amount)}
                    </span>
                    {quote.validityDate && (
                      <span className="text-xs" style={{ color: "var(--color-muted-fg)" }}>
                        Geldig t/m {formatDateShort(quote.validityDate)}
                      </span>
                    )}
                  </div>
                  <Link
                    href="/offertes"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: "var(--color-accent)" }}
                  >
                    Bekijk offerte →
                  </Link>
                </div>
              )}

              {/* Factuur */}
              {invoice && (
                <div
                  className="rounded-xl p-3"
                  style={{ backgroundColor: "var(--color-muted)" }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Receipt size={14} style={{ color: "var(--color-accent)" }} />
                      <span className="text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>
                        Factuur
                      </span>
                      <span
                        className="font-mono text-xs rounded px-1.5 py-0.5"
                        style={{ backgroundColor: "var(--color-border)", color: "var(--color-secondary)" }}
                      >
                        {invoice.invoiceNumber}
                      </span>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: INVOICE_STATUS_COLOR[invoice.status].bg,
                        color:           INVOICE_STATUS_COLOR[invoice.status].color,
                      }}
                    >
                      {INVOICE_STATUS_LABEL[invoice.status]}
                    </span>
                  </div>
                  <span className="text-base font-bold" style={{ color: "var(--color-primary)" }}>
                    {formatAmount(invoice.totalAmount)}
                  </span>
                  <div className="mt-2">
                    <Link
                      href="/facturen"
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: "var(--color-accent)" }}
                    >
                      Bekijk factuur →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Geplande werkzaamheden */}
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

        {/* Goedgekeurde foto's */}
        {assignment.approvedPhotos.length > 0 &&
          ["report_approved", "invoice_ready", "invoiced", "paid", "closed"].includes(assignment.status) && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <ImageIcon size={15} style={{ color: "var(--color-accent)" }} />
                <h3
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-secondary)" }}
                >
                  Foto&apos;s werkbon
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {assignment.approvedPhotos.map((photo) =>
                  photo.signedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photo.id}
                      src={photo.signedUrl}
                      alt="Werkbon foto"
                      className="h-24 w-24 rounded-xl object-cover"
                    />
                  ) : (
                    <div
                      key={photo.id}
                      className="flex h-24 w-24 items-center justify-center rounded-xl"
                      style={{ backgroundColor: "var(--color-muted)" }}
                    >
                      <ImageIcon size={20} style={{ color: "var(--color-muted-fg)" }} />
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

        {/* Goedgekeurd werkrapport */}
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

        {/* Rapport nog niet beschikbaar */}
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

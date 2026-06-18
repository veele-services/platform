import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  FileCheck2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
} from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getQuote } from "@/app/actions/quotes";
import { QuoteActions } from "@/components/quotes/QuoteActions";
import type { QuoteStatus } from "@/app/actions/quotes";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const quote = await getQuote(id);
    return { title: quote?.quoteNumber ?? "Offerte" };
  } catch {
    return { title: "Offerte" };
  }
}

const fmt = (v: string | number | null) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
    parseFloat(String(v ?? 0)) || 0,
  );

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("nl-NL", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function StatusBadge({ status, isExpired }: { status: QuoteStatus; isExpired: boolean }) {
  if (isExpired) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium"
        style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
      >
        <AlertTriangle className="h-4 w-4" />
        Verlopen
      </span>
    );
  }
  const map: Record<QuoteStatus, { icon: React.ReactNode; bg: string; color: string; label: string }> = {
    draft:    { icon: <Clock className="h-4 w-4" />,         bg: "#F1F5F9", color: "#475569", label: "Concept" },
    sent:     { icon: <Send className="h-4 w-4" />,          bg: "#EFF6FF", color: "#1D4ED8", label: "Ter goedkeuring" },
    approved: { icon: <CheckCircle2 className="h-4 w-4" />,  bg: "#D1FAE5", color: "#065F46", label: "Goedgekeurd" },
    rejected: { icon: <XCircle className="h-4 w-4" />,       bg: "#FEE2E2", color: "#991B1B", label: "Afgewezen" },
    expired:  { icon: <AlertTriangle className="h-4 w-4" />, bg: "#FEF3C7", color: "#92400E", label: "Verlopen" },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

export default async function QuoteDetailPage({ params }: Props) {
  const canRead = await hasPermission("quotes", "read");
  if (!canRead) return <ForbiddenPage resource="quotes" action="read" />;

  const { id } = await params;

  const [quote, canWrite, canApprove] = await Promise.all([
    getQuote(id),
    hasPermission("quotes", "write"),
    hasPermission("quotes", "approve"),
  ]);

  if (!quote) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const daysUntilExpiry = quote.status === "sent" && quote.validityDate
    ? Math.ceil((new Date(quote.validityDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/quotes"
          className="inline-flex items-center gap-1 text-sm mb-3 transition-colors hover:underline"
          style={{ color: "#64748B" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Offertes
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
                {quote.quoteNumber}
              </h1>
              <StatusBadge status={quote.status} isExpired={quote.isExpired} />
            </div>
            <p className="text-sm" style={{ color: "#64748B" }}>
              Aangemaakt op {fmtDate(quote.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Expiry warning */}
      {quote.status === "sent" && daysUntilExpiry !== null && (
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-3 mb-6"
          style={{
            backgroundColor: daysUntilExpiry <= 0 ? "#FEF2F2" : daysUntilExpiry <= 7 ? "#FEF3C7" : "#EFF6FF",
            borderLeft: `4px solid ${daysUntilExpiry <= 0 ? "#DC2626" : daysUntilExpiry <= 7 ? "#D97706" : "#3B82F6"}`,
          }}
        >
          <AlertTriangle
            className="h-5 w-5 flex-shrink-0"
            style={{ color: daysUntilExpiry <= 0 ? "#DC2626" : daysUntilExpiry <= 7 ? "#D97706" : "#3B82F6" }}
          />
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: daysUntilExpiry <= 0 ? "#991B1B" : daysUntilExpiry <= 7 ? "#92400E" : "#1D4ED8" }}
            >
              {daysUntilExpiry <= 0
                ? "Deze offerte is verlopen."
                : daysUntilExpiry === 1
                ? "Deze offerte verloopt morgen."
                : `Deze offerte verloopt over ${daysUntilExpiry} dagen.`}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
              Geldig tot: {fmtDate(quote.validityDate)}
            </p>
          </div>
        </div>
      )}

      {/* Rejection reason */}
      {quote.rejectionReason && (
        <div
          className="flex items-start gap-3 rounded-lg px-4 py-3 mb-6"
          style={{ backgroundColor: "#FEF2F2", borderLeft: "4px solid #DC2626" }}
        >
          <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "#DC2626" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "#991B1B" }}>
              Klantreactie
            </p>
            <p className="text-sm mt-0.5" style={{ color: "#374151" }}>
              {quote.rejectionReason}
            </p>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Left: details */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Customer & assignment info */}
          <div className="veele-card">
            <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#94A3B8" }}>
              Offertegegevens
            </p>

            <div
              className="flex items-start gap-3 py-3"
              style={{ borderBottom: "1px solid #F1F5F9" }}
            >
              <Building2 className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#94A3B8" }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: "#94A3B8" }}>Klant</p>
                <Link
                  href={`/customers/${quote.customerId}`}
                  className="text-sm hover:underline"
                  style={{ color: "#00B7B3" }}
                >
                  {quote.customerName}
                </Link>
                {quote.customerAddress && (
                  <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
                    {quote.customerAddress}{quote.customerCity ? `, ${quote.customerCity}` : ""}
                  </p>
                )}
              </div>
            </div>

            <div
              className="flex items-start gap-3 py-3"
              style={{ borderBottom: "1px solid #F1F5F9" }}
            >
              <FileCheck2 className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#94A3B8" }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: "#94A3B8" }}>Opdracht</p>
                <Link
                  href={`/assignments/${quote.assignmentId}`}
                  className="text-sm hover:underline"
                  style={{ color: "#00B7B3" }}
                >
                  {quote.assignmentCode} — {quote.assignmentTitle}
                </Link>
              </div>
            </div>

            <div
              className="flex items-start gap-3 py-3"
              style={{ borderBottom: "1px solid #F1F5F9" }}
            >
              <Calendar className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#94A3B8" }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: "#94A3B8" }}>Geldig tot</p>
                <p
                  className="text-sm font-medium"
                  style={{ color: quote.isExpired ? "#DC2626" : "#081D3A" }}
                >
                  {fmtDate(quote.validityDate)}
                  {quote.isExpired && (
                    <span
                      className="inline-flex items-center gap-1 ml-2 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Verlopen
                    </span>
                  )}
                </p>
              </div>
            </div>

            {quote.approvedAt && (
              <div className="flex items-start gap-3 py-3">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#94A3B8" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: "#94A3B8" }}>Goedgekeurd op</p>
                  <p className="text-sm" style={{ color: "#081D3A" }}>{fmtDate(quote.approvedAt.slice(0, 10))}</p>
                </div>
              </div>
            )}
          </div>

          {/* Task code line items */}
          {quote.lineItems.length > 0 && (
            <div className="veele-card p-0 overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
                <h2 className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
                  Taakoverzicht
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: "#F8FAFC" }}>
                  <tr>
                    {["Code", "Taak", "Prijs"].map((h) => (
                      <th
                        key={h}
                        className={`px-5 py-2.5 font-medium text-left ${h === "Prijs" ? "text-right" : ""}`}
                        style={{ color: "#64748B", fontSize: "11px" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quote.lineItems.map((li, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
                      <td className="px-5 py-3">
                        {li.taskCodeCode ? (
                          <span
                            className="font-mono text-xs rounded px-1.5 py-0.5"
                            style={{ background: "#F1F5F9", color: "#64748B" }}
                          >
                            {li.taskCodeCode}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3" style={{ color: "#374151" }}>{li.taskCodeName ?? "—"}</td>
                      <td className="px-5 py-3 text-right font-medium" style={{ color: li.invoiceable ? "#081D3A" : "#94A3B8" }}>
                        {li.invoiceable
                          ? fmt(li.price)
                          : <span className="text-xs" style={{ color: "#94A3B8" }}>Niet factureerbaar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Notes */}
          {quote.notes && (
            <div
              className="veele-card"
              style={{ backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }}
            >
              <h2
                className="font-heading text-base font-semibold mb-3"
                style={{ color: "#92400E" }}
              >
                Interne notities
              </h2>
              <p className="text-sm whitespace-pre-wrap" style={{ color: "#78350F" }}>
                {quote.notes}
              </p>
            </div>
          )}
        </div>

        {/* Right: financial summary + actions */}
        <div className="flex flex-col gap-4">
          {/* Amount card */}
          <div className="veele-card">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#94A3B8" }}>
              Offertebedrag
            </p>
            <p className="text-3xl font-bold" style={{ color: "#081D3A" }}>
              {fmt(quote.amount)}
            </p>
            <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>Exclusief btw</p>
          </div>

          {/* Actions */}
          <QuoteActions
            quoteId={quote.id}
            status={quote.status}
            isExpired={quote.isExpired}
            canWrite={canWrite}
            canApprove={canApprove}
          />
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Building2,
  MapPin,
  Calendar,
  Euro,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Receipt,
} from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getInvoice, getInvoiceStatusHistory } from "@/app/actions/invoices";
import { InvoiceActions } from "@/components/invoices/InvoiceActions";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const invoice = await getInvoice(id);
    return { title: invoice ? `Factuur ${invoice.invoiceNumber}` : "Factuur" };
  } catch {
    return { title: "Factuur" };
  }
}

const STATUS_LABELS: Record<string, string> = {
  draft:     "Concept",
  sent:      "Verzonden",
  paid:      "Betaald",
  cancelled: "Geannuleerd",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  draft:     { bg: "#F1F5F9", text: "#475569", icon: <FileText className="h-4 w-4" /> },
  sent:      { bg: "#FEF3C7", text: "#92400E", icon: <Send className="h-4 w-4" /> },
  paid:      { bg: "#D1FAE5", text: "#065F46", icon: <CheckCircle2 className="h-4 w-4" /> },
  cancelled: { bg: "#FEE2E2", text: "#991B1B", icon: <XCircle className="h-4 w-4" /> },
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: "1px solid #F1F5F9" }}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: "#94A3B8" }}>
          {label}
        </p>
        <div className="text-sm" style={{ color: "#081D3A" }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function formatEur(value: string): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parseFloat(value) || 0);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export default async function InvoiceDetailPage({ params }: Props) {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return <ForbiddenPage resource="invoices" action="read" />;

  const { id } = await params;
  const [invoice, canWrite] = await Promise.all([
    getInvoice(id),
    hasPermission("invoices", "write"),
  ]);

  if (!invoice) notFound();

  const statusHistory = await getInvoiceStatusHistory(id);

  const statusStyle = STATUS_STYLES[invoice.status] ?? STATUS_STYLES.draft;
  const isOverdue   = invoice.status === "sent" && new Date(invoice.dueDate) < new Date();

  return (
    <div className="p-8 max-w-6xl">

      {/* ── Header ── */}
      <div className="mb-8">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1 text-sm mb-3 transition-colors hover:underline"
          style={{ color: "#64748B" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Facturen
        </Link>

        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1
                className="font-heading text-2xl font-bold"
                style={{ color: "#081D3A" }}
              >
                {invoice.invoiceNumber}
              </h1>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium"
                style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
              >
                {statusStyle.icon}
                {STATUS_LABELS[invoice.status]}
              </span>
              {isOverdue && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
                >
                  <Clock className="h-3.5 w-3.5" />
                  Achterstallig
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: "#94A3B8" }}>
              Aangemaakt op {new Date(invoice.createdAt).toLocaleDateString("nl-NL", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Left: invoice details */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Customer info */}
          <div className="veele-card">
            <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#94A3B8" }}>
              Klantgegevens
            </p>
            <InfoRow
              label="Klant"
              value={
                <Link
                  href={`/customers/${invoice.customerId}`}
                  className="hover:underline"
                  style={{ color: "#00B7B3" }}
                >
                  {invoice.customerName}
                </Link>
              }
            />
            {(invoice.customerAddress || invoice.customerCity || invoice.customerPostalCode) && (
              <InfoRow
                label="Adres"
                value={
                  <span className="flex items-start gap-1">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: "#94A3B8" }} />
                    <span>
                      {invoice.customerAddress && <span>{invoice.customerAddress}<br /></span>}
                      {invoice.customerPostalCode && <span>{invoice.customerPostalCode} </span>}
                      {invoice.customerCity && <span>{invoice.customerCity}</span>}
                    </span>
                  </span>
                }
              />
            )}
            {invoice.customerEmail && (
              <InfoRow label="E-mail" value={invoice.customerEmail} />
            )}
          </div>

          {/* Assignment info */}
          <div className="veele-card">
            <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#94A3B8" }}>
              Opdrachtgegevens
            </p>
            <InfoRow
              label="Opdracht"
              value={
                <span className="flex items-center gap-2">
                  <Link
                    href={`/assignments/${invoice.assignmentId}`}
                    className="hover:underline"
                    style={{ color: "#00B7B3" }}
                  >
                    {invoice.assignmentTitle}
                  </Link>
                  <span
                    className="font-mono text-xs rounded px-1.5 py-0.5"
                    style={{ background: "#F1F5F9", color: "#475569" }}
                  >
                    {invoice.assignmentCode}
                  </span>
                </span>
              }
            />
            {invoice.objectName && (
              <InfoRow
                label="Object"
                value={
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" style={{ color: "#94A3B8" }} />
                    {invoice.objectName}
                  </span>
                }
              />
            )}
            {invoice.scheduledDate && (
              <InfoRow
                label="Geplande datum"
                value={
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" style={{ color: "#94A3B8" }} />
                    {formatDate(invoice.scheduledDate)}
                  </span>
                }
              />
            )}
          </div>

          {/* Invoice lines */}
          {invoice.lineItems.length > 0 && (
            <div className="veele-card">
              <h2
                className="font-heading text-base font-semibold mb-4 flex items-center gap-2"
                style={{ color: "#081D3A" }}
              >
                <Receipt className="h-4 w-4" style={{ color: "#00B7B3" }} />
                Regeloverzicht
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>
                        Code
                      </th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>
                        Omschrijving
                      </th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>
                        Prijs
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lineItems.map((item, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #F8FAFC" }}>
                        <td className="py-2.5 pr-4">
                          {item.taskCodeCode ? (
                            <span
                              className="font-mono text-xs rounded px-1.5 py-0.5"
                              style={{ background: "#F1F5F9", color: "#475569" }}
                            >
                              {item.taskCodeCode}
                            </span>
                          ) : (
                            <span style={{ color: "#CBD5E1" }}>—</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4" style={{ color: item.invoiceable ? "#374151" : "#94A3B8" }}>
                          {item.taskCodeName ?? "—"}
                          {!item.invoiceable && (
                            <span className="ml-2 text-xs" style={{ color: "#94A3B8" }}>(niet factureerbaar)</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-medium" style={{ color: item.invoiceable ? "#081D3A" : "#94A3B8" }}>
                          {item.price ? formatEur(item.price) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Financial summary */}
          <div className="veele-card">
            <h2
              className="font-heading text-base font-semibold mb-4 flex items-center gap-2"
              style={{ color: "#081D3A" }}
            >
              <Euro className="h-4 w-4" style={{ color: "#00B7B3" }} />
              Financieel overzicht
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm" style={{ color: "#374151" }}>
                <span>Subtotaal excl. BTW</span>
                <span>{formatEur(invoice.amount)}</span>
              </div>
              <div className="flex justify-between text-sm" style={{ color: "#374151" }}>
                <span>BTW ({invoice.vatPercentage}%)</span>
                <span>{formatEur(invoice.vatAmount)}</span>
              </div>
              <div
                className="flex justify-between text-base font-bold pt-3 mt-2"
                style={{ borderTop: "2px solid #F1F5F9", color: "#081D3A" }}
              >
                <span>Totaal incl. BTW</span>
                <span>{formatEur(invoice.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="veele-card">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#94A3B8" }}>
                Notities
              </p>
              <p className="text-sm whitespace-pre-wrap" style={{ color: "#374151" }}>
                {invoice.notes}
              </p>
            </div>
          )}
        </div>

        {/* Right: actions + status info + history */}
        <div className="flex flex-col gap-4">

          {/* Due date card */}
          <div className="veele-card">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#94A3B8" }}>
              Betalingsgegevens
            </p>
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-xs" style={{ color: "#94A3B8" }}>Vervaldatum</p>
                <p
                  className="text-sm font-semibold"
                  style={{ color: isOverdue ? "#DC2626" : "#081D3A" }}
                >
                  {formatDate(invoice.dueDate)}
                </p>
              </div>
              {invoice.paidDate && (
                <div>
                  <p className="text-xs" style={{ color: "#94A3B8" }}>Betaald op</p>
                  <p className="text-sm font-semibold" style={{ color: "#065F46" }}>
                    {formatDate(invoice.paidDate)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {canWrite && (
            <InvoiceActions invoiceId={invoice.id} status={invoice.status} />
          )}

          {/* Status history */}
          {statusHistory.length > 0 && (
            <div className="veele-card">
              <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#94A3B8" }}>
                Statusgeschiedenis
              </p>
              <ol className="relative ml-2" style={{ borderLeft: "2px solid #F1F5F9" }}>
                {statusHistory.map((event, i) => {
                  const isLast = i === statusHistory.length - 1;
                  const dt = new Date(event.timestamp);
                  const dateStr = dt.toLocaleDateString("nl-NL", {
                    day: "numeric", month: "short", year: "numeric",
                  });
                  const timeStr = dt.toLocaleTimeString("nl-NL", {
                    hour: "2-digit", minute: "2-digit",
                  });
                  return (
                    <li key={i} className={`pl-4 ${isLast ? "" : "pb-4"}`}>
                      <span
                        className="absolute -left-1.5 flex items-center justify-center w-3 h-3 rounded-full"
                        style={{ backgroundColor: isLast ? "#00B7B3" : "#CBD5E1" }}
                      />
                      <p className="text-xs font-semibold" style={{ color: "#081D3A" }}>
                        {event.label}
                      </p>
                      <p className="text-xs" style={{ color: "#94A3B8" }}>
                        {dateStr} · {timeStr}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  MapPin,
  Calendar,
  Euro,
  Clock,
  Receipt,
  Download,
} from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getInvoice, getInvoiceStatusHistory } from "@/app/actions/invoices";
import { getPaymentHistory, type PaymentRecord } from "@/app/actions/payments";
import { InvoiceActions } from "@/components/invoices/InvoiceActions";
import { ProcessStatusBadge, ProcessStepper } from "@/components/workflows/ProcessStatus";
import {
  TenantDetailActionPanel,
  TenantDetailHeader,
  TenantDetailSectionNav,
  TenantPageShell,
} from "@/components/tenant-ui";

// ── Read-only payment history (for users without write permission) ─────────────

function PaymentHistoryReadOnly({ paymentHistory }: { paymentHistory: PaymentRecord[] }) {
  return (
    <div className="veele-card">
      <h3 className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--color-foreground)" }}>
        Betalingshistorie
      </h3>
      <div className="flex flex-col gap-2">
        {paymentHistory.map((p) => {
          const amountStr = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" })
            .format(p.amountCents / 100);
          const dateStr = p.paidAt
            ? new Date(p.paidAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })
            : new Date(p.createdAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
          return (
            <div
              key={p.id}
              className="rounded-lg p-3 flex flex-col gap-1"
              style={{ background: "#F8FAFC", border: "1px solid #F1F5F9" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold" style={{ color: "var(--color-foreground)" }}>{amountStr}</span>
                <ProcessStatusBadge kind="payment" status={p.status} size="xs" />
              </div>
              <p className="text-xs font-mono" style={{ color: "#94A3B8" }}>{p.molliePaymentId}</p>
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                {p.paidAt ? `Betaald op ${dateStr}` : `Aangemaakt op ${dateStr}`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: "1px solid #F1F5F9" }}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: "#94A3B8" }}>
          {label}
        </p>
        <div className="text-sm" style={{ color: "var(--color-foreground)" }}>
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

  const [statusHistory, paymentHistory] = await Promise.all([
    getInvoiceStatusHistory(id),
    getPaymentHistory(id),
  ]);

  const isOverdue   = invoice.status === "sent" && new Date(invoice.dueDate) < new Date();

  return (
    <TenantPageShell>
      <TenantDetailHeader
        backHref="/invoices"
        backLabel="Facturen"
        title={invoice.invoiceNumber}
        badges={
          <>
            <ProcessStatusBadge kind="invoice" status={invoice.status} size="md" />
            {isOverdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                <Clock className="h-3.5 w-3.5" />
                Achterstallig
              </span>
            )}
          </>
        }
        meta={[
          { label: "Klant", value: invoice.customerName },
          { label: "Totaal", value: formatEur(invoice.totalAmount) },
          { label: "Vervaldatum", value: formatDate(invoice.dueDate) },
          {
            label: "Aangemaakt",
            value: new Date(invoice.createdAt).toLocaleDateString("nl-NL", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
          },
        ]}
        actions={
          <Link
            href={`/backoffice-api/invoices/${invoice.id}/pdf`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Link>
        }
        summary={<ProcessStepper kind="invoice" status={invoice.status} />}
      />

      <TenantDetailSectionNav
        items={[
          { label: "Klant", href: "#customer", active: true },
          { label: "Opdracht", href: "#assignment" },
          { label: "Regels", href: "#lines", count: invoice.lineItems.length },
          { label: "Financien", href: "#finance" },
          { label: "Betaling", href: "#payment", count: paymentHistory.length },
          { label: "Historie", href: "#history", count: statusHistory.length },
        ]}
      />

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">

        {/* Left: invoice details */}
        <div className="flex flex-col gap-6">

          {/* Customer info */}
          <div id="customer" className="veele-card scroll-mt-24">
            <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#94A3B8" }}>
              Klantgegevens
            </p>
            <InfoRow
              label="Klant"
              value={
                <Link
                  href={`/customers/${invoice.customerId}`}
                  className="hover:underline"
                  style={{ color: "var(--color-primary)" }}
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
          <div id="assignment" className="veele-card scroll-mt-24">
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
                    style={{ color: "var(--color-primary)" }}
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
            <div id="lines" className="veele-card scroll-mt-24">
              <h2
                className="font-heading text-base font-semibold mb-4 flex items-center gap-2"
                style={{ color: "var(--color-foreground)" }}
              >
                <Receipt className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
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
                        <td className="py-2.5 text-right font-medium" style={{ color: item.invoiceable ? "var(--color-foreground)" : "#94A3B8" }}>
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
          <div id="finance" className="veele-card scroll-mt-24">
            <h2
              className="font-heading text-base font-semibold mb-4 flex items-center gap-2"
              style={{ color: "var(--color-foreground)" }}
            >
              <Euro className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
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
                style={{ borderTop: "2px solid #F1F5F9", color: "var(--color-foreground)" }}
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
        <TenantDetailActionPanel
          title="Factuuracties"
          description="Betaallink, reminders, betaalhistorie en statusinformatie."
        >

          {/* Due date card */}
          <div id="payment" className="veele-card scroll-mt-24">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#94A3B8" }}>
              Betalingsgegevens
            </p>
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-xs" style={{ color: "#94A3B8" }}>Vervaldatum</p>
                <p
                  className="text-sm font-semibold"
                  style={{ color: isOverdue ? "#DC2626" : "var(--color-foreground)" }}
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

          {/* Actions — write-gated; read-only users see payment history separately below */}
          {canWrite && (
            <InvoiceActions
              invoiceId={invoice.id}
              status={invoice.status}
              finalizedAt={invoice.finalizedAt}
              invoiceNumber={invoice.officialInvoiceNumber}
              paymentHistory={paymentHistory}
              customerEmail={invoice.customerEmail}
            />
          )}

          {/* Payment history for read-only users (not shown inside InvoiceActions) */}
          {!canWrite && paymentHistory.length > 0 && (
            <PaymentHistoryReadOnly paymentHistory={paymentHistory} />
          )}

          {/* Status history */}
          {statusHistory.length > 0 && (
            <div id="history" className="veele-card scroll-mt-24">
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
                        style={{ backgroundColor: isLast ? "var(--color-primary)" : "#CBD5E1" }}
                      />
                      <p className="text-xs font-semibold" style={{ color: "var(--color-foreground)" }}>
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
        </TenantDetailActionPanel>
      </div>
    </TenantPageShell>
  );
}

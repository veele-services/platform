export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  Receipt,
  XCircle,
} from "lucide-react";
import { getMyInvoices } from "@/actions/invoices";
import { FinanceSummaryStrip } from "@/components/FinanceWorkspace";
import { InvoiceBatchPaymentPanel } from "@/components/InvoiceBatchPaymentPanel";
import { PaidBanner } from "@/components/PaidBanner";
import { PaymentActionButton } from "@/components/PaymentActionButton";
import {
  PortalActionMenu,
  PortalActionMenuLink,
} from "@/components/PortalActionMenu";
import { PortalFilterSheet } from "@/components/PortalFilterSheet";
import {
  PortalActiveFilterChips,
  PortalDataList,
  PortalPageShell,
  PortalToolbar,
  PortalToolbarSearch,
  PortalToolbarSelect,
  type PortalDataColumn,
} from "@/components/portal-ui";

type CustomerInvoice = Awaited<ReturnType<typeof getMyInvoices>>[number];
type InvoiceStatusFilter = "all" | "sent" | "paid" | "other";
const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; Icon: typeof Clock }
> = {
  draft: { label: "Concept", bg: "#F1F5F9", color: "#64748B", Icon: Clock },
  sent: { label: "Te betalen", bg: "#FEF3C7", color: "#92400E", Icon: Clock },
  paid: {
    label: "Betaald",
    bg: "#DCFCE7",
    color: "#166534",
    Icon: CheckCircle2,
  },
  cancelled: {
    label: "Geannuleerd",
    bg: "#FEE2E2",
    color: "#991B1B",
    Icon: XCircle,
  },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(amount: string): string {
  return parseFloat(amount).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${dateStr}T00:00:00`);
  return Math.ceil((dueDate.getTime() - today.getTime()) / DAY_MS);
}

function invoiceTotal(invoices: CustomerInvoice[]): string {
  const total = invoices.reduce(
    (sum, invoice) => sum + Number.parseFloat(invoice.outstandingAmount || "0"),
    0,
  );
  return formatAmount(total.toFixed(2));
}

function normalizeQuery(value?: string): string {
  return value?.trim().slice(0, 80) ?? "";
}

function normalizeStatus(value?: string): InvoiceStatusFilter {
  return value === "sent" || value === "paid" || value === "other"
    ? value
    : "all";
}

function statusLabel(value: InvoiceStatusFilter) {
  const labels: Record<InvoiceStatusFilter, string> = {
    all: "Alle facturen",
    sent: "Te betalen",
    paid: "Betaald",
    other: "Overig",
  };
  return labels[value];
}

function invoiceStatusGroup(invoice: CustomerInvoice): InvoiceStatusFilter {
  if (invoice.status === "sent") return "sent";
  if (invoice.status === "paid") return "paid";
  return "other";
}

function matchesInvoiceSearch(invoice: CustomerInvoice, query: string) {
  if (!query) return true;
  const haystack = [
    invoice.invoiceNumber,
    invoice.status,
    STATUS_CONFIG[invoice.status]?.label,
    invoice.totalAmount,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function filterInvoices(
  invoices: CustomerInvoice[],
  query: string,
  status: InvoiceStatusFilter,
) {
  return invoices.filter((invoice) => {
    const matchesStatus =
      status === "all" || invoiceStatusGroup(invoice) === status;
    return matchesStatus && matchesInvoiceSearch(invoice, query);
  });
}

function filterHref({
  query,
  status,
  paid,
  remove,
}: {
  query: string;
  status: InvoiceStatusFilter;
  paid?: string;
  remove: "query" | "status";
}) {
  const params = new URLSearchParams();
  if (paid) params.set("paid", paid);
  if (remove !== "query" && query) params.set("q", query);
  if (remove !== "status" && status !== "all") params.set("status", status);
  const value = params.toString();
  return value ? `/facturen?${value}` : "/facturen";
}

function invoiceColumns(): Array<PortalDataColumn<CustomerInvoice>> {
  return [
    {
      key: "invoice",
      header: "Factuur",
      render: (invoice) => (
        <span
          className="font-mono text-xs font-black"
          style={{ color: "var(--color-primary)" }}
        >
          {invoice.invoiceNumber}
        </span>
      ),
    },
    {
      key: "total",
      header: "Totaal",
      render: (invoice) => (
        <span
          className="text-sm font-black"
          style={{ color: "var(--color-primary)" }}
        >
          {formatAmount(
            invoice.status === "sent"
              ? invoice.outstandingAmount
              : invoice.totalAmount,
          )}
        </span>
      ),
    },
    {
      key: "vat",
      header: "Btw",
      render: (invoice) => (
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          {formatAmount(invoice.vatAmount)}
        </span>
      ),
    },
    {
      key: "date",
      header: "Datum",
      render: (invoice) => (
        <span
          className="block min-w-[10rem] text-sm font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          {invoice.paidDate
            ? `Betaald ${formatDate(invoice.paidDate)}`
            : invoice.dueDate
              ? `Vervalt ${formatDate(invoice.dueDate)}`
              : "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (invoice) => <InvoiceStatusBadge invoice={invoice} />,
    },
    {
      key: "actions",
      header: "Acties",
      align: "right",
      render: (invoice) => <InvoiceActions invoice={invoice} compact />,
    },
  ];
}

export default async function FacturenPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const paid = params.paid;
  const query = normalizeQuery(params.q);
  const status = normalizeStatus(params.status);
  const invoices = await getMyInvoices();
  const openInvoices = invoices.filter((invoice) => invoice.status === "sent");
  const overdueInvoices = openInvoices.filter(
    (invoice) => invoice.dueDate && daysUntil(invoice.dueDate) < 0,
  );
  const dueSoonInvoices = openInvoices.filter((invoice) => {
    if (!invoice.dueDate) return false;
    const days = daysUntil(invoice.dueDate);
    return days >= 0 && days <= 14;
  });
  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
  const visibleInvoices = filterInvoices(invoices, query, status);

  const activeFilters = [
    query
      ? {
          label: `Zoeken: ${query}`,
          href: filterHref({ query, status, paid, remove: "query" }),
        }
      : null,
    status !== "all"
      ? {
          label: statusLabel(status),
          href: filterHref({ query, status, paid, remove: "status" }),
        }
      : null,
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <PortalPageShell
      title="Facturen"
      subtitle="Openstaande, betaalde en geannuleerde facturen."
      status={{
        label:
          openInvoices.length > 0
            ? `${openInvoices.length} te betalen`
            : `${invoices.length} facturen`,
        tone: openInvoices.length > 0 ? "warning" : "accent",
      }}
    >
      {paid === "1" ? <PaidBanner /> : null}

      <FinanceSummaryStrip
        items={[
          {
            label: "Openstaand saldo",
            value: invoiceTotal(openInvoices),
            description: `${openInvoices.length} factuur${openInvoices.length === 1 ? "" : "en"} klaar voor betaling.`,
            icon: <Clock size={18} />,
            tone: openInvoices.length > 0 ? "warning" : "success",
          },
          {
            label: "Vervallen",
            value: invoiceTotal(overdueInvoices),
            description: `${overdueInvoices.length} factuur${overdueInvoices.length === 1 ? "" : "en"} over de vervaldatum.`,
            icon: <AlertTriangle size={18} />,
            tone: overdueInvoices.length > 0 ? "danger" : "neutral",
          },
          {
            label: "Binnenkort",
            value: invoiceTotal(dueSoonInvoices),
            description: `${dueSoonInvoices.length} factuur${dueSoonInvoices.length === 1 ? "" : "en"} vervalt binnen 14 dagen.`,
            icon: <CalendarClock size={18} />,
            tone: dueSoonInvoices.length > 0 ? "warning" : "neutral",
          },
          {
            label: "Betaald",
            value: `${paidInvoices.length}`,
            description: `${paidInvoices.length} factuur${paidInvoices.length === 1 ? "" : "en"} afgerond.`,
            icon: <CheckCircle2 size={18} />,
            tone: paidInvoices.length > 0 ? "success" : "neutral",
          },
        ]}
      />

      <PortalToolbar
        resultLabel={`${visibleInvoices.length} van ${invoices.length} facturen`}
        activeFilters={
          <PortalActiveFilterChips
            filters={activeFilters}
            clearHref={paid ? `/facturen?paid=${paid}` : "/facturen"}
          />
        }
        actions={
          <PortalFilterSheet
            title="Factuurfilters"
            description="Filter op betalingsstatus of factuurnummer."
            activeCount={activeFilters.length}
          >
            <InvoiceFilterForm query={query} status={status} paid={paid} />
          </PortalFilterSheet>
        }
      >
        <form
          action="/facturen"
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row"
        >
          {paid ? <input type="hidden" name="paid" value={paid} /> : null}
          <PortalToolbarSearch
            name="q"
            defaultValue={query}
            placeholder="Zoek factuurnummer of status"
          />
          <PortalToolbarSelect
            name="status"
            label="Status"
            defaultValue={status}
          >
            <option value="all">Alle facturen</option>
            <option value="sent">Te betalen</option>
            <option value="paid">Betaald</option>
            <option value="other">Overig</option>
          </PortalToolbarSelect>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-black text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Toepassen
          </button>
        </form>
      </PortalToolbar>

      <InvoiceBatchPaymentPanel invoices={openInvoices} />

      <PortalDataList
        items={visibleInvoices}
        columns={invoiceColumns()}
        getItemKey={(invoice) => invoice.id}
        tableLabel="Facturen"
        emptyState={{
          icon: (
            <Receipt size={32} style={{ color: "var(--color-muted-fg)" }} />
          ),
          title:
            activeFilters.length > 0
              ? "Geen facturen gevonden"
              : "Nog geen facturen",
          description:
            activeFilters.length > 0
              ? "Pas uw zoekopdracht of filters aan om de facturen opnieuw te bekijken."
              : "Facturen verschijnen hier zodra een opdracht is afgerond.",
        }}
        renderMobileCard={(invoice) => (
          <article className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-xs font-black"
                  style={{
                    backgroundColor: "var(--color-muted)",
                    color: "var(--color-secondary)",
                  }}
                >
                  {invoice.invoiceNumber}
                </span>
                <p
                  className="mt-2 text-2xl font-black"
                  style={{ color: "var(--color-primary)" }}
                >
                  {formatAmount(
                    invoice.status === "sent"
                      ? invoice.outstandingAmount
                      : invoice.totalAmount,
                  )}
                </p>
                <div
                  className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs"
                  style={{ color: "var(--color-secondary)" }}
                >
                  {invoice.dueDate ? (
                    <span>Vervaldatum: {formatDate(invoice.dueDate)}</span>
                  ) : null}
                  {invoice.paidDate ? (
                    <span>Betaald: {formatDate(invoice.paidDate)}</span>
                  ) : null}
                </div>
                <p
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--color-muted-fg)" }}
                >
                  Excl. btw: {formatAmount(invoice.amount)} - Btw:{" "}
                  {formatAmount(invoice.vatAmount)}
                </p>
              </div>
              <InvoiceStatusBadge invoice={invoice} />
            </div>
            <div
              className="mt-3 border-t pt-3"
              style={{ borderColor: "var(--color-border)" }}
            >
              <InvoiceActions invoice={invoice} />
            </div>
          </article>
        )}
      />
    </PortalPageShell>
  );
}

function InvoiceFilterForm({
  query,
  status,
  paid,
}: {
  query: string;
  status: InvoiceStatusFilter;
  paid?: string;
}) {
  return (
    <form action="/facturen" className="space-y-4">
      {paid ? <input type="hidden" name="paid" value={paid} /> : null}
      <div>
        <label
          htmlFor="invoice-filter-query"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Zoeken
        </label>
        <input
          id="invoice-filter-query"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Factuurnummer of status"
          className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        />
      </div>
      <div>
        <label
          htmlFor="invoice-filter-status"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Status
        </label>
        <select
          id="invoice-filter-status"
          name="status"
          defaultValue={status}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle facturen</option>
          <option value="sent">Te betalen</option>
          <option value="paid">Betaald</option>
          <option value="other">Overig</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Link
          href={paid ? `/facturen?paid=${paid}` : "/facturen"}
          className="inline-flex h-10 items-center justify-center rounded-xl border text-sm font-black"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          Wissen
        </Link>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-xl text-sm font-black text-white"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          Toepassen
        </button>
      </div>
    </form>
  );
}

function InvoiceActions({
  invoice,
  compact = false,
}: {
  invoice: CustomerInvoice;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <PortalActionMenu label={`Acties voor factuur ${invoice.invoiceNumber}`}>
        {invoice.status === "sent" ? (
          <div className="px-2 py-1">
            <PaymentActionButton
              invoiceId={invoice.id}
              label="Betalen"
              variant="secondary"
            />
          </div>
        ) : null}
        {invoice.status !== "draft" ? (
          <PortalActionMenuLink
            href={`/api/factuur/${invoice.id}/pdf`}
            external
          >
            PDF downloaden
          </PortalActionMenuLink>
        ) : null}
        <PortalActionMenuLink href={`/facturen/${invoice.id}`}>
          Detail bekijken
        </PortalActionMenuLink>
      </PortalActionMenu>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {invoice.status === "sent" ? (
        <PaymentActionButton invoiceId={invoice.id} label="Nu betalen" />
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {invoice.status !== "draft" ? (
          <Link
            href={`/api/factuur/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            prefetch={false}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black"
            style={{
              backgroundColor: "var(--color-muted)",
              color: "var(--color-secondary)",
            }}
          >
            <Download size={14} />
            PDF downloaden
          </Link>
        ) : null}
        <Link
          href={`/facturen/${invoice.id}`}
          className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-black"
          style={{ color: "var(--color-accent)" }}
        >
          Detail bekijken
        </Link>
      </div>
    </div>
  );
}

function InvoiceStatusBadge({ invoice }: { invoice: CustomerInvoice }) {
  const config = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.draft;
  const StatusIcon = config.Icon;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black"
      style={{ backgroundColor: config.bg, color: config.color }}
    >
      <StatusIcon size={11} />
      {config.label}
    </span>
  );
}

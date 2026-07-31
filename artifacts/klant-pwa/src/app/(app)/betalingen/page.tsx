import { SelectAdapter } from "@workspace/shared-ui";
export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Receipt,
  WalletCards,
  XCircle,
} from "lucide-react";
import { getMyPaymentBatches, getMyPayments } from "@/actions/payments";
import {
  FinanceSectionHeader,
  FinanceSummaryStrip,
} from "@/components/FinanceWorkspace";
import { FinanceNavigation } from "@/components/FinanceNavigation";
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
import { requireCustomerPortalFeature } from "@/lib/portal-features";

type CustomerPayment = Awaited<ReturnType<typeof getMyPayments>>[number];
type CustomerPaymentBatch = Awaited<
  ReturnType<typeof getMyPaymentBatches>
>[number];
type PaymentStatusFilter = "all" | "open" | "paid" | "failed";

function cents(amount: number): string {
  return (amount / 100).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

function formatInvoiceAmount(amount: string): string {
  return Number.parseFloat(amount).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "Nog niet betaald";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function latestPaymentDate(
  payments: CustomerPayment[],
  batches: CustomerPaymentBatch[],
): string | null {
  const latest = [
    ...payments.map((payment) => payment.paidAt ?? payment.createdAt),
    ...batches.map((batch) => batch.paidAt ?? batch.createdAt),
  ].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  return latest ?? null;
}

function statusConfig(status: string) {
  if (status === "paid") {
    return {
      label: "Betaald",
      bg: "#DCFCE7",
      color: "#166534",
      Icon: CheckCircle2,
    };
  }
  if (status === "failed" || status === "cancelled" || status === "expired") {
    return {
      label: "Niet afgerond",
      bg: "#FEE2E2",
      color: "#991B1B",
      Icon: XCircle,
    };
  }
  return { label: "Open", bg: "#FEF3C7", color: "#92400E", Icon: Clock };
}

function normalizeQuery(value?: string): string {
  return value?.trim().slice(0, 80) ?? "";
}

function normalizeStatus(value?: string): PaymentStatusFilter {
  return value === "open" || value === "paid" || value === "failed"
    ? value
    : "all";
}

function statusGroup(status: string): PaymentStatusFilter {
  if (status === "paid") return "paid";
  if (status === "failed" || status === "cancelled" || status === "expired")
    return "failed";
  return "open";
}

function statusLabel(value: PaymentStatusFilter) {
  const labels: Record<PaymentStatusFilter, string> = {
    all: "Alle betalingen",
    open: "Open",
    paid: "Betaald",
    failed: "Niet afgerond",
  };
  return labels[value];
}

function matchesPaymentSearch(payment: CustomerPayment, query: string) {
  if (!query) return true;
  const haystack = [
    payment.invoiceNumber,
    payment.status,
    cents(payment.amountCents),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function matchesBatchSearch(batch: CustomerPaymentBatch, query: string) {
  if (!query) return true;
  const haystack = [
    batch.status,
    cents(batch.amountCents),
    ...batch.invoices.map((invoice) => invoice.invoiceNumber),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function filterPayments(
  payments: CustomerPayment[],
  query: string,
  status: PaymentStatusFilter,
) {
  return payments.filter((payment) => {
    const matchesStatus =
      status === "all" || statusGroup(payment.status) === status;
    return matchesStatus && matchesPaymentSearch(payment, query);
  });
}

function filterBatches(
  batches: CustomerPaymentBatch[],
  query: string,
  status: PaymentStatusFilter,
) {
  return batches.filter((batch) => {
    const matchesStatus =
      status === "all" || statusGroup(batch.status) === status;
    return matchesStatus && matchesBatchSearch(batch, query);
  });
}

function filterHref({
  query,
  status,
  remove,
}: {
  query: string;
  status: PaymentStatusFilter;
  remove: "query" | "status";
}) {
  const params = new URLSearchParams();
  if (remove !== "query" && query) params.set("q", query);
  if (remove !== "status" && status !== "all") params.set("status", status);
  const value = params.toString();
  return value ? `/betalingen?${value}` : "/betalingen";
}

function paymentColumns(): Array<PortalDataColumn<CustomerPayment>> {
  return [
    {
      key: "invoice",
      header: "Factuur",
      render: (payment) => (
        <span
          className="font-mono text-xs font-semibold"
          style={{ color: "var(--color-primary)" }}
        >
          {payment.invoiceNumber}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Bedrag",
      render: (payment) => (
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--color-primary)" }}
        >
          {cents(payment.amountCents)}
        </span>
      ),
    },
    {
      key: "date",
      header: "Datum",
      render: (payment) => (
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          {formatDate(payment.paidAt ?? payment.createdAt)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (payment) => <PaymentStatusBadge status={payment.status} />,
    },
    {
      key: "actions",
      header: "Acties",
      align: "right",
      render: (payment) => (
        <PortalActionMenu
          label={`Acties voor betaling ${payment.invoiceNumber}`}
        >
          <PortalActionMenuLink href={`/facturen/${payment.invoiceId}`}>
            Factuur bekijken
          </PortalActionMenuLink>
          {payment.status === "open" && payment.checkoutUrl ? (
            <div className="px-2 py-1">
              <PaymentActionButton
                invoiceId={payment.invoiceId}
                label="Betaling openen"
                variant="secondary"
              />
            </div>
          ) : null}
        </PortalActionMenu>
      ),
    },
  ];
}

function batchColumns(): Array<PortalDataColumn<CustomerPaymentBatch>> {
  return [
    {
      key: "batch",
      header: "Verzameling",
      render: (batch) => (
        <span className="block min-w-[14rem]">
          <span
            className="block text-xs font-semibold uppercase"
            style={{ color: "var(--color-muted-fg)" }}
          >
            {batch.invoices.length} facturen
          </span>
          <span
            className="mt-0.5 block text-sm font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {batch.invoices.map((invoice) => invoice.invoiceNumber).join(", ")}
          </span>
        </span>
      ),
    },
    {
      key: "amount",
      header: "Bedrag",
      render: (batch) => (
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--color-primary)" }}
        >
          {cents(batch.amountCents)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (batch) => <PaymentStatusBadge status={batch.status} />,
    },
    {
      key: "actions",
      header: "Acties",
      align: "right",
      render: (batch) => (
        <PortalActionMenu label="Acties voor verzamelfactuur">
          <PortalActionMenuLink
            href={`/api/verzamelfactuur/${batch.id}/pdf`}
            external
          >
            Verzamelfactuur downloaden
          </PortalActionMenuLink>
          {batch.status === "open" && batch.checkoutUrl ? (
            <PortalActionMenuLink href={batch.checkoutUrl} external>
              Beveiligde betaling openen
            </PortalActionMenuLink>
          ) : null}
        </PortalActionMenu>
      ),
    },
  ];
}

export default async function BetalingenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireCustomerPortalFeature("finance");
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const status = normalizeStatus(params.status);
  const [payments, batches] = await Promise.all([
    getMyPayments(),
    getMyPaymentBatches(),
  ]);
  const visiblePayments = filterPayments(payments, query, status);
  const visibleBatches = filterBatches(batches, query, status);
  const openCount =
    payments.filter((payment) => statusGroup(payment.status) === "open")
      .length +
    batches.filter((batch) => statusGroup(batch.status) === "open").length;
  const paidTotal =
    payments
      .filter((payment) => statusGroup(payment.status) === "paid")
      .reduce((sum, payment) => sum + payment.amountCents, 0) +
    batches
      .filter((batch) => statusGroup(batch.status) === "paid")
      .reduce((sum, batch) => sum + batch.amountCents, 0);
  const failedCount =
    payments.filter((payment) => statusGroup(payment.status) === "failed")
      .length +
    batches.filter((batch) => statusGroup(batch.status) === "failed").length;
  const latestDate = latestPaymentDate(payments, batches);

  const activeFilters = [
    query
      ? {
          label: `Zoeken: ${query}`,
          href: filterHref({ query, status, remove: "query" }),
        }
      : null,
    status !== "all"
      ? {
          label: statusLabel(status),
          href: filterHref({ query, status, remove: "status" }),
        }
      : null,
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <PortalPageShell
      title="Betalingen"
      subtitle="Losse facturen en verzamelbetalingen op één plek."
      status={{
        label:
          openCount > 0
            ? `${openCount} open`
            : `${payments.length + batches.length} betalingen`,
        tone: openCount > 0 ? "warning" : "accent",
      }}
    >
      <FinanceNavigation />
      <FinanceSummaryStrip
        items={[
          {
            label: "Open betalingen",
            value: `${openCount}`,
            description: "Betaallinks die nog afgerond kunnen worden.",
            icon: <Clock size={18} />,
            tone: openCount > 0 ? "warning" : "neutral",
          },
          {
            label: "Betaald totaal",
            value: cents(paidTotal),
            description: "Totaal van afgeronde losse en verzamelbetalingen.",
            icon: <CheckCircle2 size={18} />,
            tone: paidTotal > 0 ? "success" : "neutral",
          },
          {
            label: "Niet afgerond",
            value: `${failedCount}`,
            description: "Mislukte, verlopen of geannuleerde betaalpogingen.",
            icon: <XCircle size={18} />,
            tone: failedCount > 0 ? "danger" : "neutral",
          },
          {
            label: "Laatste betaling",
            value: latestDate ? formatDate(latestDate) : "-",
            description: latestDate
              ? "Meest recente betaalactiviteit."
              : "Nog geen betaling gestart.",
            icon: <WalletCards size={18} />,
            tone: latestDate ? "accent" : "neutral",
          },
        ]}
      />

      <PortalToolbar
        resultLabel={`${visiblePayments.length + visibleBatches.length} van ${payments.length + batches.length} betalingen`}
        activeFilters={
          <PortalActiveFilterChips
            filters={activeFilters}
            clearHref="/betalingen"
          />
        }
        actions={
          <PortalFilterSheet
            title="Betalingsfilters"
            description="Filter op status of factuurnummer."
            activeCount={activeFilters.length}
          >
            <PaymentFilterForm query={query} status={status} />
          </PortalFilterSheet>
        }
      >
        <form
          action="/betalingen"
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row"
        >
          <PortalToolbarSearch
            name="q"
            defaultValue={query}
            placeholder="Zoek factuur of betaling"
          />
          <PortalToolbarSelect
            name="status"
            label="Status"
            defaultValue={status}
          >
            <option value="all">Alle betalingen</option>
            <option value="open">Open</option>
            <option value="paid">Betaald</option>
            <option value="failed">Niet afgerond</option>
          </PortalToolbarSelect>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent-accessible)" }}
          >
            Toepassen
          </button>
        </form>
      </PortalToolbar>

      <section className="space-y-4">
        <FinanceSectionHeader
          icon={<CreditCard size={20} />}
          title="Losse betalingen"
          subtitle="Betalingen per factuur."
        />
        <PortalDataList
          items={visiblePayments}
          columns={paymentColumns()}
          getItemKey={(payment) => payment.id}
          tableLabel="Losse betalingen"
          emptyState={{
            icon: (
              <CreditCard
                size={30}
                style={{ color: "var(--color-muted-fg)" }}
              />
            ),
            title:
              activeFilters.length > 0
                ? "Geen losse betalingen gevonden"
                : "Geen losse betalingen",
            description:
              activeFilters.length > 0
                ? "Pas uw zoekopdracht of filters aan om de betalingen opnieuw te bekijken."
                : "Er zijn nog geen losse betalingen gestart.",
          }}
          renderMobileCard={(payment) => <PaymentCard payment={payment} />}
        />
      </section>

      <section className="space-y-4">
        <FinanceSectionHeader
          icon={<WalletCards size={20} />}
          title="Verzamelfacturen"
          subtitle="Een checkout voor meerdere open facturen."
        />
        <PortalDataList
          items={visibleBatches}
          columns={batchColumns()}
          getItemKey={(batch) => batch.id}
          tableLabel="Verzamelbetalingen"
          emptyState={{
            icon: (
              <WalletCards
                size={30}
                style={{ color: "var(--color-muted-fg)" }}
              />
            ),
            title:
              activeFilters.length > 0
                ? "Geen verzamelbetalingen gevonden"
                : "Geen verzamelbetalingen",
            description:
              activeFilters.length > 0
                ? "Pas uw zoekopdracht of filters aan om verzamelbetalingen opnieuw te bekijken."
                : "Nog geen verzamelbetalingen gestart.",
          }}
          renderMobileCard={(batch) => <BatchCard batch={batch} />}
        />
      </section>
    </PortalPageShell>
  );
}

function PaymentFilterForm({
  query,
  status,
}: {
  query: string;
  status: PaymentStatusFilter;
}) {
  return (
    <form action="/betalingen" className="space-y-4">
      <div>
        <label
          htmlFor="payment-filter-query"
          className="text-xs font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          Zoeken
        </label>
        <input
          id="payment-filter-query"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Factuur of betaling"
          className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        />
      </div>
      <div>
        <label
          htmlFor="payment-filter-status"
          className="text-xs font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          Status
        </label>
        <SelectAdapter
          id="payment-filter-status"
          name="status"
          defaultValue={status}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle betalingen</option>
          <option value="open">Open</option>
          <option value="paid">Betaald</option>
          <option value="failed">Niet afgerond</option>
        </SelectAdapter>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Link
          href="/betalingen"
          className="inline-flex h-10 items-center justify-center rounded-xl border text-sm font-semibold"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          Wissen
        </Link>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--color-accent-accessible)" }}
        >
          Toepassen
        </button>
      </div>
    </form>
  );
}

function PaymentCard({ payment }: { payment: CustomerPayment }) {
  return (
    <article
      className="rounded-2xl border bg-white p-4 shadow-sm"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="font-mono text-xs font-semibold"
            style={{ color: "var(--color-muted-fg)" }}
          >
            {payment.invoiceNumber}
          </p>
          <p
            className="mt-1 text-xl font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {cents(payment.amountCents)}
          </p>
          <p
            className="mt-1 text-xs font-semibold"
            style={{ color: "var(--color-secondary)" }}
          >
            {formatDate(payment.paidAt ?? payment.createdAt)}
          </p>
        </div>
        <PaymentStatusBadge status={payment.status} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Link
          href={`/facturen/${payment.invoiceId}`}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold"
          style={{ color: "var(--color-primary)" }}
        >
          <Receipt size={15} />
          Factuur bekijken
        </Link>
        {payment.status === "open" && payment.checkoutUrl ? (
          <PaymentActionButton
            invoiceId={payment.invoiceId}
            label="Betaling openen"
            variant="secondary"
          />
        ) : null}
      </div>
    </article>
  );
}

function BatchCard({ batch }: { batch: CustomerPaymentBatch }) {
  return (
    <article
      className="rounded-2xl border bg-white p-4 shadow-sm"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-muted-fg)" }}
          >
            {batch.invoices.length} facturen
          </p>
          <p
            className="mt-1 text-xl font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {cents(batch.amountCents)}
          </p>
        </div>
        <PaymentStatusBadge status={batch.status} />
      </div>
      <div className="mt-3 space-y-1.5">
        {batch.invoices.map((invoice) => (
          <Link
            key={invoice.id}
            href={`/facturen/${invoice.id}`}
            className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold"
            style={{ color: "var(--color-secondary)" }}
          >
            <span>{invoice.invoiceNumber}</span>
            <span>{formatInvoiceAmount(invoice.totalAmount)}</span>
          </Link>
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        <Link
          href={`/api/verzamelfactuur/${batch.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold"
          style={{ color: "var(--color-primary)" }}
        >
          <Download size={15} />
          Verzamelfactuur downloaden
        </Link>
        {batch.status === "open" && batch.checkoutUrl ? (
          <Link
            href={batch.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded-xl bg-[#E8FBFA] px-4 py-3 text-sm font-semibold text-[#087C79]"
          >
            Beveiligde betaling openen
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const config = statusConfig(status);
  const StatusIcon = config.Icon;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: config.bg, color: config.color }}
    >
      <StatusIcon size={12} />
      {config.label}
    </span>
  );
}

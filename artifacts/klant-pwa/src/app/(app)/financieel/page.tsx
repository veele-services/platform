export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Receipt,
  WalletCards,
} from "lucide-react";
import { getMyInvoices } from "@/actions/invoices";
import { getMyPaymentBatches, getMyPayments } from "@/actions/payments";
import { getMyQuotes } from "@/actions/quotes";
import { FinanceActionPanel, FinanceSummaryStrip } from "@/components/FinanceWorkspace";
import { PortalPageShell } from "@/components/portal-ui";

type CustomerInvoice = Awaited<ReturnType<typeof getMyInvoices>>[number];
type CustomerPayment = Awaited<ReturnType<typeof getMyPayments>>[number];
type CustomerPaymentBatch = Awaited<ReturnType<typeof getMyPaymentBatches>>[number];

const DAY_MS = 24 * 60 * 60 * 1000;

function formatAmount(amount: number | string): string {
  const value = typeof amount === "number" ? amount : Number.parseFloat(amount || "0");
  return value.toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

function formatCents(amount: number): string {
  return (amount / 100).toLocaleString("nl-NL", {
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

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${dateStr}T00:00:00`);
  return Math.ceil((dueDate.getTime() - today.getTime()) / DAY_MS);
}

function invoiceTotal(invoices: CustomerInvoice[]): number {
  return invoices.reduce((sum, invoice) => sum + Number.parseFloat(invoice.totalAmount || "0"), 0);
}

function latestPaymentRecord(
  payments: CustomerPayment[],
  batches: CustomerPaymentBatch[],
) {
  return [
    ...payments.map((payment) => ({
      label: payment.invoiceNumber,
      amountCents: payment.amountCents,
      date: payment.paidAt ?? payment.createdAt,
      href: `/facturen/${payment.invoiceId}`,
    })),
    ...batches.map((batch) => ({
      label: `${batch.invoices.length} facturen`,
      amountCents: batch.amountCents,
      date: batch.paidAt ?? batch.createdAt,
      href: "/betalingen",
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

type FinanceCardProps = {
  href: string;
  title: string;
  description: string;
  meta: string;
  actionLabel: string;
  Icon: typeof Receipt;
  tone?: "accent" | "warning" | "neutral";
};

function FinanceCard({
  href,
  title,
  description,
  meta,
  actionLabel,
  Icon,
  tone = "neutral",
}: FinanceCardProps) {
  const isAccent = tone === "accent";
  const isWarning = tone === "warning";

  return (
    <Link
      href={href}
      className="group rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: isWarning ? "#FEF3C7" : isAccent ? "#E8FBFA" : "#F1F5F9",
            color: isWarning ? "#92400E" : isAccent ? "#087C79" : "var(--color-primary)",
          }}
        >
          <Icon size={22} strokeWidth={2.35} />
        </span>
        <span
          className="rounded-full px-3 py-1 text-xs font-black"
          style={{
            backgroundColor: isWarning ? "#FEF3C7" : "#F1F5F9",
            color: isWarning ? "#92400E" : "var(--color-secondary)",
          }}
        >
          {meta}
        </span>
      </div>
      <h2 className="mt-4 text-lg font-black" style={{ color: "var(--color-primary)" }}>
        {title}
      </h2>
      <p className="mt-1 min-h-12 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
        {description}
      </p>
      <span
        className="mt-4 inline-flex items-center gap-2 text-sm font-black"
        style={{ color: "var(--color-accent)" }}
      >
        {actionLabel}
        <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export default async function FinancieelPage() {
  const [invoices, payments, batches, quotes] = await Promise.all([
    getMyInvoices(),
    getMyPayments(),
    getMyPaymentBatches(),
    getMyQuotes(),
  ]);

  const openInvoices = invoices.filter((invoice) => invoice.status === "sent");
  const overdueInvoices = openInvoices.filter((invoice) => invoice.dueDate && daysUntil(invoice.dueDate) < 0);
  const dueSoonInvoices = openInvoices.filter((invoice) => {
    if (!invoice.dueDate) return false;
    const days = daysUntil(invoice.dueDate);
    return days >= 0 && days <= 14;
  });
  const pendingQuotes = quotes.filter((quote) => quote.assignmentStatus === "awaiting_approval");
  const latestPayment = latestPaymentRecord(payments, batches);
  const openPaymentCount =
    payments.filter((payment) => payment.status === "open").length +
    batches.filter((batch) => batch.status === "open").length;

  return (
    <PortalPageShell
      title="Financieel"
      subtitle="Facturen, betalingen en offertes op een vaste plek."
      status={{
        label: openInvoices.length > 0 ? `${openInvoices.length} te betalen` : "Bijgewerkt",
        tone: openInvoices.length > 0 ? "warning" : "accent",
      }}
    >
      <FinanceSummaryStrip
        items={[
          {
            label: "Openstaand saldo",
            value: formatAmount(invoiceTotal(openInvoices)),
            description: `${openInvoices.length} factuur${openInvoices.length === 1 ? "" : "en"} te betalen.`,
            icon: <Clock size={18} />,
            tone: openInvoices.length > 0 ? "warning" : "success",
          },
          {
            label: "Vervallen",
            value: formatAmount(invoiceTotal(overdueInvoices)),
            description: `${overdueInvoices.length} factuur${overdueInvoices.length === 1 ? "" : "en"} over de vervaldatum.`,
            icon: <AlertTriangle size={18} />,
            tone: overdueInvoices.length > 0 ? "danger" : "neutral",
          },
          {
            label: "Binnenkort te betalen",
            value: formatAmount(invoiceTotal(dueSoonInvoices)),
            description: `${dueSoonInvoices.length} factuur${dueSoonInvoices.length === 1 ? "" : "en"} vervalt binnen 14 dagen.`,
            icon: <CalendarClock size={18} />,
            tone: dueSoonInvoices.length > 0 ? "warning" : "neutral",
          },
          {
            label: "Laatste betaling",
            value: latestPayment ? formatCents(latestPayment.amountCents) : "-",
            description: latestPayment
              ? `${latestPayment.label} op ${formatDate(latestPayment.date)}.`
              : "Nog geen betaling geregistreerd.",
            icon: <CheckCircle2 size={18} />,
            tone: latestPayment ? "success" : "neutral",
          },
        ]}
      />

      {openInvoices.length > 0 || pendingQuotes.length > 0 ? (
        <FinanceActionPanel
          eyebrow="Actie nodig"
          title="Financiele inbox"
          description="Betaal openstaande facturen of rond offertes af voordat ze verlopen."
          tone={overdueInvoices.length > 0 ? "danger" : "warning"}
          action={
            <Link
              href="/facturen"
              className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-black text-white shadow-sm"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Naar facturen
            </Link>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {openInvoices.slice(0, 3).map((invoice) => (
              <Link
                key={invoice.id}
                href={`/facturen/${invoice.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition hover:bg-slate-50"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs font-black" style={{ color: "var(--color-primary)" }}>
                    {invoice.invoiceNumber}
                  </span>
                  <span className="mt-1 block text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>
                    Vervalt {formatDate(invoice.dueDate)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-black" style={{ color: "var(--color-primary)" }}>
                  {formatAmount(invoice.totalAmount)}
                </span>
              </Link>
            ))}
            {pendingQuotes.slice(0, 3).map((quote) => (
              <Link
                key={quote.id}
                href="/offertes?filter=action_required"
                className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition hover:bg-slate-50"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs font-black" style={{ color: "var(--color-primary)" }}>
                    {quote.quoteNumber}
                  </span>
                  <span className="mt-1 block truncate text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>
                    {quote.assignmentTitle}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-black" style={{ color: "var(--color-primary)" }}>
                  {formatAmount(quote.amount)}
                </span>
              </Link>
            ))}
          </div>
        </FinanceActionPanel>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <FinanceCard
          href="/facturen"
          title="Facturen"
          description="Bekijk openstaande, betaalde en geannuleerde facturen en download PDF's."
          meta={`${openInvoices.length} open`}
          actionLabel="Facturen bekijken"
          Icon={Receipt}
          tone={openInvoices.length > 0 ? "warning" : "neutral"}
        />
        <FinanceCard
          href="/betalingen"
          title="Betalingen"
          description="Volg Mollie betalingen, losse facturen en verzamelbetalingen."
          meta={`${payments.length + batches.length} records`}
          actionLabel="Betalingen openen"
          Icon={WalletCards}
          tone={openPaymentCount > 0 ? "accent" : "neutral"}
        />
        <FinanceCard
          href="/offertes"
          title="Offertes"
          description="Controleer ontvangen offertes en geef digitaal akkoord of afwijzing."
          meta={`${pendingQuotes.length} actie${pendingQuotes.length === 1 ? "" : "s"}`}
          actionLabel="Offertes beoordelen"
          Icon={FileText}
          tone={pendingQuotes.length > 0 ? "warning" : "neutral"}
        />
      </section>
    </PortalPageShell>
  );
}

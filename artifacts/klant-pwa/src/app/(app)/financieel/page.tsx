export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Receipt,
  WalletCards,
} from "lucide-react";
import { getMyInvoiceSummary } from "@/actions/invoices";
import { getMyPaymentBatches, getMyPayments } from "@/actions/payments";
import { getMyPendingQuoteCount } from "@/actions/quotes";
import { PageShell } from "@/components/PageShell";

function formatAmount(amount: string): string {
  return Number.parseFloat(amount || "0").toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
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
      className="group rounded-[22px] border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
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
  const [invoiceSummary, pendingQuoteCount, payments, batches] = await Promise.all([
    getMyInvoiceSummary(),
    getMyPendingQuoteCount(),
    getMyPayments(),
    getMyPaymentBatches(),
  ]);

  const openPaymentCount =
    payments.filter((payment) => payment.status === "open").length +
    batches.filter((batch) => batch.status === "open").length;

  return (
    <PageShell
      title="Financieel"
      subtitle="Facturen, betalingen en offertes op een vaste plek."
    >
      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[22px] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: "var(--color-secondary)" }}>
            <Clock size={16} />
            Openstaand
          </div>
          <p className="mt-3 text-2xl font-black" style={{ color: "var(--color-primary)" }}>
            {formatAmount(invoiceSummary.openTotal)}
          </p>
          <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>
            {invoiceSummary.openCount} factuur{invoiceSummary.openCount === 1 ? "" : "en"} te betalen
          </p>
        </div>
        <div className="rounded-[22px] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: "var(--color-secondary)" }}>
            <WalletCards size={16} />
            Betalingen
          </div>
          <p className="mt-3 text-2xl font-black" style={{ color: "var(--color-primary)" }}>
            {openPaymentCount}
          </p>
          <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>
            open betaalactie{openPaymentCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-[22px] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: "var(--color-secondary)" }}>
            <CheckCircle2 size={16} />
            Offertes
          </div>
          <p className="mt-3 text-2xl font-black" style={{ color: "var(--color-primary)" }}>
            {pendingQuoteCount}
          </p>
          <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>
            offerte{pendingQuoteCount === 1 ? "" : "s"} wacht{pendingQuoteCount === 1 ? "" : "en"} op akkoord
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <FinanceCard
          href="/facturen"
          title="Facturen"
          description="Bekijk openstaande, betaalde en geannuleerde facturen en download PDF's."
          meta={`${invoiceSummary.openCount} open`}
          actionLabel="Facturen bekijken"
          Icon={Receipt}
          tone={invoiceSummary.openCount > 0 ? "warning" : "neutral"}
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
          meta={`${pendingQuoteCount} actie${pendingQuoteCount === 1 ? "" : "s"}`}
          actionLabel="Offertes beoordelen"
          Icon={FileText}
          tone={pendingQuoteCount > 0 ? "warning" : "neutral"}
        />
      </section>
    </PageShell>
  );
}

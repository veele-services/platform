export const dynamic = "force-dynamic";

import Link from "next/link";
import { CheckCircle2, Clock, CreditCard, Download, Receipt, WalletCards, XCircle } from "lucide-react";
import { getMyPaymentBatches, getMyPayments } from "@/actions/payments";
import { PageShell } from "@/components/PageShell";
import { PaymentActionButton } from "@/components/PaymentActionButton";

function cents(amount: number): string {
  return (amount / 100).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "Nog niet betaald";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusConfig(status: string) {
  if (status === "paid") return { label: "Betaald", bg: "#DCFCE7", color: "#166534", Icon: CheckCircle2 };
  if (status === "failed" || status === "cancelled" || status === "expired") return { label: "Niet afgerond", bg: "#FEE2E2", color: "#991B1B", Icon: XCircle };
  return { label: "Open", bg: "#FEF3C7", color: "#92400E", Icon: Clock };
}

export default async function BetalingenPage() {
  const [payments, batches] = await Promise.all([
    getMyPayments(),
    getMyPaymentBatches(),
  ]);

  return (
    <PageShell title="Betalingen" subtitle="Mollie betalingen, losse facturen en verzamelbetalingen.">
      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="rounded-[22px] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#087C79]">
              <CreditCard size={21} />
            </span>
            <div>
              <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
                Losse betalingen
              </h2>
              <p className="text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>
                Betalingen per factuur.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {payments.length > 0 ? payments.map((payment) => {
              const cfg = statusConfig(payment.status);
              const Icon = cfg.Icon;
              return (
                <div key={payment.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs font-black" style={{ color: "var(--color-muted-fg)" }}>
                        {payment.invoiceNumber}
                      </p>
                      <p className="mt-1 text-xl font-black" style={{ color: "var(--color-primary)" }}>
                        {cents(payment.amountCents)}
                      </p>
                      <p className="mt-1 text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>
                        {formatDate(payment.paidAt ?? payment.createdAt)}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                      <Icon size={12} />
                      {cfg.label}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Link href={`/facturen/${payment.invoiceId}`} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black" style={{ color: "var(--color-primary)" }}>
                      <Receipt size={15} />
                      Factuur bekijken
                    </Link>
                    {payment.status === "open" && payment.checkoutUrl ? (
                      <PaymentActionButton invoiceId={payment.invoiceId} label="Betaling openen" variant="secondary" />
                    ) : null}
                  </div>
                </div>
              );
            }) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>
                Er zijn nog geen betalingen gestart.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[22px] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#087C79]">
              <WalletCards size={21} />
            </span>
            <div>
              <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
                Verzamelfacturen
              </h2>
              <p className="text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>
                Een checkout voor meerdere open facturen.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {batches.length > 0 ? batches.map((batch) => {
              const cfg = statusConfig(batch.status);
              const Icon = cfg.Icon;
              return (
                <div key={batch.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--color-muted-fg)" }}>
                        {batch.invoices.length} facturen
                      </p>
                      <p className="mt-1 text-xl font-black" style={{ color: "var(--color-primary)" }}>
                        {cents(batch.amountCents)}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                      <Icon size={12} />
                      {cfg.label}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {batch.invoices.map((invoice) => (
                      <Link key={invoice.id} href={`/facturen/${invoice.id}`} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold" style={{ color: "var(--color-secondary)" }}>
                        <span>{invoice.invoiceNumber}</span>
                        <span>{Number.parseFloat(invoice.totalAmount).toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}</span>
                      </Link>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2">
                    <Link href={`/api/verzamelfactuur/${batch.id}/pdf`} target="_blank" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black" style={{ color: "var(--color-primary)" }}>
                      <Download size={15} />
                      Verzamelfactuur downloaden
                    </Link>
                    {batch.status === "open" && batch.checkoutUrl ? (
                      <Link href={batch.checkoutUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center rounded-2xl bg-[#E8FBFA] px-4 py-3 text-sm font-black text-[#087C79]">
                        Mollie checkout openen
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            }) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>
                Nog geen verzamelbetalingen gestart.
              </p>
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}

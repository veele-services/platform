export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Receipt,
  Download,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { getMyInvoice } from "@/actions/invoices";
import { PaymentActionButton } from "@/components/PaymentActionButton";

type Props = { params: Promise<{ id: string }> };

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatAmount(amount: string | null): string {
  if (!amount) return "€ 0,00";
  return parseFloat(amount).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; Icon: React.ElementType }
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

export default async function FactuurDetailPage({ params }: Props) {
  const { id } = await params;
  const invoice = await getMyInvoice(id);

  if (!invoice) notFound();

  const cfg = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.draft;
  const StatusIcon = cfg.Icon;

  const rows: [string, string][] = [
    ["Factuurnummer", invoice.invoiceNumber],
    ["Factuurdatum", formatDate(invoice.createdAt.slice(0, 10))],
    ["Vervaldatum", formatDate(invoice.dueDate)],
    ...(invoice.paidDate
      ? [["Betaald op", formatDate(invoice.paidDate)] as [string, string]]
      : []),
  ];

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-muted)" }}
    >
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3.5 md:hidden"
        style={{ backgroundColor: "white", borderColor: "var(--color-border)" }}
      >
        <Link href="/facturen">
          <ChevronLeft size={24} style={{ color: "var(--color-primary)" }} />
        </Link>
        <div className="min-w-0 flex-1">
          <span
            className="font-mono text-xs font-bold"
            style={{ color: "var(--color-accent)" }}
          >
            {invoice.invoiceNumber}
          </span>
          <h1
            className="truncate text-sm font-semibold leading-tight"
            style={{ color: "var(--color-primary)" }}
          >
            Factuurdetail
          </h1>
        </div>
        <span
          className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: cfg.bg, color: cfg.color }}
        >
          <StatusIcon size={10} />
          {cfg.label}
        </span>
      </div>

      <div className="mx-auto max-w-[1120px] space-y-4 p-4 md:p-7">
        <div
          className="hidden items-center justify-between gap-5 rounded-[22px] border bg-white px-6 py-5 shadow-sm md:flex"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div>
            <p
              className="font-mono text-xs font-black"
              style={{ color: "var(--color-accent)" }}
            >
              {invoice.invoiceNumber}
            </p>
            <h1
              className="mt-1 text-2xl font-black"
              style={{ color: "var(--color-primary)" }}
            >
              Factuurdetail
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black"
              style={{ backgroundColor: cfg.bg, color: cfg.color }}
            >
              <StatusIcon size={12} />
              {cfg.label}
            </span>
            <Link
              href="/facturen"
              className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-black"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-primary)",
              }}
            >
              <ChevronLeft size={16} />
              Facturen
            </Link>
          </div>
        </div>

        {/* Bedragkaart */}
        <div className="rounded-2xl bg-white p-5 shadow-sm text-center">
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-1"
            style={{ color: "var(--color-secondary)" }}
          >
            Totaalbedrag
          </p>
          <p
            className="text-4xl font-bold"
            style={{ color: "var(--color-primary)" }}
          >
            {formatAmount(
              invoice.status === "sent"
                ? invoice.outstandingAmount
                : invoice.totalAmount,
            )}
          </p>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-muted-fg)" }}
          >
            Excl. btw: {formatAmount(invoice.amount)} · Btw:{" "}
            {formatAmount(invoice.vatAmount)}
          </p>
        </div>

        {/* Factuurgegevens */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h3
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-secondary)" }}
          >
            Factuurgegevens
          </h3>
          <dl className="space-y-2.5">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4"
              >
                <dt
                  className="shrink-0 text-xs"
                  style={{ color: "var(--color-secondary)" }}
                >
                  {label}
                </dt>
                <dd
                  className="text-right text-sm font-medium tabular-nums"
                  style={{ color: "var(--color-primary)" }}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Acties */}
        {invoice.status !== "draft" && (
          <div className="space-y-2">
            {invoice.status === "sent" && (
              <PaymentActionButton invoiceId={invoice.id} label="Nu betalen" />
            )}
            <Link
              href={`/api/factuur/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              prefetch={false}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium shadow-sm"
              style={{
                backgroundColor: "white",
                color: "var(--color-secondary)",
                border: "1px solid var(--color-border)",
              }}
            >
              <Download size={16} />
              PDF downloaden
            </Link>
          </div>
        )}

        {/* Link naar bijbehorende opdracht */}
        {invoice.assignmentId && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h3
              className="mb-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-secondary)" }}
            >
              Gekoppelde opdracht
            </h3>
            <Link
              href={`/opdrachten/${invoice.assignmentId}`}
              className="text-sm font-medium"
              style={{ color: "var(--color-accent)" }}
            >
              Bekijk opdracht →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

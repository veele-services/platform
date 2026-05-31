import Link from "next/link";
import { Receipt, CheckCircle2, Clock, XCircle, Download } from "lucide-react";
import { getMyInvoices } from "@/actions/invoices";
import { PaidBanner } from "@/components/PaidBanner";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function formatAmount(amount: string): string {
  return parseFloat(amount).toLocaleString("nl-NL", {
    style:    "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; Icon: React.ElementType }> = {
  draft:     { label: "Concept",    bg: "#F1F5F9", color: "#64748B", Icon: Clock },
  sent:      { label: "Te betalen", bg: "#FEF3C7", color: "#92400E", Icon: Clock },
  paid:      { label: "Betaald",    bg: "#DCFCE7", color: "#166534", Icon: CheckCircle2 },
  cancelled: { label: "Geannuleerd", bg: "#FEE2E2", color: "#991B1B", Icon: XCircle },
};

interface Props {
  searchParams: Promise<{ paid?: string }>;
}

export default async function FacturenPage({ searchParams }: Props) {
  const { paid } = await searchParams;
  const invoices = await getMyInvoices();

  const openInvoices  = invoices.filter((i) => i.status === "sent");
  const paidInvoices  = invoices.filter((i) => i.status === "paid");
  const otherInvoices = invoices.filter((i) => i.status !== "sent" && i.status !== "paid");

  return (
    <div className="space-y-4 p-4 md:p-0">
      <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
        Facturen
      </h1>

      {paid === "1" && <PaidBanner />}

      {invoices.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <Receipt size={32} className="mx-auto mb-3" style={{ color: "var(--color-muted-fg)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            Nog geen facturen
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-secondary)" }}>
            Facturen verschijnen hier zodra een opdracht is afgerond.
          </p>
        </div>
      ) : (
        <>
          {openInvoices.length > 0 && (
            <InvoiceGroup title="Te betalen" invoices={openInvoices} />
          )}
          {paidInvoices.length > 0 && (
            <InvoiceGroup title="Betaald" invoices={paidInvoices} />
          )}
          {otherInvoices.length > 0 && (
            <InvoiceGroup title="Overig" invoices={otherInvoices} />
          )}
        </>
      )}
    </div>
  );
}

function InvoiceGroup({
  title,
  invoices,
}: {
  title:    string;
  invoices: Awaited<ReturnType<typeof getMyInvoices>>;
}) {
  return (
    <section>
      <h2
        className="mb-2 text-sm font-semibold uppercase tracking-wide"
        style={{ color: "var(--color-secondary)" }}
      >
        {title}
      </h2>
      <div className="space-y-3">
        {invoices.map((inv) => {
          const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.draft;
          const StatusIcon = cfg.Icon;

          return (
            <div key={inv.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span
                    className="font-mono text-xs rounded px-1.5 py-0.5"
                    style={{ backgroundColor: "var(--color-muted)", color: "var(--color-secondary)" }}
                  >
                    {inv.invoiceNumber}
                  </span>
                  <p className="mt-2 text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
                    {formatAmount(inv.totalAmount)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: "var(--color-secondary)" }}>
                    {inv.dueDate && (
                      <span>Vervaldatum: {formatDate(inv.dueDate)}</span>
                    )}
                    {inv.paidDate && (
                      <span>Betaald: {formatDate(inv.paidDate)}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--color-muted-fg)" }}>
                    Excl. btw: {formatAmount(inv.amount)} · Btw: {formatAmount(inv.vatAmount)}
                  </p>
                </div>
                <span
                  className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: cfg.bg, color: cfg.color }}
                >
                  <StatusIcon size={10} />
                  {cfg.label}
                </span>
              </div>

              {(inv.status === "sent" || inv.status === "paid") && (
                <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex flex-col gap-2">
                    {inv.status === "sent" && inv.checkoutUrl && (
                      <Link
                        href={inv.checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                        style={{ backgroundColor: "var(--color-accent)" }}
                      >
                        Nu betalen
                      </Link>
                    )}
                    <Link
                      href={`/api/factuur/${inv.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      prefetch={false}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
                      style={{
                        backgroundColor: "var(--color-muted)",
                        color:           "var(--color-secondary)",
                      }}
                    >
                      <Download size={14} />
                      PDF downloaden
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

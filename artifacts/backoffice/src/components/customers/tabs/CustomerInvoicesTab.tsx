import Link from "next/link";
import type { InvoiceRow } from "@/app/actions/invoices";

const STATUS_LABELS: Record<string, string> = {
  draft:     "Concept",
  sent:      "Verzonden",
  paid:      "Betaald",
  cancelled: "Geannuleerd",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:     { bg: "#F8FAFC", text: "#64748B" },
  sent:      { bg: "#EFF6FF", text: "#2563EB" },
  paid:      { bg: "#ECFDF5", text: "#059669" },
  cancelled: { bg: "#FEF2F2", text: "#DC2626" },
};

function fmt(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

interface Props {
  customerId: string;
  invoices:   InvoiceRow[];
}

export function CustomerInvoicesTab({ customerId, invoices }: Props) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: "#64748B" }}>
          {invoices.length} factuur/facturen (laatste 25)
        </p>
        <Link
          href={`/invoices?customerId=${customerId}`}
          className="text-xs font-medium hover:underline"
          style={{ color: "#00B7B3" }}
        >
          Alle bekijken →
        </Link>
      </div>

      <div className="veele-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Nummer</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Totaal</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Vervaldatum</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Opdracht</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm" style={{ color: "#94A3B8" }}>
                    Nog geen facturen voor deze klant.
                  </td>
                </tr>
              ) : (
                invoices.map((inv, i) => {
                  const colors = STATUS_COLORS[inv.status] ?? STATUS_COLORS["draft"];
                  return (
                    <tr
                      key={inv.id}
                      className="transition-colors hover:bg-slate-50/60"
                      style={{ borderBottom: i < invoices.length - 1 ? "1px solid #F1F5F9" : undefined }}
                    >
                      <td className="px-5 py-3 text-sm font-mono font-medium" style={{ color: "#081D3A" }}>
                        <Link href={`/invoices/${inv.id}`} className="hover:underline" style={{ color: "#00B7B3" }}>
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#475569" }}>{fmt(inv.totalAmount)}</td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                        {new Date(inv.dueDate).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                        >
                          {STATUS_LABELS[inv.status] ?? inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                        <Link href={`/assignments/${inv.assignmentId}`} className="hover:underline font-mono" style={{ color: "#64748B" }}>
                          {inv.assignmentCode}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

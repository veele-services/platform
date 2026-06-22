import Link from "next/link";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";

export type CustomerPaymentRow = {
  id:              string;
  invoiceId:       string;
  invoiceNumber:   string;
  molliePaymentId: string;
  amountCents:     number;
  currency:        string;
  status:          string;
  paidAt:          string | null;
  createdAt:       string;
};

interface Props {
  customerId: string;
  payments:   CustomerPaymentRow[];
}

export function CustomerPaymentsTab({ customerId, payments }: Props) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: "#64748B" }}>
          {payments.length} betaling{payments.length !== 1 ? "en" : ""} (laatste 25)
        </p>
        <Link
          href={`/payments?customerId=${customerId}`}
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
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Mollie ID</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Bedrag</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Factuur</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Datum</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm" style={{ color: "#94A3B8" }}>
                    Nog geen betalingen voor deze klant.
                  </td>
                </tr>
              ) : (
                payments.map((p, i) => {
                  const amount = new Intl.NumberFormat("nl-NL", { style: "currency", currency: p.currency }).format(p.amountCents / 100);
                  return (
                    <tr
                      key={p.id}
                      className="transition-colors hover:bg-slate-50/60"
                      style={{ borderBottom: i < payments.length - 1 ? "1px solid #F1F5F9" : undefined }}
                    >
                      <td className="px-5 py-3 text-xs font-mono" style={{ color: "#64748B" }}>{p.molliePaymentId}</td>
                      <td className="px-5 py-3 text-sm font-medium" style={{ color: "#081D3A" }}>{amount}</td>
                      <td className="px-5 py-3">
                        <ProcessStatusBadge kind="payment" status={p.status} />
                      </td>
                      <td className="px-5 py-3 text-sm font-mono" style={{ color: "#64748B" }}>
                        <Link href={`/invoices/${p.invoiceId}`} className="hover:underline" style={{ color: "#00B7B3" }}>
                          {p.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                        {new Date(p.createdAt).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" })}
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

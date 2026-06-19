"use client";

import { useMemo, useState } from "react";
import { WalletCards } from "lucide-react";
import type { CustomerInvoice } from "@/actions/invoices";
import { PaymentActionButton } from "./PaymentActionButton";

function formatAmount(amount: number): string {
  return amount.toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

export function InvoiceBatchPaymentPanel({ invoices }: { invoices: CustomerInvoice[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => invoices.map((invoice) => invoice.id));

  const selectedTotal = useMemo(() => {
    return invoices
      .filter((invoice) => selectedIds.includes(invoice.id))
      .reduce((sum, invoice) => sum + Number.parseFloat(invoice.totalAmount || "0"), 0);
  }, [invoices, selectedIds]);

  if (invoices.length < 2) return null;

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <section className="rounded-[22px] bg-white p-4 shadow-sm md:p-5" style={{ boxShadow: "0 14px 32px rgba(8,29,58,0.06)" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: "#E8FBFA", color: "var(--color-accent)" }}>
            <WalletCards size={21} />
          </span>
          <div>
            <h2 className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
              Verzamelfactuur betalen
            </h2>
            <p className="mt-1 text-sm font-medium" style={{ color: "var(--color-secondary)" }}>
              Selecteer meerdere open facturen en betaal ze in één Mollie-checkout.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-muted-fg)" }}>
            Geselecteerd
          </p>
          <p className="text-2xl font-black" style={{ color: "var(--color-primary)" }}>
            {formatAmount(selectedTotal)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {invoices.map((invoice) => {
          const checked = selectedIds.includes(invoice.id);
          return (
            <label
              key={invoice.id}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3"
              style={{
                borderColor: checked ? "var(--color-accent)" : "var(--color-border)",
                backgroundColor: checked ? "#F0FDFB" : "#FFFFFF",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(invoice.id)}
                className="h-4 w-4 accent-[#00B7B3]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black" style={{ color: "var(--color-primary)" }}>
                  {invoice.invoiceNumber}
                </span>
                <span className="block text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>
                  {Number.parseFloat(invoice.totalAmount).toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 max-w-sm">
        <PaymentActionButton
          invoiceIds={selectedIds}
          label={selectedIds.length > 1 ? "Geselecteerde facturen betalen" : "Factuur betalen"}
        />
      </div>
    </section>
  );
}

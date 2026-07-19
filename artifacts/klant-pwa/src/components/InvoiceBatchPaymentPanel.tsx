"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckSquare2, WalletCards, X } from "lucide-react";
import type { CustomerInvoice } from "@/actions/invoices";
import { PaymentActionButton } from "./PaymentActionButton";

function formatAmount(amount: number): string {
  return amount.toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

export function InvoiceBatchPaymentPanel({
  invoices,
}: {
  invoices: CustomerInvoice[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    invoices.map((invoice) => invoice.id),
  );

  const selectedTotal = useMemo(() => {
    return invoices
      .filter((invoice) => selectedIds.includes(invoice.id))
      .reduce(
        (sum, invoice) =>
          sum + Number.parseFloat(invoice.outstandingAmount || "0"),
        0,
      );
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
    <section
      className="rounded-2xl border bg-white p-4 shadow-sm"
      style={{ borderColor: "rgba(0,183,179,0.22)" }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: "#E8FBFA", color: "var(--color-accent)" }}
          >
            <WalletCards size={20} />
          </span>
          <div className="min-w-0">
            <p
              className="text-[11px] font-black uppercase"
              style={{ color: "var(--color-accent)" }}
            >
              Batchbetaling
            </p>
            <h2
              className="mt-1 text-base font-black"
              style={{ color: "var(--color-primary)" }}
            >
              {invoices.length} open facturen samen betalen
            </h2>
            <p
              className="mt-1 text-sm font-semibold leading-6"
              style={{ color: "var(--color-secondary)" }}
            >
              Start een korte wizard en rond alles af in een Mollie-checkout.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-xl bg-slate-50 px-4 py-3 sm:text-right">
            <p
              className="text-xs font-black uppercase"
              style={{ color: "var(--color-muted-fg)" }}
            >
              Totaal beschikbaar
            </p>
            <p
              className="text-lg font-black"
              style={{ color: "var(--color-primary)" }}
            >
              {formatAmount(selectedTotal)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Verzamelbetaling starten
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Verzamelbetaling sluiten"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
            <div
              className="flex items-start justify-between gap-3 border-b px-5 py-4"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div>
                <p
                  className="text-[11px] font-black uppercase"
                  style={{ color: "var(--color-accent)" }}
                >
                  Verzamelfactuur wizard
                </p>
                <h3
                  className="mt-1 text-xl font-black"
                  style={{ color: "var(--color-primary)" }}
                >
                  Facturen samen betalen
                </h3>
                <p
                  className="mt-1 text-sm font-semibold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  Kies de facturen en open daarna de beveiligde Mollie-checkout.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-primary)",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <section>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-black"
                    style={{ color: "var(--color-primary)" }}
                  >
                    1
                  </span>
                  <h4
                    className="text-sm font-black"
                    style={{ color: "var(--color-primary)" }}
                  >
                    Selecteer facturen
                  </h4>
                </div>
                <div className="mt-3 grid gap-2">
                  {invoices.map((invoice) => {
                    const checked = selectedIds.includes(invoice.id);
                    return (
                      <label
                        key={invoice.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3"
                        style={{
                          borderColor: checked
                            ? "var(--color-accent)"
                            : "var(--color-border)",
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
                          <span
                            className="block truncate text-sm font-black"
                            style={{ color: "var(--color-primary)" }}
                          >
                            {invoice.invoiceNumber}
                          </span>
                          <span
                            className="block text-xs font-semibold"
                            style={{ color: "var(--color-secondary)" }}
                          >
                            {Number.parseFloat(
                              invoice.outstandingAmount,
                            ).toLocaleString("nl-NL", {
                              style: "currency",
                              currency: "EUR",
                            })}{" "}
                            openstaand
                          </span>
                        </span>
                        {checked ? (
                          <CheckSquare2
                            size={16}
                            style={{ color: "var(--color-accent)" }}
                          />
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="mt-6">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-black"
                    style={{ color: "var(--color-primary)" }}
                  >
                    2
                  </span>
                  <h4
                    className="text-sm font-black"
                    style={{ color: "var(--color-primary)" }}
                  >
                    Controleer totaal
                  </h4>
                </div>
                <div
                  className="mt-3 rounded-xl border p-4"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-muted)",
                  }}
                >
                  <p
                    className="text-xs font-black uppercase"
                    style={{ color: "var(--color-muted-fg)" }}
                  >
                    Geselecteerd
                  </p>
                  <p
                    className="mt-1 text-3xl font-black"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {formatAmount(selectedTotal)}
                  </p>
                  <p
                    className="mt-1 text-sm font-semibold"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {selectedIds.length} factuur
                    {selectedIds.length === 1 ? "" : "en"} in deze betaling.
                  </p>
                </div>
              </section>
            </div>

            <div
              className="border-t bg-white px-5 py-4"
              style={{ borderColor: "var(--color-border)" }}
            >
              <PaymentActionButton
                invoiceIds={selectedIds}
                label={
                  selectedIds.length > 1
                    ? "Geselecteerde facturen betalen"
                    : "Factuur betalen"
                }
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

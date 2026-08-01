"use client";

import {
  CheckboxAdapter,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@workspace/shared-ui";
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
    <Dialog open={open} onOpenChange={setOpen}>
      <section
        className="rounded-xl border bg-white p-4"
        style={{
          borderColor:
            "color-mix(in srgb, var(--color-accent) 22%, transparent)",
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{
                backgroundColor: "#E8FBFA",
                color: "var(--color-accent-accessible)",
              }}
            >
              <WalletCards size={20} />
            </span>
            <div className="min-w-0">
              <p
                className="text-[11px] font-medium uppercase"
                style={{ color: "var(--color-accent-accessible)" }}
              >
                Meerdere facturen
              </p>
              <h2
                className="mt-1 text-base font-semibold"
                style={{ color: "var(--color-primary)" }}
              >
                {invoices.length} open facturen samen betalen
              </h2>
              <p
                className="mt-1 text-sm font-semibold leading-6"
                style={{ color: "var(--color-secondary)" }}
              >
                Selecteer de facturen en betaal ze in één beveiligde betaling.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-xl bg-slate-50 px-4 py-3 sm:text-right">
              <p
                className="text-xs font-semibold uppercase"
                style={{ color: "var(--color-muted-fg)" }}
              >
                Totaal beschikbaar
              </p>
              <p
                className="text-lg font-semibold"
                style={{ color: "var(--color-primary)" }}
              >
                {formatAmount(selectedTotal)}
              </p>
            </div>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--color-accent-accessible)" }}
              >
                Samen betalen
                <ArrowRight size={15} />
              </button>
            </DialogTrigger>
          </div>
        </div>

        <DialogContent className="max-w-xl overflow-hidden p-0">
          <div
            className="flex items-start justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div>
              <p
                className="text-[11px] font-medium uppercase"
                style={{ color: "var(--color-accent-accessible)" }}
              >
                Meerdere facturen
              </p>
              <DialogTitle
                className="mt-1 text-xl font-semibold"
                style={{ color: "var(--color-primary)" }}
              >
                Facturen samen betalen
              </DialogTitle>
              <DialogDescription
                className="mt-1 text-sm"
                style={{ color: "var(--color-secondary)" }}
              >
                Kies de facturen en ga daarna verder naar de beveiligde
                betaling.
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-primary)",
                }}
                aria-label="Sluiten"
              >
                <X size={18} />
              </button>
            </DialogClose>
          </div>

          <div className="max-h-[60dvh] overflow-y-auto px-5 py-4">
            <section>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  1
                </span>
                <h4
                  className="text-sm font-semibold"
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
                      <CheckboxAdapter
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(invoice.id)}
                        className="h-4 w-4 accent-[var(--color-accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-sm font-semibold"
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
                          style={{ color: "var(--color-accent-accessible)" }}
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
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  2
                </span>
                <h4
                  className="text-sm font-semibold"
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
                  className="text-xs font-medium uppercase"
                  style={{ color: "var(--color-muted-fg)" }}
                >
                  Geselecteerd
                </p>
                <p
                  className="mt-1 text-2xl font-semibold"
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
        </DialogContent>
      </section>
    </Dialog>
  );
}

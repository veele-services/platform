"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CreditCard, Loader2 } from "lucide-react";
import {
  createCustomerBatchPayment,
  createCustomerInvoicePayment,
} from "@/actions/payments";

export function PaymentActionButton({
  invoiceId,
  invoiceIds,
  label = "Betalen met Mollie",
  variant = "primary",
}: {
  invoiceId?: string;
  invoiceIds?: string[];
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = invoiceIds && invoiceIds.length > 0
        ? await createCustomerBatchPayment(invoiceIds)
        : invoiceId
          ? await createCustomerInvoicePayment(invoiceId)
          : { success: false as const, message: "Geen factuur geselecteerd." };

      if (!result.success) {
        setError(result.message);
        return;
      }

      window.location.href = result.data.checkoutUrl;
    });
  }

  return (
    <div className="w-full">
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition active:scale-[0.99] disabled:opacity-60"
        style={{
          backgroundColor: variant === "primary" ? "var(--color-accent)" : "#E8FBFA",
          color:           variant === "primary" ? "#FFFFFF" : "#087C79",
        }}
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
        {pending ? "Betaallink openen..." : label}
      </button>
      {error ? (
        <p
          role="alert"
          className="mt-2 inline-flex w-full items-start gap-2 rounded-2xl px-3 py-2 text-xs font-bold"
          style={{ backgroundColor: "#FEF2F2", color: "var(--color-destructive)" }}
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, CheckCircle2, XCircle } from "lucide-react";
import { markInvoiceSent, markInvoicePaid, cancelInvoice } from "@/app/actions/invoices";
import type { InvoiceStatus } from "@/app/actions/invoices";

interface Props {
  invoiceId: string;
  status:    InvoiceStatus;
}

export function InvoiceActions({ invoiceId, status }: Props) {
  const router     = useRouter();
  const [, startT] = useTransition();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function handleAction(action: "sent" | "paid" | "cancel") {
    setError(null);
    setLoading(action);

    const result =
      action === "sent"   ? await markInvoiceSent(invoiceId)  :
      action === "paid"   ? await markInvoicePaid(invoiceId)  :
                             await cancelInvoice(invoiceId);

    setLoading(null);

    if (!result.success) {
      setError(result.message);
      return;
    }

    startT(() => router.refresh());
  }

  if (status === "paid" || status === "cancelled") return null;

  return (
    <div className="veele-card flex flex-col gap-3">
      <h3
        className="font-heading text-sm font-semibold"
        style={{ color: "#081D3A" }}
      >
        Acties
      </h3>

      {error && (
        <p
          className="text-xs rounded-lg px-3 py-2"
          style={{ background: "#FEE2E2", color: "#991B1B" }}
        >
          {error}
        </p>
      )}

      {status === "draft" && (
        <button
          disabled={loading !== null}
          onClick={() => handleAction("sent")}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
          style={{ backgroundColor: "#00B7B3", color: "#FFFFFF" }}
        >
          {loading === "sent" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Markeer als verzonden
        </button>
      )}

      {status === "sent" && (
        <button
          disabled={loading !== null}
          onClick={() => handleAction("paid")}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
          style={{ backgroundColor: "#10B981", color: "#FFFFFF" }}
        >
          {loading === "paid" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Markeer als betaald
        </button>
      )}

      {(status === "draft" || status === "sent") && (
        <button
          disabled={loading !== null}
          onClick={() => handleAction("cancel")}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-60"
          style={{ borderColor: "#E2E8F0", color: "#64748B", backgroundColor: "transparent" }}
        >
          {loading === "cancel" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          Annuleren
        </button>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText, Receipt, Link as LinkIcon } from "lucide-react";
import { createInvoice } from "@/app/actions/invoices";
import type { AssignmentInvoiceData } from "@/app/actions/invoices";

interface Props {
  assignmentId: string;
  prefill:      AssignmentInvoiceData;
}

function formatEur(value: string): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parseFloat(value) || 0);
}

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function CreateInvoiceForm({ assignmentId, prefill }: Props) {
  const router     = useRouter();
  const [, startT] = useTransition();

  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [fieldErrors, setFieldErrors]       = useState<Record<string, string>>({});
  const [amount, setAmount]                 = useState(prefill.suggestedAmount);
  const [vatPercentage, setVat]             = useState("21");
  const [dueDate, setDueDate]               = useState(defaultDueDate());
  const [notes, setNotes]                   = useState("");
  const [goToPayment, setGoToPayment] = useState(true);

  const vatAmount   = (parseFloat(amount || "0") * parseFloat(vatPercentage || "0") / 100);
  const totalAmount = parseFloat(amount || "0") + vatAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);

    const result = await createInvoice(assignmentId, { amount, vatPercentage, dueDate, notes });

    if (!result.success) {
      setLoading(false);
      setError(result.message);
      if ("fieldErrors" in result && result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
      return;
    }

    const invoiceId = result.success && "data" in result
      ? (result as { success: true; data: { id: string } }).data?.id
      : null;

    setLoading(false);
    startT(() => {
      router.refresh();
      if (invoiceId) router.push(`/invoices/${invoiceId}`);
    });
  }

  return (
    <div className="veele-card">
      <h3
        className="font-heading text-sm font-semibold mb-4 flex items-center gap-2"
        style={{ color: "#081D3A" }}
      >
        <Receipt className="h-4 w-4" style={{ color: "#00B7B3" }} />
        Factuur aanmaken
      </h3>

      {/* Line items preview */}
      {prefill.lineItems.length > 0 && (
        <div className="mb-4 rounded-lg p-3" style={{ background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#94A3B8" }}>
            Voorstelregels opdracht
          </p>
          <ul className="divide-y" style={{ borderColor: "#F1F5F9" }}>
            {prefill.lineItems.map((item, i) => (
              <li key={i} className="flex items-center justify-between py-1.5">
                <span className="text-xs" style={{ color: "#374151" }}>
                  {item.taskCodeCode && (
                    <span
                      className="font-mono mr-1.5 px-1 py-0.5 rounded text-xs"
                      style={{ background: "#EEF2FF", color: "#4338CA" }}
                    >
                      {item.taskCodeCode}
                    </span>
                  )}
                  {item.taskCodeName ?? "—"}
                  {!item.invoiceable && (
                    <span className="ml-1 text-xs" style={{ color: "#94A3B8" }}>(niet factureerbaar)</span>
                  )}
                </span>
                <span className="text-xs font-medium" style={{ color: item.invoiceable ? "#081D3A" : "#94A3B8" }}>
                  {item.price ? formatEur(item.price) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="text-xs rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B" }}>
            {error}
          </p>
        )}

        {/* Bedrag excl. BTW */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "#374151" }}>
            Bedrag excl. BTW (€) <span style={{ color: "#DC2626" }}>*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 transition"
            style={{ borderColor: fieldErrors.amount ? "#DC2626" : "#E2E8F0", color: "#081D3A" }}
          />
          {fieldErrors.amount && (
            <p className="text-xs" style={{ color: "#DC2626" }}>{fieldErrors.amount}</p>
          )}
        </div>

        {/* BTW */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "#374151" }}>
            BTW-percentage (%)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={vatPercentage}
            onChange={(e) => setVat(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 transition"
            style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
          />
        </div>

        {/* Totaaloverzicht */}
        <div className="rounded-lg p-3" style={{ background: "#F0FDFA", border: "1px solid #99F6E4" }}>
          <div className="flex justify-between text-xs mb-1" style={{ color: "#374151" }}>
            <span>Subtotaal</span>
            <span>{formatEur(amount || "0")}</span>
          </div>
          <div className="flex justify-between text-xs mb-2" style={{ color: "#374151" }}>
            <span>BTW ({vatPercentage}%)</span>
            <span>{formatEur(vatAmount.toFixed(2))}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold pt-2" style={{ borderTop: "1px solid #99F6E4", color: "#065F46" }}>
            <span>Totaal incl. BTW</span>
            <span>{formatEur(totalAmount.toFixed(2))}</span>
          </div>
        </div>

        {/* Vervaldatum */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "#374151" }}>
            Vervaldatum <span style={{ color: "#DC2626" }}>*</span>
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 transition"
            style={{ borderColor: fieldErrors.dueDate ? "#DC2626" : "#E2E8F0", color: "#081D3A" }}
          />
          {fieldErrors.dueDate && (
            <p className="text-xs" style={{ color: "#DC2626" }}>{fieldErrors.dueDate}</p>
          )}
        </div>

        {/* Notities */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "#374151" }}>
            Notities <span className="font-normal" style={{ color: "#94A3B8" }}>(optioneel)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Aanvullende informatie voor de factuur…"
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none focus:ring-2 transition"
            style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
          />
        </div>

        {/* Optie: meteen betaallink aanmaken */}
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={goToPayment}
            onChange={(e) => setGoToPayment(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded accent-teal-500"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-xs font-medium" style={{ color: "#374151" }}>
              <LinkIcon className="inline h-3.5 w-3.5 mr-1" style={{ color: "#00B7B3" }} />
              Direct doorsturen naar factuurpagina
            </span>
            <span className="text-xs" style={{ color: "#94A3B8" }}>
              Na aanmaken wordt u doorgestuurd naar de factuurpagina om een betaallink aan te maken en te versturen.
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
          style={{ backgroundColor: "#00B7B3", color: "#FFFFFF" }}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          Factuur aanmaken
        </button>
      </form>
    </div>
  );
}

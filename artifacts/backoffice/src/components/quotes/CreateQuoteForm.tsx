"use client";

import { useState, useTransition } from "react";
import { FileCheck2, Loader2, AlertCircle } from "lucide-react";
import { createQuote } from "@/app/actions/quotes";
import type { AssignmentQuoteData } from "@/app/actions/quotes";

interface CreateQuoteFormProps {
  assignmentId: string;
  prefill: AssignmentQuoteData;
}

const fmt = (v: string | number | null) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
    parseFloat(String(v ?? 0)) || 0,
  );

export function CreateQuoteForm({ assignmentId, prefill }: CreateQuoteFormProps) {
  const [amount, setAmount]   = useState(prefill.suggestedAmount.toFixed(2));
  const [validity, setValidity] = useState(prefill.defaultValidityDate);
  const [notes, setNotes]     = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      setError("Voer een geldig bedrag in.");
      return;
    }
    if (!validity) {
      setError("Geldig tot datum is verplicht.");
      return;
    }

    startTransition(async () => {
      const result = await createQuote(assignmentId, {
        amount: numAmount,
        validityDate: validity,
        notes,
      });
      if (!result.success) {
        setError(result.message);
      }
    });
  }

  return (
    <div className="veele-card">
      <h2
        className="font-heading text-base font-semibold mb-4 flex items-center gap-2"
        style={{ color: "#081D3A" }}
      >
        <FileCheck2 className="h-4 w-4" style={{ color: "#00B7B3" }} />
        Offerte opstellen
      </h2>

      {/* Task code overview */}
      {prefill.lineItems.length > 0 && (
        <div className="mb-4 rounded-lg overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "#F8FAFC" }}>
              <tr>
                <th className="text-left px-3 py-2 font-medium" style={{ color: "#64748B", fontSize: "11px" }}>Code</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: "#64748B", fontSize: "11px" }}>Taak</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: "#64748B", fontSize: "11px" }}>Prijs</th>
              </tr>
            </thead>
            <tbody style={{ borderTop: "1px solid #E2E8F0" }}>
              {prefill.lineItems.map((li, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td className="px-3 py-2">
                    {li.taskCodeCode ? (
                      <span className="font-mono text-xs rounded px-1.5 py-0.5" style={{ background: "#F1F5F9", color: "#64748B" }}>
                        {li.taskCodeCode}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2" style={{ color: "#374151" }}>{li.taskCodeName ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: li.invoiceable ? "#081D3A" : "#94A3B8" }}>
                    {li.invoiceable ? fmt(li.price) : <span className="text-xs" style={{ color: "#94A3B8" }}>Niet factureerbaar</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot style={{ borderTop: "1px solid #E2E8F0", backgroundColor: "#F8FAFC" }}>
              <tr>
                <td colSpan={2} className="px-3 py-2 font-medium text-sm" style={{ color: "#64748B" }}>Subtotaal taakcodes</td>
                <td className="px-3 py-2 text-right font-semibold text-sm" style={{ color: "#081D3A" }}>
                  {fmt(prefill.suggestedAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "#374151" }}>
              Offertebedrag (excl. btw) *
            </label>
            <div className="relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium"
                style={{ color: "#64748B" }}
              >
                €
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-7 pr-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2"
                style={{
                  borderColor: "#E2E8F0",
                  color: "#081D3A",
                }}
                disabled={pending}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "#374151" }}>
              Geldig tot *
            </label>
            <input
              type="date"
              value={validity}
              onChange={(e) => setValidity(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2"
              style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
              disabled={pending}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "#374151" }}>
            Interne notities (optioneel)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Toelichting voor intern gebruik..."
            className="w-full px-3 py-2 rounded-lg text-sm border resize-none focus:outline-none focus:ring-2"
            style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
            disabled={pending}
          />
        </div>

        {error && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm"
            style={{ backgroundColor: "#FEF2F2", color: "#B91C1C" }}
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#00B7B3" }}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
          Offerte aanmaken
        </button>
      </form>
    </div>
  );
}

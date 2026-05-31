"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { QuoteLineItem } from "@/actions/quotes";

function fmtEur(val: string | null): string {
  if (!val) return "—";
  return parseFloat(val).toLocaleString("nl-NL", {
    style:    "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

interface Props {
  lineItems: QuoteLineItem[];
  amount:    string;
}

export function OfferteRegelitems({ lineItems, amount }: Props) {
  const [open, setOpen] = useState(false);

  if (lineItems.length === 0) return null;

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-medium"
        style={{ color: "var(--color-secondary)" }}
      >
        <span>
          {lineItems.length} regelitem{lineItems.length !== 1 ? "s" : ""} bekijken
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="mt-3">
          <div className="space-y-2">
            {lineItems.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div className="min-w-0 flex items-start gap-2">
                  {item.code && (
                    <span
                      className="shrink-0 font-mono text-xs rounded px-1.5 py-0.5 mt-0.5"
                      style={{
                        backgroundColor: "var(--color-muted)",
                        color:           "var(--color-secondary)",
                      }}
                    >
                      {item.code}
                    </span>
                  )}
                  <span className="break-words" style={{ color: "var(--color-primary)" }}>
                    {item.name ?? "—"}
                  </span>
                </div>
                <span
                  className="shrink-0 font-medium tabular-nums"
                  style={{ color: "var(--color-primary)" }}
                >
                  {fmtEur(item.price)}
                </span>
              </div>
            ))}
          </div>

          <div
            className="mt-3 pt-3 border-t flex justify-between text-sm font-semibold"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          >
            <span>Offertebedrag</span>
            <span className="tabular-nums">{fmtEur(amount)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

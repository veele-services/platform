"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { QuoteLineItem } from "@/actions/quotes";

const VAT_RATE = 0.21;

function fmtEur(val: number): string {
  return val.toLocaleString("nl-NL", {
    style:    "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

interface Props {
  lineItems: QuoteLineItem[];
  /** Offertebedrag excl. btw (from quotes.amount) */
  amount: string;
}

export function OfferteRegelitems({ lineItems, amount }: Props) {
  const [open, setOpen] = useState(false);

  if (lineItems.length === 0) return null;

  const subtotaal = parseFloat(amount) || 0;
  const btw       = subtotaal * VAT_RATE;
  const totaal    = subtotaal + btw;

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
          {/* Table header */}
          <div
            className="grid gap-x-2 pb-1 mb-2 text-xs font-semibold uppercase tracking-wide border-b"
            style={{
              gridTemplateColumns: "minmax(0,2fr) 3rem 5rem 5rem",
              color:               "var(--color-secondary)",
              borderColor:         "var(--color-border)",
            }}
          >
            <span>Omschrijving</span>
            <span className="text-right">Aantal</span>
            <span className="text-right">Prijs/st.</span>
            <span className="text-right">Totaal</span>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            {lineItems.map((item, idx) => {
              const qty        = 1;
              const unitPrice  = parseFloat(item.price ?? "0");
              const lineTotal  = qty * unitPrice;

              return (
                <div
                  key={idx}
                  className="grid gap-x-2 text-sm items-start"
                  style={{ gridTemplateColumns: "minmax(0,2fr) 3rem 5rem 5rem" }}
                >
                  <div className="min-w-0">
                    {item.code && (
                      <span
                        className="font-mono text-xs rounded px-1 py-0.5 mr-1"
                        style={{
                          backgroundColor: "var(--color-muted)",
                          color:           "var(--color-secondary)",
                        }}
                      >
                        {item.code}
                      </span>
                    )}
                    <span style={{ color: "var(--color-primary)" }}>
                      {item.name ?? "—"}
                    </span>
                  </div>
                  <span
                    className="text-right tabular-nums"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {qty}
                  </span>
                  <span
                    className="text-right tabular-nums"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {item.price ? fmtEur(unitPrice) : "—"}
                  </span>
                  <span
                    className="text-right tabular-nums font-medium"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {item.price ? fmtEur(lineTotal) : "—"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer totals */}
          <div
            className="mt-3 pt-3 border-t space-y-1 text-sm"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex justify-between" style={{ color: "var(--color-secondary)" }}>
              <span>Subtotaal (excl. btw)</span>
              <span className="tabular-nums">{fmtEur(subtotaal)}</span>
            </div>
            <div className="flex justify-between" style={{ color: "var(--color-secondary)" }}>
              <span>Btw (21%)</span>
              <span className="tabular-nums">{fmtEur(btw)}</span>
            </div>
            <div
              className="flex justify-between font-semibold pt-1 border-t"
              style={{ color: "var(--color-primary)", borderColor: "var(--color-border)" }}
            >
              <span>Totaal</span>
              <span className="tabular-nums">{fmtEur(totaal)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

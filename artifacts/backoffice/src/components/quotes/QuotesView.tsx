"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { Search, FileCheck2, AlertTriangle } from "lucide-react";
import { listQuotes } from "@/app/actions/quotes";
import type { QuoteRow, QuoteSummary, QuoteStatus } from "@/app/actions/quotes";

const fmt = (v: string | number | null) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
    parseFloat(String(v ?? 0)) || 0,
  );

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("nl-NL", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function StatusBadge({ status, isExpired }: { status: QuoteStatus; isExpired: boolean }) {
  if (isExpired) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
      >
        <AlertTriangle className="h-3 w-3" />
        Verlopen
      </span>
    );
  }
  const map: Record<QuoteStatus, { bg: string; color: string; label: string }> = {
    draft:    { bg: "#F1F5F9", color: "#475569", label: "Concept" },
    sent:     { bg: "#EFF6FF", color: "#1D4ED8", label: "Ter goedkeuring" },
    approved: { bg: "#D1FAE5", color: "#065F46", label: "Goedgekeurd" },
    rejected: { bg: "#FEE2E2", color: "#991B1B", label: "Afgewezen" },
    expired:  { bg: "#FEF3C7", color: "#92400E", label: "Verlopen" },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

interface QuotesViewProps {
  initialRows:    QuoteRow[];
  initialTotal:   number;
  summary:        QuoteSummary;
}

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: "",         label: "Alle statussen" },
  { value: "draft",    label: "Concept" },
  { value: "sent",     label: "Ter goedkeuring" },
  { value: "approved", label: "Goedgekeurd" },
  { value: "rejected", label: "Afgewezen" },
  { value: "expired",  label: "Verlopen" },
];

export function QuotesView({ initialRows, initialTotal, summary }: QuotesViewProps) {
  const [rows,   setRows]   = useState<QuoteRow[]>(initialRows);
  const [total,  setTotal]  = useState(initialTotal);
  const [page,   setPage]   = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();

  const load = useCallback(
    (p: number, s: string, st: string) => {
      startTransition(async () => {
        const result = await listQuotes({ page: p, search: s, status: st });
        setRows(result.rows);
        setTotal(result.total);
        setPage(p);
      });
    },
    [],
  );

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load(1, search, status);
  }

  function handleStatusChange(v: string) {
    setStatus(v);
    load(1, search, v);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const summaryCards = [
    { label: "Concept",          count: summary.draftCount,    color: "#64748B", bg: "#F8FAFC" },
    { label: "Ter goedkeuring",  count: summary.sentCount,     color: "#1D4ED8", bg: "#EFF6FF" },
    { label: "Goedgekeurd",      count: summary.approvedCount, color: "#065F46", bg: "#D1FAE5" },
    { label: "Verlopen",         count: summary.expiredCount,  color: "#92400E", bg: "#FEF3C7" },
  ];

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold mb-1" style={{ color: "#081D3A" }}>
          Offertes
        </h1>
        <p className="text-sm" style={{ color: "#64748B" }}>
          Beheer offerteaanvragen en goedkeuringen
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-4">
        {summaryCards.map((c) => (
          <div key={c.label} className="veele-card" style={{ backgroundColor: c.bg }}>
            <p className="text-xs font-medium mb-1" style={{ color: c.color }}>{c.label}</p>
            <p className="text-2xl font-bold" style={{ color: "#081D3A" }}>{c.count}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="veele-card mb-6">
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#94A3B8" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op offertenummer, klant of opdracht..."
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2"
              style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
            />
          </div>

          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border focus:outline-none"
            style={{ borderColor: "#E2E8F0", color: "#081D3A", minWidth: "170px" }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: "#00B7B3" }}
          >
            Zoeken
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="veele-card p-0 overflow-hidden">
        {pending ? (
          <div className="flex items-center justify-center py-16" style={{ color: "#94A3B8" }}>
            Laden...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <FileCheck2 className="h-8 w-8" style={{ color: "#CBD5E1" }} />
            <p className="text-sm" style={{ color: "#94A3B8" }}>Geen offertes gevonden.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead style={{ borderBottom: "1px solid #F1F5F9", backgroundColor: "#F8FAFC" }}>
              <tr>
                {["Offertenummer", "Klant", "Opdracht", "Bedrag", "Status", "Geldig tot"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 font-medium"
                    style={{ color: "#64748B", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="transition-colors hover:bg-slate-50"
                  style={{ borderBottom: "1px solid #F8FAFC" }}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/quotes/${r.id}`}
                      className="font-mono text-xs rounded px-1.5 py-0.5 hover:underline"
                      style={{ background: "#F1F5F9", color: "#00B7B3" }}
                    >
                      {r.quoteNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: "#374151" }}>{r.customerName}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/assignments/${r.assignmentId}`}
                      className="font-mono text-xs rounded px-1.5 py-0.5 hover:underline"
                      style={{ background: "#F1F5F9", color: "#64748B" }}
                    >
                      {r.assignmentCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: "#081D3A" }}>
                    {fmt(r.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} isExpired={r.isExpired} />
                  </td>
                  <td className="px-4 py-3" style={{ color: r.isExpired ? "#DC2626" : "#374151" }}>
                    {r.isExpired && <AlertTriangle className="inline h-3.5 w-3.5 mr-1 mb-0.5" />}
                    {fmtDate(r.validityDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm" style={{ color: "#64748B" }}>
            {total} offerte{total !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(page - 1, search, status)}
              disabled={page <= 1 || pending}
              className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 transition-colors hover:bg-slate-100"
              style={{ color: "#374151" }}
            >
              Vorige
            </button>
            <span className="text-sm" style={{ color: "#64748B" }}>
              Pagina {page} van {totalPages}
            </span>
            <button
              onClick={() => load(page + 1, search, status)}
              disabled={page >= totalPages || pending}
              className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 transition-colors hover:bg-slate-100"
              style={{ color: "#374151" }}
            >
              Volgende
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

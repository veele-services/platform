"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Search, FileText, ChevronLeft, ChevronRight, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import type { InvoiceRow, InvoiceSummary } from "@/app/actions/invoices";

const STATUS_LABELS: Record<string, string> = {
  draft:     "Concept",
  sent:      "Verzonden",
  paid:      "Betaald",
  cancelled: "Geannuleerd",
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft:     { bg: "#F1F5F9", text: "#475569" },
  sent:      { bg: "#FEF3C7", text: "#92400E" },
  paid:      { bg: "#D1FAE5", text: "#065F46" },
  cancelled: { bg: "#FEE2E2", text: "#991B1B" },
};

const STATUS_OPTIONS = [
  { value: "",          label: "Alle statussen" },
  { value: "draft",     label: "Concept" },
  { value: "sent",      label: "Verzonden" },
  { value: "paid",      label: "Betaald" },
  { value: "cancelled", label: "Geannuleerd" },
];

const PAGE_SIZE = 25;

function formatEur(value: string): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parseFloat(value) || 0);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

interface Props {
  rows:        InvoiceRow[];
  total:       number;
  page:        number;
  search:      string;
  statusFilter: string;
  canWrite:    boolean;
  summary:     InvoiceSummary;
}

export function InvoicesView({ rows, total, page, search, statusFilter, summary }: Props) {
  const router   = useRouter();
  const pathname = usePathname();

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function push(params: Record<string, string>) {
    const sp = new URLSearchParams({ search, status: statusFilter, page: String(page), ...params });
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="p-8 max-w-7xl">

      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Facturen
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Beheer facturen en betalingsstatus
        </p>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          icon={<FileText className="h-5 w-5" />}
          label="Concept"
          value={formatEur(summary.draftAmount)}
          sub={`${summary.draftCount} factuur${summary.draftCount !== 1 ? "en" : ""}`}
          color="#64748B"
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5" />}
          label="Verzonden"
          value={formatEur(summary.sentAmount)}
          sub={`${summary.sentCount} factuur${summary.sentCount !== 1 ? "en" : ""}`}
          color="#F59E0B"
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Betaald (totaal)"
          value={formatEur(summary.paidTotal)}
          sub={`incl. vorige maanden`}
          color="#10B981"
        />
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Betaald deze maand"
          value={formatEur(summary.paidThisMonth)}
          color="#00B7B3"
        />
      </div>

      {/* ── Filters ── */}
      <div className="veele-card mb-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
              style={{ color: "#94A3B8" }}
            />
            <input
              type="search"
              placeholder="Zoek op factuurnummer, klant of opdrachtcode…"
              value={search}
              onChange={(e) => push({ search: e.target.value, page: "1" })}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 transition"
              style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => push({ status: e.target.value, page: "1" })}
            className="px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 transition"
            style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="veele-card overflow-hidden p-0">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="h-10 w-10" style={{ color: "#CBD5E1" }} strokeWidth={1.5} />
            <p className="text-sm font-medium" style={{ color: "#94A3B8" }}>
              Geen facturen gevonden
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                  {["Factuurnummer", "Klant", "Opdracht", "Bedrag (incl. BTW)", "Status", "Vervaldatum"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "#94A3B8" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const style = STATUS_STYLES[row.status] ?? STATUS_STYLES.draft;
                  const isOverdue = row.status === "sent" && new Date(row.dueDate) < new Date();
                  return (
                    <tr
                      key={row.id}
                      className="transition-colors cursor-pointer hover:bg-slate-50"
                      style={{ borderBottom: "1px solid #F8FAFC" }}
                      onClick={() => router.push(`/invoices/${row.id}`)}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/invoices/${row.id}`}
                          className="font-mono text-xs font-semibold hover:underline"
                          style={{ color: "#00B7B3" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3" style={{ color: "#081D3A" }}>
                        {row.customerName}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-xs rounded px-1.5 py-0.5"
                          style={{ background: "#F1F5F9", color: "#475569" }}
                        >
                          {row.assignmentCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: "#081D3A" }}>
                        {formatEur(row.totalAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: style.bg, color: style.text }}
                        >
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: isOverdue ? "#DC2626" : "#374151" }}>
                        <span className={isOverdue ? "font-semibold" : ""}>
                          {formatDate(row.dueDate)}
                        </span>
                        {isOverdue && (
                          <span className="ml-1 text-xs" style={{ color: "#DC2626" }}>
                            (te laat)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs" style={{ color: "#94A3B8" }}>
            {total} factuur{total !== 1 ? "en" : ""} · pagina {page} van {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => push({ page: String(page - 1) })}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border transition disabled:opacity-40"
              style={{ borderColor: "#E2E8F0", color: "#374151" }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Vorige
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => push({ page: String(page + 1) })}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border transition disabled:opacity-40"
              style={{ borderColor: "#E2E8F0", color: "#374151" }}
            >
              Volgende
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="veele-card flex items-center gap-4">
      <div
        className="flex items-center justify-center rounded-xl flex-shrink-0"
        style={{ width: "44px", height: "44px", backgroundColor: color + "1A", color }}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: "#94A3B8" }}>
          {label}
        </p>
        <p className="font-heading text-xl font-bold" style={{ color: "#081D3A" }}>
          {value}
        </p>
        {sub && (
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>{sub}</p>
        )}
      </div>
    </div>
  );
}

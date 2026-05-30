"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import Link from "next/link";
import { FileText, Search, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { ReportRow, ReportStatus } from "@/app/actions/reports";

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<ReportStatus, string> = {
  submitted: "Ingediend",
  approved:  "Goedgekeurd",
  rejected:  "Afgewezen",
};

const STATUS_COLORS: Record<ReportStatus, { bg: string; text: string; icon: React.ReactNode }> = {
  submitted: {
    bg:   "#FEF3C7",
    text: "#92400E",
    icon: <Clock className="h-3 w-3" />,
  },
  approved: {
    bg:   "#D1FAE5",
    text: "#065F46",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  rejected: {
    bg:   "#FEE2E2",
    text: "#991B1B",
    icon: <XCircle className="h-3 w-3" />,
  },
};

function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const s = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.icon}
      {STATUS_LABELS[status]}
    </span>
  );
}

interface Props {
  rows:         ReportRow[];
  total:        number;
  page:         number;
  search:       string;
  statusFilter: string;
  canWrite:     boolean;
}

const STATUS_OPTIONS = [
  { value: "",          label: "Alle statussen" },
  { value: "submitted", label: "Ingediend" },
  { value: "approved",  label: "Goedgekeurd" },
  { value: "rejected",  label: "Afgewezen" },
];

export function ReportsView({ rows, total, page, search, statusFilter, canWrite }: Props) {
  const router     = useRouter();
  const pathname   = usePathname();
  const sp         = useSearchParams();
  const [, startT] = useTransition();

  const push = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      params.delete("page");
      startT(() => router.push(`${pathname}?${params.toString()}`));
    },
    [sp, pathname, router],
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("nl-NL", {
      day: "numeric", month: "short", year: "numeric",
    });
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Rapporten
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Ingediende veldrapportages van voltooide opdrachten
        </p>
      </div>

      {/* ── Filters ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
            style={{ color: "#94A3B8" }}
          />
          <input
            type="search"
            defaultValue={search}
            placeholder="Zoek op opdracht of klant…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 transition"
            style={{
              borderColor: "#E2E8F0",
              color: "#081D3A",
              backgroundColor: "#FFFFFF",
            }}
            onChange={(e) => push({ search: e.target.value })}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => push({ status: e.target.value })}
          className="px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 transition"
          style={{ borderColor: "#E2E8F0", color: "#081D3A", backgroundColor: "#FFFFFF" }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <span className="text-sm ml-auto" style={{ color: "#94A3B8" }}>
          {total} {total === 1 ? "rapport" : "rapporten"}
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────── */}
      <div className="veele-card p-0 overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <FileText className="h-10 w-10" style={{ color: "#CBD5E1" }} strokeWidth={1.5} />
            <p className="text-sm" style={{ color: "#94A3B8" }}>
              Geen rapporten gevonden.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #F1F5F9", backgroundColor: "#F8FAFC" }}>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>
                  Opdracht
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>
                  Klant
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>
                  Status
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>
                  Uren
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>
                  Ingediend op
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: i < rows.length - 1 ? "1px solid #F1F5F9" : undefined }}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/reports/${r.id}`}
                      className="font-medium hover:underline flex items-center gap-1.5"
                      style={{ color: "#081D3A" }}
                    >
                      <span
                        className="font-mono text-xs rounded px-1.5 py-0.5"
                        style={{ backgroundColor: "#F1F5F9", color: "#64748B" }}
                      >
                        {r.assignmentCode}
                      </span>
                      <span className="truncate max-w-[200px]">{r.assignmentTitle}</span>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5" style={{ color: "#374151" }}>
                    {r.customerName}
                  </td>
                  <td className="px-5 py-3.5">
                    <ReportStatusBadge status={r.status} />
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs" style={{ color: "#374151" }}>
                    {r.hoursWorked ? `${r.hoursWorked}u` : "—"}
                  </td>
                  <td className="px-5 py-3.5" style={{ color: "#64748B" }}>
                    {formatDate(r.submittedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm" style={{ color: "#94A3B8" }}>
            Pagina {page} van {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <button
                onClick={() => {
                  const params = new URLSearchParams(sp.toString());
                  params.set("page", String(page - 1));
                  router.push(`${pathname}?${params.toString()}`);
                }}
                className="px-3 py-1.5 rounded-lg border text-sm transition-colors hover:bg-slate-50"
                style={{ borderColor: "#E2E8F0", color: "#374151" }}
              >
                Vorige
              </button>
            )}
            {page < totalPages && (
              <button
                onClick={() => {
                  const params = new URLSearchParams(sp.toString());
                  params.set("page", String(page + 1));
                  router.push(`${pathname}?${params.toString()}`);
                }}
                className="px-3 py-1.5 rounded-lg border text-sm transition-colors hover:bg-slate-50"
                style={{ borderColor: "#E2E8F0", color: "#374151" }}
              >
                Volgende
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

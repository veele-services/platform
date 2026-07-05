"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, FileCheck2, Search, TrendingUp } from "lucide-react";

import { listQuotes } from "@/app/actions/quotes";
import type { QuoteRow, QuoteSummary } from "@/app/actions/quotes";
import { Button } from "@/components/ui/button";
import {
  TenantActionMenu,
  TenantActiveFilters,
  TenantCommandBar,
  TenantConflictStrip,
  TenantPageHeader,
  TenantPageShell,
  TenantToolbarSearch,
  TenantWorkbenchPanel,
} from "@/components/tenant-ui";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";
import { processStatusLabel } from "@/lib/process-status";

const fmt = (v: string | number | null) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
    Number.parseFloat(String(v ?? 0)) || 0,
  );

function fmtDate(d: string) {
  if (!d) return "-";
  return new Date(`${d}T00:00:00`).toLocaleDateString("nl-NL", {
    day: "numeric", month: "short", year: "numeric",
  });
}

interface QuotesViewProps {
  initialRows: QuoteRow[];
  initialTotal: number;
  summary: QuoteSummary;
}

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: "", label: "Alle statussen" },
  { value: "draft", label: processStatusLabel("quote", "draft") },
  { value: "sent", label: processStatusLabel("quote", "sent") },
  { value: "approved", label: processStatusLabel("quote", "approved") },
  { value: "rejected", label: processStatusLabel("quote", "rejected") },
  { value: "expired", label: processStatusLabel("quote", "expired") },
];

function statusLabel(value: string) {
  return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function QuotesView({ initialRows, initialTotal, summary }: QuotesViewProps) {
  const [rows, setRows] = useState<QuoteRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();

  const load = useCallback(
    (p: number, s: string, st: string) => {
      startTransition(async () => {
        const result = await listQuotes({ page: p, search: s, status: st });
        setRows(result.rows);
        setTotal(result.total);
        setPage(p);
        setSubmittedSearch(s);
      });
    },
    [],
  );

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    load(1, search.trim(), status);
  }

  function handleStatusChange(value: string) {
    setStatus(value);
    load(1, search.trim(), value);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilterCount = [submittedSearch, status].filter(Boolean).length;

  return (
    <TenantPageShell size="wide">
      <TenantPageHeader
        title="Offertes"
        description="Finance workbench voor offertevoorstellen, klantgoedkeuringen en verlopen offertes."
        eyebrow="Tenant finance"
        badges={summary.expiredCount > 0 ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            {summary.expiredCount} verlopen
          </span>
        ) : null}
      />

      <TenantConflictStrip
        items={[
          { label: "Concept", value: summary.draftCount, description: "nog niet verzonden", tone: summary.draftCount > 0 ? "warning" : "neutral" },
          { label: "Ter goedkeuring", value: summary.sentCount, description: "bij klant", tone: summary.sentCount > 0 ? "info" : "neutral" },
          { label: "Goedgekeurd", value: summary.approvedCount, description: "klaar voor vervolg", tone: "success" },
          { label: "Verlopen", value: summary.expiredCount, description: `${summary.totalCount} offertes totaal`, tone: summary.expiredCount > 0 ? "danger" : "success" },
        ]}
      />

      <TenantCommandBar
        title="Offerteregister"
        description="Zoek op offertenummer, klant of opdracht en open acties via het rijmenu."
        search={
          <form className="flex min-w-0 flex-1 gap-2" onSubmit={handleSearch}>
            <TenantToolbarSearch
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Zoek offerte, klant of opdracht"
              wrapperClassName="sm:max-w-lg"
            />
            <Button type="submit" variant="outline" size="sm" className="h-10" disabled={pending}>
              <Search className="h-4 w-4" />
              Zoeken
            </Button>
          </form>
        }
        filters={
          <select
            value={status}
            onChange={(event) => handleStatusChange(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        }
        activeFilters={
          <TenantActiveFilters
            filters={[
              ...(submittedSearch ? [{ id: "search", label: "Zoek", value: submittedSearch }] : []),
              ...(status ? [{ id: "status", label: "Status", value: statusLabel(status) }] : []),
            ]}
            clearAll={activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatus("");
                  load(1, "", "");
                }}
              >
                Filters wissen
              </button>
            ) : undefined}
          />
        }
      />

      <TenantWorkbenchPanel
        title="Offertes"
        description={`${total} offerte${total !== 1 ? "s" : ""} in deze selectie`}
      >
        {pending ? (
          <div className="flex items-center justify-center px-4 py-16 text-muted-foreground">Laden...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <FileCheck2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Geen offertes gevonden.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-3 md:hidden">
              {rows.map((row) => <QuoteMobileCard key={row.id} row={row} />)}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    {["Offerte", "Klant", "Opdracht", "Bedrag", "Status", "Geldig tot", ""].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/quotes/${row.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">
                          {row.quoteNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-foreground">{row.customerName}</td>
                      <td className="px-4 py-3">
                        <Link href={`/assignments/${row.assignmentId}`} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:underline">
                          {row.assignmentCode}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">{fmt(row.amount)}</td>
                      <td className="px-4 py-3">
                        <ProcessStatusBadge kind="quote" status={row.isExpired ? "expired" : row.status} />
                      </td>
                      <td className={row.isExpired ? "px-4 py-3 font-semibold text-red-600" : "px-4 py-3 text-muted-foreground"}>
                        {row.isExpired && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
                        {fmtDate(row.validityDate)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <QuoteRowActions row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </TenantWorkbenchPanel>

      {totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{total} offerte{total !== 1 ? "s" : ""}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => load(page - 1, search, status)} disabled={page <= 1 || pending}>
              <ChevronLeft className="h-4 w-4" />
              Vorige
            </Button>
            <span className="text-sm text-muted-foreground">Pagina {page} van {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => load(page + 1, search, status)} disabled={page >= totalPages || pending}>
              Volgende
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </TenantPageShell>
  );
}

function QuoteRowActions({ row }: { row: QuoteRow }) {
  return (
    <TenantActionMenu
      actions={[
        { id: "open", label: "Open offerte", href: `/quotes/${row.id}`, icon: <FileCheck2 className="h-4 w-4" /> },
        { id: "assignment", label: "Open opdracht", href: `/assignments/${row.assignmentId}`, icon: <TrendingUp className="h-4 w-4" /> },
      ]}
    />
  );
}

function QuoteMobileCard({ row }: { row: QuoteRow }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/quotes/${row.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">
            {row.quoteNumber}
          </Link>
          <h2 className="mt-1 truncate text-sm font-semibold text-foreground">{row.customerName}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{row.assignmentCode}</p>
        </div>
        <QuoteRowActions row={row} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ProcessStatusBadge kind="quote" status={row.isExpired ? "expired" : row.status} />
        <span className="text-sm font-semibold text-foreground">{fmt(row.amount)}</span>
        <span className={row.isExpired ? "text-xs font-semibold text-red-600" : "text-xs text-muted-foreground"}>
          Geldig tot {fmtDate(row.validityDate)}
        </span>
      </div>
    </article>
  );
}

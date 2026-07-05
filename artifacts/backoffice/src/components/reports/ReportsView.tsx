"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Eye } from "lucide-react";

import type { ReportRow, ReportStatus } from "@/app/actions/reports";
import { Button } from "@/components/ui/button";
import {
  TenantActionMenu,
  TenantActiveFilters,
  TenantDataTable,
  TenantFilterDrawer,
  TenantPageShell,
  TenantToolbar,
  TenantToolbarSearch,
  type TenantDataTableColumn,
} from "@/components/tenant-ui";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";
import { processStatusLabel } from "@/lib/process-status";

const PAGE_SIZE = 25;

function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <ProcessStatusBadge kind="report" status={status} />;
}

interface Props {
  rows: ReportRow[];
  total: number;
  page: number;
  search: string;
  statusFilter: string;
  canWrite: boolean;
}

const STATUS_OPTIONS = [
  { value: "", label: "Alle statussen" },
  { value: "submitted", label: processStatusLabel("report", "submitted") },
  { value: "approved", label: processStatusLabel("report", "approved") },
  { value: "rejected", label: processStatusLabel("report", "rejected") },
  { value: "draft", label: processStatusLabel("report", "draft") },
];

export function ReportsView({ rows, total, page, search, statusFilter }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startT] = useTransition();

  const push = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.delete("page");
      startT(() => router.push(`${pathname}?${params.toString()}`));
    },
    [sp, pathname, router],
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const activeFilters = [
    search ? { id: "search", label: "Zoeken", value: search, onRemove: () => push({ search: "" }) } : null,
    statusFilter
      ? {
          id: "status",
          label: "Status",
          value: STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label ?? statusFilter,
          onRemove: () => push({ status: "" }),
        }
      : null,
  ].filter(Boolean) as Parameters<typeof TenantActiveFilters>[0]["filters"];

  const columns: TenantDataTableColumn<ReportRow>[] = [
    {
      id: "assignment",
      header: "Opdracht",
      cell: (row) => (
        <Link href={`/reports/${row.id}`} className="flex items-center gap-1.5 font-medium text-foreground hover:underline">
          <span className="flex-shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {row.assignmentCode}
          </span>
          <span className="max-w-[180px] truncate">{row.assignmentTitle}</span>
        </Link>
      ),
    },
    {
      id: "customer",
      header: "Klant",
      cell: (row) => <span className="text-slate-700">{row.customerName}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <ReportStatusBadge status={row.status} />,
    },
    {
      id: "hours",
      header: "Uren",
      cell: (row) => <span className="font-mono text-xs text-slate-700">{row.hoursWorked ? `${row.hoursWorked}u` : "-"}</span>,
    },
    {
      id: "submittedBy",
      header: "Ingediend door",
      cell: (row) => <span className="text-slate-700">{row.submittedByName}</span>,
    },
    {
      id: "submittedAt",
      header: "Ingediend op",
      cell: (row) => <span className="text-muted-foreground">{formatDate(row.submittedAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      className: "w-12 text-right",
      cell: (row) => (
        <TenantActionMenu
          actions={[
            {
              id: "view",
              label: "Openen",
              href: `/reports/${row.id}`,
              icon: <Eye className="h-4 w-4" />,
            },
          ]}
        />
      ),
    },
  ];

  return (
    <TenantPageShell>
      <TenantToolbar
        search={
          <TenantToolbarSearch
            defaultValue={search}
            placeholder="Zoek op opdracht of klant..."
            onChange={(event) => push({ search: event.target.value })}
          />
        }
        actions={
          <>
            <TenantFilterDrawer activeCount={activeFilters.length} title="Rapportagefilters">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground">Status</span>
                <select value={statusFilter} onChange={(event) => push({ status: event.target.value })} className="veele-input">
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </TenantFilterDrawer>
            <span className="text-sm text-muted-foreground">
              {total} {total === 1 ? "rapport" : "rapporten"}
            </span>
          </>
        }
        activeFilters={<TenantActiveFilters filters={activeFilters} />}
      />

      <TenantDataTable
        rows={rows}
        columns={columns}
        getRowKey={(row) => row.id}
        emptyTitle="Geen rapporten gevonden"
        emptyDescription="Pas de zoekopdracht of filters aan."
        renderMobileCard={(row) => (
          <article className="rounded-lg border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/reports/${row.id}`} className="min-w-0 space-y-1">
                <span className="inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {row.assignmentCode}
                </span>
                <p className="font-medium text-foreground">{row.assignmentTitle}</p>
                <p className="text-sm text-muted-foreground">{row.customerName}</p>
              </Link>
              <TenantActionMenu
                actions={[
                  {
                    id: "view",
                    label: "Openen",
                    href: `/reports/${row.id}`,
                    icon: <Eye className="h-4 w-4" />,
                  },
                ]}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <ReportStatusBadge status={row.status} />
              <span>{row.hoursWorked ? `${row.hoursWorked}u` : "Geen uren"}</span>
              <span>{formatDate(row.submittedAt)}</span>
            </div>
          </article>
        )}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {page} van {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams(sp.toString());
                  params.set("page", String(page - 1));
                  router.push(`${pathname}?${params.toString()}`);
                }}
              >
                Vorige
              </Button>
            )}
            {page < totalPages && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams(sp.toString());
                  params.set("page", String(page + 1));
                  router.push(`${pathname}?${params.toString()}`);
                }}
              >
                Volgende
              </Button>
            )}
          </div>
        </div>
      )}
    </TenantPageShell>
  );
}

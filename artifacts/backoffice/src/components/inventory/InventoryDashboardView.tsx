"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Wrench } from "lucide-react";
import {
  exportInventoryStatusCsv,
  exportInventoryUsageCsv,
  type CsvExport,
  type InventoryDashboardData,
} from "@/app/actions/material-inventory-reports";

const STATUS_LABELS: Record<string, string> = {
  available: "Beschikbaar",
  in_use: "In gebruik",
  assigned_to_object: "Bij object",
  assigned_to_personnel: "Bij personeel",
  maintenance: "Onderhoud",
  defect: "Defect",
  out_of_service: "Buiten gebruik",
  lost: "Kwijt",
  disposed: "Afgevoerd",
  archived: "Gearchiveerd",
};

function toneStyle(tone: string) {
  if (tone === "danger") return { borderColor: "#FCA5A5", backgroundColor: "#FEF2F2", color: "#B91C1C" };
  if (tone === "warn") return { borderColor: "#FCD34D", backgroundColor: "#FFFBEB", color: "#B45309" };
  if (tone === "success") return { borderColor: "#A7F3D0", backgroundColor: "#ECFDF5", color: "#047857" };
  return { borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", color: "var(--color-foreground)" };
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("nl-NL");
}

function downloadCsv(file: CsvExport) {
  const blob = new Blob([file.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function InventoryDashboardView({ data }: { data: InventoryDashboardData }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function runExport(action: () => Promise<CsvExport>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const file = await action();
        downloadCsv(file);
        setMessage(`${file.filename} is gedownload.`);
      } catch (error) {
        setMessage((error as Error).message ?? "Export mislukt.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {data.metrics.map((metric) => {
          const style = toneStyle(metric.tone);
          return (
            <div key={metric.label} className="rounded-md border px-4 py-3" style={{ borderColor: style.borderColor, backgroundColor: style.backgroundColor }}>
              <p className="text-xs font-semibold uppercase" style={{ color: "#64748B" }}>{metric.label}</p>
              <p className="mt-1 text-2xl font-bold" style={{ color: style.color }}>{metric.value}</p>
              <p className="mt-1 text-xs" style={{ color: "#64748B" }}>{metric.description}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-white px-4 py-3" style={{ borderColor: "#E2E8F0" }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: "#334155" }}>
          <FileSpreadsheet className="h-4 w-4" />
          Exports zijn tenant-scoped en geschikt voor status-, verhuur- en facturatierapportage.
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runExport(exportInventoryStatusCsv)}
            disabled={pending}
            className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "#CBD5E1", color: "#334155" }}
          >
            <Download className="h-4 w-4" />
            Status CSV
          </button>
          <button
            type="button"
            onClick={() => runExport(exportInventoryUsageCsv)}
            disabled={pending}
            className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "#CBD5E1", color: "#334155" }}
          >
            <Download className="h-4 w-4" />
            Werkbongebruik CSV
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: "#CBD5E1", color: "#334155" }}>
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="veele-card overflow-hidden p-0">
          <div className="px-5 py-4">
            <h2 className="font-heading text-base font-semibold" style={{ color: "var(--color-foreground)" }}>Statusverdeling</h2>
            <p className="text-sm" style={{ color: "#64748B" }}>Aantal items per inventarisstatus.</p>
          </div>
          <div className="border-t" style={{ borderColor: "#E2E8F0" }}>
            {data.statusCounts.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: "#64748B" }}>Geen inventarisitems gevonden.</p>
            ) : data.statusCounts.map((row) => (
              <div key={row.status} className="flex items-center justify-between border-b px-5 py-3 text-sm" style={{ borderColor: "#F1F5F9" }}>
                <span style={{ color: "#334155" }}>{STATUS_LABELS[row.status] ?? row.status}</span>
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: "#F1F5F9", color: "#475569" }}>{row.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="veele-card overflow-hidden p-0">
          <div className="flex items-center gap-2 px-5 py-4">
            <AlertTriangle className="h-4 w-4" style={{ color: "#B45309" }} />
            <div>
              <h2 className="font-heading text-base font-semibold" style={{ color: "var(--color-foreground)" }}>Open storingen</h2>
              <p className="text-sm" style={{ color: "#64748B" }}>Urgente en lopende storingen per item.</p>
            </div>
          </div>
          <div className="overflow-x-auto border-t" style={{ borderColor: "#E2E8F0" }}>
            <table className="w-full min-w-[760px] text-sm">
              <thead style={{ backgroundColor: "#F8FAFC" }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Item</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Context</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Prioriteit</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Datum</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "#E2E8F0" }}>
                {data.openIssues.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: "#64748B" }}>Geen open storingen.</td></tr>
                ) : data.openIssues.map((row) => (
                  <tr key={row.issueId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <Link href={`/inventory/issues/${row.issueId}`} className="font-medium hover:underline" style={{ color: "var(--color-foreground)" }}>{row.inventoryCode}</Link>
                      <p className="text-xs" style={{ color: "#64748B" }}>{row.inventoryName}</p>
                    </td>
                    <td className="px-4 py-3" style={{ color: "#475569" }}>{row.objectName ?? row.personnelName ?? "Geen context"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>{row.severity} / {row.status}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#64748B" }}>{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="veele-card overflow-hidden p-0">
          <div className="flex items-center gap-2 px-5 py-4">
            <Wrench className="h-4 w-4" style={{ color: "#0F766E" }} />
            <div>
              <h2 className="font-heading text-base font-semibold" style={{ color: "var(--color-foreground)" }}>Onderhoud en keuring</h2>
              <p className="text-sm" style={{ color: "#64748B" }}>Verlopen of binnen 30 dagen nodig.</p>
            </div>
          </div>
          <SimpleTable
            rows={data.maintenanceDue.map((row) => ({
              id: row.eventId,
              href: `/inventory/${row.inventoryItemId}`,
              main: `${row.inventoryCode} - ${row.inventoryName}`,
              sub: `${row.eventType} / ${row.status}`,
              meta: formatDate(row.dueDate),
            }))}
            emptyText="Geen onderhoud of keuring binnen 30 dagen."
          />
        </section>

        <section className="veele-card overflow-hidden p-0">
          <div className="px-5 py-4">
            <h2 className="font-heading text-base font-semibold" style={{ color: "var(--color-foreground)" }}>Werkbongebruik en verhuur</h2>
            <p className="text-sm" style={{ color: "#64748B" }}>Inventarisregels voor rapportage en facturatiecontrole.</p>
          </div>
          <SimpleTable
            rows={data.usageRows.map((row) => ({
              id: row.usageId,
              href: `/assignments/${row.assignmentId}`,
              main: `${row.inventoryCode} - ${row.inventoryName}`,
              sub: `${row.usageType} / ${row.approvalStatus}`,
              meta: row.invoiceable ? "Factureerbaar" : row.customerVisible ? "Klantzichtbaar" : "Intern",
            }))}
            emptyText="Geen inventarisregels op werkbonnen gevonden."
          />
        </section>
      </div>
    </div>
  );
}

function SimpleTable({ rows, emptyText }: { rows: Array<{ id: string; href: string; main: string; sub: string; meta: string }>; emptyText: string }) {
  return (
    <div className="border-t" style={{ borderColor: "#E2E8F0" }}>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm" style={{ color: "#64748B" }}>{emptyText}</p>
      ) : rows.map((row) => (
        <div key={row.id} className="grid gap-2 border-b px-5 py-3 text-sm md:grid-cols-[1fr_auto]" style={{ borderColor: "#F1F5F9" }}>
          <div className="min-w-0">
            <Link href={row.href} className="truncate font-medium hover:underline" style={{ color: "var(--color-foreground)" }}>{row.main}</Link>
            <p className="text-xs" style={{ color: "#64748B" }}>{row.sub}</p>
          </div>
          <span className="text-xs" style={{ color: "#475569" }}>{row.meta}</span>
        </div>
      ))}
    </div>
  );
}

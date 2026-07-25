"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, Download, FileSpreadsheet, PackageCheck } from "lucide-react";
import {
  exportCustomerVisibleMaterialUsageCsv,
  exportMaterialStockCsv,
  type CsvExport,
  type MaterialsDashboardData,
} from "@/app/actions/material-inventory-reports";

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

export function MaterialsDashboardView({ data }: { data: MaterialsDashboardData }) {
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
          Exports gebruiken tenant-scoped queries en bevatten geen data van andere tenants.
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runExport(exportMaterialStockCsv)}
            disabled={pending}
            className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "#CBD5E1", color: "#334155" }}
          >
            <Download className="h-4 w-4" />
            Voorraadrisico CSV
          </button>
          <button
            type="button"
            onClick={() => runExport(exportCustomerVisibleMaterialUsageCsv)}
            disabled={pending}
            className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "#CBD5E1", color: "#334155" }}
          >
            <Download className="h-4 w-4" />
            Klantzichtbaar verbruik CSV
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: "#CBD5E1", color: "#334155" }}>
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="veele-card overflow-hidden p-0">
          <div className="flex items-center gap-2 px-5 py-4">
            <AlertTriangle className="h-4 w-4" style={{ color: "#B45309" }} />
            <div>
              <h2 className="font-heading text-base font-semibold" style={{ color: "var(--color-foreground)" }}>Voorraadrisico's</h2>
              <p className="text-sm" style={{ color: "#64748B" }}>Negatieve en lage voorraad per locatie.</p>
            </div>
          </div>
          <div className="overflow-x-auto border-t" style={{ borderColor: "#E2E8F0" }}>
            <table className="w-full min-w-[760px] text-sm">
              <thead style={{ backgroundColor: "#F8FAFC" }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Materiaal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Locatie</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Aantal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "#E2E8F0" }}>
                {data.stockRisks.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: "#64748B" }}>Geen lage of negatieve voorraad.</td></tr>
                ) : data.stockRisks.map((row) => {
                  const status = row.status === "negative"
                    ? { label: "Negatief", bg: "#FEF2F2", color: "#B91C1C" }
                    : { label: "Laag", bg: "#FFFBEB", color: "#B45309" };
                  return (
                    <tr key={`${row.materialId}-${row.stockLocationName}`} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <Link href={`/materials/${row.materialId}`} className="font-medium hover:underline" style={{ color: "var(--color-foreground)" }}>{row.materialCode}</Link>
                        <p className="text-xs" style={{ color: "#64748B" }}>{row.materialName}</p>
                      </td>
                      <td className="px-4 py-3" style={{ color: "#475569" }}>
                        {row.stockLocationName}
                        <p className="text-xs" style={{ color: "#94A3B8" }}>{row.stockLocationType}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: "#475569" }}>{row.quantity} {row.unit}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: status.bg, color: status.color }}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="veele-card overflow-hidden p-0">
          <div className="flex items-center gap-2 px-5 py-4">
            <PackageCheck className="h-4 w-4" style={{ color: "#0F766E" }} />
            <div>
              <h2 className="font-heading text-base font-semibold" style={{ color: "var(--color-foreground)" }}>Te keuren materiaal</h2>
              <p className="text-sm" style={{ color: "#64748B" }}>Werkbonregels die management nog financieel moet beoordelen.</p>
            </div>
          </div>
          <UsageTable rows={data.pendingUsage} emptyText="Geen materiaalregels in wachtrij." />
        </section>
      </div>

      <section className="veele-card overflow-hidden p-0">
        <div className="px-5 py-4">
          <h2 className="font-heading text-base font-semibold" style={{ color: "var(--color-foreground)" }}>Klantzichtbare materiaalrapportage</h2>
          <p className="text-sm" style={{ color: "#64748B" }}>Alleen goedgekeurde regels met klantzichtbaarheid aan.</p>
        </div>
        <UsageTable rows={data.customerVisibleUsage} emptyText="Geen klantzichtbare materiaalregels gevonden." />
      </section>
    </div>
  );
}

function UsageTable({ rows, emptyText }: { rows: MaterialsDashboardData["pendingUsage"]; emptyText: string }) {
  return (
    <div className="overflow-x-auto border-t" style={{ borderColor: "#E2E8F0" }}>
      <table className="w-full min-w-[780px] text-sm">
        <thead style={{ backgroundColor: "#F8FAFC" }}>
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Werkbon</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Materiaal</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Aantal</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Facturatie</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "#64748B" }}>Datum</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "#E2E8F0" }}>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "#64748B" }}>{emptyText}</td></tr>
          ) : rows.map((row) => (
            <tr key={row.usageId} className="hover:bg-slate-50/70">
              <td className="px-4 py-3">
                <Link href={`/assignments/${row.assignmentId}`} className="font-medium hover:underline" style={{ color: "var(--color-foreground)" }}>
                  {row.assignmentCode ?? "Werkbon"}
                </Link>
                <p className="text-xs" style={{ color: "#64748B" }}>{row.assignmentTitle ?? "Geen titel"}</p>
              </td>
              <td className="px-4 py-3" style={{ color: "#475569" }}>
                {row.materialCode ? <span className="font-mono text-xs">{row.materialCode}</span> : <span className="text-xs">Overig</span>}
                <p>{row.name}</p>
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: "#475569" }}>{row.quantity} {row.unitLabel ?? ""}</td>
              <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>
                {row.invoiceable ? "Factureerbaar" : "Intern"}
                <p style={{ color: "#94A3B8" }}>{row.customerVisible ? "Klantzichtbaar" : "Niet klantzichtbaar"}</p>
              </td>
              <td className="px-4 py-3 text-xs" style={{ color: "#64748B" }}>{formatDate(row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import Link from "next/link";
import { AlertTriangle, ArrowRight, PackageCheck } from "lucide-react";
import type { MaterialStockRow } from "@/app/actions/materials";

function formatQuantity(value: string, unit: string): string {
  const parsed = Number(value);
  const quantity = Number.isFinite(parsed)
    ? new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 }).format(parsed)
    : value;
  return `${quantity} ${unit}`;
}

function statusStyle(status: MaterialStockRow["status"]) {
  if (status === "negative") return { label: "Negatief", bg: "#FEF2F2", color: "#B91C1C" };
  if (status === "low") return { label: "Laag", bg: "#FFFBEB", color: "#B45309" };
  return { label: "Voldoende", bg: "#ECFDF5", color: "#047857" };
}

export function MaterialStockPanel({
  rows,
  title = "Materiaal / Voorraad",
  emptyMessage = "Nog geen materiaalvoorraad gekoppeld.",
}: {
  rows: MaterialStockRow[];
  title?: string;
  emptyMessage?: string;
}) {
  const hasWarning = rows.some((row) => row.status !== "ok");

  return (
    <div className="veele-card overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>
            {title}
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
            {rows.length} voorraadregel{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasWarning && (
            <span
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium"
              style={{ backgroundColor: "#FFFBEB", color: "#B45309" }}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Actie nodig
            </span>
          )}
          <Link
            href="/materials"
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50"
            style={{ border: "1px solid #E2E8F0", color: "#0F766E" }}
          >
            <PackageCheck className="h-3.5 w-3.5" />
            Beheren
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border-t px-5 py-6 text-sm" style={{ borderColor: "#E2E8F0", color: "#64748B" }}>
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto border-t" style={{ borderColor: "#E2E8F0" }}>
          <table className="w-full min-w-[760px] text-sm">
            <thead style={{ backgroundColor: "#F8FAFC" }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
                  Materiaal
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
                  Locatie
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
                  Voorraad
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
                  Actie
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "#E2E8F0" }}>
              {rows.map((row) => {
                const style = statusStyle(row.status);
                return (
                  <tr key={row.balanceId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: "#081D3A" }}>{row.materialName}</p>
                      <p className="font-mono text-xs" style={{ color: "#64748B" }}>{row.materialCode}</p>
                    </td>
                    <td className="px-4 py-3" style={{ color: "#475569" }}>
                      {row.stockLocationName}
                    </td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: row.status === "negative" ? "#B91C1C" : "#081D3A" }}>
                      {formatQuantity(row.quantity, row.unit)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex rounded px-2 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: style.bg, color: style.color }}
                      >
                        {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/materials/${row.materialId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                        style={{ color: "#0F766E" }}
                      >
                        Openen
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

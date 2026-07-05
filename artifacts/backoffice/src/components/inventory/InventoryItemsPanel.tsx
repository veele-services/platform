import Link from "next/link";
import { ArrowRight, PackageSearch, QrCode } from "lucide-react";
import type { InventoryDossierItem } from "@/app/actions/inventory";

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  available: { label: "Beschikbaar", bg: "#ECFDF5", color: "#047857" },
  in_use: { label: "In gebruik", bg: "#EFF6FF", color: "#1D4ED8" },
  assigned_to_object: { label: "Bij object", bg: "#F0FDFA", color: "#0F766E" },
  assigned_to_personnel: { label: "Bij personeel", bg: "#F0F4FF", color: "#3B5CE0" },
  maintenance: { label: "Onderhoud", bg: "#FFFBEB", color: "#B45309" },
  defect: { label: "Defect", bg: "#FEF2F2", color: "#B91C1C" },
  out_of_service: { label: "Buiten gebruik", bg: "#F1F5F9", color: "#475569" },
  lost: { label: "Kwijt", bg: "#FEF2F2", color: "#B91C1C" },
  disposed: { label: "Afgevoerd", bg: "#F1F5F9", color: "#475569" },
  archived: { label: "Gearchiveerd", bg: "#F1F5F9", color: "#475569" },
};

function statusStyle(status: string) {
  return STATUS_LABELS[status] ?? { label: status, bg: "#F1F5F9", color: "#475569" };
}

function itemSubtitle(row: InventoryDossierItem): string {
  return [row.categoryName, row.type, row.brand, row.model].filter(Boolean).join(" - ") || "Geen categorie";
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("nl-NL");
}

export function InventoryItemsPanel({
  rows,
  title = "Inventaris",
  emptyMessage = "Nog geen inventaris gekoppeld.",
}: {
  rows: InventoryDossierItem[];
  title?: string;
  emptyMessage?: string;
}) {
  return (
    <div className="veele-card overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>
            {title}
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
            {rows.length} item{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50"
          style={{ border: "1px solid #E2E8F0", color: "#0F766E" }}
        >
          <PackageSearch className="h-3.5 w-3.5" />
          Beheren
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="border-t px-5 py-6 text-sm" style={{ borderColor: "#E2E8F0", color: "#64748B" }}>
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto border-t" style={{ borderColor: "#E2E8F0" }}>
          <table className="w-full min-w-[820px] text-sm">
            <thead style={{ backgroundColor: "#F8FAFC" }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Inventaris</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Locatie</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Keuring</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Actie</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "#E2E8F0" }}>
              {rows.map((row) => {
                const status = statusStyle(row.status);
                return (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "#475569" }}>{row.code}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: "#081D3A" }}>{row.name}</p>
                      <p className="text-xs" style={{ color: "#64748B" }}>{itemSubtitle(row)}</p>
                      {row.serialNumber ? <p className="font-mono text-xs" style={{ color: "#94A3B8" }}>{row.serialNumber}</p> : null}
                    </td>
                    <td className="px-4 py-3" style={{ color: "#475569" }}>{row.currentLocationName ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: "#475569" }}>{formatDate(row.nextInspectionDate)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link href={`/inventory/${row.id}/qr`} className="inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: "#334155" }}>
                          <QrCode className="h-3.5 w-3.5" />
                          QR
                        </Link>
                        <Link href={`/inventory/${row.id}`} className="inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: "#0F766E" }}>
                          Openen
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
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

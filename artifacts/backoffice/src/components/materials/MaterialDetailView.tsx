"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { Archive, ArrowLeft, ClipboardList, Package, Pencil } from "lucide-react";
import {
  archiveMaterial,
  updateMaterial,
  type ActionResult,
  type MaterialDetail,
  type MaterialManagementOptions,
} from "@/app/actions/materials";
import { MaterialStockPanel } from "@/components/materials/MaterialStockPanel";
import { useRouter } from "next/navigation";

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function money(value: string | null): string {
  if (value === null) return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parsed)
    : value;
}

function quantity(value: string, unit: string): string {
  const parsed = Number(value);
  const formatted = Number.isFinite(parsed)
    ? new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 }).format(parsed)
    : value;
  return `${formatted} ${unit}`;
}

function resultMessage(result: ActionResult, successMessage: string): string {
  return result.success ? successMessage : result.message;
}

export function MaterialDetailView({
  material,
  options,
  canWrite,
}: {
  material: MaterialDetail;
  options: MaterialManagementOptions;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>, successMessage: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(resultMessage(result, successMessage));
      if (result.success) router.refresh();
    });
  }

  function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const categoryId = formString(formData, "categoryId");
    run(
      () => updateMaterial(material.id, {
        name: formString(formData, "name") ?? "",
        unit: formString(formData, "unit") ?? "",
        categoryId: categoryId === "__new" ? null : categoryId,
        categoryName: categoryId === "__new" ? formString(formData, "categoryName") : null,
        description: formString(formData, "description"),
        costPrice: formString(formData, "costPrice"),
        salePrice: formString(formData, "salePrice"),
        vatRate: formString(formData, "vatRate"),
        vatType: formString(formData, "vatType"),
        supplierName: formString(formData, "supplierName"),
        supplierItemNumber: formString(formData, "supplierItemNumber"),
        barcode: formString(formData, "barcode"),
        minStock: formString(formData, "minStock"),
        maxStock: formString(formData, "maxStock"),
        defaultInvoiceable: formData.get("defaultInvoiceable") === "on",
        notes: formString(formData, "notes"),
      }),
      "Materiaal bijgewerkt.",
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 p-8">
      <Link href="/materials" className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: "#64748B" }}>
        <ArrowLeft className="h-4 w-4" />
        Materiaalbeheer
      </Link>

      <div className="veele-card flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>{material.name}</h1>
            <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs" style={{ color: "#475569" }}>{material.code}</span>
            {material.archivedAt && (
              <span className="rounded px-2 py-1 text-xs font-semibold" style={{ backgroundColor: "#FEF2F2", color: "#B91C1C" }}>
                Gearchiveerd
              </span>
            )}
          </div>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            {material.categoryName ?? "Geen categorie"} - {material.unit}
          </p>
        </div>
        {canWrite && !material.archivedAt && (
          <button
            type="button"
            onClick={() => run(() => archiveMaterial(material.id), "Materiaal gearchiveerd.")}
            disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "#FCD34D", color: "#B45309" }}
          >
            <Archive className="h-4 w-4" />
            Archiveer
          </button>
        )}
      </div>

      {message && (
        <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: "#CBD5E1", color: "#334155" }}>
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Totale voorraad" value={quantity(material.totalStock, material.unit)} />
            <Metric label="Locaties" value={String(material.locationsCount)} />
            <Metric label="Lage voorraad" value={String(material.lowLocationsCount)} tone={material.lowLocationsCount > 0 ? "warn" : "ok"} />
            <Metric label="Negatief" value={String(material.negativeLocationsCount)} tone={material.negativeLocationsCount > 0 ? "danger" : "ok"} />
          </div>

          <MaterialStockPanel rows={material.balances} />

          <div className="veele-card overflow-hidden p-0">
            <div className="flex items-center gap-2 px-5 py-4">
              <ClipboardList className="h-4 w-4" style={{ color: "#0F766E" }} />
              <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>Voorraadmutaties</h2>
            </div>
            <div className="border-t" style={{ borderColor: "#E2E8F0" }}>
              {material.movements.length === 0 ? (
                <p className="px-5 py-6 text-sm" style={{ color: "#64748B" }}>Nog geen voorraadmutaties.</p>
              ) : (
                <div className="divide-y" style={{ borderColor: "#E2E8F0" }}>
                  {material.movements.map((movement) => (
                    <div key={movement.id} className="px-5 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium" style={{ color: "#081D3A" }}>
                          {movement.movementType} - {quantity(movement.quantity, material.unit)}
                        </p>
                        <p className="text-xs" style={{ color: "#94A3B8" }}>
                          {new Date(movement.createdAt).toLocaleString("nl-NL")}
                        </p>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: "#64748B" }}>
                        {movement.fromLocationName ?? "-"}{" -> "}{movement.toLocationName ?? "-"}
                        {movement.reason ? ` - ${movement.reason}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="veele-card overflow-hidden p-0">
            <div className="flex items-center gap-2 px-5 py-4">
              <Package className="h-4 w-4" style={{ color: "#0F766E" }} />
              <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>Verbruik op werkbonnen</h2>
            </div>
            <div className="border-t" style={{ borderColor: "#E2E8F0" }}>
              {material.usages.length === 0 ? (
                <p className="px-5 py-6 text-sm" style={{ color: "#64748B" }}>Nog geen verbruikshistorie.</p>
              ) : (
                <div className="divide-y" style={{ borderColor: "#E2E8F0" }}>
                  {material.usages.map((usage) => (
                    <div key={usage.id} className="px-5 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium" style={{ color: "#081D3A" }}>{usage.name}</p>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs" style={{ color: "#475569" }}>
                          {usage.approvalStatus}
                        </span>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: "#64748B" }}>
                        {usage.assignmentCode ?? "Werkbon"} - {quantity(usage.quantity, usage.unitLabel ?? material.unit)}
                        {usage.invoiceable ? " - factureerbaar" : ""}
                        {usage.customerVisible ? " - klantzichtbaar" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="veele-card">
            <h2 className="font-heading mb-4 text-sm font-semibold" style={{ color: "#081D3A" }}>Financieel</h2>
            <dl className="space-y-3 text-sm">
              <Info label="Kostprijs" value={money(material.costPrice)} />
              <Info label="Verkoopprijs" value={money(material.salePrice)} />
              <Info label="BTW" value={material.vatRate ? `${material.vatRate}%` : "-"} />
              <Info label="Factureerbaar" value={material.defaultInvoiceable ? "Ja" : "Nee"} />
            </dl>
          </div>

          {canWrite && !material.archivedAt && (
            <form onSubmit={handleUpdate} className="veele-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4" style={{ color: "#0F766E" }} />
                <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>Bewerken</h2>
              </div>
              <input name="name" defaultValue={material.name} required className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              <div className="grid grid-cols-2 gap-3">
                <input name="unit" defaultValue={material.unit} required className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
                <input name="vatRate" defaultValue={material.vatRate ?? ""} inputMode="decimal" placeholder="BTW %" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              </div>
              <select name="categoryId" defaultValue="" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
                <option value="">Geen categorie wijzigen</option>
                {options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                <option value="__new">Nieuwe categorie</option>
              </select>
              <input name="categoryName" placeholder="Nieuwe categorie indien gekozen" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              <div className="grid grid-cols-2 gap-3">
                <input name="costPrice" defaultValue={material.costPrice ?? ""} inputMode="decimal" placeholder="Kostprijs" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
                <input name="salePrice" defaultValue={material.salePrice ?? ""} inputMode="decimal" placeholder="Verkoopprijs" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input name="minStock" defaultValue={material.minStock ?? ""} inputMode="decimal" placeholder="Minimumvoorraad" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
                <input name="maxStock" defaultValue={material.maxStock ?? ""} inputMode="decimal" placeholder="Maximumvoorraad" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              </div>
              <input name="barcode" defaultValue={material.barcode ?? ""} placeholder="Barcode" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              <input name="supplierName" defaultValue={material.supplierName ?? ""} placeholder="Leverancier" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              <input name="supplierItemNumber" defaultValue={material.supplierItemNumber ?? ""} placeholder="Leveranciersartikelnummer" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              <textarea name="description" defaultValue={material.description ?? ""} rows={3} placeholder="Omschrijving" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "#CBD5E1" }} />
              <textarea name="notes" defaultValue={material.notes ?? ""} rows={2} placeholder="Notities" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "#CBD5E1" }} />
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: "#334155" }}>
                <input name="defaultInvoiceable" type="checkbox" defaultChecked={material.defaultInvoiceable} />
                Standaard factureerbaar
              </label>
              <button type="submit" disabled={pending} className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: "#0F766E" }}>
                <Pencil className="h-4 w-4" />
                Opslaan
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "ok" | "warn" | "danger" }) {
  const color = tone === "danger" ? "#B91C1C" : tone === "warn" ? "#B45309" : tone === "ok" ? "#047857" : "#081D3A";
  return (
    <div className="veele-card">
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#64748B" }}>{label}</p>
      <p className="mt-2 text-xl font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt style={{ color: "#64748B" }}>{label}</dt>
      <dd className="font-medium" style={{ color: "#081D3A" }}>{value}</dd>
    </div>
  );
}

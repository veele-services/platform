"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2, PackageSearch, Plus } from "lucide-react";
import {
  addInventoryUsage,
  type InventoryCatalogOption,
  type InventoryUsageItem,
  type InventoryUsageType,
} from "@/actions/inventory";
import { formatQuantity } from "./work-order-data";

type Props = {
  assignmentId: string;
  initialItems: InventoryUsageItem[];
  catalog: InventoryCatalogOption[];
  canEdit: boolean;
};

type FormState = {
  inventoryItemId: string;
  usageType: InventoryUsageType;
  quantity: string;
  periodLabel: string;
  notes: string;
};

const USAGE_LABELS: Record<InventoryUsageType, string> = {
  used: "Gebruikt",
  rented: "Verhuurd",
  issued: "Uitgegeven",
  returned: "Retour",
  defect_found: "Defect geconstateerd",
};

function createEmptyForm(catalog: InventoryCatalogOption[]): FormState {
  return {
    inventoryItemId: catalog[0]?.id ?? "",
    usageType: "used",
    quantity: "1",
    periodLabel: "",
    notes: "",
  };
}

function parseQuantity(value: string): number {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function usageLabel(value: string): string {
  return USAGE_LABELS[value as InventoryUsageType] ?? value;
}

export function InventoryEditor({ assignmentId, initialItems, catalog, canEdit }: Props) {
  const [items, setItems] = useState<InventoryUsageItem[]>(initialItems);
  const [form, setForm] = useState<FormState>(() => createEmptyForm(catalog));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedItem = catalog.find((item) => item.id === form.inventoryItemId) ?? null;
  const itemCountLabel = `${items.length} registratie${items.length === 1 ? "" : "s"}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!selectedItem) {
      setError("Kies een inventarisitem");
      return;
    }

    startTransition(async () => {
      const result = await addInventoryUsage(assignmentId, {
        inventoryItemId: selectedItem.id,
        usageType: form.usageType,
        quantity: form.quantity,
        periodLabel: form.periodLabel || null,
        notes: form.notes || null,
      });

      if (!result.success || !result.id) {
        setError(result.error ?? "Inventaris opslaan mislukt");
        return;
      }

      setItems((current) => [
        ...current.filter((item) => item.inventoryItemId !== selectedItem.id),
        {
          id: result.id!,
          inventoryItemId: selectedItem.id,
          inventoryCode: selectedItem.code,
          name: selectedItem.name,
          usageType: form.usageType,
          quantity: parseQuantity(form.quantity),
          periodLabel: form.periodLabel || null,
          notes: form.notes || null,
          approvalStatus: "pending",
        },
      ]);
      setForm(createEmptyForm(catalog));
      setNotice("Inventaris is aan de werkbon gekoppeld en wacht op beoordeling.");
    });
  }

  return (
    <section className="space-y-4 px-4 pb-28 pt-5">
      <div className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[19px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
            Inventaris
          </h2>
          <span className="text-[13px] font-black" style={{ color: "var(--color-accent)" }}>
            {itemCountLabel}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {items.length > 0 ? items.map((item) => (
            <div key={item.id} className="min-w-0">
              <p className="truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
                {item.name}
              </p>
              <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-secondary)" }}>
                {formatQuantity(item.quantity)} item{item.quantity === 1 ? "" : "s"} - {usageLabel(item.usageType)}
                {item.periodLabel ? ` - ${item.periodLabel}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-[#E8F2FF] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#2563A9]">
                  {item.inventoryCode}
                </span>
                <span className="rounded-full bg-[#F4F6FA] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
                  {item.approvalStatus === "approved" ? "Goedgekeurd" : item.approvalStatus === "rejected" ? "Afgewezen" : "Wacht op controle"}
                </span>
              </div>
            </div>
          )) : (
            <div className="rounded-[18px] border border-dashed px-4 py-5 text-center" style={{ borderColor: "var(--color-border)" }}>
              <PackageSearch size={28} className="mx-auto mb-2" style={{ color: "var(--color-muted-fg)" }} />
              <p className="text-[14px] font-black" style={{ color: "var(--color-primary)" }}>
                Geen inventaris gekoppeld
              </p>
              <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-5" style={{ color: "var(--color-secondary)" }}>
                Koppel gebruikte, verhuurde of defect geconstateerde inventaris aan deze werkbon.
              </p>
            </div>
          )}
        </div>
      </div>

      {canEdit ? (
        <form
          onSubmit={handleSubmit}
          className="rounded-[18px] bg-white px-5 py-4 shadow-sm"
          style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}
        >
          <h3 className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
            Inventaris toevoegen
          </h3>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                Inventarisitem
              </span>
              <select
                value={form.inventoryItemId}
                onChange={(event) => setForm((current) => ({ ...current, inventoryItemId: event.target.value }))}
                className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
              >
                {catalog.length === 0 ? <option value="">Geen inventaris beschikbaar</option> : null}
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} - {item.name}{item.currentLocationName ? ` (${item.currentLocationName})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                Gebruikstype
              </span>
              <select
                value={form.usageType}
                onChange={(event) => setForm((current) => ({ ...current, usageType: event.target.value as InventoryUsageType }))}
                className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
              >
                {Object.entries(USAGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                  Aantal
                </span>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={form.quantity}
                  onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                  className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                  Periode/context
                </span>
                <input
                  value={form.periodLabel}
                  onChange={(event) => setForm((current) => ({ ...current, periodLabel: event.target.value }))}
                  className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                  placeholder="bijv. daghuur"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                Opmerking
              </span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                rows={2}
                className="w-full resize-none rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
              />
            </label>

            {notice ? (
              <p className="rounded-2xl px-3 py-2 text-[13px] font-bold" style={{ backgroundColor: "#E9FBF8", color: "#0A837F" }}>
                {notice}
              </p>
            ) : null}
            {error ? (
              <p className="rounded-2xl px-3 py-2 text-[13px] font-bold" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isPending || !form.inventoryItemId}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-black text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {isPending ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />}
              Toevoegen
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

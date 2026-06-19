"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  MATERIAL_CATALOG,
  calculateMaterialLineTotal,
  formatMoney,
  formatQuantity,
  type MaterialUsageItem,
} from "./work-order-data";

type Props = {
  initialItems: MaterialUsageItem[];
};

type FormState = {
  materialId: string;
  name:       string;
  quantity:   string;
  unitPrice:  string;
};

const EMPTY_FORM: FormState = {
  materialId: "",
  name:       "",
  quantity:   "1",
  unitPrice:  "",
};

function parseNumber(value: string): number {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function MaterialEditor({ initialItems }: Props) {
  const [items, setItems] = useState<MaterialUsageItem[]>(initialItems);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const lineTotal = useMemo(
    () => parseNumber(form.quantity) * parseNumber(form.unitPrice),
    [form.quantity, form.unitPrice],
  );
  const total = useMemo(
    () => items.reduce((sum, item) => sum + calculateMaterialLineTotal(item), 0),
    [items],
  );

  function handleMaterialChange(materialId: string) {
    const material = MATERIAL_CATALOG.find((item) => item.id === materialId);
    setForm((current) => ({
      ...current,
      materialId,
      name:      material?.name ?? "",
      quantity:  material ? String(material.quantity) : current.quantity,
      unitPrice: material ? String(material.unitPrice) : "",
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const name = form.name.trim();
    const quantity = parseNumber(form.quantity);
    const unitPrice = parseNumber(form.unitPrice);

    if (!name) {
      setError("Materiaal is verplicht");
      return;
    }
    if (quantity <= 0) {
      setError("Aantal moet groter zijn dan 0");
      return;
    }

    setItems((current) => [
      ...current,
      {
        id:        `local-material-${Date.now()}`,
        name,
        quantity,
        unitPrice,
      },
    ]);
    setForm(EMPTY_FORM);
  }

  return (
    <section className="space-y-4 px-4 pb-28 pt-5">
      <div className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[19px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
            Materiaal / Verbruik
          </h2>
          <span className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
            {formatMoney(total)}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {items.length > 0 ? items.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
                  {item.name}
                </p>
                <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-secondary)" }}>
                  {formatQuantity(item.quantity)} x {formatMoney(item.unitPrice)}
                </p>
              </div>
              <span className="text-[14px] font-black" style={{ color: "var(--color-primary)" }}>
                {formatMoney(calculateMaterialLineTotal(item))}
              </span>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full border"
                style={{ borderColor: "#FECACA", color: "#DC2626" }}
                onClick={() => setItems((current) => current.filter((currentItem) => currentItem.id !== item.id))}
                aria-label="Materiaal verwijderen"
              >
                <Trash2 size={15} />
              </button>
            </div>
          )) : (
            <p className="py-2 text-[14px]" style={{ color: "var(--color-secondary)" }}>
              Geen materiaal geregistreerd.
            </p>
          )}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-[18px] bg-white px-5 py-4 shadow-sm"
        style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}
      >
        <h3 className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
          Materiaal toevoegen
        </h3>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
              Materiaal
            </span>
            <select
              value={form.materialId}
              onChange={(event) => handleMaterialChange(event.target.value)}
              className="w-full rounded-2xl border bg-white px-3 py-3 text-[14px] font-semibold outline-none"
              style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            >
              <option value="">Selecteer materiaal</option>
              {MATERIAL_CATALOG.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
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
                min="0"
                step="0.25"
                value={form.quantity}
                onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                Stukprijs
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.unitPrice}
                onChange={(event) => setForm((current) => ({ ...current, unitPrice: event.target.value }))}
                className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
              />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ backgroundColor: "#F6F8FB" }}>
            <span className="text-[13px] font-bold" style={{ color: "var(--color-secondary)" }}>
              Regel totaal
            </span>
            <span className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
              {formatMoney(lineTotal)}
            </span>
          </div>

          {error ? (
            <p className="rounded-2xl px-3 py-2 text-[13px] font-bold" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-black text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            <Plus size={17} />
            Toevoegen
          </button>
        </div>
      </form>
    </section>
  );
}

"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Boxes, Loader2, Plus, Trash2 } from "lucide-react";
import { addMaterialUsage, deleteMaterialUsage } from "@/actions/materials";
import {
  enqueueOfflineWorkOrderAction,
  isOfflineNow,
} from "@/lib/offline/work-order-queue";
import {
  calculateMaterialLineTotal,
  formatMoney,
  formatQuantity,
  type MaterialUsageItem,
} from "./work-order-data";

type Props = {
  assignmentId: string;
  initialItems: MaterialUsageItem[];
  canEdit: boolean;
};

const EMPTY_FORM = {
  name: "",
  quantity: "1",
  unitPrice: "",
  unitLabel: "stuk",
  notes: "",
};

export function MaterialEditor({ assignmentId, initialItems, canEdit }: Props) {
  const [items, setItems] = useState<MaterialUsageItem[]>(initialItems);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const total = items.reduce((sum, item) => sum + calculateMaterialLineTotal(item), 0);

  function parseFormNumber(value: string, fallback: number): number {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const name = form.name.trim();
    if (!name) {
      setError("Materiaalnaam is verplicht");
      return;
    }

    const input = {
      name,
      quantity: form.quantity || "1",
      unitPrice: form.unitPrice || "0",
      unitLabel: form.unitLabel || null,
      notes: form.notes || null,
    };

    startTransition(async () => {
      if (isOfflineNow()) {
        enqueueOfflineWorkOrderAction({
          type: "add-material-usage",
          assignmentId,
          payload: input,
        });
        setItems((current) => [
          ...current,
          {
            id:        `local-material-${Date.now()}`,
            name,
            quantity:  parseFormNumber(form.quantity, 1),
            unitPrice: parseFormNumber(form.unitPrice, 0),
            unitLabel: form.unitLabel || undefined,
          },
        ]);
        setForm(EMPTY_FORM);
        setNotice("Materiaal is offline opgeslagen en wordt automatisch gesynchroniseerd.");
        return;
      }

      const result = await addMaterialUsage(assignmentId, input);
      if (!result.success || !result.id) {
        setError(result.error ?? "Materiaal opslaan mislukt");
        return;
      }

      setItems((current) => [
        ...current,
        {
          id:        result.id!,
          name,
          quantity:  parseFormNumber(form.quantity, 1),
          unitPrice: parseFormNumber(form.unitPrice, 0),
          unitLabel: form.unitLabel || undefined,
        },
      ]);
      setForm(EMPTY_FORM);
    });
  }

  function handleDelete(item: MaterialUsageItem) {
    if (item.id.startsWith("local-material-")) {
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      return;
    }

    setDeletingId(item.id);
    startTransition(async () => {
      try {
        const result = await deleteMaterialUsage(assignmentId, item.id);
        if (!result.success) {
          setError(result.error ?? "Verwijderen mislukt");
          return;
        }
        setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      } finally {
        setDeletingId(null);
      }
    });
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
              {canEdit ? (
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full border"
                  style={{ borderColor: "#FECACA", color: "#DC2626" }}
                  onClick={() => handleDelete(item)}
                  disabled={deletingId === item.id}
                  aria-label="Materiaal verwijderen"
                >
                  {deletingId === item.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              ) : null}
            </div>
          )) : (
            <div className="rounded-[18px] border border-dashed px-4 py-5 text-center" style={{ borderColor: "var(--color-border)" }}>
              <Boxes size={28} className="mx-auto mb-2" style={{ color: "var(--color-muted-fg)" }} />
              <p className="text-[14px] font-black" style={{ color: "var(--color-primary)" }}>
                Geen materiaal geregistreerd
              </p>
              <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-5" style={{ color: "var(--color-secondary)" }}>
                Voeg gebruikte materialen toe, ook wanneer je tijdelijk offline bent.
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
            Materiaal toevoegen
          </h3>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                Materiaal
              </span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                placeholder="Bijv. reinigingsdoek industrieel"
              />
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                  Aantal
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.quantity}
                  onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                  className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                  Prijs
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
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                  Eenheid
                </span>
                <input
                  value={form.unitLabel}
                  onChange={(event) => setForm((current) => ({ ...current, unitLabel: event.target.value }))}
                  className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
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
              disabled={isPending}
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

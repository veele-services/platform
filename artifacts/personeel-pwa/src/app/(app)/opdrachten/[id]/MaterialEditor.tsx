"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Boxes, Loader2, Plus, Trash2 } from "lucide-react";
import {
  addMaterialUsage,
  deleteMaterialUsage,
  type MaterialCatalogOption,
} from "@/actions/materials";
import {
  enqueueOfflineWorkOrderAction,
  isOfflineNow,
  removeOfflineWorkOrderActionsByClientMutationId,
} from "@/lib/offline/work-order-queue";
import {
  formatQuantity,
  type MaterialUsageItem,
} from "./work-order-data";

type Props = {
  assignmentId: string;
  expectedParticipantVersion: number | null;
  initialItems: MaterialUsageItem[];
  catalog: MaterialCatalogOption[];
  canEdit: boolean;
};

type MaterialFormMode = "catalog" | "other";

type MaterialFormState = {
  mode: MaterialFormMode;
  materialId: string;
  name: string;
  quantity: string;
  unitLabel: string;
  notes: string;
  usesStock: boolean;
  stockLocationId: string;
};

function createEmptyForm(catalog: MaterialCatalogOption[]): MaterialFormState {
  const firstMaterial = catalog[0] ?? null;
  return {
    mode: firstMaterial ? "catalog" : "other",
    materialId: firstMaterial?.id ?? "",
    name: "",
    quantity: "1",
    unitLabel: firstMaterial?.unit ?? "stuk",
    notes: "",
    usesStock: false,
    stockLocationId: "",
  };
}

function parseFormNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createClientMutationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `material-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MaterialEditor({ assignmentId, expectedParticipantVersion, initialItems, catalog, canEdit }: Props) {
  const [items, setItems] = useState<MaterialUsageItem[]>(initialItems);
  const [form, setForm] = useState<MaterialFormState>(() => createEmptyForm(catalog));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedMaterial = useMemo(
    () => catalog.find((material) => material.id === form.materialId) ?? null,
    [catalog, form.materialId],
  );

  const availableStockLocations = useMemo(
    () => selectedMaterial?.stockLocations.filter((source) => source.quantity > 0) ?? [],
    [selectedMaterial],
  );

  const selectedStockLocation = availableStockLocations.find((source) => source.id === form.stockLocationId) ?? null;
  const itemCountLabel = `${items.length} registratie${items.length === 1 ? "" : "s"}`;

  function setMode(mode: MaterialFormMode) {
    if (mode === "catalog" && catalog.length === 0) return;
    const firstMaterial = catalog[0] ?? null;
    setForm((current) => ({
      ...current,
      mode,
      materialId: mode === "catalog" ? current.materialId || firstMaterial?.id || "" : "",
      name: mode === "catalog" ? "" : current.name,
      unitLabel: mode === "catalog" ? selectedMaterial?.unit ?? firstMaterial?.unit ?? "stuk" : current.unitLabel || "stuk",
      usesStock: false,
      stockLocationId: "",
    }));
  }

  function setMaterial(materialId: string) {
    const material = catalog.find((item) => item.id === materialId) ?? null;
    setForm((current) => ({
      ...current,
      materialId,
      unitLabel: material?.unit ?? current.unitLabel,
      usesStock: false,
      stockLocationId: "",
    }));
  }

  function toggleUsesStock(checked: boolean) {
    setForm((current) => ({
      ...current,
      usesStock: checked,
      stockLocationId: checked ? availableStockLocations[0]?.id ?? "" : "",
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const isOther = form.mode === "other";
    const name = isOther ? form.name.trim() : selectedMaterial?.name ?? "";
    const unitLabel = isOther ? form.unitLabel.trim() || "stuk" : selectedMaterial?.unit ?? "stuk";
    const quantity = form.quantity || "1";
    const usesStock = !isOther && form.usesStock;
    const clientMutationId = createClientMutationId();

    if (!name) {
      setError(isOther ? "Materiaalnaam is verplicht" : "Kies een materiaal uit de catalogus");
      return;
    }
    if (usesStock && !form.stockLocationId) {
      setError("Kies een voorraadlocatie");
      return;
    }

    const input = {
      materialId: isOther ? null : selectedMaterial?.id ?? null,
      materialCode: isOther ? null : selectedMaterial?.code ?? null,
      name,
      quantity,
      unitLabel,
      notes: form.notes || null,
      usesStock,
      stockLocationId: usesStock ? form.stockLocationId : null,
      stockLocationName: usesStock ? selectedStockLocation?.name ?? null : null,
      isOther,
      clientMutationId,
    };

    startTransition(async () => {
      if (isOfflineNow()) {
        enqueueOfflineWorkOrderAction({
          type: "add-material-usage",
          assignmentId,
          expectedParticipantVersion,
          payload: input,
        });
        setItems((current) => [
          ...current,
          {
            id: `local-material-${clientMutationId}`,
            materialId: input.materialId,
            materialCode: input.materialCode,
            name,
            quantity: parseFormNumber(form.quantity, 1),
            unitPrice: 0,
            unitLabel,
            notes: input.notes,
            usesStock,
            stockLocationName: input.stockLocationName,
            isOther,
            approvalStatus: "pending",
          },
        ]);
        setForm(createEmptyForm(catalog));
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
          id: result.id!,
          materialId: input.materialId,
          materialCode: input.materialCode,
          name,
          quantity: parseFormNumber(form.quantity, 1),
          unitPrice: 0,
          unitLabel,
          notes: input.notes,
          usesStock,
          stockLocationName: input.stockLocationName,
          isOther,
          approvalStatus: "pending",
        },
      ]);
      setForm(createEmptyForm(catalog));
    });
  }

  function handleDelete(item: MaterialUsageItem) {
    if (item.id.startsWith("local-material-")) {
      removeOfflineWorkOrderActionsByClientMutationId(item.id.replace("local-material-", ""));
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      return;
    }

    if (isOfflineNow()) {
      setError("Verwijderen is online-only. Probeer opnieuw zodra je verbinding hebt; offline toevoegingen kun je wel direct verwijderen.");
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
          <span className="text-[13px] font-black" style={{ color: "var(--color-accent)" }}>
            {itemCountLabel}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {items.length > 0 ? items.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
                  {item.name}
                </p>
                <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-secondary)" }}>
                  {formatQuantity(item.quantity)} {item.unitLabel ?? "stuk"}{item.usesStock && item.stockLocationName ? ` uit ${item.stockLocationName}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {item.materialCode ? (
                    <span className="rounded-full bg-[#E8F2FF] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#2563A9]">
                      {item.materialCode}
                    </span>
                  ) : null}
                  {item.usesStock ? (
                    <span className="rounded-full bg-[#E9FBF8] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#0A837F]">
                      Uit voorraad
                    </span>
                  ) : null}
                  {item.isOther ? (
                    <span className="rounded-full bg-[#F4F6FA] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
                      Overig
                    </span>
                  ) : null}
                </div>
              </div>
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

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-[#F4F6FA] p-1">
            <button
              type="button"
              onClick={() => setMode("catalog")}
              disabled={catalog.length === 0}
              className="rounded-xl px-3 py-2 text-[13px] font-black disabled:opacity-50"
              style={form.mode === "catalog" ? { backgroundColor: "white", color: "var(--color-primary)" } : { color: "var(--color-secondary)" }}
            >
              Catalogus
            </button>
            <button
              type="button"
              onClick={() => setMode("other")}
              className="rounded-xl px-3 py-2 text-[13px] font-black"
              style={form.mode === "other" ? { backgroundColor: "white", color: "var(--color-primary)" } : { color: "var(--color-secondary)" }}
            >
              Overig
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {form.mode === "catalog" ? (
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                  Materiaal
                </span>
                <select
                  value={form.materialId}
                  onChange={(event) => setMaterial(event.target.value)}
                  className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                >
                  {catalog.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.code} - {material.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
                  Materiaal
                </span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                  placeholder="Bijv. klein verbruiksartikel"
                />
              </label>
            )}

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
                  Eenheid
                </span>
                <input
                  value={form.mode === "catalog" ? selectedMaterial?.unit ?? form.unitLabel : form.unitLabel}
                  onChange={(event) => setForm((current) => ({ ...current, unitLabel: event.target.value }))}
                  disabled={form.mode === "catalog"}
                  className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none disabled:bg-[#F8FAFC]"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                />
              </label>
            </div>

            {form.mode === "catalog" ? (
              <div className="rounded-2xl border px-3 py-3" style={{ borderColor: "var(--color-border)" }}>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-black" style={{ color: "var(--color-primary)" }}>
                    Uit voorraad gebruiken
                  </span>
                  <input
                    type="checkbox"
                    checked={form.usesStock}
                    disabled={availableStockLocations.length === 0}
                    onChange={(event) => toggleUsesStock(event.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-[#00A6A2]"
                  />
                </label>
                {form.usesStock ? (
                  <select
                    value={form.stockLocationId}
                    onChange={(event) => setForm((current) => ({ ...current, stockLocationId: event.target.value }))}
                    className="mt-3 w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                  >
                    {availableStockLocations.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name} - {formatQuantity(source.quantity)} beschikbaar
                      </option>
                    ))}
                  </select>
                ) : null}
                {availableStockLocations.length === 0 ? (
                  <p className="mt-2 text-[12px] font-semibold" style={{ color: "var(--color-secondary)" }}>
                    Geen gekoppelde voorraad beschikbaar voor dit materiaal.
                  </p>
                ) : null}
              </div>
            ) : null}

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

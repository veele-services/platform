"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeft, ClipboardList, MapPin, PackageSearch, Pencil } from "lucide-react";
import {
  INVENTORY_STATUS_OPTIONS,
  archiveInventoryItem,
  updateInventoryItem,
  type ActionResult,
  type InventoryDetail,
  type InventoryFormInput,
  type InventoryManagementOptions,
} from "@/app/actions/inventory";

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

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resultMessage(result: ActionResult, successMessage: string): string {
  return result.success ? successMessage : result.message;
}

function money(value: string | null): string {
  if (value === null) return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parsed)
    : value;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("nl-NL");
}

function statusStyle(status: string) {
  if (["defect", "lost"].includes(status)) return { bg: "#FEF2F2", color: "#B91C1C" };
  if (["maintenance", "out_of_service"].includes(status)) return { bg: "#FFFBEB", color: "#B45309" };
  if (["available", "assigned_to_object", "assigned_to_personnel"].includes(status)) return { bg: "#ECFDF5", color: "#047857" };
  return { bg: "#F1F5F9", color: "#475569" };
}

function locationText(item: InventoryDetail): string {
  return item.currentObjectName ?? item.currentPersonnelName ?? item.currentLocationName ?? "Geen locatie";
}

export function InventoryDetailView({
  item,
  options,
  canWrite,
}: {
  item: InventoryDetail;
  options: InventoryManagementOptions;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const initialLocationType = useMemo(() => {
    if (item.currentObjectId) return "object";
    if (item.currentPersonnelId) return "personnel";
    if (item.currentStockLocationId) return "existing";
    return "none";
  }, [item.currentObjectId, item.currentPersonnelId, item.currentStockLocationId]);
  const [locationType, setLocationType] = useState(initialLocationType);
  const status = statusStyle(item.status);

  function run(action: () => Promise<ActionResult>, successMessage: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(resultMessage(result, successMessage));
      if (result.success) router.refresh();
    });
  }

  function buildInput(formData: FormData): InventoryFormInput {
    const categoryId = formString(formData, "categoryId");
    const selectedLocationType = formString(formData, "locationType") ?? "none";
    return {
      name: formString(formData, "name") ?? "",
      categoryId: categoryId === "__new" ? null : categoryId,
      categoryName: categoryId === "__new" ? formString(formData, "categoryName") : null,
      type: formString(formData, "type"),
      brand: formString(formData, "brand"),
      model: formString(formData, "model"),
      serialNumber: formString(formData, "serialNumber"),
      purchaseDate: formString(formData, "purchaseDate"),
      purchaseValue: formString(formData, "purchaseValue"),
      status: formString(formData, "status"),
      locationType: selectedLocationType,
      stockLocationId: selectedLocationType === "existing" ? formString(formData, "stockLocationId") : null,
      objectId: selectedLocationType === "object" ? formString(formData, "objectId") : null,
      personnelId: selectedLocationType === "personnel" ? formString(formData, "personnelId") : null,
      nextInspectionDate: formString(formData, "nextInspectionDate"),
      lastInspectionDate: formString(formData, "lastInspectionDate"),
      inspectionIntervalDays: formString(formData, "inspectionIntervalDays"),
      maintenanceIntervalDays: formString(formData, "maintenanceIntervalDays"),
      warrantyUntil: formString(formData, "warrantyUntil"),
      customerVisible: formData.get("customerVisible") === "on",
      notes: formString(formData, "notes"),
      movementReason: formString(formData, "movementReason"),
    };
  }

  function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => updateInventoryItem(item.id, buildInput(formData)), "Inventarisitem bijgewerkt.");
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 p-8">
      <Link href="/inventory" className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: "#64748B" }}>
        <ArrowLeft className="h-4 w-4" />
        Inventarisbeheer
      </Link>

      <div className="veele-card flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>{item.name}</h1>
            <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs" style={{ color: "#475569" }}>{item.code}</span>
            <span className="rounded px-2 py-1 text-xs font-semibold" style={{ backgroundColor: status.bg, color: status.color }}>
              {STATUS_LABELS[item.status] ?? item.status}
            </span>
            {item.archivedAt && <span className="rounded px-2 py-1 text-xs font-semibold" style={{ backgroundColor: "#FEF2F2", color: "#B91C1C" }}>Gearchiveerd</span>}
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm" style={{ color: "#64748B" }}>
            <MapPin className="h-3.5 w-3.5" />
            {locationText(item)}
          </p>
        </div>
        {canWrite && !item.archivedAt && (
          <button type="button" onClick={() => run(() => archiveInventoryItem(item.id), "Inventarisitem gearchiveerd.")} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-60" style={{ borderColor: "#FCD34D", color: "#B45309" }}>
            <Archive className="h-4 w-4" />
            Archiveer
          </button>
        )}
      </div>

      {message && <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: "#CBD5E1", color: "#334155" }}>{message}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Categorie" value={item.categoryName ?? "-"} />
            <Metric label="Locatie" value={locationText(item)} />
            <Metric label="Volgende keuring" value={formatDate(item.nextInspectionDate)} tone={item.nextInspectionDate ? "neutral" : "warn"} />
            <Metric label="Aanschafwaarde" value={money(item.purchaseValue)} />
          </div>

          <div className="veele-card overflow-hidden p-0">
            <div className="flex items-center gap-2 px-5 py-4">
              <ClipboardList className="h-4 w-4" style={{ color: "#0F766E" }} />
              <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>Locatiegeschiedenis</h2>
            </div>
            <div className="border-t" style={{ borderColor: "#E2E8F0" }}>
              {item.movements.length === 0 ? (
                <p className="px-5 py-6 text-sm" style={{ color: "#64748B" }}>Nog geen locatie- of statushistorie.</p>
              ) : (
                <div className="divide-y" style={{ borderColor: "#E2E8F0" }}>
                  {item.movements.map((movement) => (
                    <div key={movement.id} className="px-5 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium" style={{ color: "#081D3A" }}>{movement.movementType}</p>
                        <p className="text-xs" style={{ color: "#94A3B8" }}>{new Date(movement.createdAt).toLocaleString("nl-NL")}</p>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: "#64748B" }}>
                        {movement.fromLocationName ?? "-"} -&gt; {movement.toLocationName ?? "-"}
                        {movement.assignmentCode ? ` - opdracht ${movement.assignmentCode}` : ""}
                        {movement.reason ? ` - ${movement.reason}` : ""}
                      </p>
                      {movement.notes ? <p className="mt-1 text-xs" style={{ color: "#94A3B8" }}>{movement.notes}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="veele-card">
            <h2 className="font-heading mb-4 text-sm font-semibold" style={{ color: "#081D3A" }}>Details</h2>
            <dl className="space-y-3 text-sm">
              <Info label="Type" value={item.type ?? "-"} />
              <Info label="Merk/model" value={[item.brand, item.model].filter(Boolean).join(" / ") || "-"} />
              <Info label="Serienummer" value={item.serialNumber ?? "-"} />
              <Info label="Aanschafdatum" value={formatDate(item.purchaseDate)} />
              <Info label="Garantie tot" value={formatDate(item.warrantyUntil)} />
              <Info label="Laatste keuring" value={formatDate(item.lastInspectionDate)} />
              <Info label="Klantzichtbaar" value={item.customerVisible ? "Ja" : "Nee"} />
            </dl>
          </div>

          {canWrite && !item.archivedAt && (
            <form onSubmit={handleUpdate} className="veele-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4" style={{ color: "#0F766E" }} />
                <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>Bewerken</h2>
              </div>
              <input name="name" defaultValue={item.name} required className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              <div className="grid grid-cols-2 gap-3">
                <input name="type" defaultValue={item.type ?? ""} placeholder="Type" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
                <input name="serialNumber" defaultValue={item.serialNumber ?? ""} placeholder="Serienummer" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input name="brand" defaultValue={item.brand ?? ""} placeholder="Merk" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
                <input name="model" defaultValue={item.model ?? ""} placeholder="Model" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              </div>
              <select name="categoryId" defaultValue={item.categoryId ?? ""} className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
                <option value="">Geen categorie</option>
                {options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                <option value="__new">Nieuwe categorie</option>
              </select>
              <input name="categoryName" placeholder="Nieuwe categorie indien gekozen" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              <div className="grid grid-cols-2 gap-3">
                <input name="purchaseDate" type="date" defaultValue={item.purchaseDate ?? ""} className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
                <input name="purchaseValue" defaultValue={item.purchaseValue ?? ""} inputMode="decimal" placeholder="Aanschafwaarde" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select name="status" defaultValue={item.status} className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
                  {INVENTORY_STATUS_OPTIONS.filter((statusOption) => statusOption !== "archived").map((statusOption) => <option key={statusOption} value={statusOption}>{STATUS_LABELS[statusOption] ?? statusOption}</option>)}
                </select>
                <input name="nextInspectionDate" type="date" defaultValue={item.nextInspectionDate ?? ""} className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              </div>
              <label className="text-sm font-medium" style={{ color: "#334155" }}>
                Locatie
                <select name="locationType" value={locationType} onChange={(event) => setLocationType(event.target.value)} className="mt-1 h-10 w-full rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
                  <option value="none">Geen locatie</option>
                  <option value="object">Object</option>
                  <option value="personnel">Personeelslid</option>
                  <option value="existing">Bestaande locatie</option>
                </select>
              </label>
              {locationType === "object" && (
                <select name="objectId" defaultValue={item.currentObjectId ?? ""} required className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
                  <option value="">Kies object</option>
                  {options.objects.map((object) => <option key={object.id} value={object.id}>{object.label}{object.meta ? ` - ${object.meta}` : ""}</option>)}
                </select>
              )}
              {locationType === "personnel" && (
                <select name="personnelId" defaultValue={item.currentPersonnelId ?? ""} required className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
                  <option value="">Kies personeelslid</option>
                  {options.personnel.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}
                </select>
              )}
              {locationType === "existing" && (
                <select name="stockLocationId" defaultValue={item.currentStockLocationId ?? ""} required className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
                  <option value="">Kies locatie</option>
                  {options.stockLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              )}
              <div className="grid grid-cols-2 gap-3">
                <input name="lastInspectionDate" type="date" defaultValue={item.lastInspectionDate ?? ""} className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
                <input name="warrantyUntil" type="date" defaultValue={item.warrantyUntil ?? ""} className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input name="inspectionIntervalDays" defaultValue={item.inspectionIntervalDays ?? ""} inputMode="numeric" placeholder="Keuringsinterval dagen" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
                <input name="maintenanceIntervalDays" defaultValue={item.maintenanceIntervalDays ?? ""} inputMode="numeric" placeholder="Onderhoudsinterval dagen" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              </div>
              <input name="movementReason" placeholder="Reden locatie/status" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              <textarea name="notes" defaultValue={item.notes ?? ""} rows={3} placeholder="Notities" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "#CBD5E1" }} />
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: "#334155" }}>
                <input name="customerVisible" type="checkbox" defaultChecked={item.customerVisible} />
                Klantzichtbaar
              </label>
              <button type="submit" disabled={pending} className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: "#0F766E" }}>
                <PackageSearch className="h-4 w-4" />
                Opslaan
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warn" | "danger" }) {
  const color = tone === "danger" ? "#B91C1C" : tone === "warn" ? "#B45309" : "#081D3A";
  return (
    <div className="veele-card">
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#64748B" }}>{label}</p>
      <p className="mt-2 truncate text-lg font-semibold" style={{ color }}>{value}</p>
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

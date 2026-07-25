"use client";

import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import { SelectAdapter } from "@/components/ui/select-adapter";
import { FormEvent, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, MapPin, PackageSearch, Pencil, QrCode } from "lucide-react";
import {
  archiveInventoryItem,
  updateInventoryItem,
  type ActionResult,
  type InventoryDetail,
  type InventoryFormInput,
  type InventoryManagementOptions,
} from "@/app/actions/inventory";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  TenantDetailActionPanel,
  TenantDetailHeader,
  TenantDetailLayout,
  TenantDetailSectionNav,
  TenantPageShell,
  TenantWorkbenchPanel,
} from "@/components/tenant-ui";

const INVENTORY_STATUS_OPTIONS = [
  "available",
  "in_use",
  "assigned_to_object",
  "assigned_to_personnel",
  "maintenance",
  "defect",
  "out_of_service",
  "lost",
  "disposed",
  "archived",
] as const;

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
    ? new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
      }).format(parsed)
    : value;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("nl-NL");
}

function statusStyle(status: string) {
  if (["defect", "lost"].includes(status))
    return { bg: "#FEF2F2", color: "#B91C1C" };
  if (["maintenance", "out_of_service"].includes(status))
    return { bg: "#FFFBEB", color: "#B45309" };
  if (
    ["available", "assigned_to_object", "assigned_to_personnel"].includes(
      status,
    )
  )
    return { bg: "#ECFDF5", color: "#047857" };
  return { bg: "#F1F5F9", color: "#475569" };
}

function locationText(item: InventoryDetail): string {
  return (
    item.currentObjectName ??
    item.currentPersonnelName ??
    item.currentLocationName ??
    "Geen locatie"
  );
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
  }, [
    item.currentObjectId,
    item.currentPersonnelId,
    item.currentStockLocationId,
  ]);
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
      categoryName:
        categoryId === "__new" ? formString(formData, "categoryName") : null,
      type: formString(formData, "type"),
      brand: formString(formData, "brand"),
      model: formString(formData, "model"),
      serialNumber: formString(formData, "serialNumber"),
      purchaseDate: formString(formData, "purchaseDate"),
      purchaseValue: formString(formData, "purchaseValue"),
      status: formString(formData, "status"),
      locationType: selectedLocationType,
      stockLocationId:
        selectedLocationType === "existing"
          ? formString(formData, "stockLocationId")
          : null,
      objectId:
        selectedLocationType === "object"
          ? formString(formData, "objectId")
          : null,
      personnelId:
        selectedLocationType === "personnel"
          ? formString(formData, "personnelId")
          : null,
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
    run(
      () => updateInventoryItem(item.id, buildInput(formData)),
      "Inventarisitem bijgewerkt.",
    );
  }

  const badges = (
    <>
      <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">
        {item.code}
      </span>
      <span
        className="rounded px-2 py-1 text-xs font-semibold"
        style={{ backgroundColor: status.bg, color: status.color }}
      >
        {STATUS_LABELS[item.status] ?? item.status}
      </span>
      {item.archivedAt && (
        <span className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
          Gearchiveerd
        </span>
      )}
    </>
  );

  const actions = (
    <>
      <Button type="button" variant="outline" asChild>
        <Link href={`/inventory/${item.id}/qr`}>
          <QrCode className="h-4 w-4" />
          QR-label
        </Link>
      </Button>
      {canWrite && !item.archivedAt ? (
        <>
          <EditInventorySheet
            item={item}
            locationType={locationType}
            options={options}
            pending={pending}
            onLocationTypeChange={setLocationType}
            onSubmit={handleUpdate}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => archiveInventoryItem(item.id),
                "Inventarisitem gearchiveerd.",
              )
            }
            className="text-amber-700"
          >
            <Archive className="h-4 w-4" />
            Archiveer
          </Button>
        </>
      ) : null}
    </>
  );

  return (
    <TenantPageShell size="wide">
      <TenantDetailHeader
        backHref="/inventory"
        backLabel="Inventarisbeheer"
        title={item.name}
        description={
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {locationText(item)}
          </span>
        }
        badges={badges}
        actions={actions}
        meta={[
          { label: "Categorie", value: item.categoryName ?? "-" },
          {
            label: "Klantzichtbaar",
            value: item.customerVisible ? "Ja" : "Nee",
          },
        ]}
      />

      <TenantDetailSectionNav
        items={[
          { label: "Overzicht", href: "#overzicht", active: true },
          {
            label: "Tijdlijn",
            href: "#tijdlijn",
            count: item.movements.length,
          },
          { label: "Details", href: "#details" },
          { label: "Acties", href: "#acties" },
        ]}
      />

      {message && (
        <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      )}

      <TenantDetailLayout
        aside={
          <TenantDetailActionPanel
            id="acties"
            title="Inventarisacties"
            description="Bewerk status, locatie, keuring, onderhoud en dossierinstellingen."
          >
            <TenantWorkbenchPanel id="details" title="Details">
              <dl className="space-y-3 px-4 py-4 text-sm">
                <Info label="Type" value={item.type ?? "-"} />
                <Info
                  label="Merk/model"
                  value={
                    [item.brand, item.model].filter(Boolean).join(" / ") || "-"
                  }
                />
                <Info label="Serienummer" value={item.serialNumber ?? "-"} />
                <Info
                  label="Aanschafdatum"
                  value={formatDate(item.purchaseDate)}
                />
                <Info
                  label="Garantie tot"
                  value={formatDate(item.warrantyUntil)}
                />
                <Info
                  label="Laatste keuring"
                  value={formatDate(item.lastInspectionDate)}
                />
              </dl>
            </TenantWorkbenchPanel>
          </TenantDetailActionPanel>
        }
      >
        <div className="flex flex-col gap-6">
          <section id="overzicht" className="grid gap-4 md:grid-cols-4">
            <Metric label="Categorie" value={item.categoryName ?? "-"} />
            <Metric label="Locatie" value={locationText(item)} />
            <Metric
              label="Volgende keuring"
              value={formatDate(item.nextInspectionDate)}
              tone={item.nextInspectionDate ? "neutral" : "warn"}
            />
            <Metric label="Aanschafwaarde" value={money(item.purchaseValue)} />
          </section>

          <TenantWorkbenchPanel
            id="tijdlijn"
            title="Locatiegeschiedenis"
            description="Laatste locatie- en statusbewegingen voor dit inventarisitem."
          >
            {item.movements.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Nog geen locatie- of statushistorie.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {item.movements.map((movement) => (
                  <div key={movement.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">
                        {movement.movementType}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(movement.createdAt).toLocaleString("nl-NL")}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {movement.fromLocationName ?? "-"} -&gt;{" "}
                      {movement.toLocationName ?? "-"}
                      {movement.assignmentCode
                        ? ` - opdracht ${movement.assignmentCode}`
                        : ""}
                      {movement.reason ? ` - ${movement.reason}` : ""}
                    </p>
                    {movement.notes ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {movement.notes}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </TenantWorkbenchPanel>
        </div>
      </TenantDetailLayout>
    </TenantPageShell>
  );
}

function EditInventorySheet({
  item,
  locationType,
  options,
  pending,
  onLocationTypeChange,
  onSubmit,
}: {
  item: InventoryDetail;
  locationType: string;
  options: InventoryManagementOptions;
  pending: boolean;
  onLocationTypeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button">
          <Pencil className="h-4 w-4" />
          Bewerken
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Inventarisitem bewerken</SheetTitle>
          <SheetDescription>
            Werk status, locatie, keuring en onderhoudsgegevens bij.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <input
            name="name"
            defaultValue={item.name}
            required
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="type"
              defaultValue={item.type ?? ""}
              placeholder="Type"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
            <input
              name="serialNumber"
              defaultValue={item.serialNumber ?? ""}
              placeholder="Serienummer"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="brand"
              defaultValue={item.brand ?? ""}
              placeholder="Merk"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
            <input
              name="model"
              defaultValue={item.model ?? ""}
              placeholder="Model"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
          </div>
          <SelectAdapter
            name="categoryId"
            defaultValue={item.categoryId ?? ""}
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          >
            <option value="">Geen categorie</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
            <option value="__new">Nieuwe categorie</option>
          </SelectAdapter>
          <input
            name="categoryName"
            placeholder="Nieuwe categorie indien gekozen"
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="purchaseDate"
              type="date"
              defaultValue={item.purchaseDate ?? ""}
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
            <input
              name="purchaseValue"
              defaultValue={item.purchaseValue ?? ""}
              inputMode="decimal"
              placeholder="Aanschafwaarde"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectAdapter
              name="status"
              defaultValue={item.status}
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            >
              {INVENTORY_STATUS_OPTIONS.filter(
                (statusOption) => statusOption !== "archived",
              ).map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {STATUS_LABELS[statusOption] ?? statusOption}
                </option>
              ))}
            </SelectAdapter>
            <input
              name="nextInspectionDate"
              type="date"
              defaultValue={item.nextInspectionDate ?? ""}
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
          </div>
          <label className="text-sm font-medium" style={{ color: "#334155" }}>
            Locatie
            <SelectAdapter
              name="locationType"
              value={locationType}
              onChange={(event) => onLocationTypeChange(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            >
              <option value="none">Geen locatie</option>
              <option value="object">Object</option>
              <option value="personnel">Personeelslid</option>
              <option value="existing">Bestaande locatie</option>
            </SelectAdapter>
          </label>
          {locationType === "object" && (
            <SelectAdapter
              name="objectId"
              defaultValue={item.currentObjectId ?? ""}
              required
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            >
              <option value="">Kies object</option>
              {options.objects.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.label}
                  {object.meta ? ` - ${object.meta}` : ""}
                </option>
              ))}
            </SelectAdapter>
          )}
          {locationType === "personnel" && (
            <SelectAdapter
              name="personnelId"
              defaultValue={item.currentPersonnelId ?? ""}
              required
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            >
              <option value="">Kies personeelslid</option>
              {options.personnel.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </SelectAdapter>
          )}
          {locationType === "existing" && (
            <SelectAdapter
              name="stockLocationId"
              defaultValue={item.currentStockLocationId ?? ""}
              required
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            >
              <option value="">Kies locatie</option>
              {options.stockLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </SelectAdapter>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="lastInspectionDate"
              type="date"
              defaultValue={item.lastInspectionDate ?? ""}
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
            <input
              name="warrantyUntil"
              type="date"
              defaultValue={item.warrantyUntil ?? ""}
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="inspectionIntervalDays"
              defaultValue={item.inspectionIntervalDays ?? ""}
              inputMode="numeric"
              placeholder="Keuringsinterval dagen"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
            <input
              name="maintenanceIntervalDays"
              defaultValue={item.maintenanceIntervalDays ?? ""}
              inputMode="numeric"
              placeholder="Onderhoudsinterval dagen"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
          </div>
          <input
            name="movementReason"
            placeholder="Reden locatie/status"
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <textarea
            name="notes"
            defaultValue={item.notes ?? ""}
            rows={3}
            placeholder="Notities"
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <label
            className="inline-flex items-center gap-2 text-sm"
            style={{ color: "#334155" }}
          >
            <CheckboxAdapter
              name="customerVisible"
              type="checkbox"
              defaultChecked={item.customerVisible}
            />
            Klantzichtbaar
          </label>
          <Button type="submit" disabled={pending}>
            <PackageSearch className="h-4 w-4" />
            Opslaan
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warn" | "danger";
}) {
  const color =
    tone === "danger" ? "#B91C1C" : tone === "warn" ? "#B45309" : "#081D3A";
  return (
    <div className="veele-card">
      <p
        className="text-xs font-medium uppercase tracking-wider"
        style={{ color: "#64748B" }}
      >
        {label}
      </p>
      <p className="mt-2 truncate text-lg font-semibold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

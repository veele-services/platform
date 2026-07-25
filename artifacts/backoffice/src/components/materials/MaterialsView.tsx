"use client";

import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import { SelectAdapter } from "@/components/ui/select-adapter";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  ArrowRightLeft,
  Boxes,
  PackagePlus,
  Plus,
  Search,
} from "lucide-react";
import {
  archiveMaterial,
  createMaterial,
  recordMaterialStockMovement,
  type ActionResult,
  type MaterialManagementOptions,
  type MaterialRow,
  type MaterialStockMovementInput,
} from "@/app/actions/materials";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const PAGE_SIZE = 25;

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatNumber(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 }).format(
        parsed,
      )
    : value;
}

function stockStatus(row: MaterialRow) {
  if (row.negativeLocationsCount > 0) {
    return { label: "Negatief", bg: "#FEF2F2", color: "#B91C1C", icon: true };
  }
  if (row.lowLocationsCount > 0) {
    return { label: "Laag", bg: "#FFFBEB", color: "#B45309", icon: true };
  }
  return { label: "Voldoende", bg: "#ECFDF5", color: "#047857", icon: false };
}

function resultMessage(
  result: ActionResult<unknown>,
  successMessage: string,
): string {
  return result.success ? successMessage : result.message;
}

export function MaterialsView({
  rows,
  total,
  options,
  canWrite,
  canAdjust,
  page,
  initialSearch,
  initialStatus,
  initialCategoryId,
}: {
  rows: MaterialRow[];
  total: number;
  options: MaterialManagementOptions;
  canWrite: boolean;
  canAdjust: boolean;
  page: number;
  initialSearch: string;
  initialStatus: string;
  initialCategoryId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [stockType, setStockType] =
    useState<MaterialStockMovementInput["movementType"]>("received");
  const [targetType, setTargetType] = useState("object");
  const [searchInput, setSearchInput] = useState(initialSearch);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeRows = useMemo(
    () => rows.filter((row) => !row.archivedAt && row.isActive),
    [rows],
  );

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      search: initialSearch || undefined,
      status: initialStatus !== "active" ? initialStatus : undefined,
      categoryId: initialCategoryId || undefined,
      page: page > 1 ? String(page) : undefined,
      ...overrides,
    };
    Object.entries(merged).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function applyFilters(overrides: Record<string, string | undefined>) {
    router.replace(buildUrl({ ...overrides, page: undefined }));
  }

  function run(
    action: () => Promise<ActionResult<unknown>>,
    successMessage: string,
  ) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(resultMessage(result, successMessage));
      if (result.success) router.refresh();
    });
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters({ search: searchInput || undefined });
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const categoryId = formString(formData, "categoryId");
    run(
      () =>
        createMaterial({
          name: formString(formData, "name") ?? "",
          unit: formString(formData, "unit") ?? "",
          categoryId: categoryId === "__new" ? null : categoryId,
          categoryName:
            categoryId === "__new"
              ? formString(formData, "categoryName")
              : null,
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
      "Materiaal aangemaakt.",
    );
    form.reset();
  }

  function handleStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const movementType = (formString(formData, "movementType") ??
      "received") as MaterialStockMovementInput["movementType"];
    const input: MaterialStockMovementInput = {
      materialId: formString(formData, "materialId") ?? "",
      movementType,
      quantity: formString(formData, "quantity") ?? "",
      reason: formString(formData, "reason"),
      notes: formString(formData, "notes"),
      fromStockLocationId:
        movementType === "transferred"
          ? formString(formData, "fromStockLocationId")
          : null,
      toStockLocationId:
        targetType === "existing"
          ? formString(formData, "toStockLocationId")
          : null,
      toObjectId:
        targetType === "object" ? formString(formData, "toObjectId") : null,
      toPersonnelId:
        targetType === "personnel"
          ? formString(formData, "toPersonnelId")
          : null,
    };

    run(
      () => recordMaterialStockMovement(input),
      "Voorraadmutatie opgeslagen.",
    );
    form.reset();
    setStockType("received");
    setTargetType("object");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={handleSearch}
          className="flex min-w-[280px] flex-1 items-center gap-2"
        >
          <div className="relative max-w-md flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "#94A3B8" }}
            />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Zoek op naam, code of barcode"
              className="h-10 w-full rounded-md border bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-500"
              style={{ borderColor: "#CBD5E1", color: "var(--color-foreground)" }}
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "#0F766E" }}
            disabled={pending}
          >
            <Search className="h-4 w-4" />
            Zoeken
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <SelectAdapter
            value={initialCategoryId || ""}
            onChange={(event) =>
              applyFilters({ categoryId: event.target.value || undefined })
            }
            className="h-10 rounded-md border bg-white px-3 text-sm"
            style={{ borderColor: "#CBD5E1", color: "var(--color-foreground)" }}
          >
            <option value="">Alle categorieen</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectAdapter>
          <SelectAdapter
            value={initialStatus}
            onChange={(event) =>
              applyFilters({
                status:
                  event.target.value === "active"
                    ? undefined
                    : event.target.value,
              })
            }
            className="h-10 rounded-md border bg-white px-3 text-sm"
            style={{ borderColor: "#CBD5E1", color: "var(--color-foreground)" }}
          >
            <option value="active">Actief</option>
            <option value="inactive">Inactief</option>
            <option value="archived">Gearchiveerd</option>
          </SelectAdapter>
          {canAdjust && (
            <StockMovementSheet
              activeRows={activeRows}
              options={options}
              pending={pending}
              stockType={stockType}
              targetType={targetType}
              onStockTypeChange={setStockType}
              onTargetTypeChange={setTargetType}
              onSubmit={handleStock}
            />
          )}
          {canWrite && (
            <CreateMaterialSheet
              options={options}
              pending={pending}
              onSubmit={handleCreate}
            />
          )}
        </div>
      </div>

      {message && (
        <div
          className="rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: "#CBD5E1", color: "#334155" }}
        >
          {message}
        </div>
      )}

      <div className="veele-card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2
              className="font-heading text-base font-semibold"
              style={{ color: "var(--color-foreground)" }}
            >
              Materiaalcatalogus
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: "#64748B" }}>
              {total} product{total === 1 ? "" : "en"}
            </p>
          </div>
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "#64748B" }}
          >
            Pagina {page} van {totalPages}
          </div>
        </div>

        <div
          className="overflow-x-auto border-t"
          style={{ borderColor: "#E2E8F0" }}
        >
          <table className="w-full min-w-[980px] text-sm">
            <thead style={{ backgroundColor: "#F8FAFC" }}>
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  Code
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  Materiaal
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  Categorie
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  Voorraad
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  Status
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  Acties
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "#E2E8F0" }}>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center"
                    style={{ color: "#64748B" }}
                  >
                    Geen materialen gevonden.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const status = stockStatus(row);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td
                        className="px-4 py-3 font-mono text-xs"
                        style={{ color: "#475569" }}
                      >
                        {row.code}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium" style={{ color: "var(--color-foreground)" }}>
                          {row.name}
                        </p>
                        <p className="text-xs" style={{ color: "#64748B" }}>
                          {row.unit}
                          {row.defaultInvoiceable
                            ? " - standaard factureerbaar"
                            : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3" style={{ color: "#475569" }}>
                        {row.categoryName ?? "-"}
                      </td>
                      <td
                        className="px-4 py-3 text-right font-medium"
                        style={{
                          color:
                            row.negativeLocationsCount > 0
                              ? "#B91C1C"
                              : "var(--color-foreground)",
                        }}
                      >
                        {formatNumber(row.totalStock)} {row.unit}
                        <p
                          className="text-xs font-normal"
                          style={{ color: "#94A3B8" }}
                        >
                          {row.locationsCount} locatie
                          {row.locationsCount === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold"
                          style={{
                            backgroundColor: status.bg,
                            color: status.color,
                          }}
                        >
                          {status.icon && (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          )}
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/materials/${row.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                            style={{ color: "#0F766E" }}
                          >
                            Openen
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                          {canWrite && !row.archivedAt && (
                            <button
                              type="button"
                              onClick={() =>
                                run(
                                  () => archiveMaterial(row.id),
                                  "Materiaal gearchiveerd.",
                                )
                              }
                              className="inline-flex items-center gap-1 text-xs font-medium hover:underline disabled:opacity-60"
                              style={{ color: "#B45309" }}
                              disabled={pending}
                            >
                              <Archive className="h-3.5 w-3.5" />
                              Archiveer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div
          className="flex items-center justify-between border-t px-5 py-4"
          style={{ borderColor: "#E2E8F0" }}
        >
          <Link
            href={buildUrl({ page: page > 2 ? String(page - 1) : undefined })}
            className="rounded-md border px-3 py-1.5 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40"
            style={{ borderColor: "#CBD5E1", color: "#334155" }}
            aria-disabled={page <= 1}
          >
            Vorige
          </Link>
          <Link
            href={buildUrl({
              page: page < totalPages ? String(page + 1) : undefined,
            })}
            className="rounded-md border px-3 py-1.5 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40"
            style={{ borderColor: "#CBD5E1", color: "#334155" }}
            aria-disabled={page >= totalPages}
          >
            Volgende
          </Link>
        </div>
      </div>
    </div>
  );
}

function CreateMaterialSheet({
  options,
  pending,
  onSubmit,
}: {
  options: MaterialManagementOptions;
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button">
          <Plus className="h-4 w-4" />
          Nieuw materiaal
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Nieuw materiaal</SheetTitle>
          <SheetDescription>
            Voeg catalogusgegevens, prijzen en voorraadgrenzen toe.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="text-sm font-medium" style={{ color: "#334155" }}>
            Naam
            <input
              name="name"
              required
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium" style={{ color: "#334155" }}>
              Eenheid
              <input
                name="unit"
                required
                placeholder="stuks"
                className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
                style={{ borderColor: "#CBD5E1" }}
              />
            </label>
            <label className="text-sm font-medium" style={{ color: "#334155" }}>
              BTW %
              <input
                name="vatRate"
                inputMode="decimal"
                placeholder="21"
                className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
                style={{ borderColor: "#CBD5E1" }}
              />
            </label>
          </div>
          <label className="text-sm font-medium" style={{ color: "#334155" }}>
            Categorie
            <SelectAdapter
              name="categoryId"
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
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
          </label>
          <input
            name="categoryName"
            placeholder="Nieuwe categorie indien gekozen"
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="costPrice"
              inputMode="decimal"
              placeholder="Kostprijs"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
            <input
              name="salePrice"
              inputMode="decimal"
              placeholder="Verkoopprijs"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="minStock"
              inputMode="decimal"
              placeholder="Minimumvoorraad"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
            <input
              name="maxStock"
              inputMode="decimal"
              placeholder="Maximumvoorraad"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
          </div>
          <input
            name="barcode"
            placeholder="Barcode / QR optioneel"
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <textarea
            name="description"
            rows={3}
            placeholder="Omschrijving"
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <label
            className="inline-flex items-center gap-2 text-sm"
            style={{ color: "#334155" }}
          >
            <CheckboxAdapter name="defaultInvoiceable" type="checkbox" />
            Standaard factureerbaar
          </label>
          <Button type="submit" disabled={pending}>
            <PackagePlus className="h-4 w-4" />
            Materiaal aanmaken
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function StockMovementSheet({
  activeRows,
  options,
  pending,
  stockType,
  targetType,
  onStockTypeChange,
  onTargetTypeChange,
  onSubmit,
}: {
  activeRows: MaterialRow[];
  options: MaterialManagementOptions;
  pending: boolean;
  stockType: MaterialStockMovementInput["movementType"];
  targetType: string;
  onStockTypeChange: (
    value: MaterialStockMovementInput["movementType"],
  ) => void;
  onTargetTypeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline">
          <ArrowRightLeft className="h-4 w-4" />
          Voorraadmutatie
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Voorraadmutatie</SheetTitle>
          <SheetDescription>
            Ontvang, corrigeer of verplaats materiaalvoorraad.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="text-sm font-medium" style={{ color: "#334155" }}>
            Materiaal
            <SelectAdapter
              name="materialId"
              required
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            >
              <option value="">Kies materiaal</option>
              {activeRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} - {row.name}
                </option>
              ))}
            </SelectAdapter>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium" style={{ color: "#334155" }}>
              Type
              <SelectAdapter
                name="movementType"
                value={stockType}
                onChange={(event) =>
                  onStockTypeChange(
                    event.target
                      .value as MaterialStockMovementInput["movementType"],
                  )
                }
                className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
                style={{ borderColor: "#CBD5E1" }}
              >
                <option value="received">Ontvangen</option>
                <option value="corrected">Corrigeren</option>
                <option value="transferred">Verplaatsen</option>
              </SelectAdapter>
            </label>
            <label className="text-sm font-medium" style={{ color: "#334155" }}>
              Aantal
              <input
                name="quantity"
                required
                inputMode="decimal"
                placeholder={
                  stockType === "corrected" ? "Bijv. -2 of 5" : "Bijv. 10"
                }
                className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
                style={{ borderColor: "#CBD5E1" }}
              />
            </label>
          </div>
          {stockType === "transferred" && (
            <label className="text-sm font-medium" style={{ color: "#334155" }}>
              Bronlocatie
              <SelectAdapter
                name="fromStockLocationId"
                required
                className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
                style={{ borderColor: "#CBD5E1" }}
              >
                <option value="">Kies bronlocatie</option>
                {options.stockLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </SelectAdapter>
            </label>
          )}
          <label className="text-sm font-medium" style={{ color: "#334155" }}>
            Doeltype
            <SelectAdapter
              value={targetType}
              onChange={(event) => onTargetTypeChange(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            >
              <option value="object">Object</option>
              <option value="personnel">Personeel</option>
              <option value="existing">Bestaande voorraadlocatie</option>
            </SelectAdapter>
          </label>
          {targetType === "object" && (
            <SelectAdapter
              name="toObjectId"
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
          {targetType === "personnel" && (
            <SelectAdapter
              name="toPersonnelId"
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
          {targetType === "existing" && (
            <SelectAdapter
              name="toStockLocationId"
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
          <input
            name="reason"
            placeholder="Reden"
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <textarea
            name="notes"
            rows={2}
            placeholder="Notitie"
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <Button type="submit" disabled={pending}>
            <Boxes className="h-4 w-4" />
            Mutatie opslaan
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

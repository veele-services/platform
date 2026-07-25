"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import {
  Archive,
  ArrowRight,
  PackageSearch,
  Plus,
  QrCode,
  Search,
} from "lucide-react";
import {
  archiveInventoryItem,
  createInventoryItem,
  type ActionResult,
  type InventoryFormInput,
  type InventoryManagementOptions,
  type InventoryRow,
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

const PAGE_SIZE = 25;
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
  active: "Actief",
  inactive: "Inactief",
  archived: "Gearchiveerd",
  available: "Beschikbaar",
  in_use: "In gebruik",
  assigned_to_object: "Bij object",
  assigned_to_personnel: "Bij personeel",
  maintenance: "Onderhoud",
  defect: "Defect",
  out_of_service: "Buiten gebruik",
  lost: "Kwijt",
  disposed: "Afgevoerd",
};

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resultMessage(result: ActionResult<unknown>, successMessage: string): string {
  return result.success ? successMessage : result.message;
}

function statusBadge(status: string) {
  if (["defect", "lost"].includes(status)) return { bg: "#FEF2F2", color: "#B91C1C" };
  if (["maintenance", "out_of_service"].includes(status)) return { bg: "#FFFBEB", color: "#B45309" };
  if (["available", "assigned_to_object", "assigned_to_personnel"].includes(status)) return { bg: "#ECFDF5", color: "#047857" };
  return { bg: "#F1F5F9", color: "#475569" };
}

function locationLabel(row: InventoryRow): string {
  return row.currentObjectName ?? row.currentPersonnelName ?? row.currentLocationName ?? "Geen locatie";
}

function itemMeta(row: InventoryRow): string {
  return [row.categoryName, row.type, row.brand, row.model].filter(Boolean).join(" - ") || "Geen categorie";
}

export function InventoryView({
  rows,
  total,
  options,
  canWrite,
  page,
  initialSearch,
  initialStatus,
  initialCategoryId,
}: {
  rows: InventoryRow[];
  total: number;
  options: InventoryManagementOptions;
  canWrite: boolean;
  page: number;
  initialSearch: string;
  initialStatus: string;
  initialCategoryId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [locationType, setLocationType] = useState("none");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string) {
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
      inspectionIntervalDays: formString(formData, "inspectionIntervalDays"),
      maintenanceIntervalDays: formString(formData, "maintenanceIntervalDays"),
      warrantyUntil: formString(formData, "warrantyUntil"),
      customerVisible: formData.get("customerVisible") === "on",
      notes: formString(formData, "notes"),
      movementReason: formString(formData, "movementReason"),
    };
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    run(() => createInventoryItem(buildInput(formData)), "Inventarisitem aangemaakt.");
    form.reset();
    setLocationType("none");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={handleSearch} className="flex min-w-[280px] flex-1 items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#94A3B8" }} />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Zoek op naam, code of serienummer"
              className="h-10 w-full rounded-md border bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-500"
              style={{ borderColor: "#CBD5E1", color: "#081D3A" }}
            />
          </div>
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: "#0F766E" }} disabled={pending}>
            <Search className="h-4 w-4" />
            Zoeken
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <select value={initialCategoryId || ""} onChange={(event) => applyFilters({ categoryId: event.target.value || undefined })} className="h-10 rounded-md border bg-white px-3 text-sm" style={{ borderColor: "#CBD5E1", color: "#081D3A" }}>
            <option value="">Alle categorieen</option>
            {options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select value={initialStatus} onChange={(event) => applyFilters({ status: event.target.value === "active" ? undefined : event.target.value })} className="h-10 rounded-md border bg-white px-3 text-sm" style={{ borderColor: "#CBD5E1", color: "#081D3A" }}>
            <option value="active">Actief</option>
            <option value="inactive">Inactief</option>
            <option value="archived">Gearchiveerd</option>
            {INVENTORY_STATUS_OPTIONS.filter((status) => status !== "archived").map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status] ?? status}</option>
            ))}
          </select>
          {canWrite && (
            <CreateInventorySheet
              locationType={locationType}
              options={options}
              pending={pending}
              onLocationTypeChange={setLocationType}
              onSubmit={handleCreate}
            />
          )}
        </div>
      </div>

      {message && <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: "#CBD5E1", color: "#334155" }}>{message}</div>}

      <div className="veele-card overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>Inventarisregister</h2>
              <p className="mt-0.5 text-sm" style={{ color: "#64748B" }}>{total} item{total === 1 ? "" : "s"}</p>
            </div>
            <div className="text-xs" style={{ color: "#64748B" }}>Pagina {page} van {totalPages}</div>
          </div>

          <div className="overflow-x-auto border-t" style={{ borderColor: "#E2E8F0" }}>
            <table className="w-full min-w-[1050px] text-sm">
              <thead style={{ backgroundColor: "#F8FAFC" }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Inventaris</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Locatie</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Keuring</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "#E2E8F0" }}>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: "#64748B" }}>Geen inventaris gevonden.</td></tr>
                ) : rows.map((row) => {
                  const badge = statusBadge(row.status);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "#475569" }}>{row.code}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium" style={{ color: "#081D3A" }}>{row.name}</p>
                        <p className="text-xs" style={{ color: "#64748B" }}>{itemMeta(row)}</p>
                        {row.serialNumber ? <p className="font-mono text-xs" style={{ color: "#94A3B8" }}>{row.serialNumber}</p> : null}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#475569" }}>{locationLabel(row)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: badge.bg, color: badge.color }}>
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: "#475569" }}>{row.nextInspectionDate ? new Date(`${row.nextInspectionDate}T00:00:00`).toLocaleDateString("nl-NL") : "-"}</td>
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
                          {canWrite && !row.archivedAt && (
                            <button type="button" onClick={() => run(() => archiveInventoryItem(row.id), "Inventarisitem gearchiveerd.")} disabled={pending} className="inline-flex items-center gap-1 text-xs font-medium hover:underline disabled:opacity-60" style={{ color: "#B45309" }}>
                              <Archive className="h-3.5 w-3.5" />
                              Archiveer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t px-5 py-4" style={{ borderColor: "#E2E8F0" }}>
            <Link href={buildUrl({ page: page > 2 ? String(page - 1) : undefined })} className="rounded-md border px-3 py-1.5 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40" style={{ borderColor: "#CBD5E1", color: "#334155" }} aria-disabled={page <= 1}>Vorige</Link>
            <Link href={buildUrl({ page: page < totalPages ? String(page + 1) : undefined })} className="rounded-md border px-3 py-1.5 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40" style={{ borderColor: "#CBD5E1", color: "#334155" }} aria-disabled={page >= totalPages}>Volgende</Link>
          </div>
      </div>
    </div>
  );
}

function CreateInventorySheet({
  locationType,
  options,
  pending,
  onLocationTypeChange,
  onSubmit,
}: {
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
          <Plus className="h-4 w-4" />
          Nieuw item
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Nieuw inventarisitem</SheetTitle>
          <SheetDescription>Registreer locatie, status, keuring en dossierinformatie.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <input name="name" required placeholder="Naam" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="type" placeholder="Type" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
            <input name="serialNumber" placeholder="Serienummer" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="brand" placeholder="Merk" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
            <input name="model" placeholder="Model" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
          </div>
          <label className="text-sm font-medium" style={{ color: "#334155" }}>
            Categorie
            <select name="categoryId" className="mt-1 h-10 w-full rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
              <option value="">Geen categorie</option>
              {options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              <option value="__new">Nieuwe categorie</option>
            </select>
          </label>
          <input name="categoryName" placeholder="Nieuwe categorie indien gekozen" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="purchaseDate" type="date" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
            <input name="purchaseValue" inputMode="decimal" placeholder="Aanschafwaarde" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select name="status" defaultValue="available" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
              {INVENTORY_STATUS_OPTIONS.filter((status) => status !== "archived").map((status) => <option key={status} value={status}>{STATUS_LABELS[status] ?? status}</option>)}
            </select>
            <input name="nextInspectionDate" type="date" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
          </div>
          <label className="text-sm font-medium" style={{ color: "#334155" }}>
            Locatie
            <select name="locationType" value={locationType} onChange={(event) => onLocationTypeChange(event.target.value)} className="mt-1 h-10 w-full rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
              <option value="none">Geen locatie</option>
              <option value="object">Object</option>
              <option value="personnel">Personeelslid</option>
              <option value="existing">Bestaande locatie</option>
            </select>
          </label>
          {locationType === "object" && (
            <select name="objectId" required className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
              <option value="">Kies object</option>
              {options.objects.map((object) => <option key={object.id} value={object.id}>{object.label}{object.meta ? ` - ${object.meta}` : ""}</option>)}
            </select>
          )}
          {locationType === "personnel" && (
            <select name="personnelId" required className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
              <option value="">Kies personeelslid</option>
              {options.personnel.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}
            </select>
          )}
          {locationType === "existing" && (
            <select name="stockLocationId" required className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
              <option value="">Kies locatie</option>
              {options.stockLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="inspectionIntervalDays" inputMode="numeric" placeholder="Keuringsinterval dagen" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
            <input name="maintenanceIntervalDays" inputMode="numeric" placeholder="Onderhoudsinterval dagen" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
          </div>
          <input name="warrantyUntil" type="date" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
          <input name="movementReason" placeholder="Reden locatie/status" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
          <textarea name="notes" rows={3} placeholder="Notities" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "#CBD5E1" }} />
          <label className="inline-flex items-center gap-2 text-sm" style={{ color: "#334155" }}>
            <input name="customerVisible" type="checkbox" />
            Klantzichtbaar
          </label>
          <Button type="submit" disabled={pending}>
            <PackageSearch className="h-4 w-4" />
            Inventaris aanmaken
          </Button>
          <p className="text-xs" style={{ color: "#64748B" }}>Code wordt automatisch als I000001 per tenant gegenereerd.</p>
        </form>
      </SheetContent>
    </Sheet>
  );
}

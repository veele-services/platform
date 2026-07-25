"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Pencil,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  XCircle,
} from "lucide-react";

import {
  deleteTaskCode,
  setTaskCodeStatus,
  type RoleOption,
  type SectorOption,
  type TaskCodeRow,
} from "@/app/actions/task-codes";
import { TaskCodeForm } from "@/components/task-codes/TaskCodeForm";
import {
  TenantActionMenu,
  TenantActiveFilters,
  TenantConfirmDialog,
  TenantFilterDrawer,
  TenantToolbar,
  TenantToolbarSearch,
} from "@/components/tenant-ui";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";

const PAGE_SIZE = 25;

function SortHeader({
  label,
  columnKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  columnKey: string;
  currentSort: string;
  currentDir: string;
  onSort: (key: string) => void;
}) {
  const active = currentSort === columnKey;
  return (
    <th className="px-4 py-3 text-left">
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors hover:opacity-80"
        style={{ color: active ? "#00B7B3" : "#64748B" }}
      >
        {label}
        {active ? (
          currentDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function formatPrice(price: string | null): string {
  if (!price) return "-";
  const value = Number.parseFloat(price);
  if (Number.isNaN(value)) return "-";
  return `EUR ${value.toFixed(2)}`;
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return "-";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

interface TaskCodesViewProps {
  rows: TaskCodeRow[];
  total: number;
  sectors: SectorOption[];
  roles: RoleOption[];
  canWrite: boolean;
  page: number;
  initialSearch: string;
  initialSectorId: string;
  initialInvoice: string;
  initialStatus: string;
  initialSort: string;
  initialDir: string;
}

export function TaskCodesView({
  rows,
  total,
  sectors,
  roles,
  canWrite,
  page,
  initialSearch,
  initialSectorId,
  initialInvoice,
  initialStatus,
  initialSort,
  initialDir,
}: TaskCodesViewProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      search: initialSearch || undefined,
      sectorId: initialSectorId || undefined,
      invoice: initialInvoice !== "all" ? initialInvoice : undefined,
      status: initialStatus !== "all" ? initialStatus : undefined,
      sort: initialSort !== "code" ? initialSort : undefined,
      dir: initialDir !== "asc" ? initialDir : undefined,
      page: page > 1 ? String(page) : undefined,
      ...overrides,
    };
    Object.entries(merged).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const queryString = params.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }

  function applyFilter(key: string, value: string) {
    router.replace(buildUrl({ [key]: value || undefined, page: undefined }));
  }

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    router.replace(buildUrl({ search: searchInput || undefined, page: undefined }));
  }

  function handleSort(column: string) {
    const nextDir = initialSort === column && initialDir === "asc" ? "desc" : "asc";
    router.replace(buildUrl({ sort: column, dir: nextDir, page: undefined }));
  }

  function openCreate() {
    setEditingId(null);
    setSheetOpen(true);
  }

  function openEdit(id: string) {
    setEditingId(id);
    setSheetOpen(true);
  }

  function handleFormSuccess() {
    setSheetOpen(false);
    setEditingId(null);
  }

  function handleStatusToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      const result = await setTaskCodeStatus(id, !isActive);
      if (!result.success) toast.error(result.message);
    });
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const { id, label } = deleteTarget;
    startTransition(async () => {
      const result = await deleteTaskCode(id);
      if (result.success) toast.success(`"${label}" verwijderd`);
      else toast.error(result.message);
      setDeleteTarget(null);
    });
  }

  const activeFilters = [
    initialSearch ? { id: "search", label: "Zoeken", value: initialSearch, onRemove: () => applyFilter("search", "") } : null,
    initialSectorId
      ? {
          id: "sector",
          label: "Sector",
          value: sectors.find((sector) => sector.id === initialSectorId)?.name ?? initialSectorId,
          onRemove: () => applyFilter("sectorId", ""),
        }
      : null,
    initialInvoice !== "all"
      ? {
          id: "invoice",
          label: "Facturatie",
          value: initialInvoice === "yes" ? "Factureerbaar" : "Niet factureerbaar",
          onRemove: () => applyFilter("invoice", ""),
        }
      : null,
    initialStatus !== "all"
      ? {
          id: "status",
          label: "Status",
          value: initialStatus === "active" ? "Actief" : "Inactief",
          onRemove: () => applyFilter("status", ""),
        }
      : null,
  ].filter(Boolean) as Parameters<typeof TenantActiveFilters>[0]["filters"];

  function renderRowActions(row: TaskCodeRow) {
    return (
      <TenantActionMenu
        actions={
          canWrite
            ? [
                {
                  id: "edit",
                  label: "Bewerken",
                  icon: <Pencil className="h-4 w-4" />,
                  onSelect: () => openEdit(row.id),
                },
                {
                  id: "status",
                  label: row.isActive ? "Deactiveren" : "Activeren",
                  icon: row.isActive ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />,
                  disabled: pending,
                  separatorBefore: true,
                  onSelect: () => handleStatusToggle(row.id, row.isActive),
                },
                {
                  id: "delete",
                  label: "Verwijderen",
                  icon: <Trash2 className="h-4 w-4" />,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => setDeleteTarget({ id: row.id, label: `${row.code} - ${row.name}` }),
                },
              ]
            : []
        }
      />
    );
  }

  return (
    <>
      <TenantToolbar
        search={
          <form onSubmit={handleSearchSubmit} className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
            <TenantToolbarSearch
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Zoek code of naam..."
              wrapperClassName="max-w-none"
            />
            <Button type="submit" variant="outline" size="sm">Zoeken</Button>
          </form>
        }
        actions={
          <>
            <TenantFilterDrawer activeCount={activeFilters.length} title="Taakcodefilters">
              <div className="space-y-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground">Sector</span>
                  <select
                    value={initialSectorId || "ALL"}
                    onChange={(event) => applyFilter("sectorId", event.target.value === "ALL" ? "" : event.target.value)}
                    className="veele-input"
                  >
                    <option value="ALL">Alle sectoren</option>
                    {sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground">Facturatie</span>
                  <select
                    value={initialInvoice || "all"}
                    onChange={(event) => applyFilter("invoice", event.target.value === "all" ? "" : event.target.value)}
                    className="veele-input"
                  >
                    <option value="all">Alle</option>
                    <option value="yes">Factureerbaar</option>
                    <option value="no">Niet factureerbaar</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground">Status</span>
                  <select
                    value={initialStatus || "all"}
                    onChange={(event) => applyFilter("status", event.target.value === "all" ? "" : event.target.value)}
                    className="veele-input"
                  >
                    <option value="all">Alle statussen</option>
                    <option value="active">Actief</option>
                    <option value="inactive">Inactief</option>
                  </select>
                </label>
              </div>
            </TenantFilterDrawer>
            {canWrite && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Nieuwe taakcode
              </Button>
            )}
          </>
        }
        activeFilters={<TenantActiveFilters filters={activeFilters} />}
      />

      {rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground md:hidden">
          Geen taakcodes gevonden
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:hidden">
          {rows.map((row) => (
            <article key={row.id} className="rounded-lg border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-slate-600">{row.code}</span>
                  <p className="mt-2 font-medium text-foreground">{row.name}</p>
                  <p className="text-sm text-muted-foreground">{row.sectorName ?? "Geen sector"}</p>
                </div>
                {renderRowActions(row)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge isActive={row.isActive} />
                <span>{formatPrice(row.price)}</span>
                <span>{formatDuration(row.durationMinutes)}</span>
                <span>{row.invoiceable ? "Factureerbaar" : "Niet factureerbaar"}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="veele-card mt-4 hidden overflow-hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                <SortHeader label="Code" columnKey="code" currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <SortHeader label="Naam" columnKey="name" currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Sector</th>
                <SortHeader label="Prijs" columnKey="price" currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <SortHeader label="Duur" columnKey="durationMinutes" currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Factureerbaar</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: "#94A3B8" }}>
                    Geen taakcodes gevonden
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-slate-50/60"
                    style={{ borderBottom: index < rows.length - 1 ? "1px solid #F1F5F9" : undefined }}
                  >
                    <td className="px-4 py-3">
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-slate-600">{row.code}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{row.name}</td>
                    <td className="px-4 py-3">
                      {row.sectorName ? (
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{row.sectorName}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatPrice(row.price)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatDuration(row.durationMinutes)}</td>
                    <td className="px-4 py-3">
                      {row.invoiceable ? (
                        <span className="flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="h-3.5 w-3.5" />Ja</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3.5 w-3.5" />Nee</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge isActive={row.isActive} /></td>
                    <td className="pr-4 py-3 text-right">{renderRowActions(row)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Resultaten {Math.min((page - 1) * PAGE_SIZE + 1, total)}-{Math.min(page * PAGE_SIZE, total)} van {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={page <= 1}
              onClick={() => router.replace(buildUrl({ page: String(page - 1) }))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-foreground">{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={page >= totalPages}
              onClick={() => router.replace(buildUrl({ page: String(page + 1) }))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[560px]">
          <SheetHeader>
            <SheetTitle>{editingId ? "Taakcode bewerken" : "Nieuwe taakcode"}</SheetTitle>
            <SheetDescription>
              {editingId
                ? "Werk de taakcodegegevens bij."
                : "Definieer een nieuwe herbruikbare taakcode voor opdrachten en facturering."}
            </SheetDescription>
          </SheetHeader>
          <TaskCodeForm
            mode={editingId ? "edit" : "create"}
            taskCodeId={editingId ?? undefined}
            sectors={sectors}
            roles={roles}
            onSuccess={handleFormSuccess}
            onCancel={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <TenantConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Taakcode verwijderen?"
        description={deleteTarget ? `Dit verwijdert permanent ${deleteTarget.label}. Deze actie kan niet ongedaan worden gemaakt.` : undefined}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

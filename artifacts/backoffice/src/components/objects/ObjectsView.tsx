"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { ObjectForm } from "@/components/objects/ObjectForm";
import {
  bulkSetObjectStatus,
  setObjectStatus,
  deleteObject,
  type ObjectRow,
  type CustomerOption,
} from "@/app/actions/objects";

const PAGE_SIZE = 25;
const SORTABLE = ["name", "code", "city", "createdAt"] as const;

// ─── Sortable header cell ─────────────────────────────────────────────────────

function SortHeader({
  label,
  columnKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label:       string;
  columnKey:   string;
  currentSort: string;
  currentDir:  string;
  onSort:      (key: string) => void;
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
          currentDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ObjectsViewProps {
  rows:                ObjectRow[];
  total:               number;
  customers:           CustomerOption[];
  canWrite:            boolean;
  page:                number;
  initialSearch:       string;
  initialCustomerId:   string;
  initialServiceType:  string;
  initialRegion:       string;
  initialStatus:       string;
  initialSort:         string;
  initialDir:          string;
}

export function ObjectsView({
  rows,
  total,
  customers,
  canWrite,
  page,
  initialSearch,
  initialCustomerId,
  initialServiceType,
  initialRegion,
  initialStatus,
  initialSort,
  initialDir,
}: ObjectsViewProps) {
  const router   = useRouter();
  const pathname = usePathname();

  const [sheetOpen,     setSheetOpen]     = useState(false);
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [searchInput,   setSearchInput]   = useState(initialSearch);
  const [deleteTarget,  setDeleteTarget]  = useState<{ id: string; name: string } | null>(null);
  const [bulkPending,   startBulkTransition] = useTransition();

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      search:      initialSearch      || undefined,
      customerId:  initialCustomerId  || undefined,
      serviceType: initialServiceType || undefined,
      region:      initialRegion      || undefined,
      status:      initialStatus !== "all" ? initialStatus : undefined,
      sort:        initialSort   !== "name" ? initialSort : undefined,
      dir:         initialDir    !== "asc"  ? initialDir  : undefined,
      page:        page > 1 ? String(page) : undefined,
      ...overrides,
    };
    Object.entries(merged).forEach(([k, v]) => { if (v) params.set(k, v); });
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function applyFilter(key: string, value: string) {
    router.replace(buildUrl({ [key]: value || undefined, page: undefined }));
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilter("search", searchInput);
  }

  function handleSort(column: string) {
    if (!SORTABLE.includes(column as typeof SORTABLE[number])) return;
    const newDir =
      initialSort === column && initialDir === "asc" ? "desc" : "asc";
    router.replace(buildUrl({ sort: column, dir: newDir, page: undefined }));
  }

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => { const next = new Set(prev); rows.forEach((r) => next.delete(r.id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); rows.forEach((r) => next.add(r.id)); return next; });
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openCreate() { setEditingId(null); setSheetOpen(true); }
  function openEdit(id: string) { setEditingId(id); setSheetOpen(true); }
  function handleFormSuccess() { setSheetOpen(false); setEditingId(null); }

  function handleStatusToggle(id: string, isActive: boolean) {
    startBulkTransition(async () => {
      const result = await setObjectStatus(id, !isActive);
      if (!result.success) toast.error(result.message);
    });
  }

  function handleBulkStatus(isActive: boolean) {
    const ids = [...selected];
    startBulkTransition(async () => {
      const result = await bulkSetObjectStatus(ids, isActive);
      if (result.success) {
        setSelected(new Set());
        toast.success(`${ids.length} object${ids.length > 1 ? "en" : ""} ${isActive ? "geactiveerd" : "gedeactiveerd"}`);
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    startBulkTransition(async () => {
      const result = await deleteObject(id);
      if (result.success) {
        toast.success(`Object "${name}" verwijderd`);
      } else {
        toast.error(result.message);
      }
      setDeleteTarget(null);
    });
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* Search */}
        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xs"
        >
          <div className="relative flex-1">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
              style={{ color: "#94A3B8" }}
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Zoek op naam of code..."
              className="pl-8 h-9"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" className="h-9">
            Zoeken
          </Button>
        </form>

        {/* Status filter */}
        <Select
          value={initialStatus || "all"}
          onValueChange={(v) => applyFilter("status", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="active">Actief</SelectItem>
            <SelectItem value="inactive">Inactief</SelectItem>
          </SelectContent>
        </Select>

        {/* Service type filter */}
        <div className="relative">
          <Input
            value={initialServiceType}
            onChange={(e) => applyFilter("serviceType", e.target.value)}
            placeholder="Diensttype..."
            className="w-[150px] h-9"
          />
        </div>

        {/* Region / city filter */}
        <div className="relative">
          <Input
            value={initialRegion}
            onChange={(e) => applyFilter("region", e.target.value)}
            placeholder="Regio / stad..."
            className="w-[140px] h-9"
          />
        </div>

        {/* Customer filter — secondary, used when coming from customer pages */}
        {initialCustomerId && (
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => applyFilter("customerId", "")}
          >
            Klantfilter ×
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nieuw object
            </Button>
          )}
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && canWrite && (
        <div
          className="flex items-center gap-3 px-4 py-2 mb-4 rounded-lg text-sm"
          style={{ backgroundColor: "#E0FAFB", border: "1px solid #00B7B3" }}
        >
          <span style={{ color: "#081D3A" }}>{selected.size} geselecteerd</span>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => handleBulkStatus(true)}  disabled={bulkPending}>
              <ToggleRight className="mr-1.5 h-3.5 w-3.5" />Activeren
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkStatus(false)} disabled={bulkPending}>
              <ToggleLeft  className="mr-1.5 h-3.5 w-3.5" />Deactiveren
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Wissen
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="veele-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                {canWrite && (
                  <th className="w-10 pl-4 py-3">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                )}
                <SortHeader
                  label="Object"
                  columnKey="name"
                  currentSort={initialSort}
                  currentDir={initialDir}
                  onSort={handleSort}
                />
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  Adres
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  Diensttype
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  Eerstvolgende dienst
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  Status
                </th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canWrite ? 7 : 6}
                    className="px-4 py-12 text-center text-sm"
                    style={{ color: "#94A3B8" }}
                  >
                    Geen objecten gevonden
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const fullAddress = [row.address, row.city]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <tr
                      key={row.id}
                      className="transition-colors hover:bg-slate-50/60"
                      style={{
                        borderBottom:
                          i < rows.length - 1 ? "1px solid #F1F5F9" : undefined,
                      }}
                    >
                      {canWrite && (
                        <td className="pl-4 py-3">
                          <Checkbox
                            checked={selected.has(row.id)}
                            onCheckedChange={() => toggleOne(row.id)}
                          />
                        </td>
                      )}

                      {/* Object (name + type icon + code) */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="flex-shrink-0 flex items-center justify-center rounded-lg h-8 w-8"
                            style={{ backgroundColor: "#E0FAFB" }}
                          >
                            <Building2 className="h-4 w-4" style={{ color: "#00B7B3" }} />
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/objects/${row.id}`}
                              className="text-sm font-medium hover:underline block truncate max-w-[180px]"
                              style={{ color: "#081D3A" }}
                            >
                              {row.name}
                            </Link>
                            <span className="font-mono text-xs" style={{ color: "#94A3B8" }}>
                              {row.code}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Address */}
                      <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                        {fullAddress || "—"}
                      </td>

                      {/* Service type */}
                      <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                        {row.serviceType ? (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: "#EEF2FF", color: "#3730A3" }}
                          >
                            {row.serviceType}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>

                      {/* Next service */}
                      <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                        {row.nextServiceDate
                          ? new Date(row.nextServiceDate).toLocaleDateString("nl-NL", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge isActive={row.isActive} />
                      </td>

                      {/* Actions */}
                      <td className="pr-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Menu openen</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/objects/${row.id}`}>
                                Bekijken
                              </Link>
                            </DropdownMenuItem>
                            {canWrite && (
                              <>
                                <DropdownMenuItem onSelect={() => openEdit(row.id)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Bewerken
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => handleStatusToggle(row.id, row.isActive)}
                                >
                                  {row.isActive ? (
                                    <>
                                      <ToggleLeft className="mr-2 h-4 w-4" />
                                      Deactiveren
                                    </>
                                  ) : (
                                    <>
                                      <ToggleRight className="mr-2 h-4 w-4" />
                                      Activeren
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setDeleteTarget({ id: row.id, name: row.name })
                                  }
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Verwijderen
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span style={{ color: "#64748B" }}>
            Resultaten {Math.min((page - 1) * PAGE_SIZE + 1, total)}–
            {Math.min(page * PAGE_SIZE, total)} van {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={page <= 1}
              onClick={() =>
                router.replace(buildUrl({ page: String(page - 1) }))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3" style={{ color: "#081D3A" }}>
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={page >= totalPages}
              onClick={() =>
                router.replace(buildUrl({ page: String(page + 1) }))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-[560px] sm:max-w-[560px] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{editingId ? "Object bewerken" : "Nieuw object"}</SheetTitle>
            <SheetDescription>
              {editingId
                ? "Werk de objectgegevens bij."
                : "Vul de gegevens in om een nieuw object aan te maken."}
            </SheetDescription>
          </SheetHeader>
          <ObjectForm
            mode={editingId ? "edit" : "create"}
            objectId={editingId ?? undefined}
            sectors={[]}
            customers={customers}
            onSuccess={handleFormSuccess}
            onCancel={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Object verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert permanent{" "}
              <strong>{deleteTarget?.name}</strong>. Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

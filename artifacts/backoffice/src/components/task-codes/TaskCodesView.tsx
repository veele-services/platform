"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
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
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { TaskCodeForm } from "@/components/task-codes/TaskCodeForm";
import {
  setTaskCodeStatus,
  deleteTaskCode,
  type TaskCodeRow,
  type SectorOption,
  type RoleOption,
} from "@/app/actions/task-codes";

const PAGE_SIZE = 25;

// ─── Sort header ──────────────────────────────────────────────────────────────

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
          currentDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

// ─── Price formatter ─────────────────────────────────────────────────────────

function formatPrice(price: string | null): string {
  if (!price) return "—";
  const n = parseFloat(price);
  if (isNaN(n)) return "—";
  return `€\u202F${n.toFixed(2)}`;
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TaskCodesViewProps {
  rows:            TaskCodeRow[];
  total:           number;
  sectors:         SectorOption[];
  roles:           RoleOption[];
  canWrite:        boolean;
  page:            number;
  initialSearch:   string;
  initialSectorId: string;
  initialInvoice:  string;
  initialStatus:   string;
  initialSort:     string;
  initialDir:      string;
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
  const router   = useRouter();
  const pathname = usePathname();

  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [searchInput,  setSearchInput]  = useState(initialSearch);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [pending,      startTransition] = useTransition();

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ─── URL helpers ─────────────────────────────────────────────────────────────
  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params  = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      search:   initialSearch   || undefined,
      sectorId: initialSectorId || undefined,
      invoice:  initialInvoice  !== "all" ? initialInvoice : undefined,
      status:   initialStatus   !== "all" ? initialStatus  : undefined,
      sort:     initialSort     !== "code" ? initialSort    : undefined,
      dir:      initialDir      !== "asc"  ? initialDir     : undefined,
      page:     page > 1 ? String(page) : undefined,
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
    router.replace(buildUrl({ search: searchInput || undefined, page: undefined }));
  }

  function handleSort(column: string) {
    const newDir = initialSort === column && initialDir === "asc" ? "desc" : "asc";
    router.replace(buildUrl({ sort: column, dir: newDir, page: undefined }));
  }

  // ─── Sheet helpers ────────────────────────────────────────────────────────────
  function openCreate() { setEditingId(null); setSheetOpen(true); }
  function openEdit(id: string) { setEditingId(id); setSheetOpen(true); }
  function handleFormSuccess() { setSheetOpen(false); setEditingId(null); }

  // ─── Mutations ────────────────────────────────────────────────────────────────
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
      if (result.success) {
        toast.success(`"${label}" verwijderd`);
      } else {
        toast.error(result.message);
      }
      setDeleteTarget(null);
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm"
        >
          <div className="relative flex-1">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
              style={{ color: "#94A3B8" }}
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Zoek code of naam…"
              className="pl-8 h-9"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" className="h-9">
            Zoeken
          </Button>
        </form>

        <Select
          value={initialSectorId || "ALL"}
          onValueChange={(v) => applyFilter("sectorId", v === "ALL" ? "" : v)}
        >
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Alle sectoren" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Alle sectoren</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={initialInvoice || "all"}
          onValueChange={(v) => applyFilter("invoice", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Factureerbaar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="yes">Factureerbaar</SelectItem>
            <SelectItem value="no">Niet factureerbaar</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={initialStatus || "all"}
          onValueChange={(v) => applyFilter("status", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="active">Actief</SelectItem>
            <SelectItem value="inactive">Inactief</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          {canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nieuwe taakcode
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="veele-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                <SortHeader label="Code"          columnKey="code"            currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <SortHeader label="Naam"          columnKey="name"            currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Sector</th>
                <SortHeader label="Prijs"         columnKey="price"           currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <SortHeader label="Duur"          columnKey="durationMinutes" currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Factureerbaar</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm"
                    style={{ color: "#94A3B8" }}
                  >
                    Geen taakcodes gevonden
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-slate-50/60"
                    style={{ borderBottom: i < rows.length - 1 ? "1px solid #F1F5F9" : undefined }}
                  >
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-xs font-semibold px-2 py-0.5 rounded"
                        style={{ backgroundColor: "#F1F5F9", color: "#475569" }}
                      >
                        {row.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: "#081D3A" }}>
                      {row.name}
                    </td>
                    <td className="px-4 py-3">
                      {row.sectorName ? (
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded"
                          style={{ backgroundColor: "#F0F4FF", color: "#3B5CE0" }}
                        >
                          {row.sectorName}
                        </span>
                      ) : (
                        <span style={{ color: "#94A3B8", fontSize: "14px" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#475569" }}>
                      {formatPrice(row.price)}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#475569" }}>
                      {formatDuration(row.durationMinutes)}
                    </td>
                    <td className="px-4 py-3">
                      {row.invoiceable ? (
                        <span className="flex items-center gap-1 text-xs" style={{ color: "#00B7B3" }}>
                          <CheckCircle2 className="h-3.5 w-3.5" />Ja
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs" style={{ color: "#94A3B8" }}>
                          <XCircle className="h-3.5 w-3.5" />Nee
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={row.isActive} />
                    </td>
                    <td className="pr-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Menu openen</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canWrite && (
                            <>
                              <DropdownMenuItem onSelect={() => openEdit(row.id)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Bewerken
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={pending}
                                onSelect={() => handleStatusToggle(row.id, row.isActive)}
                              >
                                {row.isActive ? (
                                  <><ToggleLeft  className="mr-2 h-4 w-4" />Deactiveren</>
                                ) : (
                                  <><ToggleRight className="mr-2 h-4 w-4" />Activeren</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setDeleteTarget({ id: row.id, label: `${row.code} — ${row.name}` })}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span style={{ color: "#64748B" }}>
            Resultaten {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} van {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="sm" className="h-8 w-8 p-0"
              disabled={page <= 1}
              onClick={() => router.replace(buildUrl({ page: String(page - 1) }))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3" style={{ color: "#081D3A" }}>{page} / {totalPages}</span>
            <Button
              variant="outline" size="sm" className="h-8 w-8 p-0"
              disabled={page >= totalPages}
              onClick={() => router.replace(buildUrl({ page: String(page + 1) }))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[560px] sm:max-w-[560px] overflow-y-auto">
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

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Taakcode verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert permanent{" "}
              <strong>{deleteTarget?.label}</strong>. Deze actie kan niet ongedaan worden gemaakt.
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

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
  Eye,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
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
import { PersonnelForm } from "@/components/personnel/PersonnelForm";
import {
  bulkSetPersonnelStatus,
  setPersonnelStatus,
  deletePersonnel,
  type PersonnelRow,
  type RoleOption,
} from "@/app/actions/personnel";

const PAGE_SIZE = 25;
const SORTABLE = ["lastName", "firstName", "email", "code", "region", "createdAt"] as const;

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

// ─── Qualification chips (truncated) ─────────────────────────────────────────

function QualChips({ tags, max = 2 }: { tags: string[]; max?: number }) {
  if (!tags.length) return <span style={{ color: "#94A3B8" }}>—</span>;
  const visible = tags.slice(0, max);
  const overflow = tags.length - max;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((t) => (
        <span
          key={t}
          className="inline-block rounded px-1.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: "#E0FAFB", color: "#0A7E7A" }}
        >
          {t}
        </span>
      ))}
      {overflow > 0 && (
        <span className="inline-block rounded px-1.5 py-0.5 text-xs" style={{ color: "#94A3B8" }}>
          +{overflow}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PersonnelViewProps {
  rows:            PersonnelRow[];
  total:           number;
  roles:           RoleOption[];
  canWrite:        boolean;
  page:            number;
  initialSearch:   string;
  initialRoleId:   string;
  initialRegion:   string;
  initialStatus:   string;
  initialSort:     string;
  initialDir:      string;
}

export function PersonnelView({
  rows,
  total,
  roles,
  canWrite,
  page,
  initialSearch,
  initialRoleId,
  initialRegion,
  initialStatus,
  initialSort,
  initialDir,
}: PersonnelViewProps) {
  const router   = useRouter();
  const pathname = usePathname();

  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [searchInput,  setSearchInput]  = useState(initialSearch);
  const [regionInput,  setRegionInput]  = useState(initialRegion);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [bulkPending,  startBulkTransition] = useTransition();

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ─── URL helpers ─────────────────────────────────────────────────────────────
  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      search:  initialSearch  || undefined,
      roleId:  initialRoleId  || undefined,
      region:  initialRegion  || undefined,
      status:  initialStatus !== "all" ? initialStatus : undefined,
      sort:    initialSort !== "lastName" ? initialSort : undefined,
      dir:     initialDir  !== "asc"     ? initialDir  : undefined,
      page:    page > 1 ? String(page) : undefined,
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
    router.replace(buildUrl({ search: searchInput || undefined, region: regionInput || undefined, page: undefined }));
  }

  function handleSort(column: string) {
    if (!SORTABLE.includes(column as typeof SORTABLE[number])) return;
    const newDir = initialSort === column && initialDir === "asc" ? "desc" : "asc";
    router.replace(buildUrl({ sort: column, dir: newDir, page: undefined }));
  }

  // ─── Selection ───────────────────────────────────────────────────────────────
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => { const next = new Set(prev); rows.forEach((r) => next.delete(r.id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); rows.forEach((r) => next.add(r.id)); return next; });
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  // ─── Sheet helpers ────────────────────────────────────────────────────────────
  function openCreate() { setEditingId(null); setSheetOpen(true); }
  function openEdit(id: string) { setEditingId(id); setSheetOpen(true); }
  function handleFormSuccess() { setSheetOpen(false); setEditingId(null); }

  // ─── Mutations ────────────────────────────────────────────────────────────────
  function handleStatusToggle(id: string, isActive: boolean) {
    startBulkTransition(async () => {
      const result = await setPersonnelStatus(id, !isActive);
      if (!result.success) toast.error(result.message);
    });
  }

  function handleBulkStatus(isActive: boolean) {
    const ids = [...selected];
    startBulkTransition(async () => {
      const result = await bulkSetPersonnelStatus(ids, isActive);
      if (result.success) {
        setSelected(new Set());
        toast.success(`${ids.length} medewerker${ids.length > 1 ? "s" : ""} ${isActive ? "geactiveerd" : "gedeactiveerd"}`);
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    startBulkTransition(async () => {
      const result = await deletePersonnel(id);
      if (result.success) {
        toast.success(`"${name}" verwijderd`);
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
              placeholder="Zoek op naam of e-mail…"
              className="pl-8 h-9"
            />
          </div>
          <Input
            value={regionInput}
            onChange={(e) => setRegionInput(e.target.value)}
            placeholder="Regio…"
            className="w-32 h-9"
          />
          <Button type="submit" variant="outline" size="sm" className="h-9">
            Zoeken
          </Button>
        </form>

        <Select
          value={initialRoleId || "ALL"}
          onValueChange={(v) => applyFilter("roleId", v === "ALL" ? "" : v)}
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Alle rollen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Alle rollen</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
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
              Nieuw personeelslid
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
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Wissen</Button>
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
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                  </th>
                )}
                <SortHeader label="Naam"      columnKey="lastName"  currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <SortHeader label="Code"      columnKey="code"      currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <SortHeader label="E-mail"    columnKey="email"     currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Rol</th>
                <SortHeader label="Regio"     columnKey="region"    currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Certificaten</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canWrite ? 9 : 8}
                    className="px-4 py-12 text-center text-sm"
                    style={{ color: "#94A3B8" }}
                  >
                    Geen personeelsrecords gevonden
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-slate-50/60"
                    style={{ borderBottom: i < rows.length - 1 ? "1px solid #F1F5F9" : undefined }}
                  >
                    {canWrite && (
                      <td className="pl-4 py-3">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={() => toggleOne(row.id)}
                          aria-label={`Select ${row.firstName} ${row.lastName}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link
                        href={`/personnel/${row.id}`}
                        className="font-medium text-sm hover:underline"
                        style={{ color: "#081D3A" }}
                      >
                        {row.lastName}, {row.firstName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block font-mono text-xs rounded px-1.5 py-0.5 bg-slate-100" style={{ color: "#475569" }}>
                        {row.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                      {row.email}
                    </td>
                    <td className="px-4 py-3">
                      {row.roleName ? (
                        <span
                          className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: "#F0F4FF", color: "#3B5CE0" }}
                        >
                          {row.roleName}
                        </span>
                      ) : (
                        <span style={{ color: "#94A3B8", fontSize: "14px" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                      {row.region ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <QualChips tags={row.certificates} />
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
                          <DropdownMenuItem asChild>
                            <Link href={`/personnel/${row.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
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
                              <DropdownMenuItem onSelect={() => handleStatusToggle(row.id, row.isActive)}>
                                {row.isActive ? (
                                  <><ToggleLeft className="mr-2 h-4 w-4" />Deactiveren</>
                                ) : (
                                  <><ToggleRight className="mr-2 h-4 w-4" />Activeren</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setDeleteTarget({ id: row.id, name: `${row.firstName} ${row.lastName}` })}
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
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 1}
              onClick={() => router.replace(buildUrl({ page: String(page - 1) }))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3" style={{ color: "#081D3A" }}>{page} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= totalPages}
              onClick={() => router.replace(buildUrl({ page: String(page + 1) }))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[540px] sm:max-w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? "Personeel bewerken" : "Nieuw personeelslid"}</SheetTitle>
            <SheetDescription>
              {editingId
                ? "Werk de personeelsgegevens bij."
                : "Vul de gegevens in om een nieuw personeelsrecord aan te maken."}
            </SheetDescription>
          </SheetHeader>
          <PersonnelForm
            mode={editingId ? "edit" : "create"}
            personnelId={editingId ?? undefined}
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
            <AlertDialogTitle>Personeelsrecord verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert permanent de medewerker{" "}
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

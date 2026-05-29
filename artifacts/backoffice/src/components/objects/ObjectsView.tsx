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
import { StatusBadge } from "@/components/ui/status-badge";
import { ObjectForm } from "@/components/objects/ObjectForm";
import {
  bulkSetObjectStatus,
  setObjectStatus,
  type ObjectRow,
  type CustomerOption,
} from "@/app/actions/objects";
import type { SectorOption } from "@/app/actions/customers";

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
  rows:              ObjectRow[];
  total:             number;
  sectors:           SectorOption[];
  customers:         CustomerOption[];
  canWrite:          boolean;
  page:              number;
  initialSearch:     string;
  initialCustomerId: string;
  initialSectorId:   string;
  initialStatus:     string;
  initialSort:       string;
  initialDir:        string;
}

export function ObjectsView({
  rows,
  total,
  sectors,
  customers,
  canWrite,
  page,
  initialSearch,
  initialCustomerId,
  initialSectorId,
  initialStatus,
  initialSort,
  initialDir,
}: ObjectsViewProps) {
  const router   = useRouter();
  const pathname = usePathname();

  const [sheetOpen,  setSheetOpen]  = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [bulkPending, startBulkTransition] = useTransition();

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      search:     initialSearch     || undefined,
      customerId: initialCustomerId || undefined,
      sectorId:   initialSectorId   || undefined,
      status:     initialStatus !== "all" ? initialStatus : undefined,
      sort:       initialSort   !== "name" ? initialSort : undefined,
      dir:        initialDir    !== "asc"  ? initialDir  : undefined,
      page:       page > 1 ? String(page) : undefined,
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
        toast.success(`${ids.length} object${ids.length > 1 ? "s" : ""} ${isActive ? "activated" : "deactivated"}`);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
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
              placeholder="Search by name or code..."
              className="pl-8 h-9"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" className="h-9">
            Search
          </Button>
        </form>

        <Select
          value={initialCustomerId || "ALL"}
          onValueChange={(v) => applyFilter("customerId", v === "ALL" ? "" : v)}
        >
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All customers</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={initialSectorId || "ALL"}
          onValueChange={(v) => applyFilter("sectorId", v === "ALL" ? "" : v)}
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="All sectors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All sectors</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={initialStatus || "all"}
          onValueChange={(v) => applyFilter("status", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Object
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
          <span style={{ color: "#081D3A" }}>{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => handleBulkStatus(true)}  disabled={bulkPending}>
              <ToggleRight className="mr-1.5 h-3.5 w-3.5" />Activate
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkStatus(false)} disabled={bulkPending}>
              <ToggleLeft  className="mr-1.5 h-3.5 w-3.5" />Deactivate
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
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
                  label="Name"
                  columnKey="name"
                  currentSort={initialSort}
                  currentDir={initialDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Code"
                  columnKey="code"
                  currentSort={initialSort}
                  currentDir={initialDir}
                  onSort={handleSort}
                />
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  Customer
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#64748B" }}
                >
                  Sector
                </th>
                <SortHeader
                  label="City"
                  columnKey="city"
                  currentSort={initialSort}
                  currentDir={initialDir}
                  onSort={handleSort}
                />
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
                    colSpan={canWrite ? 8 : 7}
                    className="px-4 py-12 text-center text-sm"
                    style={{ color: "#94A3B8" }}
                  >
                    No objects found
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
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
                    <td className="px-4 py-3 font-medium text-sm" style={{ color: "#081D3A" }}>
                      {row.name}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                      {row.code ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {row.customerName ? (
                        <Link
                          href={`/customers/${row.customerId}`}
                          className="hover:underline"
                          style={{ color: "#00B7B3" }}
                        >
                          {row.customerName}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                      {row.sectorName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                      {row.city ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={row.isActive} />
                    </td>
                    <td className="pr-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canWrite && (
                            <>
                              <DropdownMenuItem onSelect={() => openEdit(row.id)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() =>
                                  handleStatusToggle(row.id, row.isActive)
                                }
                              >
                                {row.isActive ? (
                                  <>
                                    <ToggleLeft className="mr-2 h-4 w-4" />
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <ToggleRight className="mr-2 h-4 w-4" />
                                    Activate
                                  </>
                                )}
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
            Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–
            {Math.min(page * PAGE_SIZE, total)} of {total}
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
          className="w-[520px] sm:max-w-[520px] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit Object" : "New Object"}</SheetTitle>
            <SheetDescription>
              {editingId
                ? "Update object details below."
                : "Fill in the details to create a new object."}
            </SheetDescription>
          </SheetHeader>
          <ObjectForm
            mode={editingId ? "edit" : "create"}
            objectId={editingId ?? undefined}
            sectors={sectors}
            customers={customers}
            onSuccess={handleFormSuccess}
            onCancel={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

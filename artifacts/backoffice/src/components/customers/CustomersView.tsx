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
  Download,
  SlidersHorizontal,
  X,
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
import { CustomerStatusBadge } from "@/components/customers/CustomerStatusBadge";
import { CustomerForm } from "@/components/customers/CustomerForm";
import {
  bulkSetCustomerStatus,
  setCustomerStatus,
  deleteCustomer,
  exportCustomers,
  exportCustomersPdf,
  type CustomerRow,
  type SectorOption,
  type CustomerTypeOption,
  type AccountManagerOption,
} from "@/app/actions/customers";
import { CUSTOMER_STATUSES, CUSTOMER_STATUS_LABELS } from "@/types/customer-status";

const PAGE_SIZE = 25;
const SORTABLE  = ["name", "code", "city", "createdAt"] as const;

interface CustomersViewProps {
  rows:                     CustomerRow[];
  total:                    number;
  sectors:                  SectorOption[];
  customerTypes:            CustomerTypeOption[];
  accountManagers:          AccountManagerOption[];
  canWrite:                 boolean;
  canWriteNotes:            boolean;
  page:                     number;
  initialSearch:            string;
  initialSectorId:          string;
  initialStatus:            string;
  initialCustomerTypeId:    string;
  initialSort:              string;
  initialDir:               string;
  initialCity:              string;
  initialCountry:           string;
  initialAccountManagerId:  string;
  initialDateFrom:          string;
  initialDateTo:            string;
}

function SortHeader({
  label, columnKey, currentSort, currentDir, onSort,
}: {
  label: string; columnKey: string; currentSort: string; currentDir: string; onSort: (k: string) => void;
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

export function CustomersView({
  rows,
  total,
  sectors,
  customerTypes,
  accountManagers,
  canWrite,
  canWriteNotes,
  page,
  initialSearch,
  initialSectorId,
  initialStatus,
  initialCustomerTypeId,
  initialSort,
  initialDir,
  initialCity,
  initialCountry,
  initialAccountManagerId,
  initialDateFrom,
  initialDateTo,
}: CustomersViewProps) {
  const router   = useRouter();
  const pathname = usePathname();

  const [sheetOpen,        setSheetOpen]        = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [editingId,        setEditingId]        = useState<string | null>(null);
  const [selected,         setSelected]         = useState<Set<string>>(new Set());
  const [searchInput,      setSearchInput]      = useState(initialSearch);
  const [deleteTarget,     setDeleteTarget]     = useState<{ id: string; name: string } | null>(null);
  const [exportPending,    setExportPending]    = useState(false);
  const [exportPdfPending, setExportPdfPending] = useState(false);
  const [bulkPending,      startBulkTransition] = useTransition();

  const [filterCity,             setFilterCity]             = useState(initialCity);
  const [filterCountry,          setFilterCountry]          = useState(initialCountry);
  const [filterAccountManagerId, setFilterAccountManagerId] = useState(initialAccountManagerId);
  const [filterDateFrom,         setFilterDateFrom]         = useState(initialDateFrom);
  const [filterDateTo,           setFilterDateTo]           = useState(initialDateTo);

  const totalPages           = Math.ceil(total / PAGE_SIZE);
  const advancedFilterCount  = [initialCity, initialCountry, initialAccountManagerId, initialDateFrom, initialDateTo].filter(Boolean).length;

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      search:           initialSearch           || undefined,
      sectorId:         initialSectorId         || undefined,
      status:           initialStatus !== "all" ? initialStatus : undefined,
      customerTypeId:   initialCustomerTypeId   || undefined,
      city:             initialCity             || undefined,
      country:          initialCountry          || undefined,
      accountManagerId: initialAccountManagerId || undefined,
      dateFrom:         initialDateFrom         || undefined,
      dateTo:           initialDateTo           || undefined,
      sort:             initialSort !== "name"  ? initialSort  : undefined,
      dir:              initialDir  !== "asc"   ? initialDir   : undefined,
      page:             page > 1 ? String(page) : undefined,
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
    const newDir = initialSort === column && initialDir === "asc" ? "desc" : "asc";
    router.replace(buildUrl({ sort: column, dir: newDir, page: undefined }));
  }

  function applyAdvancedFilters() {
    router.replace(buildUrl({
      city:             filterCity             || undefined,
      country:          filterCountry          || undefined,
      accountManagerId: filterAccountManagerId || undefined,
      dateFrom:         filterDateFrom         || undefined,
      dateTo:           filterDateTo           || undefined,
      page:             undefined,
    }));
    setFilterDrawerOpen(false);
  }

  function clearAdvancedFilters() {
    setFilterCity("");
    setFilterCountry("");
    setFilterAccountManagerId("");
    setFilterDateFrom("");
    setFilterDateTo("");
    router.replace(buildUrl({
      city:             undefined,
      country:          undefined,
      accountManagerId: undefined,
      dateFrom:         undefined,
      dateTo:           undefined,
      page:             undefined,
    }));
    setFilterDrawerOpen(false);
  }

  function openFilterDrawer() {
    setFilterCity(initialCity);
    setFilterCountry(initialCountry);
    setFilterAccountManagerId(initialAccountManagerId);
    setFilterDateFrom(initialDateFrom);
    setFilterDateTo(initialDateTo);
    setFilterDrawerOpen(true);
  }

  function activeExportParams() {
    return {
      search:           initialSearch           || undefined,
      sectorId:         initialSectorId         || undefined,
      status:           initialStatus !== "all" ? initialStatus : undefined,
      customerTypeId:   initialCustomerTypeId   || undefined,
      city:             initialCity             || undefined,
      country:          initialCountry          || undefined,
      accountManagerId: initialAccountManagerId || undefined,
      dateFrom:         initialDateFrom         || undefined,
      dateTo:           initialDateTo           || undefined,
    };
  }

  async function handleExport() {
    setExportPending(true);
    try {
      const result = await exportCustomers(activeExportParams());
      if (result.success) {
        const { csv, filename } = (result as { success: true; data: { csv: string; filename: string } }).data;
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Exporteren mislukt. Probeer het opnieuw.");
    } finally {
      setExportPending(false);
    }
  }

  async function handleExportPdf() {
    setExportPdfPending(true);
    try {
      const result = await exportCustomersPdf(activeExportParams());
      if (result.success) {
        const { html } = (result as { success: true; data: { html: string; filename: string } }).data;
        const printWin = window.open("", "_blank");
        if (printWin) {
          printWin.document.write(html);
          printWin.document.close();
        } else {
          toast.error("Pop-up geblokkeerd. Sta pop-ups toe voor dit domein.");
        }
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("PDF exporteren mislukt. Probeer het opnieuw.");
    } finally {
      setExportPdfPending(false);
    }
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

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
      const result = await setCustomerStatus(id, !isActive);
      if (!result.success) toast.error(result.message);
    });
  }

  function handleBulkStatus(isActive: boolean) {
    const ids = [...selected];
    startBulkTransition(async () => {
      const result = await bulkSetCustomerStatus(ids, isActive);
      if (result.success) {
        setSelected(new Set());
        toast.success(`${ids.length} klant${ids.length > 1 ? "en" : ""} ${isActive ? "geactiveerd" : "gedeactiveerd"}`);
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    startBulkTransition(async () => {
      const result = await deleteCustomer(id);
      if (result.success) {
        toast.success(`Klant "${name}" verwijderd`);
      } else {
        toast.error(result.message);
      }
      setDeleteTarget(null);
    });
  }

  const colSpan = canWrite ? 8 : 7;

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xs">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "#94A3B8" }} />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Zoek op naam of code..."
              className="pl-8 h-9"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" className="h-9">Zoeken</Button>
        </form>

        <Select value={initialSectorId || "ALL"} onValueChange={(v) => applyFilter("sectorId", v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Alle sectoren" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Alle sectoren</SelectItem>
            {sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {customerTypes.length > 0 && (
          <Select value={initialCustomerTypeId || "ALL"} onValueChange={(v) => applyFilter("customerTypeId", v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Alle types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Alle types</SelectItem>
              {customerTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={initialStatus || "all"} onValueChange={(v) => applyFilter("status", v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            {CUSTOMER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{CUSTOMER_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Advanced filter button */}
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={openFilterDrawer}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Meer filters
          {advancedFilterCount > 0 && (
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold"
              style={{ backgroundColor: "#00B7B3", color: "#fff" }}
            >
              {advancedFilterCount}
            </span>
          )}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {/* Export CSV */}
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={handleExport}
            disabled={exportPending}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {exportPending ? "Exporteren..." : "CSV"}
          </Button>

          {/* Export PDF */}
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={handleExportPdf}
            disabled={exportPdfPending}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {exportPdfPending ? "Exporteren..." : "PDF"}
          </Button>

          {canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nieuwe klant
            </Button>
          )}
        </div>
      </div>

      {/* Active advanced filters chips */}
      {advancedFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs font-medium" style={{ color: "#64748B" }}>Filters:</span>
          {initialCity && (
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: "#E0FAFB", color: "#00746F" }}
            >
              Stad: {initialCity}
              <button type="button" onClick={() => applyFilter("city", "")} className="hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {initialCountry && (
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: "#E0FAFB", color: "#00746F" }}
            >
              Land: {initialCountry}
              <button type="button" onClick={() => applyFilter("country", "")} className="hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {initialAccountManagerId && (
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: "#E0FAFB", color: "#00746F" }}
            >
              Accountmanager: {accountManagers.find((a) => a.id === initialAccountManagerId)?.fullName ?? "—"}
              <button type="button" onClick={() => applyFilter("accountManagerId", "")} className="hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {initialDateFrom && (
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: "#E0FAFB", color: "#00746F" }}
            >
              Vanaf: {initialDateFrom}
              <button type="button" onClick={() => applyFilter("dateFrom", "")} className="hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {initialDateTo && (
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: "#E0FAFB", color: "#00746F" }}
            >
              Tot: {initialDateTo}
              <button type="button" onClick={() => applyFilter("dateTo", "")} className="hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <button
            type="button"
            className="text-xs underline hover:no-underline"
            style={{ color: "#64748B" }}
            onClick={clearAdvancedFilters}
          >
            Alles wissen
          </button>
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && canWrite && (
        <div
          className="flex items-center gap-3 px-4 py-2 mb-4 rounded-lg text-sm"
          style={{ backgroundColor: "#E0FAFB", border: "1px solid #00B7B3" }}
        >
          <span style={{ color: "#081D3A" }}>{selected.size} geselecteerd</span>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => handleBulkStatus(true)} disabled={bulkPending}>
              <ToggleRight className="mr-1.5 h-3.5 w-3.5" /> Activeren
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkStatus(false)} disabled={bulkPending}>
              <ToggleLeft className="mr-1.5 h-3.5 w-3.5" /> Deactiveren
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
                <SortHeader label="Code"     columnKey="code"      currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <SortHeader label="Naam"     columnKey="name"      currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Sector</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Type</th>
                <SortHeader label="Stad"     columnKey="city"      currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-12 text-center text-sm" style={{ color: "#94A3B8" }}>
                    Geen klanten gevonden
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
                        <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleOne(row.id)} aria-label={`Select ${row.name}`} />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="inline-block font-mono text-xs rounded px-1.5 py-0.5 bg-slate-100" style={{ color: "#475569" }}>
                        {row.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/customers/${row.id}`} className="font-medium text-sm hover:underline" style={{ color: "#081D3A" }}>
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                      {row.sectorName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                      {row.customerTypeName ? (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}
                        >
                          {row.customerTypeName}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                      {row.city ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <CustomerStatusBadge status={row.status} />
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
                            <Link href={`/customers/${row.id}`}>
                              <Eye className="mr-2 h-4 w-4" /> Bekijken
                            </Link>
                          </DropdownMenuItem>
                          {canWrite && (
                            <>
                              <DropdownMenuItem onSelect={() => openEdit(row.id)}>
                                <Pencil className="mr-2 h-4 w-4" /> Bewerken
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => handleStatusToggle(row.id, row.isActive)}>
                                {row.isActive ? (
                                  <><ToggleLeft className="mr-2 h-4 w-4" /> Deactiveren</>
                                ) : (
                                  <><ToggleRight className="mr-2 h-4 w-4" /> Activeren</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setDeleteTarget({ id: row.id, name: row.name })}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Verwijderen
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

      {/* Advanced filter drawer */}
      <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
        <SheetContent side="right" className="w-[360px] sm:max-w-[360px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Geavanceerde filters</SheetTitle>
            <SheetDescription>
              Filter klanten op stad, land, accountmanager of aanmaakdatum.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 flex flex-col gap-5">
            {/* City */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "#475569" }}>Stad</label>
              <Input
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                placeholder="bijv. Amsterdam"
                className="h-9"
              />
            </div>

            {/* Country */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "#475569" }}>Land</label>
              <Input
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                placeholder="bijv. NL"
                className="h-9"
              />
            </div>

            {/* Account manager */}
            {accountManagers.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" style={{ color: "#475569" }}>Accountmanager</label>
                <Select
                  value={filterAccountManagerId || "ALL"}
                  onValueChange={(v) => setFilterAccountManagerId(v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Alle accountmanagers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Alle accountmanagers</SelectItem>
                    {accountManagers.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date range */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "#475569" }}>Aangemaakt van</label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "#475569" }}>Aangemaakt tot</label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="mt-8 flex gap-2">
            <Button className="flex-1" onClick={applyAdvancedFilters}>
              Toepassen
            </Button>
            <Button variant="outline" onClick={clearAdvancedFilters}>
              Wissen
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[560px] sm:max-w-[560px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? "Klant bewerken" : "Nieuwe klant"}</SheetTitle>
            <SheetDescription>
              {editingId ? "Werk de klantgegevens bij." : "Vul de gegevens in om een nieuwe klant aan te maken."}
            </SheetDescription>
          </SheetHeader>
          <CustomerForm
            mode={editingId ? "edit" : "create"}
            customerId={editingId ?? undefined}
            sectors={sectors}
            customerTypes={customerTypes}
            accountManagers={accountManagers}
            canWriteNotes={canWriteNotes}
            onSuccess={handleFormSuccess}
            onCancel={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Klant verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert permanent <strong>{deleteTarget?.name}</strong>. Deze actie kan niet ongedaan worden gemaakt.
              Alle objecten gekoppeld aan deze klant moeten eerst worden verwijderd.
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

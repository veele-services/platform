"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FieldgridDataView,
  type FieldgridDataViewColumn,
} from "@/components/ui/fieldgrid-data-view";
import { Input } from "@/components/ui/input";
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
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  TenantActionMenu,
  TenantActiveFilters,
  TenantConfirmDialog,
  TenantFilterDrawer,
  TenantToolbar,
  TenantToolbarSearch,
} from "@/components/tenant-ui";
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
import {
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_LABELS,
} from "@/types/customer-status";

const PAGE_SIZE = 25;
const SORTABLE = ["name", "code", "city", "createdAt"] as const;

interface CustomersViewProps {
  rows: CustomerRow[];
  total: number;
  sectors: SectorOption[];
  customerTypes: CustomerTypeOption[];
  accountManagers: AccountManagerOption[];
  canWrite: boolean;
  canWriteNotes: boolean;
  page: number;
  initialSearch: string;
  initialSectorId: string;
  initialStatus: string;
  initialCustomerTypeId: string;
  initialSort: string;
  initialDir: string;
  initialCity: string;
  initialCountry: string;
  initialAccountManagerId: string;
  initialDateFrom: string;
  initialDateTo: string;
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
  const router = useRouter();
  const pathname = usePathname();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [exportPending, setExportPending] = useState(false);
  const [exportPdfPending, setExportPdfPending] = useState(false);
  const [bulkPending, startBulkTransition] = useTransition();
  const [bulkDeactivateOpen, setBulkDeactivateOpen] = useState(false);

  const [filterCity, setFilterCity] = useState(initialCity);
  const [filterCountry, setFilterCountry] = useState(initialCountry);
  const [filterAccountManagerId, setFilterAccountManagerId] = useState(
    initialAccountManagerId,
  );
  const [filterDateFrom, setFilterDateFrom] = useState(initialDateFrom);
  const [filterDateTo, setFilterDateTo] = useState(initialDateTo);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const advancedFilterCount = [
    initialCity,
    initialCountry,
    initialAccountManagerId,
    initialDateFrom,
    initialDateTo,
  ].filter(Boolean).length;
  const rowLabels = useMemo(
    () => new Map(rows.map((row) => [row.id, row.name])),
    [rows],
  );

  useEffect(() => {
    setSearchInput(initialSearch);
    setFilterCity(initialCity);
    setFilterCountry(initialCountry);
    setFilterAccountManagerId(initialAccountManagerId);
    setFilterDateFrom(initialDateFrom);
    setFilterDateTo(initialDateTo);
  }, [
    initialAccountManagerId,
    initialCity,
    initialCountry,
    initialDateFrom,
    initialDateTo,
    initialSearch,
  ]);

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      search: initialSearch || undefined,
      sectorId: initialSectorId || undefined,
      status: initialStatus !== "all" ? initialStatus : undefined,
      customerTypeId: initialCustomerTypeId || undefined,
      city: initialCity || undefined,
      country: initialCountry || undefined,
      accountManagerId: initialAccountManagerId || undefined,
      dateFrom: initialDateFrom || undefined,
      dateTo: initialDateTo || undefined,
      sort: initialSort !== "name" ? initialSort : undefined,
      dir: initialDir !== "asc" ? initialDir : undefined,
      page: page > 1 ? String(page) : undefined,
      ...overrides,
    };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function applyFilter(key: string, value: string) {
    router.replace(buildUrl({ [key]: value || undefined, page: undefined }));
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilter("search", searchInput.trim());
  }

  function handleSort(column: string) {
    if (!SORTABLE.includes(column as (typeof SORTABLE)[number])) return;
    const newDir =
      initialSort === column && initialDir === "asc" ? "desc" : "asc";
    router.replace(buildUrl({ sort: column, dir: newDir, page: undefined }));
  }

  function applyAdvancedFilters() {
    router.replace(
      buildUrl({
        city: filterCity.trim() || undefined,
        country: filterCountry.trim() || undefined,
        accountManagerId: filterAccountManagerId || undefined,
        dateFrom: filterDateFrom || undefined,
        dateTo: filterDateTo || undefined,
        page: undefined,
      }),
    );
  }

  function clearAdvancedFilters() {
    setFilterCity("");
    setFilterCountry("");
    setFilterAccountManagerId("");
    setFilterDateFrom("");
    setFilterDateTo("");
    router.replace(
      buildUrl({
        city: undefined,
        country: undefined,
        accountManagerId: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        page: undefined,
      }),
    );
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
      search: initialSearch || undefined,
      sectorId: initialSectorId || undefined,
      status: initialStatus !== "all" ? initialStatus : undefined,
      customerTypeId: initialCustomerTypeId || undefined,
      city: initialCity || undefined,
      country: initialCountry || undefined,
      accountManagerId: initialAccountManagerId || undefined,
      dateFrom: initialDateFrom || undefined,
      dateTo: initialDateTo || undefined,
    };
  }

  async function handleExport() {
    setExportPending(true);
    try {
      const result = await exportCustomers(activeExportParams());
      if (result.success) {
        const { csv, filename } = (
          result as { success: true; data: { csv: string; filename: string } }
        ).data;
        const blob = new Blob(["\uFEFF" + csv], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
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
        const { html } = (
          result as { success: true; data: { html: string; filename: string } }
        ).data;
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
        toast.success(
          `${ids.length} klant${ids.length > 1 ? "en" : ""} ${isActive ? "geactiveerd" : "gedeactiveerd"}`,
        );
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

  const activeFilters = [
    initialSearch
      ? {
          id: "search",
          label: "Zoeken",
          value: initialSearch,
          onRemove: () => applyFilter("search", ""),
        }
      : null,
    initialSectorId
      ? {
          id: "sector",
          label: "Sector",
          value:
            sectors.find((sector) => sector.id === initialSectorId)?.name ??
            initialSectorId,
          onRemove: () => applyFilter("sectorId", ""),
        }
      : null,
    initialCustomerTypeId
      ? {
          id: "customerType",
          label: "Type",
          value:
            customerTypes.find((type) => type.id === initialCustomerTypeId)
              ?.name ?? initialCustomerTypeId,
          onRemove: () => applyFilter("customerTypeId", ""),
        }
      : null,
    initialStatus !== "all"
      ? {
          id: "status",
          label: "Status",
          value:
            CUSTOMER_STATUS_LABELS[
              initialStatus as (typeof CUSTOMER_STATUSES)[number]
            ] ?? initialStatus,
          onRemove: () => applyFilter("status", ""),
        }
      : null,
    initialCity
      ? {
          id: "city",
          label: "Stad",
          value: initialCity,
          onRemove: () => applyFilter("city", ""),
        }
      : null,
    initialCountry
      ? {
          id: "country",
          label: "Land",
          value: initialCountry,
          onRemove: () => applyFilter("country", ""),
        }
      : null,
    initialAccountManagerId
      ? {
          id: "accountManager",
          label: "Accountmanager",
          value:
            accountManagers.find(
              (manager) => manager.id === initialAccountManagerId,
            )?.fullName ?? initialAccountManagerId,
          onRemove: () => applyFilter("accountManagerId", ""),
        }
      : null,
    initialDateFrom
      ? {
          id: "dateFrom",
          label: "Vanaf",
          value: initialDateFrom,
          onRemove: () => applyFilter("dateFrom", ""),
        }
      : null,
    initialDateTo
      ? {
          id: "dateTo",
          label: "Tot",
          value: initialDateTo,
          onRemove: () => applyFilter("dateTo", ""),
        }
      : null,
  ].filter(Boolean) as Parameters<typeof TenantActiveFilters>[0]["filters"];

  function renderRowActions(row: CustomerRow) {
    return (
      <TenantActionMenu
        actions={[
          {
            id: "view",
            label: "Bekijken",
            href: `/customers/${row.id}`,
            icon: <Eye className="h-4 w-4" />,
          },
          ...(canWrite
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
                  icon: row.isActive ? (
                    <ToggleLeft className="h-4 w-4" />
                  ) : (
                    <ToggleRight className="h-4 w-4" />
                  ),
                  separatorBefore: true,
                  onSelect: () => handleStatusToggle(row.id, row.isActive),
                },
                {
                  id: "delete",
                  label: "Verwijderen",
                  icon: <Trash2 className="h-4 w-4" />,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () =>
                    setDeleteTarget({ id: row.id, name: row.name }),
                },
              ]
            : []),
        ]}
      />
    );
  }

  const columns: FieldgridDataViewColumn<CustomerRow>[] = [
    {
      id: "code",
      label: "Code",
      sortable: true,
      cell: (row) => (
        <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          {row.code}
        </span>
      ),
    },
    {
      id: "name",
      label: "Naam",
      sortable: true,
      hideable: false,
      cell: (row) => (
        <Link
          href={`/customers/${row.id}`}
          className="block max-w-[20rem] truncate font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {row.name}
        </Link>
      ),
    },
    {
      id: "sector",
      label: "Sector",
      cell: (row) => row.sectorName ?? "—",
    },
    {
      id: "customerType",
      label: "Type",
      cell: (row) =>
        row.customerTypeName ? (
          <Badge variant="secondary">{row.customerTypeName}</Badge>
        ) : (
          "—"
        ),
    },
    {
      id: "city",
      label: "Stad",
      sortable: true,
      cell: (row) => row.city ?? "—",
    },
    {
      id: "accountManager",
      label: "Accountmanager",
      cell: (row) => row.accountManagerName ?? "—",
    },
    {
      id: "createdAt",
      label: "Aangemaakt",
      sortable: true,
      hiddenByDefault: true,
      cell: (row) =>
        new Date(row.createdAt).toLocaleDateString("nl-NL", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
    },
    {
      id: "status",
      label: "Status",
      cell: (row) => <CustomerStatusBadge status={row.status} />,
    },
    {
      id: "actions",
      label: "Acties",
      hideable: false,
      headerClassName: "w-14 text-right",
      className: "text-right",
      cell: renderRowActions,
    },
  ];

  return (
    <>
      {/* Toolbar */}
      <TenantToolbar
        search={
          <form
            onSubmit={handleSearchSubmit}
            className="flex min-w-0 flex-1 gap-2 sm:max-w-md"
          >
            <TenantToolbarSearch
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Zoek op naam of code..."
              wrapperClassName="max-w-none"
            />
            <Button type="submit" variant="outline" size="sm">
              Zoeken
            </Button>
          </form>
        }
        actions={
          <>
            <Select
              value={initialSectorId || "ALL"}
              onValueChange={(v) =>
                applyFilter("sectorId", v === "ALL" ? "" : v)
              }
            >
              <SelectTrigger
                className="w-[150px] h-9"
                aria-label="Filter op sector"
              >
                <SelectValue placeholder="Alle sectoren" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Alle sectoren</SelectItem>
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {customerTypes.length > 0 && (
              <Select
                value={initialCustomerTypeId || "ALL"}
                onValueChange={(v) =>
                  applyFilter("customerTypeId", v === "ALL" ? "" : v)
                }
              >
                <SelectTrigger
                  className="w-[150px] h-9"
                  aria-label="Filter op klanttype"
                >
                  <SelectValue placeholder="Alle types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Alle types</SelectItem>
                  {customerTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select
              value={initialStatus || "all"}
              onValueChange={(v) => applyFilter("status", v === "all" ? "" : v)}
            >
              <SelectTrigger
                className="w-[140px] h-9"
                aria-label="Filter op status"
              >
                <SelectValue placeholder="Alle statussen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                {CUSTOMER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {CUSTOMER_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <TenantFilterDrawer
              activeCount={advancedFilterCount}
              title="Klantfilters"
              description="Filter klanten op stad, land, accountmanager of aanmaakdatum."
              open={filterDrawerOpen}
              onOpenChange={(open) => {
                if (open) openFilterDrawer();
                else setFilterDrawerOpen(false);
              }}
              onApply={applyAdvancedFilters}
              onReset={clearAdvancedFilters}
              resetLabel="Wissen"
            >
              <div className="grid gap-4">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">Stad</span>
                  <Input
                    value={filterCity}
                    onChange={(e) => setFilterCity(e.target.value)}
                    placeholder="bijv. Amsterdam"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">Land</span>
                  <Input
                    value={filterCountry}
                    onChange={(e) => setFilterCountry(e.target.value)}
                    placeholder="bijv. NL"
                  />
                </label>
                {accountManagers.length > 0 && (
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-foreground">
                      Accountmanager
                    </span>
                    <Select
                      value={filterAccountManagerId || "ALL"}
                      onValueChange={(v) =>
                        setFilterAccountManagerId(v === "ALL" ? "" : v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Alle accountmanagers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">
                          Alle accountmanagers
                        </SelectItem>
                        {accountManagers.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                )}
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">
                    Aangemaakt van
                  </span>
                  <Input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">
                    Aangemaakt tot
                  </span>
                  <Input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                  />
                </label>
              </div>
            </TenantFilterDrawer>

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
          </>
        }
        activeFilters={<TenantActiveFilters filters={activeFilters} />}
      />

      {/* FieldgridDataView owns the responsive BulkActionBar composition. */}
      <FieldgridDataView
        className="mt-4"
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        caption="Klanten met sector, type, vestigingsplaats, accountmanager en status"
        hasActiveFilters={activeFilters.length > 0}
        emptyTitle="Nog geen klanten"
        emptyDescription="Maak de eerste klant aan om objecten, contactpersonen en planning te koppelen."
        filteredEmptyTitle="Geen klanten gevonden"
        filteredEmptyDescription="Pas de zoekopdracht of actieve filters aan."
        emptyAction={
          canWrite ? (
            <Button type="button" onClick={openCreate}>
              <Plus className="size-4" />
              Nieuwe klant
            </Button>
          ) : undefined
        }
        preferenceKey="fieldgrid:customers:data-view"
        savedViews={{
          storageKey: "fieldgrid:customers:saved-views",
          currentQuery: buildUrl({ page: undefined }).split("?")[1] ?? "",
          onApplyQuery: (query) =>
            router.replace(query ? `${pathname}?${query}` : pathname),
        }}
        sort={{
          key: initialSort,
          direction: initialDir === "desc" ? "desc" : "asc",
          onChange: handleSort,
        }}
        selection={
          canWrite
            ? {
                selectedIds: selected,
                onSelectionChange: setSelected,
                getRowLabel: (rowId) => rowLabels.get(rowId) ?? "klant",
              }
            : undefined
        }
        bulkActions={
          canWrite
            ? ({ clear }) => (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleBulkStatus(true)}
                    disabled={bulkPending}
                  >
                    <ToggleRight className="size-4" />
                    Activeren
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBulkDeactivateOpen(true)}
                    disabled={bulkPending}
                  >
                    <ToggleLeft className="size-4" />
                    Deactiveren
                  </Button>
                  <Button type="button" variant="ghost" onClick={clear}>
                    Selectie wissen
                  </Button>
                </>
              )
            : undefined
        }
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          pageCount: totalPages,
          total,
          onPageChange: (nextPage) =>
            router.replace(buildUrl({ page: String(nextPage) })),
        }}
        renderMobileCard={(row, _index, context) => (
          <article
            aria-labelledby={`customer-mobile-${row.id}-title`}
            className="rounded-lg border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {context.selectionControl}
                <div className="min-w-0">
                  <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {row.code}
                  </span>
                  <Link
                    id={`customer-mobile-${row.id}-title`}
                    href={`/customers/${row.id}`}
                    className="mt-2 block font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {row.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {row.city ?? "Geen stad"}
                  </p>
                </div>
              </div>
              {renderRowActions(row)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <CustomerStatusBadge status={row.status} />
              <span>{row.sectorName ?? "Geen sector"}</span>
              {row.customerTypeName ? (
                <Badge variant="secondary">{row.customerTypeName}</Badge>
              ) : null}
              {row.accountManagerName ? (
                <span>{row.accountManagerName}</span>
              ) : null}
            </div>
          </article>
        )}
      />

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-[560px]"
        >
          <SheetHeader>
            <SheetTitle>
              {editingId ? "Klant bewerken" : "Nieuwe klant"}
            </SheetTitle>
            <SheetDescription>
              {editingId
                ? "Werk de klantgegevens bij."
                : "Vul de gegevens in om een nieuwe klant aan te maken."}
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

      <TenantConfirmDialog
        open={bulkDeactivateOpen}
        onOpenChange={setBulkDeactivateOpen}
        title={`${selected.size} klanten deactiveren?`}
        description="De geselecteerde klanten worden niet meer als actief getoond. Je kunt ze later opnieuw activeren."
        confirmLabel={bulkPending ? "Deactiveren..." : "Deactiveren"}
        destructive
        onConfirm={() => handleBulkStatus(false)}
      />

      <TenantConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Klant verwijderen?"
        description={
          deleteTarget
            ? `Dit verwijdert permanent ${deleteTarget.name}. Deze actie kan niet ongedaan worden gemaakt. Alle objecten gekoppeld aan deze klant moeten eerst worden verwijderd.`
            : undefined
        }
        confirmLabel="Verwijderen"
        destructive
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

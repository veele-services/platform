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
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { ObjectForm } from "@/components/objects/ObjectForm";
import {
  bulkSetObjectStatus,
  setObjectStatus,
  deleteObject,
  type ObjectRow,
  type CustomerOption,
} from "@/app/actions/objects";
import type { RegionOption } from "@/app/actions/regions";
import type { SectorOption } from "@/app/actions/sectors";
import { trackUxAnalytics } from "@/lib/ux-analytics";

const PAGE_SIZE = 25;
const SORTABLE = ["name", "code", "city", "createdAt"] as const;

// ─── Main component ───────────────────────────────────────────────────────────

interface ObjectsViewProps {
  rows:                ObjectRow[];
  total:               number;
  customers:           CustomerOption[];
  sectors:             SectorOption[];
  regionOptions:       RegionOption[];
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
  sectors,
  regionOptions,
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
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState(initialStatus || "all");
  const [draftServiceType, setDraftServiceType] = useState(initialServiceType);
  const [draftRegion, setDraftRegion] = useState(initialRegion);
  const [deleteTarget,  setDeleteTarget]  = useState<{ id: string; name: string } | null>(null);
  const [bulkPending,   startBulkTransition] = useTransition();
  const [bulkDeactivateOpen, setBulkDeactivateOpen] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const rowLabels = useMemo(
    () => new Map(rows.map((row) => [row.id, row.name])),
    [rows],
  );

  useEffect(() => {
    setSearchInput(initialSearch);
    setDraftStatus(initialStatus || "all");
    setDraftServiceType(initialServiceType);
    setDraftRegion(initialRegion);
  }, [
    initialRegion,
    initialSearch,
    initialServiceType,
    initialStatus,
  ]);

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
    trackUxAnalytics({
      name: "search_submitted",
      surface: "objects",
      scope: "current_context",
      activeFilterCount: activeFilters.length,
    });
    applyFilter("search", searchInput);
  }

  function applyDraftFilters() {
    trackUxAnalytics({
      name: "filter_changed",
      surface: "objects",
      action: "applied",
      activeFilterCount: [
        initialCustomerId,
        draftStatus !== "all" ? draftStatus : "",
        draftServiceType.trim(),
        draftRegion.trim(),
      ].filter(Boolean).length,
    });
    router.replace(
      buildUrl({
        status: draftStatus === "all" ? undefined : draftStatus,
        serviceType: draftServiceType.trim() || undefined,
        region: draftRegion.trim() || undefined,
        page: undefined,
      }),
    );
  }

  function resetFilters() {
    setDraftStatus("all");
    setDraftServiceType("");
    setDraftRegion("");
    setFilterDrawerOpen(false);
    trackUxAnalytics({
      name: "filter_changed",
      surface: "objects",
      action: "cleared",
      activeFilterCount: 0,
    });
    router.replace(
      buildUrl({
        customerId: undefined,
        status: undefined,
        serviceType: undefined,
        region: undefined,
        page: undefined,
      }),
    );
  }

  function handleSort(column: string) {
    if (!SORTABLE.includes(column as typeof SORTABLE[number])) return;
    const newDir =
      initialSort === column && initialDir === "asc" ? "desc" : "asc";
    router.replace(buildUrl({ sort: column, dir: newDir, page: undefined }));
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

  const activeFilters = [
    initialSearch ? { id: "search", label: "Zoeken", value: initialSearch, onRemove: () => applyFilter("search", "") } : null,
    initialStatus !== "all"
      ? { id: "status", label: "Status", value: initialStatus === "active" ? "Actief" : "Inactief", onRemove: () => applyFilter("status", "") }
      : null,
    initialServiceType
      ? { id: "serviceType", label: "Diensttype", value: initialServiceType, onRemove: () => applyFilter("serviceType", "") }
      : null,
    initialRegion ? { id: "region", label: "Regio", value: initialRegion, onRemove: () => applyFilter("region", "") } : null,
    initialCustomerId
      ? {
          id: "customer",
          label: "Klant",
          value: customers.find((customer) => customer.id === initialCustomerId)?.name ?? initialCustomerId,
          onRemove: () => applyFilter("customerId", ""),
        }
      : null,
  ].filter(Boolean) as Parameters<typeof TenantActiveFilters>[0]["filters"];

  function renderRowActions(row: ObjectRow) {
    return (
      <TenantActionMenu
        actions={[
          {
            id: "view",
            label: "Bekijken",
            href: `/objects/${row.id}`,
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
                  icon: row.isActive ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />,
                  separatorBefore: true,
                  onSelect: () => handleStatusToggle(row.id, row.isActive),
                },
                {
                  id: "delete",
                  label: "Verwijderen",
                  icon: <Trash2 className="h-4 w-4" />,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => setDeleteTarget({ id: row.id, name: row.name }),
                },
              ]
            : []),
        ]}
      />
    );
  }

  const columns: FieldgridDataViewColumn<ObjectRow>[] = [
    {
      id: "name",
      label: "Object",
      sortable: true,
      hideable: false,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Building2 className="size-4" />
          </div>
          <div className="min-w-0">
            <Link
              href={`/objects/${row.id}`}
              className="block max-w-[18rem] truncate font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.name}
            </Link>
            <span className="font-mono text-xs text-muted-foreground">
              {row.code}
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "city",
      label: "Adres",
      sortable: true,
      cell: (row) =>
        [row.address, row.city].filter(Boolean).join(", ") || "—",
    },
    {
      id: "serviceType",
      label: "Diensttype",
      cell: (row) =>
        row.serviceType ? (
          <Badge variant="secondary">{row.serviceType}</Badge>
        ) : (
          "—"
        ),
    },
    {
      id: "nextServiceDate",
      label: "Eerstvolgende dienst",
      cell: (row) =>
        row.nextServiceDate
          ? new Date(row.nextServiceDate).toLocaleDateString("nl-NL", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "—",
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
      cell: (row) => <StatusBadge isActive={row.isActive} />,
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
          <form onSubmit={handleSearchSubmit} className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
            <TenantToolbarSearch
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Zoek op naam of code..."
              wrapperClassName="max-w-none"
            />
            <Button type="submit" variant="outline" size="sm">Zoeken</Button>
          </form>
        }
        actions={
          <>
            <TenantFilterDrawer
              activeCount={[
                initialCustomerId,
                initialStatus !== "all" ? initialStatus : "",
                initialServiceType,
                initialRegion,
              ].filter(Boolean).length}
              title="Objectfilters"
              open={filterDrawerOpen}
              onOpenChange={setFilterDrawerOpen}
              onApply={applyDraftFilters}
              onReset={resetFilters}
            >
              <div className="grid gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="object-status-filter"
                    className="text-sm font-semibold"
                  >
                    Status
                  </label>
                  <Select
                    value={draftStatus}
                    onValueChange={setDraftStatus}
                  >
                    <SelectTrigger id="object-status-filter" className="w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle statussen</SelectItem>
                      <SelectItem value="active">Actief</SelectItem>
                      <SelectItem value="inactive">Inactief</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="object-service-filter"
                    className="text-sm font-semibold"
                  >
                    Diensttype
                  </label>
                  <Input
                    id="object-service-filter"
                    value={draftServiceType}
                    onChange={(event) =>
                      setDraftServiceType(event.target.value)
                    }
                    placeholder="Bijvoorbeeld: schoonmaak"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="object-region-filter"
                    className="text-sm font-semibold"
                  >
                    Regio of stad
                  </label>
                  <Input
                    id="object-region-filter"
                    value={draftRegion}
                    onChange={(event) => setDraftRegion(event.target.value)}
                    placeholder="Bijvoorbeeld: Den Haag"
                  />
                </div>

                {initialCustomerId ? (
                  <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                    De actieve klantselectie wordt verwijderd wanneer je de
                    filters reset.
                  </p>
                ) : null}
              </div>
            </TenantFilterDrawer>

        <div className="ml-auto flex items-center gap-2">
          {canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nieuw object
            </Button>
          )}
        </div>
          </>
        }
        activeFilters={<TenantActiveFilters filters={activeFilters} />}
      />

      <FieldgridDataView
        className="mt-4"
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        caption="Objecten met adres, dienstverlening, eerstvolgende dienst en status"
        hasActiveFilters={activeFilters.length > 0}
        emptyTitle="Nog geen objecten"
        emptyDescription="Maak het eerste object aan om werk, dienstverlening en planning te koppelen."
        filteredEmptyTitle="Geen objecten gevonden"
        filteredEmptyDescription="Pas de zoekopdracht of actieve filters aan."
        emptyAction={
          canWrite ? (
            <Button type="button" onClick={openCreate}>
              <Plus className="size-4" />
              Nieuw object
            </Button>
          ) : undefined
        }
        preferenceKey="fieldgrid:objects:data-view"
        savedViews={{
          storageKey: "fieldgrid:objects:saved-views",
          analyticsSurface: "objects",
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
                getRowLabel: (rowId) => rowLabels.get(rowId) ?? "object",
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
        renderMobileCard={(row, _index, context) => {
          const fullAddress = [row.address, row.city]
            .filter(Boolean)
            .join(", ");
          return (
            <article
              aria-labelledby={`object-mobile-${row.id}-title`}
              className="rounded-lg border border-border bg-card p-4 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {context.selectionControl}
                  <div className="min-w-0">
                    <Link
                      id={`object-mobile-${row.id}-title`}
                      href={`/objects/${row.id}`}
                      className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.name}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">
                      {row.code}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {fullAddress || "Geen adres"}
                    </p>
                  </div>
                </div>
                {renderRowActions(row)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge isActive={row.isActive} />
                {row.serviceType ? (
                  <Badge variant="secondary">{row.serviceType}</Badge>
                ) : null}
                {row.nextServiceDate ? (
                  <span>
                    Volgende dienst{" "}
                    {new Date(row.nextServiceDate).toLocaleDateString("nl-NL")}
                  </span>
                ) : null}
              </div>
            </article>
          );
        }}
      />

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-[560px]"
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
            sectors={sectors}
            customers={customers}
            regionOptions={regionOptions}
            onSuccess={handleFormSuccess}
            onCancel={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <TenantConfirmDialog
        open={bulkDeactivateOpen}
        onOpenChange={setBulkDeactivateOpen}
        title={`${selected.size} objecten deactiveren?`}
        description="De geselecteerde objecten worden inactief. Je kunt ze later opnieuw activeren."
        confirmLabel={bulkPending ? "Deactiveren..." : "Deactiveren"}
        destructive
        onConfirm={() => handleBulkStatus(false)}
      />

      <TenantConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Object verwijderen?"
        description={deleteTarget ? `Dit verwijdert permanent ${deleteTarget.name}. Deze actie kan niet ongedaan worden gemaakt.` : undefined}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

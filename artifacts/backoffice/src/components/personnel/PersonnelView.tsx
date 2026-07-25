"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Eye,
  Pencil,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";

import {
  bulkSetPersonnelStatus,
  deletePersonnel,
  setPersonnelStatus,
  type PersonnelRow,
  type RoleOption,
  type SectorOption,
} from "@/app/actions/personnel";
import type { AvailabilityStatus } from "@/app/actions/availability";
import { PersonnelForm } from "@/components/personnel/PersonnelForm";
import { SlimProfielPanel } from "@/components/personnel/SlimProfielPanel";
import {
  TenantActionMenu,
  TenantActiveFilters,
  TenantConfirmDialog,
  TenantFilterDrawer,
  TenantToolbar,
  TenantToolbarSearch,
} from "@/components/tenant-ui";
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatPersonnelRoleName } from "@/lib/personnel-role-labels";
import {
  PERSONNEL_TYPES,
  PERSONNEL_TYPE_LABELS,
  type PersonnelType,
} from "@/types/personnel";

type InviteStatus = "none" | "invited" | "active";

type BadgeTone = {
  label: string;
  className: string;
  indicatorClassName: string;
};

const INVITE_BADGE: Record<InviteStatus, BadgeTone> = {
  none: {
    label: "Geen account",
    className: "bg-muted text-muted-foreground ring-border",
    indicatorClassName: "bg-muted-foreground",
  },
  invited: {
    label: "Wachtwoord verstuurd",
    className: "bg-warning/10 text-foreground ring-warning/30",
    indicatorClassName: "bg-warning",
  },
  active: {
    label: "Portaal actief",
    className: "bg-success/10 text-foreground ring-success/30",
    indicatorClassName: "bg-success",
  },
};

const AVAILABILITY_BADGE: Record<AvailabilityStatus, BadgeTone> = {
  beschikbaar: {
    label: "Beschikbaar",
    className: "bg-success/10 text-foreground ring-success/30",
    indicatorClassName: "bg-success",
  },
  op_verlof: {
    label: "Op verlof",
    className: "bg-info/10 text-foreground ring-info/30",
    indicatorClassName: "bg-info",
  },
  ziek: {
    label: "Ziek",
    className: "bg-danger/10 text-foreground ring-danger/30",
    indicatorClassName: "bg-danger",
  },
  niet_beschikbaar: {
    label: "Niet beschikbaar",
    className: "bg-warning/10 text-foreground ring-warning/30",
    indicatorClassName: "bg-warning",
  },
  niet_ingesteld: {
    label: "Niet ingesteld",
    className: "bg-muted text-muted-foreground ring-border",
    indicatorClassName: "bg-muted-foreground",
  },
};

const PAGE_SIZE = 25;
const SORTABLE = [
  "lastName",
  "firstName",
  "email",
  "code",
  "region",
  "createdAt",
] as const;

function getInviteStatus(
  userId: string | null,
  inviteSentAt: string | null,
): InviteStatus {
  if (userId) return "active";
  if (inviteSentAt) return "invited";
  return "none";
}

function ToneBadge({ tone }: { tone: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tone.className}`}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${tone.indicatorClassName}`}
        aria-hidden="true"
      />
      {tone.label}
    </span>
  );
}

function InviteBadge({
  userId,
  inviteSentAt,
}: {
  userId: string | null;
  inviteSentAt: string | null;
}) {
  return (
    <ToneBadge tone={INVITE_BADGE[getInviteStatus(userId, inviteSentAt)]} />
  );
}

function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  return <ToneBadge tone={AVAILABILITY_BADGE[status]} />;
}

function PersonnelTypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="secondary">
      {PERSONNEL_TYPE_LABELS[type as PersonnelType] ?? type}
    </Badge>
  );
}

function QualificationChips({
  tags,
  max = 2,
}: {
  tags: string[];
  max?: number;
}) {
  if (tags.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const visible = tags.slice(0, max);
  const overflow = tags.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((tag) => (
        <Badge key={tag} variant="outline">
          {tag}
        </Badge>
      ))}
      {overflow > 0 ? (
        <span className="self-center text-xs text-muted-foreground">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

interface PersonnelViewProps {
  rows: PersonnelRow[];
  total: number;
  roles: RoleOption[];
  sectors: SectorOption[];
  canWrite: boolean;
  page: number;
  initialSearch: string;
  initialRoleId: string;
  initialSectorId: string;
  initialRegion: string;
  initialStatus: string;
  initialSort: string;
  initialDir: string;
  initialPersonnelType: string;
}

export function PersonnelView({
  rows,
  total,
  roles,
  sectors,
  canWrite,
  page,
  initialSearch,
  initialRoleId,
  initialSectorId,
  initialRegion,
  initialStatus,
  initialSort,
  initialDir,
  initialPersonnelType,
}: PersonnelViewProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [draftRoleId, setDraftRoleId] = useState(initialRoleId || "ALL");
  const [draftSectorId, setDraftSectorId] = useState(initialSectorId || "ALL");
  const [draftRegion, setDraftRegion] = useState(initialRegion);
  const [draftStatus, setDraftStatus] = useState(initialStatus || "all");
  const [draftPersonnelType, setDraftPersonnelType] = useState(
    initialPersonnelType || "ALL",
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [slimProfiel, setSlimProfiel] = useState<PersonnelRow | null>(null);
  const [bulkPending, startBulkTransition] = useTransition();
  const [bulkDeactivateOpen, setBulkDeactivateOpen] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const rowLabels = useMemo(
    () =>
      new Map(
        rows.map((row) => [row.id, `${row.firstName} ${row.lastName}`.trim()]),
      ),
    [rows],
  );

  useEffect(() => {
    setSearchInput(initialSearch);
    setDraftRoleId(initialRoleId || "ALL");
    setDraftSectorId(initialSectorId || "ALL");
    setDraftRegion(initialRegion);
    setDraftStatus(initialStatus || "all");
    setDraftPersonnelType(initialPersonnelType || "ALL");
  }, [
    initialPersonnelType,
    initialRegion,
    initialRoleId,
    initialSearch,
    initialSectorId,
    initialStatus,
  ]);

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      search: initialSearch || undefined,
      roleId: initialRoleId || undefined,
      sectorId: initialSectorId || undefined,
      region: initialRegion || undefined,
      status: initialStatus !== "all" ? initialStatus : undefined,
      personnelType: initialPersonnelType || undefined,
      sort: initialSort !== "lastName" ? initialSort : undefined,
      dir: initialDir !== "asc" ? initialDir : undefined,
      page: page > 1 ? String(page) : undefined,
      ...overrides,
    };

    Object.entries(merged).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function applyFilter(key: string, value: string) {
    router.replace(buildUrl({ [key]: value || undefined, page: undefined }));
  }

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    applyFilter("search", searchInput.trim());
  }

  function applyDraftFilters() {
    router.replace(
      buildUrl({
        roleId: draftRoleId === "ALL" ? undefined : draftRoleId,
        sectorId: draftSectorId === "ALL" ? undefined : draftSectorId,
        region: draftRegion.trim() || undefined,
        status: draftStatus === "all" ? undefined : draftStatus,
        personnelType:
          draftPersonnelType === "ALL" ? undefined : draftPersonnelType,
        page: undefined,
      }),
    );
  }

  function resetFilters() {
    setDraftRoleId("ALL");
    setDraftSectorId("ALL");
    setDraftRegion("");
    setDraftStatus("all");
    setDraftPersonnelType("ALL");
    setFilterDrawerOpen(false);
    router.replace(
      buildUrl({
        roleId: undefined,
        sectorId: undefined,
        region: undefined,
        status: undefined,
        personnelType: undefined,
        page: undefined,
      }),
    );
  }

  function handleSort(column: string) {
    if (!SORTABLE.includes(column as (typeof SORTABLE)[number])) return;
    const nextDirection =
      initialSort === column && initialDir === "asc" ? "desc" : "asc";
    router.replace(
      buildUrl({
        sort: column,
        dir: nextDirection,
        page: undefined,
      }),
    );
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

  function openQuickView(row: PersonnelRow) {
    setSlimProfiel(row);
  }

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
        toast.success(
          `${ids.length} medewerker${ids.length > 1 ? "s" : ""} ${
            isActive ? "geactiveerd" : "gedeactiveerd"
          }`,
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
      const result = await deletePersonnel(id);
      if (result.success) {
        toast.success(`"${name}" verwijderd`);
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
    initialRegion
      ? {
          id: "region",
          label: "Branch/regio",
          value: initialRegion,
          onRemove: () => applyFilter("region", ""),
        }
      : null,
    initialRoleId
      ? {
          id: "role",
          label: "Rol",
          value:
            formatPersonnelRoleName(
              roles.find((role) => role.id === initialRoleId)?.name,
            ) || initialRoleId,
          onRemove: () => applyFilter("roleId", ""),
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
    initialPersonnelType && initialPersonnelType !== "ALL"
      ? {
          id: "personnelType",
          label: "Type",
          value:
            PERSONNEL_TYPE_LABELS[initialPersonnelType as PersonnelType] ??
            initialPersonnelType,
          onRemove: () => applyFilter("personnelType", ""),
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

  function renderRowActions(row: PersonnelRow) {
    return (
      <TenantActionMenu
        actions={[
          {
            id: "quick-view",
            label: "Snel bekijken",
            icon: <UserCircle2 className="size-4" />,
            onSelect: () => openQuickView(row),
          },
          {
            id: "view",
            label: "Volledig profiel",
            href: `/personnel/${row.id}`,
            icon: <Eye className="size-4" />,
          },
          ...(canWrite
            ? [
                {
                  id: "edit",
                  label: "Bewerken",
                  icon: <Pencil className="size-4" />,
                  onSelect: () => {
                    setSlimProfiel(null);
                    openEdit(row.id);
                  },
                },
                {
                  id: "status",
                  label: row.isActive ? "Deactiveren" : "Activeren",
                  icon: row.isActive ? (
                    <ToggleLeft className="size-4" />
                  ) : (
                    <ToggleRight className="size-4" />
                  ),
                  disabled: bulkPending,
                  separatorBefore: true,
                  onSelect: () => handleStatusToggle(row.id, row.isActive),
                },
                {
                  id: "delete",
                  label: "Verwijderen",
                  icon: <Trash2 className="size-4" />,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () =>
                    setDeleteTarget({
                      id: row.id,
                      name: `${row.firstName} ${row.lastName}`,
                    }),
                },
              ]
            : []),
        ]}
      />
    );
  }

  const columns: FieldgridDataViewColumn<PersonnelRow>[] = [
    {
      id: "lastName",
      label: "Naam",
      sortable: true,
      hideable: false,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {row.firstName[0]?.toUpperCase()}
            {row.lastName[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <Link
              href={`/personnel/${row.id}`}
              className="block max-w-[18rem] truncate font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.lastName}, {row.firstName}
            </Link>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto min-h-0 justify-start p-0 text-xs text-muted-foreground"
              onClick={() => openQuickView(row)}
            >
              Snel bekijken
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: "role",
      label: "Rol",
      cell: (row) => formatPersonnelRoleName(row.roleName) || "—",
    },
    {
      id: "region",
      label: "Branch/regio",
      sortable: true,
      cell: (row) => row.region || "—",
    },
    {
      id: "availability",
      label: "Beschikbaarheid",
      cell: (row) => <AvailabilityBadge status={row.availabilityStatus} />,
    },
    {
      id: "portal",
      label: "Portaal",
      cell: (row) => (
        <InviteBadge userId={row.userId} inviteSentAt={row.inviteSentAt} />
      ),
    },
    {
      id: "status",
      label: "Status",
      cell: (row) => <StatusBadge isActive={row.isActive} />,
    },
    {
      id: "code",
      label: "Code",
      sortable: true,
      hiddenByDefault: true,
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.code}
        </span>
      ),
    },
    {
      id: "email",
      label: "E-mail",
      sortable: true,
      hiddenByDefault: true,
      cell: (row) => (
        <span className="block max-w-[18rem] truncate">{row.email}</span>
      ),
    },
    {
      id: "personnelType",
      label: "Type",
      hiddenByDefault: true,
      cell: (row) => <PersonnelTypeBadge type={row.personnelType} />,
    },
    {
      id: "sector",
      label: "Sector",
      hiddenByDefault: true,
      cell: (row) =>
        row.sectorName ? (
          <Badge variant="outline">{row.sectorName}</Badge>
        ) : (
          "—"
        ),
    },
    {
      id: "certificates",
      label: "Certificaten",
      hiddenByDefault: true,
      cell: (row) => <QualificationChips tags={row.certificates} max={1} />,
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
      <TenantToolbar
        search={
          <form
            onSubmit={handleSearchSubmit}
            className="flex min-w-0 flex-1 gap-2 sm:max-w-md"
          >
            <TenantToolbarSearch
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Zoek op naam of e-mail…"
              wrapperClassName="max-w-none"
            />
            <Button type="submit" variant="outline" size="sm">
              Zoeken
            </Button>
          </form>
        }
        actions={
          <>
            <TenantFilterDrawer
              activeCount={
                [
                  initialRoleId,
                  initialSectorId,
                  initialRegion,
                  initialStatus !== "all" ? initialStatus : "",
                  initialPersonnelType,
                ].filter(Boolean).length
              }
              title="Personeelsfilters"
              open={filterDrawerOpen}
              onOpenChange={setFilterDrawerOpen}
              onApply={applyDraftFilters}
              onReset={resetFilters}
            >
              <div className="grid gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="personnel-role-filter"
                    className="text-sm font-semibold"
                  >
                    Rol
                  </label>
                  <Select value={draftRoleId} onValueChange={setDraftRoleId}>
                    <SelectTrigger
                      id="personnel-role-filter"
                      className="w-full"
                    >
                      <SelectValue placeholder="Alle rollen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Alle rollen</SelectItem>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {formatPersonnelRoleName(role.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="personnel-sector-filter"
                    className="text-sm font-semibold"
                  >
                    Sector
                  </label>
                  <Select
                    value={draftSectorId}
                    onValueChange={setDraftSectorId}
                  >
                    <SelectTrigger
                      id="personnel-sector-filter"
                      className="w-full"
                    >
                      <SelectValue placeholder="Alle sectoren" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Alle sectoren</SelectItem>
                      {sectors.map((sector) => (
                        <SelectItem key={sector.id} value={sector.id}>
                          {sector.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="personnel-region-filter"
                    className="text-sm font-semibold"
                  >
                    Branch/regio
                  </label>
                  <Input
                    id="personnel-region-filter"
                    value={draftRegion}
                    onChange={(event) => setDraftRegion(event.target.value)}
                    placeholder="Bijvoorbeeld: Utrecht"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="personnel-type-filter"
                    className="text-sm font-semibold"
                  >
                    Type
                  </label>
                  <Select
                    value={draftPersonnelType}
                    onValueChange={setDraftPersonnelType}
                  >
                    <SelectTrigger
                      id="personnel-type-filter"
                      className="w-full"
                    >
                      <SelectValue placeholder="Alle types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Alle types</SelectItem>
                      {PERSONNEL_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {PERSONNEL_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="personnel-status-filter"
                    className="text-sm font-semibold"
                  >
                    Status
                  </label>
                  <Select value={draftStatus} onValueChange={setDraftStatus}>
                    <SelectTrigger
                      id="personnel-status-filter"
                      className="w-full"
                    >
                      <SelectValue placeholder="Alle statussen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle statussen</SelectItem>
                      <SelectItem value="active">Actief</SelectItem>
                      <SelectItem value="inactive">Inactief</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TenantFilterDrawer>

            <div className="ml-auto">
              {canWrite ? (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="size-4" />
                  Nieuw personeelslid
                </Button>
              ) : null}
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
        caption="Personeel met rol, regio, beschikbaarheid, portaaltoegang en status"
        hasActiveFilters={activeFilters.length > 0}
        emptyTitle="Nog geen personeelsleden"
        emptyDescription="Voeg het eerste personeelslid toe om beschikbaarheid en planning te beheren."
        filteredEmptyTitle="Geen personeelsleden gevonden"
        filteredEmptyDescription="Pas de zoekopdracht of actieve filters aan."
        emptyAction={
          canWrite ? (
            <Button type="button" onClick={openCreate}>
              <Plus className="size-4" />
              Nieuw personeelslid
            </Button>
          ) : undefined
        }
        preferenceKey="fieldgrid:personnel:data-view"
        savedViews={{
          storageKey: "fieldgrid:personnel:saved-views",
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
                getRowLabel: (rowId) => rowLabels.get(rowId) ?? "personeelslid",
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
            aria-labelledby={`personnel-mobile-${row.id}-title`}
            className="rounded-lg border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {context.selectionControl}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <UserCircle2 className="size-4 text-muted-foreground" />
                    <Link
                      id={`personnel-mobile-${row.id}-title`}
                      href={`/personnel/${row.id}`}
                      className="truncate font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.firstName} {row.lastName}
                    </Link>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatPersonnelRoleName(row.roleName) ||
                      "Geen rol ingesteld"}
                    {row.region ? ` · ${row.region}` : ""}
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="-ml-3 mt-0.5 text-xs text-muted-foreground"
                    onClick={() => openQuickView(row)}
                  >
                    Snel bekijken
                  </Button>
                </div>
              </div>
              {renderRowActions(row)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <AvailabilityBadge status={row.availabilityStatus} />
              <InviteBadge
                userId={row.userId}
                inviteSentAt={row.inviteSentAt}
              />
              <StatusBadge isActive={row.isActive} />
            </div>
          </article>
        )}
      />

      <Sheet
        open={slimProfiel !== null}
        onOpenChange={(open) => {
          if (!open) setSlimProfiel(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-hidden p-0 sm:max-w-[360px] [&>aside]:!w-full [&>button]:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>
              {slimProfiel
                ? `Snel profiel van ${slimProfiel.firstName} ${slimProfiel.lastName}`
                : "Snel profiel"}
            </SheetTitle>
            <SheetDescription>
              Beschikbaarheid, regio&apos;s en gekoppelde objecten.
            </SheetDescription>
          </SheetHeader>
          <SlimProfielPanel
            person={slimProfiel}
            onClose={() => setSlimProfiel(null)}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>
              {editingId ? "Medewerker bewerken" : "Nieuw personeelslid"}
            </SheetTitle>
            <SheetDescription>
              {editingId
                ? "Pas de gegevens van het personeelslid aan."
                : "Vul de gegevens in voor het nieuwe personeelslid."}
            </SheetDescription>
          </SheetHeader>
          <PersonnelForm
            mode={editingId ? "edit" : "create"}
            personnelId={editingId ?? undefined}
            roles={roles}
            sectors={sectors}
            onSuccess={handleFormSuccess}
            onCancel={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <TenantConfirmDialog
        open={bulkDeactivateOpen}
        onOpenChange={setBulkDeactivateOpen}
        title={`${selected.size} personeelsleden deactiveren?`}
        description="De geselecteerde personeelsleden worden inactief. Je kunt ze later opnieuw activeren."
        confirmLabel={bulkPending ? "Deactiveren..." : "Deactiveren"}
        destructive
        onConfirm={() => handleBulkStatus(false)}
      />

      <TenantConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Medewerker verwijderen?"
        description={
          deleteTarget
            ? `Weet je zeker dat je ${deleteTarget.name} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`
            : undefined
        }
        confirmLabel={bulkPending ? "Verwijderen..." : "Verwijderen"}
        destructive
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  UserCircle2,
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
  TenantActionMenu,
  TenantActiveFilters,
  TenantConfirmDialog,
  TenantFilterDrawer,
  TenantToolbar,
  TenantToolbarSearch,
} from "@/components/tenant-ui";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { PersonnelForm } from "@/components/personnel/PersonnelForm";
import { SlimProfielPanel } from "@/components/personnel/SlimProfielPanel";
import {
  bulkSetPersonnelStatus,
  setPersonnelStatus,
  deletePersonnel,
  type PersonnelRow,
  type RoleOption,
  type SectorOption,
} from "@/app/actions/personnel";
import type { AvailabilityStatus } from "@/app/actions/availability";
import {
  PERSONNEL_TYPES,
  PERSONNEL_TYPE_LABELS,
  PERSONNEL_TYPE_COLORS,
  type PersonnelType,
} from "@/types/personnel";

// ─── Invite status badge ──────────────────────────────────────────────────────

type InviteStatus = "none" | "invited" | "active";

function getInviteStatus(userId: string | null, inviteSentAt: string | null): InviteStatus {
  if (userId) return "active";
  if (inviteSentAt) return "invited";
  return "none";
}

const INVITE_BADGE: Record<InviteStatus, { label: string; bg: string; color: string; dot: string }> = {
  none:    { label: "Geen account",            bg: "#F1F5F9", color: "#94A3B8", dot: "#CBD5E1" },
  invited: { label: "Wachtwoord verstuurd",    bg: "#FEF3C7", color: "#92400E", dot: "#F59E0B" },
  active:  { label: "Portaal actief",          bg: "#D1FAE5", color: "#065F46", dot: "#10B981" },
};

function InviteBadge({ userId, inviteSentAt }: { userId: string | null; inviteSentAt: string | null }) {
  const status = getInviteStatus(userId, inviteSentAt);
  const s = INVITE_BADGE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      <span className="flex-shrink-0 rounded-full" style={{ width: "6px", height: "6px", backgroundColor: s.dot }} />
      {s.label}
    </span>
  );
}

const PAGE_SIZE = 25;
const SORTABLE = ["lastName", "firstName", "email", "code", "region", "createdAt"] as const;

// ─── Availability badge ───────────────────────────────────────────────────────

const AVAIL_BADGE: Record<AvailabilityStatus, { label: string; bg: string; color: string; dot: string }> = {
  beschikbaar:      { label: "Beschikbaar",      bg: "#D1FAE5", color: "#065F46", dot: "#10B981" },
  op_verlof:        { label: "Op verlof",         bg: "#DBEAFE", color: "#1D4ED8", dot: "#3B82F6" },
  ziek:             { label: "Ziek",              bg: "#FEE2E2", color: "#991B1B", dot: "#EF4444" },
  niet_beschikbaar: { label: "Niet beschikbaar",  bg: "#FEF3C7", color: "#92400E", dot: "#F59E0B" },
  niet_ingesteld:   { label: "Niet ingesteld",    bg: "#F1F5F9", color: "#94A3B8", dot: "#CBD5E1" },
};

function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  const s = AVAIL_BADGE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      <span className="flex-shrink-0 rounded-full" style={{ width: "6px", height: "6px", backgroundColor: s.dot }} />
      {s.label}
    </span>
  );
}

// ─── Personnel type badge ─────────────────────────────────────────────────────

function PersonnelTypeBadge({ type }: { type: string | null }) {
  if (!type) return <span style={{ color: "#94A3B8" }}>—</span>;
  const label = PERSONNEL_TYPE_LABELS[type as PersonnelType] ?? type;
  const color = PERSONNEL_TYPE_COLORS[type as PersonnelType] ?? { bg: "#F1F5F9", color: "#64748B" };
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: color.bg, color: color.color }}
    >
      {label}
    </span>
  );
}

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
          currentDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
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
  const visible  = tags.slice(0, max);
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
  rows:               PersonnelRow[];
  total:              number;
  roles:              RoleOption[];
  sectors:            SectorOption[];
  canWrite:           boolean;
  page:               number;
  initialSearch:      string;
  initialRoleId:      string;
  initialSectorId:    string;
  initialRegion:      string;
  initialStatus:      string;
  initialSort:        string;
  initialDir:         string;
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
  const router   = useRouter();
  const pathname = usePathname();

  const [sheetOpen,      setSheetOpen]      = useState(false);
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [selected,       setSelected]       = useState<Set<string>>(new Set());
  const [searchInput,    setSearchInput]    = useState(initialSearch);
  const [regionInput,    setRegionInput]    = useState(initialRegion);
  const [deleteTarget,   setDeleteTarget]   = useState<{ id: string; name: string } | null>(null);
  const [slimProfiel,    setSlimProfiel]    = useState<PersonnelRow | null>(null);
  const [bulkPending,    startBulkTransition] = useTransition();

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ─── URL helpers ─────────────────────────────────────────────────────────────
  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      search:        initialSearch        || undefined,
      roleId:        initialRoleId        || undefined,
      sectorId:      initialSectorId      || undefined,
      region:        initialRegion        || undefined,
      status:        initialStatus !== "all" ? initialStatus : undefined,
      personnelType: initialPersonnelType || undefined,
      sort:          initialSort !== "lastName" ? initialSort : undefined,
      dir:           initialDir  !== "asc"     ? initialDir  : undefined,
      page:          page > 1 ? String(page) : undefined,
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
  function openCreate()               { setEditingId(null); setSheetOpen(true); }
  function openEdit(id: string)       { setEditingId(id);   setSheetOpen(true); }
  function handleFormSuccess()        { setSheetOpen(false); setEditingId(null); }

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

  const activeFilters = [
    initialSearch ? { id: "search", label: "Zoeken", value: initialSearch, onRemove: () => applyFilter("search", "") } : null,
    initialRegion ? { id: "region", label: "Regio", value: initialRegion, onRemove: () => applyFilter("region", "") } : null,
    initialRoleId
      ? { id: "role", label: "Rol", value: roles.find((role) => role.id === initialRoleId)?.name ?? initialRoleId, onRemove: () => applyFilter("roleId", "") }
      : null,
    initialSectorId
      ? { id: "sector", label: "Sector", value: sectors.find((sector) => sector.id === initialSectorId)?.name ?? initialSectorId, onRemove: () => applyFilter("sectorId", "") }
      : null,
    initialPersonnelType && initialPersonnelType !== "ALL"
      ? {
          id: "personnelType",
          label: "Type",
          value: PERSONNEL_TYPE_LABELS[initialPersonnelType as PersonnelType] ?? initialPersonnelType,
          onRemove: () => applyFilter("personnelType", ""),
        }
      : null,
    initialStatus !== "all"
      ? { id: "status", label: "Status", value: initialStatus === "active" ? "Actief" : "Inactief", onRemove: () => applyFilter("status", "") }
      : null,
  ].filter(Boolean) as Parameters<typeof TenantActiveFilters>[0]["filters"];

  function renderRowActions(row: PersonnelRow) {
    return (
      <TenantActionMenu
        actions={[
          {
            id: "view",
            label: "Bekijken",
            href: `/personnel/${row.id}`,
            icon: <Eye className="h-4 w-4" />,
          },
          ...(canWrite
            ? [
                {
                  id: "edit",
                  label: "Bewerken",
                  icon: <Pencil className="h-4 w-4" />,
                  onSelect: () => {
                    setSlimProfiel(null);
                    openEdit(row.id);
                  },
                },
                {
                  id: "status",
                  label: row.isActive ? "Deactiveren" : "Activeren",
                  icon: row.isActive ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />,
                  disabled: bulkPending,
                  separatorBefore: true,
                  onSelect: () => handleStatusToggle(row.id, row.isActive),
                },
                {
                  id: "delete",
                  label: "Verwijderen",
                  icon: <Trash2 className="h-4 w-4" />,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => setDeleteTarget({ id: row.id, name: `${row.firstName} ${row.lastName}` }),
                },
              ]
            : []),
        ]}
      />
    );
  }

  const colCount = canWrite ? 13 : 12;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Toolbar */}
      <TenantToolbar
        search={
          <form
          onSubmit={handleSearchSubmit}
          className="flex min-w-0 flex-1 gap-2 sm:max-w-lg"
        >
          <TenantToolbarSearch
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Zoek op naam of e-mail…"
              wrapperClassName="max-w-none"
            />
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
        }
        actions={
          <>
            <TenantFilterDrawer activeCount={activeFilters.length} title="Personeelsfilters">
              <div className="grid gap-4">

        <Select
          value={initialRoleId || "ALL"}
          onValueChange={(v) => applyFilter("roleId", v === "ALL" ? "" : v)}
        >
          <SelectTrigger className="w-[150px] h-9">
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
          value={initialSectorId || "ALL"}
          onValueChange={(v) => applyFilter("sectorId", v === "ALL" ? "" : v)}
        >
          <SelectTrigger className="w-[145px] h-9">
            <SelectValue placeholder="Alle sectoren" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Alle sectoren</SelectItem>
            {sectors.map((sector) => (
              <SelectItem key={sector.id} value={sector.id}>{sector.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={initialPersonnelType || "ALL"}
          onValueChange={(v) => applyFilter("personnelType", v === "ALL" ? "" : v)}
        >
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Alle types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Alle types</SelectItem>
            {PERSONNEL_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{PERSONNEL_TYPE_LABELS[t]}</SelectItem>
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

              </div>
            </TenantFilterDrawer>

        <div className="ml-auto">
          {canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nieuw personeelslid
            </Button>
          )}
        </div>
          </>
        }
        activeFilters={<TenantActiveFilters filters={activeFilters} />}
      />

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

      {/* Table + Slim profiel panel side-by-side */}
      {rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground md:hidden">
          Geen personeelsrecords gevonden
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:hidden">
          {rows.map((row) => (
            <article key={row.id} className="rounded-lg border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {canWrite && (
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={() => toggleOne(row.id)}
                      aria-label={`Select ${row.firstName} ${row.lastName}`}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                      <Link href={`/personnel/${row.id}`} className="font-medium text-foreground hover:underline">
                        {row.firstName} {row.lastName}
                      </Link>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{row.code}</p>
                  </div>
                </div>
                {renderRowActions(row)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge isActive={row.isActive} />
                <InviteBadge userId={row.userId} inviteSentAt={row.inviteSentAt} />
                <AvailabilityBadge status={row.availabilityStatus} />
                {row.sectorName && <span>{row.sectorName}</span>}
                {row.roleName && <span>{row.roleName}</span>}
                {row.region && <span>{row.region}</span>}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="hidden gap-0 overflow-hidden rounded-xl md:flex" style={{ border: "1px solid #E2E8F0" }}>
        <div className="flex-1 overflow-x-auto min-w-0">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0", backgroundColor: "#FAFBFD" }}>
                {canWrite && (
                  <th className="w-10 pl-4 py-3">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                  </th>
                )}
                <th className="w-10 px-2 py-3" />
                <SortHeader label="Code"      columnKey="code"      currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <SortHeader label="Naam"      columnKey="lastName"  currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Sector</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Functie(s)</th>
                <SortHeader label="Regio"     columnKey="region"    currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Certificaten</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Beschikbaarheid</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Portaal</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="px-4 py-12 text-center text-sm"
                    style={{ color: "#94A3B8" }}
                  >
                    Geen personeelsrecords gevonden
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const isSlim = slimProfiel?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      className="transition-colors"
                      style={{
                        borderBottom: i < rows.length - 1 ? "1px solid #F1F5F9" : undefined,
                        backgroundColor: isSlim ? "#F0FAFA" : undefined,
                        cursor: "pointer",
                      }}
                      onClick={() => setSlimProfiel(isSlim ? null : row)}
                    >
                      {canWrite && (
                        <td className="pl-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(row.id)}
                            onCheckedChange={() => toggleOne(row.id)}
                            aria-label={`Select ${row.firstName} ${row.lastName}`}
                          />
                        </td>
                      )}
                      <td className="pl-3 pr-1 py-3">
                        <div
                          className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{
                            width:           "32px",
                            height:          "32px",
                            backgroundColor: "#E0FAFB",
                            color:           "#0A7E7A",
                          }}
                        >
                          {row.firstName[0]?.toUpperCase()}{row.lastName[0]?.toUpperCase()}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-block font-mono text-xs rounded px-1.5 py-0.5 bg-slate-100" style={{ color: "#475569" }}>
                          {row.code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm" style={{ color: "#081D3A" }}>
                          {row.lastName}, {row.firstName}
                        </div>
                        <div className="text-xs" style={{ color: "#94A3B8" }}>{row.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <PersonnelTypeBadge type={row.personnelType} />
                      </td>
                      <td className="px-4 py-3">
                        {row.sectorName ? (
                          <span
                            className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: "#ECFDF5", color: "#047857" }}
                          >
                            {row.sectorName}
                          </span>
                        ) : (
                          <span style={{ color: "#94A3B8", fontSize: "14px" }}>—</span>
                        )}
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
                        {row.certificates.length === 0 ? (
                          <span style={{ color: "#94A3B8" }}>—</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-flex items-center justify-center rounded-full text-xs font-bold"
                              style={{
                                width: "22px", height: "22px",
                                backgroundColor: "#E0FAFB", color: "#0A7E7A",
                              }}
                            >
                              {row.certificates.length}
                            </span>
                            <QualChips tags={row.certificates} max={1} />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <AvailabilityBadge status={row.availabilityStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge isActive={row.isActive} />
                      </td>
                      <td className="px-4 py-3">
                        <InviteBadge userId={row.userId} inviteSentAt={row.inviteSentAt} />
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {renderRowActions(row)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Slim profiel panel */}
        {slimProfiel && (
          <SlimProfielPanel
            person={slimProfiel}
            onClose={() => setSlimProfiel(null)}
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm" style={{ color: "#64748B" }}>
            Pagina {page} van {totalPages} ({total} totaal)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => router.replace(buildUrl({ page: String(page - 1) }))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => router.replace(buildUrl({ page: String(page + 1) }))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create/edit sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
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
        open={!!deleteTarget}
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

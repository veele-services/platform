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
  Users,
  Calendar,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  AssignmentStatusBadge,
  AssignmentPriorityBadge,
  priorityLabel,
  statusLabel,
} from "./AssignmentStatusBadge";
import { AssignmentForm } from "./AssignmentForm";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";
import {
  deleteAssignment,
  type AssignmentRow,
  type CustomerOption,
  type AssignmentStatus,
  type AssignmentPriority,
} from "@/app/actions/assignments";
import type { RegionOption } from "@/app/actions/regions";
import { ASSIGNMENT_STATUSES, ASSIGNMENT_PRIORITIES } from "@/types/assignments";

const PAGE_SIZE = 25;
const SORTABLE = ["title", "scheduledDate", "createdAt", "status", "priority"] as const;

const REPORT_ELIGIBLE: AssignmentStatus[] = [
  "completed", "not_completed", "report_submitted", "report_approved",
  "invoice_ready", "invoiced", "paid", "closed",
];

function ReportStatusBadge({ reportStatus, assignmentStatus }: { reportStatus: string | null; assignmentStatus: AssignmentStatus }) {
  if (!REPORT_ELIGIBLE.includes(assignmentStatus)) return null;

  if (!reportStatus) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
        style={{ background: "#F1F5F9", color: "#94A3B8" }}
      >
        <FileText className="h-3 w-3 flex-shrink-0" />
        Geen rapport
      </span>
    );
  }
  return <ProcessStatusBadge kind="report" status={reportStatus} size="xs" />;
}

interface AssignmentsViewProps {
  rows:                  AssignmentRow[];
  total:                 number;
  customers:             CustomerOption[];
  regionOptions:         RegionOption[];
  canWrite:              boolean;
  page:                  number;
  initialSearch:         string;
  initialStatus:         string;
  initialPriority:       string;
  initialReportStatus:   string;
  initialRegion:         string;
  initialSort:           string;
  initialDir:            string;
}

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

export function AssignmentsView({
  rows,
  total,
  customers,
  regionOptions,
  canWrite,
  page,
  initialSearch,
  initialStatus,
  initialPriority,
  initialReportStatus,
  initialRegion,
  initialSort,
  initialDir,
}: AssignmentsViewProps) {
  const router   = useRouter();
  const pathname = usePathname();

  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [searchInput,  setSearchInput]  = useState(initialSearch);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [pending,      startTransition] = useTransition();

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      search:       initialSearch        || undefined,
      status:       initialStatus        || undefined,
      priority:     initialPriority      || undefined,
      reportStatus: initialReportStatus  || undefined,
      region:       initialRegion        || undefined,
      sort:         initialSort !== "createdAt" ? initialSort : undefined,
      dir:          initialDir  !== "desc"      ? initialDir  : undefined,
      page:         page > 1 ? String(page) : undefined,
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

  function openCreate() { setEditingId(null); setSheetOpen(true); }
  function openEdit(id: string) { setEditingId(id); setSheetOpen(true); }
  function handleFormSuccess(id: string) {
    setSheetOpen(false);
    setEditingId(null);
    if (editingId === null) {
      router.push(`/assignments/${id}`);
    }
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const { id, title } = deleteTarget;
    startTransition(async () => {
      const result = await deleteAssignment(id, deleteReason);
      if (result.success) {
        toast.success(`Opdracht "${title}" geannuleerd`);
      } else {
        toast.error(result.message);
      }
      setDeleteTarget(null);
      setDeleteReason("");
    });
  }

  function formatDate(d: string | null): string {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("nl-NL", {
      day:   "numeric",
      month: "short",
      year:  "numeric",
    });
  }

  const activeFilters = [
    initialSearch ? { id: "search", label: "Zoeken", value: initialSearch, onRemove: () => applyFilter("search", "") } : null,
    initialStatus && initialStatus !== "all"
      ? { id: "status", label: "Status", value: statusLabel(initialStatus as AssignmentStatus), onRemove: () => applyFilter("status", "") }
      : null,
    initialPriority && initialPriority !== "all"
      ? { id: "priority", label: "Prioriteit", value: priorityLabel(initialPriority as AssignmentPriority), onRemove: () => applyFilter("priority", "") }
      : null,
    initialReportStatus && initialReportStatus !== "all"
      ? { id: "reportStatus", label: "Rapport", value: initialReportStatus, onRemove: () => applyFilter("reportStatus", "") }
      : null,
    initialRegion ? { id: "region", label: "Regio", value: initialRegion, onRemove: () => applyFilter("region", "") } : null,
  ].filter(Boolean) as Parameters<typeof TenantActiveFilters>[0]["filters"];

  function renderRowActions(row: AssignmentRow) {
    return (
      <TenantActionMenu
        actions={[
          {
            id: "view",
            label: "Bekijken",
            href: `/assignments/${row.id}`,
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
                  id: "delete",
                  label: "Annuleren",
                  icon: <Trash2 className="h-4 w-4" />,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => { setDeleteReason(""); setDeleteTarget({ id: row.id, title: row.title }); },
                },
              ]
            : []),
        ]}
      />
    );
  }

  return (
    <>
      {/* Toolbar */}
      <TenantToolbar
        search={
          <form onSubmit={handleSearchSubmit} className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
            <TenantToolbarSearch
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Zoek op titel of klant..."
              wrapperClassName="max-w-none"
            />
            <Button type="submit" variant="outline" size="sm">Zoeken</Button>
          </form>
        }
        actions={
          <>
            <TenantFilterDrawer activeCount={activeFilters.length} title="Opdrachtfilters">
              <div className="grid gap-4">

        <Select
          value={initialStatus || "all"}
          onValueChange={(v) => applyFilter("status", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            {ASSIGNMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={initialPriority || "all"}
          onValueChange={(v) => applyFilter("priority", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Alle prioriteiten" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle prioriteiten</SelectItem>
            {ASSIGNMENT_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>{priorityLabel(p)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={initialReportStatus || "all"}
          onValueChange={(v) => applyFilter("reportStatus", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Alle rapportstatus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle rapportstatus</SelectItem>
            <SelectItem value="none">Geen rapport</SelectItem>
            <SelectItem value="submitted">Ter controle</SelectItem>
            <SelectItem value="approved">Goedgekeurd</SelectItem>
            <SelectItem value="rejected">Afgekeurd</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={initialRegion || "all"}
          onValueChange={(v) => applyFilter("region", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Alle regio's" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle regio&apos;s</SelectItem>
            {regionOptions.map((region) => (
              <SelectItem key={region.id} value={region.name}>{region.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

              </div>
            </TenantFilterDrawer>

        <div className="ml-auto flex items-center gap-2">
          {canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nieuwe opdracht
            </Button>
          )}
        </div>
          </>
        }
        activeFilters={<TenantActiveFilters filters={activeFilters} />}
      />

      {/* Table */}
      {rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground md:hidden">
          Geen opdrachten gevonden
        </div>
      ) : (
        <div className="mt-6 grid gap-3 md:hidden">
          {rows.map((row) => (
            <article key={row.id} className="rounded-lg border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/assignments/${row.id}`} className="min-w-0">
                  <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                    {row.code}
                  </span>
                  <p className="mt-2 font-medium text-foreground">{row.title}</p>
                  <p className="text-sm text-muted-foreground">{row.customerName}</p>
                </Link>
                {renderRowActions(row)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <AssignmentStatusBadge status={row.status} />
                <AssignmentPriorityBadge priority={row.priority} />
                <ReportStatusBadge reportStatus={row.reportStatus} assignmentStatus={row.status} />
                {row.scheduledDate && <span>{formatDate(row.scheduledDate)}</span>}
                {row.personnelCount > 0 && <span>{row.personnelCount} medewerkers</span>}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="veele-card mt-6 hidden overflow-hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Code</th>
                <SortHeader label="Titel"    columnKey="title"         currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
                  Klant
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
                  Object
                </th>
                <SortHeader label="Status"   columnKey="status"        currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <SortHeader label="Prioriteit" columnKey="priority"    currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <SortHeader label="Datum"    columnKey="scheduledDate" currentSort={initialSort} currentDir={initialDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                  </span>
                </th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-sm"
                    style={{ color: "#94A3B8" }}
                  >
                    Geen opdrachten gevonden
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-slate-50/60"
                    style={{
                      borderBottom: i < rows.length - 1 ? "1px solid #F1F5F9" : undefined,
                    }}
                  >
                    <td className="px-4 py-3">
                      <span className="inline-block font-mono text-xs rounded px-1.5 py-0.5 bg-slate-100" style={{ color: "#475569" }}>
                        {row.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <Link
                        href={`/assignments/${row.id}`}
                        className="font-medium text-sm hover:underline line-clamp-2"
                        style={{ color: "#081D3A" }}
                      >
                        {row.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                      {row.customerName}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                      {row.objectName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <AssignmentStatusBadge status={row.status} />
                        <ReportStatusBadge reportStatus={row.reportStatus} assignmentStatus={row.status} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <AssignmentPriorityBadge priority={row.priority} />
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                      {row.scheduledDate ? (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                          {formatDate(row.scheduledDate)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#64748B" }}>
                      {row.personnelCount > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                          style={{ background: "#F1F5F9" }}
                        >
                          <Users className="h-3 w-3" />
                          {row.personnelCount}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="pr-4 py-3 text-right">
                      {renderRowActions(row)}
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
            Resultaten {Math.min((page - 1) * PAGE_SIZE + 1, total)}–
            {Math.min(page * PAGE_SIZE, total)} van {total}
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
            <span className="px-3" style={{ color: "#081D3A" }}>
              {page} / {totalPages}
            </span>
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

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[560px]">
          <SheetHeader>
            <SheetTitle>
              {editingId ? "Opdracht bewerken" : "Nieuwe opdracht"}
            </SheetTitle>
            <SheetDescription>
              {editingId
                ? "Werk de opdrachtgegevens bij."
                : "Vul de gegevens in om een nieuwe opdracht aan te maken."}
            </SheetDescription>
          </SheetHeader>
          <AssignmentForm
            mode={editingId ? "edit" : "create"}
            assignmentId={editingId ?? undefined}
            customers={customers}
            regionOptions={regionOptions}
            onSuccess={handleFormSuccess}
            onCancel={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <TenantConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) { setDeleteTarget(null); setDeleteReason(""); }
        }}
        title="Opdracht annuleren?"
        description={
          deleteTarget
            ? `De opdracht ${deleteTarget.title} en alle actieve inzetten worden geannuleerd. Historie, planning en uitvoering blijven bewaard.`
            : undefined
        }
        confirmLabel={pending ? "Annuleren..." : "Opdracht annuleren"}
        confirmDisabled={!deleteReason.trim()}
        destructive
        onConfirm={handleConfirmDelete}
      >
        <Textarea
          value={deleteReason}
          onChange={(event) => setDeleteReason(event.target.value)}
          placeholder="Reden voor annuleren"
          aria-label="Reden voor annuleren"
          rows={3}
        />
      </TenantConfirmDialog>
    </>
  );
}

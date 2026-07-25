"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  FileText,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteAssignment,
  type AssignmentPriority,
  type AssignmentRow,
  type AssignmentStatus,
  type CustomerOption,
} from "@/app/actions/assignments";
import type { RegionOption } from "@/app/actions/regions";
import {
  FieldgridDataView,
  type FieldgridDataViewColumn,
} from "@/components/ui/fieldgrid-data-view";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  TenantActionMenu,
  TenantActiveFilters,
  TenantConfirmDialog,
  TenantFilterDrawer,
  TenantToolbar,
  TenantToolbarSearch,
} from "@/components/tenant-ui";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";
import {
  ASSIGNMENT_PRIORITIES,
  ASSIGNMENT_STATUSES,
} from "@/types/assignments";

import { AssignmentForm } from "./AssignmentForm";
import {
  AssignmentPriorityBadge,
  AssignmentStatusBadge,
  priorityLabel,
  statusLabel,
} from "./AssignmentStatusBadge";

const PAGE_SIZE = 25;
const SORTABLE = [
  "title",
  "scheduledDate",
  "createdAt",
  "status",
  "priority",
] as const;

const REPORT_ELIGIBLE: AssignmentStatus[] = [
  "completed",
  "not_completed",
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
];

const REPORT_STATUS_LABELS: Record<string, string> = {
  none: "Geen rapport",
  submitted: "Ter controle",
  approved: "Goedgekeurd",
  rejected: "Afgekeurd",
};

const NEXT_WORKFLOW_STATUS: Partial<
  Record<AssignmentStatus, AssignmentStatus>
> = {
  requested: "review",
  review: "quote_preparation",
  quote_preparation: "awaiting_approval",
  awaiting_approval: "approved",
  approved: "plannable",
  plannable: "scheduled",
  scheduled: "seen",
  seen: "en_route",
  en_route: "in_progress",
  in_progress: "completed",
  not_completed: "plannable",
  completed: "report_submitted",
  report_submitted: "report_approved",
  report_approved: "invoice_ready",
  invoice_ready: "invoiced",
  invoiced: "paid",
  paid: "closed",
};

function ReportStatusBadge({
  reportStatus,
  assignmentStatus,
}: {
  reportStatus: string | null;
  assignmentStatus: AssignmentStatus;
}) {
  if (!REPORT_ELIGIBLE.includes(assignmentStatus)) return null;

  if (!reportStatus) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
        <FileText className="size-3 shrink-0" aria-hidden="true" />
        Geen rapport
      </span>
    );
  }

  return <ProcessStatusBadge kind="report" status={reportStatus} size="xs" />;
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function nextWorkflowLabel(status: AssignmentStatus): string {
  const nextStatus = NEXT_WORKFLOW_STATUS[status];
  if (nextStatus) return statusLabel(nextStatus);
  return status === "cancelled" ? "Geen vervolgstap" : "Workflow afgerond";
}

interface AssignmentsViewProps {
  rows: AssignmentRow[];
  total: number;
  customers: CustomerOption[];
  regionOptions: RegionOption[];
  canWrite: boolean;
  page: number;
  initialSearch: string;
  initialStatus: string;
  initialPriority: string;
  initialReportStatus: string;
  initialRegion: string;
  initialSort: string;
  initialDir: string;
  initialCreateOpen?: boolean;
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
  initialCreateOpen = false,
}: AssignmentsViewProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [sheetOpen, setSheetOpen] = useState(initialCreateOpen && canWrite);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState(initialStatus || "all");
  const [draftPriority, setDraftPriority] = useState(initialPriority || "all");
  const [draftReportStatus, setDraftReportStatus] = useState(
    initialReportStatus || "all",
  );
  const [draftRegion, setDraftRegion] = useState(initialRegion || "all");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState("");
  const [pending, startTransition] = useTransition();

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const rowLabels = useMemo(
    () => new Map(rows.map((row) => [row.id, row.title])),
    [rows],
  );

  useEffect(() => {
    setSearchInput(initialSearch);
    setDraftStatus(initialStatus || "all");
    setDraftPriority(initialPriority || "all");
    setDraftReportStatus(initialReportStatus || "all");
    setDraftRegion(initialRegion || "all");
  }, [
    initialPriority,
    initialRegion,
    initialReportStatus,
    initialSearch,
    initialStatus,
  ]);

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      search: initialSearch || undefined,
      status:
        initialStatus && initialStatus !== "all" ? initialStatus : undefined,
      priority:
        initialPriority && initialPriority !== "all"
          ? initialPriority
          : undefined,
      reportStatus:
        initialReportStatus && initialReportStatus !== "all"
          ? initialReportStatus
          : undefined,
      region: initialRegion || undefined,
      sort: initialSort !== "createdAt" ? initialSort : undefined,
      dir: initialDir !== "desc" ? initialDir : undefined,
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

  function handleFilterDrawerOpenChange(open: boolean) {
    if (open) {
      setDraftStatus(initialStatus || "all");
      setDraftPriority(initialPriority || "all");
      setDraftReportStatus(initialReportStatus || "all");
      setDraftRegion(initialRegion || "all");
    }
    setFilterDrawerOpen(open);
  }

  function applyDraftFilters() {
    router.replace(
      buildUrl({
        status: draftStatus === "all" ? undefined : draftStatus,
        priority: draftPriority === "all" ? undefined : draftPriority,
        reportStatus:
          draftReportStatus === "all" ? undefined : draftReportStatus,
        region: draftRegion === "all" ? undefined : draftRegion,
        page: undefined,
      }),
    );
  }

  function resetFilters() {
    setDraftStatus("all");
    setDraftPriority("all");
    setDraftReportStatus("all");
    setDraftRegion("all");
    setFilterDrawerOpen(false);
    router.replace(
      buildUrl({
        status: undefined,
        priority: undefined,
        reportStatus: undefined,
        region: undefined,
        page: undefined,
      }),
    );
  }

  function handleSort(column: string) {
    if (!SORTABLE.includes(column as (typeof SORTABLE)[number])) return;
    const newDirection =
      initialSort === column && initialDir === "asc" ? "desc" : "asc";
    router.replace(
      buildUrl({ sort: column, dir: newDirection, page: undefined }),
    );
  }

  function openCreate() {
    setEditingId(null);
    setSheetOpen(true);
  }

  function handleFormSuccess(id: string) {
    setSheetOpen(false);
    setEditingId(null);
    if (editingId === null) router.push(`/assignments/${id}`);
  }

  function handleConfirmDelete() {
    if (!deleteTarget || !deleteReason.trim()) return;
    const { id, title } = deleteTarget;
    const reason = deleteReason.trim();

    startTransition(async () => {
      const result = await deleteAssignment(id, reason);
      if (result.success) {
        toast.success(`Opdracht "${title}" geannuleerd`);
        setSelected((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        router.refresh();
      } else {
        toast.error(result.message);
      }
      setDeleteTarget(null);
      setDeleteReason("");
    });
  }

  function handleConfirmBulkCancel() {
    const ids = [...selected];
    const reason = bulkCancelReason.trim();
    if (ids.length === 0 || !reason) return;

    startTransition(async () => {
      const results: Array<{
        id: string;
        success: boolean;
        message?: string;
      }> = await Promise.all(
        ids.map(async (id) => {
          try {
            const result = await deleteAssignment(id, reason);
            return result.success
              ? { id, success: true }
              : { id, success: false, message: result.message };
          } catch {
            return {
              id,
              success: false,
              message: "Opdracht annuleren mislukt.",
            };
          }
        }),
      );

      const failed = results.filter((result) => !result.success);
      const succeededCount = results.length - failed.length;

      setSelected(new Set(failed.map((result) => result.id)));
      setBulkCancelOpen(false);
      setBulkCancelReason("");

      if (succeededCount > 0) {
        toast.success(
          `${succeededCount} ${
            succeededCount === 1 ? "opdracht" : "opdrachten"
          } geannuleerd`,
        );
        router.refresh();
      }
      if (failed.length > 0) {
        toast.error(
          `${failed.length} ${
            failed.length === 1 ? "opdracht kon" : "opdrachten konden"
          } niet worden geannuleerd. ${failed[0]?.message ?? ""}`.trim(),
        );
      }
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
    initialStatus && initialStatus !== "all"
      ? {
          id: "status",
          label: "Status",
          value: statusLabel(initialStatus as AssignmentStatus),
          onRemove: () => applyFilter("status", ""),
        }
      : null,
    initialPriority && initialPriority !== "all"
      ? {
          id: "priority",
          label: "Prioriteit",
          value: priorityLabel(initialPriority as AssignmentPriority),
          onRemove: () => applyFilter("priority", ""),
        }
      : null,
    initialReportStatus && initialReportStatus !== "all"
      ? {
          id: "reportStatus",
          label: "Rapport",
          value:
            REPORT_STATUS_LABELS[initialReportStatus] ?? initialReportStatus,
          onRemove: () => applyFilter("reportStatus", ""),
        }
      : null,
    initialRegion
      ? {
          id: "region",
          label: "Regio",
          value: initialRegion,
          onRemove: () => applyFilter("region", ""),
        }
      : null,
  ].filter(Boolean) as Parameters<typeof TenantActiveFilters>[0]["filters"];

  const renderRowActions = useCallback(
    (row: AssignmentRow) => (
      <div className="flex items-center justify-end gap-1">
        <Button asChild type="button" variant="outline" size="sm">
          <Link
            href={`/assignments/${row.id}`}
            aria-label={`Open opdracht ${row.title}`}
          >
            Open
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        {canWrite ? (
          <TenantActionMenu
            actions={[
              {
                id: "edit",
                label: "Bewerken",
                icon: <Pencil className="size-4" />,
                onSelect: () => {
                  setEditingId(row.id);
                  setSheetOpen(true);
                },
              },
              {
                id: "delete",
                label: "Annuleren",
                icon: <Trash2 className="size-4" />,
                destructive: true,
                separatorBefore: true,
                onSelect: () => {
                  setDeleteReason("");
                  setDeleteTarget({ id: row.id, title: row.title });
                },
              },
            ]}
          />
        ) : null}
      </div>
    ),
    [canWrite],
  );

  const columns = useMemo<FieldgridDataViewColumn<AssignmentRow>[]>(
    () => [
      {
        id: "title",
        label: "Opdracht",
        sortable: true,
        hideable: false,
        cell: (row) => (
          <div className="min-w-0">
            <Link
              href={`/assignments/${row.id}`}
              className="block max-w-[18rem] truncate font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.title}
            </Link>
            <span className="font-mono text-xs text-muted-foreground">
              {row.code}
            </span>
          </div>
        ),
      },
      {
        id: "customer",
        label: "Klant",
        cell: (row) => row.customerName,
      },
      {
        id: "object",
        label: "Object",
        cell: (row) => row.objectName ?? "—",
      },
      {
        id: "status",
        label: "Status",
        sortable: true,
        cell: (row) => (
          <div className="flex flex-col items-start gap-1">
            <AssignmentStatusBadge status={row.status} />
            <ReportStatusBadge
              reportStatus={row.reportStatus}
              assignmentStatus={row.status}
            />
          </div>
        ),
      },
      {
        id: "nextStep",
        label: "Volgende stap",
        hideable: false,
        cell: (row) => (
          <span className="text-sm font-medium text-foreground">
            {nextWorkflowLabel(row.status)}
          </span>
        ),
      },
      {
        id: "priority",
        label: "Prioriteit",
        sortable: true,
        cell: (row) => <AssignmentPriorityBadge priority={row.priority} />,
      },
      {
        id: "scheduledDate",
        label: "Datum",
        sortable: true,
        cell: (row) =>
          row.scheduledDate ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
              {formatDate(row.scheduledDate)}
            </span>
          ) : (
            "—"
          ),
      },
      {
        id: "personnel",
        label: "Bezetting",
        cell: (row) =>
          row.personnelCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <Users className="size-3" aria-hidden="true" />
              {row.personnelCount}
            </span>
          ) : (
            "—"
          ),
      },
      {
        id: "createdAt",
        label: "Aangemaakt",
        sortable: true,
        hiddenByDefault: true,
        cell: (row) => formatDate(row.createdAt),
      },
      {
        id: "actions",
        label: "Acties",
        hideable: false,
        headerClassName: "w-36 text-right",
        className: "text-right",
        cell: renderRowActions,
      },
    ],
    [renderRowActions],
  );

  const filterCount = [
    initialStatus && initialStatus !== "all" ? initialStatus : "",
    initialPriority && initialPriority !== "all" ? initialPriority : "",
    initialReportStatus && initialReportStatus !== "all"
      ? initialReportStatus
      : "",
    initialRegion,
  ].filter(Boolean).length;

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
              placeholder="Zoek op titel of klant..."
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
              activeCount={filterCount}
              title="Opdrachtfilters"
              open={filterDrawerOpen}
              onOpenChange={handleFilterDrawerOpenChange}
              onApply={applyDraftFilters}
              onReset={resetFilters}
            >
              <div className="grid gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="assignment-status-filter"
                    className="text-sm font-semibold text-foreground"
                  >
                    Status
                  </label>
                  <Select value={draftStatus} onValueChange={setDraftStatus}>
                    <SelectTrigger
                      id="assignment-status-filter"
                      className="w-full"
                    >
                      <SelectValue placeholder="Alle statussen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle statussen</SelectItem>
                      {ASSIGNMENT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {statusLabel(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="assignment-priority-filter"
                    className="text-sm font-semibold text-foreground"
                  >
                    Prioriteit
                  </label>
                  <Select
                    value={draftPriority}
                    onValueChange={setDraftPriority}
                  >
                    <SelectTrigger
                      id="assignment-priority-filter"
                      className="w-full"
                    >
                      <SelectValue placeholder="Alle prioriteiten" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle prioriteiten</SelectItem>
                      {ASSIGNMENT_PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priorityLabel(priority)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="assignment-report-filter"
                    className="text-sm font-semibold text-foreground"
                  >
                    Rapportstatus
                  </label>
                  <Select
                    value={draftReportStatus}
                    onValueChange={setDraftReportStatus}
                  >
                    <SelectTrigger
                      id="assignment-report-filter"
                      className="w-full"
                    >
                      <SelectValue placeholder="Alle rapportstatussen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle rapportstatussen</SelectItem>
                      <SelectItem value="none">Geen rapport</SelectItem>
                      <SelectItem value="submitted">Ter controle</SelectItem>
                      <SelectItem value="approved">Goedgekeurd</SelectItem>
                      <SelectItem value="rejected">Afgekeurd</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="assignment-region-filter"
                    className="text-sm font-semibold text-foreground"
                  >
                    Regio
                  </label>
                  <Select value={draftRegion} onValueChange={setDraftRegion}>
                    <SelectTrigger
                      id="assignment-region-filter"
                      className="w-full"
                    >
                      <SelectValue placeholder="Alle regio's" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle regio&apos;s</SelectItem>
                      {regionOptions.map((region) => (
                        <SelectItem key={region.id} value={region.name}>
                          {region.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TenantFilterDrawer>

            <div className="ml-auto flex items-center gap-2">
              {canWrite ? (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="size-4" aria-hidden="true" />
                  Nieuwe opdracht
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
        caption="Opdrachten met klant, object, workflowstatus, volgende stap, planning en bezetting"
        hasActiveFilters={activeFilters.length > 0}
        emptyTitle="Nog geen opdrachten"
        emptyDescription="Maak de eerste opdracht aan om planning en uitvoering te starten."
        filteredEmptyTitle="Geen opdrachten gevonden"
        filteredEmptyDescription="Pas de zoekopdracht of actieve filters aan."
        emptyAction={
          canWrite ? (
            <Button type="button" onClick={openCreate}>
              <Plus className="size-4" aria-hidden="true" />
              Nieuwe opdracht
            </Button>
          ) : undefined
        }
        preferenceKey="fieldgrid:assignments:data-view"
        savedViews={{
          storageKey: "fieldgrid:assignments:saved-views",
          currentQuery: buildUrl({ page: undefined }).split("?")[1] ?? "",
          onApplyQuery: (query) =>
            router.replace(query ? `${pathname}?${query}` : pathname),
        }}
        sort={{
          key: initialSort,
          direction: initialDir === "asc" ? "asc" : "desc",
          onChange: handleSort,
        }}
        selection={
          canWrite
            ? {
                selectedIds: selected,
                onSelectionChange: setSelected,
                getRowLabel: (rowId) => rowLabels.get(rowId) ?? "opdracht",
              }
            : undefined
        }
        bulkActions={
          canWrite
            ? ({ clear }) => (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => {
                      setBulkCancelReason("");
                      setBulkCancelOpen(true);
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Annuleren
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
            aria-labelledby={`assignment-mobile-${row.id}-title`}
            className={`rounded-lg border bg-card p-4 shadow-card ${
              context.selected
                ? "border-primary ring-1 ring-primary"
                : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {context.selectionControl}
                <div className="min-w-0">
                  <Link
                    id={`assignment-mobile-${row.id}-title`}
                    href={`/assignments/${row.id}`}
                    className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {row.title}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">
                    {row.code}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.customerName}
                    {row.objectName ? ` · ${row.objectName}` : ""}
                  </p>
                </div>
              </div>
              {renderRowActions(row)}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <AssignmentStatusBadge status={row.status} />
              <AssignmentPriorityBadge priority={row.priority} />
              <ReportStatusBadge
                reportStatus={row.reportStatus}
                assignmentStatus={row.status}
              />
              {row.scheduledDate ? (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3.5" aria-hidden="true" />
                  {formatDate(row.scheduledDate)}
                </span>
              ) : null}
              {row.personnelCount > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" aria-hidden="true" />
                  {row.personnelCount} medewerkers
                </span>
              ) : null}
            </div>

            <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                Volgende stap:
              </span>{" "}
              {nextWorkflowLabel(row.status)}
            </p>
          </article>
        )}
      />

      {canWrite ? (
        <>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent
              side="right"
              className="w-full overflow-y-auto sm:max-w-[560px]"
            >
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
            open={bulkCancelOpen}
            onOpenChange={(open) => {
              setBulkCancelOpen(open);
              if (!open) setBulkCancelReason("");
            }}
            title={`${selected.size} ${
              selected.size === 1 ? "opdracht" : "opdrachten"
            } annuleren?`}
            description="De geselecteerde opdrachten en hun actieve inzetten worden geannuleerd. Historie, planning en uitvoering blijven bewaard."
            confirmLabel={pending ? "Annuleren..." : "Opdrachten annuleren"}
            confirmDisabled={!bulkCancelReason.trim() || pending}
            destructive
            onConfirm={handleConfirmBulkCancel}
          >
            <Textarea
              value={bulkCancelReason}
              onChange={(event) => setBulkCancelReason(event.target.value)}
              placeholder="Reden voor annuleren"
              aria-label="Reden voor annuleren van geselecteerde opdrachten"
              rows={3}
            />
          </TenantConfirmDialog>

          <TenantConfirmDialog
            open={Boolean(deleteTarget)}
            onOpenChange={(open) => {
              if (!open) {
                setDeleteTarget(null);
                setDeleteReason("");
              }
            }}
            title="Opdracht annuleren?"
            description={
              deleteTarget
                ? `De opdracht ${deleteTarget.title} en alle actieve inzetten worden geannuleerd. Historie, planning en uitvoering blijven bewaard.`
                : undefined
            }
            confirmLabel={pending ? "Annuleren..." : "Opdracht annuleren"}
            confirmDisabled={!deleteReason.trim() || pending}
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
      ) : null}
    </>
  );
}

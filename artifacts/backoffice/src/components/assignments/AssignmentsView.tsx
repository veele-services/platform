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
  Users,
  Calendar,
  FileText,
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
  initialSort,
  initialDir,
}: AssignmentsViewProps) {
  const router   = useRouter();
  const pathname = usePathname();

  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [searchInput,  setSearchInput]  = useState(initialSearch);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [pending,      startTransition] = useTransition();

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      search:       initialSearch        || undefined,
      status:       initialStatus        || undefined,
      priority:     initialPriority      || undefined,
      reportStatus: initialReportStatus  || undefined,
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
      const result = await deleteAssignment(id);
      if (result.success) {
        toast.success(`Opdracht "${title}" verwijderd`);
      } else {
        toast.error(result.message);
      }
      setDeleteTarget(null);
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
              placeholder="Zoek op titel of klant..."
              className="pl-8 h-9"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" className="h-9">
            Zoeken
          </Button>
        </form>

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

        <div className="ml-auto flex items-center gap-2">
          {canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nieuwe opdracht
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Menu openen</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/assignments/${row.id}`}>
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
                              <DropdownMenuItem
                                onSelect={() => setDeleteTarget({ id: row.id, title: row.title })}
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
        <SheetContent side="right" className="w-[560px] sm:max-w-[560px] overflow-y-auto">
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

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opdracht verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert permanent{" "}
              <strong>{deleteTarget?.title}</strong>, inclusief alle gekoppelde
              medewerkers en taken. Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={pending}
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

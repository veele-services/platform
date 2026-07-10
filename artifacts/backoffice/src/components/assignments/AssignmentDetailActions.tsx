"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, ChevronRight, Plus, X, Loader2, UserPlus, AlertTriangle, CheckCircle2, XCircle, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { AssignmentStatusBadge, statusLabel } from "./AssignmentStatusBadge";
import { AssignmentForm } from "./AssignmentForm";
import {
  setAssignmentStatus,
  assignPersonnel,
  removePersonnel,
  addAssignmentTask,
  removeAssignmentTask,
  type AssignmentStatus,
  type CustomerOption,
  type TaskCodeOption,
  type PersonnelEligibilityResult,
} from "@/app/actions/assignments";
import { ASSIGNMENT_STATUS_TRANSITIONS } from "@/types/assignments";
import type { AvailabilityStatus } from "@/app/actions/availability";

interface Personnel {
  id: string;
  personnelId: string;
  firstName: string;
  lastName: string;
  linkStatus?: string;
}

interface Task {
  id: string;
  taskCodeId: string | null;
  taskCodeCode: string | null;
  taskCodeName: string | null;
  notes: string | null;
  sortOrder: number;
}

interface AssignmentDetailActionsProps {
  assignmentId:  string;
  status:        AssignmentStatus;
  canWrite:      boolean;
  customers:     CustomerOption[];
  personnelList: PersonnelEligibilityResult[];
  personnel:     Personnel[];
}

export function AssignmentDetailActions({
  assignmentId,
  status,
  canWrite,
  customers,
  personnelList,
  personnel,
}: AssignmentDetailActionsProps) {
  const router = useRouter();

  const [editOpen,         setEditOpen]         = useState(false);
  const [selectedStatus,   setSelectedStatus]   = useState<AssignmentStatus>(status);
  const [selectedPersonnel, setSelectedPersonnel] = useState("");
  const [optimisticAssignedPersonnelIds, setOptimisticAssignedPersonnelIds] = useState<Set<string>>(
    () => new Set(personnel.map((p) => p.personnelId)),
  );
  const [removingPersonnel, setRemovingPersonnel] = useState<string | null>(null);
  const [pending,           startTransition]      = useTransition();

  const nextStatuses = ASSIGNMENT_STATUS_TRANSITIONS[status] ?? [];

  useEffect(() => {
    setOptimisticAssignedPersonnelIds(new Set(personnel.map((p) => p.personnelId)));
  }, [personnel]);

  function handleStatusChange() {
    if (selectedStatus === status) return;
    startTransition(async () => {
      const result = await setAssignmentStatus(assignmentId, selectedStatus);
      if (result.success) {
        toast.success(`Status gewijzigd naar "${statusLabel(selectedStatus)}"`);
        router.refresh();
      } else {
        toast.error(result.message);
        setSelectedStatus(status);
      }
    });
  }

  function handleAddPersonnel() {
    if (!selectedPersonnel) return;
    const personnelToAssign = selectedPersonnel;
    startTransition(async () => {
      const result = await assignPersonnel(assignmentId, personnelToAssign);
      if (result.success) {
        setOptimisticAssignedPersonnelIds((current) => {
          const next = new Set(current);
          next.add(personnelToAssign);
          return next;
        });
        if (result.warning) {
          toast.warning(result.warning, { duration: 6000 });
        } else {
          toast.success("Medewerker gekoppeld");
        }
        setSelectedPersonnel("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleRemovePersonnel(linkId: string, personnelId: string, name: string) {
    setRemovingPersonnel(linkId);
    startTransition(async () => {
      const result = await removePersonnel(assignmentId, linkId);
      if (result.success) {
        setOptimisticAssignedPersonnelIds((current) => {
          const next = new Set(current);
          next.delete(personnelId);
          return next;
        });
        toast.success(`${name} ontkoppeld`);
        router.refresh();
      } else {
        toast.error(result.message);
      }
      setRemovingPersonnel(null);
    });
  }

  return (
    <>
      {/* ── Header actions ─────────────────────────────── */}
      <div className="flex items-center gap-2">
        {canWrite && (
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Bewerken
          </Button>
        )}
      </div>

      {/* ── Status transition ──────────────────────────── */}
      {canWrite && nextStatuses.length > 0 && (
        <div
          className="veele-card flex items-center gap-3 p-4 flex-wrap"
          style={{ background: "#F8FAFC" }}
        >
          <span className="text-sm font-medium" style={{ color: "#081D3A" }}>
            Statuswijziging
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Select
              value={selectedStatus}
              onValueChange={(v) => setSelectedStatus(v as AssignmentStatus)}
            >
              <SelectTrigger className="w-[200px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {nextStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleStatusChange}
              disabled={pending || selectedStatus === status}
            >
              {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <ChevronRight className="mr-1 h-3.5 w-3.5" />
              Toepassen
            </Button>
          </div>
        </div>
      )}

      {/* ── Personnel ──────────────────────────────────── */}
      <div className="veele-card">
        <h3
          className="font-heading text-sm font-semibold mb-4 flex items-center gap-2"
          style={{ color: "#081D3A" }}
        >
          <UserPlus className="h-4 w-4" style={{ color: "#00B7B3" }} />
          Medewerkers
        </h3>

        {personnel.length === 0 ? (
          <p className="text-sm mb-4" style={{ color: "#94A3B8" }}>
            Nog geen medewerkers gekoppeld.
          </p>
        ) : (
          <ul className="divide-y mb-4" style={{ borderColor: "#F1F5F9" }}>
            {personnel.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span className="text-sm" style={{ color: "#081D3A" }}>
                  {p.firstName} {p.lastName}
                  {p.linkStatus === "suggested" && (
                    <span
                      className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                      style={{ background: "#EFF6FF", color: "#1D4ED8" }}
                    >
                      Interesse
                    </span>
                  )}
                </span>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={pending && removingPersonnel === p.id}
                    onClick={() =>
                      handleRemovePersonnel(p.id, p.personnelId, `${p.firstName} ${p.lastName}`)
                    }
                  >
                    {pending && removingPersonnel === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                    <span className="sr-only">Verwijderen</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canWrite && (
          <div className="flex items-center gap-2">
            <Select
              value={selectedPersonnel || "NONE"}
              onValueChange={(v) => setSelectedPersonnel(v === "NONE" ? "" : v)}
            >
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue placeholder="Medewerker selecteren..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Selecteer medewerker —</SelectItem>
                <TooltipProvider delayDuration={200}>
                  {personnelList
                    .filter((p) => !optimisticAssignedPersonnelIds.has(p.id))
                    .sort((a, b) => {
                      const scoreA = a.eligible ? 0 : 1;
                      const scoreB = b.eligible ? 0 : 1;
                      if (scoreA !== scoreB) return scoreA - scoreB;
                      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "nl");
                    })
                    .map((p) => {
                      const isHardBlock =
                        p.availabilityStatus === "ziek" ||
                        p.availabilityStatus === "op_verlof" ||
                        p.hasConflict;
                      const icon = p.eligible
                        ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#10B981" }} />
                        : isHardBlock
                          ? <XCircle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#EF4444" }} />
                          : <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#F59E0B" }} />;

                      return (
                        <SelectItem key={p.id} value={p.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1.5 cursor-default">
                                <AvailDot status={p.availabilityStatus} />
                                {icon}
                                <span>{p.lastName}, {p.firstName}</span>
                              </span>
                            </TooltipTrigger>
                            {p.eligibilityReasons.length > 0 && (
                              <TooltipContent side="right" className="max-w-[220px]">
                                <ul className="text-xs space-y-0.5">
                                  {p.eligibilityReasons.map((r, i) => (
                                    <li key={i}>• {r}</li>
                                  ))}
                                </ul>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </SelectItem>
                      );
                    })}
                </TooltipProvider>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedPersonnel || pending}
              onClick={handleAddPersonnel}
              className="h-8"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Edit Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-[560px] sm:max-w-[560px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Opdracht bewerken</SheetTitle>
            <SheetDescription>Werk de opdrachtgegevens bij.</SheetDescription>
          </SheetHeader>
          <AssignmentForm
            mode="edit"
            assignmentId={assignmentId}
            customers={customers}
            onSuccess={() => { setEditOpen(false); router.refresh(); }}
            onCancel={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function AssignmentTaskManager({
  assignmentId,
  canWrite,
  taskCodes,
  tasks,
}: {
  assignmentId: string;
  canWrite: boolean;
  taskCodes: TaskCodeOption[];
  tasks: Task[];
}) {
  const router = useRouter();
  const [selectedTaskCode, setSelectedTaskCode] = useState("");
  const [removingTask, setRemovingTask] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAddTask() {
    if (!selectedTaskCode) return;
    startTransition(async () => {
      const result = await addAssignmentTask(assignmentId, selectedTaskCode);
      if (result.success) {
        toast.success("Taak toegevoegd");
        setSelectedTaskCode("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleRemoveTask(taskId: string) {
    setRemovingTask(taskId);
    startTransition(async () => {
      const result = await removeAssignmentTask(assignmentId, taskId);
      if (result.success) {
        toast.success("Taak verwijderd");
        router.refresh();
      } else {
        toast.error(result.message);
      }
      setRemovingTask(null);
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <section className="veele-card">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
              Takenoverzicht
            </h3>
            <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
              Alle gekoppelde taken op deze werkbon.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold" style={{ color: "#475569" }}>
            {tasks.length} taak{tasks.length === 1 ? "" : "en"}
          </span>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-sm" style={{ borderColor: "#CBD5E1", color: "#64748B" }}>
            Nog geen taken gekoppeld. Voeg rechts een taak toe om de werkbon compleet te maken.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "#F1F5F9" }}>
            {tasks.map((task, index) => (
              <li key={task.id} className="flex items-start justify-between gap-3 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-cyan-700">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
                      {task.taskCodeCode && (
                        <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs" style={{ color: "#64748B" }}>
                          {task.taskCodeCode}
                        </span>
                      )}
                      {task.taskCodeName ?? "Taak zonder naam"}
                    </p>
                    {task.notes && (
                      <p className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "#64748B" }}>
                        {task.notes}
                      </p>
                    )}
                  </div>
                </div>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 flex-shrink-0 p-0"
                    disabled={pending && removingTask === task.id}
                    onClick={() => handleRemoveTask(task.id)}
                  >
                    {pending && removingTask === task.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                    <span className="sr-only">Taak verwijderen</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="veele-card h-fit">
        <h3 className="font-heading text-base font-semibold flex items-center gap-2" style={{ color: "#081D3A" }}>
          <ClipboardList className="h-4 w-4" style={{ color: "#00B7B3" }} />
          Taak toevoegen
        </h3>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Kies een actieve taakcode voor deze organisatie.
        </p>

        {canWrite ? (
          <div className="mt-4 space-y-3">
            <Select
              value={selectedTaskCode || "NONE"}
              onValueChange={(value) => setSelectedTaskCode(value === "NONE" ? "" : value)}
            >
              <SelectTrigger className="h-10 w-full text-sm">
                <SelectValue placeholder="Taakcode selecteren..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Selecteer taak</SelectItem>
                {taskCodes.map((taskCode) => (
                  <SelectItem key={taskCode.id} value={taskCode.id}>
                    <span className="mr-1 font-mono text-xs">{taskCode.code}</span>
                    {taskCode.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              disabled={!selectedTaskCode || pending}
              onClick={handleAddTask}
            >
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Plus className="mr-2 h-4 w-4" />
              Toevoegen aan werkbon
            </Button>
            {taskCodes.length === 0 && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                Er zijn nog geen actieve taakcodes beschikbaar.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm" style={{ color: "#64748B" }}>
            Je hebt alleen leesrechten voor deze werkbon.
          </p>
        )}
      </aside>
    </div>
  );
}

const AVAIL_DOT_COLORS: Record<AvailabilityStatus, string> = {
  beschikbaar:      "#10B981",
  niet_ingesteld:   "#CBD5E1",
  niet_beschikbaar: "#F59E0B",
  op_verlof:        "#3B82F6",
  ziek:             "#EF4444",
};

function AvailDot({ status }: { status?: AvailabilityStatus }) {
  if (!status) return null;
  return (
    <span
      className="inline-block flex-shrink-0 rounded-full"
      style={{ width: "7px", height: "7px", backgroundColor: AVAIL_DOT_COLORS[status] }}
      title={status.replace(/_/g, " ")}
    />
  );
}

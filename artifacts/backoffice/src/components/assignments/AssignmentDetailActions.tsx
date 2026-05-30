"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, ChevronRight, Plus, X, Loader2, UserPlus } from "lucide-react";
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
import { AssignmentStatusBadge } from "./AssignmentStatusBadge";
import { AssignmentForm } from "./AssignmentForm";
import {
  setAssignmentStatus,
  assignPersonnel,
  removePersonnel,
  addAssignmentTask,
  removeAssignmentTask,
  ASSIGNMENT_STATUS_TRANSITIONS,
  type AssignmentStatus,
  type AssignmentPriority,
  type CustomerOption,
  type PersonnelOption,
  type TaskCodeOption,
} from "@/app/actions/assignments";

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  requested:         "Aangevraagd",
  review:            "In beoordeling",
  quote_preparation: "Offerte in voorbereiding",
  awaiting_approval: "Wacht op goedkeuring",
  approved:          "Goedgekeurd",
  plannable:         "Inplanbaar",
  scheduled:         "Ingepland",
  seen:              "Gezien",
  in_progress:       "In uitvoering",
  not_completed:     "Niet afgerond",
  completed:         "Afgerond",
  report_submitted:  "Rapport ingediend",
  report_approved:   "Rapport goedgekeurd",
  invoice_ready:     "Klaar voor facturatie",
  invoiced:          "Gefactureerd",
  paid:              "Betaald",
  closed:            "Gesloten",
};

interface Personnel {
  id: string;
  personnelId: string;
  firstName: string;
  lastName: string;
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
  title:         string;
  status:        AssignmentStatus;
  priority:      AssignmentPriority;
  canWrite:      boolean;
  customers:     CustomerOption[];
  personnelList: PersonnelOption[];
  taskCodes:     TaskCodeOption[];
  personnel:     Personnel[];
  tasks:         Task[];
}

export function AssignmentDetailActions({
  assignmentId,
  title,
  status,
  canWrite,
  customers,
  personnelList,
  taskCodes,
  personnel,
  tasks,
}: AssignmentDetailActionsProps) {
  const router = useRouter();

  const [editOpen,         setEditOpen]         = useState(false);
  const [selectedStatus,   setSelectedStatus]   = useState<AssignmentStatus>(status);
  const [selectedPersonnel, setSelectedPersonnel] = useState("");
  const [selectedTaskCode, setSelectedTaskCode] = useState("");
  const [removingPersonnel, setRemovingPersonnel] = useState<string | null>(null);
  const [removingTask,      setRemovingTask]      = useState<string | null>(null);
  const [pending,           startTransition]      = useTransition();

  const nextStatuses = ASSIGNMENT_STATUS_TRANSITIONS[status] ?? [];

  function handleStatusChange() {
    if (selectedStatus === status) return;
    startTransition(async () => {
      const result = await setAssignmentStatus(assignmentId, selectedStatus);
      if (result.success) {
        toast.success(`Status gewijzigd naar "${STATUS_LABELS[selectedStatus]}"`);
      } else {
        toast.error(result.message);
        setSelectedStatus(status);
      }
    });
  }

  function handleAddPersonnel() {
    if (!selectedPersonnel) return;
    startTransition(async () => {
      const result = await assignPersonnel(assignmentId, selectedPersonnel);
      if (result.success) {
        if (result.warning) {
          toast.warning(result.warning, { duration: 6000 });
        } else {
          toast.success("Medewerker gekoppeld");
        }
        setSelectedPersonnel("");
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleRemovePersonnel(linkId: string, name: string) {
    setRemovingPersonnel(linkId);
    startTransition(async () => {
      const result = await removePersonnel(assignmentId, linkId);
      if (result.success) {
        toast.success(`${name} ontkoppeld`);
      } else {
        toast.error(result.message);
      }
      setRemovingPersonnel(null);
    });
  }

  function handleAddTask() {
    if (!selectedTaskCode) return;
    startTransition(async () => {
      const result = await addAssignmentTask(assignmentId, selectedTaskCode);
      if (result.success) {
        toast.success("Taak toegevoegd");
        setSelectedTaskCode("");
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
      } else {
        toast.error(result.message);
      }
      setRemovingTask(null);
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
                    {STATUS_LABELS[s]}
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
                </span>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={pending && removingPersonnel === p.id}
                    onClick={() =>
                      handleRemovePersonnel(p.id, `${p.firstName} ${p.lastName}`)
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
                {personnelList
                  .filter((p) => !personnel.some((ap) => ap.personnelId === p.id))
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </SelectItem>
                  ))}
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

      {/* ── Tasks ─────────────────────────────────────── */}
      <div className="veele-card">
        <h3
          className="font-heading text-sm font-semibold mb-4"
          style={{ color: "#081D3A" }}
        >
          Taken
        </h3>

        {tasks.length === 0 ? (
          <p className="text-sm mb-4" style={{ color: "#94A3B8" }}>
            Nog geen taken gekoppeld.
          </p>
        ) : (
          <ul className="divide-y mb-4" style={{ borderColor: "#F1F5F9" }}>
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start justify-between py-2 gap-2">
                <div>
                  <span className="text-sm font-medium" style={{ color: "#081D3A" }}>
                    {t.taskCodeCode ? (
                      <>
                        <span
                          className="text-xs font-mono px-1.5 py-0.5 rounded mr-1.5"
                          style={{ background: "#F1F5F9", color: "#64748B" }}
                        >
                          {t.taskCodeCode}
                        </span>
                        {t.taskCodeName}
                      </>
                    ) : (
                      t.taskCodeName ?? "—"
                    )}
                  </span>
                  {t.notes && (
                    <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
                      {t.notes}
                    </p>
                  )}
                </div>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 flex-shrink-0"
                    disabled={pending && removingTask === t.id}
                    onClick={() => handleRemoveTask(t.id)}
                  >
                    {pending && removingTask === t.id ? (
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
              value={selectedTaskCode || "NONE"}
              onValueChange={(v) => setSelectedTaskCode(v === "NONE" ? "" : v)}
            >
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue placeholder="Taakcode selecteren..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Selecteer taak —</SelectItem>
                {taskCodes.map((tc) => (
                  <SelectItem key={tc.id} value={tc.id}>
                    <span className="font-mono text-xs mr-1">{tc.code}</span>
                    {tc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedTaskCode || pending}
              onClick={handleAddTask}
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

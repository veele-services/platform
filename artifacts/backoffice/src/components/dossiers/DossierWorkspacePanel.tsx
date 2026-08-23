"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock3,
  FileClock,
  ListTodo,
  Loader2,
  MessageSquareText,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import {
  addDossierNoteAction,
  completeDossierTaskAction,
  createDossierTaskAction,
  markDossierReviewedAction,
  type DossierWorkspace,
} from "@/app/actions/dossier360";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Subject = {
  subjectType: "personnel" | "customer" | "object";
  subjectId: string;
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Laag",
  normal: "Normaal",
  high: "Hoog",
  urgent: "Urgent",
};
const TASK_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "Bezig",
  completed: "Afgerond",
  cancelled: "Geannuleerd",
};
const CLASSIFICATION_LABEL: Record<string, string> = {
  internal: "Intern",
  confidential: "Vertrouwelijk",
  restricted: "Strikt beperkt",
};
const CLASSIFICATION_RANK: Record<string, number> = {
  internal: 1,
  confidential: 2,
  restricted: 3,
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

export function DossierWorkspacePanel({
  dossier,
  subject,
}: {
  dossier: DossierWorkspace;
  subject: Subject;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const defaultClassification = dossier.capabilities.notes
    ? "internal"
    : dossier.capabilities.notesConfidential
      ? "confidential"
      : "restricted";
  const [noteOpen, setNoteOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [note, setNote] = useState("");
  const [classification, setClassification] = useState(defaultClassification);
  const [correction, setCorrection] = useState<{
    id: string;
    reason: string;
    classification: string;
  } | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueAt, setDueAt] = useState("");
  const base = { ...subject, dossierProfileId: dossier.summary.id };
  const correctedNoteIds = new Set(
    dossier.notes.flatMap((item) =>
      item.correctionOfId ? [item.correctionOfId] : [],
    ),
  );

  function finish(
    result: { ok: boolean; message: string },
    close?: () => void,
  ) {
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    close?.();
    router.refresh();
  }

  function saveNote() {
    startTransition(async () => {
      try {
        const result = await addDossierNoteAction({
          ...base,
          content: note,
          classification,
          correctionOfId: correction?.id ?? null,
          correctionReason: correction?.reason ?? null,
        });
        finish(result, () => {
          setNoteOpen(false);
          setNote("");
          setCorrection(null);
        });
      } catch {
        toast.error(
          "De notitie kon niet worden opgeslagen. Controleer uw sessie en verbinding.",
        );
      }
    });
  }

  function saveTask() {
    startTransition(async () => {
      try {
        const result = await createDossierTaskAction({
          ...base,
          title: taskTitle,
          priority,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        });
        finish(result, () => {
          setTaskOpen(false);
          setTaskTitle("");
          setDueAt("");
        });
      } catch {
        toast.error(
          "De taak kon niet worden opgeslagen. Controleer uw sessie en verbinding.",
        );
      }
    });
  }

  return (
    <section
      id="dossier-360"
      className="mt-6 scroll-mt-24 overflow-hidden rounded-lg border border-border bg-card"
      aria-labelledby="dossier-360-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
        <div>
          <h2
            id="dossier-360-title"
            className="font-heading text-base font-semibold text-foreground"
          >
            Dossier 360
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Open acties, toegestane notities en recente dossieractiviteit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {dossier.capabilities.manage && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      finish(
                        await markDossierReviewedAction({
                          ...base,
                          recordVersion: dossier.summary.recordVersion,
                        }),
                      );
                    } catch {
                      toast.error(
                        "De beoordeling kon niet worden vastgelegd. Controleer uw sessie en verbinding.",
                      );
                    }
                  })
                }
              >
                {isPending ? <Loader2 className="animate-spin" /> : <Check />}
                Beoordeling vastleggen
              </Button>
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => setTaskOpen(true)}
              >
                <Plus /> Taak
              </Button>
            </>
          )}
          {(dossier.capabilities.notes ||
            dossier.capabilities.notesConfidential ||
            dossier.capabilities.notesRestricted) && (
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => setNoteOpen(true)}
            >
              <Plus /> Notitie
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-w-0 divide-y divide-border xl:grid-cols-3 xl:divide-x xl:divide-y-0">
        {dossier.capabilities.manage && (
          <article className="min-w-0 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ListTodo className="h-4 w-4" /> Taken
            </h3>
            {dossier.tasks.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Geen dossiertaken.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {dossier.tasks.map((task) => (
                  <li
                    key={task.id}
                    className="min-w-0 rounded-md border border-border p-3 text-sm"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-foreground [overflow-wrap:anywhere]">
                          {task.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {PRIORITY_LABEL[task.priority] ?? task.priority}
                          {task.dueAt
                            ? ` · uiterlijk ${formatDate(task.dueAt)}`
                            : ""}
                        </p>
                      </div>
                      {task.status === "open" ||
                      task.status === "in_progress" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                finish(
                                  await completeDossierTaskAction({
                                    ...base,
                                    taskId: task.id,
                                    recordVersion: task.recordVersion,
                                  }),
                                );
                              } catch {
                                toast.error(
                                  "De taak kon niet worden afgerond. Controleer uw sessie en verbinding.",
                                );
                              }
                            })
                          }
                        >
                          Afronden
                        </Button>
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                          {TASK_STATUS_LABEL[task.status] ?? task.status}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}

        {(dossier.capabilities.notes ||
          dossier.capabilities.notesConfidential ||
          dossier.capabilities.notesRestricted) && (
          <article className="min-w-0 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquareText className="h-4 w-4" /> Notities
            </h3>
            {dossier.notes.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Nog geen dossiernotities.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {dossier.notes.map((item) => (
                  <li
                    key={item.id}
                    className="min-w-0 rounded-md border border-border p-3 text-sm"
                  >
                    {item.correctionOfId && (
                      <p className="mb-2 break-words text-xs font-semibold text-warning-foreground [overflow-wrap:anywhere]">
                        Correctie op notitie{" "}
                        {(() => {
                          const original = dossier.notes.find(
                            (noteItem) => noteItem.id === item.correctionOfId,
                          );
                          return original
                            ? `van ${formatDate(original.createdAt)}`
                            : `#${item.correctionOfId.slice(0, 8)}`;
                        })()}
                        {item.correctionReason
                          ? ` · reden: ${item.correctionReason}`
                          : ""}
                      </p>
                    )}
                    {correctedNoteIds.has(item.id) && (
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Oorspronkelijke notitie · later gecorrigeerd
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-foreground [overflow-wrap:anywhere]">
                      {item.content}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {formatDate(item.createdAt)} ·{" "}
                        {CLASSIFICATION_LABEL[item.classification] ??
                          item.classification}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCorrection({
                            id: item.id,
                            reason: "",
                            classification: item.classification,
                          });
                          setClassification(item.classification);
                          setNoteOpen(true);
                        }}
                      >
                        Corrigeren
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}

        {dossier.capabilities.timeline && (
          <article className="min-w-0 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FileClock className="h-4 w-4" /> Tijdlijn
            </h3>
            {dossier.events.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Nog geen zichtbare gebeurtenissen.
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {dossier.events.map((event) => (
                  <li
                    key={event.id}
                    className="relative min-w-0 border-l border-border pl-4 text-sm"
                  >
                    <Clock3 className="absolute -left-2 top-0 h-4 w-4 bg-card text-muted-foreground" />
                    <p className="break-words font-medium text-foreground [overflow-wrap:anywhere]">
                      {event.title}
                    </p>
                    {event.summary && (
                      <p className="mt-1 break-words text-muted-foreground [overflow-wrap:anywhere]">
                        {event.summary}
                      </p>
                    )}
                    <time
                      className="mt-1 block text-xs text-muted-foreground"
                      dateTime={event.occurredAt}
                    >
                      {formatDate(event.occurredAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </article>
        )}
      </div>

      <Dialog
        open={noteOpen}
        onOpenChange={(open) => {
          setNoteOpen(open);
          if (!open) {
            setNote("");
            setCorrection(null);
            setClassification(defaultClassification);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {correction ? "Notitie corrigeren" : "Dossiernotitie toevoegen"}
            </DialogTitle>
            <DialogDescription>
              Notities zijn append-only. Een correctie bewaart het
              oorspronkelijke bericht.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dossier-note">Notitie</Label>
              <Textarea
                id="dossier-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={5_000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dossier-classification">Classificatie</Label>
              <Select value={classification} onValueChange={setClassification}>
                <SelectTrigger id="dossier-classification">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dossier.capabilities.notes &&
                    (!correction ||
                      CLASSIFICATION_RANK.internal >=
                        CLASSIFICATION_RANK[correction.classification]) && (
                      <SelectItem value="internal">Intern</SelectItem>
                    )}
                  {dossier.capabilities.notesConfidential &&
                    (!correction ||
                      CLASSIFICATION_RANK.confidential >=
                        CLASSIFICATION_RANK[correction.classification]) && (
                      <SelectItem value="confidential">
                        Vertrouwelijk
                      </SelectItem>
                    )}
                  {dossier.capabilities.notesRestricted && (
                    <SelectItem value="restricted">Strikt beperkt</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {correction && (
              <div className="space-y-2">
                <Label htmlFor="dossier-correction-reason">
                  Reden van correctie
                </Label>
                <Input
                  id="dossier-correction-reason"
                  value={correction.reason}
                  onChange={(event) =>
                    setCorrection({ ...correction, reason: event.target.value })
                  }
                  maxLength={500}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={
                isPending ||
                note.trim().length < 3 ||
                Boolean(correction && correction.reason.trim().length < 3)
              }
              onClick={saveNote}
            >
              {isPending && <Loader2 className="animate-spin" />} Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dossiertaak toevoegen</DialogTitle>
            <DialogDescription>
              Leg eigenaar-onafhankelijke opvolging vast met een duidelijke
              prioriteit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dossier-task-title">Taak</Label>
              <Input
                id="dossier-task-title"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                maxLength={240}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dossier-task-priority">Prioriteit</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="dossier-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Laag</SelectItem>
                  <SelectItem value="normal">Normaal</SelectItem>
                  <SelectItem value="high">Hoog</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dossier-task-due">Uiterlijk</Label>
              <Input
                id="dossier-task-due"
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={isPending || taskTitle.trim().length < 3}
              onClick={saveTask}
            >
              {isPending && <Loader2 className="animate-spin" />} Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronRight, Loader2, MessageSquare, Send } from "lucide-react";
import { setAssignmentTaskCompletion } from "@/actions/assignments";
import type { ExtraWorkItem } from "@/actions/extra-work";
import { askQuestionAboutAssignment } from "@/actions/messages";
import {
  enqueueOfflineWorkOrderAction,
  isOfflineNow,
} from "@/lib/offline/work-order-queue";
import { InteractiveStatusProgress } from "./WorkOrderStatusProgress";
import {
  calculateExtraWorkLineTotal,
  formatMoney,
  formatQuantity,
  parseNumber,
  type AssignmentView,
  type MaterialUsageItem,
} from "./work-order-data";

export function StatusProgress({ assignment }: { assignment: AssignmentView }) {
  return <InteractiveStatusProgress assignment={assignment} />;
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[42%_1fr] gap-4">
      <dt className="text-[14px] font-semibold leading-tight" style={{ color: "var(--color-secondary)" }}>
        {label}
      </dt>
      <dd className="text-[14px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
        {value}
      </dd>
    </div>
  );
}

export function CustomerNotes({ description }: { description: string | null }) {
  const lines = description?.split("\n").filter(Boolean) ?? [];

  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <h2 className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
        Klantopmerkingen
      </h2>
      <div className="mt-4 space-y-1">
        {lines.length > 0 ? (
          lines.map((line) => (
            <p key={line} className="text-[14px] font-semibold leading-6" style={{ color: "var(--color-primary)" }}>
              {line}
            </p>
          ))
        ) : (
          <p className="text-[14px] leading-6" style={{ color: "var(--color-secondary)" }}>
            Geen klantopmerkingen beschikbaar.
          </p>
        )}
      </div>
    </section>
  );
}

export function AssignmentQuestionCard({ assignment }: { assignment: AssignmentView }) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitQuestion() {
    if (question.trim().length < 10) {
      setError("Vul een vraag van minimaal 10 tekens in.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await askQuestionAboutAssignment(
        assignment.id,
        question,
        "assigned_work_order",
      );

      if (result.success) {
        setTicketId(result.ticketId ?? null);
        setQuestion("");
        setIsOpen(false);
      } else {
        setError(result.error ?? "Vraag versturen mislukt");
      }
    });
  }

  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: "#E8FBFA", color: "var(--color-accent)" }}>
            <MessageSquare size={19} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
              Vraag aan planning
            </h2>
            <p className="mt-1 text-[13px] font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
              Stel een vraag over deze werkbon. Planning reageert via Berichten.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="rounded-2xl px-3 py-2 text-[12px] font-black text-white"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          Vraag
        </button>
      </div>

      {ticketId ? (
        <Link
          href={`/berichten/${ticketId}`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-[13px] font-black"
          style={{ backgroundColor: "#E8F2FF", color: "#1D4ED8" }}
        >
          <MessageSquare size={14} />
          Ticket bekijken
        </Link>
      ) : null}

      {isOpen ? (
        <div className="mt-4 rounded-2xl border p-3" style={{ borderColor: "var(--color-border)" }}>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            className="w-full resize-none rounded-2xl border px-4 py-3 text-[14px] font-semibold outline-none focus:border-[#00B7B3]"
            placeholder={`Vraag over ${assignment.code}...`}
          />
          {error ? (
            <p className="mt-2 text-[12px] font-bold" style={{ color: "var(--color-destructive)" }}>
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-2xl px-4 py-2 text-[13px] font-black"
              style={{ color: "var(--color-secondary)" }}
              disabled={isPending}
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={submitQuestion}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-[13px] font-black text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Versturen
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function CustomerInfoCard({ assignment }: { assignment: AssignmentView }) {
  const companyName = assignment.objectName || assignment.customerName || assignment.title || "Niet bekend";
  const contactName = assignment.contactName || assignment.customerName || "Niet bekend";
  const postalCity = [assignment.objectPostalCode, assignment.objectCity].filter(Boolean).join(" ") || "Niet bekend";
  const phone = assignment.phone || "Niet bekend";
  const address = assignment.objectAddress || "Niet bekend";

  return (
    <section className="rounded-[18px] bg-white px-5 py-5 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <dl className="space-y-6">
        <InfoRow label="Bedrijfsnaam" value={companyName} />
        <InfoRow label="Contactpersoon" value={contactName} />
        <InfoRow label="Adres" value={address} />
        <InfoRow label="Postcode / Plaats" value={postalCity} />
        <InfoRow label="Telefoonnummer" value={phone} />
      </dl>
    </section>
  );
}

export function TaskChecklistCard({ assignment }: { assignment: AssignmentView }) {
  const [tasks, setTasks] = useState(() => [...assignment.tasks].sort((a, b) => a.sortOrder - b.sortOrder));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const completedCount = useMemo(
    () => tasks.filter((task) => Boolean(task.completedAt)).length,
    [tasks],
  );

  function setLocalTask(taskId: string, completed: boolean) {
    setTasks((current) => current.map((task) => (
      task.id === taskId
        ? {
            ...task,
            completedAt: completed ? new Date().toISOString() : null,
          }
        : task
    )));
  }

  function toggleTask(taskId: string, completed: boolean) {
    setError(null);
    setNotice(null);
    setLocalTask(taskId, completed);

    if (isOfflineNow()) {
      enqueueOfflineWorkOrderAction({
        type: "set-task-completion",
        assignmentId: assignment.id,
        taskId,
        payload: { completed },
      });
      setNotice("Taakwijziging is offline opgeslagen.");
      return;
    }

    setPendingTaskId(taskId);
    startTransition(async () => {
      const result = await setAssignmentTaskCompletion(assignment.id, taskId, completed);
      setPendingTaskId(null);
      if (!result.success) {
        setLocalTask(taskId, !completed);
        setError(result.error ?? "Taak bijwerken mislukt");
      }
    });
  }

  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          Taken / Checklist
        </h2>
        <span className="text-[13px] font-bold" style={{ color: "var(--color-accent)" }}>
          {completedCount} van {tasks.length} afgerond
        </span>
      </div>
      {notice ? (
        <p className="mt-3 rounded-2xl px-3 py-2 text-[13px] font-bold" style={{ backgroundColor: "#E9FBF8", color: "#0A837F" }}>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-2xl px-3 py-2 text-[13px] font-bold" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
          {error}
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        {tasks.length > 0 ? tasks.map((task) => {
          const isDone = Boolean(task.completedAt);
          const disabled = isPending && pendingTaskId === task.id;

          return (
            <button
              key={task.id}
              type="button"
              className="flex w-full items-center gap-4 text-left active:scale-[0.995] disabled:opacity-70"
              disabled={disabled}
              onClick={() => toggleTask(task.id, !isDone)}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
                style={{
                  backgroundColor: isDone ? "var(--color-accent)" : "white",
                  borderColor:     isDone ? "var(--color-accent)" : "#E2E8F0",
                  color:           isDone ? "white" : "transparent",
                }}
              >
                {isDone ? <Check size={18} strokeWidth={2.8} /> : null}
              </span>
              <span className="text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
                {task.notes ?? "Taak"}
              </span>
            </button>
          );
        }) : (
          <p className="py-2 text-[14px]" style={{ color: "var(--color-secondary)" }}>
            Geen taken gekoppeld.
          </p>
        )}
      </div>
    </section>
  );
}

function ExtraWorkSubline({ item }: { item: ExtraWorkItem }) {
  const hours = parseNumber(item.hours);
  const price = parseNumber(item.price);

  if (hours > 0 && price > 0) {
    return <>{formatQuantity(hours)} uur x {formatMoney(price)}</>;
  }
  if (price > 0) {
    return <>1 x {formatMoney(price)}</>;
  }
  return <>Nog geen kosten</>;
}

export function ExtraWorkSummaryCard({
  assignmentId,
  items,
}: {
  assignmentId: string;
  items:        ExtraWorkItem[];
}) {
  const total = items.reduce((sum, item) => sum + calculateExtraWorkLineTotal(item), 0);

  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <Link href={`/opdrachten/${assignmentId}/meerwerk`} className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          Meerwerk
        </h2>
        <ChevronRight size={24} strokeWidth={2.35} style={{ color: "var(--color-primary)" }} />
      </Link>

      <div className="space-y-3">
        {items.length > 0 ? items.map((item) => (
          <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
                {item.description}
              </p>
              <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-secondary)" }}>
                <ExtraWorkSubline item={item} />
              </p>
            </div>
            <span className="text-[14px] font-black" style={{ color: "var(--color-primary)" }}>
              {formatMoney(calculateExtraWorkLineTotal(item))}
            </span>
          </div>
        )) : (
          <p className="py-1 text-[14px]" style={{ color: "var(--color-secondary)" }}>
            Geen meerwerk geregistreerd.
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
        <span className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
          Totaal meerwerk
        </span>
        <span className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
          {formatMoney(total)}
        </span>
      </div>
    </section>
  );
}

function MaterialSubline({ item }: { item: MaterialUsageItem }) {
  const unit = item.unitLabel?.trim() || "stuk";
  const source = item.usesStock && item.stockLocationName ? ` uit ${item.stockLocationName}` : "";
  return <>{formatQuantity(item.quantity)} {unit}{source}</>;
}

function MaterialBadges({ item }: { item: MaterialUsageItem }) {
  const badges = [
    item.materialCode,
    item.usesStock ? "Uit voorraad" : null,
    item.isOther ? "Overig" : null,
  ].filter((badge): badge is string => Boolean(badge));

  if (badges.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span
          key={badge}
          className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
          style={{ backgroundColor: "#E8F2FF", color: "#2563A9" }}
        >
          {badge}
        </span>
      ))}
    </div>
  );
}

export function MaterialSummaryCard({
  assignmentId,
  items,
}: {
  assignmentId: string;
  items:        MaterialUsageItem[];
}) {
  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <Link href={`/opdrachten/${assignmentId}/materiaal`} className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          Materiaal / Verbruik
        </h2>
        <ChevronRight size={24} strokeWidth={2.35} style={{ color: "var(--color-primary)" }} />
      </Link>

      <div className="space-y-3">
        {items.length > 0 ? items.map((item) => (
          <div key={item.id} className="min-w-0">
            <p className="truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
              {item.name}
            </p>
            <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-secondary)" }}>
              <MaterialSubline item={item} />
            </p>
            <MaterialBadges item={item} />
          </div>
        )) : (
          <p className="py-1 text-[14px]" style={{ color: "var(--color-secondary)" }}>
            Geen materiaal geregistreerd.
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
        <span className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
          Registraties
        </span>
        <span className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
          {items.length}
        </span>
      </div>
    </section>
  );
}

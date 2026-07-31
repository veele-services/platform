"use client";

import { SelectAdapter } from "@workspace/shared-ui";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  addExtraWork,
  deleteExtraWork,
  type ExtraWorkItem,
  type TaskCodeOption,
} from "@/actions/extra-work";
import {
  enqueueOfflineWorkOrderAction,
  isOfflineNow,
  removeOfflineWorkOrderActionsByClientMutationId,
} from "@/lib/offline/work-order-queue";
import {
  calculateExtraWorkLineTotal,
  formatMoney,
  formatQuantity,
  parseNumber,
} from "./work-order-data";

type Props = {
  assignmentId: string;
  expectedParticipantVersion: number | null;
  initialItems: ExtraWorkItem[];
  taskCodes: TaskCodeOption[];
  canEdit: boolean;
  canPersist: boolean;
};

type FormState = {
  taskCodeId: string;
  taskCodeName: string;
  description: string;
  hours: string;
  price: string;
};

const EMPTY_FORM: FormState = {
  taskCodeId: "",
  taskCodeName: "",
  description: "",
  hours: "",
  price: "",
};

function formatHoursFromMinutes(minutes: number | null): string {
  if (!minutes || minutes <= 0) return "";
  const hours = minutes / 60;
  return String(Number(hours.toFixed(2)));
}

function subline(item: Pick<ExtraWorkItem, "hours" | "price">): string {
  const hours = parseNumber(item.hours);
  const price = parseNumber(item.price);

  if (hours > 0 && price > 0)
    return `${formatQuantity(hours)} uur x ${formatMoney(price)}`;
  if (price > 0) return `1 x ${formatMoney(price)}`;
  return "Nog geen kosten";
}

export function ExtraWorkEditor({
  assignmentId,
  expectedParticipantVersion,
  initialItems,
  taskCodes,
  canEdit,
  canPersist,
}: Props) {
  const [items, setItems] = useState<ExtraWorkItem[]>(initialItems);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedLineTotal = useMemo(
    () => calculateExtraWorkLineTotal(form),
    [form],
  );
  const total = useMemo(
    () =>
      items.reduce((sum, item) => sum + calculateExtraWorkLineTotal(item), 0),
    [items],
  );

  function handleTaskCodeChange(taskCodeId: string) {
    const taskCode = taskCodes.find((code) => code.id === taskCodeId);

    setForm((current) => ({
      ...current,
      taskCodeId,
      taskCodeName: taskCode?.name ?? "",
      description: taskCode?.name ?? current.description,
      hours: formatHoursFromMinutes(taskCode?.durationMinutes ?? null),
      price: taskCode?.price ?? "",
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const description = form.description.trim();
    if (!description) {
      setError("Omschrijving is verplicht");
      return;
    }

    const clientMutationId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `extra-work-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const input = {
      taskCodeId: form.taskCodeId || null,
      taskCodeName: form.taskCodeName || null,
      description,
      hours: form.hours || null,
      price: form.price || null,
      clientMutationId,
    };

    startTransition(async () => {
      if (!canPersist || isOfflineNow()) {
        if (isOfflineNow()) {
          enqueueOfflineWorkOrderAction({
            type: "add-extra-work",
            assignmentId,
            expectedParticipantVersion,
            payload: input,
          });
        }
        setItems((current) => [
          ...current,
          {
            id: `local-extra-work-${clientMutationId}`,
            taskCodeId: input.taskCodeId,
            taskCodeName: input.taskCodeName,
            description: input.description,
            hours: input.hours,
            price: input.price,
            createdBy: "local",
            photos: [],
          },
        ]);
        setForm(EMPTY_FORM);
        setNotice(
          "Meerwerk is offline opgeslagen en wordt automatisch gesynchroniseerd.",
        );
        return;
      }

      const result = await addExtraWork(assignmentId, input);
      if (!result.success || !result.id) {
        setError(result.error ?? "Toevoegen mislukt");
        return;
      }

      setItems((current) => [
        ...current,
        {
          id: result.id!,
          taskCodeId: input.taskCodeId,
          taskCodeName: input.taskCodeName,
          description: input.description,
          hours: input.hours,
          price: input.price,
          createdBy: "",
          photos: [],
        },
      ]);
      setForm(EMPTY_FORM);
    });
  }

  function handleDelete(item: ExtraWorkItem) {
    if (item.id.startsWith("local-extra-work-")) {
      const removal = removeOfflineWorkOrderActionsByClientMutationId(
        item.id.replace("local-extra-work-", ""),
      );
      if (removal === "in_flight") {
        setError(
          "Dit meerwerk wordt al gesynchroniseerd en kan niet meer lokaal worden verwijderd.",
        );
        return;
      }
      if (removal === "not_found") {
        setError(
          "Deze offline wijziging is niet meer lokaal beschikbaar. Vernieuw de werkbon.",
        );
        return;
      }
      setItems((current) =>
        current.filter((currentItem) => currentItem.id !== item.id),
      );
      return;
    }

    if (isOfflineNow()) {
      setError(
        "Verwijderen is online-only. Probeer opnieuw zodra je verbinding hebt; offline toevoegingen kun je wel direct verwijderen.",
      );
      return;
    }

    setDeletingId(item.id);
    startTransition(async () => {
      try {
        if (canPersist && !item.id.startsWith("local-")) {
          const result = await deleteExtraWork(item.id, assignmentId);
          if (!result.success) {
            setError(result.error ?? "Verwijderen mislukt");
            return;
          }
        }
        setItems((current) =>
          current.filter((currentItem) => currentItem.id !== item.id),
        );
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <section className="space-y-4 px-4 pb-28 pt-5">
      <div
        className="rounded-[18px] bg-white px-5 py-4 shadow-sm"
        style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            className="text-[19px] font-semibold leading-tight"
            style={{ color: "var(--color-primary)" }}
          >
            Meerwerk
          </h2>
          <span
            className="text-[17px] font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {formatMoney(total)}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {items.length > 0 ? (
            items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3"
              >
                <div className="min-w-0">
                  <p
                    className="truncate text-[14px] font-semibold leading-tight"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {item.description}
                  </p>
                  <p
                    className="mt-0.5 text-[13px] font-medium leading-tight"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {subline(item)}
                  </p>
                </div>
                <span
                  className="text-[14px] font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  {formatMoney(calculateExtraWorkLineTotal(item))}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full border"
                    style={{ borderColor: "#FECACA", color: "#DC2626" }}
                    onClick={() => handleDelete(item)}
                    disabled={deletingId === item.id}
                    aria-label="Meerwerk verwijderen"
                  >
                    {deletingId === item.id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Trash2 size={15} />
                    )}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <p
              className="py-2 text-[14px]"
              style={{ color: "var(--color-secondary)" }}
            >
              Geen meerwerk geregistreerd.
            </p>
          )}
        </div>
      </div>

      {canEdit ? (
        <form
          onSubmit={handleSubmit}
          className="rounded-[18px] bg-white px-5 py-4 shadow-sm"
          style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}
        >
          <h3
            className="text-[17px] font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            Meerwerk toevoegen
          </h3>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span
                className="mb-1.5 block text-[12px] font-bold"
                style={{ color: "var(--color-secondary)" }}
              >
                Taak
              </span>
              <SelectAdapter
                value={form.taskCodeId}
                onChange={(event) => handleTaskCodeChange(event.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-[14px] font-semibold outline-none"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-primary)",
                }}
              >
                <option value="">Selecteer taak</option>
                {taskCodes.map((taskCode) => (
                  <option key={taskCode.id} value={taskCode.id}>
                    {taskCode.code} - {taskCode.name}
                  </option>
                ))}
              </SelectAdapter>
            </label>

            <label className="block">
              <span
                className="mb-1.5 block text-[12px] font-bold"
                style={{ color: "var(--color-secondary)" }}
              >
                Omschrijving
              </span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={2}
                className="w-full resize-none rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-primary)",
                }}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span
                  className="mb-1.5 block text-[12px] font-bold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  Tijd
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={form.hours}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      hours: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-primary)",
                  }}
                />
              </label>
              <label className="block">
                <span
                  className="mb-1.5 block text-[12px] font-bold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  Tarief
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      price: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border px-3 py-3 text-[14px] font-semibold outline-none"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-primary)",
                  }}
                />
              </label>
            </div>

            <div
              className="flex items-center justify-between rounded-2xl px-4 py-3"
              style={{ backgroundColor: "#F6F8FB" }}
            >
              <span
                className="text-[13px] font-bold"
                style={{ color: "var(--color-secondary)" }}
              >
                Regel totaal
              </span>
              <span
                className="text-[17px] font-semibold"
                style={{ color: "var(--color-primary)" }}
              >
                {formatMoney(selectedLineTotal)}
              </span>
            </div>

            {error ? (
              <p
                className="rounded-2xl px-3 py-2 text-[13px] font-bold"
                style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
              >
                {error}
              </p>
            ) : null}
            {notice ? (
              <p
                className="rounded-2xl px-3 py-2 text-[13px] font-bold"
                style={{ backgroundColor: "#E9FBF8", color: "#0A837F" }}
              >
                {notice}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {isPending ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Plus size={17} />
              )}
              Toevoegen
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

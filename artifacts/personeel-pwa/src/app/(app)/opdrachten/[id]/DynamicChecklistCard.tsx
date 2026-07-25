"use client";

import { CheckboxAdapter } from "@workspace/shared-ui";
import { SelectAdapter } from "@workspace/shared-ui";
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  FileCheck2,
  ShieldAlert,
} from "lucide-react";
import type { ChecklistTemplateSnapshot } from "@workspace/db";
import {
  setAssignmentChecklistAnswer,
  type MyAssignmentChecklist,
} from "@/actions/assignments";
import {
  confirmChecklistEvidenceUpload,
  prepareChecklistEvidenceUpload,
} from "@/actions/checklists";
import { createClient } from "@/lib/supabase/client";
import { ASSIGNMENT_MEDIA_BUCKET } from "@/lib/uploads/assignment-media";
import {
  enqueueOfflineWorkOrderAction,
  isOfflineNow,
} from "@/lib/offline/work-order-queue";
import {
  personnelWorkOrderIsSigned,
  SIGNED_WORK_ORDER_LOCK_MESSAGE,
} from "@/lib/work-order-lock";
import type { AssignmentView } from "./work-order-data";

type SnapshotItem =
  ChecklistTemplateSnapshot["sections"][number]["items"][number];

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function isVisible(
  item: SnapshotItem,
  answers: Map<string, MyAssignmentChecklist["answers"][number]>,
) {
  const rule = item.visibleWhen;
  if (!rule || typeof rule.itemId !== "string") return true;
  const value = answers.get(rule.itemId)?.value;
  if (rule.operator === "answered") return hasValue(value);
  if (rule.operator === "not_answered") return !hasValue(value);
  if (rule.operator === "equals") return Object.is(value, rule.value);
  if (rule.operator === "not_equals") return !Object.is(value, rule.value);
  if (rule.operator === "in" && Array.isArray(rule.value))
    return rule.value.some((option) => Object.is(option, value));
  if (rule.operator === "not_in" && Array.isArray(rule.value))
    return !rule.value.some((option) => Object.is(option, value));
  return true;
}

export function DynamicChecklistCards({
  assignment,
}: {
  assignment: AssignmentView;
}) {
  if (assignment.checklists.length === 0) return null;
  return (
    <div className="space-y-4">
      {assignment.checklists.map((checklist) => (
        <DynamicChecklistCard
          key={checklist.id}
          assignment={assignment}
          initialChecklist={checklist}
        />
      ))}
    </div>
  );
}

function DynamicChecklistCard({
  assignment,
  initialChecklist,
}: {
  assignment: AssignmentView;
  initialChecklist: MyAssignmentChecklist;
}) {
  const [answers, setAnswers] = useState(initialChecklist.answers);
  const [evidence, setEvidence] = useState(initialChecklist.evidence);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const locked =
    personnelWorkOrderIsSigned(assignment) ||
    initialChecklist.status !== "active";
  const answerMap = useMemo(
    () => new Map(answers.map((answer) => [answer.snapshotItemId, answer])),
    [answers],
  );
  const visibleItems = useMemo(
    () =>
      initialChecklist.templateSnapshot.sections
        .flatMap((section) => section.items)
        .filter(
          (item) => item.type !== "information" && isVisible(item, answerMap),
        ),
    [initialChecklist.templateSnapshot, answerMap],
  );
  const requiredItems = visibleItems.filter((item) => item.required);
  const completedRequired = requiredItems.filter((item) => {
    const itemEvidence = evidence.filter(
      (entry) => entry.snapshotItemId === item.id,
    );
    if (item.type === "photo" || item.type === "multi_photo")
      return itemEvidence.some((entry) => entry.kind === "photo");
    if (item.type === "signature")
      return itemEvidence.some((entry) => entry.kind === "signature");
    return hasValue(answerMap.get(item.id)?.value);
  }).length;
  const photoCount = evidence.filter((item) => item.kind === "photo").length;
  const complete =
    completedRequired === requiredItems.length &&
    photoCount >= initialChecklist.effectiveRules.minimumPhotos;

  function localAnswer(
    itemId: string,
    value: unknown,
    revision?: number,
    answerId?: string,
  ) {
    setAnswers((current) => {
      const existing = current.find(
        (answer) => answer.snapshotItemId === itemId,
      );
      if (existing)
        return current.map((answer) =>
          answer.snapshotItemId === itemId
            ? { ...answer, value, revision: revision ?? answer.revision }
            : answer,
        );
      return [
        ...current,
        {
          id: answerId ?? `local-${itemId}`,
          snapshotItemId: itemId,
          value,
          isDeviation: false,
          deviationNote: null,
          revision: revision ?? 0,
        },
      ];
    });
  }

  function saveAnswer(
    itemId: string,
    value: unknown,
    overrides: { isDeviation?: boolean; deviationNote?: string | null } = {},
  ) {
    if (locked) {
      setError(SIGNED_WORK_ORDER_LOCK_MESSAGE);
      return;
    }
    setError(null);
    setNotice(null);
    const current = answerMap.get(itemId);
    localAnswer(itemId, value);
    setAnswers((rows) =>
      rows.map((answer) =>
        answer.snapshotItemId === itemId
          ? {
              ...answer,
              isDeviation: overrides.isDeviation ?? answer.isDeviation,
              deviationNote: overrides.deviationNote ?? answer.deviationNote,
            }
          : answer,
      ),
    );
    if (isOfflineNow()) {
      enqueueOfflineWorkOrderAction({
        type: "set-checklist-answer",
        assignmentId: assignment.id,
        checklistId: initialChecklist.id,
        itemId,
        payload: {
          value,
          isDeviation: overrides.isDeviation ?? current?.isDeviation ?? false,
          deviationNote:
            overrides.deviationNote ?? current?.deviationNote ?? null,
          expectedRevision: current?.revision ?? 0,
        },
        expectedParticipantVersion: assignment.participantVersion ?? null,
      });
      setNotice(
        "Checklistantwoord is offline opgeslagen en wordt veilig gesynchroniseerd.",
      );
      return;
    }
    setSavingItemId(itemId);
    startTransition(async () => {
      const result = await setAssignmentChecklistAnswer(
        assignment.id,
        initialChecklist.id,
        itemId,
        {
          value,
          isDeviation: overrides.isDeviation ?? current?.isDeviation ?? false,
          deviationNote:
            overrides.deviationNote ?? current?.deviationNote ?? null,
          expectedRevision: current?.revision ?? 0,
        },
      );
      setSavingItemId(null);
      if (!result.success) {
        setError(result.error ?? "Antwoord opslaan mislukt.");
        return;
      }
      localAnswer(itemId, value, result.revision, result.answerId);
      setNotice("Antwoord opgeslagen.");
    });
  }

  function updateDeviation(
    itemId: string,
    patch: { isDeviation?: boolean; deviationNote?: string | null },
  ) {
    const current = answerMap.get(itemId);
    const value = current?.value ?? null;
    saveAnswer(itemId, value, {
      isDeviation: patch.isDeviation ?? current?.isDeviation,
      deviationNote: patch.deviationNote ?? current?.deviationNote,
    });
  }

  async function uploadEvidence(item: SnapshotItem, file: File) {
    if (locked) {
      setError(SIGNED_WORK_ORDER_LOCK_MESSAGE);
      return;
    }
    if (isOfflineNow()) {
      setError(
        "Foto’s en handtekeningen kunnen worden geüpload zodra je weer online bent. Ingevoerde antwoorden blijven bewaard.",
      );
      return;
    }
    setSavingItemId(item.id);
    setError(null);
    setNotice(null);
    const prepared = await prepareChecklistEvidenceUpload({
      assignmentId: assignment.id,
      checklistId: initialChecklist.id,
      itemId: item.id,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
    });
    if (!prepared.success) {
      setSavingItemId(null);
      setError(prepared.error);
      return;
    }
    const { error: uploadError } = await createClient()
      .storage.from(ASSIGNMENT_MEDIA_BUCKET)
      .uploadToSignedUrl(
        prepared.upload.storagePath,
        prepared.upload.token,
        file,
        { contentType: prepared.upload.mimeType },
      );
    if (uploadError) {
      setSavingItemId(null);
      setError("Upload mislukt; probeer opnieuw.");
      return;
    }
    const kind = item.type === "signature" ? "signature" : "photo";
    const confirmed = await confirmChecklistEvidenceUpload({
      assignmentId: assignment.id,
      checklistId: initialChecklist.id,
      itemId: item.id,
      kind,
      storagePath: prepared.upload.storagePath,
      operationKey: prepared.upload.operationKey,
      fileName: prepared.upload.fileName,
      mimeType: prepared.upload.mimeType,
      fileSize: prepared.upload.fileSize,
    });
    setSavingItemId(null);
    if (!confirmed.success) {
      setError(confirmed.error);
      return;
    }
    setEvidence((current) => [
      ...current,
      { id: confirmed.evidenceId, snapshotItemId: item.id, kind },
    ]);
    setNotice(
      kind === "signature"
        ? "Handtekening veilig opgeslagen."
        : "Foto veilig opgeslagen.",
    );
  }

  return (
    <section
      className="rounded-[18px] bg-white px-5 py-5 shadow-sm"
      style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-[19px] font-black leading-tight"
            style={{ color: "var(--color-primary)" }}
          >
            {initialChecklist.displayName}
          </h2>
          <p className="mt-1 text-[13px] font-semibold text-slate-500">
            {completedRequired}/{requiredItems.length} verplicht ingevuld ·{" "}
            {photoCount}/{initialChecklist.effectiveRules.minimumPhotos} foto’s
          </p>
        </div>
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-full"
          style={{
            backgroundColor: complete ? "#E9FBF8" : "#FFF7E6",
            color: complete ? "#0A837F" : "#B7790F",
          }}
        >
          {complete ? <Check /> : <FileCheck2 />}
        </span>
      </div>
      {initialChecklist.status === "detached_pending_review" && (
        <Message
          tone="warning"
          text="Deze checklist wacht op een besluit van planning of kwaliteit. Je ingevoerde gegevens blijven behouden."
        />
      )}
      {locked && (
        <Message
          tone="neutral"
          text={
            initialChecklist.status !== "active"
              ? "Deze checklist is niet meer bewerkbaar."
              : SIGNED_WORK_ORDER_LOCK_MESSAGE
          }
        />
      )}
      {notice && <Message tone="success" text={notice} />}
      {error && <Message tone="error" text={error} />}
      {initialChecklist.effectiveRules.instruction && (
        <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
          {initialChecklist.effectiveRules.instruction}
        </p>
      )}
      <div className="mt-5 space-y-6">
        {initialChecklist.templateSnapshot.sections
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((section) => (
            <div key={section.id}>
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                {section.title}
              </h3>
              {section.description && (
                <p className="mt-1 text-sm text-slate-500">
                  {section.description}
                </p>
              )}
              <div className="mt-3 space-y-4">
                {section.items
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .filter((item) => isVisible(item, answerMap))
                  .map((item) => (
                    <ChecklistField
                      key={item.id}
                      item={item}
                      answer={answerMap.get(item.id)}
                      evidenceCount={
                        evidence.filter(
                          (entry) => entry.snapshotItemId === item.id,
                        ).length
                      }
                      disabled={
                        locked || (isPending && savingItemId === item.id)
                      }
                      onLocal={(value) => localAnswer(item.id, value)}
                      onSave={(value) => saveAnswer(item.id, value)}
                      onDeviation={(patch) => updateDeviation(item.id, patch)}
                      onUpload={(file) => uploadEvidence(item, file)}
                    />
                  ))}
              </div>
            </div>
          ))}
      </div>
      {!initialChecklist.effectiveRules.personnelCanRemove && (
        <p className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-500">
          <ShieldAlert className="h-4 w-4" />
          Vereisten kunnen niet door personeel worden verwijderd. Meld een
          afwijking met toelichting.
        </p>
      )}
    </section>
  );
}

function ChecklistField({
  item,
  answer,
  evidenceCount,
  disabled,
  onLocal,
  onSave,
  onDeviation,
  onUpload,
}: {
  item: SnapshotItem;
  answer?: MyAssignmentChecklist["answers"][number];
  evidenceCount: number;
  disabled: boolean;
  onLocal: (value: unknown) => void;
  onSave: (value: unknown) => void;
  onDeviation: (patch: {
    isDeviation?: boolean;
    deviationNote?: string | null;
  }) => void;
  onUpload: (file: File) => void;
}) {
  const [deviationDraft, setDeviationDraft] = useState(
    answer?.deviationNote ?? "",
  );
  const [deviationSelected, setDeviationSelected] = useState(
    Boolean(answer?.isDeviation),
  );
  if (item.type === "information")
    return (
      <div className="rounded-2xl bg-[#EAF5FF] p-4">
        <p className="font-bold text-[#2563A9]">{item.label}</p>
        {item.description && (
          <p className="mt-1 text-sm text-[#2563A9]">{item.description}</p>
        )}
      </div>
    );
  const value = answer?.value;
  const options = Array.isArray(item.validation?.options)
    ? item.validation.options.map(String)
    : [];
  const common =
    "mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-[#00B7B3] disabled:bg-slate-100";
  return (
    <div className="rounded-2xl border border-slate-100 p-4">
      <label className="text-[15px] font-bold text-slate-800">
        {item.label}
        {item.required && (
          <span className="ml-1 text-red-600" aria-label="verplicht">
            *
          </span>
        )}
      </label>
      {item.instruction && (
        <p className="mt-1 text-[13px] text-slate-500">{item.instruction}</p>
      )}
      {item.type === "checkbox" && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSave(value !== true)}
          className="mt-3 flex w-full items-center gap-3 text-left"
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg border-2"
            style={{
              borderColor: value === true ? "#00B7B3" : "#CBD5E1",
              backgroundColor: value === true ? "#00B7B3" : "white",
              color: "white",
            }}
          >
            {value === true && <Check className="h-5 w-5" />}
          </span>
          <span>Bevestigen</span>
        </button>
      )}
      {["short_text", "long_text"].includes(item.type) &&
        (item.type === "long_text" ? (
          <textarea
            disabled={disabled}
            className={common}
            value={String(value ?? "")}
            onChange={(event) => onLocal(event.target.value)}
            onBlur={(event) => onSave(event.target.value)}
          />
        ) : (
          <input
            disabled={disabled}
            className={common}
            value={String(value ?? "")}
            onChange={(event) => onLocal(event.target.value)}
            onBlur={(event) => onSave(event.target.value)}
          />
        ))}
      {["number", "measurement"].includes(item.type) && (
        <div className="flex items-center gap-2">
          <input
            disabled={disabled}
            type="number"
            step="any"
            min={
              typeof item.validation?.min === "number"
                ? item.validation.min
                : undefined
            }
            max={
              typeof item.validation?.max === "number"
                ? item.validation.max
                : undefined
            }
            className={common}
            value={String(value ?? "")}
            onChange={(event) => onLocal(event.target.value)}
            onBlur={(event) => onSave(event.target.value)}
          />
          {typeof item.validation?.unit === "string" &&
            item.validation.unit && (
              <span className="mt-2 font-bold text-slate-500">
                {item.validation.unit}
              </span>
            )}
        </div>
      )}
      {["date", "datetime"].includes(item.type) && (
        <input
          disabled={disabled}
          type={item.type === "date" ? "date" : "datetime-local"}
          className={common}
          value={String(value ?? "")}
          onChange={(event) => {
            onLocal(event.target.value);
            onSave(event.target.value);
          }}
        />
      )}
      {item.type === "single_choice" && (
        <SelectAdapter
          disabled={disabled}
          className={common}
          value={String(value ?? "")}
          onChange={(event) => onSave(event.target.value)}
        >
          <option value="">Kies…</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectAdapter>
      )}
      {item.type === "multiple_choice" && (
        <div className="mt-3 space-y-2">
          {options.map((option) => {
            const selected = Array.isArray(value) ? value.map(String) : [];
            return (
              <button
                type="button"
                disabled={disabled}
                key={option}
                onClick={() =>
                  onSave(
                    selected.includes(option)
                      ? selected.filter((item) => item !== option)
                      : [...selected, option],
                  )
                }
                className="flex w-full items-center gap-3 text-left"
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md border"
                  style={{
                    backgroundColor: selected.includes(option)
                      ? "#00B7B3"
                      : "white",
                    color: "white",
                  }}
                >
                  {selected.includes(option) && <Check className="h-4 w-4" />}
                </span>
                {option}
              </button>
            );
          })}
        </div>
      )}
      {["photo", "multi_photo", "signature"].includes(item.type) && (
        <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-4 font-bold text-slate-600">
          <Camera className="h-5 w-5" />
          {item.type === "signature"
            ? "Handtekening als afbeelding toevoegen"
            : "Foto toevoegen"}{" "}
          ({evidenceCount})
          <input
            className="sr-only"
            disabled={disabled}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture={item.type === "signature" ? undefined : "environment"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = "";
            }}
          />
        </label>
      )}
      {item.type !== "information" && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <CheckboxAdapter
              type="checkbox"
              disabled={disabled}
              checked={deviationSelected}
              onChange={(event) => {
                setDeviationSelected(event.target.checked);
                if (!event.target.checked) {
                  setDeviationDraft("");
                  onDeviation({ isDeviation: false, deviationNote: null });
                }
              }}
            />
            Afwijking / niet uitvoerbaar melden
          </label>
          {deviationSelected && (
            <textarea
              disabled={disabled}
              className={`${common} text-sm`}
              value={deviationDraft}
              placeholder="Verplichte toelichting op de afwijking"
              onChange={(event) => setDeviationDraft(event.target.value)}
              onBlur={(event) => {
                if (event.target.value.trim())
                  onDeviation({
                    isDeviation: true,
                    deviationNote: event.target.value,
                  });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Message({
  tone,
  text,
}: {
  tone: "success" | "error" | "warning" | "neutral";
  text: string;
}) {
  const styles =
    tone === "success"
      ? ["#E9FBF8", "#0A837F"]
      : tone === "error"
        ? ["#FEF2F2", "#DC2626"]
        : tone === "warning"
          ? ["#FFF7E6", "#B7790F"]
          : ["#F1F5F9", "#475569"];
  return (
    <p
      className="mt-3 flex items-start gap-2 rounded-2xl px-3 py-2 text-[13px] font-bold"
      style={{ backgroundColor: styles[0], color: styles[1] }}
    >
      {tone === "warning" && (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      {text}
    </p>
  );
}

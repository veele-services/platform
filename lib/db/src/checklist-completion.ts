import type { AssignmentChecklistStatus } from "./schema/checklists";
import type {
  ChecklistBlockingMoment,
  ChecklistTemplateSnapshot,
  EffectiveChecklistRules,
} from "./checklist-resolution";

export type ChecklistCompletionSnapshot = {
  id: string;
  status: AssignmentChecklistStatus;
  displayName: string;
  templateSnapshot: ChecklistTemplateSnapshot;
  effectiveRules: EffectiveChecklistRules;
};

export type ChecklistAnswerProjection = {
  assignmentChecklistId: string;
  snapshotItemId: string;
  value: unknown;
  isDeviation: boolean;
  deviationNote: string | null;
};

export type ChecklistEvidenceProjection = {
  assignmentChecklistId: string;
  snapshotItemId: string;
  kind: "photo" | "file" | "signature";
};

export type ChecklistCompletionIssue = {
  checklistId: string;
  checklistName: string;
  itemId: string | null;
  itemLabel: string | null;
  code:
    | "checklist_pending_review"
    | "required_answer_missing"
    | "required_acknowledgement_missing"
    | "invalid_number"
    | "number_below_minimum"
    | "number_above_maximum"
    | "invalid_selection"
    | "deviation_note_missing"
    | "photo_evidence_missing"
    | "signature_evidence_missing";
  message: string;
};

function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function conditionalItemIsVisible(
  rule: Record<string, unknown> | null | undefined,
  answers: Map<string, ChecklistAnswerProjection>,
): boolean {
  if (!rule) return true;
  const itemId = typeof rule.itemId === "string" ? rule.itemId : null;
  if (!itemId) return true;
  const answer = answers.get(itemId);
  const operator = rule.operator;
  if (operator === "answered") return isAnswered(answer?.value);
  if (operator === "not_answered") return !isAnswered(answer?.value);
  if (operator === "equals") return Object.is(answer?.value, rule.value);
  if (operator === "not_equals") return !Object.is(answer?.value, rule.value);
  if (operator === "in" && Array.isArray(rule.value)) return rule.value.some((value) => Object.is(value, answer?.value));
  if (operator === "not_in" && Array.isArray(rule.value)) return !rule.value.some((value) => Object.is(value, answer?.value));
  return true;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const result = Number(value.replace(",", "."));
  return Number.isFinite(result) ? result : null;
}

function configuredNumber(record: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validateAssignmentChecklistCompletion(input: {
  checklists: ChecklistCompletionSnapshot[];
  answers: ChecklistAnswerProjection[];
  evidence: ChecklistEvidenceProjection[];
  blockingMoment?: ChecklistBlockingMoment;
  blockingMoments?: ChecklistBlockingMoment[];
}): ChecklistCompletionIssue[] {
  const issues: ChecklistCompletionIssue[] = [];
  const blockingMoments = new Set(input.blockingMoments ?? [input.blockingMoment ?? "before_complete"]);
  for (const checklist of input.checklists) {
    if (["cancelled", "not_applicable", "waived"].includes(checklist.status)) continue;
    if (checklist.status === "completed" && !blockingMoments.has("before_report_submit")) continue;
    if (checklist.status === "detached_pending_review") {
      issues.push({
        checklistId: checklist.id,
        checklistName: checklist.displayName,
        itemId: null,
        itemLabel: null,
        code: "checklist_pending_review",
        message: `${checklist.displayName} wacht op beoordeling door planning of kwaliteit.`,
      });
      continue;
    }
    const blocksAtMoment = checklist.effectiveRules.blockingMoments.some((moment) => blockingMoments.has(moment))
      || (blockingMoments.has("before_complete")
        && checklist.effectiveRules.required
        && checklist.effectiveRules.blockingMoments.length === 0);
    if (!blocksAtMoment) continue;
    const answers = new Map(
      input.answers
        .filter((answer) => answer.assignmentChecklistId === checklist.id)
        .map((answer) => [answer.snapshotItemId, answer]),
    );
    const evidence = input.evidence.filter((item) => item.assignmentChecklistId === checklist.id);
    const photos = evidence.filter((item) => item.kind === "photo").length;
    const signatures = evidence.filter((item) => item.kind === "signature").length;
    if (photos < checklist.effectiveRules.minimumPhotos) {
      issues.push({
        checklistId: checklist.id,
        checklistName: checklist.displayName,
        itemId: null,
        itemLabel: null,
        code: "photo_evidence_missing",
        message: `${checklist.displayName}: nog ${checklist.effectiveRules.minimumPhotos - photos} verplichte foto('s) toevoegen.`,
      });
    }
    if (checklist.effectiveRules.signatureRequired && signatures === 0) {
      issues.push({
        checklistId: checklist.id,
        checklistName: checklist.displayName,
        itemId: null,
        itemLabel: null,
        code: "signature_evidence_missing",
        message: `${checklist.displayName}: verplichte handtekening ontbreekt.`,
      });
    }
    const sections = [...checklist.templateSnapshot.sections].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
    for (const section of sections) {
      const items = [...section.items].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
      for (const item of items) {
        if (item.type === "information" || !conditionalItemIsVisible(item.visibleWhen, answers)) continue;
        const answer = answers.get(item.id);
        const itemPhotos = evidence.filter((entry) => entry.snapshotItemId === item.id && entry.kind === "photo").length;
        const itemSignatures = evidence.filter((entry) => entry.snapshotItemId === item.id && entry.kind === "signature").length;
        const configuredMinimumItemPhotos = configuredNumber(item.evidence, "minimumPhotos") ?? 0;
        const minimumItemPhotos = Math.max(
          configuredMinimumItemPhotos,
          item.required && (item.type === "photo" || item.type === "multi_photo") ? 1 : 0,
        );
        const itemSignatureRequired = item.type === "signature" || item.evidence?.signatureRequired === true;
        const evidenceFieldSatisfied = item.type === "photo" || item.type === "multi_photo"
          ? itemPhotos >= minimumItemPhotos
          : item.type === "signature"
            ? itemSignatures > 0
            : isAnswered(answer?.value);
        if (item.required && !evidenceFieldSatisfied) {
          issues.push({
            checklistId: checklist.id,
            checklistName: checklist.displayName,
            itemId: item.id,
            itemLabel: item.label,
            code: item.type === "signature"
              ? "signature_evidence_missing"
              : item.type === "photo" || item.type === "multi_photo"
                ? "photo_evidence_missing"
                : "required_answer_missing",
            message: item.type === "signature"
              ? `${checklist.displayName}: handtekening bij “${item.label}” ontbreekt.`
              : item.type === "photo" || item.type === "multi_photo"
                ? `${checklist.displayName}: “${item.label}” vereist nog ${minimumItemPhotos - itemPhotos} foto('s).`
                : `${checklist.displayName}: “${item.label}” is verplicht.`,
          });
        }
        if (itemPhotos < minimumItemPhotos && !(item.required && (item.type === "photo" || item.type === "multi_photo"))) {
          issues.push({ checklistId: checklist.id, checklistName: checklist.displayName, itemId: item.id, itemLabel: item.label, code: "photo_evidence_missing", message: `${checklist.displayName}: “${item.label}” vereist nog ${minimumItemPhotos - itemPhotos} foto('s).` });
        }
        if (itemSignatureRequired && itemSignatures === 0 && !(item.required && item.type === "signature")) {
          issues.push({ checklistId: checklist.id, checklistName: checklist.displayName, itemId: item.id, itemLabel: item.label, code: "signature_evidence_missing", message: `${checklist.displayName}: handtekening bij “${item.label}” ontbreekt.` });
        }
        if (!answer || !isAnswered(answer.value)) continue;
        if (item.type === "checkbox" && answer.value !== true) {
          issues.push({
            checklistId: checklist.id,
            checklistName: checklist.displayName,
            itemId: item.id,
            itemLabel: item.label,
            code: "required_acknowledgement_missing",
            message: `${checklist.displayName}: “${item.label}” moet worden bevestigd.`,
          });
        }
        if (item.type === "number" || item.type === "measurement") {
          const value = numberValue(answer.value);
          const minimum = configuredNumber(item.validation, "min");
          const maximum = configuredNumber(item.validation, "max");
          if (value === null) {
            issues.push({ checklistId: checklist.id, checklistName: checklist.displayName, itemId: item.id, itemLabel: item.label, code: "invalid_number", message: `${checklist.displayName}: “${item.label}” bevat geen geldig getal.` });
          } else if (minimum !== null && value < minimum) {
            issues.push({ checklistId: checklist.id, checklistName: checklist.displayName, itemId: item.id, itemLabel: item.label, code: "number_below_minimum", message: `${checklist.displayName}: “${item.label}” moet minimaal ${minimum} zijn.` });
          } else if (maximum !== null && value > maximum) {
            issues.push({ checklistId: checklist.id, checklistName: checklist.displayName, itemId: item.id, itemLabel: item.label, code: "number_above_maximum", message: `${checklist.displayName}: “${item.label}” mag maximaal ${maximum} zijn.` });
          }
        }
        const options = Array.isArray(item.validation?.options) ? item.validation.options : null;
        if (options && (item.type === "single_choice" || item.type === "multiple_choice")) {
          const selected = Array.isArray(answer.value) ? answer.value : [answer.value];
          if (selected.some((value) => !options.includes(value))) {
            issues.push({ checklistId: checklist.id, checklistName: checklist.displayName, itemId: item.id, itemLabel: item.label, code: "invalid_selection", message: `${checklist.displayName}: “${item.label}” bevat een ongeldige keuze.` });
          }
        }
        const needsDeviationNote = answer.isDeviation
          && (checklist.effectiveRules.deviationNoteRequired || item.evidence?.deviationNoteRequired === true);
        if (needsDeviationNote && !answer.deviationNote?.trim()) {
          issues.push({ checklistId: checklist.id, checklistName: checklist.displayName, itemId: item.id, itemLabel: item.label, code: "deviation_note_missing", message: `${checklist.displayName}: licht de afwijking bij “${item.label}” toe.` });
        }
      }
    }
  }
  return issues;
}

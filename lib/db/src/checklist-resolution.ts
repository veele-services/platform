export const CHECKLIST_CARDINALITIES = [
  "per_work_order",
  "per_object",
  "per_task_code",
  "per_task_instance",
] as const;

export const CHECKLIST_COMPOSITION_MODES = [
  "add",
  "available",
  "replace",
  "suppress",
] as const;

export const CHECKLIST_BLOCKING_MOMENTS = [
  "before_start",
  "before_complete",
  "before_report_submit",
] as const;

export type ChecklistCardinality = (typeof CHECKLIST_CARDINALITIES)[number];
export type ChecklistCompositionMode = (typeof CHECKLIST_COMPOSITION_MODES)[number];
export type ChecklistBlockingMoment = (typeof CHECKLIST_BLOCKING_MOMENTS)[number];

export type ChecklistTemplateSnapshot = {
  sections: Array<{
    id: string;
    title: string;
    description?: string | null;
    sortOrder: number;
    items: Array<{
      id: string;
      type: string;
      label: string;
      description?: string | null;
      instruction?: string | null;
      required?: boolean;
      sortOrder: number;
      visibleWhen?: Record<string, unknown> | null;
      validation?: Record<string, unknown> | null;
      evidence?: Record<string, unknown> | null;
    }>;
  }>;
};

export type ChecklistTemplateVersionRef = {
  templateId: string;
  familyKey: string;
  templateName: string;
  versionId: string;
  versionNumber: number;
  cardinality: ChecklistCardinality;
  protected: boolean;
  waivable: boolean;
  snapshot: ChecklistTemplateSnapshot;
};

export type ChecklistTaskContext = {
  id: string;
  taskCodeId: string | null;
  tenantTaskCodeId?: string | null;
  code?: string | null;
};

export type ChecklistResolutionContext = {
  tenantId: string;
  assignmentId: string;
  customerId: string | null;
  sectorId: string | null;
  objectId: string | null;
  objectType: string | null;
  tasks: ChecklistTaskContext[];
  effectiveAt: string;
};

export type ChecklistBindingSelectors = {
  assignmentId?: string | null;
  sectorId?: string | null;
  customerId?: string | null;
  objectType?: string | null;
  objectId?: string | null;
  taskCodeId?: string | null;
  tenantTaskCodeId?: string | null;
};

export type ChecklistBinding = {
  id: string;
  tenantId: string;
  template: ChecklistTemplateVersionRef | null;
  selectors: ChecklistBindingSelectors;
  mode: ChecklistCompositionMode;
  targetTemplateId?: string | null;
  targetFamilyKey?: string | null;
  activeFrom?: string | null;
  activeUntil?: string | null;
  autoAttach: boolean;
  required: boolean;
  blockingMoments: ChecklistBlockingMoment[];
  skipAllowed: boolean;
  personnelCanRemove: boolean;
  minimumPhotos: number;
  signatureRequired: boolean;
  deviationNoteRequired: boolean;
  displayName?: string | null;
  instruction?: string | null;
  instructionMode?: "append" | "replace";
  sortOrder?: number | null;
  reason?: string | null;
  tieBreaker?: number | null;
  createdAt: string;
};

export type ChecklistConfigurationWarning = {
  code:
    | "invalid_binding"
    | "invalid_replace"
    | "invalid_suppress"
    | "protected_suppress"
    | "equal_specificity_conflict"
    | "missing_cardinality_context";
  bindingId: string;
  targetBindingId?: string | null;
  message: string;
};

export type ChecklistSourceExplain = {
  bindingId: string;
  mode: ChecklistCompositionMode;
  priority: number;
  specificity: number;
  cardinalityKey: string;
  selectors: ChecklistBindingSelectors;
  decisions: string[];
};

export type EffectiveChecklistRules = {
  autoAttach: boolean;
  required: boolean;
  blockingMoments: ChecklistBlockingMoment[];
  skipAllowed: boolean;
  personnelCanRemove: boolean;
  minimumPhotos: number;
  signatureRequired: boolean;
  deviationNoteRequired: boolean;
  displayName: string;
  instruction: string | null;
  sortOrder: number;
  causedBy: Record<string, string[]>;
};

export type ResolvedChecklist = {
  identity: string;
  templateId: string;
  familyKey: string;
  versionId: string;
  versionNumber: number;
  cardinality: ChecklistCardinality;
  cardinalityKey: string;
  protected: boolean;
  waivable: boolean;
  snapshot: ChecklistTemplateSnapshot;
  effective: EffectiveChecklistRules;
  sources: ChecklistSourceExplain[];
};

export type SuppressedChecklistExplain = {
  templateId: string;
  familyKey: string;
  cardinalityKey: string;
  sourceBindingId: string;
  controllingBindingId: string;
  reason: string;
};

export type ChecklistResolutionResult = {
  contextFingerprint: string;
  examinedBindings: number;
  instances: ResolvedChecklist[];
  available: ResolvedChecklist[];
  suppressed: SuppressedChecklistExplain[];
  replaced: SuppressedChecklistExplain[];
  warnings: ChecklistConfigurationWarning[];
};

type BindingRank = {
  priority: number;
  specificity: number;
  tieBreaker: number;
  createdAt: string;
  id: string;
};

type Candidate = {
  binding: ChecklistBinding;
  template: ChecklistTemplateVersionRef;
  cardinalityKey: string;
  rank: BindingRank;
};

const SOURCE_PRIORITIES = {
  tenant: 300,
  sector: 400,
  objectType: 500,
  customer: 600,
  taskCode: 700,
  object: 800,
  combined: 900,
  manual: 1000,
} as const;

function normalized(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result ? result.toLocaleLowerCase("nl-NL") : null;
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableValue(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function checklistFingerprint(value: unknown): string {
  const source = stableValue(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildChecklistInstanceIdentity(input: {
  tenantId: string;
  assignmentId: string;
  templateId: string;
  cardinality: ChecklistCardinality;
  cardinalityKey: string;
}): string {
  return [
    input.tenantId,
    input.assignmentId,
    input.templateId,
    input.cardinality,
    input.cardinalityKey,
  ].join(":");
}

function configuredSelectorEntries(selectors: ChecklistBindingSelectors) {
  return Object.entries(selectors).filter(([, value]) => normalized(value) !== null);
}

export function rankChecklistBinding(binding: ChecklistBinding): BindingRank {
  const selectors = configuredSelectorEntries(binding.selectors);
  const specificity = selectors.length;
  let priority: number;
  if (normalized(binding.selectors.assignmentId)) priority = SOURCE_PRIORITIES.manual;
  else if (specificity > 1) priority = SOURCE_PRIORITIES.combined;
  else if (normalized(binding.selectors.objectId)) priority = SOURCE_PRIORITIES.object;
  else if (normalized(binding.selectors.taskCodeId) || normalized(binding.selectors.tenantTaskCodeId)) {
    priority = SOURCE_PRIORITIES.taskCode;
  } else if (normalized(binding.selectors.customerId)) priority = SOURCE_PRIORITIES.customer;
  else if (normalized(binding.selectors.objectType)) priority = SOURCE_PRIORITIES.objectType;
  else if (normalized(binding.selectors.sectorId)) priority = SOURCE_PRIORITIES.sector;
  else priority = SOURCE_PRIORITIES.tenant;
  return {
    priority,
    specificity,
    tieBreaker: binding.tieBreaker ?? 0,
    createdAt: binding.createdAt,
    id: binding.id,
  };
}

function compareRank(left: BindingRank, right: BindingRank): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  if (left.specificity !== right.specificity) return right.specificity - left.specificity;
  if (left.tieBreaker !== right.tieBreaker) return right.tieBreaker - left.tieBreaker;
  const created = left.createdAt.localeCompare(right.createdAt);
  if (created !== 0) return created;
  return left.id.localeCompare(right.id);
}

function isStrictlyMoreSpecific(controlling: BindingRank, target: BindingRank): boolean {
  return controlling.priority > target.priority
    || (controlling.priority === target.priority && controlling.specificity > target.specificity);
}

function matchesDate(binding: ChecklistBinding, effectiveAt: string): boolean {
  const effective = Date.parse(effectiveAt);
  if (!Number.isFinite(effective)) return false;
  if (binding.activeFrom && Date.parse(binding.activeFrom) > effective) return false;
  if (binding.activeUntil && Date.parse(binding.activeUntil) < effective) return false;
  return true;
}

function matchingTasks(binding: ChecklistBinding, context: ChecklistResolutionContext): ChecklistTaskContext[] {
  const taskCodeId = normalized(binding.selectors.taskCodeId);
  const tenantTaskCodeId = normalized(binding.selectors.tenantTaskCodeId);
  return context.tasks.filter((task) => {
    if (taskCodeId && normalized(task.taskCodeId) !== taskCodeId) return false;
    if (tenantTaskCodeId && normalized(task.tenantTaskCodeId) !== tenantTaskCodeId) return false;
    return true;
  });
}

function bindingMatches(binding: ChecklistBinding, context: ChecklistResolutionContext): boolean {
  if (binding.tenantId !== context.tenantId || !matchesDate(binding, context.effectiveAt)) return false;
  const selectors = binding.selectors;
  if (selectors.assignmentId && selectors.assignmentId !== context.assignmentId) return false;
  if (selectors.sectorId && selectors.sectorId !== context.sectorId) return false;
  if (selectors.customerId && selectors.customerId !== context.customerId) return false;
  if (selectors.objectId && selectors.objectId !== context.objectId) return false;
  if (selectors.objectType && normalized(selectors.objectType) !== normalized(context.objectType)) return false;
  if ((selectors.taskCodeId || selectors.tenantTaskCodeId) && matchingTasks(binding, context).length === 0) return false;
  return true;
}

function cardinalityKeys(
  binding: ChecklistBinding,
  template: ChecklistTemplateVersionRef,
  context: ChecklistResolutionContext,
): string[] {
  switch (template.cardinality) {
    case "per_work_order":
      return [`assignment:${context.assignmentId}`];
    case "per_object":
      return context.objectId ? [`object:${context.objectId}`] : [];
    case "per_task_code": {
      const tasks = matchingTasks(binding, context);
      return [...new Set(tasks.map((task) => task.tenantTaskCodeId || task.taskCodeId || task.code).filter(Boolean))]
        .map((id) => `task-code:${id}`)
        .sort();
    }
    case "per_task_instance":
      return matchingTasks(binding, context).map((task) => `task:${task.id}`).sort();
  }
}

function targetMatches(
  binding: ChecklistBinding,
  candidate: Candidate,
  context: ChecklistResolutionContext,
): boolean {
  if (binding.id === candidate.binding.id) return false;
  const targetsTemplate = Boolean(
    (binding.targetTemplateId && binding.targetTemplateId === candidate.template.templateId)
      || (binding.targetFamilyKey && binding.targetFamilyKey === candidate.template.familyKey),
  );
  if (!targetsTemplate) return false;
  return cardinalityKeys(binding, candidate.template, context).includes(candidate.cardinalityKey);
}

export function validateChecklistBinding(binding: ChecklistBinding): string[] {
  const errors: string[] = [];
  if (!binding.id.trim() || !binding.tenantId.trim()) errors.push("Binding en tenant zijn verplicht.");
  if (binding.mode !== "suppress" && !binding.template) errors.push("Deze compositiemodus vereist een templateversie.");
  if ((binding.mode === "replace" || binding.mode === "suppress")
    && !binding.targetTemplateId && !binding.targetFamilyKey) {
    errors.push("Replace en suppress vereisen een concrete template of family key.");
  }
  if ((binding.mode === "replace" || binding.mode === "suppress") && !binding.reason?.trim()) {
    errors.push("Replace en suppress vereisen een reden.");
  }
  if (!Number.isInteger(binding.minimumPhotos) || binding.minimumPhotos < 0) {
    errors.push("Minimumaantal foto's moet een niet-negatief geheel getal zijn.");
  }
  if (binding.activeFrom && binding.activeUntil
    && Date.parse(binding.activeFrom) > Date.parse(binding.activeUntil)) {
    errors.push("Actief-vanaf mag niet na actief-tot liggen.");
  }
  return errors;
}

function candidateExplain(candidate: Candidate, decisions: string[]): ChecklistSourceExplain {
  return {
    bindingId: candidate.binding.id,
    mode: candidate.binding.mode,
    priority: candidate.rank.priority,
    specificity: candidate.rank.specificity,
    cardinalityKey: candidate.cardinalityKey,
    selectors: candidate.binding.selectors,
    decisions,
  };
}

function mergeCandidates(context: ChecklistResolutionContext, candidates: Candidate[]): ResolvedChecklist {
  const ordered = [...candidates].sort((left, right) => compareRank(left.rank, right.rank));
  const presentationWinner = ordered[0]!;
  const causedBy: Record<string, string[]> = {};
  const contributors = (predicate: (candidate: Candidate) => boolean) => ordered.filter(predicate).map((item) => item.binding.id);
  const booleanCause = (key: string, desired: boolean, selector: (binding: ChecklistBinding) => boolean) => {
    causedBy[key] = contributors((candidate) => selector(candidate.binding) === desired);
  };
  const autoAttach = ordered.some((candidate) => candidate.binding.autoAttach);
  const required = ordered.some((candidate) => candidate.binding.required);
  const skipAllowed = ordered.every((candidate) => candidate.binding.skipAllowed);
  const personnelCanRemove = ordered.every((candidate) => candidate.binding.personnelCanRemove);
  const signatureRequired = ordered.some((candidate) => candidate.binding.signatureRequired);
  const deviationNoteRequired = ordered.some((candidate) => candidate.binding.deviationNoteRequired);
  const minimumPhotos = Math.max(0, ...ordered.map((candidate) => candidate.binding.minimumPhotos));
  const blockingMoments = [...new Set(ordered.flatMap((candidate) => candidate.binding.blockingMoments))].sort() as ChecklistBlockingMoment[];
  booleanCause("autoAttach", autoAttach, (binding) => binding.autoAttach);
  booleanCause("required", required, (binding) => binding.required);
  booleanCause("skipAllowed", skipAllowed, (binding) => binding.skipAllowed);
  booleanCause("personnelCanRemove", personnelCanRemove, (binding) => binding.personnelCanRemove);
  booleanCause("signatureRequired", signatureRequired, (binding) => binding.signatureRequired);
  booleanCause("deviationNoteRequired", deviationNoteRequired, (binding) => binding.deviationNoteRequired);
  causedBy.minimumPhotos = contributors((candidate) => candidate.binding.minimumPhotos === minimumPhotos);
  causedBy.blockingMoments = contributors((candidate) => candidate.binding.blockingMoments.length > 0);
  const displayCandidate = ordered.find((candidate) => candidate.binding.displayName?.trim()) ?? presentationWinner;
  const sortCandidate = ordered.find((candidate) => candidate.binding.sortOrder !== null && candidate.binding.sortOrder !== undefined)
    ?? presentationWinner;
  causedBy.displayName = [displayCandidate.binding.id];
  causedBy.sortOrder = [sortCandidate.binding.id];
  const replacementInstruction = ordered.find(
    (candidate) => candidate.binding.instructionMode === "replace" && candidate.binding.instruction?.trim(),
  );
  const appendInstructions = [...ordered]
    .reverse()
    .filter((candidate) => candidate.binding.instructionMode !== "replace" && candidate.binding.instruction?.trim())
    .map((candidate) => candidate.binding.instruction!.trim());
  const instruction = replacementInstruction?.binding.instruction?.trim()
    || ([...new Set(appendInstructions)].join("\n\n") || null);
  causedBy.instruction = replacementInstruction
    ? [replacementInstruction.binding.id]
    : contributors((candidate) => Boolean(candidate.binding.instruction?.trim()));
  const template = presentationWinner.template;
  const sourceExplains = ordered.map((candidate) => candidateExplain(candidate, [
    ...(candidate.binding.autoAttach ? ["automatisch toevoegen"] : ["alleen beschikbaar"]),
    ...(candidate.binding.required ? ["verplicht"] : []),
    ...(candidate.binding.minimumPhotos > 0 ? [`minimaal ${candidate.binding.minimumPhotos} foto('s)`] : []),
  ]));
  return {
    identity: buildChecklistInstanceIdentity({
      tenantId: context.tenantId,
      assignmentId: context.assignmentId,
      templateId: template.templateId,
      cardinality: template.cardinality,
      cardinalityKey: presentationWinner.cardinalityKey,
    }),
    templateId: template.templateId,
    familyKey: template.familyKey,
    versionId: template.versionId,
    versionNumber: template.versionNumber,
    cardinality: template.cardinality,
    cardinalityKey: presentationWinner.cardinalityKey,
    protected: template.protected,
    waivable: template.waivable,
    snapshot: template.snapshot,
    effective: {
      autoAttach,
      required,
      blockingMoments,
      skipAllowed,
      personnelCanRemove,
      minimumPhotos,
      signatureRequired,
      deviationNoteRequired,
      displayName: displayCandidate.binding.displayName?.trim() || template.templateName,
      instruction,
      sortOrder: sortCandidate.binding.sortOrder ?? 0,
      causedBy,
    },
    sources: sourceExplains,
  };
}

function resultOrder(left: ResolvedChecklist, right: ResolvedChecklist): number {
  if (left.effective.sortOrder !== right.effective.sortOrder) return left.effective.sortOrder - right.effective.sortOrder;
  const name = left.effective.displayName.localeCompare(right.effective.displayName, "nl-NL");
  if (name !== 0) return name;
  return left.identity.localeCompare(right.identity);
}

export function resolveChecklistComposition(input: {
  context: ChecklistResolutionContext;
  bindings: ChecklistBinding[];
}): ChecklistResolutionResult {
  const warnings: ChecklistConfigurationWarning[] = [];
  const candidates: Candidate[] = [];
  const controllingBindings: ChecklistBinding[] = [];
  const sortedBindings = [...input.bindings].sort((left, right) => compareRank(rankChecklistBinding(left), rankChecklistBinding(right)));

  for (const binding of sortedBindings) {
    const validation = validateChecklistBinding(binding);
    if (validation.length > 0) {
      warnings.push({ code: "invalid_binding", bindingId: binding.id, message: validation.join(" ") });
      continue;
    }
    if (!bindingMatches(binding, input.context)) continue;
    if (binding.mode === "suppress") {
      controllingBindings.push(binding);
      continue;
    }
    const template = binding.template!;
    const keys = cardinalityKeys(binding, template, input.context);
    if (keys.length === 0) {
      warnings.push({
        code: "missing_cardinality_context",
        bindingId: binding.id,
        message: `Geen context beschikbaar voor cardinaliteit ${template.cardinality}.`,
      });
      continue;
    }
    for (const cardinalityKey of keys) {
      candidates.push({ binding, template, cardinalityKey, rank: rankChecklistBinding(binding) });
    }
    if (binding.mode === "replace") controllingBindings.push(binding);
  }

  const active = new Set(candidates);
  const suppressed: SuppressedChecklistExplain[] = [];
  const replaced: SuppressedChecklistExplain[] = [];
  for (const controlling of controllingBindings) {
    const controllingRank = rankChecklistBinding(controlling);
    const targets = candidates.filter((candidate) => (
      active.has(candidate) && targetMatches(controlling, candidate, input.context)
    ));
    for (const target of targets) {
      const action = controlling.mode === "replace" ? "vervangen" : "onderdrukken";
      if (controlling.mode === "suppress" && target.template.protected) {
        warnings.push({
          code: "protected_suppress",
          bindingId: controlling.id,
          targetBindingId: target.binding.id,
          message: `Beschermde checklist ${target.template.templateName} kan niet worden onderdrukt.`,
        });
        continue;
      }
      if (!isStrictlyMoreSpecific(controllingRank, target.rank)) {
        warnings.push({
          code: "equal_specificity_conflict",
          bindingId: controlling.id,
          targetBindingId: target.binding.id,
          message: `Veilig gedrag toegepast: ${action} vereist een specifiekere regel; toevoegen blijft actief.`,
        });
        continue;
      }
      active.delete(target);
      const explanation = {
        templateId: target.template.templateId,
        familyKey: target.template.familyKey,
        cardinalityKey: target.cardinalityKey,
        sourceBindingId: target.binding.id,
        controllingBindingId: controlling.id,
        reason: controlling.reason!.trim(),
      };
      if (controlling.mode === "replace") replaced.push(explanation);
      else suppressed.push(explanation);
    }
  }

  const grouped = new Map<string, Candidate[]>();
  for (const candidate of active) {
    const key = [candidate.template.templateId, candidate.template.cardinality, candidate.cardinalityKey].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }
  const resolved = [...grouped.values()].map((group) => mergeCandidates(input.context, group));
  const instances = resolved.filter((item) => item.effective.autoAttach).sort(resultOrder);
  const available = resolved.filter((item) => !item.effective.autoAttach).sort(resultOrder);
  return {
    contextFingerprint: checklistFingerprint({ context: input.context, bindings: sortedBindings }),
    examinedBindings: input.bindings.length,
    instances,
    available,
    suppressed: suppressed.sort((left, right) => stableValue(left).localeCompare(stableValue(right))),
    replaced: replaced.sort((left, right) => stableValue(left).localeCompare(stableValue(right))),
    warnings: warnings.sort((left, right) => stableValue(left).localeCompare(stableValue(right))),
  };
}

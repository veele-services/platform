import { checklistFingerprint, type EffectiveChecklistRules, type ResolvedChecklist } from "./checklist-resolution";

export type ExistingChecklistProjection = {
  id: string;
  identity: string;
  templateId: string;
  versionId: string;
  cardinality: string;
  cardinalityKey: string;
  status: string;
  templateSnapshot: unknown;
  effectiveRules: EffectiveChecklistRules;
  sourceFingerprint: string;
  responseCount: number;
  evidenceCount: number;
};

export type ChecklistReconciliationChange = {
  kind: "create" | "update" | "cancel" | "detach" | "review_create" | "review_update" | "review_detach";
  identity: string;
  existingId: string | null;
  before: ExistingChecklistProjection | null;
  after: ResolvedChecklist | null;
  reasons: string[];
};

export type ChecklistReconciliationPlan = {
  lifecycle: "pre_start" | "started";
  changes: ChecklistReconciliationChange[];
  unchanged: string[];
  requiresReview: boolean;
  fingerprint: string;
  counts: {
    created: number;
    updated: number;
    cancelled: number;
    detached: number;
    review: number;
    unchanged: number;
  };
};

function comparableDesired(item: ResolvedChecklist) {
  return {
    templateId: item.templateId,
    versionId: item.versionId,
    cardinality: item.cardinality,
    cardinalityKey: item.cardinalityKey,
    templateSnapshot: item.snapshot,
    effectiveRules: item.effective,
    sourceFingerprint: checklistFingerprint(item.sources),
  };
}

function comparableExisting(item: ExistingChecklistProjection) {
  return {
    templateId: item.templateId,
    versionId: item.versionId,
    cardinality: item.cardinality,
    cardinalityKey: item.cardinalityKey,
    templateSnapshot: item.templateSnapshot,
    effectiveRules: item.effectiveRules,
    sourceFingerprint: item.sourceFingerprint,
  };
}

function changeReasons(existing: ExistingChecklistProjection, desired: ResolvedChecklist): string[] {
  const reasons: string[] = [];
  const before = comparableExisting(existing);
  const after = comparableDesired(desired);
  if (before.versionId !== after.versionId) reasons.push("newer_template_version_available");
  if (checklistFingerprint(before.effectiveRules) !== checklistFingerprint(after.effectiveRules)) reasons.push("effective_rules_changed");
  if (before.sourceFingerprint !== after.sourceFingerprint) reasons.push("sources_changed");
  if (checklistFingerprint(before.templateSnapshot) !== checklistFingerprint(after.templateSnapshot)) reasons.push("template_snapshot_changed");
  return reasons;
}

function stableChangeOrder(left: ChecklistReconciliationChange, right: ChecklistReconciliationChange): number {
  const identity = left.identity.localeCompare(right.identity);
  return identity === 0 ? left.kind.localeCompare(right.kind) : identity;
}

export function planChecklistReconciliation(input: {
  started: boolean;
  desired: ResolvedChecklist[];
  existing: ExistingChecklistProjection[];
}): ChecklistReconciliationPlan {
  const desiredByIdentity = new Map(input.desired.map((item) => [item.identity, item]));
  const existingByIdentity = new Map(input.existing.map((item) => [item.identity, item]));
  const changes: ChecklistReconciliationChange[] = [];
  const unchanged: string[] = [];

  for (const desired of input.desired) {
    const existing = existingByIdentity.get(desired.identity);
    if (!existing) {
      changes.push({
        kind: input.started ? "review_create" : "create",
        identity: desired.identity,
        existingId: null,
        before: null,
        after: desired,
        reasons: [input.started ? "new_requirement_after_start" : "new_applicable_checklist"],
      });
      continue;
    }
    if (["completed", "not_applicable", "waived"].includes(existing.status)) {
      unchanged.push(desired.identity);
      continue;
    }
    const reasons = changeReasons(existing, desired);
    if (reasons.length === 0 && existing.status === "active") {
      unchanged.push(desired.identity);
      continue;
    }
    if (existing.status === "cancelled") reasons.push("reactivate_cancelled_checklist");
    if (existing.status === "detached_pending_review") reasons.push("reattach_detached_checklist");
    changes.push({
      kind: input.started ? "review_update" : "update",
      identity: desired.identity,
      existingId: existing.id,
      before: existing,
      after: desired,
      reasons,
    });
  }

  for (const existing of input.existing) {
    if (desiredByIdentity.has(existing.identity)) continue;
    if (["completed", "cancelled", "not_applicable", "waived"].includes(existing.status)) {
      unchanged.push(existing.identity);
      continue;
    }
    const containsEvidence = existing.responseCount > 0 || existing.evidenceCount > 0;
    changes.push({
      kind: input.started ? "review_detach" : containsEvidence ? "detach" : "cancel",
      identity: existing.identity,
      existingId: existing.id,
      before: existing,
      after: null,
      reasons: [
        "last_source_removed",
        ...(input.started ? ["assignment_already_started"] : []),
        ...(containsEvidence ? ["preserve_existing_responses"] : []),
      ],
    });
  }

  changes.sort(stableChangeOrder);
  unchanged.sort();
  const counts = {
    created: changes.filter((change) => change.kind === "create").length,
    updated: changes.filter((change) => change.kind === "update").length,
    cancelled: changes.filter((change) => change.kind === "cancel").length,
    detached: changes.filter((change) => change.kind === "detach").length,
    review: changes.filter((change) => change.kind.startsWith("review_")).length,
    unchanged: unchanged.length,
  };
  return {
    lifecycle: input.started ? "started" : "pre_start",
    changes,
    unchanged,
    requiresReview: counts.review > 0,
    fingerprint: checklistFingerprint({ lifecycle: input.started ? "started" : "pre_start", changes, unchanged }),
    counts,
  };
}

export function assignmentChecklistMutationIsLocked(input: {
  status: string;
  actualStartedAt: Date | string | null;
  customerSignedAt?: Date | string | null;
}): boolean {
  return Boolean(
    input.actualStartedAt
      || input.customerSignedAt
      || [
        "in_progress",
        "completed",
        "report_submitted",
        "report_approved",
        "invoice_ready",
        "invoiced",
        "paid",
        "closed",
      ].includes(input.status),
  );
}

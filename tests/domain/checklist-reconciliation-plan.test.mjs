import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function load(relativePath, runtimeRequire) {
  const filename = new URL(relativePath, import.meta.url);
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: runtimeRequire }, { filename: filename.pathname });
  return module.exports;
}
const resolver = load("../../lib/db/src/checklist-resolution.ts", require);
const planner = load("../../lib/db/src/checklist-reconciliation-plan.ts", (id) => {
  if (id === "./checklist-resolution") return resolver;
  throw new Error(`Unexpected import ${id}`);
});

function desired(id = "one", overrides = {}) {
  const result = {
    identity: `tenant:assignment:${id}:per_work_order:assignment:assignment`,
    templateId: id,
    familyKey: `family-${id}`,
    versionId: `${id}-v1`,
    versionNumber: 1,
    cardinality: "per_work_order",
    cardinalityKey: "assignment:assignment",
    protected: false,
    waivable: true,
    snapshot: { sections: [] },
    effective: {
      autoAttach: true,
      required: true,
      blockingMoments: ["before_complete"],
      skipAllowed: false,
      personnelCanRemove: false,
      minimumPhotos: 0,
      signatureRequired: false,
      deviationNoteRequired: false,
      displayName: id,
      instruction: null,
      sortOrder: 0,
      causedBy: { required: ["binding"] },
    },
    sources: [{ bindingId: "binding", mode: "add", priority: 300, specificity: 0, cardinalityKey: "assignment:assignment", selectors: {}, decisions: ["verplicht"] }],
    ...overrides,
  };
  return result;
}

function existing(item = desired(), overrides = {}) {
  return {
    id: `existing-${item.templateId}`,
    identity: item.identity,
    templateId: item.templateId,
    versionId: item.versionId,
    cardinality: item.cardinality,
    cardinalityKey: item.cardinalityKey,
    status: "active",
    templateSnapshot: item.snapshot,
    effectiveRules: item.effective,
    sourceFingerprint: resolver.checklistFingerprint(item.sources),
    responseCount: 0,
    evidenceCount: 0,
    ...overrides,
  };
}

test("new pre-start checklist is created", () => {
  const plan = planner.planChecklistReconciliation({ started: false, desired: [desired()], existing: [] });
  assert.equal(plan.changes[0].kind, "create");
  assert.equal(plan.requiresReview, false);
});

test("same source set is idempotently unchanged", () => {
  const target = desired();
  const first = planner.planChecklistReconciliation({ started: false, desired: [target], existing: [existing(target)] });
  const replay = planner.planChecklistReconciliation({ started: false, desired: [target], existing: [existing(target)] });
  assert.equal(first.changes.length, 0);
  assert.equal(first.counts.unchanged, 1);
  assert.equal(first.fingerprint, replay.fingerprint);
});

test("removing one of multiple sources updates but keeps the instance", () => {
  const target = desired();
  const previous = existing(target, { sourceFingerprint: "old-two-source-hash" });
  const plan = planner.planChecklistReconciliation({ started: false, desired: [target], existing: [previous] });
  assert.equal(plan.changes[0].kind, "update");
  assert.ok(plan.changes[0].reasons.includes("sources_changed"));
});

test("last source removal cancels empty checklist before start", () => {
  const target = desired();
  const plan = planner.planChecklistReconciliation({ started: false, desired: [], existing: [existing(target)] });
  assert.equal(plan.changes[0].kind, "cancel");
});

test("last source removal preserves answers as detached pending review", () => {
  const target = desired();
  const plan = planner.planChecklistReconciliation({
    started: false,
    desired: [],
    existing: [existing(target, { responseCount: 1 })],
  });
  assert.equal(plan.changes[0].kind, "detach");
  assert.ok(plan.changes[0].reasons.includes("preserve_existing_responses"));
});

test("evidence without an answer also prevents cancellation", () => {
  const target = desired();
  const plan = planner.planChecklistReconciliation({
    started: false,
    desired: [],
    existing: [existing(target, { evidenceCount: 1 })],
  });
  assert.equal(plan.changes[0].kind, "detach");
});

test("task removal during execution only creates a review proposal", () => {
  const target = desired();
  const plan = planner.planChecklistReconciliation({ started: true, desired: [], existing: [existing(target)] });
  assert.equal(plan.changes[0].kind, "review_detach");
  assert.equal(plan.requiresReview, true);
});

test("new requirement during execution is never silently attached", () => {
  const plan = planner.planChecklistReconciliation({ started: true, desired: [desired()], existing: [] });
  assert.equal(plan.changes[0].kind, "review_create");
});

test("rule change during execution is a review update", () => {
  const target = desired();
  const previous = existing(target, {
    effectiveRules: { ...target.effective, minimumPhotos: 0 },
  });
  const changed = desired("one", { effective: { ...target.effective, minimumPhotos: 3 } });
  const plan = planner.planChecklistReconciliation({ started: true, desired: [changed], existing: [previous] });
  assert.equal(plan.changes[0].kind, "review_update");
});

test("published template update never silently changes an existing version", () => {
  const target = desired();
  const newer = desired("one", { versionId: "one-v2", versionNumber: 2, snapshot: { sections: [{ id: "new" }] } });
  const plan = planner.planChecklistReconciliation({ started: false, desired: [newer], existing: [existing(target)] });
  assert.equal(plan.changes[0].kind, "update");
  assert.ok(plan.changes[0].reasons.includes("newer_template_version_available"));
});

test("completed, waived and not-applicable snapshots remain immutable", () => {
  for (const status of ["completed", "waived", "not_applicable"]) {
    const target = desired(status);
    const plan = planner.planChecklistReconciliation({
      started: true,
      desired: [target],
      existing: [existing(target, { status, sourceFingerprint: "different" })],
    });
    assert.equal(plan.changes.length, 0);
  }
});

test("actual start and terminal statuses lock automatic mutation", () => {
  assert.equal(planner.assignmentChecklistMutationIsLocked({ status: "scheduled", actualStartedAt: null }), false);
  assert.equal(planner.assignmentChecklistMutationIsLocked({ status: "scheduled", actualStartedAt: "2026-07-21T10:00:00Z" }), true);
  assert.equal(planner.assignmentChecklistMutationIsLocked({ status: "in_progress", actualStartedAt: null }), true);
  assert.equal(planner.assignmentChecklistMutationIsLocked({ status: "completed", actualStartedAt: null }), true);
  assert.equal(planner.assignmentChecklistMutationIsLocked({ status: "scheduled", actualStartedAt: null, customerSignedAt: "2026-07-21T11:00:00Z" }), true);
});

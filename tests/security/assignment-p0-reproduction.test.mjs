import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAssignmentP0Evidence,
  summarizeAssignmentP0Evidence,
} from "../../security/repros/assignments/source-evidence.mjs";

const evidence = buildAssignmentP0Evidence();

function byId(id) {
  const row = evidence.find((candidate) => candidate.id === id);
  assert.ok(row, `missing reproduction row ${id}`);
  return row;
}

function assertReproduced(row, expectedFinding) {
  assert.equal(row.finding, expectedFinding);
  assert.equal(row.currentFailingExploitEvidence, true);
  assert.equal(row.classification, "reproduced_requires_real_database");
  assert.equal(row.assertions.unauthorizedCall, true, `${row.id} should assert unauthorized call path`);
  assert.equal(row.assertions.auditAndDenial, true, `${row.id} should assert audit/denial behavior`);
  assert.ok(Number.isInteger(row.line), `${row.id} should include source line evidence`);
}

test("assignment P0 reproduction matrix covers all requested findings", () => {
  const summary = summarizeAssignmentP0Evidence();

  assert.equal(summary.byFinding["P0-A"], 5);
  assert.equal(summary.byFinding["P0-B"], 7);
  assert.equal(summary.byFinding["P0-C"], 1);
  assert.equal(summary.byFinding["P0-D"], 9);
  assert.equal(summary.currentFailingExploitEvidence, 17);
  assert.equal(summary.fixedOrBlockedControls, 5);
  assert.equal(summary.requiresRealDatabase, 17);
});

test("P0-A reproduces illegal status transition paths through direct action and generic edit payload", () => {
  const direct = byId("P0-A-allowAny-status-override");
  assertReproduced(direct, "P0-A");
  assert.equal(direct.assertions.parentRowChanged, true);
  assert.equal(direct.assertions.childOrSideEffectRowChanged, false);

  const generic = byId("P0-A-generic-edit-status-payload");
  assertReproduced(generic, "P0-A");
  assert.equal(generic.assertions.parentRowChanged, true);
  assert.equal(generic.assertions.childOrSideEffectRowChanged, true);

  const form = byId("P0-A-assignment-form-all-statuses");
  assertReproduced(form, "P0-A");
  assert.equal(form.assertions.parentRowChanged, true);

  const ui = byId("P0-A-status-stepper-all-statuses");
  assertReproduced(ui, "P0-A");
  assert.match(ui.notes, /first-party exploit path/u);
});

test("P0-A classifies normal direct status changes as expected-denial controls", () => {
  const row = byId("P0-A-normal-status-action-fixed-control");

  assert.equal(row.classification, "fixed_or_blocked_by_architecture");
  assert.equal(row.currentFailingExploitEvidence, false);
  assert.equal(row.assertions.unauthorizedCall, false);
  assert.equal(row.assertions.parentRowChanged, false);
  assert.equal(row.assertions.auditAndDenial, true);
});

test("P0-B reproduces cross-tenant assignment and child mutation IDORs", () => {
  for (const id of [
    "P0-B-removePersonnel",
    "P0-B-approveDirectly",
    "P0-B-deleteAssignment",
    "P0-B-history-helpers",
    "P0-B-reschedule",
    "P0-B-reshift",
  ]) {
    assertReproduced(byId(id), "P0-B");
  }

  assert.equal(byId("P0-B-removePersonnel").assertions.parentRowChanged, false);
  assert.equal(byId("P0-B-removePersonnel").assertions.childOrSideEffectRowChanged, true);
  assert.equal(byId("P0-B-approveDirectly").assertions.parentRowChanged, true);
  assert.equal(byId("P0-B-deleteAssignment").assertions.childOrSideEffectRowChanged, true);
  assert.equal(byId("P0-B-history-helpers").assertions.parentRowChanged, false);
});

test("P0-B classifies tenant-scoped child controls as fixed or architecture-blocked", () => {
  const row = byId("P0-B-task-personnel-child-fixed-controls");

  assert.equal(row.classification, "fixed_or_blocked_by_architecture");
  assert.equal(row.currentFailingExploitEvidence, false);
  assert.equal(row.assertions.unauthorizedCall, false);
  assert.equal(row.assertions.parentRowChanged, false);
  assert.equal(row.assertions.childOrSideEffectRowChanged, false);
  assert.equal(row.assertions.auditAndDenial, true);
});

test("P0-C reproduces zero-parent-row update with persisted capacity side effect", () => {
  const row = byId("P0-C-updateAssignment-capacity-side-effect");

  assertReproduced(row, "P0-C");
  assert.equal(row.assertions.parentRowChanged, false);
  assert.equal(row.assertions.childOrSideEffectRowChanged, true);
  assert.match(row.notes, /zero parent rows/u);
});

test("P0-D reproduces tenantless readiness, capacity, stale candidate and interest-round helpers", () => {
  for (const id of [
    "P0-D-planning-readiness",
    "P0-D-recalculate-capacity-action",
    "P0-D-interest-round-send",
    "P0-D-interest-reminder",
    "P0-D-interest-history",
    "P0-D-capacity-defaults-latest",
  ]) {
    assertReproduced(byId(id), "P0-D");
  }

  assert.equal(byId("P0-D-planning-readiness").assertions.childOrSideEffectRowChanged, true);
  assert.equal(byId("P0-D-recalculate-capacity-action").assertions.childOrSideEffectRowChanged, true);
  assert.equal(byId("P0-D-interest-round-send").assertions.childOrSideEffectRowChanged, true);
  assert.equal(byId("P0-D-interest-reminder").assertions.childOrSideEffectRowChanged, true);
  assert.equal(byId("P0-D-interest-history").assertions.childOrSideEffectRowChanged, false);
  assert.equal(byId("P0-D-capacity-defaults-latest").assertions.childOrSideEffectRowChanged, true);
});

test("P0-D classifies tenant-scoped interest controls as expected-denial or architecture-blocked", () => {
  for (const id of [
    "P0-D-mark-interest-candidate-fixed-control",
    "P0-D-personnel-interest-actions-fixed-controls",
    "P0-D-planning-board-stale-candidates-blocked",
  ]) {
    const row = byId(id);
    assert.equal(row.classification, "fixed_or_blocked_by_architecture");
    assert.equal(row.currentFailingExploitEvidence, false);
    assert.equal(row.assertions.unauthorizedCall, false);
    assert.equal(row.assertions.auditAndDenial, true);
  }
});

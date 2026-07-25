import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAssignmentTimeProjection,
  resolveAssignmentEffectiveInterval,
} from "../../lib/db/src/assignment-time-projection.ts";
import {
  assertStaffingSelectionAllowed,
  resolveRequiredSlots,
  resolveStaffingAssignmentStatus,
} from "../../lib/db/src/staffing-invariants.ts";

test("effective interval preserves a complete planned interval before execution", () => {
  const result = resolveAssignmentEffectiveInterval({
    scheduledDate: "2026-07-21",
    scheduledStart: "11:00",
    scheduledEnd: "12:00",
    actualStartedAt: null,
    actualCompletedAt: null,
    status: "scheduled",
    now: "2026-07-21T10:00:00.000Z",
  });

  assert.equal(result.effectiveDate, "2026-07-21");
  assert.equal(result.effectiveStart, "11:00");
  assert.equal(result.effectiveEnd, "12:00");
  assert.equal(result.endMode, "planned");
  assert.equal(result.source, "planned");
  assert.equal(result.isRunning, false);
  assert.equal(result.hasDeviation, false);
});

test("running execution uses actual Amsterdam start through injected now", () => {
  const result = resolveAssignmentEffectiveInterval({
    scheduledDate: "2026-07-21",
    scheduledStart: "11:00",
    scheduledEnd: "12:00",
    actualStartedAt: "2026-07-21T07:22:00.000Z",
    actualCompletedAt: null,
    status: "in_progress",
    now: "2026-07-21T07:44:00.000Z",
  });

  assert.equal(result.effectiveDate, "2026-07-21");
  assert.equal(result.effectiveStart, "09:22");
  assert.equal(result.effectiveEnd, "09:44");
  assert.equal(result.endMode, "now");
  assert.equal(result.source, "partly_actual");
  assert.equal(result.isRunning, true);
  assert.equal(result.hasDeviation, true);
});

test("completed execution uses exact actual interval without unioning planned geometry", () => {
  const result = resolveAssignmentEffectiveInterval({
    scheduledDate: "2026-07-21",
    scheduledStart: "11:00",
    scheduledEnd: "12:00",
    actualStartedAt: "2026-07-21T07:22:00.000Z",
    actualCompletedAt: "2026-07-21T07:44:00.000Z",
    status: "completed",
  });

  assert.equal(result.effectiveStart, "09:22");
  assert.equal(result.effectiveEnd, "09:44");
  assert.equal(result.endMode, "actual");
  assert.equal(result.source, "actual");
  assert.equal(result.isRunning, false);
});

test("actual execution is grouped on its actual Amsterdam date", () => {
  const result = resolveAssignmentEffectiveInterval({
    scheduledDate: "2026-07-21",
    scheduledStart: "23:30",
    scheduledEnd: "23:55",
    actualStartedAt: "2026-07-21T22:15:00.000Z",
    actualCompletedAt: "2026-07-21T22:45:00.000Z",
    status: "completed",
  });

  assert.equal(result.effectiveDate, "2026-07-22");
  assert.equal(result.effectiveStart, "00:15");
  assert.equal(result.effectiveEnd, "00:45");
  assert.equal(result.hasDeviation, true);
});

test("non-running partial actual data falls back visibly and reports data quality", () => {
  const result = resolveAssignmentEffectiveInterval({
    scheduledDate: "2026-07-21",
    scheduledStart: "11:00",
    scheduledEnd: "12:00",
    actualStartedAt: "2026-07-21T09:30:00.000Z",
    actualCompletedAt: null,
    status: "completed",
  });

  assert.equal(result.effectiveStart, "11:30");
  assert.equal(result.effectiveEnd, "12:00");
  assert.equal(result.endMode, "planned");
  assert.match(result.dataQualityWarning ?? "", /mist een eindtijd/u);
});

test("compatibility projection delegates to the effective interval resolver", () => {
  const result = buildAssignmentTimeProjection({
    scheduledDate: "2026-07-21",
    scheduledStart: "11:00",
    scheduledEnd: "12:00",
    actualStartedAt: "2026-07-21T07:22:00.000Z",
    actualCompletedAt: null,
    status: "in_progress",
    now: "2026-07-21T07:44:00.000Z",
  });

  assert.deepEqual(
    {
      date: result.effectiveDate,
      start: result.effectiveStart,
      end: result.effectiveEnd,
    },
    { date: "2026-07-21", start: "09:22", end: "09:44" },
  );
});

test("required slot count reconciles explicit count and distinct roles", () => {
  assert.equal(resolveRequiredSlots(null, []), 1);
  assert.equal(resolveRequiredSlots(3, ["role-a"]), 3);
  assert.equal(resolveRequiredSlots(1, ["role-a", "role-b", "role-a"]), 2);
});

test("staffing status requires full planning and never regresses active/final work", () => {
  const base = {
    assignedCount: 2,
    requiredSlots: 2,
    scheduledDate: "2026-07-21",
    scheduledStart: "11:00",
    scheduledEnd: "12:00",
  };
  assert.equal(
    resolveStaffingAssignmentStatus({ ...base, currentStatus: "plannable" }),
    "scheduled",
  );
  assert.equal(
    resolveStaffingAssignmentStatus({
      ...base,
      currentStatus: "plannable",
      scheduledEnd: null,
    }),
    "plannable",
  );
  for (const currentStatus of [
    "scheduled",
    "seen",
    "en_route",
    "in_progress",
    "completed",
    "closed",
  ] as const) {
    assert.equal(
      resolveStaffingAssignmentStatus({
        ...base,
        currentStatus,
        assignedCount: 0,
      }),
      currentStatus,
    );
  }
});

test("final assignments reject new staffing selections", () => {
  assert.doesNotThrow(() => assertStaffingSelectionAllowed("in_progress"));
  assert.throws(
    () => assertStaffingSelectionAllowed("completed"),
    (error: unknown) =>
      error instanceof Error &&
      (error as Error & { code?: string }).code === "assignment_staffing_final",
  );
});

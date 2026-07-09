import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const sourcePath = path.join(
  root,
  "artifacts/backoffice/src/lib/planning/eta-rules.ts",
);
const source = fs
  .readFileSync(sourcePath, "utf8")
  .replace('import "server-only";', "");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
});
const module = { exports: {} };
vm.runInNewContext(transpiled.outputText, {
  module,
  exports: module.exports,
  require: (id) => {
    throw new Error(`Unexpected runtime import in eta-rules test: ${id}`);
  },
});

const {
  computeEtaSnapSuggestion,
  getRouteBufferMinutes,
  selectDepartureTime,
  sortEtaAssignmentsForPersonnel,
} = module.exports;

function localTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

test("phase 5 ETA rules keep first assignment read-only and ok", () => {
  const result = computeEtaSnapSuggestion({
    scheduledDate: "2026-07-09",
    scheduledStart: "09:00",
    scheduledEnd: "10:00",
    departureTime: null,
    routeDurationSeconds: null,
    bufferMinutes: 0,
    slotMinutes: 15,
    workdayStart: "08:00",
  });

  assert.equal(result.snapStatus, "ok");
  assert.equal(result.snapSuggestedStart, null);
  assert.equal(result.warningCode, null);
  assert.equal(localTime(result.computedEarliestStart), "09:00");
});

test("phase 5 ETA rules suggest rounded time inside customer window", () => {
  const result = computeEtaSnapSuggestion({
    scheduledDate: "2026-07-09",
    scheduledStart: "09:00",
    scheduledEnd: "10:00",
    departureTime: new Date("2026-07-09T09:00:00"),
    routeDurationSeconds: 22 * 60,
    bufferMinutes: 10,
    slotMinutes: 15,
    workdayStart: "08:00",
  });

  assert.equal(result.snapStatus, "suggested");
  assert.equal(result.snapSuggestedStart, "09:45");
  assert.equal(result.snapSuggestedEnd, "10:45");
  assert.equal(result.warningCode, "time_suggestion");
});

test("phase 5 ETA rules report outside customer window", () => {
  const result = computeEtaSnapSuggestion({
    scheduledDate: "2026-07-09",
    scheduledStart: "09:00",
    scheduledEnd: "10:00",
    customerWindowStart: "09:00",
    customerWindowEnd: "11:00",
    departureTime: new Date("2026-07-09T10:30:00"),
    routeDurationSeconds: 40 * 60,
    bufferMinutes: 0,
    slotMinutes: 10,
    workdayStart: "08:00",
  });

  assert.equal(result.snapStatus, "outside_window");
  assert.equal(result.snapSuggestedStart, "11:10");
  assert.equal(result.warningCode, "outside_customer_window");
});

test("phase 5 ETA rules expose missing location and provider failures", () => {
  const missing = computeEtaSnapSuggestion({
    scheduledDate: "2026-07-09",
    scheduledStart: "09:00",
    scheduledEnd: "10:00",
    departureTime: null,
    routeDurationSeconds: null,
    bufferMinutes: 0,
    slotMinutes: 15,
    workdayStart: "08:00",
    missingLocation: true,
  });
  assert.equal(missing.snapStatus, "missing_location");
  assert.equal(missing.warningCode, "missing_location");

  const providerError = computeEtaSnapSuggestion({
    scheduledDate: "2026-07-09",
    scheduledStart: "09:00",
    scheduledEnd: "10:00",
    departureTime: new Date("2026-07-09T08:00:00"),
    routeDurationSeconds: null,
    bufferMinutes: 0,
    slotMinutes: 15,
    workdayStart: "08:00",
    providerError: "Routeprovider faalde.",
  });
  assert.equal(providerError.snapStatus, "provider_error");
  assert.equal(providerError.warningMessage, "Routeprovider faalde.");
});

test("phase 5 ETA rules sort personnel day sequence deterministically", () => {
  const ordered = sortEtaAssignmentsForPersonnel([
    {
      id: "b",
      scheduledDate: "2026-07-09",
      scheduledStart: "10:00",
      scheduledEnd: "11:00",
      status: "scheduled",
      assignedAt: new Date("2026-07-01T09:00:00"),
      actualCompletedAt: null,
    },
    {
      id: "a",
      scheduledDate: "2026-07-09",
      scheduledStart: "09:00",
      scheduledEnd: "10:00",
      status: "scheduled",
      assignedAt: new Date("2026-07-01T10:00:00"),
      actualCompletedAt: null,
    },
    {
      id: "c",
      scheduledDate: "2026-07-09",
      scheduledStart: "10:00",
      scheduledEnd: "11:00",
      status: "scheduled",
      assignedAt: new Date("2026-07-01T08:00:00"),
      actualCompletedAt: null,
    },
  ]);

  assert.equal(ordered.map((assignment) => assignment.id).join(","), "a,c,b");
});

test("phase 5 ETA rules prefer actual completion and in-progress max now", () => {
  const actual = selectDepartureTime({
    previousAssignment: {
      id: "a",
      scheduledDate: "2026-07-09",
      scheduledStart: "09:00",
      scheduledEnd: "10:00",
      status: "completed",
      assignedAt: null,
      actualCompletedAt: new Date("2026-07-09T09:45:00"),
    },
    now: new Date("2026-07-09T11:00:00"),
  });
  assert.equal(localTime(actual), "09:45");

  const inProgress = selectDepartureTime({
    previousAssignment: {
      id: "a",
      scheduledDate: "2026-07-09",
      scheduledStart: "09:00",
      scheduledEnd: "10:00",
      status: "in_progress",
      assignedAt: null,
      actualCompletedAt: null,
    },
    now: new Date("2026-07-09T10:30:00"),
  });
  assert.equal(localTime(inProgress), "10:30");
});

test("phase 5 ETA rules apply buffer per vehicle type", () => {
  const settings = {
    planningWorkdayStart: "08:00",
    planningTimeSlotMinutes: 15,
    routeBufferMinutesCar: 10,
    routeBufferMinutesBicycle: 5,
    routeBufferMinutesWalking: 4,
    routeBufferMinutesMopedOrScooter: 8,
    routeBufferMinutesPublicTransport: 15,
  };

  assert.equal(getRouteBufferMinutes(settings, "car"), 10);
  assert.equal(getRouteBufferMinutes(settings, "bicycle"), 5);
  assert.equal(getRouteBufferMinutes(settings, "walking"), 4);
  assert.equal(getRouteBufferMinutes(settings, "moped_or_scooter"), 8);
  assert.equal(getRouteBufferMinutes(settings, "public_transport"), 15);
});

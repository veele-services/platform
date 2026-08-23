import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("lib/db/src/personnel-availability.ts", "utf8");
const action = readFileSync(
  "artifacts/personeel-pwa/src/actions/availability.ts",
  "utf8",
);
const form = readFileSync(
  "artifacts/personeel-pwa/src/app/(app)/beschikbaarheid/BeschikbaarheidForm.tsx",
  "utf8",
);
const runtime = readFileSync(
  "scripts/fieldgrid-availability-delete-runtime.mts",
  "utf8",
);

test("availability deletion is owned by the canonical tenant-bound transaction service", () => {
  assert.match(service, /deleteDateAvailabilityException/u);
  assert.match(service, /eq\(personnelTable\.tenantId, input\.tenantId\)/u);
  assert.match(service, /eq\(personnelTable\.isActive, true\)/u);
  assert.match(service, /\.for\("update"\)/u);
  assert.match(service, /availability\.exception\.delete/u);
  assert.doesNotMatch(action, /\.delete\(availabilityDayEntriesTable\)/u);
  assert.match(action, /await deleteDateAvailabilityException/u);
});

test("the personnel action and UI require a canonical row version and recover from conflicts", () => {
  assert.match(action, /expectedUpdatedAt: string/u);
  assert.match(action, /result\.code === "conflict"/u);
  assert.match(form, /const expectedUpdatedAt = selectedEntry\.updatedAt/u);
  assert.match(form, /deleteAvailabilityDay\(\{[\s\S]*expectedUpdatedAt/u);
  assert.match(form, /if \(result\.code === "conflict"\) setConflict\(true\)/u);
  assert.match(form, /Vernieuw en probeer opnieuw/u);
  assert.match(
    service,
    /returning\(\{[\s\S]*updatedAt: availabilityDayEntriesTable\.updatedAt/u,
  );
  assert.match(service, /storedVersions\[stored\.date\]/u);
  assert.match(action, /updatedAtByDate: result\.versions/u);
  assert.match(form, /updatedAtByDate\[date\]/u);
});

test("the permanent runtime proof covers authorization, concurrency, audit atomicity and replay", () => {
  for (const evidence of [
    "tenantB",
    "inactiveUser",
    "runtime audit rejection",
    "replayed: true",
    "Promise.all",
    "availability.exception.delete",
    "saveDelete",
    "storedVersion",
    "mixedExisting",
    "savedMixed.versions",
  ]) {
    assert.match(runtime, new RegExp(evidence.replaceAll(".", "\\."), "u"));
  }
});

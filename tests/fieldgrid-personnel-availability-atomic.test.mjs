import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

function functionBody(content, name) {
  const marker = `export async function ${name}`;
  const start = content.indexOf(marker);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = content.indexOf(
    "\nexport async function ",
    start + marker.length,
  );
  return content.slice(start, next === -1 ? content.length : next);
}

function assertIncludesAll(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should include ${phrase}`);
  }
}

test("personnel PWA availability resolves an active tenant-bound actor", () => {
  const actions = read("artifacts/personeel-pwa/src/actions/availability.ts");

  assertIncludesAll(
    actions,
    [
      "requireCurrentPersonnelPortalTenantId",
      "async function getAuthenticatedAvailabilityActor",
      "eq(personnelTable.userId, userId)",
      "eq(personnelTable.tenantId, tenantId)",
      "eq(personnelTable.isActive, true)",
      "getAvailabilityAdvanceDays(actor.tenantId)",
      "where(eq(organizationSettingsTable.tenantId, tenantId))",
    ],
    "tenant-bound personnel availability actor",
  );

  assert.doesNotMatch(actions, /\.from\("personnel"\)/u);
  assert.doesNotMatch(actions, /\.eq\("is_active", true\)/u);
});

test("weekly availability save is diffed, atomic and rollback-safe", () => {
  const actions = read("artifacts/personeel-pwa/src/actions/availability.ts");
  const saveWindows = functionBody(actions, "saveAvailabilityWindows");

  assertIncludesAll(
    saveWindows,
    [
      "normalizeAvailabilityWindows(windows)",
      "updatedAtMatches(actor.updatedAt, options?.expectedPersonnelUpdatedAt)",
      "conflict: true",
      "await db.transaction(async (tx) => {",
      "existingByDay",
      "tx.insert(availabilityWindowsTable)",
      ".update(availabilityWindowsTable)",
      ".delete(availabilityWindowsTable)",
      "notInArray(availabilityWindowsTable.dayOfWeek, requestedDays)",
      "tx.insert(auditLogTable).values",
      "availability_windows_saved",
      "revalidateAvailabilityConsumers();",
    ],
    "weekly atomic save",
  );

  assert.doesNotMatch(saveWindows, /\.from\("availability_windows"\)/u);
  assert.doesNotMatch(saveWindows, /\.delete\(\)\s*\.[\s\S]*\.insert\(/u);
  assert.ok(
    saveWindows.indexOf("await db.transaction") <
      saveWindows.indexOf("revalidateAvailabilityConsumers();"),
    "revalidation should happen after the transaction commits",
  );
});

test("date-specific availability save validates, upserts idempotently and detects stale edits", () => {
  const actions = read("artifacts/personeel-pwa/src/actions/availability.ts");
  const saveDay = functionBody(actions, "saveAvailabilityDay");

  assertIncludesAll(
    actions,
    [
      "function isValidDateKey",
      "dateKey(parseDateKey(value)) === value",
      "const VALID_REPEAT_TYPES",
      "function validateTimeRange",
      "function normalizeAvailabilityWindows",
      "Overlappende beschikbaarheid op dezelfde dag",
    ],
    "validation helpers",
  );

  assertIncludesAll(
    saveDay,
    [
      "isValidDateKey(input.date)",
      "VALID_REPEAT_TYPES.includes(input.repeatType)",
      "const startTime = input.startTime.trim();",
      "const endTime = input.endTime.trim();",
      "const timeError = validateTimeRange(startTime, endTime)",
      "await db.transaction(async (tx) => {",
      "existingSelected",
      "input.expectedUpdatedAt",
      "conflict: true",
      ".onConflictDoUpdate",
      "target: [",
      "availabilityDayEntriesTable.personnelId",
      "availabilityDayEntriesTable.date",
      "tx.insert(auditLogTable).values",
      "availability_day_saved",
      "updatedAt: now",
    ],
    "date-specific idempotent save",
  );

  assert.ok(
    saveDay.indexOf("await db.transaction") <
      saveDay.indexOf("revalidateAvailabilityConsumers();"),
    "planning/personnel revalidation should happen after commit",
  );
});

test("delete and UI pass current row versions for conflict-aware removals and edits", () => {
  const actions = read("artifacts/personeel-pwa/src/actions/availability.ts");
  const form = read(
    "artifacts/personeel-pwa/src/app/(app)/beschikbaarheid/BeschikbaarheidForm.tsx",
  );
  const deleteDay = functionBody(actions, "deleteAvailabilityDay");

  assertIncludesAll(
    deleteDay,
    [
      "await db.transaction(async (tx) => {",
      "options?.expectedUpdatedAt",
      "conflict: true",
      ".delete(availabilityDayEntriesTable)",
      "tx.insert(auditLogTable).values",
      "availability_day_deleted",
      "revalidateAvailabilityConsumers();",
    ],
    "conflict-aware delete",
  );

  assertIncludesAll(
    form,
    [
      "expectedUpdatedAt: selectedEntry?.updatedAt ?? null",
      "deleteAvailabilityDay(selectedDate, {",
      "result.updatedAt",
      "updatedAt,",
    ],
    "availability form stale tokens",
  );
});

test("availability saves revalidate personnel and planning consumers only after commit", () => {
  const actions = read("artifacts/personeel-pwa/src/actions/availability.ts");
  const revalidateHelper = actions.slice(
    actions.indexOf("function revalidateAvailabilityConsumers"),
    actions.indexOf("export async function getMyAvailabilityWindows"),
  );

  assertIncludesAll(
    revalidateHelper,
    [
      'revalidatePath("/")',
      'revalidatePath("/beschikbaarheid")',
      'revalidatePath("/opdrachten")',
      'revalidatePath("/openstaand")',
      'revalidatePath("/planning")',
      'revalidatePath("/personnel")',
    ],
    "availability consumer revalidation",
  );

  for (const name of [
    "saveAvailabilityWindows",
    "saveAvailabilityDay",
    "deleteAvailabilityDay",
  ]) {
    const body = functionBody(actions, name);
    assert.ok(
      body.indexOf("await db.transaction") <
        body.indexOf("revalidateAvailabilityConsumers();"),
      `${name} should revalidate only after the transaction has resolved`,
    );
  }
});

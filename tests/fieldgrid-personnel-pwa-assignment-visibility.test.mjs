import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("personnel assignment visibility is host-bound and includes active work orders", () => {
  const assignments = read("artifacts/personeel-pwa/src/actions/assignments.ts");

  assert.ok(
    assignments.includes("requireCurrentPersonnelPortalTenantId"),
    "assignment feed should resolve the tenant from the personnel portal host",
  );
  assert.ok(
    assignments.includes("assignmentPersonnelTable"),
    "assignment feed should query assignment_personnel directly",
  );
  assert.ok(
    assignments.includes("assignmentsTable"),
    "assignment feed should join assignments directly",
  );
  assert.ok(
    assignments.includes("ACTIVE_ASSIGNMENT_STATUSES"),
    "assignment feed should include active, scheduled and in-progress work orders",
  );
  assert.ok(
    assignments.includes("visible_status"),
    "assignment feed should map assignment visibility status for the PWA",
  );
  assert.ok(
    !assignments.includes("assignment_personnel(*)"),
    "assignment feed should not rely on nested Supabase relationship inference",
  );
});

test("personnel home uses active statuses for the next service", () => {
  const home = read("artifacts/personeel-pwa/src/app/(app)/page.tsx");

  assert.ok(home.includes("plannable"), "home next service should include plannable assignments");
  assert.ok(home.includes("scheduled"), "home next service should include scheduled assignments");
  assert.ok(home.includes("seen"), "home next service should include seen assignments");
  assert.ok(home.includes("in_progress"), "home next service should include in-progress assignments");
});

test("open assignment listing is host-bound", () => {
  const openAssignments = read("artifacts/personeel-pwa/src/actions/open-assignments.ts");

  assert.ok(
    openAssignments.includes("requireCurrentPersonnelPortalTenantId"),
    "open assignments should resolve the tenant from the personnel portal host",
  );
});

test("personnel planning refreshes live and on every visible minute", () => {
  const provider = read("artifacts/personeel-pwa/src/components/PersonnelRealtimeOfflineProvider.tsx");

  assert.ok(provider.includes("portal_realtime_events"), "provider should subscribe to portal realtime events");
  assert.ok(provider.includes("postgres_changes"), "provider should use Supabase Postgres change events");
  assert.ok(provider.includes("MINUTE_REFRESH_INTERVAL_MS = 60_000"), "provider should refresh at least every minute");
  assert.ok(
    provider.includes("setInterval(refreshIfVisible, MINUTE_REFRESH_INTERVAL_MS)"),
    "provider should refresh visible planning screens every minute",
  );
  assert.ok(
    provider.includes("window.addEventListener(\"focus\", handleFocus)"),
    "provider should refresh when the PWA regains focus",
  );
  assert.ok(
    provider.includes("window.addEventListener(\"pageshow\", handleFocus)"),
    "provider should refresh when returning from the browser page cache",
  );
  assert.ok(
    provider.includes("document.visibilityState === \"visible\""),
    "minute refresh should only run while the PWA is visible",
  );
});

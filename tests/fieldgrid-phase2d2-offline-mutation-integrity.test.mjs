import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every offline-capable server action uses the shared safe result contract", () => {
  for (const file of ["assignments.ts", "reports.ts", "materials.ts", "inventory.ts", "extra-work.ts"]) {
    const source = read(`artifacts/personeel-pwa/src/actions/${file}`);
    assert.match(source, /normalizeOfflineServerActionError/u, file);
  }
  assert.doesNotMatch(read("artifacts/personeel-pwa/src/actions/materials.ts"), /return \{ success: false, error: \(error as Error\)\.message/u);
  assert.doesNotMatch(read("artifacts/personeel-pwa/src/actions/inventory.ts"), /return \{ success: false, error: \(error as Error\)\.message/u);
  assert.doesNotMatch(read("artifacts/personeel-pwa/src/actions/assignments.ts"), /participantMutationError/u);
});

test("queue/provider source preserve dependencies, canonical versions and in-flight identity", () => {
  const queue = read("artifacts/personeel-pwa/src/lib/offline/work-order-queue.ts");
  const provider = read("artifacts/personeel-pwa/src/components/PersonnelRealtimeOfflineProvider.tsx");
  assert.match(queue, /dependsOnMutationId/u);
  assert.match(queue, /intentHash/u);
  assert.match(queue, /receipt\.participantVersion/u);
  assert.match(queue, /removed\.status === "syncing" \|\| removed\.attempts > 0/u);
  assert.match(provider, /completeOfflineWorkOrderAction\(action\.id, receipt\)/u);
  assert.match(provider, /recoverOfflineWorkOrderQueueAfterReload\(\)/u);
});

test("automatic seen transition serializes the first user mutation on its canonical version", () => {
  const marker = read("artifacts/personeel-pwa/src/components/SeenMarker.tsx");
  const progress = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/WorkOrderStatusProgress.tsx");
  assert.match(marker, /setAssignmentStatus\(assignmentId, "seen", \{ expectedParticipantVersion \}\)/u);
  assert.match(marker, /finally\(\(\) => router\.refresh\(\)\)/u);
  assert.match(progress, /const awaitingSeenRefresh/u);
  assert.match(
    progress,
    /const canMarkEnRoute\s*=\s*!workOrderLocked\s*&&\s*!awaitingSeenRefresh/u,
  );
});

test("browser SQLSTATE injection is explicit, E2E-only and production-disabled", () => {
  const actions = read("artifacts/personeel-pwa/src/actions/assignments.ts");
  const runner = read("e2e/fieldgrid/start-real-apps.mjs");
  const journey = read("e2e/fieldgrid/tests/golden-path.spec.ts");
  assert.match(actions, /FIELDGRID_E2E_AUTH_ENABLED !== "true"/u);
  assert.match(actions, /FIELDGRID_E2E_OFFLINE_TRANSIENT_SQLSTATE/u);
  assert.match(runner, /FIELDGRID_E2E_OFFLINE_TRANSIENT_SQLSTATE: "40001"/u);
  assert.match(journey, /lastErrorSqlState: "40001"/u);
  assert.match(journey, /status: "retry_wait"/u);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("W08 dashboard and work order surface the mobile execution flow", () => {
  const dashboard = read("artifacts/personeel-pwa/src/app/(app)/page.tsx");
  const detail = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/page.tsx");
  const progress = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/WorkOrderStatusProgress.tsx");

  for (const marker of ["Goedemorgen", "Eerstvolgende dienst", "Vandaag", "Bekijk details"]) {
    assert.match(dashboard, new RegExp(marker, "u"));
  }
  for (const marker of ["CustomerInfoCard", "TaskChecklistCard", "MaterialSummaryCard", "ExtraWorkSummaryCard", "RapportageTimeline"]) {
    assert.match(detail, new RegExp(marker, "u"));
  }
  for (const marker of ["Onderweg melden", "Start werkzaamheden", "Afronden", "actualStartedAt", "actualCompletedAt"]) {
    assert.match(progress, new RegExp(marker, "u"));
  }
});

test("W08 offline queue has explicit states, deterministic replay keys and conflict retry", () => {
  const queue = read("artifacts/personeel-pwa/src/lib/offline/work-order-queue.ts");
  const provider = read("artifacts/personeel-pwa/src/components/PersonnelRealtimeOfflineProvider.tsx");

  for (const marker of ["pending", "syncing", "synced", "failed", "conflict"]) {
    assert.match(queue, new RegExp(marker, "u"));
  }
  assert.match(queue, /createDeterministicIdempotencyKey/u);
  assert.match(queue, /dedupeFamily/u);
  assert.match(queue, /intentHash/u);
  assert.match(queue, /dependsOnMutationId/u);
  assert.match(queue, /queued\.status !== "synced"/u);
  assert.match(queue, /clientMutationId/u);
  assert.match(provider, /clientMutationId: action\.idempotencyKey/u);
  assert.match(provider, /expectedParticipantVersion/u);
  assert.match(provider, /retryOfflineWorkOrderFailures/u);
});

test("W08 server actions retain tenant ownership and reject stale participant versions", () => {
  const actions = read("artifacts/personeel-pwa/src/actions/assignments.ts");
  const errors = read("artifacts/personeel-pwa/src/lib/offline/offline-action-errors.server.ts");

  assert.match(actions, /requireCurrentPersonnelPortalTenantId/u);
  assert.match(actions, /eq\(assignmentsTable\.tenantId, personnel\.tenantId\)/u);
  assert.doesNotMatch(actions, /service[_-]?role/iu);
  assert.match(actions, /participantVersion/u);
  assert.match(actions, /expectedParticipantVersion/u);
  assert.match(actions, /normalizeOfflineServerActionError/u);
  assert.match(errors, /expected_version_conflict/u);
  assert.match(errors, /Conflict: deze werkbon is aangepast/u);
  assert.match(actions, /executeAssignmentParticipantAction/u);
});

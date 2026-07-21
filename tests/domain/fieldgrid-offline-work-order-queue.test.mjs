import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  MAX_AUTOMATIC_OFFLINE_ATTEMPTS,
  bindOfflineWorkOrderQueueOwner,
  completeOfflineWorkOrderAction,
  enqueueOfflineWorkOrderAction,
  getNextOfflineWorkOrderRetryAt,
  isOfflineWorkOrderQueueOwnedBy,
  readNextEligibleOfflineWorkOrderAction,
  readOfflineWorkOrderQueue,
  recoverOfflineWorkOrderQueueAfterReload,
  removeOfflineWorkOrderActionsByClientMutationId,
  retryOfflineWorkOrderFailures,
  updateOfflineWorkOrderAction,
} from "../../artifacts/personeel-pwa/src/lib/offline/work-order-queue.ts";

const queueKey = "veele-personeel-offline-work-order-actions-v1";

function createStorage() {
  const values = new Map();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

beforeEach(() => {
  const events = new EventTarget();
  globalThis.window = {
    addEventListener: events.addEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    localStorage: createStorage(),
    removeEventListener: events.removeEventListener.bind(events),
  };
});

afterEach(() => {
  delete globalThis.window;
});

test("new queue entries use opaque stable mutation IDs and payload fingerprints", () => {
  bindOfflineWorkOrderQueueOwner("personnel-a");
  const first = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    expectedParticipantVersion: 4,
    payload: { body: "sensitive offline report body" },
    type: "add-report-note",
  });
  const second = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    expectedParticipantVersion: 4,
    payload: { body: "sensitive offline report body" },
    type: "add-report-note",
  });

  assert.notEqual(first.idempotencyKey, second.idempotencyKey);
  assert.ok(first.idempotencyKey.length <= 512);
  assert.doesNotMatch(first.idempotencyKey, /sensitive|report body/u);
  assert.equal(first.payloadHash, second.payloadHash);
  assert.equal(first.attempts, 0);
  assert.equal(first.schemaVersion, 3);
  assert.equal(first.intentHash, second.intentHash);
});

test("reload recovers an orphaned syncing action without changing its mutation ID", () => {
  bindOfflineWorkOrderQueueOwner("personnel-a");
  const action = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    expectedParticipantVersion: 7,
    payload: { completed: true },
    taskId: "task-a",
    type: "set-task-completion",
  });
  window.localStorage.setItem(queueKey, JSON.stringify([{ ...action, status: "syncing" }]));

  assert.equal(readOfflineWorkOrderQueue()[0].status, "syncing", "ordinary reads may not steal a live claim");
  const [recovered] = recoverOfflineWorkOrderQueueAfterReload();
  assert.equal(recovered.status, "pending");
  assert.equal(recovered.idempotencyKey, action.idempotencyKey);
  assert.equal(recovered.expectedParticipantVersion, 7);
});

test("canonical receipts advance only declared local dependents and survive reload", () => {
  bindOfflineWorkOrderQueueOwner("personnel-a");
  const start = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    expectedParticipantVersion: 7,
    type: "start-assignment",
  });
  const task = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    expectedParticipantVersion: 7,
    payload: { completed: true },
    taskId: "task-a",
    type: "set-task-completion",
  });
  const material = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    expectedParticipantVersion: 7,
    payload: { clientMutationId: "local-material-a", name: "Kabel" },
    type: "add-material-usage",
  });

  assert.equal(readNextEligibleOfflineWorkOrderAction()?.id, start.id);
  completeOfflineWorkOrderAction(start.id, {
    acknowledgedAt: "2026-07-20T10:00:00.000Z",
    mutationId: start.idempotencyKey,
    participantVersion: 8,
  });
  const afterStart = readOfflineWorkOrderQueue();
  assert.equal(afterStart.find((item) => item.id === task.id)?.expectedParticipantVersion, 8);
  assert.equal(afterStart.find((item) => item.id === task.id)?.dependsOnMutationId, null);
  assert.equal(afterStart.find((item) => item.id === material.id)?.dependsOnMutationId, task.idempotencyKey);

  // localStorage reload keeps the dependency and the canonical version checkpoint.
  const reloadedTask = readNextEligibleOfflineWorkOrderAction();
  assert.equal(reloadedTask?.id, task.id);
  assert.equal(reloadedTask?.expectedVersionSource, "canonical-predecessor");
  completeOfflineWorkOrderAction(task.id, {
    acknowledgedAt: "2026-07-20T10:00:01.000Z",
    mutationId: task.idempotencyKey,
    participantVersion: 8,
  });
  assert.equal(readNextEligibleOfflineWorkOrderAction()?.id, material.id);
  assert.equal(readNextEligibleOfflineWorkOrderAction()?.expectedParticipantVersion, 8);
  completeOfflineWorkOrderAction(material.id, {
    acknowledgedAt: "2026-07-20T10:00:02.000Z",
    mutationId: material.idempotencyKey,
    participantVersion: 8,
  });
  assert.equal(readOfflineWorkOrderQueue().length, 0);
});

test("canonical checklist receipts advance sequential offline answer revisions", () => {
  bindOfflineWorkOrderQueueOwner("personnel-a");
  const first = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    checklistId: "checklist-a",
    itemId: "item-a",
    payload: { expectedRevision: 0, value: "first" },
    type: "set-checklist-answer",
  });
  const second = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    checklistId: "checklist-a",
    itemId: "item-a",
    payload: { expectedRevision: 0, value: "second" },
    type: "set-checklist-answer",
  });
  const third = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    checklistId: "checklist-a",
    itemId: "item-a",
    payload: { expectedRevision: 0, value: "third" },
    type: "set-checklist-answer",
  });

  assert.equal(second.dependsOnMutationId, first.idempotencyKey);
  assert.equal(third.dependsOnMutationId, second.idempotencyKey);
  completeOfflineWorkOrderAction(first.id, {
    acknowledgedAt: "2026-07-21T10:00:00.000Z",
    answerRevision: 1,
    mutationId: first.idempotencyKey,
    participantVersion: 4,
  });
  assert.equal(readNextEligibleOfflineWorkOrderAction()?.id, second.id);
  assert.equal(readNextEligibleOfflineWorkOrderAction()?.type, "set-checklist-answer");
  assert.equal(readNextEligibleOfflineWorkOrderAction()?.payload.expectedRevision, 1);

  completeOfflineWorkOrderAction(second.id, {
    acknowledgedAt: "2026-07-21T10:00:01.000Z",
    answerRevision: 2,
    mutationId: second.idempotencyKey,
    participantVersion: 4,
  });
  assert.equal(readNextEligibleOfflineWorkOrderAction()?.id, third.id);
  assert.equal(readNextEligibleOfflineWorkOrderAction()?.payload.expectedRevision, 2);
});

test("identical enqueue cannot replace syncing identity and different intent is deferred", () => {
  const first = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    expectedParticipantVersion: 7,
    payload: { completed: true },
    taskId: "task-a",
    type: "set-task-completion",
  });
  updateOfflineWorkOrderAction(first.id, { attempts: 1, status: "syncing" });

  const identical = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    expectedParticipantVersion: 99,
    payload: { completed: true },
    taskId: "task-a",
    type: "set-task-completion",
  });
  assert.equal(identical.id, first.id);
  assert.equal(readOfflineWorkOrderQueue().length, 1);
  assert.equal(readOfflineWorkOrderQueue()[0].idempotencyKey, first.idempotencyKey);
  assert.equal(readOfflineWorkOrderQueue()[0].status, "syncing");

  const different = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    expectedParticipantVersion: 7,
    payload: { completed: false },
    taskId: "task-a",
    type: "set-task-completion",
  });
  assert.notEqual(different.id, first.id);
  assert.equal(different.dependsOnMutationId, first.idempotencyKey);
  assert.equal(readOfflineWorkOrderQueue().some((item) => item.id === first.id), true, "firstStillDurable");
});

test("attempted optimistic additions cannot be cancelled and unsent cancellation rewires successors", () => {
  const first = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    payload: { clientMutationId: "local-a", name: "Kabel" },
    type: "add-material-usage",
  });
  const successor = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    payload: { body: "Verslag" },
    type: "add-report-note",
  });
  updateOfflineWorkOrderAction(first.id, { attempts: 1, status: "syncing" });
  assert.equal(removeOfflineWorkOrderActionsByClientMutationId("local-a"), "in_flight");
  assert.equal(readOfflineWorkOrderQueue().some((item) => item.id === first.id), true);

  updateOfflineWorkOrderAction(first.id, { attempts: 0, status: "pending" });
  assert.equal(removeOfflineWorkOrderActionsByClientMutationId("local-a"), "removed");
  assert.equal(readOfflineWorkOrderQueue().find((item) => item.id === successor.id)?.dependsOnMutationId, null);
});

test("a genuine conflict blocks only its dependency stream", () => {
  const blocked = enqueueOfflineWorkOrderAction({ assignmentId: "assignment-a", type: "start-assignment" });
  enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    payload: { completed: true },
    taskId: "task-a",
    type: "set-task-completion",
  });
  const unrelated = enqueueOfflineWorkOrderAction({ assignmentId: "assignment-b", type: "start-assignment" });
  updateOfflineWorkOrderAction(blocked.id, {
    lastErrorClassification: "conflict",
    lastErrorCode: "expected_version_conflict",
    status: "conflict",
  });
  assert.equal(readNextEligibleOfflineWorkOrderAction()?.id, unrelated.id);
});

test("transient retry eligibility honors due time and reconnect acceleration", () => {
  bindOfflineWorkOrderQueueOwner("personnel-a");
  const action = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    expectedParticipantVersion: 2,
    type: "start-assignment",
  });
  const nextRetryAt = new Date(Date.now() + 60_000).toISOString();
  updateOfflineWorkOrderAction(action.id, {
    attempts: 1,
    lastErrorClassification: "transient",
    nextRetryAt,
    status: "retry_wait",
  });

  assert.equal(readNextEligibleOfflineWorkOrderAction(), null);
  assert.equal(readNextEligibleOfflineWorkOrderAction({ accelerateRetry: true })?.id, action.id);
  assert.equal(getNextOfflineWorkOrderRetryAt(), Date.parse(nextRetryAt));
});

test("safe structured retry metadata survives queue persistence", () => {
  const action = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    expectedParticipantVersion: 2,
    type: "start-assignment",
  });
  updateOfflineWorkOrderAction(action.id, {
    attempts: 1,
    lastError: "Bijwerken mislukt. Probeer het later opnieuw.",
    lastErrorClassification: "transient",
    lastErrorCode: "deadlock_detected",
    lastErrorDiagnosticId: "offline-11111111-1111-4111-8111-111111111111",
    lastErrorRetryable: true,
    lastErrorSqlState: "40P01",
    nextRetryAt: new Date(Date.now() + 1_000).toISOString(),
    status: "retry_wait",
  });
  const [stored] = readOfflineWorkOrderQueue();
  assert.equal(stored.lastErrorClassification, "transient");
  assert.equal(stored.lastErrorCode, "deadlock_detected");
  assert.equal(stored.lastErrorSqlState, "40P01");
  assert.equal(stored.lastErrorRetryable, true);
  assert.match(stored.lastErrorDiagnosticId, /^offline-/u);
  assert.doesNotMatch(JSON.stringify(stored), /deadlock detected in private_table/u);
});

test("automatic retry stops at the bounded attempt limit", () => {
  const action = enqueueOfflineWorkOrderAction({
    type: "start-assignment",
    assignmentId: "assignment-a",
    expectedParticipantVersion: 9,
  });
  updateOfflineWorkOrderAction(action.id, {
    status: "retry_wait",
    attempts: MAX_AUTOMATIC_OFFLINE_ATTEMPTS,
    nextRetryAt: new Date(0).toISOString(),
    lastErrorClassification: "transient",
  });

  assert.equal(readNextEligibleOfflineWorkOrderAction({ accelerateRetry: true }), null);
});

test("permanent and conflict states remain retained until explicit manual retry", () => {
  bindOfflineWorkOrderQueueOwner("personnel-a");
  const action = enqueueOfflineWorkOrderAction({
    assignmentId: "assignment-a",
    expectedParticipantVersion: 2,
    type: "start-assignment",
  });
  updateOfflineWorkOrderAction(action.id, {
    attempts: 1,
    lastErrorClassification: "permanent",
    lastErrorCode: "authorization_denied",
    status: "failed",
  });
  assert.equal(readNextEligibleOfflineWorkOrderAction(), null);

  retryOfflineWorkOrderFailures();
  assert.equal(readNextEligibleOfflineWorkOrderAction()?.id, action.id);
  assert.equal(readOfflineWorkOrderQueue()[0].attempts, 1, "manual retry preserves attempt history");
});

test("personnel session changes quarantine rather than replay another owner's queue", () => {
  bindOfflineWorkOrderQueueOwner("personnel-a");
  enqueueOfflineWorkOrderAction({ assignmentId: "assignment-a", type: "start-assignment" });
  assert.equal(isOfflineWorkOrderQueueOwnedBy("personnel-a"), true);

  bindOfflineWorkOrderQueueOwner("personnel-b");
  assert.equal(isOfflineWorkOrderQueueOwnedBy("personnel-a"), false);
  assert.equal(isOfflineWorkOrderQueueOwnedBy("personnel-b"), true);
  assert.equal(readOfflineWorkOrderQueue().length, 0);
});

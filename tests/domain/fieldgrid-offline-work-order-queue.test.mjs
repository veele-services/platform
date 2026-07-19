import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  MAX_AUTOMATIC_OFFLINE_ATTEMPTS,
  bindOfflineWorkOrderQueueOwner,
  enqueueOfflineWorkOrderAction,
  getNextOfflineWorkOrderRetryAt,
  isOfflineWorkOrderQueueOwnedBy,
  readNextEligibleOfflineWorkOrderAction,
  readOfflineWorkOrderQueue,
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
  assert.equal(first.schemaVersion, 2);
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

  const [recovered] = readOfflineWorkOrderQueue();
  assert.equal(recovered.status, "pending");
  assert.equal(recovered.idempotencyKey, action.idempotencyKey);
  assert.equal(recovered.expectedParticipantVersion, 7);
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

import assert from "node:assert/strict";
import { test } from "node:test";

import { createOfflineSyncCoordinator } from "../../artifacts/personeel-pwa/src/lib/offline/offline-sync-coordinator.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createLegacyDroppingCoordinator(runPass) {
  let syncing = false;
  return async function synchronize() {
    if (syncing) return;
    syncing = true;
    try {
      await runPass();
    } finally {
      syncing = false;
    }
  };
}

test("the deterministic barrier reproduces the dropped reconnect on the old syncing flag model", async () => {
  const firstPassStarted = deferred();
  const releaseFirstPass = deferred();
  let passCount = 0;
  const synchronize = createLegacyDroppingCoordinator(async () => {
    passCount += 1;
    firstPassStarted.resolve();
    await releaseFirstPass.promise;
  });

  const initial = synchronize();
  await firstPassStarted.promise;
  await synchronize();
  releaseFirstPass.resolve();
  await initial;

  assert.equal(passCount, 1, "the old busy guard discards the reconnect trigger");
});

test("a reconnect trigger received during an active pass is coalesced into a follow-up pass", async () => {
  const firstPassStarted = deferred();
  const releaseFirstPass = deferred();
  let activePasses = 0;
  let maximumActivePasses = 0;
  let passCount = 0;
  let queueLength = 1;
  const canonicalMutationIds = new Set();

  const coordinator = createOfflineSyncCoordinator({
    isOnline: () => true,
    runPass: async ({ generation, triggers }) => {
      activePasses += 1;
      maximumActivePasses = Math.max(maximumActivePasses, activePasses);
      passCount += 1;
      try {
        if (passCount === 1) {
          firstPassStarted.resolve();
          await releaseFirstPass.promise;
          return;
        }
        assert.equal(generation, 2);
        assert.deepEqual(triggers, ["online"]);
        canonicalMutationIds.add("stable-client-mutation-id");
        queueLength = 0;
      } finally {
        activePasses -= 1;
      }
    },
  });

  const initial = coordinator.requestSync("startup");
  await firstPassStarted.promise;
  const duringActive = coordinator.requestSync("online");
  releaseFirstPass.resolve();
  await Promise.all([initial, duringActive]);
  await coordinator.whenIdle();

  assert.equal(maximumActivePasses, 1, "synchronization must remain single-flight");
  assert.equal(passCount, 2, "the reconnect request must produce one follow-up pass");
  assert.equal(queueLength, 0, "the follow-up pass must drain the queue");
  assert.equal(canonicalMutationIds.size, 1, "replay must retain one canonical mutation");
  assert.deepEqual(coordinator.snapshot(), {
    completedGeneration: 2,
    requestedGeneration: 2,
    running: false,
  });
});

test("duplicate triggers during one pass coalesce without overlapping synchronization", async () => {
  const firstPassStarted = deferred();
  const releaseFirstPass = deferred();
  const requests = [];
  let passCount = 0;
  let activePasses = 0;
  let maximumActivePasses = 0;

  const coordinator = createOfflineSyncCoordinator({
    isOnline: () => true,
    runPass: async (request) => {
      requests.push(request);
      passCount += 1;
      activePasses += 1;
      maximumActivePasses = Math.max(maximumActivePasses, activePasses);
      try {
        if (passCount === 1) {
          firstPassStarted.resolve();
          await releaseFirstPass.promise;
        }
      } finally {
        activePasses -= 1;
      }
    },
  });

  const initial = coordinator.requestSync("startup");
  await firstPassStarted.promise;
  const duplicates = [
    coordinator.requestSync("online"),
    coordinator.requestSync("online"),
    coordinator.requestSync("focus"),
    coordinator.requestSync("visibility"),
    coordinator.requestSync("service-worker"),
  ];
  releaseFirstPass.resolve();
  await Promise.all([initial, ...duplicates]);
  await coordinator.whenIdle();

  assert.equal(maximumActivePasses, 1);
  assert.equal(passCount, 2);
  assert.deepEqual(requests[1], {
    generation: 6,
    triggers: ["online", "focus", "visibility", "service-worker"],
  });
});

test("a synchronous request from the start of runPass cannot re-enter the runner", async () => {
  let coordinator;
  let passCount = 0;
  let activePasses = 0;
  let maximumActivePasses = 0;

  coordinator = createOfflineSyncCoordinator({
    isOnline: () => true,
    runPass: async () => {
      passCount += 1;
      activePasses += 1;
      maximumActivePasses = Math.max(maximumActivePasses, activePasses);
      try {
        if (passCount === 1) void coordinator.requestSync("enqueue");
        await Promise.resolve();
      } finally {
        activePasses -= 1;
      }
    },
  });

  await coordinator.requestSync("startup");
  await coordinator.whenIdle();

  assert.equal(passCount, 2);
  assert.equal(maximumActivePasses, 1);
});

test("an unexpected pass failure settles once without creating a hot loop", async () => {
  let passCount = 0;
  const observedErrors = [];
  const coordinator = createOfflineSyncCoordinator({
    isOnline: () => true,
    onUnexpectedError: (error) => observedErrors.push(error),
    runPass: async () => {
      passCount += 1;
      throw new Error("unexpected pass failure");
    },
  });

  await coordinator.requestSync("startup");
  await coordinator.whenIdle();

  assert.equal(passCount, 1);
  assert.equal(observedErrors.length, 1);
  assert.deepEqual(coordinator.snapshot(), {
    completedGeneration: 1,
    requestedGeneration: 1,
    running: false,
  });
});

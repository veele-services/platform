export type OfflineSyncTrigger =
  | "enqueue"
  | "startup"
  | "online"
  | "focus"
  | "visibility"
  | "service-worker"
  | "storage"
  | "manual-retry"
  | "retry-timer";

export type OfflineSyncPassRequest = {
  generation: number;
  triggers: readonly OfflineSyncTrigger[];
};

export type OfflineSyncObservation = {
  type: "requested" | "pass-started" | "pass-completed";
  generation: number;
  requestedGeneration: number;
  completedGeneration: number;
  triggers: readonly OfflineSyncTrigger[];
};

type OfflineSyncCoordinatorOptions = {
  isOnline: () => boolean;
  onObservation?: (observation: OfflineSyncObservation) => void;
  onUnexpectedError?: (error: unknown) => void;
  runPass: (request: OfflineSyncPassRequest) => Promise<void>;
};

export type OfflineSyncCoordinator = {
  requestSync: (trigger: OfflineSyncTrigger) => Promise<void>;
  whenIdle: () => Promise<void>;
  snapshot: () => {
    completedGeneration: number;
    requestedGeneration: number;
    running: boolean;
  };
};

export function createOfflineSyncCoordinator({
  isOnline,
  onObservation = () => undefined,
  onUnexpectedError = () => undefined,
  runPass,
}: OfflineSyncCoordinatorOptions): OfflineSyncCoordinator {
  let requestedGeneration = 0;
  let completedGeneration = 0;
  let runner: Promise<void> | null = null;
  const pendingTriggers = new Set<OfflineSyncTrigger>();
  const generationWaiters = new Map<number, () => void>();

  const settleCompletedGenerations = () => {
    for (const [generation, resolve] of generationWaiters) {
      if (generation > completedGeneration) continue;
      generationWaiters.delete(generation);
      resolve();
    }
  };

  const drain = async () => {
    while (isOnline() && completedGeneration < requestedGeneration) {
      const generation = requestedGeneration;
      const triggers = [...pendingTriggers];
      pendingTriggers.clear();
      onObservation({
        type: "pass-started",
        generation,
        requestedGeneration,
        completedGeneration,
        triggers,
      });
      try {
        await runPass({ generation, triggers });
      } catch (error) {
        // A queue pass is expected to classify item-level failures itself. An
        // unexpected coordinator error is surfaced once, while the generation
        // is still completed so it cannot create an unbounded hot loop.
        onUnexpectedError(error);
      }
      completedGeneration = generation;
      onObservation({
        type: "pass-completed",
        generation,
        requestedGeneration,
        completedGeneration,
        triggers,
      });
      settleCompletedGenerations();
    }
  };

  const ensureRunner = () => {
    if (runner || !isOnline() || completedGeneration >= requestedGeneration)
      return;

    // Defer entry into drain until after the sentinel is assigned. runPass may
    // synchronously request another generation before returning its promise.
    const currentRunner = Promise.resolve().then(drain);
    runner = currentRunner;
    void currentRunner.finally(() => {
      if (runner === currentRunner) runner = null;
      // This final check closes the window between the drain loop's last
      // generation comparison and releasing the single-flight lock.
      if (isOnline() && completedGeneration < requestedGeneration) {
        ensureRunner();
      }
    });
  };

  const requestSync = (trigger: OfflineSyncTrigger): Promise<void> => {
    requestedGeneration += 1;
    const generation = requestedGeneration;
    pendingTriggers.add(trigger);
    const completed = new Promise<void>((resolve) => {
      generationWaiters.set(generation, resolve);
    });
    onObservation({
      type: "requested",
      generation,
      requestedGeneration,
      completedGeneration,
      triggers: [trigger],
    });
    ensureRunner();
    return completed;
  };

  const whenIdle = async () => {
    while (runner) await runner;
    ensureRunner();
    if (runner) await whenIdle();
  };

  return {
    requestSync,
    whenIdle,
    snapshot: () => ({
      completedGeneration,
      requestedGeneration,
      running: runner !== null,
    }),
  };
}

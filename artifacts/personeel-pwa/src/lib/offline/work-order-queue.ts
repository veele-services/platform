"use client";

export type OfflineActionStatus = "pending" | "syncing" | "failed";

type OfflineActionBase = {
  id: string;
  type:
    | "mark-assignment-en-route"
    | "start-assignment"
    | "complete-assignment"
    | "not-complete-assignment"
    | "set-task-completion"
    | "add-report-note"
    | "add-extra-work"
    | "add-material-usage"
    | "add-inventory-usage";
  assignmentId: string;
  createdAt: string;
  updatedAt: string;
  status: OfflineActionStatus;
  attempts: number;
  lastError?: string | null;
};

export type OfflineWorkOrderAction =
  | (OfflineActionBase & {
      type: "mark-assignment-en-route";
    })
  | (OfflineActionBase & {
      type: "start-assignment";
    })
  | (OfflineActionBase & {
      type: "complete-assignment";
      payload: {
        customerSignatureDataUrl?: string | null;
        notes?: string | null;
      };
    })
  | (OfflineActionBase & {
      type: "not-complete-assignment";
      payload: {
        reason: string;
        notes?: string | null;
      };
    })
  | (OfflineActionBase & {
      type: "set-task-completion";
      taskId: string;
      payload: {
        completed: boolean;
      };
    })
  | (OfflineActionBase & {
      type: "add-report-note";
      payload: {
        body: string;
      };
    })
  | (OfflineActionBase & {
      type: "add-extra-work";
      payload: {
        taskCodeId?: string | null;
        taskCodeName?: string | null;
        description: string;
        hours?: string | null;
        price?: string | null;
        clientMutationId?: string | null;
      };
    })
  | (OfflineActionBase & {
      type: "add-material-usage";
      payload: {
        materialId?: string | null;
        materialCode?: string | null;
        name: string;
        quantity?: string | number | null;
        unitPrice?: string | number | null;
        unitLabel?: string | null;
        notes?: string | null;
        usesStock?: boolean;
        stockLocationId?: string | null;
        stockLocationName?: string | null;
        isOther?: boolean;
        clientMutationId?: string | null;
      };
    })
  | (OfflineActionBase & {
      type: "add-inventory-usage";
      payload: {
        inventoryItemId: string;
        inventoryCode?: string | null;
        name?: string | null;
        usageType?: string | null;
        quantity?: string | number | null;
        periodLabel?: string | null;
        notes?: string | null;
        clientMutationId?: string | null;
      };
    });

export type OfflineWorkOrderActionInput =
  | Omit<Extract<OfflineWorkOrderAction, { type: "mark-assignment-en-route" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "mark-assignment-en-route" }>, "type" | "assignmentId">
  | Omit<Extract<OfflineWorkOrderAction, { type: "start-assignment" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "start-assignment" }>, "type" | "assignmentId">
  | Omit<Extract<OfflineWorkOrderAction, { type: "complete-assignment" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "complete-assignment" }>, "type" | "assignmentId" | "payload">
  | Omit<Extract<OfflineWorkOrderAction, { type: "not-complete-assignment" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "not-complete-assignment" }>, "type" | "assignmentId" | "payload">
  | Omit<Extract<OfflineWorkOrderAction, { type: "set-task-completion" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "set-task-completion" }>, "type" | "assignmentId" | "taskId" | "payload">
  | Omit<Extract<OfflineWorkOrderAction, { type: "add-report-note" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "add-report-note" }>, "type" | "assignmentId" | "payload">
  | Omit<Extract<OfflineWorkOrderAction, { type: "add-extra-work" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "add-extra-work" }>, "type" | "assignmentId" | "payload">
  | Omit<Extract<OfflineWorkOrderAction, { type: "add-material-usage" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "add-material-usage" }>, "type" | "assignmentId" | "payload">
  | Omit<Extract<OfflineWorkOrderAction, { type: "add-inventory-usage" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "add-inventory-usage" }>, "type" | "assignmentId" | "payload">;

const QUEUE_KEY = "veele-personeel-offline-work-order-actions-v1";
const QUEUE_EVENT = "veele:offline-work-order-queue";
const SYNC_TAG = "veele-personeel-work-order-sync";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function createActionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emitQueueChange() {
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
}

function isActionType(value: unknown): value is OfflineWorkOrderAction["type"] {
  return [
    "start-assignment",
    "mark-assignment-en-route",
    "complete-assignment",
    "not-complete-assignment",
    "set-task-completion",
    "add-report-note",
    "add-extra-work",
    "add-material-usage",
    "add-inventory-usage",
  ].includes(String(value));
}

function normalizeAction(item: unknown): OfflineWorkOrderAction | null {
  if (!item || typeof item !== "object") return null;
  const action = item as Record<string, unknown>;
  if (typeof action.id !== "string") return null;
  if (typeof action.assignmentId !== "string") return null;
  if (typeof action.createdAt !== "string") return null;
  if (!isActionType(action.type)) return null;

  const status: OfflineActionStatus =
    action.status === "syncing" || action.status === "failed" ? action.status : "pending";
  const base = {
    ...action,
    updatedAt: typeof action.updatedAt === "string" ? action.updatedAt : action.createdAt,
    status,
    attempts: typeof action.attempts === "number" && Number.isFinite(action.attempts)
      ? Math.max(0, action.attempts)
      : 0,
    lastError: typeof action.lastError === "string" ? action.lastError : null,
  } as OfflineActionBase & Record<string, unknown>;

  if (base.type === "set-task-completion") {
    const payload = base.payload && typeof base.payload === "object"
      ? base.payload as Record<string, unknown>
      : null;
    if (typeof base.taskId !== "string" || !payload || typeof payload.completed !== "boolean") return null;
  }

  if (
    ["complete-assignment", "not-complete-assignment", "add-report-note", "add-extra-work", "add-material-usage", "add-inventory-usage"].includes(
      base.type,
    ) && (!base.payload || typeof base.payload !== "object")
  ) {
    return null;
  }

  return base as OfflineWorkOrderAction;
}

function parseQueue(value: string | null): OfflineWorkOrderAction[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeAction(item))
      .filter((item): item is OfflineWorkOrderAction => item !== null);
  } catch {
    return [];
  }
}

export function readOfflineWorkOrderQueue(): OfflineWorkOrderAction[] {
  if (!canUseStorage()) return [];
  return parseQueue(window.localStorage.getItem(QUEUE_KEY));
}

function writeOfflineWorkOrderQueue(actions: OfflineWorkOrderAction[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(actions));
  emitQueueChange();
}

export function enqueueOfflineWorkOrderAction(
  action: OfflineWorkOrderActionInput,
) {
  const queue = readOfflineWorkOrderQueue();
  const now = new Date().toISOString();
  const nextAction = {
    ...action,
    id: createActionId(),
    createdAt: now,
    updatedAt: now,
    status: "pending",
    attempts: 0,
    lastError: null,
  } as OfflineWorkOrderAction;

  const dedupedQueue = queue.filter((queued) => {
    if (queued.assignmentId !== nextAction.assignmentId) return true;
    if (nextAction.type === "start-assignment") {
      return queued.type !== "start-assignment";
    }
    if (nextAction.type === "mark-assignment-en-route") {
      return queued.type !== "mark-assignment-en-route";
    }
    if (nextAction.type === "complete-assignment" || nextAction.type === "not-complete-assignment") {
      return queued.type !== "complete-assignment" && queued.type !== "not-complete-assignment";
    }
    if (nextAction.type === "set-task-completion") {
      return queued.type !== "set-task-completion" || queued.taskId !== nextAction.taskId;
    }
    if (nextAction.type === "add-inventory-usage") {
      return queued.type !== "add-inventory-usage"
        || queued.payload.inventoryItemId !== nextAction.payload.inventoryItemId;
    }
    return true;
  });

  writeOfflineWorkOrderQueue([...dedupedQueue, nextAction]);
  void requestOfflineWorkOrderSync();
  return nextAction;
}

export function removeOfflineWorkOrderAction(id: string) {
  const queue = readOfflineWorkOrderQueue();
  writeOfflineWorkOrderQueue(queue.filter((action) => action.id !== id));
}

export function removeOfflineWorkOrderActionsByClientMutationId(clientMutationId: string) {
  const queue = readOfflineWorkOrderQueue();
  writeOfflineWorkOrderQueue(queue.filter((action) => {
    if (!("payload" in action) || !action.payload || typeof action.payload !== "object") return true;
    const payload = action.payload as Record<string, unknown>;
    return payload["clientMutationId"] !== clientMutationId;
  }));
}

export function updateOfflineWorkOrderAction(
  id: string,
  patch: Partial<Pick<OfflineWorkOrderAction, "status" | "attempts" | "lastError" | "updatedAt">>,
) {
  const queue = readOfflineWorkOrderQueue();
  const now = new Date().toISOString();
  writeOfflineWorkOrderQueue(queue.map((action) => (
    action.id === id
      ? { ...action, ...patch, updatedAt: patch.updatedAt ?? now } as OfflineWorkOrderAction
      : action
  )));
}

export function retryOfflineWorkOrderFailures() {
  const queue = readOfflineWorkOrderQueue();
  writeOfflineWorkOrderQueue(queue.map((action) => (
    action.status === "failed"
      ? { ...action, status: "pending", lastError: null, updatedAt: new Date().toISOString() } as OfflineWorkOrderAction
      : action
  )));
  void requestOfflineWorkOrderSync();
}

export function getOfflineWorkOrderQueueCount() {
  return readOfflineWorkOrderQueue().length;
}

export function getOfflineWorkOrderFailureCount() {
  return readOfflineWorkOrderQueue().filter((action) => action.status === "failed").length;
}

export function subscribeOfflineWorkOrderQueue(listener: () => void) {
  window.addEventListener(QUEUE_EVENT, listener);
  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener(QUEUE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export async function requestOfflineWorkOrderSync() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const syncManager = (
      registration as ServiceWorkerRegistration & {
        sync?: { register(tag: string): Promise<void> };
      }
    ).sync;

    if (syncManager) {
      await syncManager.register(SYNC_TAG);
      return;
    }

    registration.active?.postMessage({ type: "VEELE_PROCESS_OFFLINE_QUEUE" });
  } catch {
    // Background sync is progressive enhancement; the provider also syncs on online/focus.
  }
}

export function isOfflineNow() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

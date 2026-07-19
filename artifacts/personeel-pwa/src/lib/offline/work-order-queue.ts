"use client";

export type OfflineActionStatus = "pending" | "syncing" | "retry_wait" | "synced" | "failed" | "conflict";
export type OfflineQueueEventReason = "enqueue" | "manual-retry" | "state" | "storage";
export type OfflineErrorClassification = "transient" | "permanent" | "conflict";

export type OfflineCanonicalReceipt = {
  acknowledgedAt: string;
  mutationId: string;
  resultId?: string | null;
};

type OfflineActionBase = {
  schemaVersion: 2;
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
  expectedParticipantVersion?: number | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  status: OfflineActionStatus;
  attempts: number;
  payloadHash: string;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  lastError?: string | null;
  lastErrorCode?: string | null;
  lastErrorClassification?: OfflineErrorClassification | null;
  canonicalReceipt?: OfflineCanonicalReceipt | null;
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

type OfflineQueueOwnershipInput = { expectedParticipantVersion?: number | null };

export type OfflineWorkOrderActionInput =
  | Omit<Extract<OfflineWorkOrderAction, { type: "mark-assignment-en-route" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "mark-assignment-en-route" }>, "type" | "assignmentId"> & OfflineQueueOwnershipInput
  | Omit<Extract<OfflineWorkOrderAction, { type: "start-assignment" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "start-assignment" }>, "type" | "assignmentId"> & OfflineQueueOwnershipInput
  | Omit<Extract<OfflineWorkOrderAction, { type: "complete-assignment" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "complete-assignment" }>, "type" | "assignmentId" | "payload"> & OfflineQueueOwnershipInput
  | Omit<Extract<OfflineWorkOrderAction, { type: "not-complete-assignment" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "not-complete-assignment" }>, "type" | "assignmentId" | "payload"> & OfflineQueueOwnershipInput
  | Omit<Extract<OfflineWorkOrderAction, { type: "set-task-completion" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "set-task-completion" }>, "type" | "assignmentId" | "taskId" | "payload"> & OfflineQueueOwnershipInput
  | Omit<Extract<OfflineWorkOrderAction, { type: "add-report-note" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "add-report-note" }>, "type" | "assignmentId" | "payload"> & OfflineQueueOwnershipInput
  | Omit<Extract<OfflineWorkOrderAction, { type: "add-extra-work" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "add-extra-work" }>, "type" | "assignmentId" | "payload"> & OfflineQueueOwnershipInput
  | Omit<Extract<OfflineWorkOrderAction, { type: "add-material-usage" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "add-material-usage" }>, "type" | "assignmentId" | "payload"> & OfflineQueueOwnershipInput
  | Omit<Extract<OfflineWorkOrderAction, { type: "add-inventory-usage" }>, keyof OfflineActionBase>
    & Pick<Extract<OfflineWorkOrderAction, { type: "add-inventory-usage" }>, "type" | "assignmentId" | "payload"> & OfflineQueueOwnershipInput;

const QUEUE_KEY = "veele-personeel-offline-work-order-actions-v1";
const QUEUE_OWNER_KEY = "veele-personeel-offline-work-order-owner-v1";
const QUEUE_QUARANTINE_KEY = "veele-personeel-offline-work-order-quarantine-v1";
const QUEUE_EVENT = "veele:offline-work-order-queue";
const SYNC_TAG = "veele-personeel-work-order-sync";
export const MAX_AUTOMATIC_OFFLINE_ATTEMPTS = 8;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function createDeterministicIdempotencyKey(actionId: string) {
  return `personnel-pwa:${actionId}`;
}

function createActionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function payloadFingerprint(value: unknown): string {
  const source = stableSerialize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function actionPayload(value: Record<string, unknown>) {
  return {
    assignmentId: value.assignmentId,
    expectedParticipantVersion: value.expectedParticipantVersion ?? null,
    payload: value.payload ?? null,
    taskId: value.taskId ?? null,
    type: value.type,
  };
}

function emitQueueChange(reason: OfflineQueueEventReason) {
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { reason } }));
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

  const storedStatus = String(action.status);
  const status: OfflineActionStatus = storedStatus === "syncing"
    ? "pending"
    : ["pending", "retry_wait", "synced", "failed", "conflict"].includes(storedStatus)
      ? storedStatus as OfflineActionStatus
      : "pending";
  const receipt = action.canonicalReceipt && typeof action.canonicalReceipt === "object"
    ? action.canonicalReceipt as Record<string, unknown>
    : null;
  const base = {
    ...action,
    schemaVersion: 2,
    updatedAt: typeof action.updatedAt === "string" ? action.updatedAt : action.createdAt,
    status,
    attempts: typeof action.attempts === "number" && Number.isFinite(action.attempts)
      ? Math.max(0, action.attempts)
      : 0,
    lastError: typeof action.lastError === "string" ? action.lastError : null,
    lastAttemptAt: typeof action.lastAttemptAt === "string" ? action.lastAttemptAt : null,
    nextRetryAt: typeof action.nextRetryAt === "string" ? action.nextRetryAt : null,
    lastErrorCode: typeof action.lastErrorCode === "string" ? action.lastErrorCode : null,
    lastErrorClassification: ["transient", "permanent", "conflict"].includes(String(action.lastErrorClassification))
      ? action.lastErrorClassification as OfflineErrorClassification
      : null,
    canonicalReceipt: receipt
      && typeof receipt.mutationId === "string"
      && typeof receipt.acknowledgedAt === "string"
      ? {
          mutationId: receipt.mutationId,
          acknowledgedAt: receipt.acknowledgedAt,
          resultId: typeof receipt.resultId === "string" ? receipt.resultId : null,
        }
      : null,
    expectedParticipantVersion: typeof action.expectedParticipantVersion === "number" ? action.expectedParticipantVersion : null,
    idempotencyKey: typeof action.idempotencyKey === "string" ? action.idempotencyKey : `${action.type}:${action.assignmentId}:${action.id}`,
    payloadHash: typeof action.payloadHash === "string" ? action.payloadHash : payloadFingerprint(actionPayload(action)),
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

export function isOfflineWorkOrderQueueOwnedBy(personnelId: string | null): boolean {
  if (!canUseStorage()) return false;
  const normalizedOwner = personnelId?.trim() || null;
  return Boolean(normalizedOwner) && window.localStorage.getItem(QUEUE_OWNER_KEY) === normalizedOwner;
}

export function readNextEligibleOfflineWorkOrderAction({
  accelerateRetry = false,
  now = Date.now(),
}: {
  accelerateRetry?: boolean;
  now?: number;
} = {}): OfflineWorkOrderAction | null {
  return readOfflineWorkOrderQueue().find((action) => {
    if (action.status === "synced") return true;
    if (action.status === "pending") return true;
    if (action.status !== "retry_wait" || action.attempts >= MAX_AUTOMATIC_OFFLINE_ATTEMPTS) return false;
    if (accelerateRetry) return true;
    const nextRetryAt = Date.parse(action.nextRetryAt ?? "");
    return Number.isFinite(nextRetryAt) && nextRetryAt <= now;
  }) ?? null;
}

export function getNextOfflineWorkOrderRetryAt(): number | null {
  const candidates = readOfflineWorkOrderQueue()
    .filter((action) => action.status === "retry_wait" && action.attempts < MAX_AUTOMATIC_OFFLINE_ATTEMPTS)
    .map((action) => Date.parse(action.nextRetryAt ?? ""))
    .filter(Number.isFinite);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

export function bindOfflineWorkOrderQueueOwner(personnelId: string | null): void {
  if (!canUseStorage()) return;
  const normalizedOwner = personnelId?.trim() || null;
  const previousOwner = window.localStorage.getItem(QUEUE_OWNER_KEY);
  if (previousOwner && previousOwner !== normalizedOwner) {
    const existing = window.localStorage.getItem(QUEUE_KEY);
    if (existing) window.localStorage.setItem(QUEUE_QUARANTINE_KEY, existing);
    window.localStorage.removeItem(QUEUE_KEY);
  }
  if (normalizedOwner) window.localStorage.setItem(QUEUE_OWNER_KEY, normalizedOwner);
  else window.localStorage.removeItem(QUEUE_OWNER_KEY);
  emitQueueChange("state");
}

function writeOfflineWorkOrderQueue(
  actions: OfflineWorkOrderAction[],
  reason: OfflineQueueEventReason = "state",
) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(actions));
  emitQueueChange(reason);
}

export function enqueueOfflineWorkOrderAction(
  action: OfflineWorkOrderActionInput,
) {
  const queue = readOfflineWorkOrderQueue();
  const now = new Date().toISOString();
  const actionId = createActionId();
  const nextAction = {
    ...action,
    schemaVersion: 2,
    id: actionId,
    idempotencyKey: createDeterministicIdempotencyKey(actionId),
    payloadHash: payloadFingerprint(actionPayload(action as unknown as Record<string, unknown>)),
    createdAt: now,
    updatedAt: now,
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    lastError: null,
    lastErrorCode: null,
    lastErrorClassification: null,
    canonicalReceipt: null,
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

  writeOfflineWorkOrderQueue([...dedupedQueue, nextAction], "enqueue");
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
  patch: Partial<Pick<OfflineWorkOrderAction,
    | "status"
    | "attempts"
    | "lastAttemptAt"
    | "nextRetryAt"
    | "lastError"
    | "lastErrorCode"
    | "lastErrorClassification"
    | "canonicalReceipt"
    | "updatedAt"
  >>,
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
    action.status === "failed" || action.status === "conflict"
      ? {
          ...action,
          status: "pending",
          nextRetryAt: null,
          lastError: null,
          lastErrorCode: null,
          lastErrorClassification: null,
          updatedAt: new Date().toISOString(),
        } as OfflineWorkOrderAction
      : action
  )), "manual-retry");
  void requestOfflineWorkOrderSync();
}

export function getOfflineWorkOrderQueueCount() {
  return readOfflineWorkOrderQueue().length;
}

export function getOfflineWorkOrderFailureCount() {
  return readOfflineWorkOrderQueue().filter((action) => action.status === "failed" || action.status === "conflict").length;
}

export function subscribeOfflineWorkOrderQueue(
  listener: (reason: OfflineQueueEventReason) => void,
) {
  const handleQueue = (event: Event) => {
    const reason = (event as CustomEvent<{ reason?: OfflineQueueEventReason }>).detail?.reason;
    listener(reason ?? "state");
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === QUEUE_KEY || event.key === QUEUE_OWNER_KEY) listener("storage");
  };
  window.addEventListener(QUEUE_EVENT, handleQueue);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(QUEUE_EVENT, handleQueue);
    window.removeEventListener("storage", handleStorage);
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

    registration.active?.postMessage({ type: "FIELDGRID_REQUEST_OFFLINE_SYNC" });
  } catch {
    // Background sync is progressive enhancement; the provider also syncs on online/focus.
  }
}

export function isOfflineNow() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

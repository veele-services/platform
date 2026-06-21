"use client";

export type OfflineWorkOrderAction =
  | {
      id: string;
      type: "start-assignment";
      assignmentId: string;
      createdAt: string;
    }
  | {
      id: string;
      type: "complete-assignment";
      assignmentId: string;
      createdAt: string;
      payload: {
        customerSignatureDataUrl?: string | null;
        notes?: string | null;
      };
    }
  | {
      id: string;
      type: "not-complete-assignment";
      assignmentId: string;
      createdAt: string;
      payload: {
        reason: string;
        notes?: string | null;
      };
    };

export type OfflineWorkOrderActionInput =
  | Omit<Extract<OfflineWorkOrderAction, { type: "start-assignment" }>, "id" | "createdAt">
  | Omit<Extract<OfflineWorkOrderAction, { type: "complete-assignment" }>, "id" | "createdAt">
  | Omit<Extract<OfflineWorkOrderAction, { type: "not-complete-assignment" }>, "id" | "createdAt">;

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

function parseQueue(value: string | null): OfflineWorkOrderAction[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is OfflineWorkOrderAction => {
      return Boolean(
        item &&
          typeof item === "object" &&
          typeof item.id === "string" &&
          typeof item.assignmentId === "string" &&
          typeof item.createdAt === "string" &&
          ["start-assignment", "complete-assignment", "not-complete-assignment"].includes(
            String(item.type),
          ),
      );
    });
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
  const nextAction = {
    ...action,
    id: createActionId(),
    createdAt: new Date().toISOString(),
  } as OfflineWorkOrderAction;

  writeOfflineWorkOrderQueue([...queue, nextAction]);
  void requestOfflineWorkOrderSync();
  return nextAction;
}

export function removeOfflineWorkOrderAction(id: string) {
  const queue = readOfflineWorkOrderQueue();
  writeOfflineWorkOrderQueue(queue.filter((action) => action.id !== id));
}

export function getOfflineWorkOrderQueueCount() {
  return readOfflineWorkOrderQueue().length;
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

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bell, CloudOff, RefreshCcw, Wifi, X } from "lucide-react";
import { completeAssignment, markAssignmentEnRoute, notCompleteAssignment, setAssignmentChecklistAnswer, setAssignmentTaskCompletion, startAssignment } from "@/actions/assignments";
import { addExtraWork } from "@/actions/extra-work";
import { addInventoryUsage } from "@/actions/inventory";
import { addMaterialUsage } from "@/actions/materials";
import { addReportNote } from "@/actions/reports";
import {
  MAX_AUTOMATIC_OFFLINE_ATTEMPTS,
  completeOfflineWorkOrderAction,
  getOfflineWorkOrderFailureCount,
  bindOfflineWorkOrderQueueOwner,
  getNextOfflineWorkOrderRetryAt,
  getOfflineWorkOrderQueueCount,
  isOfflineWorkOrderQueueOwnedBy,
  readNextEligibleOfflineWorkOrderAction,
  recoverOfflineWorkOrderQueueAfterReload,
  requestOfflineWorkOrderSync,
  retryOfflineWorkOrderFailures,
  subscribeOfflineWorkOrderQueue,
  updateOfflineWorkOrderAction,
  type OfflineWorkOrderAction,
} from "@/lib/offline/work-order-queue";
import {
  createOfflineSyncCoordinator,
  type OfflineSyncCoordinator,
  type OfflineSyncPassRequest,
  type OfflineSyncTrigger,
} from "@/lib/offline/offline-sync-coordinator";
import {
  classifyOfflineSyncFailure,
  computeOfflineRetryDelayMs,
} from "@/lib/offline/offline-sync-errors";
import { createPortalRefreshScheduler, subscribeToPortalRealtimeEvents } from "@/lib/realtime/portal-realtime-client";
import { createClient } from "@/lib/supabase/client";

type Props = {
  personnelId: string | null;
  children: ReactNode;
};

type RealtimeState = "idle" | "connecting" | "active" | "error";
type ForegroundPushNotification = {
  title: string;
  body: string;
  href: string | null;
  priority: "low" | "normal" | "high";
  receivedAt: number;
};

const MINUTE_REFRESH_INTERVAL_MS = 60_000;
const REFRESH_DEBOUNCE_MS = 180;
const MIN_REFRESH_INTERVAL_MS = 15_000;
const MIN_BACKGROUND_REFRESH_MS = 30_000;

function msUntilNextMinute(): number {
  const now = new Date();
  const elapsedInMinute = now.getSeconds() * 1000 + now.getMilliseconds();
  return MINUTE_REFRESH_INTERVAL_MS - elapsedInMinute;
}

async function runQueuedAction(action: OfflineWorkOrderAction) {
  if (action.type === "start-assignment") {
    return startAssignment(action.assignmentId, {
      expectedParticipantVersion: action.expectedParticipantVersion ?? null,
      clientMutationId: action.idempotencyKey,
    });
  }

  if (action.type === "mark-assignment-en-route") {
    return markAssignmentEnRoute(action.assignmentId, {
      expectedParticipantVersion: action.expectedParticipantVersion ?? null,
      clientMutationId: action.idempotencyKey,
    });
  }

  if (action.type === "complete-assignment") {
    return completeAssignment(action.assignmentId, {
      ...action.payload,
      expectedParticipantVersion: action.expectedParticipantVersion ?? null,
      clientMutationId: action.idempotencyKey,
    });
  }

  if (action.type === "not-complete-assignment") {
    return notCompleteAssignment(action.assignmentId, {
      ...action.payload,
      expectedParticipantVersion: action.expectedParticipantVersion ?? null,
      clientMutationId: action.idempotencyKey,
    });
  }

  if (action.type === "set-task-completion") {
    return setAssignmentTaskCompletion(action.assignmentId, action.taskId, action.payload.completed, {
      expectedParticipantVersion: action.expectedParticipantVersion ?? null,
      clientMutationId: action.idempotencyKey,
    });
  }

  if (action.type === "set-checklist-answer") {
    return setAssignmentChecklistAnswer(action.assignmentId, action.checklistId, action.itemId, {
      ...action.payload,
      clientMutationId: action.idempotencyKey,
    });
  }

  if (action.type === "add-report-note") {
    return addReportNote(action.assignmentId, {
      body: action.payload.body,
      expectedParticipantVersion: action.expectedParticipantVersion ?? null,
      clientMutationId: action.idempotencyKey,
    });
  }

  if (action.type === "add-extra-work") {
    return addExtraWork(action.assignmentId, {
      ...action.payload,
      expectedParticipantVersion: action.expectedParticipantVersion ?? null,
      clientMutationId: action.idempotencyKey,
    });
  }

  if (action.type === "add-inventory-usage") {
    return addInventoryUsage(action.assignmentId, {
      ...action.payload,
      expectedParticipantVersion: action.expectedParticipantVersion ?? null,
      clientMutationId: action.idempotencyKey,
    });
  }

  return addMaterialUsage(action.assignmentId, {
    ...action.payload,
    expectedParticipantVersion: action.expectedParticipantVersion ?? null,
    clientMutationId: action.idempotencyKey,
  });
}

function normalizeClientHref(href: unknown): string | null {
  if (typeof href !== "string" || href.trim().length === 0) return null;
  const trimmed = href.trim();

  try {
    if (/^https?:\/\//iu.test(trimmed)) {
      const url = new URL(trimmed);
      if (url.origin !== window.location.origin) return null;
      return normalizeClientHref(`${url.pathname}${url.search}${url.hash}`);
    }
  } catch {
    return null;
  }

  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (path === "/personeel") return "/";
  if (path.startsWith("/personeel/")) return path.slice("/personeel".length);
  return path;
}

function asForegroundPriority(value: unknown): ForegroundPushNotification["priority"] {
  if (value === "high") return "high";
  if (value === "low") return "low";
  return "normal";
}

export function PersonnelRealtimeOfflineProvider({ personnelId, children }: Props) {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncedNotice, setSyncedNotice] = useState(false);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("idle");
  const [pushToast, setPushToast] = useState<ForegroundPushNotification | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minuteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minuteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const processQueuePassRef = useRef<(request: OfflineSyncPassRequest) => Promise<void>>(async () => undefined);
  const coordinatorRef = useRef<OfflineSyncCoordinator | null>(null);
  const requestSyncRef = useRef<(trigger: OfflineSyncTrigger) => Promise<void>>(async () => undefined);

  const scheduleRefresh = useCallback(
    createPortalRefreshScheduler({
      router,
      timerRef: refreshTimerRef,
      lastRefreshAtRef,
      debounceMs: REFRESH_DEBOUNCE_MS,
      minRefreshIntervalMs: MIN_REFRESH_INTERVAL_MS,
    }),
    [router],
  );

  const updateQueueCount = useCallback(() => {
    setPendingCount(getOfflineWorkOrderQueueCount());
    setFailedCount(getOfflineWorkOrderFailureCount());
  }, []);

  const scheduleRetryTimer = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    const nextRetryAt = getNextOfflineWorkOrderRetryAt();
    if (nextRetryAt === null) return;
    const delay = Math.max(0, Math.min(2_147_000_000, nextRetryAt - Date.now()));
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void requestSyncRef.current("retry-timer");
    }, delay);
  }, []);

  const processQueuePass = useCallback(async (request: OfflineSyncPassRequest) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (!isOfflineWorkOrderQueueOwnedBy(personnelId)) return;
    const accelerateRetry = request.triggers.some((trigger) => [
      "online",
      "focus",
      "visibility",
      "service-worker",
      "manual-retry",
    ].includes(trigger));

    const executePass = async () => {
      if (!isOfflineWorkOrderQueueOwnedBy(personnelId)) return;
      // Recovery must run under the same cross-tab lock as claiming/draining.
      // Otherwise a newly opened tab can reset another tab's live request.
      recoverOfflineWorkOrderQueueAfterReload();
      setSyncing(true);
      setSyncError(null);
      setSyncedNotice(false);
      let syncedAnyAction = false;
      const attemptedMutationIds = new Set<string>();

      try {
        while (typeof navigator === "undefined" || navigator.onLine) {
          if (!isOfflineWorkOrderQueueOwnedBy(personnelId)) break;
          const action = readNextEligibleOfflineWorkOrderAction({
            accelerateRetry,
            excludeMutationIds: attemptedMutationIds,
          });
          if (!action) break;
          if (action.status === "synced") {
            completeOfflineWorkOrderAction(action.id, action.canonicalReceipt ?? {
              acknowledgedAt: new Date().toISOString(),
              mutationId: action.idempotencyKey,
              participantVersion: action.expectedParticipantVersion ?? 0,
            });
            continue;
          }

          attemptedMutationIds.add(action.idempotencyKey);
          const attempt = action.attempts + 1;
          const lastAttemptAt = new Date().toISOString();
          updateOfflineWorkOrderAction(action.id, {
            status: "syncing",
            attempts: attempt,
            lastAttemptAt,
            nextRetryAt: null,
            lastError: null,
            lastErrorCode: null,
            lastErrorClassification: null,
            lastErrorDiagnosticId: null,
            lastErrorRetryable: null,
            lastErrorSqlState: null,
          });

          let result: Awaited<ReturnType<typeof runQueuedAction>> | null = null;
          let thrown: unknown = null;
          try {
            result = await runQueuedAction(action);
          } catch (error) {
            thrown = error;
          }

          if (result?.success) {
            const resultId = "answerId" in result && typeof result.answerId === "string"
              ? result.answerId
              : "id" in result && typeof result.id === "string"
                ? result.id
                : null;
            const answerRevision = "revision" in result && typeof result.revision === "number"
              && Number.isInteger(result.revision) && result.revision >= 0
              ? result.revision
              : null;
            const participantVersion = Number(result.participantVersion);
            if (!Number.isInteger(participantVersion) || participantVersion < 0) {
              updateOfflineWorkOrderAction(action.id, {
                status: "failed",
                nextRetryAt: null,
                lastError: "De server bevestigde de wijziging zonder geldige versie. Vernieuw de werkbon.",
                lastErrorCode: "missing_canonical_participant_version",
                lastErrorClassification: "permanent",
                lastErrorRetryable: false,
              });
              setSyncError("De server bevestigde de wijziging zonder geldige versie. Vernieuw de werkbon.");
              continue;
            }
            const receipt = {
              acknowledgedAt: new Date().toISOString(),
              mutationId: action.idempotencyKey,
              participantVersion,
              resultId,
              answerRevision,
            };
            const completion = completeOfflineWorkOrderAction(action.id, receipt);
            window.dispatchEvent(new CustomEvent("veele:offline-mutation-receipt", {
              detail: {
                mutationId: action.idempotencyKey,
                participantVersion,
                dependentMutationIds: completion.dependentMutationIds,
              },
            }));
            syncedAnyAction = true;
            continue;
          }

          const classification = classifyOfflineSyncFailure(
            thrown ?? result,
            thrown !== null ? "exception" : "result",
          );
          const exhausted = attempt >= MAX_AUTOMATIC_OFFLINE_ATTEMPTS;
          if (classification.kind === "transient" && !exhausted) {
            const delay = computeOfflineRetryDelayMs({
              attempt,
              retryAfterMs: classification.retryAfterMs,
              status: classification.status,
            });
            updateOfflineWorkOrderAction(action.id, {
              status: "retry_wait",
              nextRetryAt: new Date(Date.now() + delay).toISOString(),
              lastError: classification.message,
              lastErrorCode: classification.code,
              lastErrorClassification: "transient",
              lastErrorDiagnosticId: classification.diagnosticId,
              lastErrorRetryable: true,
              lastErrorSqlState: classification.sqlState,
            });
            setSyncError("Synchronisatie wordt automatisch opnieuw geprobeerd");
          } else {
            const status = classification.kind === "conflict" ? "conflict" : "failed";
            updateOfflineWorkOrderAction(action.id, {
              status,
              nextRetryAt: null,
              lastError: classification.message,
              lastErrorCode: exhausted ? "retry_limit_reached" : classification.code,
              lastErrorClassification: classification.kind,
              lastErrorDiagnosticId: classification.diagnosticId,
              lastErrorRetryable: classification.kind === "transient",
              lastErrorSqlState: classification.sqlState,
            });
            setSyncError(classification.message);
          }
          continue;
        }
      } finally {
        setSyncing(false);
        setPendingCount(getOfflineWorkOrderQueueCount());
        setFailedCount(getOfflineWorkOrderFailureCount());
        if (syncedAnyAction && getOfflineWorkOrderQueueCount() === 0) {
          setSyncedNotice(true);
          window.setTimeout(() => setSyncedNotice(false), 4500);
        }
        scheduleRetryTimer();
        scheduleRefresh();
      }
    };

    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request("fieldgrid-personnel-offline-sync-v1", executePass);
      return;
    }
    await executePass();
  }, [personnelId, scheduleRefresh, scheduleRetryTimer]);

  processQueuePassRef.current = processQueuePass;
  if (!coordinatorRef.current) {
    coordinatorRef.current = createOfflineSyncCoordinator({
      isOnline: () => typeof navigator === "undefined" || navigator.onLine,
      onObservation: (observation) => {
        window.dispatchEvent(new CustomEvent("veele:offline-sync-observation", {
          detail: observation,
        }));
      },
      onUnexpectedError: (error) => {
        console.error("offline synchronization coordinator failed", error);
        setSyncError("Synchronisatiecoördinator is onverwacht gestopt");
      },
      runPass: (request) => processQueuePassRef.current(request),
    });
  }

  const requestSync = useCallback((trigger: OfflineSyncTrigger) => (
    coordinatorRef.current?.requestSync(trigger) ?? Promise.resolve()
  ), []);
  requestSyncRef.current = requestSync;

  const retryFailedQueue = useCallback(() => {
    retryOfflineWorkOrderFailures();
    setSyncError(null);
    updateQueueCount();
    void requestSync("manual-retry");
  }, [requestSync, updateQueueCount]);

  useEffect(() => {
    bindOfflineWorkOrderQueueOwner(personnelId);
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    updateQueueCount();

    const unsubscribeQueue = subscribeOfflineWorkOrderQueue((reason) => {
      updateQueueCount();
      if (reason === "enqueue") void requestSync("enqueue");
      if (reason === "manual-retry") void requestSync("manual-retry");
      if (reason === "storage") void requestSync("storage");
    });

    const handleOnline = () => {
      setOnline(true);
      void requestSync("online");
      void requestOfflineWorkOrderSync();
    };
    const handleOffline = () => setOnline(false);
    const handleFocus = () => {
      void requestSync("focus");
      const hiddenAt = hiddenAtRef.current;
      if (!hiddenAt || Date.now() - hiddenAt < MIN_BACKGROUND_REFRESH_MS) {
        return;
      }
      hiddenAtRef.current = null;
      scheduleRefresh();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      if (document.visibilityState === "visible") {
        void requestSync("visibility");
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (!hiddenAt || Date.now() - hiddenAt < MIN_BACKGROUND_REFRESH_MS) {
          return;
        }
        scheduleRefresh();
      }
    };
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "FIELDGRID_PROCESS_OFFLINE_QUEUE") {
        void requestSync("service-worker");
        return;
      }

      if (event.data?.type === "FIELDGRID_PUSH_NOTIFICATION") {
        scheduleRefresh(true);
        if (document.visibilityState !== "visible") return;

        const payload =
          event.data.payload && typeof event.data.payload === "object"
            ? (event.data.payload as Record<string, unknown>)
            : {};
        setPushToast({
          title:
            typeof payload["title"] === "string" && payload["title"].trim()
              ? payload["title"]
              : "Nieuwe melding",
          body:
            typeof payload["body"] === "string" && payload["body"].trim()
              ? payload["body"]
              : "Er staat een nieuwe melding klaar.",
          href: normalizeClientHref(payload["href"]),
          priority: asForegroundPriority(payload["priority"] ?? payload["urgency"]),
          receivedAt:
            typeof payload["receivedAt"] === "number"
              ? payload["receivedAt"]
              : Date.now(),
        });
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

    if (typeof navigator === "undefined" || navigator.onLine) {
      void requestSync("startup");
    }

    return () => {
      unsubscribeQueue();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, [personnelId, requestSync, scheduleRefresh, updateQueueCount]);

  useEffect(() => {
    if (!personnelId) {
      setRealtimeState("idle");
      return;
    }

    try {
      const realtimeKey = `personnel_${personnelId}`;
      const supabase = createClient();
      return subscribeToPortalRealtimeEvents({
        client: supabase,
        realtimeKey,
        channelPrefix: "portal-live",
        scheduleRefresh,
        onStatus: setRealtimeState,
      });
    } catch {
      setRealtimeState("error");
      return;
    }
  }, [personnelId, scheduleRefresh]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
    };

    minuteTimeoutRef.current = setTimeout(() => {
      refreshIfVisible();
      minuteIntervalRef.current = setInterval(refreshIfVisible, MINUTE_REFRESH_INTERVAL_MS);
    }, msUntilNextMinute());

    return () => {
      if (minuteTimeoutRef.current) {
        clearTimeout(minuteTimeoutRef.current);
      }
      if (minuteIntervalRef.current) {
        clearInterval(minuteIntervalRef.current);
      }
      minuteTimeoutRef.current = null;
      minuteIntervalRef.current = null;
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pushToast) return;
    const timeout = setTimeout(
      () => setPushToast(null),
      pushToast.priority === "high" ? 10000 : 6500,
    );
    return () => clearTimeout(timeout);
  }, [pushToast]);

  const showStatus = !online || pendingCount > 0 || syncing || Boolean(syncError) || syncedNotice || realtimeState === "error";

  return (
    <>
      {children}
      {pushToast ? (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(4.25rem+var(--safe-top))] z-[120] flex justify-center px-3 md:top-4">
          <div
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-[24px] border bg-white/95 p-3 shadow-2xl backdrop-blur animate-veele-notification-slide-in ${
              pushToast.priority === "high" ? "ring-2 ring-amber-200" : ""
            }`}
            style={{
              borderColor: pushToast.priority === "high" ? "#FDE68A" : "#BDEDEA",
              boxShadow: "0 18px 44px rgba(8,29,58,0.18)",
            }}
            role="status"
          >
            <button
              type="button"
              className="flex min-h-12 min-w-12 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]"
              onClick={() => {
                const target = pushToast.href;
                setPushToast(null);
                if (target) router.push(target);
              }}
              aria-label="Melding openen"
            >
              <Bell size={22} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                const target = pushToast.href;
                setPushToast(null);
                if (target) router.push(target);
              }}
            >
              <p className="line-clamp-1 text-[13px] font-black text-[var(--color-primary)]">
                {pushToast.title}
              </p>
              <p className="mt-1 line-clamp-2 text-[12px] font-bold leading-snug text-slate-500">
                {pushToast.body}
              </p>
              {pushToast.priority === "high" ? (
                <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
                  Urgent
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
              onClick={() => setPushToast(null)}
              aria-label="Melding sluiten"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      ) : null}
      {showStatus ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.65rem+var(--safe-bottom))] z-[95] flex justify-center px-4 md:bottom-4">
          <div
            className="flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border bg-white/95 px-3 py-2 text-[12px] font-black shadow-xl backdrop-blur"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          >
            {!online ? (
              <>
                <CloudOff size={15} strokeWidth={2.4} className="text-[#DC2626]" />
                Offline modus
              </>
            ) : syncing ? (
              <>
                <RefreshCcw size={15} strokeWidth={2.4} className="animate-spin text-[#0A9F9A]" />
                Synchroniseren...
              </>
            ) : syncError ? (
              <>
                <CloudOff size={15} strokeWidth={2.4} className="text-[#DC2626]" />
                <span>{failedCount > 0 ? `${failedCount} actie${failedCount === 1 ? "" : "s"} mislukt` : "Synchronisatie vraagt aandacht"}</span>
                <button
                  type="button"
                  className="pointer-events-auto rounded-full bg-[#FEE2E2] px-2 py-1 text-[11px] font-black text-[#DC2626]"
                  onClick={retryFailedQueue}
                >
                  Opnieuw
                </button>
              </>
            ) : realtimeState === "error" ? (
              <>
                <Wifi size={15} strokeWidth={2.4} className="text-[#D97706]" />
                Realtime opnieuw verbinden
              </>
            ) : syncedNotice ? (
              <>
                <Wifi size={15} strokeWidth={2.4} className="text-[#0A9F9A]" />
                Offline acties gesynchroniseerd
              </>
            ) : (
              <>
                <RefreshCcw size={15} strokeWidth={2.4} className="text-[#0A9F9A]" />
                {pendingCount} actie{pendingCount === 1 ? "" : "s"} wachten
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

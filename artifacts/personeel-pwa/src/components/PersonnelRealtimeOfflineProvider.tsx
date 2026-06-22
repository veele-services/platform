"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bell, CloudOff, RefreshCcw, Wifi, X } from "lucide-react";
import { completeAssignment, notCompleteAssignment, setAssignmentTaskCompletion, startAssignment } from "@/actions/assignments";
import { addExtraWork } from "@/actions/extra-work";
import { addMaterialUsage } from "@/actions/materials";
import { addReportNote } from "@/actions/reports";
import {
  getOfflineWorkOrderFailureCount,
  getOfflineWorkOrderQueueCount,
  readOfflineWorkOrderQueue,
  removeOfflineWorkOrderAction,
  requestOfflineWorkOrderSync,
  retryOfflineWorkOrderFailures,
  subscribeOfflineWorkOrderQueue,
  updateOfflineWorkOrderAction,
  type OfflineWorkOrderAction,
} from "@/lib/offline/work-order-queue";
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

async function runQueuedAction(action: OfflineWorkOrderAction) {
  if (action.type === "start-assignment") {
    return startAssignment(action.assignmentId);
  }

  if (action.type === "complete-assignment") {
    return completeAssignment(action.assignmentId, action.payload);
  }

  if (action.type === "not-complete-assignment") {
    return notCompleteAssignment(action.assignmentId, action.payload);
  }

  if (action.type === "set-task-completion") {
    return setAssignmentTaskCompletion(action.assignmentId, action.taskId, action.payload.completed);
  }

  if (action.type === "add-report-note") {
    return addReportNote(action.assignmentId, { body: action.payload.body });
  }

  if (action.type === "add-extra-work") {
    return addExtraWork(action.assignmentId, action.payload);
  }

  return addMaterialUsage(action.assignmentId, action.payload);
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
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("idle");
  const [pushToast, setPushToast] = useState<ForegroundPushNotification | null>(null);
  const syncingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      router.refresh();
      refreshTimerRef.current = null;
    }, 180);
  }, [router]);

  const updateQueueCount = useCallback(() => {
    setPendingCount(getOfflineWorkOrderQueueCount());
    setFailedCount(getOfflineWorkOrderFailureCount());
  }, []);

  const processQueue = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (syncingRef.current) return;

    const queue = readOfflineWorkOrderQueue();
    if (queue.length === 0) {
      setSyncError(null);
      setPendingCount(0);
      return;
    }

    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);

    try {
      for (const action of queue) {
        updateOfflineWorkOrderAction(action.id, {
          status: "syncing",
          attempts: action.attempts + 1,
          lastError: null,
        });
        const result = await runQueuedAction(action);
        if (!result.success) {
          const error = result.error ?? "Synchronisatie mislukt";
          updateOfflineWorkOrderAction(action.id, {
            status: "failed",
            lastError: error,
          });
          setSyncError(error);
          break;
        }
        removeOfflineWorkOrderAction(action.id);
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      setPendingCount(getOfflineWorkOrderQueueCount());
      setFailedCount(getOfflineWorkOrderFailureCount());
      scheduleRefresh();
    }
  }, [scheduleRefresh]);

  const retryFailedQueue = useCallback(() => {
    retryOfflineWorkOrderFailures();
    setSyncError(null);
    updateQueueCount();
    void processQueue();
  }, [processQueue, updateQueueCount]);

  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    updateQueueCount();

    const unsubscribeQueue = subscribeOfflineWorkOrderQueue(() => {
      updateQueueCount();
      if (typeof navigator === "undefined" || navigator.onLine) {
        void processQueue();
      }
    });

    const handleOnline = () => {
      setOnline(true);
      void processQueue();
      void requestOfflineWorkOrderSync();
    };
    const handleOffline = () => setOnline(false);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
        void processQueue();
      }
    };
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "VEELE_PROCESS_OFFLINE_QUEUE") {
        void processQueue();
        return;
      }

      if (event.data?.type === "VEELE_PUSH_NOTIFICATION") {
        scheduleRefresh();
        if (document.visibilityState !== "visible") return;

        const payload =
          event.data.payload && typeof event.data.payload === "object"
            ? (event.data.payload as Record<string, unknown>)
            : {};
        setPushToast({
          title:
            typeof payload["title"] === "string" && payload["title"].trim()
              ? payload["title"]
              : "Veele Services",
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
    document.addEventListener("visibilitychange", handleVisibility);
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

    if (typeof navigator === "undefined" || navigator.onLine) {
      void processQueue();
    }

    return () => {
      unsubscribeQueue();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, [processQueue, scheduleRefresh, updateQueueCount]);

  useEffect(() => {
    if (!personnelId) {
      setRealtimeState("idle");
      return;
    }

    let closed = false;
    setRealtimeState("connecting");

    try {
      const realtimeKey = `personnel_${personnelId}`;
      const supabase = createClient();
      const channel = supabase
        .channel(`portal-live:${realtimeKey}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "portal_realtime_events",
            filter: `realtime_key=eq.${realtimeKey}`,
          },
          scheduleRefresh,
        )
        .subscribe((status) => {
          if (closed) return;
          if (status === "SUBSCRIBED") setRealtimeState("active");
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setRealtimeState("error");
          }
        });

      return () => {
        closed = true;
        void supabase.removeChannel(channel);
      };
    } catch {
      setRealtimeState("error");
      return;
    }
  }, [personnelId, scheduleRefresh]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
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

  const showStatus = !online || pendingCount > 0 || syncing || Boolean(syncError) || realtimeState === "error";

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
              <p className="line-clamp-1 text-[13px] font-black text-[#081D3A]">
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

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCcw, Wifi } from "lucide-react";
import { completeAssignment, notCompleteAssignment, startAssignment } from "@/actions/assignments";
import {
  getOfflineWorkOrderQueueCount,
  readOfflineWorkOrderQueue,
  removeOfflineWorkOrderAction,
  requestOfflineWorkOrderSync,
  subscribeOfflineWorkOrderQueue,
  type OfflineWorkOrderAction,
} from "@/lib/offline/work-order-queue";
import { createClient } from "@/lib/supabase/client";

type Props = {
  personnelId: string | null;
  children: ReactNode;
};

type RealtimeState = "idle" | "connecting" | "active" | "error";

async function runQueuedAction(action: OfflineWorkOrderAction) {
  if (action.type === "start-assignment") {
    return startAssignment(action.assignmentId);
  }

  if (action.type === "complete-assignment") {
    return completeAssignment(action.assignmentId, action.payload);
  }

  return notCompleteAssignment(action.assignmentId, action.payload);
}

export function PersonnelRealtimeOfflineProvider({ personnelId, children }: Props) {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("idle");
  const syncingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      router.refresh();
      refreshTimerRef.current = null;
    }, 650);
  }, [router]);

  const updateQueueCount = useCallback(() => {
    setPendingCount(getOfflineWorkOrderQueueCount());
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
        const result = await runQueuedAction(action);
        if (!result.success) {
          setSyncError(result.error ?? "Synchronisatie mislukt");
          break;
        }
        removeOfflineWorkOrderAction(action.id);
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      setPendingCount(getOfflineWorkOrderQueueCount());
      scheduleRefresh();
    }
  }, [scheduleRefresh]);

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
      const supabase = createClient();
      const channel = supabase
        .channel(`personnel-live:${personnelId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "assignment_personnel",
            filter: `personnel_id=eq.${personnelId}`,
          },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "personnel_notifications",
            filter: `personnel_id=eq.${personnelId}`,
          },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "personnel_message_threads",
            filter: `personnel_id=eq.${personnelId}`,
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

  const showStatus = !online || pendingCount > 0 || syncing || Boolean(syncError) || realtimeState === "error";

  return (
    <>
      {children}
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
                Synchronisatie vraagt aandacht
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

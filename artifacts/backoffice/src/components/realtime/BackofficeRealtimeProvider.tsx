"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createPortalRefreshScheduler, subscribeToPortalRealtimeEvents } from "@/lib/realtime/portal-realtime-client";
import { createClient } from "@/lib/supabase/client";

type Props = {
  realtimeKey: string | null;
  children: ReactNode;
};

export function BackofficeRealtimeProvider({ realtimeKey, children }: Props) {
  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAtRef = useRef(0);

  const scheduleRefresh = useCallback(
    createPortalRefreshScheduler({
      router,
      timerRef: refreshTimerRef,
      lastRefreshAtRef,
      debounceMs: 220,
      minRefreshIntervalMs: 15_000,
    }),
    [router],
  );

  useEffect(() => {
    if (!realtimeKey) return;

    try {
      const supabase = createClient();
      return subscribeToPortalRealtimeEvents({
        client: supabase,
        realtimeKey,
        channelPrefix: "backoffice-live",
        scheduleRefresh,
      });
    } catch {
      return;
    }
  }, [realtimeKey, scheduleRefresh]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [scheduleRefresh]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  return <>{children}</>;
}

"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createPortalRefreshScheduler, subscribeToPortalRealtimeEvents } from "@/lib/realtime/portal-realtime-client";
import { createClient } from "@/lib/supabase/client";

type Props = {
  customerId: string | null;
  children: ReactNode;
};

const REFRESH_DEBOUNCE_MS = 220;
const MIN_REFRESH_INTERVAL_MS = 15_000;
const MIN_BACKGROUND_REFRESH_MS = 30_000;

export function CustomerRealtimeProvider({ customerId, children }: Props) {
  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (!customerId) return;

    const realtimeKey = `customer_${customerId}`;
    try {
      const supabase = createClient();
      return subscribeToPortalRealtimeEvents({
        client: supabase,
        realtimeKey,
        channelPrefix: "customer-live",
        scheduleRefresh,
      });
    } catch {
      return;
    }
  }, [customerId, scheduleRefresh]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      if (document.visibilityState === "visible") {
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (!hiddenAt || Date.now() - hiddenAt < MIN_BACKGROUND_REFRESH_MS) {
          return;
        }
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

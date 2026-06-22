"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  customerId: string | null;
  children: ReactNode;
};

export function CustomerRealtimeProvider({ customerId, children }: Props) {
  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      router.refresh();
      refreshTimerRef.current = null;
    }, 220);
  }, [router]);

  useEffect(() => {
    if (!customerId) return;

    const realtimeKey = `customer_${customerId}`;
    let closed = false;

    try {
      const supabase = createClient();
      const channel = supabase
        .channel(`customer-live:${realtimeKey}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "portal_realtime_events",
            filter: `realtime_key=eq.${realtimeKey}`,
          },
          () => {
            if (!closed) scheduleRefresh();
          },
        )
        .subscribe();

      return () => {
        closed = true;
        void supabase.removeChannel(channel);
      };
    } catch {
      return;
    }
  }, [customerId, scheduleRefresh]);

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

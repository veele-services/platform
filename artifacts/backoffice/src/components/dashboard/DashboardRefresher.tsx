"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Invisible client component that refreshes dashboard RSC data every 60 s.
 * Pauses when the browser tab is hidden (document.visibilityState !== "visible").
 */
export function DashboardRefresher() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        router.refresh();
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [router]);

  return null;
}

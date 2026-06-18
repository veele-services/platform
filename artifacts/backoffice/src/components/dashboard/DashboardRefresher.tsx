"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Client component that refreshes dashboard RSC data every 60 s and renders
 * a subtle "Laatst bijgewerkt: HH:MM" indicator.
 * Pauses when the browser tab is hidden.
 */
export function DashboardRefresher() {
  const router = useRouter();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    // Show the current time immediately on mount (≈ when RSC data loaded)
    setLastUpdated(new Date());

    const interval = setInterval(() => {
      if (!document.hidden) {
        router.refresh();
        setLastUpdated(new Date());
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [router]);

  if (!lastUpdated) return null;

  const time = lastUpdated.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

  return (
    <p className="text-xs" style={{ color: "#94A3B8" }}>
      Ververst om {time}
    </p>
  );
}

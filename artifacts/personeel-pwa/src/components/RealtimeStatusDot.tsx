"use client";

import { useEffect, useState } from "react";

export function RealtimeStatusDot() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{
        backgroundColor: online ? "#4ED9D5" : "#F59E0B",
        boxShadow: online
          ? "0 0 0 4px rgba(78,217,213,0.15)"
          : "0 0 0 4px rgba(245,158,11,0.16)",
      }}
      role="img"
      aria-label={online ? "Realtime actief" : "Offline"}
      title={online ? "Realtime actief" : "Offline"}
    />
  );
}

"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

type OfflineContentNoticeProps = {
  message?: string;
};

export function OfflineContentNotice({
  message = "Je bent offline. Eerder geopende helpartikelen en release notes blijven beschikbaar; media en bijlagen openen weer zodra je online bent.",
}: OfflineContentNoticeProps) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-900">
      <div className="flex items-start gap-2">
        <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  deriveRecentContext,
  mergeRecentContexts,
  parseRecentContexts,
  RECENT_CONTEXT_EVENT,
  RECENT_CONTEXT_STORAGE_KEY,
} from "@/lib/navigation/recent-context";

export function RecentContextTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const context = deriveRecentContext(
      pathname,
      new URLSearchParams(searchParams.toString()),
    );
    if (!context) return;

    const current = parseRecentContexts(
      window.localStorage.getItem(RECENT_CONTEXT_STORAGE_KEY),
    );
    window.localStorage.setItem(
      RECENT_CONTEXT_STORAGE_KEY,
      JSON.stringify(mergeRecentContexts(current, context)),
    );
    window.dispatchEvent(new Event(RECENT_CONTEXT_EVENT));
  }, [pathname, searchParams]);

  return null;
}

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  deriveRecentContext,
  mergeRecentContexts,
  parseRecentContexts,
  RECENT_CONTEXT_EVENT,
  recentContextStorageKey,
} from "@/lib/navigation/recent-context";
import {
  usePermissionsPrincipalId,
  usePermissionsTenantId,
} from "@/providers/permissions-provider";

export function RecentContextTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tenantId = usePermissionsTenantId();
  const principalId = usePermissionsPrincipalId();

  useEffect(() => {
    if (!tenantId || !principalId) return;
    const context = deriveRecentContext(
      pathname,
      new URLSearchParams(searchParams.toString()),
    );
    if (!context) return;

    const storageKey = recentContextStorageKey(tenantId, principalId);
    const current = parseRecentContexts(
      window.localStorage.getItem(storageKey),
    );
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(mergeRecentContexts(current, context)),
    );
    window.dispatchEvent(new Event(RECENT_CONTEXT_EVENT));
  }, [pathname, principalId, searchParams, tenantId]);

  return null;
}

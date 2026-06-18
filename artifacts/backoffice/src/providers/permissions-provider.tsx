"use client";

import React, { createContext, useContext } from "react";

const PermissionsContext = createContext<Set<string>>(new Set());

/**
 * Client-side provider for the current user's permission set.
 *
 * Usage: wrap the dashboard layout (Server Component) with this provider,
 * passing a serialised permissions array fetched server-side.
 *
 * <PermissionsProvider permissions={[...permissionsSet]}>
 *   {children}
 * </PermissionsProvider>
 */
export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: string[];
  children: React.ReactNode;
}) {
  const set = React.useMemo(() => new Set(permissions), [permissions]);
  return (
    <PermissionsContext.Provider value={set}>
      {children}
    </PermissionsContext.Provider>
  );
}

/** Read the full permissions Set for the current user. */
export function usePermissions(): Set<string> {
  return useContext(PermissionsContext);
}

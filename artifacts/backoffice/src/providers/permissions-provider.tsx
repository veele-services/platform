"use client";

import React, { createContext, useContext } from "react";

type PermissionsContextValue = {
  permissions: Set<string>;
  tenantId: string | null;
  principalId: string | null;
};

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: new Set(),
  tenantId: null,
  principalId: null,
});

/**
 * Client-side provider for the current user's tenant-scoped permission set.
 *
 * Usage: wrap the dashboard layout (Server Component) with this provider,
 * passing a serialised permissions array fetched server-side for tenantId.
 *
 * <PermissionsProvider permissions={[...permissionsSet]} tenantId={tenantId}>
 *   {children}
 * </PermissionsProvider>
 */
export function PermissionsProvider({
  permissions,
  tenantId,
  principalId,
  children,
}: {
  permissions: string[];
  tenantId: string;
  principalId: string;
  children: React.ReactNode;
}) {
  const value = React.useMemo<PermissionsContextValue>(
    () => ({ permissions: new Set(permissions), tenantId, principalId }),
    [permissions, principalId, tenantId],
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

/** Read the full permissions Set for the current tenant-scoped user. */
export function usePermissions(): Set<string> {
  return useContext(PermissionsContext).permissions;
}

/** Read the tenant ID that the current permissions were resolved for. */
export function usePermissionsTenantId(): string | null {
  return useContext(PermissionsContext).tenantId;
}

/** Read the opaque authenticated principal ID used for browser-local scoping. */
export function usePermissionsPrincipalId(): string | null {
  return useContext(PermissionsContext).principalId;
}

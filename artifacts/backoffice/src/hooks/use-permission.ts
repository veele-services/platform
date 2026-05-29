"use client";

import { usePermissions } from "@/providers/permissions-provider";

/**
 * Client-side permission hook.
 *
 * Returns true when the current authenticated user holds the specified
 * resource:action permission, false otherwise.
 *
 * @example
 *   const canWriteCustomers = usePermission("customers", "write");
 */
export function usePermission(resource: string, action: string): boolean {
  const permissions = usePermissions();
  return permissions.has(`${resource}:${action}`);
}

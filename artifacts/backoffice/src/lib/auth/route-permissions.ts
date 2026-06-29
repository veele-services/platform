/**
 * Canonical mapping from URL path prefix to the required permission.
 *
 * Used by:
 * - `src/middleware.ts`  — fast route-level redirect
 * - Each dashboard page — authoritative server-side permission check
 *
 * Dashboard root (/) requires authentication only, no extra permission.
 */
export interface RoutePermission {
  prefix:   string;
  resource: string;
  action:   string;
}

export const ROUTE_PERMISSIONS: RoutePermission[] = [
  { prefix: "/planning",    resource: "planning",    action: "read" },
  { prefix: "/assignments", resource: "assignments", action: "read" },
  { prefix: "/customers",   resource: "customers",   action: "read" },
  { prefix: "/objects",     resource: "objects",     action: "read" },
  { prefix: "/personnel",   resource: "personnel",   action: "read" },
  { prefix: "/reports",     resource: "reports",     action: "read" },
  { prefix: "/invoices",    resource: "invoices",    action: "read" },
  { prefix: "/quotes",      resource: "quotes",      action: "read" },
  { prefix: "/documents",      resource: "documents", action: "read" },
  { prefix: "/tickets",        resource: "tickets",   action: "read" },
  { prefix: "/settings",       resource: "settings",  action: "read" },
  { prefix: "/instellingen",   resource: "settings",  action: "read" },
];

/**
 * Returns the required permission for the given pathname,
 * or null if the route requires authentication only (dashboard root).
 */
export function getRoutePermission(pathname: string): RoutePermission | null {
  for (const route of ROUTE_PERMISSIONS) {
    if (pathname === route.prefix || pathname.startsWith(route.prefix + "/")) {
      return route;
    }
  }
  return null;
}

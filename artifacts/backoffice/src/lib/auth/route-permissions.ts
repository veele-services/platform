import {
  TENANT_ROUTES,
  permissionParts,
  type FieldgridRouteDefinition,
} from "@/lib/navigation/route-registry";

/**
 * Middleware projection of the canonical route registry.
 *
 * Page-level server checks remain authoritative. This mapping avoids a second,
 * stale navigation/permission list in middleware.
 */
export interface RoutePermission {
  prefix: string;
  resource: string;
  action: string;
}

export const ROUTE_PERMISSIONS: RoutePermission[] = (
  TENANT_ROUTES as readonly FieldgridRouteDefinition[]
)
  .flatMap((route) => {
    const permission = permissionParts(route.permission);
    if (!permission || route.href === "/") return [];
    const prefixes = route.matchPrefixes ?? [route.href];
    return prefixes.map((prefix) => ({ prefix, ...permission }));
  })
  .sort((a, b) => b.prefix.length - a.prefix.length);

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

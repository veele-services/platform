import type { Request, Response, NextFunction } from "express";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { db, userRolesTable, rolePermissionsTable, permissionsTable, tenantUsersTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

const SUPABASE_URL         = process.env["SUPABASE_URL"]         ?? "";
const SUPABASE_JWT_SECRET  = process.env["SUPABASE_JWT_SECRET"]  ?? "";

// ─── JWKS / HMAC key setup ─────────────────────────────────────────────────────

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(
      new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
    );
  }
  return _jwks;
}

// ─── Request extension ────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      tenantId?: string;
    }
  }
}

// ─── JWT verification ─────────────────────────────────────────────────────────

/**
 * Verifies the Supabase Bearer JWT, attaches `req.userId`, and calls next().
 * Returns 401 when the token is missing or invalid.
 * Returns 503 when neither SUPABASE_URL nor SUPABASE_JWT_SECRET is configured.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers["authorization"] ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "Authenticatie vereist" });
    return;
  }

  try {
    let payload: Record<string, unknown>;

    if (SUPABASE_URL) {
      const result = await jwtVerify(token, getJwks());
      payload = result.payload as Record<string, unknown>;
    } else if (SUPABASE_JWT_SECRET) {
      const secret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
      const result = await jwtVerify(token, secret);
      payload = result.payload as Record<string, unknown>;
    } else {
      req.log.error("SUPABASE_URL and SUPABASE_JWT_SECRET are both unset — auth disabled");
      res.status(503).json({ error: "Authenticatie niet geconfigureerd" });
      return;
    }

    const sub = typeof payload["sub"] === "string" ? payload["sub"] : undefined;
    if (!sub) {
      res.status(401).json({ error: "Ongeldig token: ontbrekende sub claim" });
      return;
    }

    req.userId = sub;
    next();
  } catch (err) {
    req.log.warn({ err }, "JWT verificatie mislukt");
    res.status(401).json({ error: "Ongeldig of verlopen token" });
  }
}

// ─── RBAC permission lookup ───────────────────────────────────────────────────

/** Fetch the full permission set for a user from the RBAC tables. */
export async function getUserPermissions(userId: string): Promise<Set<string>> {
  const userRoles = await db
    .select({ roleId: userRolesTable.roleId })
    .from(userRolesTable)
    .where(eq(userRolesTable.userId, userId));

  if (userRoles.length === 0) return new Set();

  const roleIds = userRoles.map((r) => r.roleId);

  const perms = await db
    .select({
      resource: permissionsTable.resource,
      action:   permissionsTable.action,
    })
    .from(rolePermissionsTable)
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(inArray(rolePermissionsTable.roleId, roleIds));

  return new Set(perms.map((p) => `${p.resource}:${p.action}`));
}

/**
 * Returns Express middleware that enforces a `resource:action` permission.
 * Must be used after `requireAuth` so `req.userId` is set.
 *
 * Returns 403 Forbidden when the authenticated user lacks the permission.
 */
export function requirePermission(resource: string, action: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Authenticatie vereist" });
      return;
    }

    const permissions = await getUserPermissions(userId);
    if (!permissions.has(`${resource}:${action}`)) {
      req.log.warn({ userId, resource, action }, "Toegang geweigerd");
      res.status(403).json({ error: "Onvoldoende rechten" });
      return;
    }

    next();
  };
}

export async function requireTenantScope(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Authenticatie vereist" });
    return;
  }

  const [tenantUser] = await db
    .select({ tenantId: tenantUsersTable.tenantId })
    .from(tenantUsersTable)
    .where(
      and(
        eq(tenantUsersTable.userId, userId),
        eq(tenantUsersTable.status, "active"),
      ),
    )
    .limit(1);

  if (!tenantUser) {
    req.log.warn({ userId }, "Geen actieve tenant-koppeling voor API-verzoek");
    res.status(403).json({ error: "Geen actieve tenant-koppeling" });
    return;
  }

  req.tenantId = tenantUser.tenantId;
  next();
}

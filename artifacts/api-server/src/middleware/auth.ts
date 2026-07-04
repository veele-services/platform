import type { Request, Response, NextFunction } from "express";
import { jwtVerify, createRemoteJWKSet } from "jose";
import {
  db,
  FIELDGRID_RUNTIME_ACCESS_PRIORITY,
  getActiveSupportAccessForUser,
  isFieldgridSubdomain,
  isPlatformHost,
  isSupportRuntimePermission,
  normalizeHost,
  moduleForPermissionResource,
  permissionsTable,
  requireTenantModule,
  TENANT_RUNTIME_ACTIVE_STATUSES,
  tenantDomainsTable,
  tenantRolePermissionsTable,
  tenantUserRolesTable,
  tenantUsersTable,
  tenantsTable,
  writeSupportAccessAuditLogForUser,
} from "@workspace/db";
import { and, eq, inArray, ne } from "drizzle-orm";

const SUPABASE_URL = process.env["SUPABASE_URL"] ?? "";
const SUPABASE_JWT_SECRET = process.env["SUPABASE_JWT_SECRET"] ?? "";

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
      supportAccess?: {
        grantId: string;
        platformUserId: string;
        reason: string;
        expiresAt: string;
        priority: typeof FIELDGRID_RUNTIME_ACCESS_PRIORITY[number];
      };
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
      req.log.error("SUPABASE_URL and SUPABASE_JWT_SECRET are both unset - auth disabled");
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

/** Fetch the full permission set for a user from the tenant-scoped RBAC tables. */
export async function getUserPermissions(userId: string, tenantId: string): Promise<Set<string>> {
  const userRoles = await db
    .select({ tenantRoleId: tenantUserRolesTable.tenantRoleId })
    .from(tenantUserRolesTable)
    .where(
      and(
        eq(tenantUserRolesTable.userId, userId),
        eq(tenantUserRolesTable.tenantId, tenantId),
      ),
    );

  if (userRoles.length === 0) return new Set();

  const tenantRoleIds = userRoles.map((r) => r.tenantRoleId);

  const perms = await db
    .select({
      resource: permissionsTable.resource,
      action: permissionsTable.action,
    })
    .from(tenantRolePermissionsTable)
    .innerJoin(permissionsTable, eq(tenantRolePermissionsTable.permissionId, permissionsTable.id))
    .where(inArray(tenantRolePermissionsTable.tenantRoleId, tenantRoleIds));

  return new Set(perms.map((p) => `${p.resource}:${p.action}`));
}

async function requireEnabledPermissionModule(
  req: Request,
  res: Response,
  resource: string,
  tenantId: string,
): Promise<boolean> {
  const moduleKey = moduleForPermissionResource(resource);
  if (!moduleKey) return true;

  try {
    await requireTenantModule(tenantId, moduleKey);
    return true;
  } catch (err) {
    req.log.warn({ err, tenantId, resource, moduleKey }, "Module toegang geweigerd");
    res.status(403).json({ error: "Module niet beschikbaar voor deze tenant" });
    return false;
  }
}

async function auditApiSupportPermission(input: {
  userId: string;
  tenantId: string;
  grantId: string;
  resource: string;
  action: string;
  allowed: boolean;
  reason: string;
  expiresAt: string;
}): Promise<void> {
  await writeSupportAccessAuditLogForUser({
    userId: input.userId,
    tenantId: input.tenantId,
    action: input.allowed ? "api_permission_allowed" : "api_permission_denied",
    resource: input.resource,
    metadata: {
      permission: `${input.resource}:${input.action}`,
      priority: FIELDGRID_RUNTIME_ACCESS_PRIORITY[1],
      grantId: input.grantId,
      reason: input.reason,
      expiresAt: input.expiresAt,
    },
    grantId: input.grantId,
  });
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
    const tenantId = req.tenantId;
    if (!userId) {
      res.status(401).json({ error: "Authenticatie vereist" });
      return;
    }
    if (!tenantId) {
      res.status(403).json({ error: "Geen actieve tenant-koppeling" });
      return;
    }

    if (req.supportAccess) {
      const allowedBySupportGrant = isSupportRuntimePermission(resource, action);
      await auditApiSupportPermission({
        userId,
        tenantId,
        grantId: req.supportAccess.grantId,
        resource,
        action,
        allowed: allowedBySupportGrant,
        reason: req.supportAccess.reason,
        expiresAt: req.supportAccess.expiresAt,
      });

      if (!allowedBySupportGrant) {
        req.log.warn({ userId, tenantId, resource, action }, "Supporttoegang geweigerd");
        res.status(403).json({ error: "Supporttoegang staat deze actie niet toe" });
        return;
      }

      if (!(await requireEnabledPermissionModule(req, res, resource, tenantId))) return;

      next();
      return;
    }

    const permissions = await getUserPermissions(userId, tenantId);
    if (!permissions.has(`${resource}:${action}`)) {
      req.log.warn({ userId, tenantId, resource, action }, "Toegang geweigerd");
      res.status(403).json({ error: "Onvoldoende rechten" });
      return;
    }

    if (!(await requireEnabledPermissionModule(req, res, resource, tenantId))) return;

    next();
  };
}

type ApiHostTenantResolution =
  | { kind: "tenant"; tenantId: string }
  | { kind: "platform" }
  | { kind: "blocked" }
  | { kind: "none" };

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function firstForwardedValue(value: string): string {
  return value.split(",")[0]?.trim() ?? "";
}

function requestHost(req: Request): string {
  return firstForwardedValue(headerValue(req.headers["x-forwarded-host"])) || headerValue(req.headers.host);
}

function requestedTenantId(req: Request): string {
  return (
    headerValue(req.headers["x-fieldgrid-tenant-id"]) ||
    headerValue(req.headers["x-tenant-id"])
  ).trim();
}

async function resolveTenantByHost(host: string): Promise<ApiHostTenantResolution> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return { kind: "none" };
  if (isPlatformHost(normalizedHost)) return { kind: "platform" };

  const [tenant] = await db
    .select({ tenantId: tenantsTable.id })
    .from(tenantDomainsTable)
    .innerJoin(tenantsTable, eq(tenantDomainsTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(tenantDomainsTable.domain, normalizedHost),
        inArray(tenantDomainsTable.verificationStatus, ["verified", "active"]),
        ne(tenantDomainsTable.type, "platform_reserved"),
        eq(tenantsTable.isActive, true),
        inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
      ),
    )
    .limit(1);

  if (tenant) return { kind: "tenant", tenantId: tenant.tenantId };
  if (isFieldgridSubdomain(normalizedHost)) return { kind: "blocked" };
  return { kind: "none" };
}

async function userHasActiveTenant(userId: string, tenantId: string): Promise<boolean> {
  const [tenantUser] = await db
    .select({ tenantId: tenantUsersTable.tenantId })
    .from(tenantUsersTable)
    .innerJoin(tenantsTable, eq(tenantUsersTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(tenantUsersTable.userId, userId),
        eq(tenantUsersTable.tenantId, tenantId),
        eq(tenantUsersTable.status, "active"),
        eq(tenantsTable.isActive, true),
        inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
      ),
    )
    .limit(1);

  return Boolean(tenantUser);
}

async function firstActiveTenantForUser(userId: string): Promise<string | null> {
  const [tenantUser] = await db
    .select({ tenantId: tenantUsersTable.tenantId })
    .from(tenantUsersTable)
    .innerJoin(tenantsTable, eq(tenantUsersTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(tenantUsersTable.userId, userId),
        eq(tenantUsersTable.status, "active"),
        eq(tenantsTable.isActive, true),
        inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
      ),
    )
    .limit(1);

  return tenantUser?.tenantId ?? null;
}

function attachSupportAccess(req: Request, supportAccess: Awaited<ReturnType<typeof getActiveSupportAccessForUser>>): void {
  if (!supportAccess) return;

  req.supportAccess = {
    grantId: supportAccess.grant.id,
    platformUserId: supportAccess.platformUser.id,
    reason: supportAccess.grant.reason,
    expiresAt: supportAccess.grant.expiresAt.toISOString(),
    priority: FIELDGRID_RUNTIME_ACCESS_PRIORITY[1],
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

  const hostResolution = await resolveTenantByHost(requestHost(req));
  if (hostResolution.kind === "tenant") {
    if (await userHasActiveTenant(userId, hostResolution.tenantId)) {
      req.tenantId = hostResolution.tenantId;
      next();
      return;
    }

    req.log.warn({ userId, tenantId: hostResolution.tenantId }, "Geen actieve tenant-koppeling voor API-host");
    res.status(403).json({ error: "Geen actieve tenant-koppeling voor deze host" });
    return;
  }

  if (hostResolution.kind === "blocked") {
    req.log.warn({ userId, host: requestHost(req) }, "Onbekende of inactieve Fieldgrid tenant-host");
    res.status(404).json({ error: "Tenant niet gevonden" });
    return;
  }

  const explicitTenantId = requestedTenantId(req);
  if (explicitTenantId) {
    if (hostResolution.kind === "platform") {
      const supportAccess = await getActiveSupportAccessForUser(userId, explicitTenantId);
      if (supportAccess) {
        req.tenantId = explicitTenantId;
        attachSupportAccess(req, supportAccess);
        next();
        return;
      }
    }

    if (await userHasActiveTenant(userId, explicitTenantId)) {
      req.tenantId = explicitTenantId;
      next();
      return;
    }

    req.log.warn({ userId, tenantId: explicitTenantId }, "Ongeldige expliciete tenantcontext voor API-verzoek");
    res.status(403).json({ error: "Geen actieve tenant-koppeling" });
    return;
  }

  const tenantId = await firstActiveTenantForUser(userId);
  if (!tenantId) {
    req.log.warn({ userId }, "Geen actieve tenant-koppeling voor API-verzoek");
    res.status(403).json({ error: "Geen actieve tenant-koppeling" });
    return;
  }

  req.tenantId = tenantId;
  next();
}

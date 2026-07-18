import { db } from "@workspace/db";
import {
  tenantUserRolesTable,
  tenantRolePermissionsTable,
  tenantRolesTable,
  permissionsTable,
  auditLogTable,
  getSupportRuntimePermissions,
  isTenantModuleEnabled,
  moduleForPermissionResource,
  requireTenantModule,
  resourceFromPermissionKey,
  type FieldgridModuleKey,
  type InsertAuditLog,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { createClient, createClientFromRequest } from "@/lib/supabase/server";
import {
  getCurrentTenantId,
  getCurrentTenantIdFromRequest,
} from "@/lib/auth/tenant";
import {
  getCurrentSupportMode,
  getCurrentSupportModeFromRequest,
  writeSupportAccessAuditLog,
} from "@/lib/auth/platform";

async function enabledModulesForPermissions(
  permissions: Set<string>,
  tenantId: string,
): Promise<Set<FieldgridModuleKey>> {
  const moduleKeys = new Set<FieldgridModuleKey>();
  for (const permission of permissions) {
    const moduleKey = moduleForPermissionResource(
      resourceFromPermissionKey(permission),
    );
    if (moduleKey) moduleKeys.add(moduleKey);
  }

  if (moduleKeys.size === 0) return new Set();

  const enabledEntries = await Promise.all(
    [...moduleKeys].map(
      async (moduleKey) =>
        [moduleKey, await isTenantModuleEnabled(tenantId, moduleKey)] as const,
    ),
  );

  return new Set(
    enabledEntries
      .filter(([, enabled]) => enabled)
      .map(([moduleKey]) => moduleKey),
  );
}

async function hasEnabledPermissionModule(resource: string): Promise<boolean> {
  const moduleKey = moduleForPermissionResource(resource);
  if (!moduleKey) return true;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return false;

  return isTenantModuleEnabled(tenantId, moduleKey);
}

async function hasEnabledPermissionModuleForTenant(
  resource: string,
  tenantId: string,
): Promise<boolean> {
  const moduleKey = moduleForPermissionResource(resource);
  if (!moduleKey) return true;

  return isTenantModuleEnabled(tenantId, moduleKey);
}

async function requireEnabledPermissionModule(resource: string): Promise<void> {
  const moduleKey = moduleForPermissionResource(resource);
  if (!moduleKey) return;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    throw new Error(`Forbidden: ${resource}`);
  }

  await requireTenantModule(tenantId, moduleKey);
}

async function auditCurrentSupportPermission(
  resource: string,
  action: string,
  allowed: boolean,
): Promise<void> {
  const supportMode = await getCurrentSupportMode();
  if (!supportMode) return;

  await writeSupportAccessAuditLog({
    tenantId: supportMode.tenantId,
    action: allowed
      ? "backoffice_permission_allowed"
      : "backoffice_permission_denied",
    resource,
    metadata: {
      permission: `${resource}:${action}`,
      priority: supportMode.priority,
      grantId: supportMode.grantId,
      reason: supportMode.reason,
      expiresAt: supportMode.expiresAt,
    },
  });
}

/** Fetch all permission keys for a given Supabase Auth user UUID within one tenant. */
export async function getUserPermissions(
  userId: string,
  tenantId: string,
): Promise<Set<string>> {
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
    .innerJoin(
      tenantRolesTable,
      eq(tenantRolePermissionsTable.tenantRoleId, tenantRolesTable.id),
    )
    .innerJoin(
      permissionsTable,
      eq(tenantRolePermissionsTable.permissionId, permissionsTable.id),
    )
    .where(
      and(
        inArray(tenantRolePermissionsTable.tenantRoleId, tenantRoleIds),
        eq(tenantRolesTable.tenantId, tenantId),
      ),
    );

  return new Set(perms.map((p) => `${p.resource}:${p.action}`));
}

/** Fetch runtime permissions after tenant module entitlements are applied. */
export async function getEffectiveUserPermissions(
  userId: string,
  tenantId: string,
): Promise<Set<string>> {
  const permissions = await getUserPermissions(userId, tenantId);
  if (permissions.size === 0) return permissions;

  const enabledModules = await enabledModulesForPermissions(
    permissions,
    tenantId,
  );
  return new Set(
    [...permissions].filter((permission) => {
      const moduleKey = moduleForPermissionResource(
        resourceFromPermissionKey(permission),
      );
      return !moduleKey || enabledModules.has(moduleKey);
    }),
  );
}

/** Fetch all role names for a given Supabase Auth user UUID within one tenant. */
export async function getUserRoles(
  userId: string,
  tenantId: string,
): Promise<string[]> {
  const rows = await db
    .select({ name: tenantRolesTable.name })
    .from(tenantUserRolesTable)
    .innerJoin(
      tenantRolesTable,
      eq(tenantUserRolesTable.tenantRoleId, tenantRolesTable.id),
    )
    .where(
      and(
        eq(tenantUserRolesTable.userId, userId),
        eq(tenantUserRolesTable.tenantId, tenantId),
      ),
    );

  return rows.map((r) => r.name);
}

/**
 * Get permissions for the currently authenticated user (server-side).
 * Returns an empty set if there is no session or tenant - never falls back to guest access.
 */
export async function getCurrentUserPermissions(): Promise<Set<string>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return new Set();

  const supportMode = await getCurrentSupportMode();
  if (supportMode?.tenantId === tenantId) {
    return getSupportRuntimePermissions({ permissionKeys: supportMode.permissionKeys });
  }

  return getUserPermissions(user.id, tenantId);
}

export async function getCurrentUserPermissionsFromRequest(
  request: Request,
): Promise<Set<string>> {
  const supabase = createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const tenantId = await getCurrentTenantIdFromRequest(request);
  if (!tenantId) return new Set();

  const supportMode = await getCurrentSupportModeFromRequest(request);
  if (supportMode?.tenantId === tenantId) {
    return getSupportRuntimePermissions({ permissionKeys: supportMode.permissionKeys });
  }

  return getUserPermissions(user.id, tenantId);
}

export async function getCurrentEffectiveUserPermissions(): Promise<
  Set<string>
> {
  const permissions = await getCurrentUserPermissions();
  if (permissions.size === 0) return permissions;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return new Set();

  const enabledModules = await enabledModulesForPermissions(
    permissions,
    tenantId,
  );
  return new Set(
    [...permissions].filter((permission) => {
      const moduleKey = moduleForPermissionResource(
        resourceFromPermissionKey(permission),
      );
      return !moduleKey || enabledModules.has(moduleKey);
    }),
  );
}

/**
 * Server-side permission check.
 * Use in Server Components or Server Actions to gate functionality.
 */
export async function hasPermission(
  resource: string,
  action: string,
): Promise<boolean> {
  const permissions = await getCurrentUserPermissions();
  const allowed =
    permissions.has(`${resource}:${action}`) &&
    (await hasEnabledPermissionModule(resource));
  await auditCurrentSupportPermission(resource, action, allowed);
  return allowed;
}

export async function hasPermissionFromRequest(
  request: Request,
  resource: string,
  action: string,
): Promise<boolean> {
  const tenantId = await getCurrentTenantIdFromRequest(request);
  if (!tenantId) return false;

  const permissions = await getCurrentUserPermissionsFromRequest(request);
  return (
    permissions.has(`${resource}:${action}`) &&
    (await hasEnabledPermissionModuleForTenant(resource, tenantId))
  );
}

/**
 * Require a permission - throws if the current user does not have it.
 * Use at the top of sensitive Server Actions.
 */
export async function requirePermission(
  resource: string,
  action: string,
): Promise<void> {
  const permissions = await getCurrentUserPermissions();
  if (!permissions.has(`${resource}:${action}`)) {
    await auditCurrentSupportPermission(resource, action, false);
    throw new Error(`Forbidden: ${resource}:${action}`);
  }

  try {
    await requireEnabledPermissionModule(resource);
    await auditCurrentSupportPermission(resource, action, true);
  } catch (error) {
    await auditCurrentSupportPermission(resource, action, false);
    throw error;
  }
}

/** Write one row to the audit_log table. Never throws - errors are logged but not surfaced. */
export async function writeAuditLog(entry: InsertAuditLog): Promise<void> {
  try {
    await db.insert(auditLogTable).values(entry);
  } catch (e) {
    // Audit log failure must NOT break the calling operation, but it must be visible.
    console.error("[audit_log] Failed to write entry:", entry, e);
  }
}

import { db } from "@workspace/db";
import {
  tenantUserRolesTable,
  tenantRolePermissionsTable,
  tenantRolesTable,
  permissionsTable,
  auditLogTable,
  type InsertAuditLog,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth/tenant";

/** Fetch all permission keys for a given Supabase Auth user UUID within one tenant. */
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

/** Fetch all role names for a given Supabase Auth user UUID within one tenant. */
export async function getUserRoles(userId: string, tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ name: tenantRolesTable.name })
    .from(tenantUserRolesTable)
    .innerJoin(tenantRolesTable, eq(tenantUserRolesTable.tenantRoleId, tenantRolesTable.id))
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return new Set();

  return getUserPermissions(user.id, tenantId);
}

/**
 * Server-side permission check.
 * Use in Server Components or Server Actions to gate functionality.
 */
export async function hasPermission(resource: string, action: string): Promise<boolean> {
  const permissions = await getCurrentUserPermissions();
  return permissions.has(`${resource}:${action}`);
}

/**
 * Require a permission - throws if the current user does not have it.
 * Use at the top of sensitive Server Actions.
 */
export async function requirePermission(resource: string, action: string): Promise<void> {
  const allowed = await hasPermission(resource, action);
  if (!allowed) {
    throw new Error(`Forbidden: ${resource}:${action}`);
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

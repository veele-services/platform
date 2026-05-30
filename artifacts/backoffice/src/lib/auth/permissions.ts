import { db } from "@workspace/db";
import {
  userRolesTable,
  rolePermissionsTable,
  permissionsTable,
  rolesTable,
  auditLogTable,
  type InsertAuditLog,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

/** Fetch all permission keys for a given Supabase Auth user UUID. */
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

/** Fetch all role names for a given Supabase Auth user UUID. */
export async function getUserRoles(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: rolesTable.name })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, userId));

  return rows.map((r) => r.name);
}

/**
 * Get permissions for the currently authenticated user (server-side).
 * Returns an empty set if there is no session — never falls back to guest access.
 */
export async function getCurrentUserPermissions(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();
  return getUserPermissions(user.id);
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
 * Require a permission — throws if the current user does not have it.
 * Use at the top of sensitive Server Actions.
 */
export async function requirePermission(resource: string, action: string): Promise<void> {
  const allowed = await hasPermission(resource, action);
  if (!allowed) {
    throw new Error(`Forbidden: ${resource}:${action}`);
  }
}

/** Write one row to the audit_log table. Never throws — errors are logged but not surfaced. */
export async function writeAuditLog(entry: InsertAuditLog): Promise<void> {
  try {
    await db.insert(auditLogTable).values(entry);
  } catch (e) {
    // Audit log failure must NOT break the calling operation, but it must be visible.
    console.error("[audit_log] Failed to write entry:", entry, e);
  }
}

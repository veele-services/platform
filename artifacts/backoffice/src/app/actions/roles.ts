"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@workspace/db";
import { userRolesTable, auditLogTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

/**
 * Assign a role to a user.
 *
 * Requires:  roles:write permission  (Management only in base config)
 * Audit log: mandatory — operation is rolled back if insert fails.
 */
export async function assignUserRole(
  userId: string,
  roleId: string,
): Promise<void> {
  await requirePermission("roles", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");

  // Insert the role membership.
  await db
    .insert(userRolesTable)
    .values({ userId, roleId })
    .onConflictDoNothing();

  // Mandatory audit log — roll back role assignment if insert fails.
  try {
    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "role_assign",
      resource:   "users",
      resourceId: userId,
      metadata:   { roleId, assignedBy: user.id },
    });
  } catch (auditError) {
    // Compensate: remove the just-inserted role membership.
    await db
      .delete(userRolesTable)
      .where(
        and(
          eq(userRolesTable.userId, userId),
          eq(userRolesTable.roleId, roleId),
        ),
      );
    throw new Error(
      "Failed to record role assignment. The operation was rolled back.",
    );
  }
}

/**
 * Remove a role from a user.
 *
 * Requires:  roles:write permission  (Management only in base config)
 * Audit log: mandatory — operation is rolled back if insert fails.
 */
export async function removeUserRole(
  userId: string,
  roleId: string,
): Promise<void> {
  await requirePermission("roles", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");

  // Delete the role membership.
  const deleted = await db
    .delete(userRolesTable)
    .where(
      and(
        eq(userRolesTable.userId, userId),
        eq(userRolesTable.roleId, roleId),
      ),
    )
    .returning();

  // Mandatory audit log — re-insert the row if audit fails.
  try {
    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "role_remove",
      resource:   "users",
      resourceId: userId,
      metadata:   { roleId, removedBy: user.id },
    });
  } catch (auditError) {
    // Compensate: restore the deleted role membership.
    if (deleted.length > 0) {
      await db.insert(userRolesTable).values({ userId, roleId }).onConflictDoNothing();
    }
    throw new Error(
      "Failed to record role removal. The operation was rolled back.",
    );
  }
}

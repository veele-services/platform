"use server";

import { db } from "@workspace/db";
import {
  auditLogTable,
  permissionsTable,
  personnelTable,
  rolePermissionsTable,
  rolesTable,
  tenantRolePermissionsTable,
  tenantRolesTable,
  tenantUserRolesTable,
  tenantUsersTable,
} from "@workspace/db";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { getTenantPlanCapabilities } from "@/lib/tenant-plan";
import { provisionPortalUserForActivation } from "@/lib/auth/portal-invites";
import { backofficeUrl } from "@/lib/email";
import type { ActionResult } from "./customers";

export type TenantPermissionItem = {
  id: string;
  resource: string;
  action: string;
  description: string | null;
};

export type TenantRoleRow = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isCustom: boolean;
  userCount: number;
  permCount: number;
};

export type TenantRoleDetail = TenantRoleRow & {
  permissions: TenantPermissionItem[];
  allPermissions: TenantPermissionItem[];
};

export type TenantUserRoleRow = {
  userId: string;
  name: string | null;
  email: string;
  roles: string[];
  roleIds: string[];
  status: "actief" | "uitgenodigd" | "inactief";
  createdAt: string;
  lastSignInAt: string | null;
};

async function requireCustomRolesEnabled(): Promise<ActionResult | null> {
  const capabilities = await getTenantPlanCapabilities();
  if (!capabilities.customRoles) {
    return {
      success: false,
      message: `Custom rollen zijn niet beschikbaar in het huidige tenantplan (${capabilities.plan}).`,
    };
  }
  return null;
}

export async function listTenantRoles(): Promise<TenantRoleRow[]> {
  await requirePermission("roles", "read");
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({
      id: tenantRolesTable.id,
      name: tenantRolesTable.name,
      description: tenantRolesTable.description,
      isSystem: tenantRolesTable.isSystem,
      isCustom: tenantRolesTable.isCustom,
      userCount: sql<number>`(
        SELECT COUNT(*)
        FROM tenant_user_roles tur
        WHERE tur.tenant_id = ${tenantId}
          AND tur.tenant_role_id = ${tenantRolesTable.id}
      )::int`,
      permCount: sql<number>`(
        SELECT COUNT(*)
        FROM tenant_role_permissions trp
        WHERE trp.tenant_role_id = ${tenantRolesTable.id}
      )::int`,
    })
    .from(tenantRolesTable)
    .where(eq(tenantRolesTable.tenantId, tenantId))
    .orderBy(asc(tenantRolesTable.name));

  return rows;
}

export async function getTenantRole(roleId: string): Promise<TenantRoleDetail | null> {
  await requirePermission("roles", "read");
  const tenantId = await requireCurrentTenantId();

  const [role] = await db
    .select({
      id: tenantRolesTable.id,
      name: tenantRolesTable.name,
      description: tenantRolesTable.description,
      isSystem: tenantRolesTable.isSystem,
      isCustom: tenantRolesTable.isCustom,
    })
    .from(tenantRolesTable)
    .where(and(eq(tenantRolesTable.id, roleId), eq(tenantRolesTable.tenantId, tenantId)))
    .limit(1);

  if (!role) return null;

  const [allPerms, rolePermRows] = await Promise.all([
    db
      .select()
      .from(permissionsTable)
      .orderBy(asc(permissionsTable.resource), asc(permissionsTable.action)),
    db
      .select({ permissionId: tenantRolePermissionsTable.permissionId })
      .from(tenantRolePermissionsTable)
      .where(eq(tenantRolePermissionsTable.tenantRoleId, roleId)),
  ]);

  const enabledIds = new Set(rolePermRows.map((row) => row.permissionId));
  const permissions = allPerms.map((permission) => ({
    id: permission.id,
    resource: permission.resource,
    action: permission.action,
    description: permission.description,
  }));

  return {
    ...role,
    userCount: 0,
    permCount: enabledIds.size,
    allPermissions: permissions,
    permissions: permissions.filter((permission) => enabledIds.has(permission.id)),
  };
}

export async function createTenantRole(input: {
  name: string;
  description: string | null;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission("roles", "write");
  const tenantId = await requireCurrentTenantId();
  const planBlock = await requireCustomRolesEnabled();
  if (planBlock) return planBlock;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const name = input.name.trim();
  if (!name) return { success: false, message: "Naam is verplicht." };

  const [existing] = await db
    .select({ id: tenantRolesTable.id })
    .from(tenantRolesTable)
    .where(and(eq(tenantRolesTable.tenantId, tenantId), eq(tenantRolesTable.name, name)))
    .limit(1);

  if (existing) return { success: false, message: "Er bestaat al een rol met deze naam." };

  const [inserted] = await db
    .insert(tenantRolesTable)
    .values({
      tenantId,
      name,
      description: input.description?.trim() || null,
      isSystem: false,
      isCustom: true,
    })
    .returning({ id: tenantRolesTable.id });

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "create",
    resource: "tenant_roles",
    resourceId: inserted.id,
    metadata: { tenantId, name },
  });

  revalidatePath("/instellingen/rollen");
  return { success: true, data: { id: inserted.id } };
}

export async function updateTenantRole(input: {
  id: string;
  name: string;
  description: string | null;
}): Promise<ActionResult> {
  await requirePermission("roles", "write");
  const tenantId = await requireCurrentTenantId();
  const planBlock = await requireCustomRolesEnabled();
  if (planBlock) return planBlock;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const name = input.name.trim();
  if (!name) return { success: false, message: "Naam is verplicht." };

  const [role] = await db
    .select({ id: tenantRolesTable.id, isSystem: tenantRolesTable.isSystem })
    .from(tenantRolesTable)
    .where(and(eq(tenantRolesTable.id, input.id), eq(tenantRolesTable.tenantId, tenantId)))
    .limit(1);

  if (!role) return { success: false, message: "Rol niet gevonden." };
  if (role.isSystem) {
    return { success: false, message: "Systeemrollen kunnen niet als custom rol worden gewijzigd." };
  }

  const [duplicate] = await db
    .select({ id: tenantRolesTable.id })
    .from(tenantRolesTable)
    .where(
      and(
        eq(tenantRolesTable.tenantId, tenantId),
        eq(tenantRolesTable.name, name),
        sql`${tenantRolesTable.id} <> ${input.id}`,
      ),
    )
    .limit(1);

  if (duplicate) return { success: false, message: "Er bestaat al een rol met deze naam." };

  await db
    .update(tenantRolesTable)
    .set({ name, description: input.description?.trim() || null, updatedAt: new Date() })
    .where(and(eq(tenantRolesTable.id, input.id), eq(tenantRolesTable.tenantId, tenantId)));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update",
    resource: "tenant_roles",
    resourceId: input.id,
    metadata: { tenantId, name },
  });

  revalidatePath("/instellingen/rollen");
  revalidatePath(`/instellingen/rollen/${input.id}`);
  return { success: true };
}

export async function updateTenantRolePermissions(
  roleId: string,
  permissionIds: string[],
): Promise<ActionResult> {
  await requirePermission("roles", "write");
  const tenantId = await requireCurrentTenantId();

  const [role] = await db
    .select({ isSystem: tenantRolesTable.isSystem })
    .from(tenantRolesTable)
    .where(and(eq(tenantRolesTable.id, roleId), eq(tenantRolesTable.tenantId, tenantId)))
    .limit(1);

  if (!role) return { success: false, message: "Rol niet gevonden." };
  if (!role.isSystem) {
    const planBlock = await requireCustomRolesEnabled();
    if (planBlock) return planBlock;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db.delete(tenantRolePermissionsTable).where(eq(tenantRolePermissionsTable.tenantRoleId, roleId));

  const uniquePermissionIds = [...new Set(permissionIds.filter(Boolean))];
  if (uniquePermissionIds.length > 0) {
    await db
      .insert(tenantRolePermissionsTable)
      .values(uniquePermissionIds.map((permissionId) => ({ tenantRoleId: roleId, permissionId })))
      .onConflictDoNothing();
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update_permissions",
    resource: "tenant_roles",
    resourceId: roleId,
    metadata: { tenantId, permissionCount: uniquePermissionIds.length },
  });

  revalidatePath(`/instellingen/rollen/${roleId}`);
  return { success: true };
}

export async function deleteTenantRole(roleId: string): Promise<ActionResult> {
  await requirePermission("roles", "write");
  const tenantId = await requireCurrentTenantId();
  const planBlock = await requireCustomRolesEnabled();
  if (planBlock) return planBlock;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [role] = await db
    .select({ id: tenantRolesTable.id, name: tenantRolesTable.name, isSystem: tenantRolesTable.isSystem })
    .from(tenantRolesTable)
    .where(and(eq(tenantRolesTable.id, roleId), eq(tenantRolesTable.tenantId, tenantId)))
    .limit(1);

  if (!role) return { success: false, message: "Rol niet gevonden." };
  if (role.isSystem) return { success: false, message: "Systeemrollen kunnen niet worden verwijderd." };

  const [{ userCount }] = await db
    .select({ userCount: sql<number>`count(*)::int` })
    .from(tenantUserRolesTable)
    .leftJoin(personnelTable, eq(personnelTable.userId, tenantUserRolesTable.userId))
    .where(
      and(
        eq(tenantUserRolesTable.tenantId, tenantId),
        eq(tenantUserRolesTable.tenantRoleId, roleId),
        or(sql`${personnelTable.isActive} IS NULL`, eq(personnelTable.isActive, true)),
      ),
    );

  if (userCount > 0) {
    return {
      success: false,
      message: `Rol heeft ${userCount} actieve gebruiker${userCount !== 1 ? "s" : ""}. Herken eerst de gebruikers.`,
    };
  }

  await db.delete(tenantRolePermissionsTable).where(eq(tenantRolePermissionsTable.tenantRoleId, roleId));
  await db.delete(tenantRolesTable).where(and(eq(tenantRolesTable.id, roleId), eq(tenantRolesTable.tenantId, tenantId)));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "delete",
    resource: "tenant_roles",
    resourceId: roleId,
    metadata: { tenantId, name: role.name },
  });

  revalidatePath("/instellingen/rollen");
  return { success: true };
}

export async function resetTenantSystemRolesToTemplates(): Promise<ActionResult> {
  await requirePermission("roles", "delete");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [tenantRoles, permissions] = await Promise.all([
    db
      .select({
        id: tenantRolesTable.id,
        name: tenantRolesTable.name,
        templateRoleId: tenantRolesTable.templateRoleId,
      })
      .from(tenantRolesTable)
      .where(and(eq(tenantRolesTable.tenantId, tenantId), eq(tenantRolesTable.isSystem, true))),
    db.select({ id: permissionsTable.id }).from(permissionsTable),
  ]);

  const allPermissionIds = permissions.map((permission) => permission.id);

  for (const role of tenantRoles) {
    await db.delete(tenantRolePermissionsTable).where(eq(tenantRolePermissionsTable.tenantRoleId, role.id));

    const templatePermissionRows = role.templateRoleId
      ? await db
          .select({ permissionId: rolePermissionsTable.permissionId })
          .from(rolePermissionsTable)
          .where(eq(rolePermissionsTable.roleId, role.templateRoleId))
      : [];

    const permissionIds = templatePermissionRows.length > 0
      ? templatePermissionRows.map((row) => row.permissionId)
      : role.name === "Management" || role.name === "Eigenaar"
        ? allPermissionIds
        : [];

    if (permissionIds.length > 0) {
      await db
        .insert(tenantRolePermissionsTable)
        .values(permissionIds.map((permissionId) => ({ tenantRoleId: role.id, permissionId })))
        .onConflictDoNothing();
    }
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "reset_defaults",
    resource: "tenant_roles",
    resourceId: null,
    metadata: { tenantId, roles: tenantRoles.map((role) => role.name) },
  });

  revalidatePath("/instellingen/rollen");
  return { success: true };
}

export async function listTenantUsersWithRoles(): Promise<TenantUserRoleRow[]> {
  await requirePermission("users", "read");
  const tenantId = await requireCurrentTenantId();

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`Kan gebruikers niet ophalen: ${error.message}`);

  const authUsers = data.users;
  const userIds = authUsers.map((user) => user.id);
  if (userIds.length === 0) return [];

  const tenantUsers = await db
    .select({
      userId: tenantUsersTable.userId,
      tenantStatus: tenantUsersTable.status,
      createdAt: tenantUsersTable.createdAt,
    })
    .from(tenantUsersTable)
    .where(and(eq(tenantUsersTable.tenantId, tenantId), inArray(tenantUsersTable.userId, userIds)));

  const visibleUserIds = tenantUsers.map((tenantUser) => tenantUser.userId);
  if (visibleUserIds.length === 0) return [];

  const roleRows = await db
    .select({
      userId: tenantUserRolesTable.userId,
      roleId: tenantRolesTable.id,
      roleName: tenantRolesTable.name,
    })
    .from(tenantUserRolesTable)
    .innerJoin(tenantRolesTable, eq(tenantUserRolesTable.tenantRoleId, tenantRolesTable.id))
    .where(and(eq(tenantUserRolesTable.tenantId, tenantId), inArray(tenantUserRolesTable.userId, visibleUserIds)));

  const tenantUserById = new Map(
    tenantUsers.map((tenantUser) => [tenantUser.userId, tenantUser]),
  );

  const rolesByUser = new Map<string, { names: string[]; ids: string[] }>();
  for (const row of roleRows) {
    const existing = rolesByUser.get(row.userId) ?? { names: [], ids: [] };
    existing.names.push(row.roleName);
    existing.ids.push(row.roleId);
    rolesByUser.set(row.userId, existing);
  }

  return authUsers
    .filter((authUser) => tenantUserById.has(authUser.id))
    .map((authUser) => {
    const tenantUser = tenantUserById.get(authUser.id);
    let status: TenantUserRoleRow["status"] = "actief";
    if (tenantUser?.tenantStatus && tenantUser.tenantStatus !== "active") {
      status = "inactief";
    } else if (authUser.app_metadata?.credential_activation_pending === true || !authUser.confirmed_at) {
      status = "uitgenodigd";
    } else if (authUser.banned_until && new Date(authUser.banned_until) > new Date()) {
      status = "inactief";
    }

    const meta = authUser.user_metadata as Record<string, unknown> | undefined;
    const name = (meta?.["full_name"] ?? meta?.["name"] ?? null) as string | null;

    return {
      userId: authUser.id,
      name,
      email: authUser.email ?? "",
      roles: rolesByUser.get(authUser.id)?.names ?? [],
      roleIds: rolesByUser.get(authUser.id)?.ids ?? [],
      status,
      createdAt: tenantUser?.createdAt?.toISOString() ?? authUser.created_at,
      lastSignInAt: authUser.last_sign_in_at ?? null,
    };
  })
    .sort((a, b) => {
      const nameA = (a.name ?? a.email).toLocaleLowerCase("nl-NL");
      const nameB = (b.name ?? b.email).toLocaleLowerCase("nl-NL");
      return nameA.localeCompare(nameB, "nl-NL");
    });
}

export async function updateTenantUserRoles(userId: string, roleIds: string[]): Promise<ActionResult> {
  await requirePermission("users", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (userId === user.id && roleIds.length === 0) {
    return { success: false, message: "U kunt uw eigen rollen niet volledig verwijderen." };
  }

  const uniqueRoleIds = [...new Set(roleIds.filter(Boolean))];
  if (uniqueRoleIds.length > 0) {
    const validRoles = await db
      .select({ id: tenantRolesTable.id, name: tenantRolesTable.name })
      .from(tenantRolesTable)
      .where(and(eq(tenantRolesTable.tenantId, tenantId), inArray(tenantRolesTable.id, uniqueRoleIds)));

    if (validRoles.length !== uniqueRoleIds.length) {
      return { success: false, message: "Een of meer rollen horen niet bij deze tenant." };
    }
  }

  await db
    .insert(tenantUsersTable)
    .values({ tenantId, userId, role: "member", status: "active" })
    .onConflictDoNothing();

  await db
    .delete(tenantUserRolesTable)
    .where(and(eq(tenantUserRolesTable.tenantId, tenantId), eq(tenantUserRolesTable.userId, userId)));

  if (uniqueRoleIds.length > 0) {
    await db
      .insert(tenantUserRolesTable)
      .values(uniqueRoleIds.map((tenantRoleId) => ({ tenantId, userId, tenantRoleId })))
      .onConflictDoNothing();
  }

  const assignedRoles = uniqueRoleIds.length > 0
    ? await db
        .select({ name: tenantRolesTable.name })
        .from(tenantRolesTable)
        .where(and(eq(tenantRolesTable.tenantId, tenantId), inArray(tenantRolesTable.id, uniqueRoleIds)))
    : [];

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update_roles",
    resource: "tenant_users",
    resourceId: userId,
    metadata: { tenantId, roleIds: uniqueRoleIds, roleNames: assignedRoles.map((role) => role.name) },
  });

  revalidatePath("/instellingen/gebruikers");
  return { success: true };
}

export async function inviteTenantUser(input: {
  email: string;
  roleId: string;
}): Promise<ActionResult> {
  await requirePermission("users", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const email = input.email.trim().toLowerCase();
  if (!email) return { success: false, message: "E-mailadres is verplicht." };

  const [role] = await db
    .select({ id: tenantRolesTable.id, name: tenantRolesTable.name })
    .from(tenantRolesTable)
    .where(and(eq(tenantRolesTable.id, input.roleId), eq(tenantRolesTable.tenantId, tenantId)))
    .limit(1);

  if (!role) return { success: false, message: "Rol niet gevonden voor deze tenant." };

  let invitedUserId: string;
  try {
    const invite = await provisionPortalUserForActivation({
      email,
      fullName: "",
      portal: "tenant-admin",
      tenantId,
      portalName: "Tenant backoffice",
      activationUrl: `${backofficeUrl()}/wachtwoord-vergeten?doel=activatie`,
      actorUserId: user.id,
      allowExistingActive: true,
    });
    invitedUserId = invite.user.id;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Uitnodiging mislukt." };
  }

  await db
    .insert(tenantUsersTable)
    .values({ tenantId, userId: invitedUserId, role: "member", status: "active" })
    .onConflictDoNothing();

  await db
    .insert(tenantUserRolesTable)
    .values({ tenantId, userId: invitedUserId, tenantRoleId: role.id })
    .onConflictDoNothing();

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "invite",
    resource: "tenant_users",
    resourceId: invitedUserId,
    metadata: { tenantId, email, role: role.name },
  });

  revalidatePath("/instellingen/gebruikers");
  return { success: true };
}

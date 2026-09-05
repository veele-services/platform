"use server";

import { db } from "@workspace/db";
import {
  auditLogTable,
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  tenantRolePermissionsTable,
  tenantRolesTable,
  tenantUserRolesTable,
  tenantUsersTable,
} from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
  requirePermission,
} from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { getTenantPlanCapabilities } from "@/lib/tenant-plan";
import { provisionPortalUserForActivation } from "@/lib/auth/portal-invites";
import { tenantApplicationOrigin } from "@/lib/tenant-application-origin";
import type { ActionResult } from "./customers";

export type TenantPermissionItem = {
  id: string;
  resource: string;
  action: string;
  description: string | null;
  canGrant: boolean;
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

export type TenantRolePlanCapabilities = {
  plan: string;
  customRoles: boolean;
  canResetSystemRoles: boolean;
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
  canManageRoles: boolean;
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

async function getAssignableTenantRoleIds(
  tenantId: string,
): Promise<Set<string>> {
  const actorPermissions = await getCurrentUserPermissions();
  const [roles, rolePermissions] = await Promise.all([
    db
      .select({ id: tenantRolesTable.id })
      .from(tenantRolesTable)
      .where(eq(tenantRolesTable.tenantId, tenantId)),
    db
      .select({
        roleId: tenantRolePermissionsTable.tenantRoleId,
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
      .where(eq(tenantRolesTable.tenantId, tenantId)),
  ]);

  const blockedRoleIds = new Set(
    rolePermissions
      .filter(
        ({ resource, action }) =>
          !actorPermissions.has(`${resource}:${action}`),
      )
      .map(({ roleId }) => roleId),
  );
  return new Set(
    roles
      .map(({ id }) => id)
      .filter((roleId) => !blockedRoleIds.has(roleId)),
  );
}

async function canGrantEveryPermission(): Promise<boolean> {
  const [actorPermissions, allPermissions] = await Promise.all([
    getCurrentUserPermissions(),
    db
      .select({
        resource: permissionsTable.resource,
        action: permissionsTable.action,
      })
      .from(permissionsTable),
  ]);

  return allPermissions.every(({ resource, action }) =>
    actorPermissions.has(`${resource}:${action}`),
  );
}

export async function getTenantRolePlanCapabilities(): Promise<TenantRolePlanCapabilities> {
  await requirePermission("roles", "read");
  const [{ customRoles, plan }, canDeleteRoles, canGrantAll] = await Promise.all([
    getTenantPlanCapabilities(),
    hasPermission("roles", "delete"),
    canGrantEveryPermission(),
  ]);

  return {
    plan,
    customRoles,
    canResetSystemRoles: canDeleteRoles && canGrantAll,
  };
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

export async function listAssignableTenantRoles(): Promise<TenantRoleRow[]> {
  await requirePermission("users", "write");
  const tenantId = await requireCurrentTenantId();

  const [roles, assignableRoleIds] = await Promise.all([
    db
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
      .orderBy(asc(tenantRolesTable.name)),
    getAssignableTenantRoleIds(tenantId),
  ]);

  return roles.filter((role) => assignableRoleIds.has(role.id));
}

export async function getTenantRole(
  roleId: string,
): Promise<TenantRoleDetail | null> {
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
    .where(
      and(
        eq(tenantRolesTable.id, roleId),
        eq(tenantRolesTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!role) return null;

  const [allPerms, rolePermRows, actorPermissions] = await Promise.all([
    db
      .select()
      .from(permissionsTable)
      .orderBy(asc(permissionsTable.resource), asc(permissionsTable.action)),
    db
      .select({ permissionId: tenantRolePermissionsTable.permissionId })
      .from(tenantRolePermissionsTable)
      .where(eq(tenantRolePermissionsTable.tenantRoleId, roleId)),
    getCurrentUserPermissions(),
  ]);

  const enabledIds = new Set(rolePermRows.map((row) => row.permissionId));
  const permissions = allPerms.map((permission) => ({
    id: permission.id,
    resource: permission.resource,
    action: permission.action,
    description: permission.description,
    canGrant: actorPermissions.has(
      `${permission.resource}:${permission.action}`,
    ),
  }));

  return {
    ...role,
    userCount: 0,
    permCount: enabledIds.size,
    allPermissions: permissions,
    permissions: permissions.filter((permission) =>
      enabledIds.has(permission.id),
    ),
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
    .where(
      and(
        eq(tenantRolesTable.tenantId, tenantId),
        eq(tenantRolesTable.name, name),
      ),
    )
    .limit(1);

  if (existing)
    return { success: false, message: "Er bestaat al een rol met deze naam." };

  const inserted = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(tenantRolesTable)
      .values({
        tenantId,
        name,
        description: input.description?.trim() || null,
        isSystem: false,
        isCustom: true,
      })
      .returning({ id: tenantRolesTable.id });

    await tx.insert(auditLogTable).values({
      tenantId,
      userId: user.id,
      action: "create",
      resource: "tenant_roles",
      resourceId: created.id,
      metadata: { tenantId, name },
    });

    return created;
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
    .where(
      and(
        eq(tenantRolesTable.id, input.id),
        eq(tenantRolesTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!role) return { success: false, message: "Rol niet gevonden." };
  if (role.isSystem) {
    return {
      success: false,
      message: "Systeemrollen kunnen niet als custom rol worden gewijzigd.",
    };
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

  if (duplicate)
    return { success: false, message: "Er bestaat al een rol met deze naam." };

  await db.transaction(async (tx) => {
    await tx
      .update(tenantRolesTable)
      .set({
        name,
        description: input.description?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantRolesTable.id, input.id),
          eq(tenantRolesTable.tenantId, tenantId),
        ),
      );

    await tx.insert(auditLogTable).values({
      tenantId,
      userId: user.id,
      action: "update",
      resource: "tenant_roles",
      resourceId: input.id,
      metadata: { tenantId, name },
    });
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
    .where(
      and(
        eq(tenantRolesTable.id, roleId),
        eq(tenantRolesTable.tenantId, tenantId),
      ),
    )
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

  const uniquePermissionIds = [...new Set(permissionIds.filter(Boolean))];
  if (uniquePermissionIds.length > 0) {
    const [validPermissions, actorPermissions] = await Promise.all([
      db
        .select({
          id: permissionsTable.id,
          resource: permissionsTable.resource,
          action: permissionsTable.action,
        })
        .from(permissionsTable)
        .where(inArray(permissionsTable.id, uniquePermissionIds)),
      getCurrentUserPermissions(),
    ]);
    if (validPermissions.length !== uniquePermissionIds.length) {
      return { success: false, message: "Een of meer permissies bestaan niet." };
    }
    if (
      validPermissions.some(
        ({ resource, action }) =>
          !actorPermissions.has(`${resource}:${action}`),
      )
    ) {
      return {
        success: false,
        message: "U kunt geen rechten toekennen die u zelf niet heeft.",
      };
    }
  }

  await db.transaction(async (tx) => {
    const [lockedRole] = await tx
      .select({ id: tenantRolesTable.id })
      .from(tenantRolesTable)
      .where(
        and(
          eq(tenantRolesTable.id, roleId),
          eq(tenantRolesTable.tenantId, tenantId),
        ),
      )
      .for("update")
      .limit(1);
    if (!lockedRole) throw new Error("Rol bestaat niet meer.");

    await tx
      .delete(tenantRolePermissionsTable)
      .where(eq(tenantRolePermissionsTable.tenantRoleId, roleId));

    if (uniquePermissionIds.length > 0) {
      await tx
        .insert(tenantRolePermissionsTable)
        .values(
          uniquePermissionIds.map((permissionId) => ({
            tenantRoleId: roleId,
            permissionId,
          })),
        )
        .onConflictDoNothing();
    }

    await tx.insert(auditLogTable).values({
      tenantId,
      userId: user.id,
      action: "update_permissions",
      resource: "tenant_roles",
      resourceId: roleId,
      metadata: { tenantId, permissionCount: uniquePermissionIds.length },
    });
  });

  revalidatePath(`/instellingen/rollen/${roleId}`);
  return { success: true };
}

export async function toggleTenantRolePermission(
  roleId: string,
  permissionId: string,
  enabled: boolean,
): Promise<ActionResult> {
  await requirePermission("roles", "write");
  const tenantId = await requireCurrentTenantId();

  const [[role], [permission]] = await Promise.all([
    db
      .select({ isSystem: tenantRolesTable.isSystem })
      .from(tenantRolesTable)
      .where(
        and(
          eq(tenantRolesTable.id, roleId),
          eq(tenantRolesTable.tenantId, tenantId),
        ),
      )
      .limit(1),
    db
      .select({
        id: permissionsTable.id,
        resource: permissionsTable.resource,
        action: permissionsTable.action,
      })
      .from(permissionsTable)
      .where(eq(permissionsTable.id, permissionId))
      .limit(1),
  ]);

  if (!role) return { success: false, message: "Rol niet gevonden." };
  if (!permission) return { success: false, message: "Permissie niet gevonden." };
  if (enabled) {
    const actorPermissions = await getCurrentUserPermissions();
    if (!actorPermissions.has(`${permission.resource}:${permission.action}`)) {
      return {
        success: false,
        message: "U kunt geen recht toekennen dat u zelf niet heeft.",
      };
    }
  }
  if (!role.isSystem) {
    const planBlock = await requireCustomRolesEnabled();
    if (planBlock) return planBlock;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db.transaction(async (tx) => {
    const [lockedRole] = await tx
      .select({ id: tenantRolesTable.id })
      .from(tenantRolesTable)
      .where(
        and(
          eq(tenantRolesTable.id, roleId),
          eq(tenantRolesTable.tenantId, tenantId),
        ),
      )
      .for("update")
      .limit(1);
    if (!lockedRole) throw new Error("Rol bestaat niet meer.");

    if (enabled) {
      await tx
        .insert(tenantRolePermissionsTable)
        .values({ tenantRoleId: roleId, permissionId })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(tenantRolePermissionsTable)
        .where(
          and(
            eq(tenantRolePermissionsTable.tenantRoleId, roleId),
            eq(tenantRolePermissionsTable.permissionId, permissionId),
          ),
        );
    }

    await tx.insert(auditLogTable).values({
      tenantId,
      userId: user.id,
      action: enabled ? "grant_permission" : "revoke_permission",
      resource: "tenant_roles",
      resourceId: roleId,
      metadata: { tenantId, permissionId },
    });
  });

  revalidatePath(`/instellingen/rollen/${roleId}`);
  return { success: true };
}

export async function deleteTenantRole(roleId: string): Promise<ActionResult> {
  await requirePermission("roles", "delete");
  const tenantId = await requireCurrentTenantId();
  const planBlock = await requireCustomRolesEnabled();
  if (planBlock) return planBlock;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const result = await db.transaction(async (tx): Promise<ActionResult> => {
    const [role] = await tx
      .select({
        id: tenantRolesTable.id,
        name: tenantRolesTable.name,
        isSystem: tenantRolesTable.isSystem,
      })
      .from(tenantRolesTable)
      .where(
        and(
          eq(tenantRolesTable.id, roleId),
          eq(tenantRolesTable.tenantId, tenantId),
        ),
      )
      .for("update")
      .limit(1);

    if (!role) return { success: false, message: "Rol niet gevonden." };
    if (role.isSystem) {
      return {
        success: false,
        message: "Systeemrollen kunnen niet worden verwijderd.",
      };
    }

    const [{ userCount }] = await tx
      .select({ userCount: sql<number>`count(*)::int` })
      .from(tenantUserRolesTable)
      .innerJoin(
        tenantUsersTable,
        and(
          eq(tenantUsersTable.userId, tenantUserRolesTable.userId),
          eq(tenantUsersTable.tenantId, tenantUserRolesTable.tenantId),
        ),
      )
      .where(
        and(
          eq(tenantUserRolesTable.tenantId, tenantId),
          eq(tenantUserRolesTable.tenantRoleId, roleId),
          eq(tenantUsersTable.status, "active"),
        ),
      );

    if (userCount > 0) {
      return {
        success: false,
        message: `Rol heeft ${userCount} actieve gebruiker${userCount !== 1 ? "s" : ""}. Herken eerst de gebruikers.`,
      };
    }

    await tx
      .delete(tenantRolePermissionsTable)
      .where(eq(tenantRolePermissionsTable.tenantRoleId, roleId));
    await tx
      .delete(tenantRolesTable)
      .where(
        and(
          eq(tenantRolesTable.id, roleId),
          eq(tenantRolesTable.tenantId, tenantId),
        ),
      );

    await tx.insert(auditLogTable).values({
      tenantId,
      userId: user.id,
      action: "delete",
      resource: "tenant_roles",
      resourceId: roleId,
      metadata: { tenantId, name: role.name },
    });

    return { success: true };
  });

  if (!result.success) return result;
  revalidatePath("/instellingen/rollen");
  return result;
}

export async function resetTenantSystemRolesToTemplates(): Promise<ActionResult> {
  await requirePermission("roles", "delete");
  const tenantId = await requireCurrentTenantId();
  if (!(await canGrantEveryPermission())) {
    return {
      success: false,
      message:
        "U kunt systeemrollen alleen resetten wanneer u alle resulterende rechten zelf heeft.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db.transaction(async (tx) => {
    const tenantRoles = await tx
      .select({
        id: tenantRolesTable.id,
        name: tenantRolesTable.name,
        templateRoleId: tenantRolesTable.templateRoleId,
      })
      .from(tenantRolesTable)
      .where(
        and(
          eq(tenantRolesTable.tenantId, tenantId),
          eq(tenantRolesTable.isSystem, true),
        ),
      )
      .for("update");
    const permissions = await tx
      .select({ id: permissionsTable.id })
      .from(permissionsTable);
    const allPermissionIds = permissions.map((permission) => permission.id);

    for (const role of tenantRoles) {
      await tx
        .delete(tenantRolePermissionsTable)
        .where(eq(tenantRolePermissionsTable.tenantRoleId, role.id));

      const templatePermissionRows = role.templateRoleId
        ? await tx
            .select({ permissionId: rolePermissionsTable.permissionId })
            .from(rolePermissionsTable)
            .where(eq(rolePermissionsTable.roleId, role.templateRoleId))
        : [];

      const permissionIds =
        templatePermissionRows.length > 0
          ? templatePermissionRows.map((row) => row.permissionId)
          : role.name === "Management" || role.name === "Eigenaar"
            ? allPermissionIds
            : [];

      if (permissionIds.length > 0) {
        await tx
          .insert(tenantRolePermissionsTable)
          .values(
            permissionIds.map((permissionId) => ({
              tenantRoleId: role.id,
              permissionId,
            })),
          )
          .onConflictDoNothing();
      }
    }

    await tx.insert(auditLogTable).values({
      tenantId,
      userId: user.id,
      action: "reset_defaults",
      resource: "tenant_roles",
      resourceId: null,
      metadata: { tenantId, roles: tenantRoles.map((role) => role.name) },
    });
  });

  revalidatePath("/instellingen/rollen");
  return { success: true };
}

export async function listTenantUsersWithRoles(): Promise<TenantUserRoleRow[]> {
  await requirePermission("users", "read");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  if (!currentUser) throw new Error("Niet geauthenticeerd.");

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
    .where(
      and(
        eq(tenantUsersTable.tenantId, tenantId),
        inArray(tenantUsersTable.userId, userIds),
      ),
    );

  const visibleUserIds = tenantUsers.map((tenantUser) => tenantUser.userId);
  if (visibleUserIds.length === 0) return [];

  const roleRows = await db
    .select({
      userId: tenantUserRolesTable.userId,
      roleId: tenantRolesTable.id,
      roleName: tenantRolesTable.name,
    })
    .from(tenantUserRolesTable)
    .innerJoin(
      tenantRolesTable,
      eq(tenantUserRolesTable.tenantRoleId, tenantRolesTable.id),
    )
    .where(
      and(
        eq(tenantUserRolesTable.tenantId, tenantId),
        eq(tenantRolesTable.tenantId, tenantId),
        inArray(tenantUserRolesTable.userId, visibleUserIds),
      ),
    );

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

  const assignableRoleIds = await getAssignableTenantRoleIds(tenantId);

  return authUsers
    .filter((authUser) => tenantUserById.has(authUser.id))
    .map((authUser) => {
      const tenantUser = tenantUserById.get(authUser.id);
      let status: TenantUserRoleRow["status"] = "actief";
      if (tenantUser?.tenantStatus && tenantUser.tenantStatus !== "active") {
        status = "inactief";
      } else if (
        authUser.app_metadata?.credential_activation_pending === true ||
        !authUser.confirmed_at
      ) {
        status = "uitgenodigd";
      } else if (
        authUser.banned_until &&
        new Date(authUser.banned_until) > new Date()
      ) {
        status = "inactief";
      }

      const meta = authUser.user_metadata as
        | Record<string, unknown>
        | undefined;
      const name = (meta?.["full_name"] ?? meta?.["name"] ?? null) as
        | string
        | null;
      const assignedRoles = rolesByUser.get(authUser.id) ?? {
        names: [],
        ids: [],
      };

      return {
        userId: authUser.id,
        name,
        email: authUser.email ?? "",
        roles: assignedRoles.names,
        roleIds: assignedRoles.ids,
        status,
        createdAt: tenantUser?.createdAt?.toISOString() ?? authUser.created_at,
        lastSignInAt: authUser.last_sign_in_at ?? null,
        canManageRoles:
          authUser.id !== currentUser.id &&
          assignedRoles.ids.every((roleId) => assignableRoleIds.has(roleId)),
      };
    })
    .sort((a, b) => {
      const nameA = (a.name ?? a.email).toLocaleLowerCase("nl-NL");
      const nameB = (b.name ?? b.email).toLocaleLowerCase("nl-NL");
      return nameA.localeCompare(nameB, "nl-NL");
    });
}

export async function updateTenantUserRoles(
  userId: string,
  roleIds: string[],
): Promise<ActionResult> {
  await requirePermission("users", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (userId === user.id) {
    return {
      success: false,
      message: "U kunt uw eigen rollen niet wijzigen.",
    };
  }

  const uniqueRoleIds = [...new Set(roleIds.filter(Boolean))];
  const [membership] = await db
    .select({ userId: tenantUsersTable.userId })
    .from(tenantUsersTable)
    .where(
      and(
        eq(tenantUsersTable.tenantId, tenantId),
        eq(tenantUsersTable.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    return { success: false, message: "Gebruiker is geen lid van deze tenant." };
  }
  if (uniqueRoleIds.length > 0) {
    const validRoles = await db
      .select({ id: tenantRolesTable.id, name: tenantRolesTable.name })
      .from(tenantRolesTable)
      .where(
        and(
          eq(tenantRolesTable.tenantId, tenantId),
          inArray(tenantRolesTable.id, uniqueRoleIds),
        ),
      );

    if (validRoles.length !== uniqueRoleIds.length) {
      return {
        success: false,
        message: "Een of meer rollen horen niet bij deze tenant.",
      };
    }
  }

  const [assignedRoles, currentRoleRows, assignableRoleIds] = await Promise.all([
    uniqueRoleIds.length > 0
      ? db
          .select({ name: tenantRolesTable.name })
          .from(tenantRolesTable)
          .where(
            and(
              eq(tenantRolesTable.tenantId, tenantId),
              inArray(tenantRolesTable.id, uniqueRoleIds),
            ),
          )
      : Promise.resolve([]),
    db
      .select({ roleId: tenantUserRolesTable.tenantRoleId })
      .from(tenantUserRolesTable)
      .where(
        and(
          eq(tenantUserRolesTable.tenantId, tenantId),
          eq(tenantUserRolesTable.userId, userId),
        ),
      ),
    getAssignableTenantRoleIds(tenantId),
  ]);

  if (
    uniqueRoleIds.some((roleId) => !assignableRoleIds.has(roleId)) ||
    currentRoleRows.some(({ roleId }) => !assignableRoleIds.has(roleId))
  ) {
    return {
      success: false,
      message: "U kunt alleen rollen beheren binnen uw eigen bevoegdheden.",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(tenantUserRolesTable)
      .where(
        and(
          eq(tenantUserRolesTable.tenantId, tenantId),
          eq(tenantUserRolesTable.userId, userId),
        ),
      );

    if (uniqueRoleIds.length > 0) {
      await tx
        .insert(tenantUserRolesTable)
        .values(
          uniqueRoleIds.map((tenantRoleId) => ({
            tenantId,
            userId,
            tenantRoleId,
          })),
        )
        .onConflictDoNothing();
    }

    await tx.insert(auditLogTable).values({
      tenantId,
      userId: user.id,
      action: "update_roles",
      resource: "tenant_users",
      resourceId: userId,
      metadata: {
        tenantId,
        roleIds: uniqueRoleIds,
        roleNames: assignedRoles.map((role) => role.name),
      },
    });
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
  if (user.email?.trim().toLowerCase() === email) {
    return {
      success: false,
      message: "U kunt uzelf niet uitnodigen of een rol toekennen.",
    };
  }

  const [role] = await db
    .select({ id: tenantRolesTable.id, name: tenantRolesTable.name })
    .from(tenantRolesTable)
    .where(
      and(
        eq(tenantRolesTable.id, input.roleId),
        eq(tenantRolesTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!role)
    return { success: false, message: "Rol niet gevonden voor deze tenant." };
  const assignableRoleIds = await getAssignableTenantRoleIds(tenantId);
  if (!assignableRoleIds.has(role.id)) {
    return {
      success: false,
      message: "U kunt deze rol niet toekennen vanuit uw eigen bevoegdheden.",
    };
  }

  let invite: Awaited<ReturnType<typeof provisionPortalUserForActivation>>;
  try {
    invite = await provisionPortalUserForActivation({
      email,
      fullName: "",
      portal: "tenant-admin",
      tenantId,
      portalName: "Tenant backoffice",
      activationUrl: `${await tenantApplicationOrigin(tenantId)}/admin/wachtwoord-vergeten?doel=activatie`,
      actorUserId: user.id,
      allowExistingActive: true,
    });
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Uitnodiging mislukt.",
    };
  }

  const invitedUserId = invite.user.id;
  if (invitedUserId === user.id) {
    try {
      await invite.rollback();
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "De onveilige uitnodiging kon niet volledig worden teruggedraaid.",
      };
    }
    return {
      success: false,
      message: "U kunt uzelf niet uitnodigen of een rol toekennen.",
    };
  }
  try {
    await db.transaction(async (tx) => {
      const [currentRole] = await tx
        .select({ id: tenantRolesTable.id, name: tenantRolesTable.name })
        .from(tenantRolesTable)
        .where(
          and(
            eq(tenantRolesTable.id, role.id),
            eq(tenantRolesTable.tenantId, tenantId),
          ),
        )
        .for("key share")
        .limit(1);
      if (!currentRole) throw new Error("Tenantrol bestaat niet meer.");

      await tx
        .insert(tenantUsersTable)
        .values({
          tenantId,
          userId: invitedUserId,
          role: "member",
          status: "active",
        })
        .onConflictDoNothing();

      await tx
        .insert(tenantUserRolesTable)
        .values({ tenantId, userId: invitedUserId, tenantRoleId: currentRole.id })
        .onConflictDoNothing();

      await tx.insert(auditLogTable).values({
        tenantId,
        userId: user.id,
        action: "invite",
        resource: "tenant_users",
        resourceId: invitedUserId,
        metadata: { tenantId, email, role: currentRole.name },
      });
    });
  } catch {
    try {
      await invite.rollback();
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Uitnodiging is geweigerd; handmatige controle is vereist.",
      };
    }
    return {
      success: false,
      message: "Uitnodiging kon niet veilig aan deze tenant worden gekoppeld.",
    };
  }

  revalidatePath("/instellingen/gebruikers");
  return { success: true };
}

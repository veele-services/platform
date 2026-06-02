"use server";

import { db } from "@workspace/db";
import {
  organizationSettingsTable,
  rolesTable,
  permissionsTable,
  rolePermissionsTable,
  userRolesTable,
  auditLogTable,
  personnelTable,
} from "@workspace/db";
import { eq, and, or, asc, desc, sql, inArray, ilike, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import type { ActionResult } from "./customers";

export type { ActionResult };

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrgSettings = {
  id:                 string;
  naam:               string;
  adres:              string | null;
  kvkNummer:          string | null;
  btwNummer:          string | null;
  logoUrl:            string | null;
  betaaltermijnDagen: number;
  emailAfzender:      string | null;
  notifRapportGoedgekeurd:  boolean;
  notifRapportAfgekeurd:    boolean;
  notifOfferteVerstuurd:    boolean;
  notifOfferteVerlopen:     boolean;
  notifBetalingHerinnering: boolean;
  notifHerinneringDagen:    number;
};

export type PermissionItem = {
  id:          string;
  resource:    string;
  action:      string;
  description: string | null;
};

export type RoleRow = {
  id:          string;
  name:        string;
  description: string | null;
  isSystem:    boolean;
  userCount:   number;
  permCount:   number;
};

export type RoleDetail = {
  id:             string;
  name:           string;
  description:    string | null;
  isSystem:       boolean;
  permissions:    PermissionItem[];
  allPermissions: PermissionItem[];
};

export type UserRow = {
  userId:    string;
  name:      string | null;
  email:     string;
  roles:     string[];
  roleIds:   string[];
  status:    "actief" | "uitgenodigd" | "inactief";
  createdAt: string;
};

export type AuditLogEntry = {
  id:         string;
  userId:     string;
  userEmail:  string;
  userName:   string | null;
  action:     string;
  resource:   string;
  resourceId: string | null;
  metadata:   Record<string, unknown> | null;
  createdAt:  string;
};

// ─── Organisation settings ────────────────────────────────────────────────────

export async function getOrganizationSettings(): Promise<OrgSettings | null> {
  await requirePermission("settings", "read");

  const rows = await db
    .select()
    .from(organizationSettingsTable)
    .limit(1);

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id:                 r.id,
    naam:               r.naam,
    adres:              r.adres,
    kvkNummer:          r.kvkNummer,
    btwNummer:          r.btwNummer,
    logoUrl:            r.logoUrl,
    betaaltermijnDagen: r.betaaltermijnDagen,
    emailAfzender:      r.emailAfzender,
    notifRapportGoedgekeurd:  r.notifRapportGoedgekeurd,
    notifRapportAfgekeurd:    r.notifRapportAfgekeurd,
    notifOfferteVerstuurd:    r.notifOfferteVerstuurd,
    notifOfferteVerlopen:     r.notifOfferteVerlopen,
    notifBetalingHerinnering: r.notifBetalingHerinnering,
    notifHerinneringDagen:    r.notifHerinneringDagen,
  };
}

export async function updateOrganizationSettings(data: {
  naam?:               string;
  adres?:              string | null;
  kvkNummer?:          string | null;
  btwNummer?:          string | null;
  logoUrl?:            string | null;
  betaaltermijnDagen?: number;
  emailAfzender?:      string | null;
  notifRapportGoedgekeurd?:  boolean;
  notifRapportAfgekeurd?:    boolean;
  notifOfferteVerstuurd?:    boolean;
  notifOfferteVerlopen?:     boolean;
  notifBetalingHerinnering?: boolean;
  notifHerinneringDagen?:    number;
}): Promise<ActionResult> {
  await requirePermission("settings", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .update(organizationSettingsTable)
    .set({ ...data, updatedAt: new Date(), updatedBy: user.id });

  await db.insert(auditLogTable).values({
    userId:    user.id,
    action:    "update",
    resource:  "settings",
    resourceId: "organization",
    metadata:  { fields: Object.keys(data) },
  });

  revalidatePath("/instellingen/organisatie");
  return { success: true };
}

export async function uploadOrgLogo(formData: FormData): Promise<ActionResult<{ url: string }>> {
  await requirePermission("settings", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) {
    return { success: false, message: "Geen bestand geselecteerd." };
  }

  if (file.size > 2 * 1024 * 1024) {
    return { success: false, message: "Logo mag maximaal 2 MB zijn." };
  }

  const ext   = file.name.split(".").pop() ?? "png";
  const path  = `logo.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from("org-assets")
    .upload(path, bytes, {
      contentType: file.type,
      upsert:      true,
    });

  if (error) {
    return { success: false, message: `Upload mislukt: ${error.message}` };
  }

  const { data: { publicUrl } } = supabase.storage
    .from("org-assets")
    .getPublicUrl(path);

  await db
    .update(organizationSettingsTable)
    .set({ logoUrl: publicUrl, updatedAt: new Date(), updatedBy: user.id });

  await db.insert(auditLogTable).values({
    userId:    user.id,
    action:    "update",
    resource:  "settings",
    resourceId: "organization",
    metadata:  { field: "logo_url" },
  });

  revalidatePath("/instellingen/organisatie");
  return { success: true, data: { url: publicUrl } };
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export async function listRoles(): Promise<RoleRow[]> {
  await requirePermission("roles", "read");

  const rows = await db
    .select({
      id:          rolesTable.id,
      name:        rolesTable.name,
      description: rolesTable.description,
      isSystem:    rolesTable.isSystem,
      userCount:   sql<number>`(SELECT COUNT(*) FROM user_roles WHERE role_id = ${rolesTable.id})::int`,
      permCount:   sql<number>`(SELECT COUNT(*) FROM role_permissions WHERE role_id = ${rolesTable.id})::int`,
    })
    .from(rolesTable)
    .orderBy(asc(rolesTable.name));

  return rows.map((r) => ({
    id:          r.id,
    name:        r.name,
    description: r.description,
    isSystem:    r.isSystem,
    userCount:   r.userCount,
    permCount:   r.permCount,
  }));
}

export async function getRole(id: string): Promise<RoleDetail | null> {
  await requirePermission("roles", "read");

  const [role] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.id, id))
    .limit(1);

  if (!role) return null;

  const [allPerms, rolePermRows] = await Promise.all([
    db.select().from(permissionsTable).orderBy(asc(permissionsTable.resource), asc(permissionsTable.action)),
    db
      .select({ permissionId: rolePermissionsTable.permissionId })
      .from(rolePermissionsTable)
      .where(eq(rolePermissionsTable.roleId, id)),
  ]);

  const enabledIds = new Set(rolePermRows.map((r) => r.permissionId));

  return {
    id:          role.id,
    name:        role.name,
    description: role.description,
    isSystem:    role.isSystem,
    allPermissions: allPerms.map((p) => ({
      id:          p.id,
      resource:    p.resource,
      action:      p.action,
      description: p.description,
    })),
    permissions: allPerms
      .filter((p) => enabledIds.has(p.id))
      .map((p) => ({
        id:          p.id,
        resource:    p.resource,
        action:      p.action,
        description: p.description,
      })),
  };
}

export async function createRole(data: {
  name:        string;
  description: string | null;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission("roles", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const name = data.name.trim();
  if (!name) return { success: false, message: "Naam is verplicht." };

  const existing = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.name, name))
    .limit(1);
  if (existing.length > 0) {
    return { success: false, message: "Er bestaat al een rol met deze naam." };
  }

  const [inserted] = await db
    .insert(rolesTable)
    .values({ name, description: data.description, isSystem: false })
    .returning({ id: rolesTable.id });

  await db.insert(auditLogTable).values({
    userId:    user.id,
    action:    "create",
    resource:  "roles",
    resourceId: inserted.id,
    metadata:  { name },
  });

  revalidatePath("/instellingen/rollen");
  return { success: true, data: { id: inserted.id } };
}

/**
 * Toggle a single permission on/off for a role.
 * Used by the permission matrix checkboxes for optimistic per-toggle saves.
 */
export async function toggleRolePermission(
  roleId:       string,
  permissionId: string,
  enabled:      boolean,
): Promise<ActionResult> {
  await requirePermission("roles", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (enabled) {
    await db
      .insert(rolePermissionsTable)
      .values({ roleId, permissionId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(rolePermissionsTable)
      .where(
        and(
          eq(rolePermissionsTable.roleId, roleId),
          eq(rolePermissionsTable.permissionId, permissionId),
        ),
      );
  }

  await db.insert(auditLogTable).values({
    userId:    user.id,
    action:    enabled ? "grant_permission" : "revoke_permission",
    resource:  "roles",
    resourceId: roleId,
    metadata:  { permissionId, enabled },
  });

  revalidatePath(`/instellingen/rollen/${roleId}`);
  return { success: true };
}

/**
 * Batch-replace all permissions for a role.
 * Deletes all existing role-permissions and re-inserts the provided set.
 */
export async function updateRolePermissions(
  roleId:        string,
  permissionIds: string[],
): Promise<ActionResult> {
  await requirePermission("roles", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  // Delete all existing and re-insert in a single transaction-like sequence
  await db
    .delete(rolePermissionsTable)
    .where(eq(rolePermissionsTable.roleId, roleId));

  if (permissionIds.length > 0) {
    await db
      .insert(rolePermissionsTable)
      .values(permissionIds.map((permissionId) => ({ roleId, permissionId })))
      .onConflictDoNothing();
  }

  await db.insert(auditLogTable).values({
    userId:    user.id,
    action:    "update_permissions",
    resource:  "roles",
    resourceId: roleId,
    metadata:  { permissionCount: permissionIds.length },
  });

  revalidatePath(`/instellingen/rollen/${roleId}`);
  return { success: true };
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function listUsersWithRoles(): Promise<UserRow[]> {
  await requirePermission("users", "read");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`Kan gebruikers niet ophalen: ${error.message}`);

  const authUsers = data.users;
  const userIds   = authUsers.map((u) => u.id);
  if (userIds.length === 0) return [];

  const roleRows = await db
    .select({
      userId:   userRolesTable.userId,
      roleId:   rolesTable.id,
      roleName: rolesTable.name,
    })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(inArray(userRolesTable.userId, userIds));

  const rolesByUser = new Map<string, { names: string[]; ids: string[] }>();
  for (const r of roleRows) {
    const existing = rolesByUser.get(r.userId) ?? { names: [], ids: [] };
    existing.names.push(r.roleName);
    existing.ids.push(r.roleId);
    rolesByUser.set(r.userId, existing);
  }

  return authUsers.map((u) => {
    let status: UserRow["status"] = "actief";
    if (!u.confirmed_at) status = "uitgenodigd";
    else if (u.banned_until && new Date(u.banned_until) > new Date()) status = "inactief";

    // Extract name from auth metadata (set by invite/profile update)
    const meta = u.user_metadata as Record<string, unknown> | undefined;
    const name = (meta?.full_name ?? meta?.name ?? null) as string | null;

    return {
      userId:    u.id,
      name,
      email:     u.email ?? "",
      roles:     rolesByUser.get(u.id)?.names ?? [],
      roleIds:   rolesByUser.get(u.id)?.ids ?? [],
      status,
      createdAt: u.created_at,
    };
  });
}

export async function inviteUser(data: {
  email:  string;
  roleId: string;
}): Promise<ActionResult> {
  await requirePermission("users", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const email = data.email.trim().toLowerCase();
  if (!email) return { success: false, message: "E-mailadres is verplicht." };

  const admin = createAdminClient();
  const { data: inviteData, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) {
    return { success: false, message: `Uitnodiging mislukt: ${error.message}` };
  }

  const invitedUserId = inviteData.user.id;

  await db
    .insert(userRolesTable)
    .values({ userId: invitedUserId, roleId: data.roleId })
    .onConflictDoNothing();

  const [role] = await db
    .select({ name: rolesTable.name })
    .from(rolesTable)
    .where(eq(rolesTable.id, data.roleId))
    .limit(1);

  await db.insert(auditLogTable).values({
    userId:    user.id,
    action:    "invite",
    resource:  "users",
    resourceId: invitedUserId,
    metadata:  { email, role: role?.name ?? data.roleId },
  });

  revalidatePath("/instellingen/gebruikers");
  return { success: true };
}

export async function deactivateUser(userId: string): Promise<ActionResult> {
  await requirePermission("users", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (userId === user.id) {
    return { success: false, message: "U kunt uw eigen account niet deactiveren." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876600h",
  });
  if (error) {
    return { success: false, message: `Deactiveren mislukt: ${error.message}` };
  }

  await db.insert(auditLogTable).values({
    userId:    user.id,
    action:    "deactivate",
    resource:  "users",
    resourceId: userId,
    metadata:  {},
  });

  revalidatePath("/instellingen/gebruikers");
  return { success: true };
}

/**
 * Resend an invitation by user ID.
 * Looks up the user's email via Admin API, then re-invites.
 */
export async function resendInvite(userId: string): Promise<ActionResult> {
  await requirePermission("users", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const admin = createAdminClient();
  const { data: targetUser, error: fetchError } = await admin.auth.admin.getUserById(userId);
  if (fetchError || !targetUser.user.email) {
    return { success: false, message: "Gebruiker niet gevonden of heeft geen e-mailadres." };
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(targetUser.user.email);
  if (error) {
    return { success: false, message: `Opnieuw versturen mislukt: ${error.message}` };
  }

  await db.insert(auditLogTable).values({
    userId:    user.id,
    action:    "resend_invite",
    resource:  "users",
    resourceId: userId,
    metadata:  { email: targetUser.user.email },
  });

  revalidatePath("/instellingen/gebruikers");
  return { success: true };
}

/**
 * Batch-replace all roles for a user.
 * Deletes existing user_roles entries and re-inserts the provided set.
 */
export async function updateUserRoles(
  userId:  string,
  roleIds: string[],
): Promise<ActionResult> {
  await requirePermission("users", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (userId === user.id && roleIds.length === 0) {
    return { success: false, message: "U kunt uw eigen rollen niet volledig verwijderen." };
  }

  await db.delete(userRolesTable).where(eq(userRolesTable.userId, userId));

  if (roleIds.length > 0) {
    await db
      .insert(userRolesTable)
      .values(roleIds.map((roleId) => ({ userId, roleId })))
      .onConflictDoNothing();
  }

  const assignedRoles = roleIds.length > 0
    ? await db
        .select({ name: rolesTable.name })
        .from(rolesTable)
        .where(inArray(rolesTable.id, roleIds))
    : [];

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "update_roles",
    resource:   "users",
    resourceId: userId,
    metadata:   { roleIds, roleNames: assignedRoles.map((r) => r.name) },
  });

  revalidatePath("/instellingen/gebruikers");
  return { success: true };
}

const AUDIT_PAGE_SIZE = 25;

/**
 * Paginated, filterable audit log query across all resources.
 * Resolves actor names via LEFT JOIN on personnelTable (for field staff)
 * and via the Supabase Admin API (for management users not in personnel).
 */
export async function listAuditLog(params: {
  page?:     number;
  search?:   string;
  module?:   string;
  dateFrom?: string;
  dateTo?:   string;
} = {}): Promise<{ entries: AuditLogEntry[]; total: number }> {
  await requirePermission("settings", "read");

  const {
    page     = 1,
    search   = "",
    module   = "",
    dateFrom = "",
    dateTo   = "",
  } = params;

  const conditions = [];

  if (search.trim()) {
    conditions.push(
      or(
        ilike(auditLogTable.action,   `%${search.trim()}%`),
        ilike(auditLogTable.resource, `%${search.trim()}%`),
      ),
    );
  }
  if (module) {
    conditions.push(eq(auditLogTable.resource, module));
  }
  if (dateFrom) {
    conditions.push(gte(auditLogTable.createdAt, new Date(dateFrom)));
  }
  if (dateTo) {
    // Make dateTo inclusive: advance by 1 day so lte covers the full final day
    const end = new Date(dateTo);
    end.setDate(end.getDate() + 1);
    conditions.push(lte(auditLogTable.createdAt, end));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }], adminData] = await Promise.all([
    db
      .select({
        id:         auditLogTable.id,
        userId:     auditLogTable.userId,
        action:     auditLogTable.action,
        resource:   auditLogTable.resource,
        resourceId: auditLogTable.resourceId,
        metadata:   auditLogTable.metadata,
        createdAt:  auditLogTable.createdAt,
        pFirstName: personnelTable.firstName,
        pLastName:  personnelTable.lastName,
        pEmail:     personnelTable.email,
      })
      .from(auditLogTable)
      .leftJoin(personnelTable, eq(personnelTable.userId, auditLogTable.userId))
      .where(where)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogTable)
      .where(where),

    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const authMap = new Map(
    (adminData.data?.users ?? []).map((u) => {
      const meta = u.user_metadata as { full_name?: string; name?: string } | undefined;
      return [u.id, { email: u.email ?? u.id, name: (meta?.full_name ?? meta?.name) ?? null }] as const;
    }),
  );

  return {
    entries: rows.map((r) => {
      const personnelName = r.pFirstName && r.pLastName
        ? `${r.pFirstName} ${r.pLastName}` : null;
      const auth = authMap.get(r.userId);
      return {
        id:         r.id,
        userId:     r.userId,
        userEmail:  r.pEmail ?? auth?.email ?? r.userId,
        userName:   personnelName ?? auth?.name ?? null,
        action:     r.action,
        resource:   r.resource,
        resourceId: r.resourceId,
        metadata:   r.metadata as Record<string, unknown> | null,
        createdAt:  r.createdAt.toISOString(),
      };
    }),
    total: count,
  };
}

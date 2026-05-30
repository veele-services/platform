"use server";

import { db } from "@workspace/db";
import {
  personnelTable,
  rolesTable,
  auditLogTable,
  insertPersonnelSchema,
  updatePersonnelSchema,
} from "@workspace/db";
import { eq, ilike, or, and, asc, desc, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import type { ActionResult } from "./customers";

export type { ActionResult };

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoleOption = { id: string; name: string };

/**
 * Personnel names are internal management data.
 * Customer-role users do NOT have personnel:read permission, so they can never
 * call these server actions or access personnel routes.
 * This is enforced at the action level via requirePermission("personnel", "read").
 */
export type PersonnelRow = {
  id:           string;
  code:         string;
  firstName:    string;
  lastName:     string;
  email:        string;
  phone:        string | null;
  roleId:       string | null;
  roleName:     string | null;
  region:       string | null;
  certificates: string[];
  isActive:     boolean;
  isAvailable:  boolean;
  createdAt:    string;
};

export type PersonnelDetail = {
  id:           string;
  code:         string;
  userId:       string | null;
  firstName:    string;
  lastName:     string;
  email:        string;
  phone:        string | null;
  roleId:       string | null;
  roleName:     string | null;
  region:       string | null;
  certificates: string[];
  diplomas:     string[];
  knowledge:    string[];
  isActive:     boolean;
  isAvailable:  boolean;
  createdAt:    string;
  updatedAt:    string;
};

export type PersonnelFormInput = {
  firstName:    string;
  lastName:     string;
  email:        string;
  phone?:       string;
  roleId?:      string;
  region?:      string;
  certificates: string[];
  diplomas:     string[];
  knowledge:    string[];
  isAvailable:  boolean;
  isActive:     boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listPersonnel(params: {
  search?:   string;
  roleId?:   string;
  region?:   string;
  status?:   string;
  page?:     number;
  sort?:     string;
  dir?:      string;
}): Promise<{ rows: PersonnelRow[]; total: number }> {
  await requirePermission("personnel", "read");

  const {
    search,
    roleId,
    region,
    status = "all",
    page = 1,
    sort = "lastName",
    dir = "asc",
  } = params;

  const conditions: ReturnType<typeof eq>[] = [];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const clause = or(
      ilike(personnelTable.firstName, term),
      ilike(personnelTable.lastName,  term),
      ilike(personnelTable.email,     term),
      ilike(personnelTable.code,      term),
    );
    if (clause) conditions.push(clause as ReturnType<typeof eq>);
  }
  if (roleId) conditions.push(eq(personnelTable.roleId, roleId) as ReturnType<typeof eq>);
  if (region?.trim()) conditions.push(ilike(personnelTable.region, `%${region.trim()}%`) as ReturnType<typeof eq>);
  if (status === "active")   conditions.push(eq(personnelTable.isActive, true)  as ReturnType<typeof eq>);
  if (status === "inactive") conditions.push(eq(personnelTable.isActive, false) as ReturnType<typeof eq>);

  const where = conditions.length ? and(...conditions) : undefined;

  const sortMap: Record<string, unknown> = {
    lastName:  personnelTable.lastName,
    firstName: personnelTable.firstName,
    email:     personnelTable.email,
    code:      personnelTable.code,
    region:    personnelTable.region,
    createdAt: personnelTable.createdAt,
  };
  const sortCol = (sortMap[sort] ?? personnelTable.lastName) as typeof personnelTable.lastName;
  const orderBy = dir === "desc" ? desc(sortCol) : asc(sortCol);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id:           personnelTable.id,
        code:         personnelTable.code,
        firstName:    personnelTable.firstName,
        lastName:     personnelTable.lastName,
        email:        personnelTable.email,
        phone:        personnelTable.phone,
        roleId:       personnelTable.roleId,
        roleName:     rolesTable.name,
        region:       personnelTable.region,
        certificates: personnelTable.certificates,
        isActive:     personnelTable.isActive,
        isAvailable:  personnelTable.isAvailable,
        createdAt:    personnelTable.createdAt,
      })
      .from(personnelTable)
      .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(personnelTable)
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    total: countRows[0]?.total ?? 0,
  };
}

export async function getPersonnel(id: string): Promise<PersonnelDetail | null> {
  await requirePermission("personnel", "read");

  const rows = await db
    .select({
      id:           personnelTable.id,
      code:         personnelTable.code,
      userId:       personnelTable.userId,
      firstName:    personnelTable.firstName,
      lastName:     personnelTable.lastName,
      email:        personnelTable.email,
      phone:        personnelTable.phone,
      roleId:       personnelTable.roleId,
      roleName:     rolesTable.name,
      region:       personnelTable.region,
      certificates: personnelTable.certificates,
      diplomas:     personnelTable.diplomas,
      knowledge:    personnelTable.knowledge,
      isActive:     personnelTable.isActive,
      isAvailable:  personnelTable.isAvailable,
      createdAt:    personnelTable.createdAt,
      updatedAt:    personnelTable.updatedAt,
    })
    .from(personnelTable)
    .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
    .where(eq(personnelTable.id, id))
    .limit(1);

  if (!rows[0]) return null;
  const r = rows[0];
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listRoles(): Promise<RoleOption[]> {
  await requirePermission("personnel", "read");
  return db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .orderBy(asc(rolesTable.name));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createPersonnel(
  data: PersonnelFormInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = {
    firstName:    data.firstName.trim(),
    lastName:     data.lastName.trim(),
    email:        data.email.trim().toLowerCase(),
    phone:        data.phone?.trim()  || null,
    roleId:       data.roleId         || null,
    region:       data.region?.trim() || null,
    certificates: data.certificates,
    diplomas:     data.diplomas,
    knowledge:    data.knowledge,
    isAvailable:  data.isAvailable,
    isActive:     data.isActive,
  };

  const parsed = insertPersonnelSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validatie mislukt.", fieldErrors };
  }

  try {
    const [created] = await db
      .insert(personnelTable)
      .values(parsed.data)
      .returning({ id: personnelTable.id });

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "create",
      resource:   "personnel",
      resourceId: created!.id,
      metadata:   { name: `${payload.firstName} ${payload.lastName}` },
    });

    revalidatePath("/personnel");
    return { success: true, data: { id: created!.id } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: "Er bestaat al een medewerker met dit e-mailadres.",
        fieldErrors: { email: "E-mailadres is al in gebruik" },
      };
    }
    return { success: false, message: "Medewerker aanmaken mislukt." };
  }
}

export async function updatePersonnel(
  id: string,
  data: PersonnelFormInput,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = {
    firstName:    data.firstName.trim(),
    lastName:     data.lastName.trim(),
    email:        data.email.trim().toLowerCase(),
    phone:        data.phone?.trim()  || null,
    roleId:       data.roleId         || null,
    region:       data.region?.trim() || null,
    certificates: data.certificates,
    diplomas:     data.diplomas,
    knowledge:    data.knowledge,
    isAvailable:  data.isAvailable,
    isActive:     data.isActive,
  };

  const parsed = updatePersonnelSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validatie mislukt.", fieldErrors };
  }

  try {
    await db
      .update(personnelTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(personnelTable.id, id));

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "update",
      resource:   "personnel",
      resourceId: id,
      metadata:   { name: `${payload.firstName} ${payload.lastName}` },
    });

    revalidatePath("/personnel");
    revalidatePath(`/personnel/${id}`);
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: "Er bestaat al een medewerker met dit e-mailadres.",
        fieldErrors: { email: "E-mailadres is al in gebruik" },
      };
    }
    return { success: false, message: "Medewerker bijwerken mislukt." };
  }
}

export async function setPersonnelStatus(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .update(personnelTable)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(personnelTable.id, id));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     isActive ? "activate" : "deactivate",
    resource:   "personnel",
    resourceId: id,
    metadata:   {},
  });

  revalidatePath("/personnel");
  revalidatePath(`/personnel/${id}`);
  return { success: true };
}

export async function bulkSetPersonnelStatus(
  ids: string[],
  isActive: boolean,
): Promise<ActionResult> {
  if (!ids.length) return { success: true };
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .update(personnelTable)
    .set({ isActive, updatedAt: new Date() })
    .where(inArray(personnelTable.id, ids));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     isActive ? "bulk_activate" : "bulk_deactivate",
    resource:   "personnel",
    resourceId: null,
    metadata:   { ids, count: ids.length },
  });

  revalidatePath("/personnel");
  return { success: true };
}

export async function invitePersonnel(id: string): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const { data: { user: actor } } = await supabase.auth.getUser();
  if (!actor) return { success: false, message: "Niet geauthenticeerd." };

  const [person] = await db
    .select({
      firstName: personnelTable.firstName,
      lastName:  personnelTable.lastName,
      email:     personnelTable.email,
      userId:    personnelTable.userId,
    })
    .from(personnelTable)
    .where(eq(personnelTable.id, id))
    .limit(1);

  if (!person) return { success: false, message: "Medewerker niet gevonden." };
  if (person.userId) {
    return { success: false, message: "Medewerker heeft al een gekoppeld account." };
  }

  const admin = createAdminClient();
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    person.email,
  );

  if (inviteError || !inviteData?.user) {
    return {
      success: false,
      message: inviteError?.message ?? "Uitnodiging versturen mislukt.",
    };
  }

  await db
    .update(personnelTable)
    .set({ userId: inviteData.user.id, updatedAt: new Date() })
    .where(eq(personnelTable.id, id));

  await db.insert(auditLogTable).values({
    userId:     actor.id,
    action:     "invite",
    resource:   "personnel",
    resourceId: id,
    metadata:   {
      name:           `${person.firstName} ${person.lastName}`,
      email:          person.email,
      invitedUserId:  inviteData.user.id,
    },
  });

  revalidatePath(`/personnel/${id}`);
  return { success: true };
}

export async function deletePersonnel(id: string): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [person] = await db
    .select({ firstName: personnelTable.firstName, lastName: personnelTable.lastName })
    .from(personnelTable)
    .where(eq(personnelTable.id, id))
    .limit(1);

  if (!person) return { success: false, message: "Medewerker niet gevonden." };

  await db.delete(personnelTable).where(eq(personnelTable.id, id));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "delete",
    resource:   "personnel",
    resourceId: id,
    metadata:   { name: `${person.firstName} ${person.lastName}` },
  });

  revalidatePath("/personnel");
  return { success: true };
}

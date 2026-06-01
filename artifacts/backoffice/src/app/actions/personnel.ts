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
import { getBatchAvailabilityStatus } from "./availability";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import type { ActionResult } from "./customers";

export type { ActionResult };
export type { AvailabilityStatus } from "./availability";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoleOption = { id: string; name: string };

/**
 * Auth-account status for a personnel member:
 * - none     — no invite sent, no account
 * - invited  — invite sent, account not yet activated
 * - active   — account exists and is not banned
 * - disabled — account exists but is banned in Supabase Auth
 */
export type PersonnelAuthStatus = "none" | "invited" | "active" | "disabled";

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
  isActive:           boolean;
  isAvailable:        boolean;
  availabilityStatus: import("./availability").AvailabilityStatus;
  userId:       string | null;
  inviteSentAt: string | null;
  createdAt:          string;
};

export type PersonnelDetail = {
  id:           string;
  code:         string;
  userId:       string | null;
  inviteSentAt: string | null;
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
  /** Create-mode only: send invite immediately after record is created. */
  autoInvite?:  boolean;
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
        userId:       personnelTable.userId,
        inviteSentAt: personnelTable.inviteSentAt,
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

  const today     = new Date().toISOString().slice(0, 10);
  const ids       = rows.map((r) => r.id);
  const statusMap = await getBatchAvailabilityStatus(ids, today);

  return {
    rows: rows.map((r) => ({
      ...r,
      createdAt:          r.createdAt.toISOString(),
      inviteSentAt:       r.inviteSentAt ? r.inviteSentAt.toISOString() : null,
      availabilityStatus: statusMap[r.id] ?? "niet_ingesteld",
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
      inviteSentAt: personnelTable.inviteSentAt,
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
    inviteSentAt: r.inviteSentAt ? r.inviteSentAt.toISOString() : null,
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

    const createdId = created!.id;

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "create",
      resource:   "personnel",
      resourceId: createdId,
      metadata:   { name: `${payload.firstName} ${payload.lastName}` },
    });

    // Auto-invite: send the portal invite immediately after creating the record
    if (data.autoInvite) {
      const admin = createAdminClient();
      const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
        payload.email,
      );
      if (!inviteError && inviteData?.user) {
        await db
          .update(personnelTable)
          .set({ inviteSentAt: new Date(), updatedAt: new Date() })
          .where(eq(personnelTable.id, createdId));

        await db.insert(auditLogTable).values({
          userId:     user.id,
          action:     "auto_invite_personnel",
          resource:   "personnel",
          resourceId: createdId,
          metadata:   { name: `${payload.firstName} ${payload.lastName}`, email: payload.email },
        });
      }
      // If the invite fails, the record is still created — failure is not surfaced
      // so the caller can navigate to the detail page and invite manually.
    }

    revalidatePath("/personnel");
    return { success: true, data: { id: createdId } };
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
      firstName:    personnelTable.firstName,
      lastName:     personnelTable.lastName,
      email:        personnelTable.email,
      userId:       personnelTable.userId,
      inviteSentAt: personnelTable.inviteSentAt,
    })
    .from(personnelTable)
    .where(eq(personnelTable.id, id))
    .limit(1);

  if (!person) return { success: false, message: "Medewerker niet gevonden." };
  if (person.userId) {
    return { success: false, message: "Medewerker heeft al een actief portaalaccount." };
  }

  const admin = createAdminClient();
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    person.email,
  );

  if (inviteError) {
    // User already confirmed their Supabase account (clicked a previous invite link).
    // Look up their ID via generateLink and link the personnel record.
    const isAlreadyRegistered =
      inviteError.message?.toLowerCase().includes("already registered") ||
      inviteError.code === "email_exists";

    if (isAlreadyRegistered) {
      const { data: linkData } = await admin.auth.admin.generateLink({
        type:  "recovery",
        email: person.email,
      });
      if (linkData?.user?.id) {
        await db
          .update(personnelTable)
          .set({ userId: linkData.user.id, inviteSentAt: new Date(), updatedAt: new Date() })
          .where(eq(personnelTable.id, id));
        await db.insert(auditLogTable).values({
          userId:     actor.id,
          action:     "invite_linked",
          resource:   "personnel",
          resourceId: id,
          metadata:   { name: `${person.firstName} ${person.lastName}`, email: person.email },
        });
        revalidatePath(`/personnel/${id}`);
        return { success: true };
      }
    }

    return {
      success: false,
      message: inviteError.message ?? "Uitnodiging versturen mislukt.",
    };
  }

  if (!inviteData?.user) {
    return { success: false, message: "Uitnodiging versturen mislukt." };
  }

  // Invite sent — record timestamp. Do NOT set userId yet; that happens when the
  // employee logs into the Personeel-PWA for the first time (account-linking).
  await db
    .update(personnelTable)
    .set({ inviteSentAt: new Date(), updatedAt: new Date() })
    .where(eq(personnelTable.id, id));

  await db.insert(auditLogTable).values({
    userId:     actor.id,
    action:     "invite",
    resource:   "personnel",
    resourceId: id,
    metadata:   { name: `${person.firstName} ${person.lastName}`, email: person.email },
  });

  revalidatePath(`/personnel/${id}`);
  return { success: true };
}

// ─── Auth-status query ────────────────────────────────────────────────────────

/**
 * Derives the portal auth-status for a personnel member.
 * Falls back to "active" if the Admin API call fails, so the UI never hides
 * a functional account just because of a transient API error.
 */
export async function getPersonnelAuthStatus(id: string): Promise<PersonnelAuthStatus> {
  await requirePermission("personnel", "read");

  const [person] = await db
    .select({ userId: personnelTable.userId, inviteSentAt: personnelTable.inviteSentAt })
    .from(personnelTable)
    .where(eq(personnelTable.id, id))
    .limit(1);

  if (!person) return "none";
  if (!person.userId) return person.inviteSentAt ? "invited" : "none";

  // userId is set — verify via Admin API whether the account is still active.
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(person.userId);
    if (error || !data?.user) return "active";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = data.user as any;
    const bannedUntil: string | null | undefined = u.banned_until;
    // Supabase sets banned_until to "none" when the ban is lifted; any future ISO date = banned.
    if (bannedUntil && bannedUntil !== "none" && new Date(bannedUntil) > new Date()) {
      return "disabled";
    }
    if (u.deleted_at) return "disabled";
    return "active";
  } catch {
    return "active"; // safe fallback — never hide a potentially active account
  }
}

// ─── Email-only update (pre-invite) ──────────────────────────────────────────

/**
 * Allows management to correct the invite e-mail before the first invite is sent.
 * Blocked when a userId is already linked (account is active — use Supabase dashboard).
 */
export async function updatePersonnelEmail(
  id:    string,
  email: string,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { success: false, message: "Ongeldig e-mailadres." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [person] = await db
    .select({ userId: personnelTable.userId })
    .from(personnelTable)
    .where(eq(personnelTable.id, id))
    .limit(1);

  if (!person) return { success: false, message: "Medewerker niet gevonden." };
  if (person.userId) {
    return {
      success: false,
      message: "E-mailadres kan niet worden gewijzigd van een account dat al actief is. Gebruik het Supabase dashboard.",
    };
  }

  try {
    await db
      .update(personnelTable)
      .set({ email: trimmed, updatedAt: new Date() })
      .where(eq(personnelTable.id, id));

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "update_email",
      resource:   "personnel",
      resourceId: id,
      metadata:   { email: trimmed },
    });

    revalidatePath(`/personnel/${id}`);
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message:     "Dit e-mailadres is al in gebruik bij een andere medewerker.",
        fieldErrors: { email: "E-mailadres is al in gebruik" },
      };
    }
    return { success: false, message: "E-mailadres bijwerken mislukt." };
  }
}

/**
 * Ban or unban a personnel member's Supabase Auth account.
 * - ban:   sets ban_duration = '876600h' (~100 years — effectively permanent)
 * - unban: sets ban_duration = 'none'
 * Logs `ban_personnel_account` or `unban_personnel_account` in the audit log.
 */
export async function setPersonnelAuthBan(
  id:     string,
  banned: boolean,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [person] = await db
    .select({
      userId:    personnelTable.userId,
      firstName: personnelTable.firstName,
      lastName:  personnelTable.lastName,
    })
    .from(personnelTable)
    .where(eq(personnelTable.id, id))
    .limit(1);

  if (!person) return { success: false, message: "Medewerker niet gevonden." };
  if (!person.userId) {
    return { success: false, message: "Medewerker heeft geen portaalaccount. Stuur eerst een uitnodiging." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(person.userId, {
    ban_duration: banned ? "876600h" : "none",
  });

  if (error) {
    return { success: false, message: error.message ?? "Account blokkeren mislukt." };
  }

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     banned ? "ban_personnel_account" : "unban_personnel_account",
    resource:   "personnel",
    resourceId: id,
    metadata:   { name: `${person.firstName} ${person.lastName}` },
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

"use server";

import { db } from "@workspace/db";
import {
  FIELDGRID_SUPPORT_TENANT_COOKIE,
  platformUsersTable,
  supportAccessAuditLogTable,
  supportAccessGrantsTable,
  tenantsTable,
} from "@workspace/db";
import { and, desc, eq, gt, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requirePlatformAdmin,
  requirePlatformSupportUser,
  requireSupportAccess,
  writeSupportAccessAuditLog,
} from "@/lib/auth/platform";
import type { ActionResult } from "./customers";

export type PlatformUserRow = {
  id: string;
  userId: string;
  role: string;
  status: string;
  createdAt: string;
  lastSeenAt: string | null;
};

export type SupportAccessGrantRow = {
  id: string;
  tenantId: string;
  tenantName: string;
  platformUserId: string;
  reason: string;
  startsAt: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

export type SupportAccessAuditLogRow = {
  id: string;
  grantId: string | null;
  tenantId: string;
  platformUserId: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

function normalizePlatformRole(role: string): "owner" | "admin" | "support" {
  return ["owner", "admin", "support"].includes(role)
    ? (role as "owner" | "admin" | "support")
    : "support";
}

function normalizePlatformStatus(status: string): "active" | "inactive" | "suspended" {
  return ["active", "inactive", "suspended"].includes(status)
    ? (status as "active" | "inactive" | "suspended")
    : "active";
}

function formValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function revalidatePlatformTenant(tenantId: string): void {
  revalidatePath("/platform");
  revalidatePath(`/platform/tenants/${tenantId}`);
}

export async function listPlatformUsers(): Promise<PlatformUserRow[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select()
    .from(platformUsersTable)
    .orderBy(platformUsersTable.role, platformUsersTable.createdAt);

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  }));
}

export async function upsertPlatformUser(input: {
  userId: string;
  role: string;
  status?: string;
}): Promise<ActionResult<{ id: string }>> {
  const actor = await requirePlatformAdmin();
  const userId = input.userId.trim();
  if (!userId) return { success: false, message: "Gebruiker is verplicht." };

  const role = normalizePlatformRole(input.role);
  const status = normalizePlatformStatus(input.status ?? "active");

  const [row] = await db
    .insert(platformUsersTable)
    .values({ userId, role, status, createdBy: actor.userId })
    .onConflictDoUpdate({
      target: platformUsersTable.userId,
      set: { role, status, updatedAt: new Date() },
    })
    .returning({ id: platformUsersTable.id });

  revalidatePath("/platform");
  return { success: true, data: { id: row.id } };
}

export async function listSupportAccessGrants(): Promise<SupportAccessGrantRow[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: supportAccessGrantsTable.id,
      tenantId: supportAccessGrantsTable.tenantId,
      tenantName: tenantsTable.name,
      platformUserId: supportAccessGrantsTable.platformUserId,
      reason: supportAccessGrantsTable.reason,
      startsAt: supportAccessGrantsTable.startsAt,
      expiresAt: supportAccessGrantsTable.expiresAt,
      revokedAt: supportAccessGrantsTable.revokedAt,
      createdAt: supportAccessGrantsTable.createdAt,
    })
    .from(supportAccessGrantsTable)
    .innerJoin(tenantsTable, eq(supportAccessGrantsTable.tenantId, tenantsTable.id))
    .orderBy(desc(supportAccessGrantsTable.createdAt));

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    platformUserId: row.platformUserId,
    reason: row.reason,
    startsAt: row.startsAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createSupportAccessGrant(input: {
  tenantId: string;
  platformUserId: string;
  reason: string;
  expiresAt: string;
  startsAt?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const actor = await requirePlatformAdmin();
  const tenantId = input.tenantId.trim();
  const platformUserId = input.platformUserId.trim();
  const reason = input.reason.trim();
  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
  const expiresAt = new Date(input.expiresAt);

  if (!tenantId || !platformUserId) {
    return { success: false, message: "Tenant en platformgebruiker zijn verplicht." };
  }
  if (!reason) return { success: false, message: "Reden is verplicht." };
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    return { success: false, message: "Einddatum moet in de toekomst liggen." };
  }
  if (Number.isNaN(startsAt.getTime()) || startsAt >= expiresAt) {
    return { success: false, message: "Startdatum moet voor de einddatum liggen." };
  }

  const [row] = await db
    .insert(supportAccessGrantsTable)
    .values({
      tenantId,
      platformUserId,
      reason,
      startsAt,
      expiresAt,
      createdBy: actor.userId,
    })
    .returning({ id: supportAccessGrantsTable.id });

  await writeSupportAccessAuditLog({
    tenantId,
    action: "grant_created",
    resource: "support_access_grants",
    resourceId: row.id,
    metadata: { platformUserId, reason, expiresAt: expiresAt.toISOString() },
  });

  revalidatePath("/platform");
  revalidatePlatformTenant(tenantId);
  return { success: true, data: { id: row.id } };
}

export async function createSupportAccessGrantFromForm(formData: FormData): Promise<ActionResult> {
  const tenantId = formValue(formData, "tenantId");
  const platformUserId = formValue(formData, "platformUserId");
  const reason = formValue(formData, "reason");
  const startsAt = formValue(formData, "startsAt") || null;
  const expiresAt = formValue(formData, "expiresAt");

  const result = await createSupportAccessGrant({ tenantId, platformUserId, reason, startsAt, expiresAt });
  if (!result.success) return result;

  revalidatePlatformTenant(tenantId);
  return { success: true };
}

export async function revokeSupportAccessGrant(grantId: string): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const [grant] = await db
    .select({ id: supportAccessGrantsTable.id, tenantId: supportAccessGrantsTable.tenantId })
    .from(supportAccessGrantsTable)
    .where(eq(supportAccessGrantsTable.id, grantId))
    .limit(1);

  if (!grant) return { success: false, message: "Supporttoegang niet gevonden." };

  await db
    .update(supportAccessGrantsTable)
    .set({ revokedAt: new Date(), revokedBy: actor.userId })
    .where(eq(supportAccessGrantsTable.id, grantId));

  await writeSupportAccessAuditLog({
    tenantId: grant.tenantId,
    action: "grant_revoked",
    resource: "support_access_grants",
    resourceId: grant.id,
  });

  revalidatePath("/platform");
  revalidatePlatformTenant(grant.tenantId);
  return { success: true };
}

export async function revokeSupportAccessGrantFromForm(formData: FormData): Promise<ActionResult> {
  const grantId = formValue(formData, "grantId");
  return revokeSupportAccessGrant(grantId);
}

export async function assertSupportAccessForTenant(tenantId: string): Promise<ActionResult> {
  await requireSupportAccess(tenantId);
  await writeSupportAccessAuditLog({
    tenantId,
    action: "support_access_checked",
    resource: "tenants",
    resourceId: tenantId,
  });
  return { success: true };
}

export async function enterSupportMode(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenantId") ?? "").trim();
  if (!tenantId) throw new Error("Forbidden: active support grant required");

  const grant = await requireSupportAccess(tenantId);
  const cookieStore = await cookies();
  cookieStore.set(FIELDGRID_SUPPORT_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: grant.expiresAt,
  });

  await writeSupportAccessAuditLog({
    tenantId,
    action: "support_mode_entered",
    resource: "support_access_grants",
    resourceId: grant.id,
    metadata: {
      reason: grant.reason,
      expiresAt: grant.expiresAt.toISOString(),
    },
  });

  redirect("/");
}

export async function exitSupportMode(): Promise<void> {
  const cookieStore = await cookies();
  const tenantId = cookieStore.get(FIELDGRID_SUPPORT_TENANT_COOKIE)?.value;

  if (tenantId) {
    await writeSupportAccessAuditLog({
      tenantId,
      action: "support_mode_exited",
      resource: "tenants",
      resourceId: tenantId,
    });
  }

  cookieStore.delete(FIELDGRID_SUPPORT_TENANT_COOKIE);
  revalidatePath("/");
}

export async function listSupportAccessAuditLog(tenantId?: string): Promise<SupportAccessAuditLogRow[]> {
  await requirePlatformAdmin();

  const where = tenantId ? eq(supportAccessAuditLogTable.tenantId, tenantId) : undefined;
  const rows = await db
    .select()
    .from(supportAccessAuditLogTable)
    .where(where)
    .orderBy(desc(supportAccessAuditLogTable.createdAt))
    .limit(200);

  return rows.map((row) => ({
    id: row.id,
    grantId: row.grantId,
    tenantId: row.tenantId,
    platformUserId: row.platformUserId,
    action: row.action,
    resource: row.resource,
    resourceId: row.resourceId,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function markCurrentPlatformUserSeen(): Promise<void> {
  const platformUser = await requirePlatformSupportUser();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== platformUser.userId) return;

  await db
    .update(platformUsersTable)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(and(eq(platformUsersTable.id, platformUser.id), eq(platformUsersTable.status, "active")));
}

export async function listActiveSupportGrantsForTenant(tenantId: string): Promise<SupportAccessGrantRow[]> {
  await requirePlatformAdmin();
  const now = new Date();

  const rows = await db
    .select({
      id: supportAccessGrantsTable.id,
      tenantId: supportAccessGrantsTable.tenantId,
      tenantName: tenantsTable.name,
      platformUserId: supportAccessGrantsTable.platformUserId,
      reason: supportAccessGrantsTable.reason,
      startsAt: supportAccessGrantsTable.startsAt,
      expiresAt: supportAccessGrantsTable.expiresAt,
      revokedAt: supportAccessGrantsTable.revokedAt,
      createdAt: supportAccessGrantsTable.createdAt,
    })
    .from(supportAccessGrantsTable)
    .innerJoin(tenantsTable, eq(supportAccessGrantsTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(supportAccessGrantsTable.tenantId, tenantId),
        lte(supportAccessGrantsTable.startsAt, now),
        gt(supportAccessGrantsTable.expiresAt, now),
        isNull(supportAccessGrantsTable.revokedAt),
      ),
    )
    .orderBy(desc(supportAccessGrantsTable.createdAt));

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    platformUserId: row.platformUserId,
    reason: row.reason,
    startsAt: row.startsAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

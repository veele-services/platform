import { db } from "@workspace/db";
import {
  platformUsersTable,
  supportAccessAuditLogTable,
  supportAccessGrantsTable,
} from "@workspace/db";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

export type PlatformUserRole = "owner" | "admin" | "support";

export type CurrentPlatformUser = {
  id: string;
  userId: string;
  role: PlatformUserRole;
  status: string;
};

export async function getCurrentPlatformUser(): Promise<CurrentPlatformUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [platformUser] = await db
    .select({
      id: platformUsersTable.id,
      userId: platformUsersTable.userId,
      role: platformUsersTable.role,
      status: platformUsersTable.status,
    })
    .from(platformUsersTable)
    .where(and(eq(platformUsersTable.userId, user.id), eq(platformUsersTable.status, "active")))
    .limit(1);

  if (!platformUser) return null;

  return {
    id: platformUser.id,
    userId: platformUser.userId,
    role: platformUser.role as PlatformUserRole,
    status: platformUser.status,
  };
}

export async function requirePlatformAdmin(): Promise<CurrentPlatformUser> {
  const platformUser = await getCurrentPlatformUser();
  if (!platformUser || !["owner", "admin"].includes(platformUser.role)) {
    throw new Error("Forbidden: platform-admin access required");
  }

  return platformUser;
}

export async function requirePlatformSupportUser(): Promise<CurrentPlatformUser> {
  const platformUser = await getCurrentPlatformUser();
  if (!platformUser) {
    throw new Error("Forbidden: platform support access required");
  }

  return platformUser;
}

export async function getActiveSupportGrant(tenantId: string) {
  const platformUser = await requirePlatformSupportUser();
  const now = new Date();

  const [grant] = await db
    .select()
    .from(supportAccessGrantsTable)
    .where(
      and(
        eq(supportAccessGrantsTable.tenantId, tenantId),
        eq(supportAccessGrantsTable.platformUserId, platformUser.id),
        lte(supportAccessGrantsTable.startsAt, now),
        gt(supportAccessGrantsTable.expiresAt, now),
        isNull(supportAccessGrantsTable.revokedAt),
      ),
    )
    .limit(1);

  return grant ?? null;
}

export async function requireSupportAccess(tenantId: string) {
  const grant = await getActiveSupportGrant(tenantId);
  if (!grant) {
    throw new Error("Forbidden: active support grant required");
  }

  return grant;
}

export async function writeSupportAccessAuditLog(input: {
  tenantId: string;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const platformUser = await requirePlatformSupportUser();
    const grant = await getActiveSupportGrant(input.tenantId);

    await db.insert(supportAccessAuditLogTable).values({
      grantId: grant?.id ?? null,
      tenantId: input.tenantId,
      platformUserId: platformUser.id,
      action: input.action,
      resource: input.resource ?? null,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    console.error("[support_access] Failed to write audit log", input, error);
  }
}

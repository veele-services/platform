import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { db } from "./index";
import {
  platformUsersTable,
  supportAccessAuditLogTable,
  supportAccessGrantsTable,
  type SupportAccessGrant,
} from "./schema";

export const FIELDGRID_RUNTIME_ACCESS_PRIORITY = [
  "platform-admin",
  "active-support-grant",
  "tenant-role",
] as const;

export const FIELDGRID_SUPPORT_TENANT_COOKIE = "fieldgrid_support_tenant_id";

export const FIELDGRID_PLATFORM_ADMIN_ROLES = ["owner", "admin"] as const;
export const FIELDGRID_PLATFORM_SUPPORT_ROLES = ["owner", "admin", "support"] as const;

export const FIELDGRID_SUPPORT_RUNTIME_PERMISSION_KEYS = [
  "dashboard:read",
  "customers:read",
  "objects:read",
  "personnel:read",
  "assignments:read",
  "planning:read",
  "reports:read",
  "documents:read",
  "invoices:read",
  "quotes:read",
  "payments:read",
  "customer_payment_batches:read",
  "tickets:read",
  "news:read",
  "notifications:read",
  "settings:read",
  "task_codes:read",
] as const;

const FIELDGRID_SUPPORT_RUNTIME_PERMISSION_SET = new Set<string>(
  FIELDGRID_SUPPORT_RUNTIME_PERMISSION_KEYS,
);

export type FieldgridRuntimeAccessPriority = typeof FIELDGRID_RUNTIME_ACCESS_PRIORITY[number];
export type PlatformAdminRole = typeof FIELDGRID_PLATFORM_ADMIN_ROLES[number];
export type PlatformSupportRole = typeof FIELDGRID_PLATFORM_SUPPORT_ROLES[number];

export type ActivePlatformUser = {
  id: string;
  userId: string;
  role: string;
  status: string;
};

export type ActiveSupportAccess = {
  platformUser: ActivePlatformUser;
  grant: SupportAccessGrant;
};

export function isPlatformAdminRole(role: string): role is PlatformAdminRole {
  return FIELDGRID_PLATFORM_ADMIN_ROLES.includes(role as PlatformAdminRole);
}

export function isPlatformSupportRole(role: string): role is PlatformSupportRole {
  return FIELDGRID_PLATFORM_SUPPORT_ROLES.includes(role as PlatformSupportRole);
}

export function isSupportRuntimePermission(resource: string, action: string): boolean {
  return FIELDGRID_SUPPORT_RUNTIME_PERMISSION_SET.has(`${resource}:${action}`);
}

export function getSupportRuntimePermissions(): Set<string> {
  return new Set(FIELDGRID_SUPPORT_RUNTIME_PERMISSION_KEYS);
}

export async function getActivePlatformUserForUser(userId: string): Promise<ActivePlatformUser | null> {
  const [platformUser] = await db
    .select({
      id: platformUsersTable.id,
      userId: platformUsersTable.userId,
      role: platformUsersTable.role,
      status: platformUsersTable.status,
    })
    .from(platformUsersTable)
    .where(and(eq(platformUsersTable.userId, userId), eq(platformUsersTable.status, "active")))
    .limit(1);

  return platformUser ?? null;
}

export async function getActiveSupportAccessForUser(
  userId: string,
  tenantId: string,
  now = new Date(),
): Promise<ActiveSupportAccess | null> {
  const platformUser = await getActivePlatformUserForUser(userId);
  if (!platformUser || !isPlatformSupportRole(platformUser.role)) return null;

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

  if (!grant) return null;
  return { platformUser, grant };
}

export async function writeSupportAccessAuditLogForUser(input: {
  userId: string;
  tenantId: string;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  grantId?: string | null;
}): Promise<void> {
  try {
    const supportAccess = await getActiveSupportAccessForUser(input.userId, input.tenantId);
    const platformUser = supportAccess?.platformUser ?? await getActivePlatformUserForUser(input.userId);
    if (!platformUser) return;

    await db.insert(supportAccessAuditLogTable).values({
      grantId: input.grantId ?? supportAccess?.grant.id ?? null,
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

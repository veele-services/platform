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

export const FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE = "break_glass" as const;
export const FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES = 240;
export const FIELDGRID_SUPPORT_BREAK_GLASS_MIN_REASON_LENGTH = 12;

export const FIELDGRID_SECURITY_AUDIT_SCOPES = [
  "tenant",
  "platform",
  "support",
] as const;

export const FIELDGRID_SECURITY_AUDIT_EVENT_TYPES = [
  "support_access",
  "download",
  "pdf",
  "direct_id_denial",
  "module_denial",
  "storage_denial",
  "tenant_mismatch",
  "platform_access_denial",
  "platform_admin",
] as const;

export const FIELDGRID_SECURITY_AUDIT_CONTRACT = {
  support_access: {
    source: "support_access_audit_log",
    required: ["tenantId", "platformUserId", "grantId", "reason"],
  },
  download: {
    source: "audit_log",
    required: ["tenantId", "userId", "resource", "resourceId"],
  },
  pdf: {
    source: "audit_log",
    required: ["tenantId", "userId", "resource", "resourceId"],
  },
  direct_id_denial: {
    source: "audit_log",
    required: ["tenantId", "userId", "resource", "resourceId"],
  },
  module_denial: {
    source: "audit_log",
    required: ["tenantId", "userId", "resource"],
  },
  storage_denial: {
    source: "audit_log",
    required: ["tenantId", "userId", "resource", "resourceId"],
  },
  tenant_mismatch: {
    source: "audit_log",
    required: ["tenantId", "userId", "resource", "resourceId"],
  },
  platform_access_denial: {
    source: "audit_log",
    required: ["userId", "resource", "resourceId"],
    tenantId: "null-for-platform-only",
  },
  platform_admin: {
    source: "audit_log",
    required: ["userId", "resource", "resourceId"],
    tenantId: "null-for-platform-only",
  },
} as const;

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
export type SupportBreakGlassGrantType = typeof FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE;

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

export type SupportBreakGlassValidationResult =
  | { success: true; ttlMinutes: number }
  | { success: false; message: string };

export function validateSupportBreakGlassGrant(input: {
  reason: string;
  startsAt: Date;
  expiresAt: Date;
  now?: Date;
}): SupportBreakGlassValidationResult {
  const reason = input.reason.trim();
  const now = input.now ?? new Date();

  if (reason.length < FIELDGRID_SUPPORT_BREAK_GLASS_MIN_REASON_LENGTH) {
    return {
      success: false,
      message: `Reden is verplicht en moet minimaal ${FIELDGRID_SUPPORT_BREAK_GLASS_MIN_REASON_LENGTH} tekens bevatten.`,
    };
  }

  if (Number.isNaN(input.startsAt.getTime()) || Number.isNaN(input.expiresAt.getTime())) {
    return { success: false, message: "Start- en einddatum moeten geldig zijn." };
  }

  if (input.expiresAt <= now) {
    return { success: false, message: "Einddatum moet in de toekomst liggen." };
  }

  if (input.startsAt >= input.expiresAt) {
    return { success: false, message: "Startdatum moet voor de einddatum liggen." };
  }

  const ttlMinutes = Math.ceil((input.expiresAt.getTime() - input.startsAt.getTime()) / 60000);
  if (ttlMinutes > FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES) {
    return {
      success: false,
      message: `Break-glass supporttoegang mag maximaal ${FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES} minuten actief zijn.`,
    };
  }

  return { success: true, ttlMinutes };
}

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

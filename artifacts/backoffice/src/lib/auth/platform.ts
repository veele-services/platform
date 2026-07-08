import {
  FIELDGRID_RUNTIME_ACCESS_PRIORITY,
  FIELDGRID_SUPPORT_TENANT_COOKIE,
  getActivePlatformUserForUser,
  getActiveSupportAccessForUser,
  isPlatformAdminRole,
  writeSupportAccessAuditLogForUser,
} from "@workspace/db";
import { cookies, headers } from "next/headers";
import { createClient, createClientFromRequest } from "@/lib/supabase/server";
import { isPlatformHost, normalizeHost } from "@/lib/auth/tenant-resolver";

export type PlatformUserRole = "owner" | "admin" | "support";

export type CurrentPlatformUser = {
  id: string;
  userId: string;
  role: PlatformUserRole;
  status: string;
};

export type CurrentSupportMode = {
  tenantId: string;
  grantId: string;
  platformUserId: string;
  reason: string;
  expiresAt: string;
  ttlSeconds: number;
  priority: typeof FIELDGRID_RUNTIME_ACCESS_PRIORITY[number];
};

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

async function getCurrentUserIdFromRequest(request: Request): Promise<string | null> {
  const supabase = createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

async function isCurrentHostPlatformHost(): Promise<boolean> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  return isPlatformHost(normalizeHost(host));
}

export async function getCurrentPlatformUser(): Promise<CurrentPlatformUser | null> {
  const userId = await getCurrentUserId();
  return getPlatformUserForUserId(userId);
}

async function getPlatformUserForUserId(userId: string | null): Promise<CurrentPlatformUser | null> {
  if (!userId) return null;

  const platformUser = await getActivePlatformUserForUser(userId);
  if (!platformUser) return null;

  return {
    id: platformUser.id,
    userId: platformUser.userId,
    role: platformUser.role as PlatformUserRole,
    status: platformUser.status,
  };
}

export async function getCurrentPlatformUserFromRequest(request: Request): Promise<CurrentPlatformUser | null> {
  const userId = await getCurrentUserIdFromRequest(request);
  return getPlatformUserForUserId(userId);
}

export async function requirePlatformAdmin(): Promise<CurrentPlatformUser> {
  const platformUser = await getCurrentPlatformUser();
  if (!platformUser || !isPlatformAdminRole(platformUser.role)) {
    throw new Error("Forbidden: platform-admin access required");
  }

  return platformUser;
}

export async function requirePlatformAdminFromRequest(request: Request): Promise<CurrentPlatformUser> {
  const platformUser = await getCurrentPlatformUserFromRequest(request);
  if (!platformUser || !isPlatformAdminRole(platformUser.role)) {
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
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const supportAccess = await getActiveSupportAccessForUser(userId, tenantId);
  return supportAccess?.grant ?? null;
}

export async function getCurrentSupportMode(): Promise<CurrentSupportMode | null> {
  if (!(await isCurrentHostPlatformHost())) return null;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const cookieStore = await cookies();
  const tenantId = cookieStore.get(FIELDGRID_SUPPORT_TENANT_COOKIE)?.value;
  if (!tenantId) return null;

  const supportAccess = await getActiveSupportAccessForUser(userId, tenantId);
  if (!supportAccess) return null;

  const expiresAt = supportAccess.grant.expiresAt;
  return {
    tenantId,
    grantId: supportAccess.grant.id,
    platformUserId: supportAccess.platformUser.id,
    reason: supportAccess.grant.reason,
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    priority: FIELDGRID_RUNTIME_ACCESS_PRIORITY[1],
  };
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
  const userId = await getCurrentUserId();
  if (!userId) return;

  await writeSupportAccessAuditLogForUser({
    userId,
    tenantId: input.tenantId,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId,
    metadata: input.metadata,
  });
}

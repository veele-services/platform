import { headers } from "next/headers";
import {
  auditSensitiveAccessUse,
  authorizeFieldgridAccess,
  FIELDGRID_SCOPE_CLASSIFICATION,
  getActiveSensitiveAccessGrant,
  normalizePlatformRole,
  normalizeTenantRole,
  type FieldgridAccessLevel,
  type FieldgridDataScope,
  type FieldgridRole,
  type SensitiveAccessGrant,
} from "@workspace/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth/tenant";
import { getCurrentPlatformUser, getCurrentSupportMode } from "@/lib/auth/platform";
import { getUserRoles } from "@/lib/auth/permissions";

export type SensitiveRuntimeDecision = {
  allowed: boolean;
  reason: string;
  masked: boolean;
  auditRequired: boolean;
  role: FieldgridRole | "unknown";
  userId: string;
  tenantId: string;
  scope: FieldgridDataScope;
  accessLevel: FieldgridAccessLevel;
  grantId: string | null;
};

export type SensitiveRuntimeAccessInput = {
  tenantId: string;
  scope: FieldgridDataScope;
  accessLevel: FieldgridAccessLevel;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  exportDownload?: boolean;
  metadata?: Record<string, unknown> | null;
};

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function requestMetadata(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const requestHeaders = await headers();
    return {
      ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: requestHeaders.get("user-agent") ?? null,
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

function accessCandidates(accessLevel: FieldgridAccessLevel): FieldgridAccessLevel[] {
  if (accessLevel === "masked_read") return ["full_read", "masked_read"];
  if (accessLevel === "metadata_only") return ["full_read", "masked_read", "metadata_only"];
  return [accessLevel];
}

async function actorRolesForTenant(userId: string, tenantId: string): Promise<FieldgridRole[]> {
  const roles: FieldgridRole[] = [];
  const [platformUser, supportMode, currentTenantId] = await Promise.all([
    getCurrentPlatformUser(),
    getCurrentSupportMode(),
    getCurrentTenantId(),
  ]);

  const isTenantRuntimeContext = currentTenantId === tenantId;
  if (platformUser && (supportMode?.tenantId === tenantId || !isTenantRuntimeContext)) {
    const role = normalizePlatformRole(platformUser.role);
    if (role) roles.push(role);
  }

  if (currentTenantId === tenantId) {
    const tenantRoles = await getUserRoles(userId, tenantId);
    for (const roleName of tenantRoles) {
      const role = normalizeTenantRole(roleName);
      if (role) roles.push(role);
    }
  }

  return [...new Set(roles)];
}

async function auditRuntimeDecision(input: {
  decision: SensitiveRuntimeDecision;
  runtimeInput: SensitiveRuntimeAccessInput;
}): Promise<void> {
  const { decision, runtimeInput } = input;
  if (!decision.auditRequired && !runtimeInput.exportDownload && decision.allowed) return;

  const context = await requestMetadata();
  await auditSensitiveAccessUse({
    userId: decision.userId,
    tenantId: decision.tenantId,
    role: decision.role,
    scope: runtimeInput.scope,
    accessType: decision.accessLevel,
    resourceType: runtimeInput.resourceType,
    resourceId: runtimeInput.resourceId ?? null,
    grantId: decision.grantId,
    reason: runtimeInput.reason ?? decision.reason,
    exportDownload: runtimeInput.exportDownload ?? false,
    metadata: {
      allowed: decision.allowed,
      reason: decision.reason,
      requestedAccessLevel: runtimeInput.accessLevel,
      effectiveAccessLevel: decision.accessLevel,
      masked: decision.masked,
      dataClassificationLevel: FIELDGRID_SCOPE_CLASSIFICATION[runtimeInput.scope],
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      ...(runtimeInput.metadata ?? {}),
    },
  });
}

export async function getSensitiveRuntimeAccess(
  input: SensitiveRuntimeAccessInput,
): Promise<SensitiveRuntimeDecision> {
  const userId = await currentUserId();
  if (!userId) {
    return {
      allowed: false,
      reason: "authentication_required",
      masked: true,
      auditRequired: true,
      role: "unknown",
      userId: "00000000-0000-0000-0000-000000000000",
      tenantId: input.tenantId,
      scope: input.scope,
      accessLevel: input.accessLevel,
      grantId: null,
    };
  }

  const roles = await actorRolesForTenant(userId, input.tenantId);
  if (roles.length === 0) {
    const decision: SensitiveRuntimeDecision = {
      allowed: false,
      reason: "role_not_found",
      masked: true,
      auditRequired: true,
      role: "unknown",
      userId,
      tenantId: input.tenantId,
      scope: input.scope,
      accessLevel: input.accessLevel,
      grantId: null,
    };
    await auditRuntimeDecision({ decision, runtimeInput: input });
    return decision;
  }

  let denial: SensitiveRuntimeDecision | null = null;
  for (const role of roles) {
    for (const accessLevel of accessCandidates(input.accessLevel)) {
      let grant: SensitiveAccessGrant | null = null;
      if (role.startsWith("platform_")) {
        grant = await getActiveSensitiveAccessGrant({
          userId,
          tenantId: input.tenantId,
          scope: input.scope,
          permission: accessLevel,
        });
      }

      const rawDecision = authorizeFieldgridAccess({
        role,
        scope: input.scope,
        accessLevel,
        actorTenantId: role.startsWith("tenant_") ? input.tenantId : null,
        resourceTenantId: input.tenantId,
        hasActiveSensitiveGrant: Boolean(grant),
        breakGlassReason: input.reason ?? null,
      });
      const decision: SensitiveRuntimeDecision = {
        ...rawDecision,
        role,
        userId,
        tenantId: input.tenantId,
        scope: input.scope,
        accessLevel,
        grantId: grant?.id ?? null,
      };

      if (decision.allowed) {
        await auditRuntimeDecision({ decision, runtimeInput: input });
        return decision;
      }
      denial = denial ?? decision;
    }
  }

  const finalDecision = denial ?? {
    allowed: false,
    reason: "permission_denied",
    masked: true,
    auditRequired: true,
    role: "unknown" as const,
    userId,
    tenantId: input.tenantId,
    scope: input.scope,
    accessLevel: input.accessLevel,
    grantId: null,
  };
  await auditRuntimeDecision({ decision: finalDecision, runtimeInput: input });
  return finalDecision;
}

export async function requireSensitiveRuntimeAccess(
  input: SensitiveRuntimeAccessInput,
): Promise<SensitiveRuntimeDecision> {
  const decision = await getSensitiveRuntimeAccess(input);
  if (!decision.allowed) {
    throw new Error(`Forbidden: ${decision.reason}`);
  }
  return decision;
}

export function shouldMaskSensitiveRuntimeDecision(decision: SensitiveRuntimeDecision): boolean {
  return decision.masked || decision.accessLevel === "masked_read" || decision.accessLevel === "metadata_only";
}

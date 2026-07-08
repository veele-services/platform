import { and, desc, eq, gt, isNull, lte } from "drizzle-orm";
import { db } from "./index";
import {
  sensitiveAccessGrantsTable,
  sensitiveAccessRequestsTable,
  type SensitiveAccessGrant,
  type SensitiveAccessRequest,
} from "./schema";
import {
  FIELDGRID_SCOPE_CLASSIFICATION,
  type FieldgridDataClassificationLevel,
  type FieldgridDataScope,
} from "./security-data-classification";
import type { FieldgridAccessLevel } from "./security-permissions";
import { writeSensitiveAuditLog } from "./security-audit";

export const FIELDGRID_SENSITIVE_ACCESS_MIN_REASON_LENGTH = 12;
export const FIELDGRID_SENSITIVE_ACCESS_MAX_TTL_MINUTES = 240;
export const FIELDGRID_SENSITIVE_ACCESS_DEFAULT_TTL_MINUTES = 60;

export type SensitiveAccessApprovalSource = "platform_owner" | "tenant_owner" | "dual" | "break_glass";

export type SensitiveAccessValidationResult =
  | { success: true; ttlMinutes: number; expiresAt: Date }
  | { success: false; message: string };

export type CreateSensitiveAccessRequestInput = {
  tenantId: string;
  requestedByUserId: string;
  requestedRole: string;
  scope: FieldgridDataScope;
  permission: FieldgridAccessLevel;
  reason: string;
  supportTicketReference?: string | null;
  approvalRequiredFrom?: SensitiveAccessApprovalSource;
  durationMinutes?: number | null;
  now?: Date;
};

export type ApproveSensitiveAccessRequestInput = {
  requestId: string;
  approvedByUserId: string;
  permission?: FieldgridAccessLevel | null;
  durationMinutes?: number | null;
  reason?: string | null;
  now?: Date;
};

export type DenySensitiveAccessRequestInput = {
  requestId: string;
  deniedByUserId: string;
  reason: string;
  now?: Date;
};

export type RevokeSensitiveAccessGrantInput = {
  grantId: string;
  revokedByUserId: string;
  reason: string;
  now?: Date;
};

export type BreakGlassSensitiveAccessInput = {
  tenantId: string;
  userId: string;
  role: string;
  scope: FieldgridDataScope;
  permission: FieldgridAccessLevel;
  reason: string;
  supportTicketReference?: string | null;
  durationMinutes?: number | null;
  now?: Date;
};

function classificationForScope(scope: FieldgridDataScope): FieldgridDataClassificationLevel {
  return FIELDGRID_SCOPE_CLASSIFICATION[scope];
}

function validateReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < FIELDGRID_SENSITIVE_ACCESS_MIN_REASON_LENGTH) {
    throw new Error(`Reason must be at least ${FIELDGRID_SENSITIVE_ACCESS_MIN_REASON_LENGTH} characters.`);
  }
  return trimmed;
}

export function validateSensitiveAccessWindow(input: {
  reason: string;
  durationMinutes?: number | null;
  now?: Date;
}): SensitiveAccessValidationResult {
  const reason = input.reason.trim();
  const now = input.now ?? new Date();
  if (reason.length < FIELDGRID_SENSITIVE_ACCESS_MIN_REASON_LENGTH) {
    return {
      success: false,
      message: `Reden is verplicht en moet minimaal ${FIELDGRID_SENSITIVE_ACCESS_MIN_REASON_LENGTH} tekens bevatten.`,
    };
  }

  const durationMinutes = Number.isFinite(input.durationMinutes ?? NaN)
    ? Math.round(input.durationMinutes!)
    : FIELDGRID_SENSITIVE_ACCESS_DEFAULT_TTL_MINUTES;
  if (durationMinutes <= 0) {
    return { success: false, message: "Duur moet groter zijn dan 0 minuten." };
  }
  if (durationMinutes > FIELDGRID_SENSITIVE_ACCESS_MAX_TTL_MINUTES) {
    return {
      success: false,
      message: `Sensitive access mag maximaal ${FIELDGRID_SENSITIVE_ACCESS_MAX_TTL_MINUTES} minuten actief zijn.`,
    };
  }

  return {
    success: true,
    ttlMinutes: durationMinutes,
    expiresAt: new Date(now.getTime() + durationMinutes * 60000),
  };
}

function grantCoversPermission(grantPermission: string, requestedPermission: FieldgridAccessLevel): boolean {
  if (grantPermission === requestedPermission) return true;
  if (grantPermission === "full_read" && requestedPermission === "masked_read") return true;
  return false;
}

export async function getActiveSensitiveAccessGrant(input: {
  userId: string;
  tenantId: string;
  scope: FieldgridDataScope;
  permission: FieldgridAccessLevel;
  now?: Date;
}): Promise<SensitiveAccessGrant | null> {
  const now = input.now ?? new Date();
  const rows = await db
    .select()
    .from(sensitiveAccessGrantsTable)
    .where(
      and(
        eq(sensitiveAccessGrantsTable.userId, input.userId),
        eq(sensitiveAccessGrantsTable.tenantId, input.tenantId),
        eq(sensitiveAccessGrantsTable.scope, input.scope),
        gt(sensitiveAccessGrantsTable.expiresAt, now),
        isNull(sensitiveAccessGrantsTable.revokedAt),
      ),
    )
    .orderBy(desc(sensitiveAccessGrantsTable.expiresAt))
    .limit(10);

  return rows.find((row) => grantCoversPermission(row.permission, input.permission)) ?? null;
}

export async function hasActiveSensitiveAccessGrant(input: {
  userId: string;
  tenantId: string;
  scope: FieldgridDataScope;
  permission: FieldgridAccessLevel;
  now?: Date;
}): Promise<boolean> {
  return Boolean(await getActiveSensitiveAccessGrant(input));
}

export async function createSensitiveAccessRequest(
  input: CreateSensitiveAccessRequestInput,
): Promise<SensitiveAccessRequest> {
  const window = validateSensitiveAccessWindow(input);
  if (!window.success) throw new Error(window.message);
  const reason = validateReason(input.reason);
  const approvalRequiredFrom = input.approvalRequiredFrom ?? "platform_owner";
  const dataClassificationLevel = classificationForScope(input.scope);

  const [request] = await db
    .insert(sensitiveAccessRequestsTable)
    .values({
      tenantId: input.tenantId,
      requestedByUserId: input.requestedByUserId,
      requestedRole: input.requestedRole,
      dataScope: input.scope,
      dataClassificationLevel,
      reason,
      supportTicketReference: input.supportTicketReference?.trim() || null,
      approvalRequiredFrom,
      status: "pending",
      expiresAt: window.expiresAt,
    })
    .returning();

  await writeSensitiveAuditLog({
    userId: input.requestedByUserId,
    tenantId: input.tenantId,
    role: input.requestedRole,
    action: "sensitive_access_requested",
    resourceType: "sensitive_access_requests",
    resourceId: request.id,
    dataClassificationLevel,
    accessType: input.permission,
    dataScope: input.scope,
    reason,
    approvalRequestId: request.id,
    metadata: {
      approvalRequiredFrom,
      supportTicketReference: input.supportTicketReference?.trim() || null,
      requestedPermission: input.permission,
      ttlMinutes: window.ttlMinutes,
    },
  });

  return request;
}

export async function approveSensitiveAccessRequest(
  input: ApproveSensitiveAccessRequestInput,
): Promise<{ request: SensitiveAccessRequest; grant: SensitiveAccessGrant }> {
  const now = input.now ?? new Date();
  const [request] = await db
    .select()
    .from(sensitiveAccessRequestsTable)
    .where(eq(sensitiveAccessRequestsTable.id, input.requestId))
    .limit(1);

  if (!request) throw new Error("Sensitive access request not found.");
  if (request.status !== "pending") throw new Error("Sensitive access request is not pending.");
  if (request.expiresAt <= now) {
    await db
      .update(sensitiveAccessRequestsTable)
      .set({ status: "expired", updatedAt: now })
      .where(eq(sensitiveAccessRequestsTable.id, request.id));
    throw new Error("Sensitive access request has expired.");
  }

  const reason = input.reason ? validateReason(input.reason) : request.reason;
  const requestedScope = request.dataScope as FieldgridDataScope;
  const permission = input.permission ?? "full_read";
  const window = validateSensitiveAccessWindow({
    reason,
    durationMinutes: input.durationMinutes,
    now,
  });
  if (!window.success) throw new Error(window.message);
  const grantExpiresAt = window.expiresAt < request.expiresAt ? window.expiresAt : request.expiresAt;

  const [updatedRequest] = await db
    .update(sensitiveAccessRequestsTable)
    .set({
      approvedByUserId: input.approvedByUserId,
      approvedAt: now,
      status: "approved",
      updatedAt: now,
    })
    .where(eq(sensitiveAccessRequestsTable.id, request.id))
    .returning();

  const [grant] = await db
    .insert(sensitiveAccessGrantsTable)
    .values({
      requestId: request.id,
      tenantId: request.tenantId,
      userId: request.requestedByUserId,
      scope: requestedScope,
      permission,
      expiresAt: grantExpiresAt,
    })
    .returning();

  await writeSensitiveAuditLog({
    userId: input.approvedByUserId,
    tenantId: request.tenantId,
    role: "approver",
    action: "sensitive_access_approved",
    resourceType: "sensitive_access_requests",
    resourceId: request.id,
    dataClassificationLevel: request.dataClassificationLevel as FieldgridDataClassificationLevel,
    accessType: "approve",
    dataScope: requestedScope,
    reason,
    approvalRequestId: request.id,
    metadata: {
      grantId: grant.id,
      requestedByUserId: request.requestedByUserId,
      permission,
      expiresAt: grantExpiresAt.toISOString(),
      ttlMinutes: Math.max(0, Math.ceil((grantExpiresAt.getTime() - now.getTime()) / 60000)),
    },
  });

  return { request: updatedRequest, grant };
}

export async function denySensitiveAccessRequest(
  input: DenySensitiveAccessRequestInput,
): Promise<SensitiveAccessRequest> {
  const now = input.now ?? new Date();
  const reason = validateReason(input.reason);
  const [request] = await db
    .select()
    .from(sensitiveAccessRequestsTable)
    .where(eq(sensitiveAccessRequestsTable.id, input.requestId))
    .limit(1);

  if (!request) throw new Error("Sensitive access request not found.");
  if (request.status !== "pending") throw new Error("Sensitive access request is not pending.");

  const [updatedRequest] = await db
    .update(sensitiveAccessRequestsTable)
    .set({
      deniedByUserId: input.deniedByUserId,
      deniedAt: now,
      status: "denied",
      updatedAt: now,
    })
    .where(eq(sensitiveAccessRequestsTable.id, request.id))
    .returning();

  await writeSensitiveAuditLog({
    userId: input.deniedByUserId,
    tenantId: request.tenantId,
    role: "approver",
    action: "sensitive_access_denied",
    resourceType: "sensitive_access_requests",
    resourceId: request.id,
    dataClassificationLevel: request.dataClassificationLevel as FieldgridDataClassificationLevel,
    accessType: "deny",
    dataScope: request.dataScope as FieldgridDataScope,
    reason,
    approvalRequestId: request.id,
    metadata: { requestedByUserId: request.requestedByUserId },
  });

  return updatedRequest;
}

export async function revokeSensitiveAccessGrant(
  input: RevokeSensitiveAccessGrantInput,
): Promise<SensitiveAccessGrant> {
  const now = input.now ?? new Date();
  const reason = validateReason(input.reason);
  const [grant] = await db
    .select()
    .from(sensitiveAccessGrantsTable)
    .where(eq(sensitiveAccessGrantsTable.id, input.grantId))
    .limit(1);

  if (!grant) throw new Error("Sensitive access grant not found.");
  if (grant.revokedAt) return grant;

  const [updatedGrant] = await db
    .update(sensitiveAccessGrantsTable)
    .set({ revokedAt: now })
    .where(eq(sensitiveAccessGrantsTable.id, input.grantId))
    .returning();

  await db
    .update(sensitiveAccessRequestsTable)
    .set({ status: "revoked", updatedAt: now })
    .where(eq(sensitiveAccessRequestsTable.id, grant.requestId));

  await writeSensitiveAuditLog({
    userId: input.revokedByUserId,
    tenantId: grant.tenantId,
    role: "approver",
    action: "sensitive_access_revoked",
    resourceType: "sensitive_access_grants",
    resourceId: grant.id,
    dataClassificationLevel: classificationForScope(grant.scope as FieldgridDataScope),
    accessType: grant.permission as FieldgridAccessLevel,
    dataScope: grant.scope as FieldgridDataScope,
    reason,
    approvalRequestId: grant.requestId,
    metadata: { userId: grant.userId },
  });

  return updatedGrant;
}

export async function createBreakGlassSensitiveAccessGrant(
  input: BreakGlassSensitiveAccessInput,
): Promise<{ request: SensitiveAccessRequest; grant: SensitiveAccessGrant }> {
  const window = validateSensitiveAccessWindow(input);
  if (!window.success) throw new Error(window.message);
  const reason = validateReason(input.reason);
  const dataClassificationLevel = classificationForScope(input.scope);

  const [request] = await db
    .insert(sensitiveAccessRequestsTable)
    .values({
      tenantId: input.tenantId,
      requestedByUserId: input.userId,
      requestedRole: input.role,
      dataScope: input.scope,
      dataClassificationLevel,
      reason,
      supportTicketReference: input.supportTicketReference?.trim() || null,
      approvalRequiredFrom: "break_glass",
      approvedByUserId: input.userId,
      approvedAt: input.now ?? new Date(),
      status: "approved",
      expiresAt: window.expiresAt,
    })
    .returning();

  const [grant] = await db
    .insert(sensitiveAccessGrantsTable)
    .values({
      requestId: request.id,
      tenantId: input.tenantId,
      userId: input.userId,
      scope: input.scope,
      permission: input.permission,
      expiresAt: window.expiresAt,
    })
    .returning();

  await writeSensitiveAuditLog({
    userId: input.userId,
    tenantId: input.tenantId,
    role: input.role,
    action: "sensitive_access_break_glass_granted",
    resourceType: "sensitive_access_grants",
    resourceId: grant.id,
    dataClassificationLevel,
    accessType: "break_glass",
    dataScope: input.scope,
    reason,
    approvalRequestId: request.id,
    metadata: {
      permission: input.permission,
      supportTicketReference: input.supportTicketReference?.trim() || null,
      expiresAt: window.expiresAt.toISOString(),
      ttlMinutes: window.ttlMinutes,
    },
  });

  return { request, grant };
}

export async function auditSensitiveAccessUse(input: {
  userId: string;
  tenantId: string;
  role: string;
  scope: FieldgridDataScope;
  accessType: FieldgridAccessLevel;
  resourceType: string;
  resourceId?: string | null;
  grantId?: string | null;
  reason?: string | null;
  exportDownload?: boolean;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await writeSensitiveAuditLog({
    userId: input.userId,
    tenantId: input.tenantId,
    role: input.role,
    action: input.exportDownload ? "sensitive_access_export_download" : "sensitive_access_used",
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    dataClassificationLevel: classificationForScope(input.scope),
    accessType: input.accessType,
    dataScope: input.scope,
    reason: input.reason ?? null,
    approvalRequestId: input.grantId ?? null,
    exportDownload: input.exportDownload ?? false,
    metadata: input.metadata ?? null,
  });
}

export async function listSensitiveAccessRequests(input: {
  tenantId?: string | null;
  limit?: number;
} = {}): Promise<SensitiveAccessRequest[]> {
  return db
    .select()
    .from(sensitiveAccessRequestsTable)
    .where(input.tenantId ? eq(sensitiveAccessRequestsTable.tenantId, input.tenantId) : undefined)
    .orderBy(desc(sensitiveAccessRequestsTable.createdAt))
    .limit(Math.max(25, Math.min(500, input.limit ?? 200)));
}

export async function listSensitiveAccessGrants(input: {
  tenantId?: string | null;
  onlyActive?: boolean;
  now?: Date;
  limit?: number;
} = {}): Promise<SensitiveAccessGrant[]> {
  const now = input.now ?? new Date();
  const conditions = [
    input.tenantId ? eq(sensitiveAccessGrantsTable.tenantId, input.tenantId) : undefined,
    input.onlyActive ? lte(sensitiveAccessGrantsTable.createdAt, now) : undefined,
    input.onlyActive ? gt(sensitiveAccessGrantsTable.expiresAt, now) : undefined,
    input.onlyActive ? isNull(sensitiveAccessGrantsTable.revokedAt) : undefined,
  ].filter(Boolean);

  return db
    .select()
    .from(sensitiveAccessGrantsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(sensitiveAccessGrantsTable.createdAt))
    .limit(Math.max(25, Math.min(500, input.limit ?? 200)));
}

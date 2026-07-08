"use server";

import { db } from "@workspace/db";
import {
  approveSensitiveAccessRequest,
  createBreakGlassSensitiveAccessGrant,
  createSensitiveAccessRequest,
  denySensitiveAccessRequest,
  FIELDGRID_SCOPE_CLASSIFICATION,
  FIELDGRID_SENSITIVE_ACCESS_MAX_TTL_MINUTES,
  listSensitiveAccessGrants,
  listSensitiveAccessRequests,
  normalizePlatformRole,
  revokeSensitiveAccessGrant,
  tenantsTable,
  type FieldgridAccessLevel,
  type FieldgridDataScope,
} from "@workspace/db";
import { asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin, requirePlatformSupportUser } from "@/lib/auth/platform";
import type { ActionResult } from "./customers";

const SENSITIVE_SCOPE_OPTIONS = Object.keys(FIELDGRID_SCOPE_CLASSIFICATION) as FieldgridDataScope[];
const SENSITIVE_PERMISSION_OPTIONS: FieldgridAccessLevel[] = ["full_read", "export", "masked_read"];

export type SensitiveAccessTenantOption = {
  id: string;
  name: string;
};

export type SensitiveAccessRequestRow = {
  id: string;
  tenantId: string;
  tenantName: string;
  requestedByUserId: string;
  requestedRole: string;
  scope: FieldgridDataScope;
  classification: number;
  reason: string;
  supportTicketReference: string | null;
  approvalRequiredFrom: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  deniedByUserId: string | null;
  deniedAt: string | null;
};

export type SensitiveAccessGrantRow = {
  id: string;
  requestId: string;
  tenantId: string;
  tenantName: string;
  userId: string;
  scope: FieldgridDataScope;
  permission: FieldgridAccessLevel;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  status: "active" | "expired" | "revoked";
  isActive: boolean;
};

export type SensitiveAccessDashboard = {
  generatedAt: string;
  tenants: SensitiveAccessTenantOption[];
  requests: SensitiveAccessRequestRow[];
  pendingRequests: SensitiveAccessRequestRow[];
  activeGrants: SensitiveAccessGrantRow[];
  grants: SensitiveAccessGrantRow[];
  scopeOptions: Array<{ value: FieldgridDataScope; label: string; classification: number }>;
  permissionOptions: FieldgridAccessLevel[];
  maxTtlMinutes: number;
};

function formValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function parseDurationMinutes(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function parseScope(value: string): FieldgridDataScope {
  if (!SENSITIVE_SCOPE_OPTIONS.includes(value as FieldgridDataScope)) {
    throw new Error("Ongeldige sensitive data scope.");
  }
  return value as FieldgridDataScope;
}

function parsePermission(value: string): FieldgridAccessLevel {
  if (!SENSITIVE_PERMISSION_OPTIONS.includes(value as FieldgridAccessLevel)) {
    throw new Error("Ongeldige sensitive access permissie.");
  }
  return value as FieldgridAccessLevel;
}

function revalidateSensitiveAccess(): void {
  revalidatePath("/platform");
  revalidatePath("/platform/security");
}

export async function listSensitiveAccessDashboard(): Promise<SensitiveAccessDashboard> {
  await requirePlatformAdmin();

  const [requests, grants, tenants] = await Promise.all([
    listSensitiveAccessRequests({ limit: 200 }),
    listSensitiveAccessGrants({ limit: 200 }),
    db.select({ id: tenantsTable.id, name: tenantsTable.name }).from(tenantsTable).orderBy(asc(tenantsTable.name)),
  ]);
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const now = new Date();
  const requestRows: SensitiveAccessRequestRow[] = requests.map((request) => ({
    id: request.id,
    tenantId: request.tenantId,
    tenantName: tenantNames.get(request.tenantId) ?? "Onbekende tenant",
    requestedByUserId: request.requestedByUserId,
    requestedRole: request.requestedRole,
    scope: request.dataScope as FieldgridDataScope,
    classification: request.dataClassificationLevel,
    reason: request.reason,
    supportTicketReference: request.supportTicketReference,
    approvalRequiredFrom: request.approvalRequiredFrom,
    status: request.status,
    expiresAt: request.expiresAt.toISOString(),
    createdAt: request.createdAt.toISOString(),
    approvedByUserId: request.approvedByUserId,
    approvedAt: request.approvedAt?.toISOString() ?? null,
    deniedByUserId: request.deniedByUserId,
    deniedAt: request.deniedAt?.toISOString() ?? null,
  }));
  const grantRows: SensitiveAccessGrantRow[] = grants.map((grant) => {
    const revoked = Boolean(grant.revokedAt);
    const active = !revoked && grant.expiresAt > now;
    return {
      id: grant.id,
      requestId: grant.requestId,
      tenantId: grant.tenantId,
      tenantName: tenantNames.get(grant.tenantId) ?? "Onbekende tenant",
      userId: grant.userId,
      scope: grant.scope as FieldgridDataScope,
      permission: grant.permission as FieldgridAccessLevel,
      expiresAt: grant.expiresAt.toISOString(),
      revokedAt: grant.revokedAt?.toISOString() ?? null,
      createdAt: grant.createdAt.toISOString(),
      status: revoked ? "revoked" : active ? "active" : "expired",
      isActive: active,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    tenants,
    requests: requestRows,
    pendingRequests: requestRows.filter((request) => request.status === "pending"),
    activeGrants: grantRows.filter((grant) => grant.isActive),
    grants: grantRows,
    scopeOptions: SENSITIVE_SCOPE_OPTIONS.map((scope) => ({
      value: scope,
      label: scope.replace(/_/g, " "),
      classification: FIELDGRID_SCOPE_CLASSIFICATION[scope],
    })),
    permissionOptions: SENSITIVE_PERMISSION_OPTIONS,
    maxTtlMinutes: FIELDGRID_SENSITIVE_ACCESS_MAX_TTL_MINUTES,
  };
}

export async function requestSensitiveAccessFromForm(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformSupportUser();
  const role = normalizePlatformRole(actor.role);
  if (!role) return { success: false, message: "Platformrol kan niet worden bepaald." };

  const tenantId = formValue(formData, "tenantId");
  const scope = parseScope(formValue(formData, "scope"));
  const permission = parsePermission(formValue(formData, "permission"));
  const reason = formValue(formData, "reason");
  const supportTicketReference = formValue(formData, "supportTicketReference") || null;
  const durationMinutes = parseDurationMinutes(formValue(formData, "durationMinutes"));

  if (!tenantId) return { success: false, message: "Tenant is verplicht." };

  try {
    await createSensitiveAccessRequest({
      tenantId,
      requestedByUserId: actor.userId,
      requestedRole: role,
      scope,
      permission,
      reason,
      supportTicketReference,
      durationMinutes,
      approvalRequiredFrom: "platform_owner",
    });
    revalidateSensitiveAccess();
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Sensitive access aanvragen mislukt." };
  }
}

export async function approveSensitiveAccessRequestFromForm(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const requestId = formValue(formData, "requestId");
  const permission = formValue(formData, "permission");
  const durationMinutes = parseDurationMinutes(formValue(formData, "durationMinutes"));
  const reason = formValue(formData, "reason") || null;

  try {
    await approveSensitiveAccessRequest({
      requestId,
      approvedByUserId: actor.userId,
      permission: permission ? parsePermission(permission) : null,
      durationMinutes,
      reason,
    });
    revalidateSensitiveAccess();
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Sensitive access goedkeuren mislukt." };
  }
}

export async function denySensitiveAccessRequestFromForm(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const requestId = formValue(formData, "requestId");
  const reason = formValue(formData, "reason");

  try {
    await denySensitiveAccessRequest({ requestId, deniedByUserId: actor.userId, reason });
    revalidateSensitiveAccess();
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Sensitive access weigeren mislukt." };
  }
}

export async function revokeSensitiveAccessGrantFromForm(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const grantId = formValue(formData, "grantId");
  const reason = formValue(formData, "reason");

  try {
    await revokeSensitiveAccessGrant({ grantId, revokedByUserId: actor.userId, reason });
    revalidateSensitiveAccess();
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Sensitive access intrekken mislukt." };
  }
}

export async function createBreakGlassSensitiveAccessFromForm(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const role = normalizePlatformRole(actor.role);
  if (!role) return { success: false, message: "Platformrol kan niet worden bepaald." };

  const tenantId = formValue(formData, "tenantId");
  const scope = parseScope(formValue(formData, "scope"));
  const permission = parsePermission(formValue(formData, "permission"));
  const reason = formValue(formData, "reason");
  const supportTicketReference = formValue(formData, "supportTicketReference") || null;
  const durationMinutes = parseDurationMinutes(formValue(formData, "durationMinutes"));

  if (!tenantId) return { success: false, message: "Tenant is verplicht." };

  try {
    await createBreakGlassSensitiveAccessGrant({
      tenantId,
      userId: actor.userId,
      role,
      scope,
      permission,
      reason,
      supportTicketReference,
      durationMinutes,
    });
    revalidateSensitiveAccess();
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Break-glass sensitive access mislukt." };
  }
}

"use server";

import { db } from "@workspace/db";
import {
  auditLogTable,
  FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE,
  FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES,
  FIELDGRID_SUPPORT_TENANT_COOKIE,
  platformUsersTable,
  supportAccessAuditLogTable,
  supportAccessGrantsTable,
  tenantsTable,
  validateSupportBreakGlassGrant,
} from "@workspace/db";
import { and, desc, eq, gt, isNull, lte, type SQL } from "drizzle-orm";
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

export type PlatformSecurityEventCategory = "support" | "download" | "denial" | "platform";
export type PlatformSecurityEventScope = "support" | "tenant" | "platform";
export type PlatformSecurityEventSource = "support_access_audit_log" | "audit_log";

export type PlatformSecurityDashboardFilters = {
  tenantId?: string;
  actorId?: string;
  eventType?: PlatformSecurityEventCategory | "all";
  scope?: PlatformSecurityEventScope | "all";
  limit?: number;
};

export type PlatformSecurityTenantOption = {
  id: string;
  name: string;
};

export type PlatformSecurityEventRow = {
  id: string;
  source: PlatformSecurityEventSource;
  scope: PlatformSecurityEventScope;
  categories: PlatformSecurityEventCategory[];
  tenantId: string | null;
  tenantName: string;
  actorId: string;
  grantId: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type PlatformSecurityDashboard = {
  generatedAt: string;
  filters: Required<Pick<PlatformSecurityDashboardFilters, "eventType" | "scope">> &
    Pick<PlatformSecurityDashboardFilters, "tenantId" | "actorId">;
  tenantOptions: PlatformSecurityTenantOption[];
  events: PlatformSecurityEventRow[];
  supportEvents: PlatformSecurityEventRow[];
  downloadEvents: PlatformSecurityEventRow[];
  denialEvents: PlatformSecurityEventRow[];
  platformEvents: PlatformSecurityEventRow[];
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
  revalidatePath("/platform/security");
}

function securityEventText(event: PlatformSecurityEventRow): string {
  return `${event.source} ${event.action} ${event.resource ?? ""} ${event.resourceId ?? ""} ${JSON.stringify(event.metadata ?? {})}`.toLowerCase();
}

function isDownloadSecurityEvent(event: PlatformSecurityEventRow): boolean {
  const text = securityEventText(event);
  return ["download", "signed_url", "signed-url", "pdf"].some((marker) => text.includes(marker));
}

function isDenialSecurityEvent(event: PlatformSecurityEventRow): boolean {
  const text = securityEventText(event);
  return [
    "denied",
    "denial",
    "deny",
    "geweigerd",
    "forbidden",
    "module_denied",
    "module-denied",
    "module_denial",
    "module-denial",
    "storage_denied",
    "storage-denied",
    "storage_denial",
    "storage-denial",
    "expired",
    "wrong_tenant",
    "wrong-tenant",
    "cross-tenant",
    "direct_id",
    "direct-id",
    "path_guess",
    "path-guess",
  ].some((marker) => text.includes(marker));
}

function isPlatformSecurityEvent(event: PlatformSecurityEventRow): boolean {
  const text = securityEventText(event);
  return (
    event.scope === "platform" ||
    event.action.startsWith("grant_") ||
    ["platform", "tenant", "module", "sector", "plan", "support_access_grants"].some((marker) => text.includes(marker))
  );
}

function isSupportSecurityEvent(event: PlatformSecurityEventRow): boolean {
  const text = securityEventText(event);
  return event.scope === "support" || ["support", "grant_", "support_access_grants"].some((marker) => text.includes(marker));
}

function securityEventCategories(event: Omit<PlatformSecurityEventRow, "categories">): PlatformSecurityEventCategory[] {
  const categories: PlatformSecurityEventCategory[] = [];
  const candidate = { ...event, categories } satisfies PlatformSecurityEventRow;

  if (isSupportSecurityEvent(candidate)) categories.push("support");
  if (isDownloadSecurityEvent(candidate)) categories.push("download");
  if (isDenialSecurityEvent(candidate)) categories.push("denial");
  if (isPlatformSecurityEvent(candidate)) categories.push("platform");

  if (categories.length > 0) return categories;
  if (event.scope === "support") return ["support"];
  if (event.scope === "platform") return ["platform"];
  return [];
}

function normalizeSecurityFilters(
  filters: PlatformSecurityDashboardFilters = {},
): Required<Pick<PlatformSecurityDashboardFilters, "eventType" | "scope" | "limit">> &
  Pick<PlatformSecurityDashboardFilters, "tenantId" | "actorId"> {
  const eventType = ["support", "download", "denial", "platform"].includes(filters.eventType ?? "")
    ? filters.eventType as PlatformSecurityEventCategory
    : "all";
  const scope = ["support", "tenant", "platform"].includes(filters.scope ?? "")
    ? filters.scope as PlatformSecurityEventScope
    : "all";
  const limit = Number.isFinite(filters.limit ?? NaN)
    ? Math.max(25, Math.min(500, Math.round(filters.limit!)))
    : 300;

  return {
    tenantId: filters.tenantId?.trim() || undefined,
    actorId: filters.actorId?.trim() || undefined,
    eventType,
    scope,
    limit,
  };
}

function matchesPlatformSecurityFilter(
  event: PlatformSecurityEventRow,
  filters: ReturnType<typeof normalizeSecurityFilters>,
): boolean {
  if (filters.scope !== "all" && event.scope !== filters.scope) return false;
  if (filters.eventType !== "all" && !event.categories.includes(filters.eventType)) return false;
  return true;
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

  const breakGlassValidation = validateSupportBreakGlassGrant({ reason, startsAt, expiresAt });
  if (!breakGlassValidation.success) return breakGlassValidation;

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
    metadata: {
      platformUserId,
      reason,
      startsAt: startsAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      grantType: FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE,
      ttlMinutes: breakGlassValidation.ttlMinutes,
      maxTtlMinutes: FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES,
    },
  });

  revalidatePath("/platform");
  revalidatePath("/platform/security");
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
    metadata: { grantType: FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE },
  });

  revalidatePath("/platform");
  revalidatePath("/platform/security");
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
      grantType: FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE,
      ttlSeconds: Math.max(0, Math.floor((grant.expiresAt.getTime() - Date.now()) / 1000)),
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

export async function listPlatformSecurityDashboard(
  filters: PlatformSecurityDashboardFilters = {},
): Promise<PlatformSecurityDashboard> {
  await requirePlatformAdmin();

  const normalizedFilters = normalizeSecurityFilters(filters);
  const supportConditions: SQL[] = [];
  const auditConditions: SQL[] = [];

  if (normalizedFilters.tenantId) {
    supportConditions.push(eq(supportAccessAuditLogTable.tenantId, normalizedFilters.tenantId));
    auditConditions.push(eq(auditLogTable.tenantId, normalizedFilters.tenantId));
  }
  if (normalizedFilters.actorId) {
    supportConditions.push(eq(supportAccessAuditLogTable.platformUserId, normalizedFilters.actorId));
    auditConditions.push(eq(auditLogTable.userId, normalizedFilters.actorId));
  }

  const [supportRows, auditRows, tenantRows] = await Promise.all([
    db
      .select({
        id: supportAccessAuditLogTable.id,
        grantId: supportAccessAuditLogTable.grantId,
        tenantId: supportAccessAuditLogTable.tenantId,
        tenantName: tenantsTable.name,
        platformUserId: supportAccessAuditLogTable.platformUserId,
        action: supportAccessAuditLogTable.action,
        resource: supportAccessAuditLogTable.resource,
        resourceId: supportAccessAuditLogTable.resourceId,
        metadata: supportAccessAuditLogTable.metadata,
        createdAt: supportAccessAuditLogTable.createdAt,
      })
      .from(supportAccessAuditLogTable)
      .innerJoin(tenantsTable, eq(supportAccessAuditLogTable.tenantId, tenantsTable.id))
      .where(supportConditions.length > 0 ? and(...supportConditions) : undefined)
      .orderBy(desc(supportAccessAuditLogTable.createdAt))
      .limit(normalizedFilters.limit),
    db
      .select({
        id: auditLogTable.id,
        tenantId: auditLogTable.tenantId,
        tenantName: tenantsTable.name,
        userId: auditLogTable.userId,
        action: auditLogTable.action,
        resource: auditLogTable.resource,
        resourceId: auditLogTable.resourceId,
        metadata: auditLogTable.metadata,
        createdAt: auditLogTable.createdAt,
      })
      .from(auditLogTable)
      .leftJoin(tenantsTable, eq(auditLogTable.tenantId, tenantsTable.id))
      .where(auditConditions.length > 0 ? and(...auditConditions) : undefined)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(normalizedFilters.limit),
    db
      .select({ id: tenantsTable.id, name: tenantsTable.name })
      .from(tenantsTable)
      .orderBy(tenantsTable.name),
  ]);

  const supportEvents = supportRows.map((row): PlatformSecurityEventRow => {
    const eventWithoutCategories: Omit<PlatformSecurityEventRow, "categories"> = {
      id: row.id,
      source: "support_access_audit_log",
      scope: "support",
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      actorId: row.platformUserId,
      grantId: row.grantId,
      action: row.action,
      resource: row.resource,
      resourceId: row.resourceId,
      metadata: row.metadata as Record<string, unknown> | null,
      createdAt: row.createdAt.toISOString(),
    };
    return { ...eventWithoutCategories, categories: securityEventCategories(eventWithoutCategories) };
  });

  const auditEvents = auditRows.map((row): PlatformSecurityEventRow => {
    const eventWithoutCategories: Omit<PlatformSecurityEventRow, "categories"> = {
      id: row.id,
      source: "audit_log",
      scope: row.tenantId ? "tenant" : "platform",
      tenantId: row.tenantId,
      tenantName: row.tenantName ?? "Platform",
      actorId: row.userId,
      grantId: null,
      action: row.action,
      resource: row.resource,
      resourceId: row.resourceId,
      metadata: row.metadata as Record<string, unknown> | null,
      createdAt: row.createdAt.toISOString(),
    };
    return { ...eventWithoutCategories, categories: securityEventCategories(eventWithoutCategories) };
  });

  const events = [...supportEvents, ...auditEvents]
    .filter((event) => matchesPlatformSecurityFilter(event, normalizedFilters))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, normalizedFilters.limit);

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      tenantId: normalizedFilters.tenantId,
      actorId: normalizedFilters.actorId,
      eventType: normalizedFilters.eventType,
      scope: normalizedFilters.scope,
    },
    tenantOptions: tenantRows.map((row) => ({ id: row.id, name: row.name })),
    events,
    supportEvents: events.filter(isSupportSecurityEvent).slice(0, 40),
    downloadEvents: events.filter(isDownloadSecurityEvent).slice(0, 40),
    denialEvents: events.filter(isDenialSecurityEvent).slice(0, 40),
    platformEvents: events.filter(isPlatformSecurityEvent).slice(0, 40),
  };
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

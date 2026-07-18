"use server";

import { db } from "@workspace/db";
import {
  auditLogTable,
  FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE,
  FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES,
  FIELDGRID_SUPPORT_TENANT_COOKIE,
  platformUsersTable,
  issueCredentialRecoveryChallenge,
  markCredentialRecoveryDelivery,
  resolveCredentialRecoveryOrigin,
  supportAccessAuditLogTable,
  supportAccessGrantsTable,
  tenantsTable,
  validateSupportBreakGlassGrant,
} from "@workspace/db";
import { and, desc, eq, gt, gte, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { provisionPortalUserForActivation } from "@/lib/auth/portal-invites";
import {
  buildPasswordResetCodeEmail,
  platformAdminUrl,
  sendEmailWithResult,
} from "@/lib/email";
import {
  requirePlatformAdmin,
  requirePlatformSupportUser,
  requireSupportAccess,
  writeSupportAccessAuditLog,
} from "@/lib/auth/platform";
import { withHostOnlyCookieOptions } from "@/lib/supabase/session-cookies";
import type { ActionResult } from "./customers";

export type PlatformRole = "owner" | "admin" | "support";
export type PlatformUserStatus = "active" | "inactive" | "suspended";
export type PlatformUserAuthStatus = "confirmed" | "invited" | "unknown";

export type PlatformUserRow = {
  id: string;
  userId: string;
  email: string | null;
  role: PlatformRole;
  status: PlatformUserStatus;
  createdAt: string;
  lastSeenAt: string | null;
  lastSignInAt: string | null;
  authStatus: PlatformUserAuthStatus;
  mfaStatus: "later";
};

export type SupportAccessGrantRow = {
  id: string;
  tenantId: string;
  tenantName: string;
  platformUserId: string;
  reason: string;
  scope: "tenant";
  startsAt: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  status: "active" | "scheduled" | "expired" | "revoked";
  isActive: boolean;
  ttlMinutes: number;
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
export type PlatformSecuritySeverity = "info" | "warning" | "critical";
export type PlatformSecurityDenialType =
  | "direct_id_denial"
  | "module_denial"
  | "storage_denial"
  | "tenant_mismatch"
  | "platform_access_denial"
  | "other_denial";

export type PlatformSecurityDashboardFilters = {
  tenantId?: string;
  actorId?: string;
  eventType?: PlatformSecurityEventCategory | "all";
  scope?: PlatformSecurityEventScope | "all";
  resource?: string;
  dateFrom?: string;
  dateTo?: string;
  severity?: PlatformSecuritySeverity | "all";
  supportGrantId?: string;
  limit?: number;
};

type NormalizedPlatformSecurityDashboardFilters = {
  tenantId?: string;
  actorId?: string;
  resource?: string;
  dateFrom?: string;
  dateTo?: string;
  supportGrantId?: string;
  eventType: PlatformSecurityEventCategory | "all";
  scope: PlatformSecurityEventScope | "all";
  severity: PlatformSecuritySeverity | "all";
  limit: number;
};

export type PlatformSecurityTenantOption = {
  id: string;
  name: string;
};

export type PlatformSecurityResourceOption = {
  value: string;
  label: string;
};

export type PlatformSecuritySupportGrantOption = {
  id: string;
  tenantName: string;
  platformUserId: string;
  expiresAt: string;
  status: SupportAccessGrantRow["status"];
};

export type PlatformSecurityEventRow = {
  id: string;
  source: PlatformSecurityEventSource;
  scope: PlatformSecurityEventScope;
  categories: PlatformSecurityEventCategory[];
  severity: PlatformSecuritySeverity;
  denialType: PlatformSecurityDenialType | null;
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
  filters: NormalizedPlatformSecurityDashboardFilters;
  tenantOptions: PlatformSecurityTenantOption[];
  resourceOptions: PlatformSecurityResourceOption[];
  supportGrantOptions: PlatformSecuritySupportGrantOption[];
  events: PlatformSecurityEventRow[];
  supportEvents: PlatformSecurityEventRow[];
  downloadEvents: PlatformSecurityEventRow[];
  denialEvents: PlatformSecurityEventRow[];
  platformEvents: PlatformSecurityEventRow[];
  activeSupportGrants: SupportAccessGrantRow[];
  supportAccessLog: PlatformSecurityEventRow[];
  severityCounts: Record<PlatformSecuritySeverity, number>;
  denialBreakdown: Record<PlatformSecurityDenialType, number>;
};

function normalizePlatformRole(role: string): PlatformRole {
  return ["owner", "admin", "support"].includes(role)
    ? (role as PlatformRole)
    : "support";
}

function normalizePlatformStatus(status: string): PlatformUserStatus {
  return ["active", "inactive", "suspended"].includes(status)
    ? (status as PlatformUserStatus)
    : "active";
}

function formValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

type PlatformUserRecord = typeof platformUsersTable.$inferSelect;

type PlatformUserActor = {
  id: string;
  userId: string;
  role: PlatformRole;
};

type PlatformAuthUserSnapshot = {
  email: string | null;
  authStatus: PlatformUserAuthStatus;
  lastSignInAt: string | null;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

async function writePlatformAuditLog(input: {
  actor: PlatformUserActor;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await db.insert(auditLogTable).values({
    userId: input.actor.userId,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? null,
  });
}

async function hasAnotherActiveOwner(targetId: string): Promise<boolean> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(platformUsersTable)
    .where(
      and(
        eq(platformUsersTable.role, "owner"),
        eq(platformUsersTable.status, "active"),
        ne(platformUsersTable.id, targetId),
      ),
    );

  return Number(row?.count ?? 0) > 0;
}

async function validatePlatformUserManagement(input: {
  actor: PlatformUserActor;
  target: PlatformUserRecord | null;
  nextRole: PlatformRole;
  nextStatus: PlatformUserStatus;
}): Promise<ActionResult> {
  const { actor, target, nextRole, nextStatus } = input;

  if (actor.role === "support") {
    return { success: false, message: "Support kan platformgebruikers niet beheren." };
  }

  if (actor.role !== "owner" && (nextRole === "owner" || target?.role === "owner")) {
    return { success: false, message: "Alleen owners kunnen owner-rollen aanmaken of wijzigen." };
  }

  if (target?.userId === actor.userId && (target.role !== nextRole || target.status !== nextStatus)) {
    return { success: false, message: "U kunt uw eigen platformrol of status niet via deze pagina wijzigen." };
  }

  const removesActiveOwner =
    target?.role === "owner" &&
    target.status === "active" &&
    (nextRole !== "owner" || nextStatus !== "active");
  if (removesActiveOwner && !(await hasAnotherActiveOwner(target.id))) {
    return { success: false, message: "Er moet altijd minimaal een actieve platform-owner overblijven." };
  }

  return { success: true };
}

async function platformAuthUsersById(userIds: string[]): Promise<Map<string, PlatformAuthUserSnapshot>> {
  if (userIds.length === 0) return new Map();

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return new Map();

    const requestedIds = new Set(userIds);
    const users = new Map<string, PlatformAuthUserSnapshot>();
    for (const user of data.users) {
      if (!requestedIds.has(user.id)) continue;
      const confirmedAt = user.confirmed_at ?? user.email_confirmed_at ?? null;
      users.set(user.id, {
        email: user.email ?? null,
        authStatus: confirmedAt ? "confirmed" : "invited",
        lastSignInAt: user.last_sign_in_at ?? null,
      });
    }
    return users;
  } catch {
    return new Map();
  }
}

function revalidatePlatformTenant(tenantId: string): void {
  revalidatePath("/platform");
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath("/platform/security");
}

function revalidatePlatformUsers(): void {
  revalidatePath("/platform");
  revalidatePath("/platform/users");
  revalidatePath("/platform/security");
}

function supportGrantStatusFromDates(input: {
  startsAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  now?: Date;
}): SupportAccessGrantRow["status"] {
  const now = input.now ?? new Date();
  if (input.revokedAt) return "revoked";
  if (input.startsAt > now) return "scheduled";
  if (input.expiresAt <= now) return "expired";
  return "active";
}

function supportGrantTtlMinutes(startsAt: Date, expiresAt: Date): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - startsAt.getTime()) / 60000));
}

function mapSupportGrantRow(row: {
  id: string;
  tenantId: string;
  tenantName: string;
  platformUserId: string;
  reason: string;
  startsAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}): SupportAccessGrantRow {
  const status = supportGrantStatusFromDates(row);
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    platformUserId: row.platformUserId,
    reason: row.reason,
    scope: "tenant",
    startsAt: row.startsAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    status,
    isActive: status === "active",
    ttlMinutes: supportGrantTtlMinutes(row.startsAt, row.expiresAt),
  };
}

type PlatformSecurityEventTextSource = Pick<
  PlatformSecurityEventRow,
  "source" | "scope" | "action" | "resource" | "resourceId" | "metadata"
>;

function securityEventText(event: PlatformSecurityEventTextSource): string {
  return `${event.source} ${event.action} ${event.resource ?? ""} ${event.resourceId ?? ""} ${JSON.stringify(event.metadata ?? {})}`.toLowerCase();
}

function isDownloadSecurityEvent(event: PlatformSecurityEventTextSource): boolean {
  const text = securityEventText(event);
  return ["download", "signed_url", "signed-url", "pdf"].some((marker) => text.includes(marker));
}

function platformSecurityDenialType(event: PlatformSecurityEventTextSource): PlatformSecurityDenialType | null {
  const text = securityEventText(event);

  if (["direct_id", "direct-id", "direct id", "id_guess", "id-guess"].some((marker) => text.includes(marker))) {
    return "direct_id_denial";
  }
  if (["module_denied", "module-denied", "module_denial", "module-denial", "module toegang geweigerd"].some((marker) => text.includes(marker))) {
    return "module_denial";
  }
  if (["storage_denied", "storage-denied", "storage_denial", "storage-denial", "path_guess", "path-guess", "storage path"].some((marker) => text.includes(marker))) {
    return "storage_denial";
  }
  if (["tenant_mismatch", "tenant-mismatch", "wrong_tenant", "wrong-tenant", "cross-tenant", "cross_tenant"].some((marker) => text.includes(marker))) {
    return "tenant_mismatch";
  }
  if (["platform_access_denied", "platform-access-denied", "platform access denied", "platformtoegang geweigerd"].some((marker) => text.includes(marker))) {
    return "platform_access_denial";
  }
  if ([
    "denied",
    "denial",
    "deny",
    "geweigerd",
    "forbidden",
    "expired",
  ].some((marker) => text.includes(marker))) {
    return "other_denial";
  }
  return null;
}

function isDenialSecurityEvent(event: PlatformSecurityEventTextSource): boolean {
  return platformSecurityDenialType(event) !== null;
}

function isPlatformSecurityEvent(event: PlatformSecurityEventTextSource): boolean {
  const text = securityEventText(event);
  return (
    event.scope === "platform" ||
    event.action.startsWith("grant_") ||
    ["platform", "tenant", "module", "sector", "plan", "support_access_grants"].some((marker) => text.includes(marker))
  );
}

function isSupportSecurityEvent(event: PlatformSecurityEventTextSource): boolean {
  const text = securityEventText(event);
  return event.scope === "support" || ["support", "grant_", "support_access_grants"].some((marker) => text.includes(marker));
}

function securityEventCategories(event: Omit<PlatformSecurityEventRow, "categories" | "severity" | "denialType">): PlatformSecurityEventCategory[] {
  const categories: PlatformSecurityEventCategory[] = [];

  if (isSupportSecurityEvent(event)) categories.push("support");
  if (isDownloadSecurityEvent(event)) categories.push("download");
  if (isDenialSecurityEvent(event)) categories.push("denial");
  if (isPlatformSecurityEvent(event)) categories.push("platform");

  if (categories.length > 0) return categories;
  if (event.scope === "support") return ["support"];
  if (event.scope === "platform") return ["platform"];
  return [];
}

function securityEventSeverity(event: PlatformSecurityEventTextSource): PlatformSecuritySeverity {
  const denialType = platformSecurityDenialType(event);
  if (
    denialType === "direct_id_denial" ||
    denialType === "storage_denial" ||
    denialType === "tenant_mismatch" ||
    denialType === "platform_access_denial"
  ) {
    return "critical";
  }
  if (denialType || event.action === "grant_create_denied" || event.action === "grant_revoked") return "warning";
  if (["grant_created", "support_mode_entered"].includes(event.action)) return "warning";
  return "info";
}

function parseDateFilter(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeSecurityFilters(
  filters: PlatformSecurityDashboardFilters = {},
): NormalizedPlatformSecurityDashboardFilters {
  const eventType = ["support", "download", "denial", "platform"].includes(filters.eventType ?? "")
    ? filters.eventType as PlatformSecurityEventCategory
    : "all";
  const scope = ["support", "tenant", "platform"].includes(filters.scope ?? "")
    ? filters.scope as PlatformSecurityEventScope
    : "all";
  const severity = ["info", "warning", "critical"].includes(filters.severity ?? "")
    ? filters.severity as PlatformSecuritySeverity
    : "all";
  const limit = Number.isFinite(filters.limit ?? NaN)
    ? Math.max(25, Math.min(500, Math.round(filters.limit!)))
    : 300;
  const dateFrom = parseDateFilter(filters.dateFrom)?.toISOString();
  const dateTo = parseDateFilter(filters.dateTo)?.toISOString();

  return {
    tenantId: filters.tenantId?.trim() || undefined,
    actorId: filters.actorId?.trim() || undefined,
    resource: filters.resource?.trim() || undefined,
    dateFrom,
    dateTo,
    supportGrantId: filters.supportGrantId?.trim() || undefined,
    eventType,
    scope,
    severity,
    limit,
  };
}

function matchesPlatformSecurityFilter(
  event: PlatformSecurityEventRow,
  filters: ReturnType<typeof normalizeSecurityFilters>,
): boolean {
  if (filters.scope !== "all" && event.scope !== filters.scope) return false;
  if (filters.eventType !== "all" && !event.categories.includes(filters.eventType)) return false;
  if (filters.severity !== "all" && event.severity !== filters.severity) return false;
  return true;
}

export async function listPlatformUsers(): Promise<PlatformUserRow[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select()
    .from(platformUsersTable)
    .orderBy(platformUsersTable.role, platformUsersTable.createdAt);
  const authUsers = await platformAuthUsersById(rows.map((row) => row.userId));

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    email: authUsers.get(row.userId)?.email ?? null,
    role: normalizePlatformRole(row.role),
    status: normalizePlatformStatus(row.status),
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    lastSignInAt: authUsers.get(row.userId)?.lastSignInAt ?? null,
    authStatus: authUsers.get(row.userId)?.authStatus ?? "unknown",
    mfaStatus: "later",
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
  const [target] = await db
    .select()
    .from(platformUsersTable)
    .where(eq(platformUsersTable.userId, userId))
    .limit(1);
  const policy = await validatePlatformUserManagement({
    actor,
    target: target ?? null,
    nextRole: role,
    nextStatus: status,
  });
  if (!policy.success) return policy;

  const [row] = await db
    .insert(platformUsersTable)
    .values({ userId, role, status, createdBy: actor.userId })
    .onConflictDoUpdate({
      target: platformUsersTable.userId,
      set: { role, status, updatedAt: new Date() },
    })
    .returning({ id: platformUsersTable.id });

  await writePlatformAuditLog({
    actor,
    action: target ? "platform_user_updated" : "platform_user_created",
    resource: "platform_users",
    resourceId: row.id,
    metadata: {
      userId,
      previousRole: target?.role ?? null,
      previousStatus: target?.status ?? null,
      role,
      status,
      source: "upsertPlatformUser",
    },
  });

  revalidatePlatformUsers();
  return { success: true, data: { id: row.id } };
}

export async function invitePlatformUserFromForm(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const actor = await requirePlatformAdmin();
  const email = normalizeEmail(formValue(formData, "email"));
  const role = normalizePlatformRole(formValue(formData, "role"));
  const status = normalizePlatformStatus(formValue(formData, "status") || "active");

  if (!email || !isValidEmail(email)) {
    return { success: false, message: "Vul een geldig e-mailadres in." };
  }

  const policy = await validatePlatformUserManagement({
    actor,
    target: null,
    nextRole: role,
    nextStatus: status,
  });
  if (!policy.success) return policy;

  let userId: string | null = null;
  try {
    const invite = await provisionPortalUserForActivation({
      email,
      fullName: email,
      portal: "platform-admin",
      tenantId: null,
      portalName: "Fieldgrid platformbeheer",
      activationUrl: `${platformAdminUrl()}/wachtwoord-vergeten?doel=activatie`,
      actorUserId: actor.userId,
      allowExistingActive: true,
    });
    userId = invite.user.id;
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Auth-beheer kon niet worden geladen.",
    };
  }

  if (!userId) {
    return { success: false, message: "Auth-beheer gaf geen gebruiker terug voor deze uitnodiging." };
  }

  const [row] = await db
    .insert(platformUsersTable)
    .values({ userId, role, status, createdBy: actor.userId })
    .onConflictDoUpdate({
      target: platformUsersTable.userId,
      set: { role, status, updatedAt: new Date() },
    })
    .returning({ id: platformUsersTable.id });

  await writePlatformAuditLog({
    actor,
    action: "platform_user_invited",
    resource: "platform_users",
    resourceId: row.id,
    metadata: {
      email,
      invitedUserId: userId,
      role,
      status,
    },
  });

  revalidatePlatformUsers();
  return { success: true, data: { id: row.id } };
}

export async function updatePlatformUserFromForm(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const platformUserId = formValue(formData, "platformUserId");
  const role = normalizePlatformRole(formValue(formData, "role"));
  const status = normalizePlatformStatus(formValue(formData, "status"));

  if (!platformUserId) {
    return { success: false, message: "Platformgebruiker ontbreekt." };
  }

  const [target] = await db
    .select()
    .from(platformUsersTable)
    .where(eq(platformUsersTable.id, platformUserId))
    .limit(1);
  if (!target) {
    return { success: false, message: "Platformgebruiker niet gevonden." };
  }

  const policy = await validatePlatformUserManagement({
    actor,
    target,
    nextRole: role,
    nextStatus: status,
  });
  if (!policy.success) return policy;

  await db
    .update(platformUsersTable)
    .set({ role, status, updatedAt: new Date() })
    .where(eq(platformUsersTable.id, target.id));

  await writePlatformAuditLog({
    actor,
    action: "platform_user_updated",
    resource: "platform_users",
    resourceId: target.id,
    metadata: {
      userId: target.userId,
      previousRole: target.role,
      previousStatus: target.status,
      role,
      status,
      source: "platform_users_page",
    },
  });

  revalidatePlatformUsers();
  return { success: true };
}

export async function sendPlatformUserPasswordResetFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  if (actor.role === "support") throw new Error("Support kan geen platformgebruikers resetten.");

  const platformUserId = formValue(formData, "platformUserId");
  if (!platformUserId) throw new Error("Platformgebruiker ontbreekt.");

  const [target] = await db
    .select()
    .from(platformUsersTable)
    .where(eq(platformUsersTable.id, platformUserId))
    .limit(1);
  if (!target) throw new Error("Platformgebruiker niet gevonden.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(target.userId);
  if (error || !data.user?.email) throw new Error(error?.message ?? "Auth-gebruiker heeft geen e-mailadres.");

  const email = data.user.email;
  const resetUrl = `${platformAdminUrl()}/wachtwoord-vergeten`;
  const configuredOrigin = new URL(resetUrl).origin;
  const allowedOrigins = (process.env["FIELDGRID_RECOVERY_ALLOWED_ORIGINS"] ?? configuredOrigin)
    .split(",").map((value) => value.trim()).filter(Boolean);
  const challenge = await issueCredentialRecoveryChallenge({
    surface: "platform-admin",
    purpose: "password-reset",
    tenantId: null,
    accountIdentifier: email,
    subjectUserId: target.userId,
    redirectOrigin: resolveCredentialRecoveryOrigin({
      configuredOrigin,
      allowedOrigins,
      allowHttpLocalhost: process.env.NODE_ENV !== "production",
    }),
    actorUserId: actor.userId,
    networkSignal: `actor:${actor.userId}`,
    clientSignal: "platform-user-reset",
  });
  if (challenge.status !== "issued" || !challenge.challengeId || !challenge.code) {
    throw new Error("Er is recent al een herstelmail verstuurd. Probeer het later opnieuw.");
  }
  const { subject, html } = buildPasswordResetCodeEmail({
    recipientName: String(data.user.user_metadata?.["full_name"] ?? data.user.user_metadata?.["name"] ?? email),
    portalName: "Fieldgrid platformbeheer",
    resetUrl,
    code: challenge.code,
  });
  const sent = await sendEmailWithResult({
    to: email,
    subject,
    html,
    purpose: "platform_admin_password_reset",
  });
  await markCredentialRecoveryDelivery(challenge.challengeId, sent.success);
  if (!sent.success) throw new Error("Resetmail versturen mislukt.");

  await writePlatformAuditLog({
    actor,
    action: "platform_user_password_reset_sent",
    resource: "platform_users",
    resourceId: target.id,
    metadata: { userId: target.userId, email },
  });

  revalidatePlatformUsers();
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

  return rows.map(mapSupportGrantRow);
}

export async function createSupportAccessGrant(input: {
  tenantId: string;
  platformUserId: string;
  reason: string;
  expiresAt: string;
  startsAt?: string | null;
  scope?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const actor = await requirePlatformAdmin();
  const tenantId = input.tenantId.trim();
  const platformUserId = input.platformUserId.trim();
  const reason = input.reason.trim();
  const scope = input.scope?.trim() ?? "";
  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
  const expiresAt = new Date(input.expiresAt);

  if (!tenantId || !platformUserId) {
    return { success: false, message: "Tenant en platformgebruiker zijn verplicht." };
  }

  if (scope !== "tenant") {
    await writeSupportAccessAuditLog({
      tenantId,
      action: "grant_create_denied",
      resource: "support_access_grants",
      metadata: {
        platformUserId,
        reason,
        scope: scope || null,
        denialType: "support_scope_required",
        grantType: FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE,
      },
    });
    return { success: false, message: "Scope is verplicht voor break-glass supporttoegang." };
  }

  const breakGlassValidation = validateSupportBreakGlassGrant({ reason, startsAt, expiresAt });
  if (!breakGlassValidation.success) {
    await writeSupportAccessAuditLog({
      tenantId,
      action: "grant_create_denied",
      resource: "support_access_grants",
      metadata: {
        platformUserId,
        reason,
        scope,
        denialType: "support_grant_policy_denial",
        message: breakGlassValidation.message,
        grantType: FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE,
      },
    });
    return breakGlassValidation;
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
    metadata: {
      platformUserId,
      reason,
      startsAt: startsAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      grantType: FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE,
      scope,
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
  const scope = formValue(formData, "scope") || formValue(formData, "supportScope");
  const startsAt = formValue(formData, "startsAt") || null;
  const expiresAt = formValue(formData, "expiresAt");

  const result = await createSupportAccessGrant({ tenantId, platformUserId, reason, scope, startsAt, expiresAt });
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
    metadata: { grantType: FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE, scope: "tenant" },
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
  cookieStore.set(
    FIELDGRID_SUPPORT_TENANT_COOKIE,
    tenantId,
    withHostOnlyCookieOptions({
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: grant.expiresAt,
    }),
  );

  await writeSupportAccessAuditLog({
    tenantId,
    action: "support_mode_entered",
    resource: "support_access_grants",
    resourceId: grant.id,
    metadata: {
      reason: grant.reason,
      expiresAt: grant.expiresAt.toISOString(),
      grantType: FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE,
      scope: "tenant",
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

  cookieStore.set(
    FIELDGRID_SUPPORT_TENANT_COOKIE,
    "",
    withHostOnlyCookieOptions({
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    }),
  );
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
  const grantConditions: SQL[] = [];

  if (normalizedFilters.tenantId) {
    supportConditions.push(eq(supportAccessAuditLogTable.tenantId, normalizedFilters.tenantId));
    auditConditions.push(eq(auditLogTable.tenantId, normalizedFilters.tenantId));
    grantConditions.push(eq(supportAccessGrantsTable.tenantId, normalizedFilters.tenantId));
  }
  if (normalizedFilters.actorId) {
    supportConditions.push(eq(supportAccessAuditLogTable.platformUserId, normalizedFilters.actorId));
    auditConditions.push(eq(auditLogTable.userId, normalizedFilters.actorId));
    grantConditions.push(eq(supportAccessGrantsTable.platformUserId, normalizedFilters.actorId));
  }
  if (normalizedFilters.resource) {
    supportConditions.push(eq(supportAccessAuditLogTable.resource, normalizedFilters.resource));
    auditConditions.push(eq(auditLogTable.resource, normalizedFilters.resource));
  }
  if (normalizedFilters.dateFrom) {
    const dateFrom = new Date(normalizedFilters.dateFrom);
    supportConditions.push(gte(supportAccessAuditLogTable.createdAt, dateFrom));
    auditConditions.push(gte(auditLogTable.createdAt, dateFrom));
    grantConditions.push(gte(supportAccessGrantsTable.createdAt, dateFrom));
  }
  if (normalizedFilters.dateTo) {
    const dateTo = new Date(normalizedFilters.dateTo);
    supportConditions.push(lte(supportAccessAuditLogTable.createdAt, dateTo));
    auditConditions.push(lte(auditLogTable.createdAt, dateTo));
    grantConditions.push(lte(supportAccessGrantsTable.createdAt, dateTo));
  }
  if (normalizedFilters.supportGrantId) {
    supportConditions.push(eq(supportAccessAuditLogTable.grantId, normalizedFilters.supportGrantId));
    grantConditions.push(eq(supportAccessGrantsTable.id, normalizedFilters.supportGrantId));
    auditConditions.push(sql`false`);
  }

  const [supportRows, auditRows, tenantRows, grantRows] = await Promise.all([
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
    db
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
      .where(grantConditions.length > 0 ? and(...grantConditions) : undefined)
      .orderBy(desc(supportAccessGrantsTable.createdAt))
      .limit(200),
  ]);

  const supportEvents = supportRows.map((row): PlatformSecurityEventRow => {
    const eventWithoutCategories: Omit<PlatformSecurityEventRow, "categories" | "severity" | "denialType"> = {
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
    return {
      ...eventWithoutCategories,
      categories: securityEventCategories(eventWithoutCategories),
      severity: securityEventSeverity(eventWithoutCategories),
      denialType: platformSecurityDenialType(eventWithoutCategories),
    };
  });

  const auditEvents = auditRows.map((row): PlatformSecurityEventRow => {
    const eventWithoutCategories: Omit<PlatformSecurityEventRow, "categories" | "severity" | "denialType"> = {
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
    return {
      ...eventWithoutCategories,
      categories: securityEventCategories(eventWithoutCategories),
      severity: securityEventSeverity(eventWithoutCategories),
      denialType: platformSecurityDenialType(eventWithoutCategories),
    };
  });

  const allEvents = [...supportEvents, ...auditEvents];
  const events = allEvents
    .filter((event) => matchesPlatformSecurityFilter(event, normalizedFilters))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, normalizedFilters.limit);
  const supportGrants = grantRows.map(mapSupportGrantRow);
  const resourceOptions = Array.from(
    new Set(allEvents.map((event) => event.resource).filter((resource): resource is string => Boolean(resource))),
  )
    .sort((a, b) => a.localeCompare(b, "nl"))
    .map((resource) => ({ value: resource, label: resource }));
  const severityCounts = events.reduce<Record<PlatformSecuritySeverity, number>>(
    (counts, event) => {
      counts[event.severity] += 1;
      return counts;
    },
    { info: 0, warning: 0, critical: 0 },
  );
  const denialBreakdown = events.reduce<Record<PlatformSecurityDenialType, number>>(
    (counts, event) => {
      if (event.denialType) counts[event.denialType] += 1;
      return counts;
    },
    {
      direct_id_denial: 0,
      module_denial: 0,
      storage_denial: 0,
      tenant_mismatch: 0,
      platform_access_denial: 0,
      other_denial: 0,
    },
  );

  return {
    generatedAt: new Date().toISOString(),
    filters: normalizedFilters,
    tenantOptions: tenantRows.map((row) => ({ id: row.id, name: row.name })),
    resourceOptions,
    supportGrantOptions: supportGrants.map((grant) => ({
      id: grant.id,
      tenantName: grant.tenantName,
      platformUserId: grant.platformUserId,
      expiresAt: grant.expiresAt,
      status: grant.status,
    })),
    events,
    supportEvents: events.filter(isSupportSecurityEvent).slice(0, 40),
    downloadEvents: events.filter(isDownloadSecurityEvent).slice(0, 40),
    denialEvents: events.filter(isDenialSecurityEvent).slice(0, 40),
    platformEvents: events.filter(isPlatformSecurityEvent).slice(0, 40),
    activeSupportGrants: supportGrants.filter((grant) => grant.isActive),
    supportAccessLog: events.filter(isSupportSecurityEvent).slice(0, 80),
    severityCounts,
    denialBreakdown,
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

  return rows.map(mapSupportGrantRow);
}

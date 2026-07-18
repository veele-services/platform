"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { COOKIE_NAME } from "@/lib/auth/session-permissions";
import { findAuthUserByEmail } from "@/lib/auth/portal-invites";
import {
  backofficeUrl,
  buildPasswordResetCodeEmail,
  personeelPortalUrl,
  sendEmailWithResult,
} from "@/lib/email";
import { evaluatePasswordStrength, mediumPasswordMessage } from "@/lib/password-strength";
import {
  TENANT_RUNTIME_ACTIVE_STATUSES,
  auditLogTable,
  consumeCredentialRecoveryGrant,
  db,
  issueCredentialRecoveryChallenge,
  markCredentialRecoveryDelivery,
  personnelTable,
  platformUsersTable,
  recordCredentialRecoveryProviderOutcome,
  revokeCredentialRecoveryChallenges,
  resolveCredentialRecoveryOrigin,
  tenantUsersTable,
  tenantsTable,
  verifyCredentialRecoveryChallenge,
  type CredentialRecoveryPurpose,
  type CredentialRecoveryState,
  type CredentialRecoverySurface,
} from "@workspace/db";
import type { ActionResult } from "./customers";

export type AuthFormState = {
  error: string | null;
};

export type PasswordActionState = {
  success?: boolean;
  error?: string;
  next?: string;
};

const RECOVERY_COOKIE = "fg_backoffice_recovery_grant";

type BackofficeRecoveryAccount = {
  subjectUserId: string;
  email: string;
  recipientName: string;
  surface: Extract<CredentialRecoverySurface, "tenant-backoffice" | "platform-admin">;
  tenantId: string | null;
};

function firstForwardedValue(value: string | null): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

function recoveryOrigin(): string {
  const configured = new URL(backofficeUrl()).origin;
  const allowedOrigins = (process.env["FIELDGRID_RECOVERY_ALLOWED_ORIGINS"] ?? configured)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return resolveCredentialRecoveryOrigin({
    configuredOrigin: configured,
    allowedOrigins,
    allowHttpLocalhost: process.env.NODE_ENV !== "production",
  });
}

async function recoveryRequestSignals(): Promise<{ networkSignal: string; clientSignal: string }> {
  const requestHeaders = await headers();
  return {
    networkSignal: firstForwardedValue(requestHeaders.get("x-forwarded-for")) || "unknown-network",
    clientSignal: requestHeaders.get("user-agent") ?? "unknown-client",
  };
}

async function findBackofficeRecoveryAccount(email: string): Promise<BackofficeRecoveryAccount | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;
  const admin = createAdminClient();
  const authUser = await findAuthUserByEmail(admin, normalizedEmail);
  if (!authUser || authUser.email?.toLowerCase() !== normalizedEmail) return null;

  const [platformMembership, tenantMemberships] = await Promise.all([
    db
      .select({ id: platformUsersTable.id })
      .from(platformUsersTable)
      .where(and(eq(platformUsersTable.userId, authUser.id), eq(platformUsersTable.status, "active")))
      .limit(1),
    db
      .select({ tenantId: tenantUsersTable.tenantId })
      .from(tenantUsersTable)
      .innerJoin(tenantsTable, eq(tenantsTable.id, tenantUsersTable.tenantId))
      .where(and(
        eq(tenantUsersTable.userId, authUser.id),
        eq(tenantUsersTable.status, "active"),
        eq(tenantsTable.isActive, true),
        inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
      )),
  ]);

  const isPlatformUser = platformMembership.length === 1;
  if (isPlatformUser === (tenantMemberships.length === 1)) return null;
  const name = authUser.user_metadata?.["full_name"] ?? authUser.user_metadata?.["name"];
  return {
    subjectUserId: authUser.id,
    email: normalizedEmail,
    recipientName: typeof name === "string" && name.trim() ? name.trim() : normalizedEmail,
    surface: isPlatformUser ? "platform-admin" : "tenant-backoffice",
    tenantId: isPlatformUser ? null : tenantMemberships[0]!.tenantId,
  };
}

function serializeRecoveryGrant(
  account: BackofficeRecoveryAccount,
  purpose: CredentialRecoveryPurpose,
  grant: string,
): string {
  return `${account.surface}|${account.tenantId ?? ""}|${purpose}|${grant}`;
}

function parseRecoveryGrant(value: string | undefined): {
  surface: BackofficeRecoveryAccount["surface"];
  tenantId: string | null;
  purpose: CredentialRecoveryPurpose;
  grant: string;
} | null {
  if (!value) return null;
  const [surface, tenantId, purpose, grant, extra] = value.split("|");
  if (extra !== undefined || !grant) return null;
  if (surface !== "tenant-backoffice" && surface !== "platform-admin") return null;
  if (purpose !== "activation" && purpose !== "password-reset") return null;
  if ((surface === "platform-admin") !== !tenantId) return null;
  return { surface, tenantId: tenantId || null, purpose, grant };
}

function redirectPathFromFormValue(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";

  const next = value.trim();
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";

  return next;
}

/**
 * Server Action - sign in with email + password.
 *
 * Contract:
 *   1. Authenticate with Supabase.
 *   2. Insert audit log entry - MANDATORY. Sign-in is rolled back if the
 *      audit insert fails to ensure every login event is recorded.
 *   3. Clear the legacy cached permissions cookie, if present.
 *   4. Redirect to the validated local destination.
 */
export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email    = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const nextPath = redirectPathFromFormValue(formData.get("next"));

  if (!email || !password) {
    return { error: "E-mailadres en wachtwoord zijn verplicht." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    const message =
      error?.message === "Invalid login credentials"
        ? "Onjuist e-mailadres of wachtwoord. Probeer het opnieuw."
        : "Er is een onverwachte fout opgetreden. Probeer het opnieuw.";
    return { error: message };
  }

  // Mandatory audit log. If this fails the sign-in is rolled back so every login is recorded.
  try {
    await db.insert(auditLogTable).values({
      userId:     data.user.id,
      action:     "login",
      resource:   "auth",
      resourceId: data.user.id,
      metadata:   { email: data.user.email },
    });
  } catch (auditError) {
    await supabase.auth.signOut();
    return {
      error:
        "Inloggebeurtenis kon niet worden geregistreerd. Probeer het opnieuw. " +
        "Neem contact op met uw beheerder als dit probleem aanhoudt.",
    };
  }

  try {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
  } catch {
    // Best-effort cleanup; do not block sign-in.
  }

  redirect(nextPath);
}

/**
 * Server Action - sign out the current user.
 *
 * Audit logging is best-effort here: blocking a sign-out on a log failure
 * would leave users unable to log out, which is a worse outcome than a
 * missing audit entry. Failures are surfaced in server logs.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    try {
      await db.insert(auditLogTable).values({
        userId:     user.id,
        action:     "logout",
        resource:   "auth",
        resourceId: user.id,
        metadata:   { email: user.email },
      });
    } catch (e) {
      console.error("[audit_log] Failed to record logout for user:", user.id, e);
    }
  }

  try {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
  } catch {
    // Best-effort.
  }

  await supabase.auth.signOut();
  redirect("/login");
}

export async function completePasswordReset(
  _prev: PasswordActionState | undefined,
  formData: FormData,
): Promise<PasswordActionState> {
  const password    = String(formData.get("password") ?? "");
  const passwordTwo = String(formData.get("passwordTwo") ?? "");
  const nextPath    = redirectPathFromFormValue(formData.get("next"));

  if (!password || !evaluatePasswordStrength(password).isMedium) {
    return { error: mediumPasswordMessage() };
  }
  if (password !== passwordTwo) {
    return { error: "Wachtwoorden komen niet overeen." };
  }

  const cookieStore = await cookies();
  const recovery = parseRecoveryGrant(cookieStore.get(RECOVERY_COOKIE)?.value);
  if (!recovery) return { error: "Deze herstelsessie is ongeldig, verlopen of al gebruikt." };

  const consumed = await consumeCredentialRecoveryGrant({
    surface: recovery.surface,
    purpose: recovery.purpose,
    tenantId: recovery.tenantId,
    redirectOrigin: recoveryOrigin(),
    grant: recovery.grant,
    ...(await recoveryRequestSignals()),
    assertSubjectEligible: async (subjectUserId) => {
      if (recovery.surface === "platform-admin") {
        const [eligible] = await db
          .select({ id: platformUsersTable.id })
          .from(platformUsersTable)
          .where(and(eq(platformUsersTable.userId, subjectUserId), eq(platformUsersTable.status, "active")))
          .limit(1);
        return Boolean(eligible);
      }
      if (!recovery.tenantId) return false;
      const [eligible] = await db
        .select({ id: tenantUsersTable.id })
        .from(tenantUsersTable)
        .innerJoin(tenantsTable, eq(tenantsTable.id, tenantUsersTable.tenantId))
        .where(and(
          eq(tenantUsersTable.userId, subjectUserId),
          eq(tenantUsersTable.tenantId, recovery.tenantId),
          eq(tenantUsersTable.status, "active"),
          eq(tenantsTable.isActive, true),
          inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
        ))
        .limit(1);
      return Boolean(eligible);
    },
  });
  if (consumed.state !== "valid" || !consumed.subjectUserId || !consumed.challengeId || !consumed.claimId) {
    if (consumed.state !== "processing") cookieStore.delete(RECOVERY_COOKIE);
    return { error: "Deze herstelsessie is ongeldig, verlopen of al gebruikt." };
  }

  const admin = createAdminClient();
  const { data: current } = await admin.auth.admin.getUserById(consumed.subjectUserId);
  const providerAlreadyApplied =
    current.user?.app_metadata?.["credential_recovery_challenge_id"] === consumed.challengeId;
  const appMetadata: Record<string, unknown> = {
    ...(current.user?.app_metadata ?? {}),
    force_password_change: false,
    password_changed_at: new Date().toISOString(),
    credential_recovery_challenge_id: consumed.challengeId,
    credential_recovery_claim_id: consumed.claimId,
  };
  delete appMetadata["temporary_password_issued_at"];
  delete appMetadata["temporary_password_expires_at"];
  delete appMetadata["temporary_password_kind"];
  delete appMetadata["credential_activation_pending"];
  const { error } = providerAlreadyApplied
    ? { error: null }
    : await admin.auth.admin.updateUserById(consumed.subjectUserId, {
        password,
        app_metadata: appMetadata,
      });
  await recordCredentialRecoveryProviderOutcome({
    challengeId: consumed.challengeId,
    claimId: consumed.claimId,
    success: !error,
    sessionRevoked: !error,
  });
  if (error) return { error: "Wachtwoord opslaan mislukt. Probeer deze herstelsessie opnieuw." };
  cookieStore.delete(RECOVERY_COOKIE);

  await db.insert(auditLogTable).values({
    userId: consumed.subjectUserId,
    action: "password_recovery_completed",
    resource: "auth",
    resourceId: consumed.subjectUserId,
    metadata: { surface: recovery.surface, tenantId: recovery.tenantId },
  });

  const supabase = await createClient();
  await supabase.auth.signOut();
  return { success: true, next: nextPath };
}

async function issueAndSendRecoveryChallenge(opts: {
  account: BackofficeRecoveryAccount | null;
  email: string;
  portalName: string;
  resetUrl: string;
  actorUserId?: string | null;
}): Promise<void> {
  const fallbackSurface: CredentialRecoverySurface = "platform-admin";
  const challenge = await issueCredentialRecoveryChallenge({
    surface: opts.account?.surface ?? fallbackSurface,
    purpose: "password-reset",
    tenantId: opts.account?.tenantId ?? null,
    accountIdentifier: opts.email,
    subjectUserId: opts.account?.subjectUserId ?? null,
    redirectOrigin: recoveryOrigin(),
    actorUserId: opts.actorUserId ?? null,
    ...(await recoveryRequestSignals()),
  });
  if (!opts.account || challenge.status !== "issued" || !challenge.challengeId || !challenge.code) return;

  const { subject, html } = buildPasswordResetCodeEmail({
    recipientName: opts.account.recipientName,
    portalName: opts.portalName,
    resetUrl: opts.resetUrl,
    code: challenge.code,
  });
  const sent = await sendEmailWithResult({
    to: opts.email,
    subject,
    html,
    tenantId: opts.account.tenantId,
    purpose: `${opts.account.surface}_password_reset`,
  });
  await markCredentialRecoveryDelivery(challenge.challengeId, sent.success);
}

export async function requestPasswordResetCode(email: string): Promise<ActionResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const publicResult: ActionResult = { success: true };
  try {
    const account = await findBackofficeRecoveryAccount(normalizedEmail);
    await issueAndSendRecoveryChallenge({
      account,
      email: normalizedEmail,
      portalName: account?.surface === "platform-admin" ? "Fieldgrid platformbeheer" : "Fieldgrid backoffice",
      resetUrl: `${backofficeUrl()}/wachtwoord-vergeten`,
    });
  } catch (error) {
    console.error("[auth] Backoffice password reset request failed:", error);
  }
  return publicResult;
}

export async function verifyPasswordResetCode(input: {
  email: string;
  code: string;
  purpose?: CredentialRecoveryPurpose;
}): Promise<{ success: boolean; state: CredentialRecoveryState }> {
  const account = await findBackofficeRecoveryAccount(input.email);
  const purpose = input.purpose ?? "password-reset";
  if (!account) return { success: false, state: "invalid" };
  const result = await verifyCredentialRecoveryChallenge({
    surface: account.surface,
    purpose,
    tenantId: account.tenantId,
    accountIdentifier: account.email,
    code: input.code,
    redirectOrigin: recoveryOrigin(),
    ...(await recoveryRequestSignals()),
  });
  if (result.state !== "valid" || !result.grant || !result.grantExpiresAt) {
    return { success: false, state: result.state };
  }

  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE, serializeRecoveryGrant(account, purpose, result.grant), {
    httpOnly: true,
    secure: recoveryOrigin().startsWith("https://"),
    sameSite: "strict",
    path: "/",
    expires: result.grantExpiresAt,
  });
  return { success: true, state: "valid" };
}

/**
 * Server Action - send a managed password-reset code to a personnel member.
 *
 * Only callable by users with personnel:write permission.
 * The employee must have an active portal account (user_id set).
 */
export async function sendPasswordReset(personnelId: string): Promise<ActionResult<{ expiresAt: string; deliveryStatus: "sent" }>> {
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [person] = await db
    .select({
      email: personnelTable.email,
      userId: personnelTable.userId,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
    })
    .from(personnelTable)
    .where(and(
      eq(personnelTable.id, personnelId),
      eq(personnelTable.tenantId, tenantId),
      eq(personnelTable.isActive, true),
    ))
    .limit(1);

  if (!person?.userId) return { success: false, message: "Actief portaalaccount niet gevonden." };
  const admin = createAdminClient();
  const { data: authData } = await admin.auth.admin.getUserById(person.userId);
  if (authData.user?.email?.toLowerCase() !== person.email.toLowerCase()) {
    return { success: false, message: "Het gekoppelde auth-account kon niet veilig worden bevestigd." };
  }

  const configuredOrigin = new URL(personeelPortalUrl()).origin;
  const allowedOrigins = (process.env["FIELDGRID_RECOVERY_ALLOWED_ORIGINS"] ?? configuredOrigin)
    .split(",").map((value) => value.trim()).filter(Boolean);
  const challenge = await issueCredentialRecoveryChallenge({
    surface: "personnel-portal",
    purpose: "password-reset",
    tenantId,
    accountIdentifier: person.email,
    subjectUserId: person.userId,
    redirectOrigin: resolveCredentialRecoveryOrigin({
      configuredOrigin,
      allowedOrigins,
      allowHttpLocalhost: process.env.NODE_ENV !== "production",
    }),
    actorUserId: user.id,
    ...(await recoveryRequestSignals()),
  });
  if (challenge.status !== "issued" || !challenge.challengeId || !challenge.code || !challenge.expiresAt) {
    return { success: false, message: "Er is recent al een herstelmail verstuurd. Probeer het later opnieuw." };
  }

  const { subject, html } = buildPasswordResetCodeEmail({
    recipientName: `${person.firstName} ${person.lastName}`.trim() || person.email,
    portalName: "Personeelsportaal",
    resetUrl: `${personeelPortalUrl()}/wachtwoord-vergeten`,
    code: challenge.code,
  });
  const sent = await sendEmailWithResult({
    to: person.email,
    subject,
    html,
    tenantId,
    purpose: "personnel_portal_password_reset",
  });
  await markCredentialRecoveryDelivery(challenge.challengeId, sent.success);
  if (!sent.success) return { success: false, message: "Herstelmail versturen mislukt." };

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "password_recovery_issued",
    resource: "personnel",
    resourceId: personnelId,
    metadata: { tenantId, challengeId: challenge.challengeId, expiresAt: challenge.expiresAt.toISOString() },
  });

  return {
    success: true,
    data: { expiresAt: challenge.expiresAt.toISOString(), deliveryStatus: "sent" },
  };
}

export async function revokePasswordReset(
  personnelId: string,
): Promise<ActionResult<{ revoked: number }>> {
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [person] = await db
    .select({ userId: personnelTable.userId })
    .from(personnelTable)
    .where(and(
      eq(personnelTable.id, personnelId),
      eq(personnelTable.tenantId, tenantId),
    ))
    .limit(1);
  if (!person?.userId) {
    return { success: false, message: "Portaalaccount niet gevonden." };
  }

  const revoked = await revokeCredentialRecoveryChallenges({
    tenantId,
    surface: "personnel-portal",
    purpose: "password-reset",
    subjectUserId: person.userId,
    actorUserId: user.id,
    reason: "backoffice_revoked",
  });

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "password_recovery_revoked",
    resource: "personnel",
    resourceId: personnelId,
    metadata: { tenantId, revoked },
  });

  return { success: true, data: { revoked } };
}

"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import {
  CREDENTIAL_RECOVERY_GENERIC_RESPONSE,
  consumeCredentialRecoveryGrant,
  db,
  issueCredentialRecoveryChallenge,
  markCredentialRecoveryDelivery,
  personnelTable,
  recordCredentialRecoveryProviderOutcome,
  resolveCredentialRecoveryOrigin,
  verifyCredentialRecoveryChallenge,
  type CredentialRecoveryPurpose,
  type CredentialRecoveryState,
} from "@workspace/db";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";
import { evaluatePasswordStrength, mediumPasswordMessage } from "@/lib/password-strength";
import { buildPasswordResetCodeEmail, personeelPortalUrl, sendEmailWithResult } from "@/lib/email";

type AuthUserRecord = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

const RECOVERY_COOKIE = "fg_personnel_recovery_grant";

function firstForwardedValue(value: string | null): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

function recoveryOrigin(): string {
  const configured = new URL(personeelPortalUrl()).origin;
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

function displayName(user: AuthUserRecord, fallbackEmail: string): string {
  const value = user.user_metadata?.["full_name"] ?? user.user_metadata?.["name"];
  return typeof value === "string" && value.trim() ? value.trim() : fallbackEmail;
}

function personnelDisplayName(row: { firstName: string; lastName: string }, fallbackEmail: string): string {
  const fullName = `${row.firstName} ${row.lastName}`.trim();
  return fullName || fallbackEmail;
}

async function findPersonnelResetAccount(
  tenantId: string,
  email: string,
): Promise<{ authUser: AuthUserRecord; recipientName: string } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const [personnel] = await db
    .select({
      userId:    personnelTable.userId,
      email:     personnelTable.email,
      firstName: personnelTable.firstName,
      lastName:  personnelTable.lastName,
    })
    .from(personnelTable)
    .where(
      and(
        eq(personnelTable.tenantId, tenantId),
        sql`lower(${personnelTable.email}) = ${normalizedEmail}`,
        eq(personnelTable.isActive, true),
      ),
    )
    .limit(1);

  if (!personnel?.userId) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(personnel.userId);
  if (error) throw new Error(error.message ?? "Auth-gebruiker ophalen mislukt.");
  const authUser = data.user as AuthUserRecord | null;
  if (authUser?.email?.toLowerCase() !== normalizedEmail) return null;

  if (!authUser) return null;
  return {
    authUser,
    recipientName: personnelDisplayName(personnel, displayName(authUser, normalizedEmail)),
  };
}

const PORTAL_BASE = "/personeel";

function isLoginPath(value: string): boolean {
  const pathname = value.split(/[?#]/u)[0] || value;
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === `${PORTAL_BASE}/login` ||
    pathname.startsWith(`${PORTAL_BASE}/login/`)
  );
}

function sanitizeRedirectPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (isLoginPath(trimmed)) return null;
  if (trimmed === PORTAL_BASE) return "/";
  if (trimmed.startsWith(`${PORTAL_BASE}/`)) {
    return trimmed.slice(PORTAL_BASE.length) || "/";
  }
  return trimmed;
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const next = sanitizeRedirectPath(formData.get("next"));

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const nextQuery = next ? `&next=${encodeURIComponent(next)}` : "";
    redirect(`/login?error=Ongeldige+inloggegevens${nextQuery}`);
  }

  redirect(next ?? "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function changeMyPassword(
  _prev: { success?: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  const password    = (formData.get("password") as string ?? "").trim();
  const passwordTwo = (formData.get("passwordTwo") as string ?? "").trim();

  if (!password || !evaluatePasswordStrength(password).isMedium) {
    return { error: mediumPasswordMessage() };
  }
  if (password !== passwordTwo) {
    return { error: "Wachtwoorden komen niet overeen" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "Wachtwoord wijzigen mislukt. Probeer opnieuw in te loggen en het nogmaals te proberen." };
  }

  revalidatePath("/beveiliging");
  return { success: true };
}

export async function completePasswordReset(
  _prev: { success?: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  const password    = String(formData.get("password") ?? "");
  const passwordTwo = String(formData.get("passwordTwo") ?? "");

  if (!password || !evaluatePasswordStrength(password).isMedium) {
    return { error: mediumPasswordMessage() };
  }
  if (password !== passwordTwo) {
    return { error: "Wachtwoorden komen niet overeen" };
  }

  const tenantId = await requireCurrentPersonnelPortalTenantId();
  const cookieStore = await cookies();
  const [purposeValue, grant, extra] = (cookieStore.get(RECOVERY_COOKIE)?.value ?? "").split("|");
  const purpose: CredentialRecoveryPurpose | null =
    purposeValue === "activation" || purposeValue === "password-reset" ? purposeValue : null;
  if (!tenantId || !purpose || !grant || extra !== undefined) {
    return { error: "Deze herstelsessie is ongeldig, verlopen of al gebruikt." };
  }

  const consumed = await consumeCredentialRecoveryGrant({
    surface: "personnel-portal",
    purpose,
    tenantId,
    redirectOrigin: recoveryOrigin(),
    grant,
    ...(await recoveryRequestSignals()),
    assertSubjectEligible: async (subjectUserId) => {
      const [eligible] = await db
        .select({ id: personnelTable.id })
        .from(personnelTable)
        .where(and(
          eq(personnelTable.tenantId, tenantId),
          eq(personnelTable.userId, subjectUserId),
          eq(personnelTable.isActive, true),
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

  const supabase = await createClient();
  await supabase.auth.signOut();
  return { success: true };
}

export async function requestPasswordResetCode(email: string): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const publicResult = { success: true, message: CREDENTIAL_RECOVERY_GENERIC_RESPONSE };

  try {
    const tenantId = await requireCurrentPersonnelPortalTenantId();
    if (!tenantId || !normalizedEmail) return publicResult;

    const account = await findPersonnelResetAccount(tenantId, normalizedEmail);
    const challenge = await issueCredentialRecoveryChallenge({
      surface: "personnel-portal",
      purpose: "password-reset",
      tenantId,
      accountIdentifier: normalizedEmail,
      subjectUserId: account?.authUser.id ?? null,
      redirectOrigin: recoveryOrigin(),
      ...(await recoveryRequestSignals()),
    });

    if (account && challenge.status === "issued" && challenge.challengeId && challenge.code) {
      const { subject, html } = buildPasswordResetCodeEmail({
        recipientName: account.recipientName,
        portalName: "Personeelsportaal",
        resetUrl: `${personeelPortalUrl()}/wachtwoord-vergeten`,
        code: challenge.code,
      });
      const sent = await sendEmailWithResult({
        to: normalizedEmail,
        subject,
        html,
        tenantId,
        purpose: "personnel_portal_password_reset",
      });
      await markCredentialRecoveryDelivery(challenge.challengeId, sent.success);
    }
  } catch (error) {
    console.error("[auth] Personeel password reset request failed:", error);
  }

  return publicResult;
}

export async function verifyPasswordResetCode(input: {
  email: string;
  code: string;
  purpose?: CredentialRecoveryPurpose;
}): Promise<{ success: boolean; state: CredentialRecoveryState }> {
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  const purpose = input.purpose ?? "password-reset";
  if (!tenantId) return { success: false, state: "invalid" };
  const result = await verifyCredentialRecoveryChallenge({
    surface: "personnel-portal",
    purpose,
    tenantId,
    accountIdentifier: input.email,
    code: input.code,
    redirectOrigin: recoveryOrigin(),
    ...(await recoveryRequestSignals()),
  });
  if (result.state !== "valid" || !result.grant || !result.grantExpiresAt) {
    return { success: false, state: result.state };
  }

  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE, `${purpose}|${result.grant}`, {
    httpOnly: true,
    secure: recoveryOrigin().startsWith("https://"),
    sameSite: "strict",
    path: "/personeel",
    expires: result.grantExpiresAt,
  });
  return { success: true, state: "valid" };
}

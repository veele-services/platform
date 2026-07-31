"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  buildPersonnelTenantEntryUrl,
  CREDENTIAL_RECOVERY_GENERIC_RESPONSE,
  consumeCredentialRecoveryGrant,
  db,
  isValidPersonnelTenantCode,
  issueCredentialRecoveryChallenge,
  markCredentialRecoveryDelivery,
  normalizePersonnelTenantCode,
  personnelTable,
  recordCredentialRecoveryProviderOutcome,
  requireTenantModule,
  resolveCredentialRecoveryOrigin,
  TENANT_RUNTIME_ACTIVE_STATUSES,
  tenantsTable,
  verifyCredentialRecoveryChallenge,
  type CredentialRecoveryPurpose,
  type CredentialRecoveryState,
} from "@workspace/db";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PERSONNEL_TENANT_COOKIE,
  requireCurrentPersonnelPortalTenantId,
  resolveActivePersonnelTenantIdByCode,
} from "@/lib/auth/tenant";
import {
  evaluatePasswordStrength,
  mediumPasswordMessage,
} from "@/lib/password-strength";
import {
  buildPasswordResetCodeEmail,
  personeelPortalUrl,
  sendEmailWithResult,
} from "@/lib/email";

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
  const allowedOrigins = (
    process.env["FIELDGRID_RECOVERY_ALLOWED_ORIGINS"] ?? configured
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return resolveCredentialRecoveryOrigin({
    configuredOrigin: configured,
    allowedOrigins,
    allowHttpLocalhost: process.env.NODE_ENV !== "production",
  });
}

async function recoveryRequestSignals(): Promise<{
  networkSignal: string;
  clientSignal: string;
}> {
  const requestHeaders = await headers();
  return {
    networkSignal:
      firstForwardedValue(requestHeaders.get("x-forwarded-for")) ||
      "unknown-network",
    clientSignal: requestHeaders.get("user-agent") ?? "unknown-client",
  };
}

function displayName(user: AuthUserRecord, fallbackEmail: string): string {
  const value =
    user.user_metadata?.["full_name"] ?? user.user_metadata?.["name"];
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallbackEmail;
}

function personnelDisplayName(
  row: { firstName: string; lastName: string },
  fallbackEmail: string,
): string {
  const fullName = `${row.firstName} ${row.lastName}`.trim();
  return fullName || fallbackEmail;
}

async function findPersonnelResetAccount(
  tenantId: string,
  email: string,
): Promise<{
  authUser: AuthUserRecord;
  recipientName: string;
  tenantCode: string;
} | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const [personnel] = await db
    .select({
      userId: personnelTable.userId,
      email: personnelTable.email,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
      tenantCode: tenantsTable.personnelLoginCode,
    })
    .from(personnelTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, personnelTable.tenantId))
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
  if (error)
    throw new Error(error.message ?? "Auth-gebruiker ophalen mislukt.");
  const authUser = data.user as AuthUserRecord | null;
  if (authUser?.email?.toLowerCase() !== normalizedEmail) return null;

  if (!authUser) return null;
  return {
    authUser,
    recipientName: personnelDisplayName(
      personnel,
      displayName(authUser, normalizedEmail),
    ),
    tenantCode: personnel.tenantCode,
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

function loginRedirect(message: string | null, next: string | null): never {
  const query = new URLSearchParams();
  if (message) query.set("error", message);
  if (next) query.set("next", next);
  redirect(`/login${query.size > 0 ? `?${query.toString()}` : ""}`);
}

export async function selectPersonnelTenant(formData: FormData) {
  const code = normalizePersonnelTenantCode(formData.get("tenantCode"));
  const next = sanitizeRedirectPath(formData.get("next"));

  if (!isValidPersonnelTenantCode(code)) {
    loginRedirect("Vul de geldige organisatiecode van zes tekens in.", next);
  }

  const tenantId = await resolveActivePersonnelTenantIdByCode(code);
  if (!tenantId) {
    loginRedirect(
      "Organisatiecode niet herkend. Controleer de zes tekens.",
      next,
    );
  }

  try {
    await requireTenantModule(tenantId, "personnel_portal");
  } catch {
    loginRedirect(
      "De personeelsapp is niet beschikbaar voor deze organisatie.",
      next,
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(PERSONNEL_TENANT_COOKIE, code, {
    httpOnly: true,
    path: PORTAL_BASE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });

  loginRedirect(null, next);
}

export async function clearPersonnelTenantSelection() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete({
    name: PERSONNEL_TENANT_COOKIE,
    path: PORTAL_BASE,
  });
  redirect("/login");
}

export async function signIn(formData: FormData) {
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  const next = sanitizeRedirectPath(formData.get("next"));
  if (!tenantId) {
    loginRedirect(
      "Kies eerst je organisatie met de code van zes tekens.",
      next,
    );
  }

  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    loginRedirect("Ongeldige inloggegevens.", next);
  }

  const [personnel] = await db
    .select({ id: personnelTable.id })
    .from(personnelTable)
    .innerJoin(tenantsTable, eq(personnelTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(personnelTable.tenantId, tenantId),
        eq(personnelTable.userId, data.user.id),
        eq(personnelTable.isActive, true),
        eq(tenantsTable.isActive, true),
        inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
      ),
    )
    .limit(1);

  if (!personnel) {
    await supabase.auth.signOut();
    loginRedirect("Ongeldige inloggegevens voor deze organisatie.", next);
  }

  redirect(next ?? "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/personeel/login");
}

export async function changeMyPassword(
  _prev: { success?: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  const password = ((formData.get("password") as string) ?? "").trim();
  const passwordTwo = ((formData.get("passwordTwo") as string) ?? "").trim();

  if (!password || !evaluatePasswordStrength(password).isMedium) {
    return { error: mediumPasswordMessage() };
  }
  if (password !== passwordTwo) {
    return { error: "Wachtwoorden komen niet overeen" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return {
      error:
        "Wachtwoord wijzigen mislukt. Probeer opnieuw in te loggen en het nogmaals te proberen.",
    };
  }

  revalidatePath("/beveiliging");
  return { success: true };
}

export async function completeRequiredPasswordChange(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  const passwordTwo = String(formData.get("passwordTwo") ?? "");
  if (!password || !evaluatePasswordStrength(password).isMedium) {
    return { error: mediumPasswordMessage() };
  }
  if (password !== passwordTwo) {
    return { error: "Wachtwoorden komen niet overeen" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Log opnieuw in om je wachtwoord te wijzigen." };

  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin.auth.admin.getUserById(user.id);
  if (currentError || !current.user) {
    return { error: "De beveiligde wachtwoordsessie kon niet worden gecontroleerd." };
  }
  if (
    current.user.app_metadata?.["force_password_change"] !== true ||
    current.user.app_metadata?.["portal"] !== "personnel"
  ) {
    return { error: "Deze verplichte wachtwoordsessie is niet meer geldig." };
  }
  const appMetadata: Record<string, unknown> = { ...(current.user.app_metadata ?? {}) };
  appMetadata["force_password_change"] = false;
  appMetadata["password_changed_at"] = new Date().toISOString();
  delete appMetadata["temporary_password_issued_at"];
  delete appMetadata["temporary_password_expires_at"];
  delete appMetadata["temporary_password_kind"];
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: appMetadata,
  });
  if (error) {
    return { error: "Wachtwoord wijzigen mislukt. Probeer het opnieuw." };
  }

  redirect("/personeel/onboarding");
}

export async function completePasswordReset(
  _prev: { success?: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  const password = String(formData.get("password") ?? "");
  const passwordTwo = String(formData.get("passwordTwo") ?? "");

  if (!password || !evaluatePasswordStrength(password).isMedium) {
    return { error: mediumPasswordMessage() };
  }
  if (password !== passwordTwo) {
    return { error: "Wachtwoorden komen niet overeen" };
  }

  const tenantId = await requireCurrentPersonnelPortalTenantId();
  const cookieStore = await cookies();
  const [purposeValue, grant, extra] = (
    cookieStore.get(RECOVERY_COOKIE)?.value ?? ""
  ).split("|");
  const purpose: CredentialRecoveryPurpose | null =
    purposeValue === "activation" || purposeValue === "password-reset"
      ? purposeValue
      : null;
  if (!tenantId || !purpose || !grant || extra !== undefined) {
    return {
      error: "Deze herstelsessie is ongeldig, verlopen of al gebruikt.",
    };
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
        .where(
          and(
            eq(personnelTable.tenantId, tenantId),
            eq(personnelTable.userId, subjectUserId),
            eq(personnelTable.isActive, true),
          ),
        )
        .limit(1);
      return Boolean(eligible);
    },
  });
  if (
    consumed.state !== "valid" ||
    !consumed.subjectUserId ||
    !consumed.challengeId ||
    !consumed.claimId
  ) {
    if (consumed.state !== "processing") {
      cookieStore.delete({ name: RECOVERY_COOKIE, path: "/personeel" });
    }
    return {
      error: "Deze herstelsessie is ongeldig, verlopen of al gebruikt.",
    };
  }

  const admin = createAdminClient();
  const { data: current } = await admin.auth.admin.getUserById(
    consumed.subjectUserId,
  );
  const providerAlreadyApplied =
    current.user?.app_metadata?.["credential_recovery_challenge_id"] ===
    consumed.challengeId;
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
  if (error)
    return {
      error: "Wachtwoord opslaan mislukt. Probeer deze herstelsessie opnieuw.",
    };
  cookieStore.delete({ name: RECOVERY_COOKIE, path: "/personeel" });

  const supabase = await createClient();
  await supabase.auth.signOut();
  return { success: true };
}

export async function requestPasswordResetCode(
  email: string,
): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const publicResult = {
    success: true,
    message: CREDENTIAL_RECOVERY_GENERIC_RESPONSE,
  };

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

    if (
      account &&
      challenge.status === "issued" &&
      challenge.challengeId &&
      challenge.code
    ) {
      const { subject, html } = buildPasswordResetCodeEmail({
        recipientName: account.recipientName,
        portalName: "Personeelsportaal",
        resetUrl: buildPersonnelTenantEntryUrl(
          personeelPortalUrl(),
          account.tenantCode,
          "/wachtwoord-vergeten",
        ),
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

"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  CREDENTIAL_RECOVERY_GENERIC_RESPONSE,
  consumeCredentialRecoveryGrant,
  customerUsersTable,
  customersTable,
  db,
  issueCredentialRecoveryChallenge,
  markCredentialRecoveryDelivery,
  recordCredentialRecoveryProviderOutcome,
  resolveCredentialRecoveryOrigin,
  verifyCredentialRecoveryChallenge,
  type CredentialRecoveryPurpose,
  type CredentialRecoveryState,
} from "@workspace/db";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentCustomerPortalTenantId } from "@/lib/auth/tenant";
import { evaluatePasswordStrength, mediumPasswordMessage } from "@/lib/password-strength";
import { buildPasswordResetCodeEmail, klantPortalUrl, sendEmailWithResult } from "@/lib/email";

type AuthUserRecord = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

const RECOVERY_COOKIE = "fg_customer_recovery_grant";

function firstForwardedValue(value: string | null): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

function recoveryOrigin(): string {
  const configured = new URL(klantPortalUrl()).origin;
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

function customerDisplayName(
  row: { firstName: string | null; lastName: string | null; customerName: string | null },
  fallbackEmail: string,
): string {
  const fullName = [row.firstName, row.lastName].map((part) => part?.trim()).filter(Boolean).join(" ");
  return fullName || row.customerName?.trim() || fallbackEmail;
}

async function findCustomerResetAccount(
  tenantId: string,
  email: string,
): Promise<{ authUser: AuthUserRecord; recipientName: string } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const [portalUser] = await db
    .select({
      userId:       customerUsersTable.userId,
      email:        customerUsersTable.email,
      firstName:    customerUsersTable.firstName,
      lastName:     customerUsersTable.lastName,
      customerName: customersTable.name,
    })
    .from(customerUsersTable)
    .innerJoin(
      customersTable,
      and(
        eq(customersTable.id, customerUsersTable.customerId),
        eq(customersTable.tenantId, customerUsersTable.tenantId),
      ),
    )
    .where(
      and(
        eq(customerUsersTable.tenantId, tenantId),
        sql`lower(${customerUsersTable.email}) = ${normalizedEmail}`,
        inArray(customerUsersTable.status, ["active"]),
        eq(customersTable.isActive, true),
      ),
    )
    .limit(1);

  if (!portalUser?.userId) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(portalUser.userId);
  if (error) throw new Error(error.message ?? "Auth-gebruiker ophalen mislukt.");
  const authUser = data.user as AuthUserRecord | null;
  if (authUser?.email?.toLowerCase() !== normalizedEmail) return null;

  if (!authUser) return null;
  return {
    authUser,
    recipientName: customerDisplayName(portalUser, displayName(authUser, normalizedEmail)),
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/klant/login");
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

  const tenantId = await requireCurrentCustomerPortalTenantId();
  const cookieStore = await cookies();
  const [purposeValue, grant, extra] = (cookieStore.get(RECOVERY_COOKIE)?.value ?? "").split("|");
  const purpose: CredentialRecoveryPurpose | null =
    purposeValue === "activation" || purposeValue === "password-reset" ? purposeValue : null;
  if (!tenantId || !purpose || !grant || extra !== undefined) {
    return { error: "Deze herstelsessie is ongeldig, verlopen of al gebruikt." };
  }

  const consumed = await consumeCredentialRecoveryGrant({
    surface: "customer-portal",
    purpose,
    tenantId,
    redirectOrigin: recoveryOrigin(),
    grant,
    ...(await recoveryRequestSignals()),
    assertSubjectEligible: async (subjectUserId) => {
      const [eligible] = await db
        .select({ id: customerUsersTable.id })
        .from(customerUsersTable)
        .innerJoin(customersTable, and(
          eq(customersTable.id, customerUsersTable.customerId),
          eq(customersTable.tenantId, customerUsersTable.tenantId),
        ))
        .where(and(
          eq(customerUsersTable.tenantId, tenantId),
          eq(customerUsersTable.userId, subjectUserId),
          inArray(customerUsersTable.status, purpose === "activation" ? ["active", "invited"] : ["active"]),
          eq(customersTable.isActive, true),
        ))
        .limit(1);
      return Boolean(eligible);
    },
  });
  if (consumed.state !== "valid" || !consumed.subjectUserId || !consumed.challengeId || !consumed.claimId) {
    if (consumed.state !== "processing") {
      cookieStore.delete({ name: RECOVERY_COOKIE, path: "/klant" });
    }
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
  cookieStore.delete({ name: RECOVERY_COOKIE, path: "/klant" });
  if (purpose === "activation") {
    await db
      .update(customerUsersTable)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(
        eq(customerUsersTable.tenantId, tenantId),
        eq(customerUsersTable.userId, consumed.subjectUserId),
        eq(customerUsersTable.status, "invited"),
      ));
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  return { success: true };
}

export async function requestPasswordResetCode(email: string): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const publicResult = { success: true, message: CREDENTIAL_RECOVERY_GENERIC_RESPONSE };

  try {
    const tenantId = await requireCurrentCustomerPortalTenantId();
    if (!tenantId || !normalizedEmail) return publicResult;

    const account = await findCustomerResetAccount(tenantId, normalizedEmail);
    const challenge = await issueCredentialRecoveryChallenge({
      surface: "customer-portal",
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
        portalName: "Klantportaal",
        resetUrl: `${klantPortalUrl()}/wachtwoord-vergeten`,
        code: challenge.code,
      });
      const sent = await sendEmailWithResult({
        to: normalizedEmail,
        subject,
        html,
        tenantId,
        purpose: "customer_portal_password_reset",
      });
      await markCredentialRecoveryDelivery(challenge.challengeId, sent.success);
    }
  } catch (error) {
    console.error("[auth] Klant password reset request failed:", error);
  }

  return publicResult;
}

export async function verifyPasswordResetCode(input: {
  email: string;
  code: string;
  purpose?: CredentialRecoveryPurpose;
}): Promise<{ success: boolean; state: CredentialRecoveryState }> {
  const tenantId = await requireCurrentCustomerPortalTenantId();
  const purpose = input.purpose ?? "password-reset";
  if (!tenantId) return { success: false, state: "invalid" };
  const result = await verifyCredentialRecoveryChallenge({
    surface: "customer-portal",
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
    path: "/klant",
    expires: result.grantExpiresAt,
  });
  return { success: true, state: "valid" };
}

export async function changeMyPassword(
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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error: error.message.includes("same password")
        ? "Het nieuwe wachtwoord mag niet gelijk zijn aan het huidige wachtwoord."
        : "Wachtwoord opslaan mislukt.",
    };
  }

  return { success: true };
}

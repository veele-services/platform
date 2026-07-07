"use server";

import { randomInt } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { customerUsersTable, customersTable, db } from "@workspace/db";
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

function generatePasswordResetCode(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) code += String(randomInt(10));
  return code;
}

function passwordResetCodeExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + 30 * 60 * 1000).toISOString();
}

function firstForwardedValue(value: string | null): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

async function currentKlantPortalUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host =
    firstForwardedValue(requestHeaders.get("x-forwarded-host")) ||
    requestHeaders.get("host");
  if (!host) return klantPortalUrl();

  const proto = firstForwardedValue(requestHeaders.get("x-forwarded-proto")) || "https";
  return `${proto}://${host.replace(/\/$/, "")}/klant`;
}

async function findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message ?? "Auth-gebruiker zoeken mislukt.");
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalized);
    if (user) return user as AuthUserRecord;
    if (data.users.length < 1000) return null;
  }
  return null;
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
        inArray(customerUsersTable.status, ["active", "invited"]),
        eq(customersTable.isActive, true),
      ),
    )
    .limit(1);

  if (!portalUser) return null;

  let authUser: AuthUserRecord | null = null;
  if (portalUser.userId) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(portalUser.userId);
    if (error) throw new Error(error.message ?? "Auth-gebruiker ophalen mislukt.");
    authUser = data.user as AuthUserRecord | null;
    if (authUser?.email?.toLowerCase() !== normalizedEmail) return null;
  } else {
    authUser = await findAuthUserByEmail(normalizedEmail);
  }

  if (!authUser) return null;
  return {
    authUser,
    recipientName: customerDisplayName(portalUser, displayName(authUser, normalizedEmail)),
  };
}

function isTemporaryPasswordExpired(appMetadata: Record<string, unknown> | null | undefined): boolean {
  const expiresAt = appMetadata?.["temporary_password_expires_at"];
  if (typeof expiresAt !== "string" || !expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  return Number.isFinite(expiry) && expiry <= Date.now();
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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sessie verlopen. Log opnieuw in met het tijdelijke wachtwoord." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error: error.message.includes("same password")
        ? "Het nieuwe wachtwoord mag niet gelijk zijn aan het huidige wachtwoord."
        : "Wachtwoord opslaan mislukt. Vraag zo nodig een nieuw tijdelijk wachtwoord aan.",
    };
  }

  if (user.app_metadata?.force_password_change === true) {
    try {
      const admin = createAdminClient();
      const appMetadata: Record<string, unknown> = {
        ...(user.app_metadata ?? {}),
        force_password_change: false,
        password_changed_at: new Date().toISOString(),
      };
      delete appMetadata["temporary_password_issued_at"];
      delete appMetadata["temporary_password_expires_at"];
      delete appMetadata["temporary_password_kind"];
      const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: appMetadata,
      });
      if (metadataError) throw metadataError;
    } catch {
      return { error: "Wachtwoord opgeslagen, maar de eerste-login status kon niet worden afgerond. Neem contact op met support." };
    }
  }

  await supabase.auth.signOut();
  return { success: true };
}

export async function requestPasswordResetCode(email: string): Promise<{ success: boolean; message?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { success: false, message: "E-mailadres is verplicht." };

  try {
    const tenantId = await requireCurrentCustomerPortalTenantId();
    if (!tenantId) {
      return { success: false, message: "Klantportaal voor deze host is niet beschikbaar." };
    }

    const account = await findCustomerResetAccount(tenantId, normalizedEmail);
    if (!account) return { success: true };

    const code = generatePasswordResetCode();
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(account.authUser.id, {
      password: code,
      email_confirm: true,
      app_metadata: {
        ...(account.authUser.app_metadata ?? {}),
        force_password_change: true,
        portal: "customer",
        tenant_id: tenantId,
        temporary_password_issued_at: new Date().toISOString(),
        temporary_password_expires_at: passwordResetCodeExpiresAt(),
        temporary_password_kind: "reset_code",
      },
    });
    if (error) throw error;

    const { subject, html } = buildPasswordResetCodeEmail({
      recipientName: account.recipientName,
      portalName: "Klantportaal",
      resetUrl: `${await currentKlantPortalUrl()}/wachtwoord-vergeten`,
      code,
    });
    const sent = await sendEmailWithResult({
      to: normalizedEmail,
      subject,
      html,
      tenantId,
      purpose: "customer_portal_password_reset",
    });
    if (!sent.success) throw new Error(sent.error ?? "Herstelmail versturen mislukt.");
  } catch (error) {
    console.error("[auth] Klant password reset mail failed:", error);
    return { success: false, message: "Herstelmail versturen mislukt. Probeer het later opnieuw." };
  }

  return { success: true };
}

export async function isCurrentTemporaryPasswordExpired(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return isTemporaryPasswordExpired(user?.app_metadata as Record<string, unknown> | null | undefined);
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

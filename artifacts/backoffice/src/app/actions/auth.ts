"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { COOKIE_NAME } from "@/lib/auth/session-permissions";
import { findAuthUserByEmail, isTemporaryPasswordExpired, type PortalInviteType } from "@/lib/auth/portal-invites";
import {
  backofficeUrl,
  buildPasswordResetCodeEmail,
  personeelPortalUrl,
  sendEmailWithResult,
} from "@/lib/email";
import { evaluatePasswordStrength, mediumPasswordMessage } from "@/lib/password-strength";
import { createCredentialChallenge, db } from "@workspace/db";
import { auditLogTable, personnelTable } from "@workspace/db";
import type { ActionResult } from "./customers";

export type AuthFormState = {
  error: string | null;
};

export type PasswordActionState = {
  success?: boolean;
  error?: string;
  next?: string;
};

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
 *   4. Redirect temporary-password users to password reset before dashboard.
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

  if (data.user.app_metadata?.force_password_change === true) {
    if (isTemporaryPasswordExpired(data.user.app_metadata)) {
      await supabase.auth.signOut();
      return { error: "De tijdelijke code is verlopen. Vraag een nieuwe herstelcode aan." };
    }
    redirect(`/reset-wachtwoord?force=1&next=${encodeURIComponent(nextPath)}`);
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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sessie verlopen. Log opnieuw in met het tijdelijke wachtwoord of vraag een nieuwe reset aan." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error: error.message.includes("same password")
        ? "Het nieuwe wachtwoord mag niet gelijk zijn aan het huidige wachtwoord."
        : "Wachtwoord opslaan mislukt. Vraag zo nodig een nieuwe reset aan.",
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
      return { error: "Wachtwoord opgeslagen, maar de eerste-login status kon niet worden afgerond. Neem contact op met de beheerder." };
    }
  }

  try {
    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "password_changed",
      resource:   "auth",
      resourceId: user.id,
      metadata:   { email: user.email, forced: user.app_metadata?.force_password_change === true },
    });
  } catch (auditError) {
    console.error("[audit_log] Failed to record password change for user:", user.id, auditError);
  }

  await supabase.auth.signOut();
  return { success: true, next: nextPath };
}

async function sendManagedPasswordResetCode(opts: {
  email: string;
  recipientName?: string | null;
  portal: PortalInviteType;
  portalName: string;
  resetUrl: string;
  tenantId?: string | null;
  revealMissingUser?: boolean;
}): Promise<ActionResult<{ userId: string | null }>> {
  const email = opts.email.trim().toLowerCase();
  if (!email) return { success: false, message: "E-mailadres is verplicht." };

  const admin = createAdminClient();
  const authUser = await findAuthUserByEmail(admin, email);
  if (!authUser) {
    if (opts.revealMissingUser) return { success: false, message: "Geen auth-account gevonden voor dit e-mailadres." };
    return { success: true, data: { userId: null } };
  }

  const challenge = await createCredentialChallenge({
    purpose: opts.revealMissingUser ? "admin_initiated_reset" : "password_reset",
    userId: authUser.id,
    email,
    portal: opts.portal,
    tenantId: opts.tenantId ?? null,
    hostClass: opts.resetUrl,
    metadata: { transportPurpose: "backoffice_password_reset" },
  });
  const code = challenge.code;

  const { subject, html } = buildPasswordResetCodeEmail({
    recipientName: opts.recipientName?.trim() || authUser.user_metadata?.["full_name"] || email,
    portalName:    opts.portalName,
    resetUrl:      opts.resetUrl,
    code,
  });
  const sent = await sendEmailWithResult({ to: email, subject, html });
  if (!sent.success) {
    return { success: false, message: sent.error ?? "Herstelmail versturen mislukt." };
  }

  return { success: true, data: { userId: authUser.id } };
}

export async function requestPasswordResetCode(email: string): Promise<ActionResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { success: false, message: "E-mailadres is verplicht." };

  const result = await sendManagedPasswordResetCode({
    email: normalizedEmail,
    portal: "tenant-admin",
    portalName: "Fieldgrid backoffice",
    resetUrl: `${backofficeUrl()}/wachtwoord-vergeten`,
  });

  if (!result.success) {
    console.error("[auth] Backoffice password reset mail failed:", result.message);
    return { success: false, message: "Herstelmail versturen mislukt. Probeer het later opnieuw." };
  }

  return { success: true };
}

/**
 * Server Action - send a managed password-reset code to a personnel member.
 *
 * Only callable by users with personnel:write permission.
 * The employee must have an active portal account (user_id set).
 */
export async function sendPasswordReset(personnelId: string): Promise<ActionResult> {
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [person] = await db
    .select({ email: personnelTable.email, userId: personnelTable.userId })
    .from(personnelTable)
    .where(and(eq(personnelTable.id, personnelId), eq(personnelTable.tenantId, tenantId)))
    .limit(1);

  if (!person) return { success: false, message: "Medewerker niet gevonden." };
  if (!person.userId) {
    return { success: false, message: "Medewerker heeft nog geen actief portaalaccount." };
  }

  const result = await sendManagedPasswordResetCode({
    email: person.email,
    portal: "personnel",
    portalName: "Personeelsportaal",
    resetUrl: `${personeelPortalUrl()}/wachtwoord-vergeten`,
    tenantId,
    revealMissingUser: true,
  });
  if (!result.success) return result;

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "password_reset_sent",
    resource:   "personnel",
    resourceId: personnelId,
    metadata:   { email: person.email },
  });

  return { success: true };
}

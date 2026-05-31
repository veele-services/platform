"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPermissions, requirePermission } from "@/lib/auth/permissions";
import { signPermissions, COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/auth/session-permissions";
import { db } from "@workspace/db";
import { auditLogTable, personnelTable } from "@workspace/db";
import type { ActionResult } from "./customers";

export type AuthFormState = {
  error: string | null;
};

/**
 * Server Action — sign in with email + password.
 *
 * Contract:
 *   1. Authenticate with Supabase.
 *   2. Insert audit log entry — MANDATORY.  Sign-in is rolled back if the
 *      audit insert fails to ensure every login event is recorded.
 *   3. Encode and sign the user's permissions in a cookie for middleware RBAC.
 *   4. Redirect to dashboard.
 */
export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email    = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

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

  // ── Mandatory audit log ───────────────────────────────────────────────────
  // If this fails the sign-in is rolled back so every login is recorded.
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

  // ── Permissions cookie for middleware RBAC ────────────────────────────────
  // Non-fatal: if encoding fails the user still gets in; server components
  // will enforce RBAC via hasPermission().
  try {
    const permissions = await getUserPermissions(data.user.id);
    const signed      = await signPermissions([...permissions]);
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, signed, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      path:     "/",
      maxAge:   COOKIE_MAX_AGE,
    });
  } catch {
    // Log but do not block sign-in.
    console.error("[auth] Failed to set permissions cookie after sign-in.");
  }

  redirect("/");
}

/**
 * Server Action — sign out the current user.
 *
 * Audit logging is best-effort here: blocking a sign-out on a log failure
 * would leave users unable to log out, which is a worse outcome than a
 * missing audit entry.  Failures are surfaced in server logs.
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

  // Clear permissions cookie.
  try {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
  } catch {
    // Best-effort.
  }

  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Server Action — send a password-reset e-mail to a personnel member.
 *
 * Only callable by users with personnel:write permission.
 * The employee must have an active portal account (user_id set).
 * Supabase sends the reset e-mail via its configured SMTP transport.
 */
export async function sendPasswordReset(personnelId: string): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [person] = await db
    .select({ email: personnelTable.email, userId: personnelTable.userId })
    .from(personnelTable)
    .where(eq(personnelTable.id, personnelId))
    .limit(1);

  if (!person) return { success: false, message: "Medewerker niet gevonden." };
  if (!person.userId) {
    return { success: false, message: "Medewerker heeft nog geen actief portaalaccount." };
  }

  // Use the admin API to generate and send the recovery link.
  // generateLink({ type: 'recovery' }) sends the email via Supabase's configured
  // SMTP transport AND returns the link — preferred over resetPasswordForEmail
  // because it bypasses per-user rate limits and ensures the user exists first.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.generateLink({
    type:  "recovery",
    email: person.email,
  });

  if (error) {
    return { success: false, message: error.message ?? "Wachtwoord-reset mislukt." };
  }

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "password_reset_sent",
    resource:   "personnel",
    resourceId: personnelId,
    metadata:   { email: person.email },
  });

  return { success: true };
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { createCredentialChallenge, db, personnelTable } from "@workspace/db";
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

function firstForwardedValue(value: string | null): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

async function currentPersoneelPortalUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host =
    firstForwardedValue(requestHeaders.get("x-forwarded-host")) ||
    requestHeaders.get("host");
  if (!host) return personeelPortalUrl();

  const proto = firstForwardedValue(requestHeaders.get("x-forwarded-proto")) || "https";
  return `${proto}://${host.replace(/\/$/, "")}/personeel`;
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

  if (!personnel) return null;

  let authUser: AuthUserRecord | null = null;
  if (personnel.userId) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(personnel.userId);
    if (error) throw new Error(error.message ?? "Auth-gebruiker ophalen mislukt.");
    authUser = data.user as AuthUserRecord | null;
    if (authUser?.email?.toLowerCase() !== normalizedEmail) return null;
  } else {
    authUser = await findAuthUserByEmail(normalizedEmail);
  }

  if (!authUser) return null;
  return {
    authUser,
    recipientName: personnelDisplayName(personnel, displayName(authUser, normalizedEmail)),
  };
}

function isTemporaryPasswordExpired(appMetadata: Record<string, unknown> | null | undefined): boolean {
  const expiresAt = appMetadata?.["temporary_password_expires_at"];
  if (typeof expiresAt !== "string" || !expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  return Number.isFinite(expiry) && expiry <= Date.now();
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

  if (data.user?.app_metadata?.force_password_change === true) {
    if (isTemporaryPasswordExpired(data.user.app_metadata as Record<string, unknown>)) {
      await supabase.auth.signOut();
      redirect(`/login?error=${encodeURIComponent("De tijdelijke code is verlopen. Vraag een nieuwe herstelcode aan.")}`);
    }
    redirect("/reset-wachtwoord?force=1");
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
      return { error: "Wachtwoord opgeslagen, maar de eerste-login status kon niet worden afgerond. Neem contact op met de beheerder." };
    }
  }

  await supabase.auth.signOut();
  return { success: true };
}

export async function requestPasswordResetCode(email: string): Promise<{ success: boolean; message?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { success: false, message: "E-mailadres is verplicht." };

  try {
    const tenantId = await requireCurrentPersonnelPortalTenantId();
    if (!tenantId) {
      return { success: false, message: "Personeelsportaal voor deze host is niet beschikbaar." };
    }

    const account = await findPersonnelResetAccount(tenantId, normalizedEmail);
    if (!account) return { success: true };

    const challenge = await createCredentialChallenge({
      purpose: "password_reset",
      userId: account.authUser.id,
      email: normalizedEmail,
      portal: "personnel",
      tenantId,
      hostClass: await currentPersoneelPortalUrl(),
      metadata: { transportPurpose: "personnel_portal_password_reset", tenant_id: tenantId },
    });
    const code = challenge.code;

    const { subject, html } = buildPasswordResetCodeEmail({
      recipientName: account.recipientName,
      portalName: "Personeelsportaal",
      resetUrl: `${await currentPersoneelPortalUrl()}/wachtwoord-vergeten`,
      code,
    });
    const sent = await sendEmailWithResult({
      to: normalizedEmail,
      subject,
      html,
      tenantId,
      purpose: "personnel_portal_password_reset",
    });
    if (!sent.success) throw new Error(sent.error ?? "Herstelmail versturen mislukt.");
  } catch (error) {
    console.error("[auth] Personeel password reset mail failed:", error);
    return { success: false, message: "Herstelmail versturen mislukt. Probeer het later opnieuw." };
  }

  return { success: true };
}

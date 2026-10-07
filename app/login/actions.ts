"use server";

import { prepareLoginMailContext, releaseLoginMailContext } from "@/lib/auth/login-mail-context";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { cookies, headers } from "next/headers";
import { tenantAppUrl, TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { safeStaffNext } from "@/lib/auth/staff-login";
import { getLoginAccess } from "@/lib/auth/login-access";
import { otpNext, verifiedLoginDestination } from "@/lib/auth/login-destination";

export type AuthState = { error?: string; success?: string };
export type OtpState = {
  step: "email" | "code";
  email?: string;
  next?: string;
  requestedAt?: number;
  notice?: string;
  error?: string;
};
export type StaffOtpState = OtpState;

const staffOtpRequestSchema = z.object({
  intent: z.literal("request"),
  email: z.string().trim().toLowerCase().email().max(320),
  next: z.string().max(2048).optional(),
});

const staffOtpVerifySchema = z.object({
  intent: z.literal("verify"),
  email: z.string().trim().toLowerCase().email().max(320),
  code: z.string().trim().regex(/^\d{6,10}$/),
  next: z.string().max(2048).optional(),
});

export async function signIn(_?: AuthState, _formData?: FormData): Promise<AuthState> {
  void _; void _formData;
  // Keep old action IDs harmless during a rolling release. Password requests
  // never reach Auth and cannot reinstall a password-authenticated session.
  return { error: "Log in met een eenmalige e-mailcode. Vraag een nieuwe code aan op het inlogscherm." };
}

/** Every workspace uses this same OTP flow. A role is never accepted from the
 * browser; unknown accounts and delivery failures remain indistinguishable. */
export async function loginOtp(_: OtpState, formData: FormData): Promise<OtpState> {
  const intent = formData.get("intent");
  if (intent === "request") {
    const input = staffOtpRequestSchema.safeParse(Object.fromEntries(formData));
    if (!input.success) return { step: "email", error: "Vul een geldig e-mailadres in." };
    const next = otpNext(input.data.next);
    try {
      const supabase = await createClient();
      const tenantSlug = (await headers()).get(TENANT_SLUG_HEADER);
      // Branding context only: the mail contains a code, not this login URL.
      // Required APP_URL is the configured platform origin, never a local or
      // legacy fallback. The trusted slug is overwritten by the proxy.
      const emailRedirectTo = tenantSlug
        ? tenantAppUrl(tenantSlug, "/login")
        : new URL("/login", z.url().parse(process.env.APP_URL)).toString();
      const context = await prepareLoginMailContext(tenantSlug, input.data.email);
      if (context) {
        try {
          const result = await supabase.auth.signInWithOtp({
            email: input.data.email,
            options: { emailRedirectTo, shouldCreateUser: false },
          });
          if (result.error) await releaseLoginMailContext(context);
        } catch { await releaseLoginMailContext(context); }
      }
    } catch {
      // Deliberately indistinguishable from an unknown account or a delivered
      // message. This endpoint must never become an account-enumeration oracle.
    }
    return {
      step: "code",
      email: input.data.email,
      next,
      requestedAt: Date.now(),
      notice: "Als dit account toegang heeft, ontvang je een e-mail met een eenmalige inlogcode.",
    };
  }

  const input = staffOtpVerifySchema.safeParse(Object.fromEntries(formData));
  const invalid = (email?: string, next?: string): OtpState => ({
    step: "code",
    email,
    next: otpNext(next),
    error: "De code is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.",
  });
  if (!input.success) {
    const email = typeof formData.get("email") === "string" ? String(formData.get("email")) : undefined;
    const next = typeof formData.get("next") === "string" ? String(formData.get("next")) : undefined;
    return invalid(email, next);
  }

  const supabase = await createClient();
  const verified = await supabase.auth.verifyOtp({ email: input.data.email, token: input.data.code, type: "email" }).catch(() => null);
  if (!verified) return invalid(input.data.email, input.data.next);
  const { data, error } = verified;
  if (error || !data.user || !data.session) return invalid(input.data.email, input.data.next);

  const discardSession = async () => {
    try { await supabase.auth.signOut({ scope: "local" }); } catch { /* No transport details. */ }
    // An Auth outage must not leave the newly created unauthorized session
    // installed. Only this origin's Supabase Auth cookies are removed.
    try {
      const jar = await cookies();
      for (const item of jar.getAll()) if (/^sb-.*-auth-token(?:\.\d+)?$/.test(item.name)) jar.delete(item.name);
    } catch { /* Live workspace guards still fail closed. */ }
  };
  let destination: string | null = null;
  try {
    const access = await getLoginAccess();
    destination = verifiedLoginDestination(input.data.next, access.workspaces);
    if (!destination) {
      await discardSession();
      return invalid(input.data.email, input.data.next);
    }
  } catch {
    await discardSession();
    return invalid(input.data.email, input.data.next);
  }
  redirect(destination);
}

/** Compatibility for already-open personnel forms; still exactly the same
 * authenticated code path and live role guard as every other workspace. */
export async function staffOtp(state: StaffOtpState, formData: FormData): Promise<StaffOtpState> {
  const bounded = new FormData();
  for (const [key, value] of formData) bounded.append(key, value);
  bounded.set("next", safeStaffNext(typeof formData.get("next") === "string" ? String(formData.get("next")) : undefined));
  return loginOtp(state, bounded);
}

export async function requestPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  void formData;
  return { error: "Een wachtwoord is niet nodig. Vraag op het inlogscherm een eenmalige e-mailcode aan." };
}

export async function updatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  void formData;
  return { error: "Fieldgrid gebruikt eenmalige e-mailcodes. Je hoeft geen wachtwoord in te stellen." };
}

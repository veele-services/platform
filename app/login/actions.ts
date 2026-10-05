"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { tenantAppUrl, TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { safeNext } from "@/lib/auth/safe-next";
import { getAuthContext } from "@/lib/auth/context";
import { safeStaffNext } from "@/lib/auth/staff-login";

export type AuthState = { error?: string; success?: string };
export type StaffOtpState = {
  step: "email" | "code";
  email?: string;
  next?: string;
  requestedAt?: number;
  notice?: string;
  error?: string;
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

const staffOtpRequestSchema = z.object({
  intent: z.literal("request"),
  email: z.string().trim().toLowerCase().email().max(320),
  next: z.string().max(2048).optional(),
});

const staffOtpVerifySchema = z.object({
  intent: z.literal("verify"),
  email: z.string().trim().toLowerCase().email().max(320),
  code: z.string().trim().regex(/^\d{6}$/),
  next: z.string().max(2048).optional(),
});

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Vul een geldig e-mailadres en wachtwoord in." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: "Inloggen is niet gelukt. Controleer je gegevens." };
  redirect(safeNext(parsed.data.next));
}

/** Passwordless sign-in is intentionally restricted to the personnel workspace.
 * Unknown accounts and provider failures receive the same request response. */
export async function staffOtp(_: StaffOtpState, formData: FormData): Promise<StaffOtpState> {
  const intent = formData.get("intent");
  if (intent === "request") {
    const input = staffOtpRequestSchema.safeParse(Object.fromEntries(formData));
    if (!input.success) return { step: "email", error: "Vul een geldig e-mailadres in." };
    const next = safeStaffNext(input.data.next);
    try {
      const supabase = await createClient();
      const tenantSlug = (await headers()).get(TENANT_SLUG_HEADER);
      const emailRedirectTo = tenantSlug
        ? tenantAppUrl(tenantSlug, "/staff")
        : new URL("/staff", process.env.APP_URL ?? "http://127.0.0.1:3000").toString();
      await supabase.auth.signInWithOtp({
        email: input.data.email,
        options: { emailRedirectTo, shouldCreateUser: false },
      });
    } catch {
      // Deliberately indistinguishable from an unknown account or a delivered
      // message. This endpoint must never become an account-enumeration oracle.
    }
    return {
      step: "code",
      email: input.data.email,
      next,
      requestedAt: Date.now(),
      notice: "Als dit account toegang heeft, ontvang je een e-mail met een zescijferige code.",
    };
  }

  const input = staffOtpVerifySchema.safeParse(Object.fromEntries(formData));
  const invalid = (email?: string, next?: string): StaffOtpState => ({
    step: "code",
    email,
    next: safeStaffNext(next),
    error: "De code is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.",
  });
  if (!input.success) {
    const email = typeof formData.get("email") === "string" ? String(formData.get("email")) : undefined;
    const next = typeof formData.get("next") === "string" ? String(formData.get("next")) : undefined;
    return invalid(email, next);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: input.data.email,
    token: input.data.code,
    type: "email",
  });
  if (error || !data.user || !data.session) return invalid(input.data.email, input.data.next);

  try {
    const access = await getAuthContext();
    if (!access.tenant?.roles.includes("staff")) {
      await supabase.auth.signOut({ scope: "local" });
      return invalid(input.data.email, input.data.next);
    }
  } catch {
    await supabase.auth.signOut({ scope: "local" });
    return invalid(input.data.email, input.data.next);
  }
  redirect(safeStaffNext(input.data.next));
}

export async function requestPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Vul een geldig e-mailadres in." };
  const supabase = await createClient();
  const tenantSlug = (await headers()).get(TENANT_SLUG_HEADER);
  const confirmUrl = new URL(tenantSlug ? tenantAppUrl(tenantSlug, "/auth/confirm") : `${process.env.APP_URL ?? "http://127.0.0.1:3000"}/auth/confirm`);
  confirmUrl.searchParams.set("next", "/auth/reset");
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: confirmUrl.toString(),
  });
  if (error) return { error: "De herstelmail kon niet worden aangevraagd." };
  return { success: "Als dit account bestaat, ontvang je een herstelmail." };
}

export async function updatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const password = z.string().min(10).safeParse(formData.get("password"));
  if (!password.success) return { error: "Gebruik minimaal 10 tekens." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: "Het wachtwoord kon niet worden gewijzigd." };
  redirect(formData.get("next") === "/staff" ? "/staff" : "/app");
}

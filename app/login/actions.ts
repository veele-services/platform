"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { tenantAppUrl, TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";

export type AuthState = { error?: string; success?: string };

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

function safeNext(value?: string): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

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
  redirect("/app");
}

"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient as isolatedClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { ticketRpc } from "@/lib/tickets/rpc";
import { verificationType } from "@/lib/email-centre/auth-message";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";

export type VerificationState = { error?: string; message?: string };
export async function verifyAccountEmail(_: VerificationState, form: FormData): Promise<VerificationState> {
  const input = z.object({ type: verificationType, tokenHash: z.string().regex(/^[A-Za-z0-9_-]{32,512}$/) }).safeParse(Object.fromEntries(form));
  const invalid = { error: "Deze link is ongeldig, verlopen of al gebruikt. Vraag een nieuwe link aan in de omgeving waar je wilt inloggen." };
  if (!input.success) return invalid;
  // Old login/recovery links do not create browser sessions. Account activation
  // and secure email change remain separate from the required OTP login.
  if (!["signup", "invite", "email_change"].includes(input.data.type)) return invalid;
  const env = getServerEnv(), tenantSlug = (await headers()).get(TENANT_SLUG_HEADER);
  const verifier = isolatedClient(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const verified = await verifier.auth.verifyOtp({ type: input.data.type, token_hash: input.data.tokenHash }).catch(() => null);
  if (!verified || verified.error) return invalid;
  const { data } = verified;
  // Secure Email Change may confirm its first mailbox without issuing a session.
  if (input.data.type === "email_change" && !data.session) return { message: "Deze bevestiging is verwerkt. Heb je ook op je andere e-mailadres een bevestiging ontvangen? Open die dan ook. Log daarna opnieuw in." };
  if (!data.user || !data.session) return invalid;
  if (tenantSlug) {
    try {
      // Check live membership/bindings, not the pending invitation exception.
      await ticketRpc(createAdminClient(), "email_auth_context", { target_slug: tenantSlug, actor: data.user.id, recipient: data.user.email, action_type: "session" });
    } catch { await verifier.auth.signOut({ scope: "local" }).catch(() => undefined); return invalid; }
  }
  await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
  // No user-controlled next URL; the subsequent code login checks live roles.
  redirect("/login");
}

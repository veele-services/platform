"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient as isolatedClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
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
  const env = getServerEnv(), tenantSlug = (await headers()).get(TENANT_SLUG_HEADER);
  const verifier = isolatedClient(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await verifier.auth.verifyOtp({ type: input.data.type, token_hash: input.data.tokenHash });
  if (error) return invalid;
  // Secure Email Change may confirm its first mailbox without issuing a session.
  if (input.data.type === "email_change" && !data.session) return { message: "Deze bevestiging is verwerkt. Heb je ook op je andere e-mailadres een bevestiging ontvangen? Open die dan ook. Log daarna opnieuw in." };
  if (!data.user || !data.session) return invalid;
  if (tenantSlug) {
    try {
      // Check live membership/bindings, not the pending invitation exception.
      await ticketRpc(createAdminClient(), "email_auth_context", { target_slug: tenantSlug, actor: data.user.id, recipient: data.user.email, action_type: "session" });
    } catch { await verifier.auth.signOut({ scope: "local" }); return invalid; }
  }
  const client = await createClient();
  const installed = await client.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  if (installed.error) { await verifier.auth.signOut({ scope: "local" }); return invalid; }
  // No user-controlled next URL. The login page selects the existing workspace.
  if (input.data.type === "recovery" || input.data.type === "invite") redirect("/auth/reset");
  redirect("/login");
}

"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient as createIsolatedClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { AuthState } from "@/app/login/actions";
import { getServerEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";
import { getInvitationTenant } from "@/lib/personnel/invite-tenant";

export async function acceptPersonnelInvitation(_: AuthState, formData: FormData): Promise<AuthState> {
  const input = z.object({ tenantSlug: z.string().max(100), tokenHash: z.string().min(32).max(512).regex(/^[A-Za-z0-9_-]+$/) }).safeParse(Object.fromEntries(formData));
  const invalid = { error: "Deze uitnodiging is ongeldig, verlopen of al gebruikt. Vraag je beheerder om een nieuwe uitnodiging." };
  if (!input.success) return invalid;
  const tenant = await getInvitationTenant(input.data.tenantSlug);
  if (!tenant) return invalid;
  const env = getServerEnv();
  // Verify in isolation: do not install a browser session before checking the
  // user's real, database-backed membership and personnel record for this tenant.
  const verifier = createIsolatedClient<Database>(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await verifier.auth.verifyOtp({ type: "invite", token_hash: input.data.tokenHash });
  if (error || !data.user || !data.session) return invalid;
  const [{ data: membership }, { data: person }] = await Promise.all([
    verifier.from("tenant_memberships").select("roles,status").eq("tenant_id", tenant.id).eq("user_id", data.user.id).maybeSingle(),
    verifier.from("personnel").select("id,status").eq("tenant_id", tenant.id).eq("user_id", data.user.id).maybeSingle(),
  ]);
  if (membership?.status !== "active" || !membership.roles.includes("staff") || !person || !["invited", "active"].includes(person.status)) {
    await verifier.auth.signOut({ scope: "local" });
    return invalid;
  }
  const supabase = await createClient();
  const { error: sessionError } = await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  if (sessionError) {
    await verifier.auth.signOut({ scope: "local" });
    return invalid;
  }
  if (env.DEPLOY_TARGET === "local") (await cookies()).set("fieldgrid_tenant_id", tenant.id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/auth/reset?next=/staff&invite=1");
}

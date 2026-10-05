import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { getMollieProfile } from "@/lib/providers/mollie";

/** A key's presence never selects a tenant's payee. Operator binding and the
 * provider's authenticated profile must agree before any customer checkout. */
export async function requireTenantMerchant(tenantId: string) {
  const env = getServerEnv();
  const mode = env.MOLLIE_API_KEY?.startsWith("test_") ? "test" : env.MOLLIE_API_KEY?.startsWith("live_") ? "live" : null;
  if (!mode || !env.MOLLIE_WEBHOOK_URL) throw new Error("Betaalverbinding ontbreekt");
  const { data, error } = await createAdminClient().from("tenant_provider_connections")
    .select("mode,secret_reference,public_config,verified_at").eq("tenant_id", tenantId).eq("provider", "mollie").eq("active", true).maybeSingle();
  const config = data?.public_config as { profile_id?: unknown } | null;
  const profileId = config?.profile_id;
  if (error || !data?.verified_at || data.mode !== mode || data.secret_reference !== "MOLLIE_API_KEY" ||
      typeof profileId !== "string" || !/^pfl_[A-Za-z0-9]+$/.test(profileId)) throw new Error("Betaalverbinding ontbreekt");
  const profile = await getMollieProfile();
  if (profile.id !== profileId) throw new Error("Betaalontvanger komt niet overeen");
  return { mode, profileId } as const;
}

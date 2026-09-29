import "server-only";

import { headers } from "next/headers";
import { getServerEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";

export async function getInvitationTenant(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const hostSlug = (await headers()).get(TENANT_SLUG_HEADER);
  if (hostSlug !== slug && (hostSlug || getServerEnv().DEPLOY_TARGET !== "local")) return null;
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id,name,slug").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!tenant) return null;
  const { data: settings } = await admin.from("tenant_settings").select("enabled_services").eq("tenant_id", tenant.id).maybeSingle();
  return settings?.enabled_services.includes("personeel") ? tenant : null;
}

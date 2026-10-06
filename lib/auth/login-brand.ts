import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { currentBrandingLogoPath } from "@/lib/branding/logo-url";

/** Public presentation only. No membership/account lookup and no selectable
 * tenant parameter: the proxy has already validated and overwritten the host. */
export async function getLoginBrand() {
  const slug = (await headers()).get(TENANT_SLUG_HEADER);
  if (!slug) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Onbekende tenant");
  const admin = createAdminClient();
  const { data: tenant, error } = await admin.from("tenants").select("id,name,tenant_branding(primary_color,accent_color,logo_path)").eq("slug", slug).eq("status", "active").maybeSingle();
  if (error || !tenant) throw new Error("Onbekende tenant");
  const brand=tenant.tenant_branding;
  return { name: tenant.name, primaryColor: brand?.primary_color, accentColor: brand?.accent_color,
    logoUrl: currentBrandingLogoPath(tenant.id, brand?.logo_path) };
}

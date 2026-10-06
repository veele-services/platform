import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import type { EmailBrand } from "./email";

/** Resolve attribution from the current platform-controlled setting, not user input. */
export async function withTenantEmailBrand(tenantId: string | null, brand: EmailBrand): Promise<EmailBrand> {
  if (!tenantId) return { ...brand, whiteLabelEnabled: true };
  const { data, error } = await createAdminClient().from("tenant_settings").select("white_label_enabled").eq("tenant_id", tenantId).single();
  if (error || !data) throw new Error("De e-mailhuisstijl kon niet worden gecontroleerd.");
  // Platform support delivered to a tenant uses that tenant's identity too.
  if (brand.company === "Fieldgrid") {
    const db = createAdminClient();
    const { data: tenant, error: tenantError } = await db.from("tenants").select("name,tenant_branding(primary_color,accent_color,logo_path)").eq("id",tenantId).eq("status","active").single();
    if (tenantError || !tenant) throw new Error("De organisatiehuisstijl is niet beschikbaar.");
    const identity = tenant.tenant_branding;
    return { ...brand, company: tenant.name, primary: identity?.primary_color ?? brand.primary, accent: identity?.accent_color ?? brand.accent, emailLogoUrl: identity?.logo_path ? `${getServerEnv().APP_URL}/api/branding/${tenantId}/email-logo` : null, whiteLabelEnabled: data.white_label_enabled };
  }
  return { ...brand, whiteLabelEnabled: data.white_label_enabled };
}

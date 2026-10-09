import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { HOST_KIND_HEADER, TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { currentBrandingLogoPath } from "@/lib/branding/logo-url";
import { buildStaffMetadata, FIELDGRID_PWA_IDENTITY, type StaffPwaIdentity } from "./presentation";

export type StaffPwaSource = {
  identity: StaffPwaIdentity;
  tenantId: string | null;
  logoPath: string | null;
};

/** Public presentation only, resolved exclusively from proxy-overwritten host
 * signals. No account, selectable tenant ID, storage URL or signed URL is used. */
export async function getStaffPwaSource(): Promise<StaffPwaSource> {
  const requestHeaders = await headers();
  const kind = requestHeaders.get(HOST_KIND_HEADER);
  const slug = requestHeaders.get(TENANT_SLUG_HEADER);
  if (kind === "platform" && !slug) return { identity: FIELDGRID_PWA_IDENTITY, tenantId: null, logoPath: null };
  if (kind !== "tenant" || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Onbekende tenant");
  const admin = createAdminClient();
  const { data: tenant, error } = await admin.from("tenants")
    .select("id,name,tenant_branding(primary_color,logo_path),tenant_settings(white_label_enabled)")
    .eq("slug", slug).eq("status", "active").maybeSingle();
  if (error || !tenant || !tenant.tenant_settings) throw new Error("Onbekende tenant");
  if (tenant.tenant_settings.white_label_enabled !== true) return { identity: FIELDGRID_PWA_IDENTITY, tenantId: tenant.id, logoPath: null };
  const name = tenant.name.trim().slice(0, 80) || "Personeelsapp";
  const logoPath = currentBrandingLogoPath(tenant.id, tenant.tenant_branding?.logo_path) ? tenant.tenant_branding!.logo_path : null;
  const primary = tenant.tenant_branding?.primary_color;
  return {
    tenantId: tenant.id,
    logoPath,
    identity: {
      name,
      shortName: name.slice(0, 30),
      whiteLabel: true,
      iconUrl: "/staff/pwa/icon-192.png",
      themeColor: primary && /^#[a-f0-9]{6}$/i.test(primary) ? primary : FIELDGRID_PWA_IDENTITY.themeColor,
      backgroundColor: FIELDGRID_PWA_IDENTITY.backgroundColor,
    },
  };
}

export async function getStaffPwaIdentity(): Promise<StaffPwaIdentity> {
  return (await getStaffPwaSource()).identity;
}

export async function getStaffPwaMetadata() {
  return buildStaffMetadata(await getStaffPwaIdentity());
}

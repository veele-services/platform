import {
  getPlatformBrandTheme,
  getTenantBranding,
  type BrandTheme,
  type TenantBranding,
} from "@workspace/db";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";

export type PersonnelPwaBranding = BrandTheme | TenantBranding;

export async function getPersonnelPwaBranding(): Promise<PersonnelPwaBranding> {
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  return tenantId ? getTenantBranding(tenantId) : getPlatformBrandTheme();
}

export function pwaImageType(url: string | null | undefined): string {
  const normalized = (url ?? "").split("?")[0]?.toLowerCase() ?? "";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

export function pwaDisplayName(branding: PersonnelPwaBranding): string {
  const customName =
    "displayName" in branding && branding.displayName.trim()
      ? branding.displayName.trim()
      : branding.brandName.trim();
  return customName || "Personeelsapp";
}

export function externalOrLocalUrl(value: string | null | undefined, requestUrl: string, fallbackPath: string): URL {
  const target = value?.trim() || fallbackPath;
  return new URL(target, requestUrl);
}


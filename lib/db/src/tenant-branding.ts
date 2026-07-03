import { eq } from "drizzle-orm";
import { db } from "./index";
import { organizationSettingsTable, tenantsTable, type TenantPlanKey } from "./schema";
import { getTenantPlanSnapshot } from "./tenant-entitlements";

const CUSTOM_BRANDING_PLAN_KEYS = new Set<TenantPlanKey>(["professional", "enterprise"]);

export const FIELDGRID_BRAND_DEFAULTS = {
  platformName: "Fieldgrid",
  primaryColor: "#081D3A",
  accentColor: "#00B7B3",
  footerText:
    "Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.",
  signature: "Met vriendelijke groet,\nFieldgrid",
} as const;

export type TenantBranding = {
  tenantId: string;
  tenantName: string;
  displayName: string;
  platformName: string;
  plan: TenantPlanKey;
  customBrandingEnabled: boolean;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  emailFooterText: string;
  emailSignature: string;
};

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  const trimmed = nonEmpty(value);
  if (!trimmed) return fallback;
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback;
}

export function canTenantUseCustomBranding(plan: TenantPlanKey): boolean {
  return CUSTOM_BRANDING_PLAN_KEYS.has(plan);
}

export async function getTenantBranding(tenantId: string): Promise<TenantBranding> {
  const [row] = await db
    .select({
      tenantName: tenantsTable.name,
      organizationName: organizationSettingsTable.naam,
      logoUrl: organizationSettingsTable.logoUrl,
      brandColor: organizationSettingsTable.emailTemplateBrandColor,
      accentColor: organizationSettingsTable.emailTemplateAccentColor,
      footerText: organizationSettingsTable.emailTemplateFooterText,
      signature: organizationSettingsTable.emailTemplateSignature,
    })
    .from(tenantsTable)
    .leftJoin(organizationSettingsTable, eq(organizationSettingsTable.tenantId, tenantsTable.id))
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  const plan = await getTenantPlanSnapshot(tenantId);
  const customBrandingEnabled = canTenantUseCustomBranding(plan.plan);
  const tenantName = nonEmpty(row?.organizationName) ?? nonEmpty(row?.tenantName) ?? FIELDGRID_BRAND_DEFAULTS.platformName;

  return {
    tenantId,
    tenantName,
    displayName: tenantName,
    platformName: FIELDGRID_BRAND_DEFAULTS.platformName,
    plan: plan.plan,
    customBrandingEnabled,
    logoUrl: customBrandingEnabled ? nonEmpty(row?.logoUrl) : null,
    primaryColor: customBrandingEnabled
      ? normalizeHexColor(row?.brandColor, FIELDGRID_BRAND_DEFAULTS.primaryColor)
      : FIELDGRID_BRAND_DEFAULTS.primaryColor,
    accentColor: customBrandingEnabled
      ? normalizeHexColor(row?.accentColor, FIELDGRID_BRAND_DEFAULTS.accentColor)
      : FIELDGRID_BRAND_DEFAULTS.accentColor,
    emailFooterText: nonEmpty(row?.footerText) ?? FIELDGRID_BRAND_DEFAULTS.footerText,
    emailSignature: nonEmpty(row?.signature) ?? FIELDGRID_BRAND_DEFAULTS.signature,
  };
}

export function getTenantBrandingCssVariables(branding: TenantBranding): Record<string, string> {
  return {
    "--color-primary": branding.primaryColor,
    "--color-primary-light": branding.primaryColor,
    "--color-accent": branding.accentColor,
    "--color-accent-dark": branding.accentColor,
  };
}

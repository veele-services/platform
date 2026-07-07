import { eq } from "drizzle-orm";
import { db } from "./index";
import {
  organizationSettingsTable,
  platformThemeSettingsTable,
  tenantThemeSettingsTable,
  tenantsTable,
  type TenantPlanKey,
} from "./schema";
import { getTenantPlanSnapshot } from "./tenant-entitlements";

const CUSTOM_BRANDING_PLAN_KEYS = new Set<TenantPlanKey>(["professional", "enterprise"]);
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

export const BRAND_THEME_FONT_OPTIONS = ["inter", "poppins", "system"] as const;
export const BRAND_THEME_RADIUS_OPTIONS = ["sm", "md", "lg"] as const;
export const BRAND_THEME_DENSITY_OPTIONS = ["compact", "comfortable", "spacious"] as const;

export type BrandThemeFont = (typeof BRAND_THEME_FONT_OPTIONS)[number];
export type BrandThemeRadius = (typeof BRAND_THEME_RADIUS_OPTIONS)[number];
export type BrandThemeDensity = (typeof BRAND_THEME_DENSITY_OPTIONS)[number];

export type BrandTheme = {
  brandName: string;
  platformName: string;
  logoUrl: string | null;
  logoStoragePath: string | null;
  faviconUrl: string | null;
  faviconStoragePath: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedColor: string;
  fontFamily: BrandThemeFont;
  headingFontFamily: BrandThemeFont;
  borderRadius: BrandThemeRadius;
  density: BrandThemeDensity;
  emailFooterText: string;
  emailSignature: string;
};

export type BrandThemeOverride = Partial<{
  brandName: string | null;
  logoUrl: string | null;
  logoStoragePath: string | null;
  faviconUrl: string | null;
  faviconStoragePath: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  backgroundColor: string | null;
  surfaceColor: string | null;
  textColor: string | null;
  mutedColor: string | null;
  fontFamily: string | null;
  headingFontFamily: string | null;
  borderRadius: string | null;
  density: string | null;
  emailFooterText: string | null;
  emailSignature: string | null;
}>;

export const FIELDGRID_DEFAULT_BRAND_THEME: BrandTheme = {
  brandName: "Fieldgrid",
  platformName: "Fieldgrid",
  logoUrl: null,
  logoStoragePath: null,
  faviconUrl: null,
  faviconStoragePath: null,
  primaryColor: "#081D3A",
  secondaryColor: "#133D6B",
  accentColor: "#00B7B3",
  backgroundColor: "#F8FAFC",
  surfaceColor: "#FFFFFF",
  textColor: "#081D3A",
  mutedColor: "#64748B",
  fontFamily: "inter",
  headingFontFamily: "poppins",
  borderRadius: "md",
  density: "comfortable",
  emailFooterText:
    "Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.",
  emailSignature: "Met vriendelijke groet,\nFieldgrid",
};

export const FIELDGRID_BRAND_DEFAULTS = {
  platformName: FIELDGRID_DEFAULT_BRAND_THEME.platformName,
  primaryColor: FIELDGRID_DEFAULT_BRAND_THEME.primaryColor,
  accentColor: FIELDGRID_DEFAULT_BRAND_THEME.accentColor,
  footerText: FIELDGRID_DEFAULT_BRAND_THEME.emailFooterText,
  signature: FIELDGRID_DEFAULT_BRAND_THEME.emailSignature,
} as const;

export type TenantBranding = BrandTheme & {
  tenantId: string;
  tenantName: string;
  displayName: string;
  plan: TenantPlanKey;
  customBrandingEnabled: boolean;
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
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : fallback;
}

function normalizeChoice<T extends readonly string[]>(
  value: string | null | undefined,
  options: T,
  fallback: T[number],
): T[number] {
  const trimmed = nonEmpty(value);
  return trimmed && options.includes(trimmed) ? trimmed : fallback;
}

export function canTenantUseCustomBranding(plan: TenantPlanKey): boolean {
  return CUSTOM_BRANDING_PLAN_KEYS.has(plan);
}

export function mergeBrandTheme(base: BrandTheme, override: BrandThemeOverride | null | undefined): BrandTheme {
  if (!override) return { ...base };

  return {
    brandName: nonEmpty(override.brandName) ?? base.brandName,
    platformName: base.platformName,
    logoUrl: nonEmpty(override.logoUrl) ?? base.logoUrl,
    logoStoragePath: nonEmpty(override.logoStoragePath) ?? base.logoStoragePath,
    faviconUrl: nonEmpty(override.faviconUrl) ?? base.faviconUrl,
    faviconStoragePath: nonEmpty(override.faviconStoragePath) ?? base.faviconStoragePath,
    primaryColor: normalizeHexColor(override.primaryColor, base.primaryColor),
    secondaryColor: normalizeHexColor(override.secondaryColor, base.secondaryColor),
    accentColor: normalizeHexColor(override.accentColor, base.accentColor),
    backgroundColor: normalizeHexColor(override.backgroundColor, base.backgroundColor),
    surfaceColor: normalizeHexColor(override.surfaceColor, base.surfaceColor),
    textColor: normalizeHexColor(override.textColor, base.textColor),
    mutedColor: normalizeHexColor(override.mutedColor, base.mutedColor),
    fontFamily: normalizeChoice(override.fontFamily, BRAND_THEME_FONT_OPTIONS, base.fontFamily),
    headingFontFamily: normalizeChoice(override.headingFontFamily, BRAND_THEME_FONT_OPTIONS, base.headingFontFamily),
    borderRadius: normalizeChoice(override.borderRadius, BRAND_THEME_RADIUS_OPTIONS, base.borderRadius),
    density: normalizeChoice(override.density, BRAND_THEME_DENSITY_OPTIONS, base.density),
    emailFooterText: nonEmpty(override.emailFooterText) ?? base.emailFooterText,
    emailSignature: nonEmpty(override.emailSignature) ?? base.emailSignature,
  };
}

function platformThemeOverrideFromRow(
  row: typeof platformThemeSettingsTable.$inferSelect | null | undefined,
): BrandThemeOverride | null {
  if (!row) return null;
  return {
    brandName: row.brandName,
    logoUrl: row.logoUrl,
    logoStoragePath: row.logoStoragePath,
    faviconUrl: row.faviconUrl,
    faviconStoragePath: row.faviconStoragePath,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    accentColor: row.accentColor,
    backgroundColor: row.backgroundColor,
    surfaceColor: row.surfaceColor,
    textColor: row.textColor,
    mutedColor: row.mutedColor,
    fontFamily: row.fontFamily,
    headingFontFamily: row.headingFontFamily,
    borderRadius: row.borderRadius,
    density: row.density,
    emailFooterText: row.emailFooterText,
    emailSignature: row.emailSignature,
  };
}

function tenantThemeOverrideFromRow(
  row: ({ useCustomTheme: boolean } & BrandThemeOverride) | null | undefined,
): BrandThemeOverride | null {
  if (!row?.useCustomTheme) return null;
  return {
    brandName: row.brandName,
    logoUrl: row.logoUrl,
    logoStoragePath: row.logoStoragePath,
    faviconUrl: row.faviconUrl,
    faviconStoragePath: row.faviconStoragePath,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    accentColor: row.accentColor,
    backgroundColor: row.backgroundColor,
    surfaceColor: row.surfaceColor,
    textColor: row.textColor,
    mutedColor: row.mutedColor,
    fontFamily: row.fontFamily,
    headingFontFamily: row.headingFontFamily,
    borderRadius: row.borderRadius,
    density: row.density,
    emailFooterText: row.emailFooterText,
    emailSignature: row.emailSignature,
  };
}

export async function getPlatformBrandTheme(): Promise<BrandTheme> {
  const [row] = await db
    .select()
    .from(platformThemeSettingsTable)
    .where(eq(platformThemeSettingsTable.singletonKey, true))
    .limit(1);

  return mergeBrandTheme(FIELDGRID_DEFAULT_BRAND_THEME, platformThemeOverrideFromRow(row));
}

export async function getTenantBranding(tenantId: string): Promise<TenantBranding> {
  const [row, plan, platformTheme] = await Promise.all([
    db
      .select({
        tenantName: tenantsTable.name,
        organizationName: organizationSettingsTable.naam,
        logoUrl: organizationSettingsTable.logoUrl,
        brandColor: organizationSettingsTable.emailTemplateBrandColor,
        accentColor: organizationSettingsTable.emailTemplateAccentColor,
        footerText: organizationSettingsTable.emailTemplateFooterText,
        signature: organizationSettingsTable.emailTemplateSignature,
        tenantThemeUseCustomTheme: tenantThemeSettingsTable.useCustomTheme,
        tenantThemeBrandName: tenantThemeSettingsTable.brandName,
        tenantThemeLogoUrl: tenantThemeSettingsTable.logoUrl,
        tenantThemeLogoStoragePath: tenantThemeSettingsTable.logoStoragePath,
        tenantThemeFaviconUrl: tenantThemeSettingsTable.faviconUrl,
        tenantThemeFaviconStoragePath: tenantThemeSettingsTable.faviconStoragePath,
        tenantThemePrimaryColor: tenantThemeSettingsTable.primaryColor,
        tenantThemeSecondaryColor: tenantThemeSettingsTable.secondaryColor,
        tenantThemeAccentColor: tenantThemeSettingsTable.accentColor,
        tenantThemeBackgroundColor: tenantThemeSettingsTable.backgroundColor,
        tenantThemeSurfaceColor: tenantThemeSettingsTable.surfaceColor,
        tenantThemeTextColor: tenantThemeSettingsTable.textColor,
        tenantThemeMutedColor: tenantThemeSettingsTable.mutedColor,
        tenantThemeFontFamily: tenantThemeSettingsTable.fontFamily,
        tenantThemeHeadingFontFamily: tenantThemeSettingsTable.headingFontFamily,
        tenantThemeBorderRadius: tenantThemeSettingsTable.borderRadius,
        tenantThemeDensity: tenantThemeSettingsTable.density,
        tenantThemeEmailFooterText: tenantThemeSettingsTable.emailFooterText,
        tenantThemeEmailSignature: tenantThemeSettingsTable.emailSignature,
      })
      .from(tenantsTable)
      .leftJoin(organizationSettingsTable, eq(organizationSettingsTable.tenantId, tenantsTable.id))
      .leftJoin(tenantThemeSettingsTable, eq(tenantThemeSettingsTable.tenantId, tenantsTable.id))
      .where(eq(tenantsTable.id, tenantId))
      .limit(1)
      .then((rows) => rows[0]),
    getTenantPlanSnapshot(tenantId),
    getPlatformBrandTheme(),
  ]);

  const planAllowsLegacyBranding = canTenantUseCustomBranding(plan.plan);
  const tenantName =
    nonEmpty(row?.organizationName) ??
    nonEmpty(row?.tenantName) ??
    platformTheme.brandName;
  const legacyTenantTheme = mergeBrandTheme(platformTheme, {
    brandName: tenantName,
    logoUrl: planAllowsLegacyBranding ? row?.logoUrl : null,
    primaryColor: planAllowsLegacyBranding ? row?.brandColor : null,
    accentColor: planAllowsLegacyBranding ? row?.accentColor : null,
    emailFooterText: row?.footerText,
    emailSignature: row?.signature,
  });
  const tenantOverride = row?.tenantThemeUseCustomTheme
    ? {
        useCustomTheme: row.tenantThemeUseCustomTheme,
        brandName: row.tenantThemeBrandName,
        logoUrl: row.tenantThemeLogoUrl,
        logoStoragePath: row.tenantThemeLogoStoragePath,
        faviconUrl: row.tenantThemeFaviconUrl,
        faviconStoragePath: row.tenantThemeFaviconStoragePath,
        primaryColor: row.tenantThemePrimaryColor,
        secondaryColor: row.tenantThemeSecondaryColor,
        accentColor: row.tenantThemeAccentColor,
        backgroundColor: row.tenantThemeBackgroundColor,
        surfaceColor: row.tenantThemeSurfaceColor,
        textColor: row.tenantThemeTextColor,
        mutedColor: row.tenantThemeMutedColor,
        fontFamily: row.tenantThemeFontFamily,
        headingFontFamily: row.tenantThemeHeadingFontFamily,
        borderRadius: row.tenantThemeBorderRadius,
        density: row.tenantThemeDensity,
        emailFooterText: row.tenantThemeEmailFooterText,
        emailSignature: row.tenantThemeEmailSignature,
      }
    : null;
  const tenantTheme = mergeBrandTheme(legacyTenantTheme, tenantThemeOverrideFromRow(tenantOverride));
  const customBrandingEnabled = planAllowsLegacyBranding || Boolean(row?.tenantThemeUseCustomTheme);

  return {
    ...tenantTheme,
    tenantId,
    tenantName,
    displayName: tenantTheme.brandName,
    plan: plan.plan,
    customBrandingEnabled,
    emailFooterText: tenantTheme.emailFooterText,
    emailSignature: tenantTheme.emailSignature,
  };
}

export async function getEffectiveBrandTheme(tenantId?: string | null): Promise<BrandTheme> {
  if (tenantId) return getTenantBranding(tenantId);
  return getPlatformBrandTheme();
}

function fontCssValue(font: BrandThemeFont): string {
  switch (font) {
    case "poppins":
      return "var(--font-poppins), Poppins, system-ui, sans-serif";
    case "system":
      return "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    case "inter":
      return "var(--font-inter), Inter, system-ui, sans-serif";
  }
}

function radiusCssValue(radius: BrandThemeRadius): string {
  switch (radius) {
    case "sm":
      return "4px";
    case "lg":
      return "10px";
    case "md":
      return "6px";
  }
}

function densityCssValue(density: BrandThemeDensity): string {
  switch (density) {
    case "compact":
      return "0.82";
    case "spacious":
      return "1.12";
    case "comfortable":
      return "1";
  }
}

export function getTenantBrandingCssVariables(branding: BrandTheme): Record<string, string> {
  const radius = radiusCssValue(branding.borderRadius);

  return {
    "--brand-primary": branding.primaryColor,
    "--brand-secondary": branding.secondaryColor,
    "--brand-accent": branding.accentColor,
    "--brand-background": branding.backgroundColor,
    "--brand-surface": branding.surfaceColor,
    "--brand-text": branding.textColor,
    "--brand-muted": branding.mutedColor,
    "--color-background": branding.backgroundColor,
    "--color-foreground": branding.textColor,
    "--color-card": branding.surfaceColor,
    "--color-card-foreground": branding.textColor,
    "--color-primary": branding.primaryColor,
    "--color-primary-light": branding.secondaryColor,
    "--color-primary-foreground": "#FFFFFF",
    "--color-secondary": branding.mutedColor,
    "--color-secondary-foreground": branding.textColor,
    "--color-accent": branding.accentColor,
    "--color-accent-dark": branding.accentColor,
    "--color-accent-foreground": "#FFFFFF",
    "--color-muted": branding.backgroundColor,
    "--color-muted-foreground": branding.mutedColor,
    "--color-muted-fg": branding.mutedColor,
    "--color-border": "#E2E8F0",
    "--color-input": "#E2E8F0",
    "--color-ring": branding.accentColor,
    "--color-navy": branding.primaryColor,
    "--color-navy-secondary": branding.secondaryColor,
    "--color-teal": branding.accentColor,
    "--font-sans": fontCssValue(branding.fontFamily),
    "--font-heading": fontCssValue(branding.headingFontFamily),
    "--radius": radius,
    "--radius-card": radius,
    "--radius-button": radius,
    "--radius-input": radius,
    "--theme-density": densityCssValue(branding.density),
  };
}

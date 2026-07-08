"use server";

import { randomUUID } from "node:crypto";
import {
  auditLogTable,
  buildPlatformBrandingAssetStoragePath,
  buildTenantBrandingAssetStoragePath,
  canTenantUseCustomBranding,
  db,
  FIELDGRID_DEFAULT_BRAND_THEME,
  getPlatformBrandTheme,
  getTenantBranding,
  platformThemeSettingsTable,
  tenantThemeSettingsTable,
  themeSplashColumnsAvailable,
  toSafeStorageSegment,
  type BrandTheme,
  type BrandingAssetKind,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./customers";

export type ThemeSettingsView = {
  theme: BrandTheme;
  useCustomTheme: boolean;
  customThemeAllowed: boolean;
  plan: string;
};

const BRANDING_BUCKET = "org-assets";
const MAX_BRAND_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_SPLASH_ASSET_BYTES = 6 * 1024 * 1024;
const SPLASH_COLUMNS_PENDING_MESSAGE =
  "Splashscreen opslag is nog niet actief op deze omgeving. Deploy de laatste migraties en probeer daarna opnieuw.";
const ALLOWED_BRAND_ASSET_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
]);

function formValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function nullableFormValue(formData: FormData, name: string): string | null {
  return formValue(formData, name) || null;
}

function formCheckbox(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function normalizeHexColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback;
}

function normalizeChoice<T extends readonly string[]>(
  value: string,
  options: T,
  fallback: T[number],
): T[number] {
  return options.includes(value) ? value : fallback;
}

function parseThemeForm(formData: FormData, fallback: BrandTheme): BrandTheme {
  return {
    brandName: formValue(formData, "brandName").slice(0, 120) || fallback.brandName,
    platformName: fallback.platformName,
    logoUrl: nullableFormValue(formData, "logoUrl") ?? fallback.logoUrl,
    logoStoragePath: nullableFormValue(formData, "logoStoragePath") ?? fallback.logoStoragePath,
    faviconUrl: nullableFormValue(formData, "faviconUrl") ?? fallback.faviconUrl,
    faviconStoragePath: nullableFormValue(formData, "faviconStoragePath") ?? fallback.faviconStoragePath,
    splashUrl: nullableFormValue(formData, "splashUrl") ?? fallback.splashUrl,
    splashStoragePath: nullableFormValue(formData, "splashStoragePath") ?? fallback.splashStoragePath,
    primaryColor: normalizeHexColor(formValue(formData, "primaryColor"), fallback.primaryColor),
    secondaryColor: normalizeHexColor(formValue(formData, "secondaryColor"), fallback.secondaryColor),
    accentColor: normalizeHexColor(formValue(formData, "accentColor"), fallback.accentColor),
    backgroundColor: normalizeHexColor(formValue(formData, "backgroundColor"), fallback.backgroundColor),
    surfaceColor: normalizeHexColor(formValue(formData, "surfaceColor"), fallback.surfaceColor),
    textColor: normalizeHexColor(formValue(formData, "textColor"), fallback.textColor),
    mutedColor: normalizeHexColor(formValue(formData, "mutedColor"), fallback.mutedColor),
    sidebarBackgroundColor: normalizeHexColor(formValue(formData, "sidebarBackgroundColor"), fallback.sidebarBackgroundColor),
    sidebarTextColor: normalizeHexColor(formValue(formData, "sidebarTextColor"), fallback.sidebarTextColor),
    sidebarAccentColor: normalizeHexColor(formValue(formData, "sidebarAccentColor"), fallback.sidebarAccentColor),
    fontFamily: normalizeChoice(formValue(formData, "fontFamily"), ["inter", "poppins", "system"] as const, fallback.fontFamily),
    headingFontFamily: normalizeChoice(formValue(formData, "headingFontFamily"), ["inter", "poppins", "system"] as const, fallback.headingFontFamily),
    borderRadius: normalizeChoice(formValue(formData, "borderRadius"), ["sm", "md", "lg"] as const, fallback.borderRadius),
    density: normalizeChoice(formValue(formData, "density"), ["compact", "comfortable", "spacious"] as const, fallback.density),
    emailFooterText: formValue(formData, "emailFooterText").slice(0, 2000) || fallback.emailFooterText,
    emailSignature: formValue(formData, "emailSignature").slice(0, 2000) || fallback.emailSignature,
  };
}

function formatBytes(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

function validateBrandAssetFile(file: File, assetKind: BrandingAssetKind): ActionResult<{ extension: string }> {
  const maxBytes = assetKind === "splash" ? MAX_SPLASH_ASSET_BYTES : MAX_BRAND_ASSET_BYTES;
  const label = assetKind === "splash" ? "Splashscreen" : assetKind === "favicon" ? "Favicon/app-icoon" : "Logo";
  if (file.size === 0) return { success: false, message: "Geen bestand geselecteerd." };
  if (file.size > maxBytes) {
    return { success: false, message: `${label} mag maximaal ${formatBytes(maxBytes)} zijn.` };
  }

  const mimeType = file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  const allowedExtension = ALLOWED_BRAND_ASSET_TYPES.get(mimeType);
  const resolvedExtension = allowedExtension ?? (extension === "svg" ? "svg" : null);
  if (!resolvedExtension) {
    return { success: false, message: "Upload een PNG, JPG, WebP of SVG-bestand." };
  }

  return { success: true, data: { extension: resolvedExtension } };
}

function parseAssetKind(formData: FormData): BrandingAssetKind {
  const value = formValue(formData, "assetKind");
  if (value === "favicon" || value === "splash") return value;
  return "logo";
}

async function uploadBrandAsset(input: {
  file: File;
  assetKind: BrandingAssetKind;
  path: string;
}): Promise<ActionResult<{ url: string; path: string; kind: BrandingAssetKind }>> {
  const bytes = await input.file.arrayBuffer();
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(input.path, bytes, {
      contentType: input.file.type,
      upsert: true,
    });

  if (error) return { success: false, message: `Upload mislukt: ${error.message}` };

  const {
    data: { publicUrl },
  } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(input.path);

  return { success: true, data: { url: publicUrl, path: input.path, kind: input.assetKind } };
}

function revalidateThemePaths(): void {
  revalidatePath("/platform/settings");
  revalidatePath("/instellingen/branding");
  revalidatePath("/instellingen/organisatie");
  revalidatePath("/");
}

export async function getPlatformThemeSettings(): Promise<ThemeSettingsView> {
  await requirePlatformAdmin();
  return {
    theme: await getPlatformBrandTheme(),
    useCustomTheme: true,
    customThemeAllowed: true,
    plan: "platform",
  };
}

export async function getTenantThemeSettings(): Promise<ThemeSettingsView> {
  await requirePermission("settings", "read");
  const tenantId = await requireCurrentTenantId();
  const [[row], theme] = await Promise.all([
    db
      .select({ useCustomTheme: tenantThemeSettingsTable.useCustomTheme })
      .from(tenantThemeSettingsTable)
      .where(eq(tenantThemeSettingsTable.tenantId, tenantId))
      .limit(1),
    getTenantBranding(tenantId),
  ]);

  return {
    theme,
    useCustomTheme: theme.customBrandingEnabled && Boolean(row?.useCustomTheme),
    customThemeAllowed: canTenantUseCustomBranding(theme.plan),
    plan: theme.plan,
  };
}

export async function savePlatformThemeSettings(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const fallback = await getPlatformBrandTheme();
  const theme = parseThemeForm(formData, fallback);
  const splashColumnsReady = await themeSplashColumnsAvailable("platform_theme_settings");

  const [existing] = await db
    .select({ id: platformThemeSettingsTable.id })
    .from(platformThemeSettingsTable)
    .where(eq(platformThemeSettingsTable.singletonKey, true))
    .limit(1);

  const values = {
    brandName: theme.brandName,
    logoUrl: theme.logoUrl,
    logoStoragePath: theme.logoStoragePath,
    faviconUrl: theme.faviconUrl,
    faviconStoragePath: theme.faviconStoragePath,
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    accentColor: theme.accentColor,
    backgroundColor: theme.backgroundColor,
    surfaceColor: theme.surfaceColor,
    textColor: theme.textColor,
    mutedColor: theme.mutedColor,
    sidebarBackgroundColor: theme.sidebarBackgroundColor,
    sidebarTextColor: theme.sidebarTextColor,
    sidebarAccentColor: theme.sidebarAccentColor,
    fontFamily: theme.fontFamily,
    headingFontFamily: theme.headingFontFamily,
    borderRadius: theme.borderRadius,
    density: theme.density,
    emailFooterText: theme.emailFooterText,
    emailSignature: theme.emailSignature,
    updatedAt: new Date(),
    updatedBy: actor.userId,
  };
  if (splashColumnsReady) {
    Object.assign(values, {
      splashUrl: theme.splashUrl,
      splashStoragePath: theme.splashStoragePath,
    });
  }

  if (existing) {
    await db.update(platformThemeSettingsTable).set(values).where(eq(platformThemeSettingsTable.id, existing.id));
  } else {
    await db.insert(platformThemeSettingsTable).values({ singletonKey: true, ...values });
  }

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "platform_theme_updated",
    resource: "platform_settings",
    resourceId: "theme",
    metadata: { brandName: theme.brandName, primaryColor: theme.primaryColor, accentColor: theme.accentColor },
  });

  revalidateThemePaths();
  return { success: true };
}

export async function saveTenantThemeSettings(formData: FormData): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const useCustomTheme = formCheckbox(formData, "useCustomTheme");
  const fallback = await getTenantBranding(tenantId);
  if (useCustomTheme && !canTenantUseCustomBranding(fallback.plan)) {
    return {
      success: false,
      message: "Whitelabel branding is beschikbaar voor Enterprise organisaties.",
    };
  }
  const theme = parseThemeForm(formData, fallback);
  const splashColumnsReady = await themeSplashColumnsAvailable("tenant_theme_settings");
  const [existing] = await db
    .select({ id: tenantThemeSettingsTable.id })
    .from(tenantThemeSettingsTable)
    .where(eq(tenantThemeSettingsTable.tenantId, tenantId))
    .limit(1);

  const values = useCustomTheme
    ? {
        useCustomTheme,
        brandName: theme.brandName,
        logoUrl: theme.logoUrl,
        logoStoragePath: theme.logoStoragePath,
        faviconUrl: theme.faviconUrl,
        faviconStoragePath: theme.faviconStoragePath,
        primaryColor: theme.primaryColor,
        secondaryColor: theme.secondaryColor,
        accentColor: theme.accentColor,
        backgroundColor: theme.backgroundColor,
        surfaceColor: theme.surfaceColor,
        textColor: theme.textColor,
        mutedColor: theme.mutedColor,
        sidebarBackgroundColor: theme.sidebarBackgroundColor,
        sidebarTextColor: theme.sidebarTextColor,
        sidebarAccentColor: theme.sidebarAccentColor,
        fontFamily: theme.fontFamily,
        headingFontFamily: theme.headingFontFamily,
        borderRadius: theme.borderRadius,
        density: theme.density,
        emailFooterText: theme.emailFooterText,
        emailSignature: theme.emailSignature,
        updatedAt: new Date(),
        updatedBy: user.id,
      }
    : {
        useCustomTheme,
        updatedAt: new Date(),
        updatedBy: user.id,
      };
  if (useCustomTheme && splashColumnsReady) {
    Object.assign(values, {
      splashUrl: theme.splashUrl,
      splashStoragePath: theme.splashStoragePath,
    });
  }

  if (existing) {
    await db.update(tenantThemeSettingsTable).set(values).where(eq(tenantThemeSettingsTable.id, existing.id));
  } else {
    await db.insert(tenantThemeSettingsTable).values({ tenantId, ...values });
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "tenant_theme_updated",
    resource: "settings",
    resourceId: "branding",
    metadata: { tenantId, useCustomTheme, brandName: theme.brandName },
  });

  revalidateThemePaths();
  return { success: true };
}

export async function uploadPlatformThemeAsset(
  formData: FormData,
): Promise<ActionResult<{ url: string; path: string; kind: BrandingAssetKind }>> {
  const actor = await requirePlatformAdmin();
  const file = formData.get("asset") as File | null;
  if (!file) return { success: false, message: "Geen bestand geselecteerd." };

  const assetKind = parseAssetKind(formData);
  const validation = validateBrandAssetFile(file, assetKind);
  if (!validation.success) return validation;
  const extension = validation.data?.extension;
  if (!extension) return { success: false, message: "Bestandstype kon niet worden gevalideerd." };

  if (assetKind === "splash" && !(await themeSplashColumnsAvailable("platform_theme_settings"))) {
    return { success: false, message: SPLASH_COLUMNS_PENDING_MESSAGE };
  }
  const safeName = toSafeStorageSegment(file.name, `${assetKind}.${extension}`);
  const path = buildPlatformBrandingAssetStoragePath(assetKind, `${Date.now()}-${randomUUID()}-${safeName}`);
  const uploaded = await uploadBrandAsset({ file, assetKind, path });
  if (!uploaded.success) return uploaded;
  const uploadedData = uploaded.data;
  if (!uploadedData) return { success: false, message: "Upload gaf geen publieke URL terug." };

  const patch = assetKind === "logo"
    ? { logoUrl: uploadedData.url, logoStoragePath: uploadedData.path }
    : assetKind === "favicon"
      ? { faviconUrl: uploadedData.url, faviconStoragePath: uploadedData.path }
      : { splashUrl: uploadedData.url, splashStoragePath: uploadedData.path };

  const [existing] = await db
    .select({ id: platformThemeSettingsTable.id })
    .from(platformThemeSettingsTable)
    .where(eq(platformThemeSettingsTable.singletonKey, true))
    .limit(1);

  if (existing) {
    await db
      .update(platformThemeSettingsTable)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(platformThemeSettingsTable.id, existing.id));
  } else {
    await db
      .insert(platformThemeSettingsTable)
      .values({
        singletonKey: true,
        brandName: FIELDGRID_DEFAULT_BRAND_THEME.brandName,
        primaryColor: FIELDGRID_DEFAULT_BRAND_THEME.primaryColor,
        secondaryColor: FIELDGRID_DEFAULT_BRAND_THEME.secondaryColor,
        accentColor: FIELDGRID_DEFAULT_BRAND_THEME.accentColor,
        backgroundColor: FIELDGRID_DEFAULT_BRAND_THEME.backgroundColor,
        surfaceColor: FIELDGRID_DEFAULT_BRAND_THEME.surfaceColor,
        textColor: FIELDGRID_DEFAULT_BRAND_THEME.textColor,
        mutedColor: FIELDGRID_DEFAULT_BRAND_THEME.mutedColor,
        sidebarBackgroundColor: FIELDGRID_DEFAULT_BRAND_THEME.sidebarBackgroundColor,
        sidebarTextColor: FIELDGRID_DEFAULT_BRAND_THEME.sidebarTextColor,
        sidebarAccentColor: FIELDGRID_DEFAULT_BRAND_THEME.sidebarAccentColor,
        fontFamily: FIELDGRID_DEFAULT_BRAND_THEME.fontFamily,
        headingFontFamily: FIELDGRID_DEFAULT_BRAND_THEME.headingFontFamily,
        borderRadius: FIELDGRID_DEFAULT_BRAND_THEME.borderRadius,
        density: FIELDGRID_DEFAULT_BRAND_THEME.density,
        emailFooterText: FIELDGRID_DEFAULT_BRAND_THEME.emailFooterText,
        emailSignature: FIELDGRID_DEFAULT_BRAND_THEME.emailSignature,
        ...patch,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      });
  }

  await db.insert(auditLogTable).values({
    userId: actor.userId,
    action: "platform_theme_asset_uploaded",
    resource: "platform_settings",
    resourceId: assetKind,
    metadata: { path, mimeType: file.type, size: file.size },
  });

  revalidateThemePaths();
  return { success: true, data: uploadedData };
}

export async function uploadTenantThemeAsset(
  formData: FormData,
): Promise<ActionResult<{ url: string; path: string; kind: BrandingAssetKind }>> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const file = formData.get("asset") as File | null;
  if (!file) return { success: false, message: "Geen bestand geselecteerd." };
  const branding = await getTenantBranding(tenantId);
  if (!canTenantUseCustomBranding(branding.plan)) {
    return {
      success: false,
      message: "Logo's en eigen thema's zijn beschikbaar voor Enterprise organisaties.",
    };
  }

  const assetKind = parseAssetKind(formData);
  const validation = validateBrandAssetFile(file, assetKind);
  if (!validation.success) return validation;
  const extension = validation.data?.extension;
  if (!extension) return { success: false, message: "Bestandstype kon niet worden gevalideerd." };

  if (assetKind === "splash" && !(await themeSplashColumnsAvailable("tenant_theme_settings"))) {
    return { success: false, message: SPLASH_COLUMNS_PENDING_MESSAGE };
  }
  const safeName = toSafeStorageSegment(file.name, `${assetKind}.${extension}`);
  const path = buildTenantBrandingAssetStoragePath(tenantId, assetKind, `${Date.now()}-${randomUUID()}-${safeName}`);
  const uploaded = await uploadBrandAsset({ file, assetKind, path });
  if (!uploaded.success) return uploaded;
  const uploadedData = uploaded.data;
  if (!uploadedData) return { success: false, message: "Upload gaf geen publieke URL terug." };

  const patch = assetKind === "logo"
    ? { logoUrl: uploadedData.url, logoStoragePath: uploadedData.path }
    : assetKind === "favicon"
      ? { faviconUrl: uploadedData.url, faviconStoragePath: uploadedData.path }
      : { splashUrl: uploadedData.url, splashStoragePath: uploadedData.path };
  const [existing] = await db
    .select({ id: tenantThemeSettingsTable.id })
    .from(tenantThemeSettingsTable)
    .where(eq(tenantThemeSettingsTable.tenantId, tenantId))
    .limit(1);

  if (existing) {
    await db
      .update(tenantThemeSettingsTable)
      .set({ ...patch, useCustomTheme: true, updatedAt: new Date(), updatedBy: user.id })
      .where(eq(tenantThemeSettingsTable.id, existing.id));
  } else {
    await db
      .insert(tenantThemeSettingsTable)
      .values({ tenantId, useCustomTheme: true, ...patch, updatedAt: new Date(), updatedBy: user.id });
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "tenant_theme_asset_uploaded",
    resource: "settings",
    resourceId: assetKind,
    metadata: { tenantId, path, mimeType: file.type, size: file.size },
  });

  revalidateThemePaths();
  return { success: true, data: uploadedData };
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertIncludes(content, phrases, label) {
  const normalizedContent = content.replace(/\s+/gu, " ");
  for (const phrase of phrases) {
    assert.ok(
      normalizedContent.includes(phrase.replace(/\s+/gu, " ")),
      `${label} should include ${phrase}`,
    );
  }
}

test("theme settings have platform and tenant schema plus locked-down migration", () => {
  const schema = read("lib/db/src/schema/theme-settings.ts");
  const schemaIndex = read("lib/db/src/schema/index.ts");
  const migration = read("lib/db/migrations/098_theme_branding_settings.sql");

  assertIncludes(schema, [
    "platformThemeSettingsTable",
    "tenantThemeSettingsTable",
    "useCustomTheme",
    "logoStoragePath",
    "faviconStoragePath",
    "borderRadius",
    "density",
  ], "theme schema");
  assertIncludes(schemaIndex, ["./theme-settings"], "schema index");
  assertIncludes(migration, [
    "platform_theme_settings",
    "tenant_theme_settings",
    "ENABLE ROW LEVEL SECURITY",
    "REVOKE ALL ON TABLE public.platform_theme_settings FROM anon, authenticated",
    "REVOKE ALL ON TABLE public.tenant_theme_settings FROM anon, authenticated",
    "tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE",
  ], "theme migration");
});

test("central resolver follows default to platform to tenant override and keeps old exports", () => {
  const branding = read("lib/db/src/tenant-branding.ts");

  assertIncludes(branding, [
    "FIELDGRID_DEFAULT_BRAND_THEME",
    "FIELDGRID_BRAND_DEFAULTS",
    "getPlatformBrandTheme",
    "getEffectiveBrandTheme",
    "mergeBrandTheme",
    "tenantThemeOverrideFromRow",
    "getTenantBranding",
    "getTenantBrandingCssVariables",
    "getTenantPlanSnapshot",
  ], "tenant branding resolver");
  assert.ok(branding.indexOf("FIELDGRID_DEFAULT_BRAND_THEME") < branding.indexOf("getPlatformBrandTheme"), "resolver should define defaults before platform loading");
  assert.ok(branding.includes("mergeBrandTheme(legacyTenantTheme, tenantThemeOverrideFromRow"), "tenant override should be merged after legacy tenant theme");
});

test("branding asset uploads are tenant-scoped and reject svg", () => {
  const storagePaths = read("lib/db/src/storage-paths.ts");
  const themeActions = read("artifacts/backoffice/src/app/actions/theme-settings.ts");
  const settingsActions = read("artifacts/backoffice/src/app/actions/settings.ts");
  const orgForm = read("artifacts/backoffice/src/components/settings/OrganisatieForm.tsx");

  assertIncludes(storagePaths, [
    "FIELDGRID_BRANDING_ASSETS_ROOT",
    "buildTenantBrandingAssetStoragePath",
    "buildPlatformBrandingAssetStoragePath",
    "buildTenantStoragePath(tenantId",
  ], "storage branding helpers");
  assertIncludes(themeActions, [
    "MAX_BRAND_ASSET_BYTES = 2 * 1024 * 1024",
    "image/svg+xml",
    "SVG-bestanden zijn voor branding nog niet toegestaan",
    "buildTenantBrandingAssetStoragePath",
    "buildPlatformBrandingAssetStoragePath",
    "BRANDING_BUCKET = \"org-assets\"",
  ], "theme upload actions");
  assert.match(
    themeActions,
    /buildTenantBrandingAssetStoragePath\(\s*tenantId,/u,
  );
  assertIncludes(settingsActions, [
    "buildTenantBrandingAssetStoragePath",
    "SVG-logo's zijn nog niet toegestaan",
    ".where(eq(organizationSettingsTable.tenantId, tenantId))",
  ], "legacy org logo upload");
  assert.match(
    settingsActions,
    /buildTenantBrandingAssetStoragePath\(\s*tenantId,\s*"logo",/u,
  );
  assert.ok(!orgForm.includes("image/svg+xml"), "organization logo input should not accept SVG");
});

test("platform and tenant admin expose Branding & Thema management", () => {
  const platformPage = read("artifacts/backoffice/src/app/(platform)/platform/settings/page.tsx");
  const tenantPage = read("artifacts/backoffice/src/app/(dashboard)/instellingen/branding/page.tsx");
  const tabs = read("artifacts/backoffice/src/components/settings/SettingsTabs.tsx");
  const form = read("artifacts/backoffice/src/components/theme/BrandThemeForm.tsx");

  assertIncludes(platformPage, ["getPlatformThemeSettings", "BrandThemeForm", "mode=\"platform\""], "platform settings page");
  assertIncludes(tenantPage, ["getTenantThemeSettings", "BrandThemeForm", "mode=\"tenant\""], "tenant branding page");
  assertIncludes(tabs, ["/instellingen/branding", "Branding & thema", "Palette"], "settings tabs");
  assertIncludes(form, [
    "savePlatformThemeSettings",
    "saveTenantThemeSettings",
    "uploadPlatformThemeAsset",
    "uploadTenantThemeAsset",
    "accept=\"image/png,image/jpeg,image/webp\"",
  ], "brand theme form");
});

test("effective theme is applied to backoffice shell, portals and styled email", () => {
  const backofficeLayout = read("artifacts/backoffice/src/app/(dashboard)/layout.tsx");
  const customerLayout = read("artifacts/klant-pwa/src/app/(app)/layout.tsx");
  const personnelLayout = read("artifacts/personeel-pwa/src/app/(app)/layout.tsx");
  const email = read("artifacts/backoffice/src/lib/email.ts");
  const settingsActions = read("artifacts/backoffice/src/app/actions/settings.ts");
  const globals = read("artifacts/backoffice/src/app/globals.css");

  assertIncludes(backofficeLayout, ["getTenantBranding", "getTenantBrandingCssVariables", "brandingStyle"], "backoffice layout");
  assertIncludes(customerLayout, ["getTenantBranding", "getTenantBrandingCssVariables"], "customer portal layout");
  assertIncludes(personnelLayout, ["getTenantBranding", "getTenantBrandingCssVariables"], "personnel portal layout");
  assertIncludes(email, ["tenantId?: string | null", "renderEmailTemplate({", "templateKey: \"notification_manual\"", "tenantId: opts.tenantId ?? null"], "styled email");
  assertIncludes(settingsActions, ["tenantId,", "sendEmailWithResult({", "html: message.html"], "notification send action");
  assertIncludes(globals, ["var(--color-background", "var(--color-foreground", "var(--radius-card", "var(--color-ring"], "backoffice globals");
});

test("theming docs capture audit and operating contract", () => {
  const audit = read("docs/theming-branding-audit.md");
  const system = read("docs/theming-branding-system.md");

  assertIncludes(audit, [
    "Logo upload",
    "Globaal storagepad",
    "tenant/{tenantId}/branding/logo",
    "buildStyledNotificationEmail()",
  ], "audit doc");
  assertIncludes(system, [
    "Resolutievolgorde",
    "platform_theme_settings",
    "tenant_theme_settings",
    "SVG wordt geweigerd",
    "getEffectiveBrandTheme(tenantId)",
  ], "system doc");
});

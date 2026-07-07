# Theming & Branding System

## Doel

Fieldgrid gebruikt een centrale, white-label-proof theme-resolver voor platform, backoffice, klantportaal, personeelportaal en gestileerde notificatiemails. Tenant-sessies en tenant-branding blijven host/tenant-gebonden; styling wordt niet meer uit globale storagepaden of willekeurige organisatie-instellingen gehaald.

## Resolutievolgorde

De effectieve theme wordt opgebouwd in `lib/db/src/tenant-branding.ts`:

1. `FIELDGRID_DEFAULT_BRAND_THEME`: code fallback voor lege databases.
2. `platform_theme_settings`: platformbeheer fallback voor alle tenants.
3. Legacy tenantgegevens uit `organization_settings`: organisatienaam, bestaand logo en e-mailtemplatevelden.
4. `tenant_theme_settings`: tenant override wanneer `use_custom_theme` actief is.

De publieke compatibiliteits-API blijft:

- `getTenantBranding(tenantId)`
- `getTenantBrandingCssVariables(theme)`
- `canTenantUseCustomBranding(plan)`

Nieuwe API:

- `getPlatformBrandTheme()`
- `getEffectiveBrandTheme(tenantId?)`
- `mergeBrandTheme(base, override)`

## Database

Migratie: `lib/db/migrations/098_theme_branding_settings.sql`.

Tabellen:

- `platform_theme_settings`: singleton platformthema.
- `tenant_theme_settings`: tenant overrides per `tenant_id`.

Beide tabellen hebben RLS aan en directe Data API toegang voor `anon` en `authenticated` is ingetrokken. De applicatie gebruikt server-side acties en de directe DB-laag.

## Velden

Themevelden:

- `brandName`
- `logoUrl`, `logoStoragePath`
- `faviconUrl`, `faviconStoragePath`
- `primaryColor`, `secondaryColor`, `accentColor`
- `backgroundColor`, `surfaceColor`, `textColor`, `mutedColor`
- `fontFamily`, `headingFontFamily`
- `borderRadius`
- `density`
- `emailFooterText`, `emailSignature`

Toegestane keuzes:

- Fonts: `inter`, `poppins`, `system`
- Radius: `sm`, `md`, `lg`
- Density: `compact`, `comfortable`, `spacious`
- Kleuren: hex `#RRGGBB`

## Asset uploads

Branding assets gebruiken de bestaande `org-assets` bucket, maar met gescopeerde paden:

- Platform: `branding/platform/{logo|favicon}/...`
- Tenant: `tenant/{tenantId}/branding/{logo|favicon}/...`

Server-side validatie:

- Maximaal 2 MB.
- Alleen PNG, JPEG en WebP.
- SVG wordt geweigerd totdat er een expliciete sanitizer is.

Legacy `uploadOrgLogo()` schrijft nu ook naar `tenant/{tenantId}/branding/logo/...` en update alleen `organization_settings` van de huidige tenant.

## Beheer UI

Platform:

- Route: `/platform/settings`
- Component: `BrandThemeForm`
- Actions: `savePlatformThemeSettings()`, `uploadPlatformThemeAsset()`

Tenant:

- Route: `/instellingen/branding`
- Tab: `Branding & thema`
- Component: `BrandThemeForm`
- Actions: `saveTenantThemeSettings()`, `uploadTenantThemeAsset()`

## Runtime toepassing

Backoffice:

- `(dashboard)/layout.tsx` haalt `getTenantBranding(tenantId)` op.
- De shell krijgt CSS variables via `getTenantBrandingCssVariables()`.
- Basis utilities zoals `.veele-card`, `.veele-input`, body en headings lezen theme variables.

Klantportaal en personeelportaal:

- Bestaande layouts blijven `getTenantBranding()` en `getTenantBrandingCssVariables()` gebruiken.
- Door de centrale resolver krijgen zij platform defaults en tenant overrides zonder app-specifieke duplicatie.

E-mail:

- `buildStyledNotificationEmail()` accepteert `tenantId`.
- De mailtemplate gebruikt `getEffectiveBrandTheme(tenantId)` voor naam, logo, kleuren, footer en signature.

## Testdekking

`tests/fieldgrid-theme-branding-system.test.mjs` bewaakt:

- Schema en migratie voor platform/tenant themes.
- Resolvervolgorde en backwards-compatible exports.
- Tenant-gescopeerde storagepaden en SVG-blokkade.
- Platform- en tenantbeheer UI/actions.
- Backoffice/e-mail toepassing van effectieve theme.

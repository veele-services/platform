# Theming & Branding Audit

Datum: 2026-07-07

## Samenvatting

Fieldgrid had al tenantbranding voor klant- en personeelportalen via `getTenantBranding()`, maar de bron was beperkt tot `organization_settings` en plan-gating. Backoffice gebruikte vooral hardcoded kleuren. Logo-upload schreef naar een globaal `logo.ext` pad in `org-assets`, waardoor tenants elkaars logo konden overschrijven en de database-update niet expliciet aan de tenant was gebonden. Platformbranding bestond alleen als env/statuskaart en niet als beheerde instelling.

De nieuwe richting is:

1. Fieldgrid code-defaults.
2. Platformthema in `platform_theme_settings`.
3. Tenant override in `tenant_theme_settings` wanneer `use_custom_theme = true`.
4. Legacy `organization_settings` blijft tijdelijk compatibel voor organisatienaam, logo en e-mailtemplatevelden.

## Inventaris

| Gebied | Huidige bron voor branding/theming | Risico | Aanpassing |
| --- | --- | --- | --- |
| Centrale branding helper | `lib/db/src/tenant-branding.ts` las tenant + `organization_settings` en plan snapshot. | Geen platformbrede beheerde fallback, beperkte tokens, portal-only toepassing. | Uitgebreid naar `BrandTheme`, `getPlatformBrandTheme()`, `getEffectiveBrandTheme()` en CSS-var mapping. |
| Database | `organization_settings.logo_url`, `email_template_brand_color`, `email_template_accent_color`, footer en signature. | Tenant overrides en platform defaults zaten in dezelfde legacy tabel of env. | Nieuwe tabellen `platform_theme_settings` en `tenant_theme_settings` met migratie `098_theme_branding_settings.sql`. |
| Platform admin | `/platform/settings` toonde "Default branding" als statuskaart. | Niet beheerbaar en niet white-label-proof. | Platformpagina bevat nu Branding & Thema formulier. |
| Tenant admin | `/instellingen/organisatie` bevatte alleen logo en basisgegevens. | Geen eigen theme-paneel met kleuren/fonts/radius/density. | Nieuwe route `/instellingen/branding` en tab `Branding & thema`. |
| Logo upload | `uploadOrgLogo()` gebruikte `org-assets/logo.ext` en update zonder tenant-where in het uploadpadblok. | Globaal storagepad, overschrijven tussen tenants, mogelijk brede DB-update. | Upload gebruikt `tenant/{tenantId}/branding/logo/...`, blokkeert SVG en update alleen huidige tenant. |
| Asset veiligheid | UI accepteerde `image/svg+xml`; server valideerde alleen grootte. | SVG kan script/foreign-object risico introduceren als niet gesanitized. | Branding uploads accepteren alleen PNG/JPEG/WebP tot 2 MB. SVG wordt expliciet geweigerd. |
| Backoffice shell | Dashboard layout zette alleen hardcoded `#F8FAFC`; globals gebruikten veel vaste Veele/Fieldgrid kleuren. | Tenant theme landde niet in backoffice. | Dashboard layout zet effectieve CSS variables; basis utilities lezen de variabelen. |
| Klantportaal | Layout gebruikte `getTenantBranding()` en `getTenantBrandingCssVariables()`. | Goed begin, maar resolver had geen platformthema/tenant table. | Bestaande API blijft, maar krijgt nieuwe effectieve theme-resolutie. |
| Personeelportaal | Zelfde patroon als klantportaal. | Zelfde risico als klantportaal. | Bestaande API blijft compatibel met nieuwe theme-resolutie. |
| E-mail | `buildStyledNotificationEmail()` selecteerde de eerste `organization_settings` rij. | Tenant-overstijgende branding mogelijk. | Functie accepteert `tenantId` en gebruikt `getEffectiveBrandTheme(tenantId)`. |
| Supabase/Postgres | Nieuwe tabellen in `public` moeten bewust worden afgeschermd. | Nieuwe Supabase defaults vereisen expliciete grants als Data API toegang nodig is. | RLS aan, `anon`/`authenticated` revoke; app gebruikt server-side directe DB-laag. |

## Openstaande technische schuld

- Veel bestaande backoffice componenten hebben nog inline hex-kleuren. De shell en gedeelde utilities zijn nu themable, maar diepere componenten moeten stapsgewijs naar CSS-variabelen.
- Statische PWA manifesten en favicons kunnen niet volledig tenant-dynamisch worden zonder aanvullende metadata/routes per tenant host. De nieuwe favicon/app icon velden zijn opgeslagen en kunnen later door dynamic metadata of host-aware icon routes worden gebruikt.
- Legacy `organization_settings` blijft voorlopig meedoen voor backward compatibility. Nieuwe UI schrijft theming naar `tenant_theme_settings`.

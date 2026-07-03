# Fieldgrid sprint 10 - portalen en branding

Datum: 2026-07-03  
Status: geimplementeerd als docs/testbasis plus beperkte portal-runtime guardrails.  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-data-classification.md`

## Doel

Sprint 10 maakt de klant- en personeelsportalen minder Veele-specifiek en sluit ze aan op de Fieldgrid SaaS-canon:

- Fieldgrid is het platformmerk.
- Veele blijft een gewone tenant en geen platform-default.
- Tenantbranding komt uit tenantconfiguratie.
- Custom branding is alleen actief voor Professional en Enterprise.
- Portalmodules worden server-side gecheckt voordat de portal-shell rendert.
- Statische appmetadata en manifests gebruiken Fieldgrid-defaults.

## Geimplementeerd

### Centrale tenantbranding

Nieuw runtime-contract in de db package:

- `getTenantBranding(tenantId)` laadt tenantnaam, organisatie-instellingen en plansnapshot.
- `getTenantBrandingCssVariables(branding)` vertaalt branding naar CSS-variabelen.
- `canTenantUseCustomBranding(plan)` staat custom logo/kleur alleen toe voor `professional` en `enterprise`.
- Starter gebruikt Fieldgrid-kleuren en geen custom logo, maar toont wel de tenantdisplaynaam.

De helper gebruikt `organization_settings` als bestaande configuratiebron. Er is geen datareset nodig.

### Fieldgrid defaults

De default e-mailfooter en signature in `organization_settings` verwijzen naar Fieldgrid in plaats van Veele Services. De herstelmigratie wijzigt alleen database-defaults voor nieuwe records en overschrijft geen bestaande staging-data.

### Klantportaal

De klantportal-shell:

- resolveert tenantcontext via `requireCurrentCustomerPortalTenantId()`;
- weigert renderen als de customer portal voor de tenant niet beschikbaar is;
- injecteert tenantbranding als CSS-variabelen;
- geeft branding door aan mobiele header en desktopsidebar;
- verbergt document-, finance- en reportingnavigatie als modules uit staan.

### Personeelsapp

De personeelsapp-shell:

- resolveert tenantcontext via `requireCurrentPersonnelPortalTenantId()`;
- weigert renderen als de personnel app voor de tenant niet beschikbaar is;
- injecteert tenantbranding als CSS-variabelen;
- geeft branding door aan mobiele header en desktopsidebar;
- verbergt documentnavigatie als de documents-module uit staat.

### Metadata en manifests

De generieke PWA-metadata voor klantportaal en personeelsapp gebruikt Fieldgrid-defaults. Tenant-specifieke branding blijft runtime UI-branding, niet statische buildmetadata.

## Bewust niet gedaan

Deze sprint verandert geen portalstorage, customer/personnel identity-model, RLS-policies of finance/reporting datamodel. Die blijven gekoppeld aan de bestaande testmatrix:

- `FG-STORAGE-001` t/m `FG-STORAGE-007`
- `FG-DATA-004` t/m `FG-DATA-009`
- `FG-AUDIT-001` t/m `FG-AUDIT-005`

## Acceptatiebasis

Minimaal geraakt en te bewijzen in vervolgtests:

| Test-id | Betekenis | Sprint 10 status |
| --- | --- | --- |
| `FG-PORTAL-C-001` | Klantportaal is host-bound voor Tenant A. | Runtime guard aangesloten; Playwright/integration blijft nodig. |
| `FG-PORTAL-C-002` | Klantportaal weigert verkeerde host/customer-context. | Runtime guard aangesloten; Playwright/integration blijft nodig. |
| `FG-PORTAL-C-003` | Klantportaal module uit wordt server-side geweigerd. | Portal-shell guard en module flags toegevoegd. |
| `FG-PORTAL-C-004` | Klantportaal invoice/PDF blijft tenant/customer-scoped en geaudit. | Niet geraakt; blijft vervolgtest. |
| `FG-PORTAL-P-001` | Personeelsapp is host-bound voor Tenant A. | Runtime guard aangesloten; Playwright/integration blijft nodig. |
| `FG-PORTAL-P-002` | Personeelsapp weigert verkeerde host/personnel-context. | Runtime guard aangesloten; Playwright/integration blijft nodig. |
| `FG-PORTAL-P-003` | Assignment media blijft tenant-scoped. | Niet geraakt; blijft storagevervolgtest. |
| `FG-PORTAL-P-004` | Personeelsapp module uit wordt server-side geweigerd. | Portal-shell guard en documentmodule flag toegevoegd. |
| `FG-MODULE-002` | Module uit verdwijnt uit UI. | Navigatieflags toegevoegd. |
| `FG-MODULE-003` | Directe module-URL faalt wanneer module uit staat. | Shell guard aanwezig; routespecifieke tests blijven nodig. |
| `FG-MIG-001` | Lege database migratie-smoke. | Nieuwe defaultmigratie moet meelopen. |
| `FG-MIG-002` | Staging-copy migratie-smoke. | Nieuwe defaultmigratie wijzigt geen bestaande data. |

## Resterend na sprint 10

- Playwright-tests voor klantportaal en personeelsapp met Tenant A/B/Veele hosts.
- Integratietests voor module-off directe URLs in beide portalen.
- Runtime bewijs dat Professional/Enterprise custom logo/kleur tonen en Starter Fieldgrid-defaults houdt.
- Portalstorage-tests voor signed URLs en path guessing.
- Tenant-admin UI voor brandingbeheer en package-uitleg.

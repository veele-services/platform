# Fieldgrid Fase 5 - Nice-To-Haves En Platformversnellers

Datum: 2026-07-07

## Doel

Fase 5 maakt platformbeheer sneller, veiliger en minder afhankelijk van handmatige checks. De oplevering zit in `/admin/platform/accelerators` en bundelt demo-tenant resetrequests, notificatiepreview, tenant health, visual regression snapshot-contracten en exports.

## Opgeleverd

- Demo-tenant generator voor `demo-a`, `demo-b` en `veele`.
- Resetknop registreert `demo_tenant_reset_requested` in audit met scope, cleanup-contract en uitvoercommando.
- Notification preview/sandbox per platform-eventtype met voorbeeldtitel, body, recommended audience, kanalen, recipient-inschatting en laatste dispatchstatus.
- Tenant health scorecard per tenant met domeinen, mail, modules, users, errors, storage en smokes.
- Visual regression snapshot-contracten voor platform-backoffice, tenant-backoffice, klantenportaal en personeelsportaal.
- Export center met CSV feeds voor platform-admin tenant health, security/audit en billing/subscriptions.

## Routes

- Platform UI: `/admin/platform/accelerators`
- Tenant/platform CSV: `/api/platform/exports/tenants`
- Audit/security CSV: `/api/platform/security/export`
- Billing CSV: `/api/platform/billing/export`

## Scripts

- `pnpm fieldgrid:visual-regression-snapshots:check`
- `pnpm fieldgrid:visual-regression-snapshots:run`
- `pnpm fieldgrid:phase5-platform-accelerators:check`

Run-modus schrijft artifacts naar `artifacts/visual-regression/`. De artifactmap staat in `.gitignore`.

## Visual Regression Targets

| Target | Base URL env | Routes |
| --- | --- | --- |
| `platform-backoffice` | `FIELDGRID_BACKOFFICE_BASE_URL` | `/admin/platform`, `/admin/platform/accelerators`, `/admin/platform/tenants`, `/admin/platform/notifications`, `/admin/platform/security`, `/admin/platform/staging-smoke` |
| `tenant-backoffice` | `FIELDGRID_TENANT_BACKOFFICE_BASE_URL` | `/dashboard`, `/customers`, `/objects`, `/assignments`, `/documents` |
| `customer-portal` | `FIELDGRID_CUSTOMER_PORTAL_BASE_URL` | `/`, `/dashboard`, `/documenten`, `/facturen` |
| `personnel-portal` | `FIELDGRID_PERSONNEL_PORTAL_BASE_URL` | `/`, `/planning`, `/berichten`, `/documenten` |

Auth kan via storage-state of cookie:

- `FIELDGRID_BACKOFFICE_STORAGE_STATE` / `FIELDGRID_BACKOFFICE_COOKIE`
- `FIELDGRID_TENANT_BACKOFFICE_STORAGE_STATE` / `FIELDGRID_TENANT_BACKOFFICE_COOKIE`
- `FIELDGRID_CUSTOMER_PORTAL_STORAGE_STATE` / `FIELDGRID_CUSTOMER_PORTAL_COOKIE`
- `FIELDGRID_PERSONNEL_PORTAL_STORAGE_STATE` / `FIELDGRID_PERSONNEL_PORTAL_COOKIE`

## Governance

De demo-reset en visual snapshot knoppen voeren geen destructieve databaseactie in de request lifecycle uit. Ze schrijven een auditregel met exact doel, scope, commando en cleanup-contract. Een operator of CI-runner kan dat verzoek daarna gecontroleerd uitvoeren.

## Definition Of Done

- Platformbeheer heeft één centrale accelerator-pagina.
- Demo-tenant reset is sneller maar auditable en demo-scope only.
- Notificaties kunnen per eventtype vooraf worden beoordeeld.
- Tenant health maakt domeinen, mail, modules, users, errors, storage en smokes scanbaar.
- Visual regression heeft reproduceerbare targets, routes, viewports en artifacts.
- Platform-admin, audit en billing exports zijn downloadbaar.

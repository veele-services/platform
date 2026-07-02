# Fieldgrid Sprint 1 - tenantcontext en testbasis

Datum: 2026-07-03  
Status: uitgevoerd als eerste tenantcontext-guardrail vanaf actuele `main`.

## Doel

Sprint 1 maakt de bestaande host-first tenantcontext strakker en legt de vaste testbasis voor Tenant A/B/Veele vast. Deze sprint bouwt nog geen platform-admin lifecycle UI en migreert geen data.

## Opgeleverd

- Dashboardlayout gebruikt geen `DEFAULT_TENANT_ID` fallback meer.
- Dashboardlayout valt ook niet terug naar de eerste tenantoptie wanneer hostcontext geen tenant toestaat.
- Tenant A/B/Veele fixtures staan vast in `tests/fixtures/fieldgrid-tenants.mjs`.
- Host-first, switcher-override en lifecycle-contracten worden bewaakt in `tests/fieldgrid-sprint-1-tenant-context.test.mjs`.
- Suspended/archived mutatiebeleid is expliciet vastgelegd.

## Tenant A/B/Veele testbasis

Vaste tenants:

- `veele`: gewone tenant, geen platform-uitzondering.
- `demo-a`: primaire happy-path tenant.
- `demo-b`: cross-tenant denial tenant.

Vaste hosts:

- `platform.fieldgrid.nl`: platformhost.
- `staging.fieldgrid.nl`: staging platformhost.
- `veele.fieldgrid.nl`: Veele tenanthost.
- `demo-a.fieldgrid.nl`: Tenant A host.
- `demo-b.fieldgrid.nl`: Tenant B host.
- `unknown.fieldgrid.nl`: onbekende Fieldgrid-subdomain; moet veilig falen.

## Host-first contract

Backoffice tenantcontext volgt deze volgorde:

1. Lees host uit `x-forwarded-host` of `host`.
2. Platformhosts blijven platformcontext.
3. Verified tenant domain resolved naar tenantcontext, maar alleen als tenant runtime-actief is.
4. Onbekende Fieldgrid-subdomains worden `blocked` en mogen niet terugvallen naar tenant switcher of default tenant.
5. Tenant switcher cookie mag alleen worden gebruikt binnen platform/geen-hostcontext en alleen als de gebruiker actieve membership heeft.
6. `DEFAULT_TENANT_ID` is geen dashboard fallback.

## Lifecycle mutatiebeleid

Runtime-actieve statussen:

- `trial`
- `active`

Niet-runtime-actieve statussen:

- `provisioning`
- `suspended`
- `archived`

Beleid:

- `provisioning`: geen normale tenant-runtime of mutaties totdat provisioning afgerond is.
- `suspended`: geen normale backoffice/API/portaal-mutaties. Toekomstige platform-admin mag tenantinformatie beheren en reactivatie uitvoeren via platformroutes.
- `archived`: geen normale backoffice/API/portaal-runtime en geen tenantmutaties. Toekomstige platform-admin mag alleen expliciete archive/read-only beheeracties uitvoeren.

Dit beleid sluit aan op `TENANT_RUNTIME_ACTIVE_STATUSES`, membershipfilters en host-resolverfilters.

## Test-id dekking

Deze sprint richt zich op:

- `FG-HOST-001`
- `FG-HOST-002`
- `FG-HOST-003`
- `FG-HOST-004`
- `FG-HOST-005`
- `FG-HOST-006`
- `FG-LIFE-001`
- `FG-LIFE-002`
- `FG-LIFE-003`
- `FG-LIFE-004`

## Buiten scope

- Platform-admin tenant lifecycle UI.
- Migraties.
- Data-normalisatie.
- Volledige Playwright-suite.
- DB/RLS runtime-fixtures tegen een echte database.

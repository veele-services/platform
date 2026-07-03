# Fieldgrid sprint 11 - provisioning en onboarding

Datum: 2026-07-03  
Status: geimplementeerd als provisioning foundation, owner-invite rollback, platform statusoverzicht en tenant first-run checklist.  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`

## Doel

Sprint 11 maakt tenantaanmaak herhaalbaar en bestuurbaar vanuit platform-admin. De sprint vervangt losse tenant-shell creatie door een provisioningflow die de bestaande SaaS-bouwstenen in een vaste volgorde inricht.

Een nieuwe tenant krijgt via de platformflow:

- tenantrecord met `trial` status;
- primair domein, standaard als `{slug}.fieldgrid.nl` wanneer geen domein is ingevuld;
- actief plan/subscription;
- planmodules als tenantmodules;
- tenantsectoren en `tenant_sector_settings`;
- tenantrollen uit globale role templates;
- organisatie-instellingen met Fieldgrid defaults;
- owner invite en owner tenantrol;
- first-run state voor tenant onboarding;
- provisioning run status/logging.

## Geimplementeerd

### Provisioning schema

Nieuwe additive tabellen:

- `tenant_provisioning_runs`: status, stap, foutmelding, owner invite status en metadata per provisioningpoging.
- `tenant_owner_invites`: owner invite status per tenant/e-mail.
- `tenant_first_run_state`: tenant first-run checkliststatus.

De migratie is additive-only en wijzigt geen bestaande stagingdata.

### Transactionele provisioning-service

Nieuwe db-service `lib/db/src/tenant-provisioning.ts`:

- normaliseert slug en domein;
- blokkeert platformhosts als tenantdomein;
- controleert duplicate slug en duplicate domain vooraf;
- maakt tenant, domein, subscription, modules, sectorpolicy, template tenantrollen, org settings en first-run state in een database-transactie;
- registreert provisioning status en foutstatus;
- koppelt owner invite na Supabase-auth uitnodiging;
- kan de net aangemaakte tenant rollbacken wanneer de owner invite mislukt.

### Platform-admin flow

`/platform` gebruikt nu `createPlatformTenant` uit `platform-provisioning`.

De platformflow:

- vereist owner e-mail;
- toont recente provisioning runs met status, stap en foutmelding;
- rolt de net aangemaakte tenant terug als de owner-uitnodiging niet lukt;
- audit succesvolle provisioning via support/platform auditcontext.

### Tenant first-run checklist

Nieuwe tenantroute `/first-run` gebruikt `tenant_first_run_state` voor de basisstappen:

- branding;
- gebruikers;
- sectoren;
- modules.

De checklist kan stappen afronden of de first-run flow overslaan. Dit is bewust een minimale foundation; de latere UX kan hierop voortbouwen.

## Bewust niet gedaan

- Geen publieke self-service signup.
- Geen automatische billing-provider.
- Geen volledige onboarding wizard met rollback per UI-substap.
- Geen DNS/TLS automation; dat blijft Sprint 12.
- Geen runtime Playwright/integration bewijs in deze PR, omdat deze sessie via GitHub Contents API werkt en de lokale workspace read-only is.

## Acceptatiebasis

| Test-id | Betekenis | Sprint 11 status |
| --- | --- | --- |
| `FG-PLATFORM-001` | Actieve platform-admin kan platformbeheer openen. | Bestaande guard blijft leidend. |
| `FG-PLATFORM-003` | Tenant user kan platformroutes niet gebruiken. | Bestaande guard blijft leidend. |
| `FG-PLATFORM-004` | Lifecycle/provisioning actie is transactioneel en geaudit. | Provisioning is transactioneel; rollback bij owner invite failure toegevoegd. |
| `FG-PLATFORM-005` | Plan/module beheer verandert entitlements. | Provisioning seedt subscription en planmodules als tenantmodules. |
| `FG-PLATFORM-006` | Support/platform audit zichtbaar. | Succesvolle provisioning schrijft audit; runstatus is apart zichtbaar. |
| `FG-HOST-006` | Custom domain/tenantdomain wordt vastgelegd. | Provisioning maakt primair domein met verified Fieldgrid-subdomain of pending custom domain. |
| `FG-RBAC-001` | Tenantrol geeft runtime-rechten. | Template tenantrollen worden aangemaakt; runtimebewijs blijft integration. |
| `FG-RBAC-003` | Globale rollen geven geen runtime-rechten. | Globale rollen worden alleen als templates gekopieerd. |
| `FG-MIG-001` | Lege database migratie-smoke. | Nieuwe additive migratie moet meelopen. |
| `FG-MIG-002` | Staging-copy migratie-smoke. | Nieuwe migratie wijzigt geen bestaande records. |

## Resterend na sprint 11

- Integration test voor succesvolle provisioning met Tenant A/B/Veele fixtures.
- Integration test voor rollback bij mislukte owner invite.
- Duplicate slug/domain tests op serviceniveau.
- Playwright-test voor platform-admin tenantcreate en first-run checklist.
- Auth-mailtemplate en redirect URL polish voor owner invite.
- Onboarding UX uitbreiden met echte stapvalidatie in plaats van handmatig markeren.
- Provisioning audit eventueel splitsen naar dedicated platform audit wanneer audit wave is afgerond.

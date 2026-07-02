# Fieldgrid SaaS masterplan canon

Datum: 2026-07-03  
Status: actuele canon na recovery, module/plan foundation en storage-hardening t/m PR #125.  
Bronnen: oorspronkelijke Fieldgrid/Veele SaaS-masterplanbijlage, huidige `main` codebase, recovery-werk, data-classificatie en cross-tenant testmatrix.

## 1. Doel en vaste besluiten

Fieldgrid is het SaaS-platform. Veele Services is geen platform-uitzondering meer, maar een gewone tenant binnen Fieldgrid.

Vaste besluiten:

- Productdoel: extern multi-tenant SaaS-platform.
- Databasekeuze: een gedeelde database met sterke tenant-isolatie.
- Isolatie-eis: applicatiechecks, RLS/storage policies en cross-tenant tests.
- Tenantselectie: host/subdomain is leidend; tenant switcher mag hostcontext niet overschrijven.
- Platformdomeinen nu: `platform.fieldgrid.nl` voor productie en `staging.fieldgrid.nl` voor staging.
- Doeldomeinmodel: `fieldgrid.nl` als hoofd/platformmerk, `platform.fieldgrid.nl` als platform-admin, tenant-subdomains zoals `veele.fieldgrid.nl`.
- Platform-admin is gescheiden van tenant-admin.
- Fieldgrid support werkt alleen via expliciete support grants en audit logging.
- Globale `roles` blijven templates; runtime-RBAC komt uit `tenant_roles`.
- Modules worden tenant-specifiek aan/uit gezet en server-side afgedwongen.
- Sectoren blijven een globale catalogus met tenant-toewijzing.
- Starter, Professional en Enterprise zijn de eerste pakketten.
- Geen harde aantallimieten in de recovery-MVP, behalve: custom role management is Professional+.
- Facturatie van Fieldgrid-abonnementen is eerst handmatig; automatische payment-provider komt later.
- Staging-data blijft behouden; risicomigraties moeten staging-copy smoke getest worden.

## 2. Actuele codebase-status

### 2.1 Klaar of grotendeels klaar

Recovery foundation:

- `main` is opnieuw bron van waarheid.
- `docs/fieldgrid-recovery-execution-plan.md` legt de blijvende recovery-guardrails vast.
- Migratierunner ondersteunt compatibility skips voor legacy RBAC-migraties.
- Staging-data is behouden.
- Canon-docs worden bewaakt met `tests/fieldgrid-canon.test.mjs`.

Tenant resolver en tenant switcher:

- `tenant_domains` bestaat.
- Backoffice, API, klantportaal en personeelsapp zijn host-first tenant-aware.
- Backoffice helper `getCurrentTenantId()` gebruikt hostcontext eerst, daarna tenant switcher cookie.
- API `requireTenantScope` gebruikt host-first tenantcontext voordat tenantheaders of membershipfallback worden gebruikt.
- Klantportaal identity gebruikt host-resolved tenant + `customer_users`.
- Default tenant fallback is beperkt tot non-production met `ALLOW_DEFAULT_TENANT_FALLBACK=true`.
- Onbekende Fieldgrid-subdomains falen veilig.

Tenant lifecycle:

- `tenants` bevat `status`, `plan_key`, `created_by`, `suspended_at`, `archived_at` en runtime active status constants.
- Membershipchecks sluiten inactieve, suspended en archived tenants uit.
- Platform-admin lifecycle UI en transactionele lifecycle-acties ontbreken nog.

Tenant-scoped RBAC:

- Canonieke runtime-tabellen bestaan: `tenant_roles`, `tenant_role_permissions`, `tenant_user_roles`.
- `roles` en `role_permissions` blijven globale templates.
- Backoffice en API permission lookup gebruiken tenant role ids.
- Rollenbeheer-actions bestaan voor tenantrollen, permissies, gebruikersrollen en uitnodigingen.
- Custom roles zijn database-backed Professional/Enterprise gated via plan capabilities.

Modules, plans en entitlements:

- `modules`, `tenant_modules` en `module_dependencies` bestaan.
- `plans`, `plan_modules`, `plan_limits` en `tenant_subscriptions` bestaan.
- Starter, Professional en Enterprise zijn seedbaar/gemodelleerd.
- `isTenantModuleEnabled()` en `requireTenantModule()` bestaan in de db package.
- Backoffice permission filtering houdt rekening met module-entitlements voor documents, finance en reporting.
- Documents-action gebruikt `requireCurrentTenantModule("documents")`.

Platform-admin en support foundation:

- `platform_users`, `support_access_grants` en `support_access_audit_log` bestaan.
- `requirePlatformAdmin()`, `requirePlatformSupportUser()` en `requireSupportAccess()` bestaan.
- Platform layout blokkeert gewone tenant-users via platform guard.
- Support grants hebben tenant scope, tijdvenster, reden, revoke en auditlog.

Tenantsector foundation:

- `tenant_sectors` bestaat.
- `task_codes` heeft `tenant_id`.
- Er zijn DB constraints/triggers voor tenant-sector membership/enabled checks op klanten, objecten, personeel en taakcodes.
- Backoffice heeft helpers voor tenant-sector validatie.

Tenant-aware kernentiteiten:

- `customers`, `objects`, `personnel`, `assignments`, `customer_users`, notificaties, planning intelligence en domain events hebben expliciete `tenant_id`.
- Klantportaal gebruikt `customer_users` met `tenant_id + customer_id` als autorisatiebasis.
- Factuur-, offerte-, rapport- en payment-reads zijn op veel plekken parent-scoped via assignment/customer tenantchecks.

Storage en downloads:

- Klantportaal opdrachtfoto signed URLs worden eerst op tenant/opdracht-prefix gevalideerd.
- Backoffice document downloads en deletes gebruiken tenant-prefix guard voordat Supabase signed URLs of deletes worden uitgevoerd.
- Customer invoice PDF route is customer/tenant scoped en audit downloads.
- Report attachment signed URLs zijn parent-scoped en hebben unsafe-path guards, maar nog geen canonieke tenant-prefix storage-migratie.

### 2.2 Gedeeltelijk klaar

Platform-admin:

- Er is een technische shell en guard.
- Nog geen echte platform-admin CRUD voor tenants, domeinen, modules, plannen, limieten, sectorbeleid, task-code overrides, lifecycle of onboarding.
- Geen usage-overzicht of billingbeheer.

Support access:

- Grants en audit bestaan.
- Support access is nog niet consequent als runtime-prioriteit geintegreerd in normale tenantflows.
- Gewenste prioriteit blijft: platform-admin -> actieve support grant -> tenantrol.
- Tenant-admin zicht op support access status ontbreekt nog.

Modules en entitlements:

- Foundation en gedeeltelijke backoffice runtime bestaan.
- API `requirePermission()` is nog niet module-aware.
- Portalen missen nog module-off guards.
- Background jobs/workers moeten nog module-aware worden.
- Platform-admin beheer voor modules, dependencies, plans en limits ontbreekt nog.
- UI-navigatie is deels permission/effective-permission aware, maar directe route/action dekking moet systematisch worden bewezen.

Tenant sectors:

- Membership/enabled foundation bestaat.
- Er is nog geen `tenant_sector_settings` of policy voor single/multiple/max/default sector.
- Single-sector UI is nog niet gebouwd.
- `assertTenantSectorCanBeDisabled()` blokkeert nog niet op bestaande data.
- Assignments hebben geen eigen sectorkolom; sectorcontrole loopt indirect via customer/object/task context en moet expliciet worden ontworpen.

RBAC bewijsvoering:

- Runtime-RBAC is tenant-scoped.
- De definitieve permissiematrix per productrol moet nog als productmatrix worden vastgelegd en getest.
- Integratietests voor dezelfde user met verschillende rollen in Tenant A/B ontbreken nog.

Tenant domains:

- Host-first routing bestaat.
- Tenant switcher override, custom-domain gedrag en onbekende-host behavior moeten nog met echte integration/Playwright-tests bewezen worden.

Branding:

- `organization_settings` is tenant-aware en bevat logo, SMTP, e-mailkleuren en templates.
- Defaults bevatten nog Veele Services tekst. Dat moet worden gescheiden in Fieldgrid platform defaults en tenantbranding.
- Package-gated branding bestaat nog niet.

Testdekking:

- Er is veel statische guardrail-dekking.
- Echte Tenant A/B/Veele integration-, Playwright-, DB/RLS- en storage-tests ontbreken nog grotendeels.
- Statische tests zijn nuttig om regressies in codepatronen te vangen, maar ze bewijzen geen runtime-isolatie.

### 2.3 Nog niet gebouwd of nog niet genoeg bewezen

Module runtime enforcement:

- API module gates.
- Portal module gates.
- Background job module gates.
- Platform-admin module/dependency/plan beheer.
- Direct URL/action/API denial tests voor elke module.

Plannen, subscriptions en limieten:

- Schema foundation bestaat.
- Platform-admin beheer ontbreekt.
- Handmatige Fieldgrid-billing en subscription operations ontbreken.
- Usage en harde limieten ontbreken.

Tenant lifecycle en provisioning:

- Geen transactionele tenant provisioning service.
- Geen onboarding wizard.
- Geen tenant first-run wizard.
- Geen provisioning audit/status/logs.
- Geen tenant create/suspend/archive flow in platform-admin.

Tenant task codes en prijzen:

- `task_codes` is tenant-aware, maar nog niet gemodelleerd als globale template + tenant override.
- Geen `tenant_task_codes`.
- Geen `tenant_task_code_prices`.
- `task_codes.code` is nog globaal unique, wat voor SaaS mogelijk te strak is.

Data-normalisatie op gevoelige tabellen:

- `documents` heeft nog geen `tenant_id`.
- `invoices` heeft nog geen `tenant_id`.
- `quotes` heeft nog geen `tenant_id`.
- `reports` heeft nog geen `tenant_id`.
- `payments` en `customer_payment_batches/items` hebben nog geen directe `tenant_id`.
- `audit_log` heeft nog geen `tenant_id` en is nog niet gesplitst in platform/tenant audit.
- `assignment_photos` en `assignment_report_note_attachments` hebben nog geen directe `tenant_id`.

Storage hardening:

- Er zijn runtime guards voor meerdere signed URL paden.
- Canoniek storagepad `tenant/{tenant_id}/...` is nog niet platformbreed afgedwongen.
- Storage policies en RLS moeten met echte storage tests worden bewezen.
- Backfill/migratie voor bestaande staging storage paths ontbreekt nog.

Portalen:

- Klantportaal en personeelsapp zijn host-first tenant-bound voor identity/profiel.
- Portalen hebben nog geen module guards, tenantbranding, volledige sector guards of complete media/storage acceptance tests.

## 3. Canonieke runtime-volgorde

Elke server-side tenant-entrypoint moet uiteindelijk deze volgorde volgen:

1. `requireAuth()`
2. `resolveTenantFromHostOrSession()`
3. `requireActiveTenant()`
4. `requireTenantMembership()` of `requireActiveSupportGrant()`
5. `requireTenantModule()`
6. `requirePermission()` via tenantrol
7. `requireAllowedSector()` waar sector relevant is
8. `requireEntityInTenant()`
9. actie uitvoeren
10. audit schrijven waar nodig

Voor platformroutes geldt:

1. `requireAuth()`
2. `requirePlatformUser()`
3. `requirePlatformRole()` waar nodig
4. platformactie uitvoeren
5. platform audit schrijven

Supporttoegang is geen gewone tenantrol. De prioriteit blijft:

1. platform-admin voor platformroutes
2. actieve support grant voor support entrypoints
3. tenantrol voor normale tenantwerking

## 4. P0/P1/P2 backlog vanaf nu

### P0 - Eerstvolgende harde SaaS-grenzen

- Canon up-to-date houden na iedere technische golf.
- API module guards toevoegen aan `requirePermission()` of API route wrappers.
- Portal module guards toevoegen aan klantportaal en personeelsapp.
- Module-off denial tests maken voor UI, directe URL, server action en API.
- `tenant_sector_settings` toevoegen met mode, max_sectors, default_sector_id en enforce_sector_scope.
- Single-sector gedrag server-side en UI-side bouwen.
- `assertTenantSectorCanBeDisabled()` laten blokkeren op bestaande data.
- Definitieve RBAC permissiematrix vastleggen en Tenant A/B roltests toevoegen.
- Support runtime-prioriteit expliciet integreren: platform-admin -> support grant -> tenantrol.
- Dashboard/layout fallback naar `DEFAULT_TENANT_ID` vervangen door fail-safe gedrag.
- Platform-admin tenant detail en lifecycle acties bouwen.
- Cross-tenant integration fixtures voor `veele`, `demo-a` en `demo-b` opzetten.

### P1 - Voor externe SaaS-acceptatie

- `tenant_id` toevoegen aan `documents` met staging-safe backfill.
- `tenant_id` toevoegen aan `invoices`, `quotes`, `reports`, `payments`, `customer_payment_batches` en batch items.
- `tenant_id` toevoegen aan assignment media waar direct downloadbaar/exporteerbaar.
- `audit_log` migreren naar tenant-aware audit of splitsen in tenant/platform audit.
- Storagepad canoniek maken: `tenant/{tenant_id}/...` of expliciet vastgelegde opvolger.
- Storage backfillplan maken voor bestaande staging paths.
- Report attachment signed URLs ook tenant-prefix aware maken.
- Direct-ID tests automatiseren voor customers, objects, assignments, documents, invoices en reports.
- PDF/download audit logging uniform maken voor documenten, facturen, rapporten, offertes en support access.
- Tenant news beslissen: tenant-scoped of platform-only/global news.
- Task-code template/override model ontwerpen en migreren.
- Tenant/sector-prijshistorie voor task codes ontwerpen.

### P2 - Productisering en operatie

- Platform-admin module/plan/limit beheer.
- Platform-admin sector/task-code beheer.
- Transactionele provisioning service.
- Platform onboarding wizard.
- Tenant first-run wizard.
- Usage dashboard per tenant.
- Handmatige SaaS-billing en subscription operations.
- Branding resolver en package-gated branding.
- Veele-default teksten scheiden van Fieldgrid platform defaults.
- DNS/reverse-proxy/TLS/rollback playbooks voor Fieldgrid hosts.
- Monitoring, incidentlog en support review dashboard.

## 5. Echte verbeteringen die prioriteit verdienen

Deze lijst is niet alleen achterstallig canonwerk; dit zijn concrete verbeteringen die risico, onderhoudslast of productkwaliteit zichtbaar verlagen.

1. Maak API-permissies module-aware, zodat module-off niet alleen backoffice UI/action gedrag is.
2. Verwijder runtime fallback naar `DEFAULT_TENANT_ID` uit dashboard/layout paden; fail liever expliciet.
3. Voeg directe `tenant_id` toe aan audit en finance voordat externe tenants live gaan.
4. Maak storagepadvalidatie centraal herbruikbaar in plaats van per action eigen helpers.
5. Bouw echte Tenant A/B/Veele integration fixtures; statische tests zijn onvoldoende als eindbewijs.
6. Maak support access zichtbaar als aparte supportmodus met banner, TTL en auditcontext.
7. Maak suspended tenant gedrag expliciet: read-only of volledig geblokkeerd per routegroep.
8. Leg de RBAC permissiematrix productmatig vast voordat platform-admin rollenbeheer verder groeit.
9. Maak task-code prijzen historisch snapshotbaar voor facturen/offertes.
10. Bouw platform-admin tenant detail vroeg, omdat bijna alle latere configuratie daarvan afhankelijk is.

## 6. Nice-to-have ideeen

Deze ideeen zijn nuttig, maar horen niet voor de harde SaaS-security en eerste externe tenant te blokkeren.

- Platform-admin onboarding wizard met checklist en voortgang.
- Tenant first-run wizard voor eigenaar: logo, gebruikers, eerste klant/object/opdracht.
- Usage dashboard: users, documenten, opdrachten, storage, actieve modules.
- Branding preview per tenant.
- Support break-glass flow met verplichte reden en zeer korte TTL.
- Security dashboard met laatste downloads, support access en cross-tenant denial events.
- Module dependency visualisatie.
- Demo-data generator voor `demo-a`, `demo-b` en `veele`.
- Staging smoke dashboard: host, login, modules, sectoren, storage, PDF en migraties.
- Product release notes per tenant.
- Tenant health score voor configuratie, modules, sectoren en billing.

## 7. Uitvoerbare roadmap vanaf nu

### Fase 0 - Canon, audit en testbasis

Doel: de recovery afsluiten en de SaaS-route bestuurbaar maken.

Status: foundation klaar; deze canon moet actueel blijven.

Volgende taken:

- Canon bijwerken na elke module/sector/storage/finance/audit golf.
- `docs/fieldgrid-data-classification.md` gebruiken als verplichte tenantstrategie voor vervolg-PR's.
- `docs/fieldgrid-cross-tenant-testmatrix.md` gebruiken als verplichte test-id bron.
- VPS/domein/deployplan maken voor `fieldgrid.nl`, `platform.fieldgrid.nl`, `staging.fieldgrid.nl` en tenant-subdomains.
- Hardcoded Veele-teksten inventariseren en classificeren als platform, tenant, historische content of seed/default.

### Fase 1 - Tenant lifecycle en resolver uniform maken

Status: schema en host-first foundation klaar; platform-admin lifecycle en echte tests ontbreken.

Volgende taken:

- Platform-admin create/suspend/archive/reactivate bouwen.
- Suspended/archived tenant mutatiebeleid expliciet maken.
- Dashboard/layout fallback naar `DEFAULT_TENANT_ID` verwijderen.
- Tests toevoegen voor platformhost, tenanthost, onbekend Fieldgrid-subdomain, custom domain en tenant switcher override-pogingen.

### Fase 2 - RBAC afronden en bewijzen

Status: tenant runtime-RBAC en DB-backed custom role gating bestaan; integratiebewijs en productmatrix ontbreken.

Volgende taken:

- Definitieve permissiematrix vastleggen.
- Tenant A/B roltests bouwen.
- Platform-admin herstelactie voor tenantrollen bouwen.
- Legacy global-role runtimepaden opruimen zodra tests bewijzen dat ze niet meer gebruikt worden.

### Fase 3 - Modules, plannen en limieten

Status: schema en entitlement helpers bestaan; runtime-dekking en platformbeheer zijn incompleet.

Volgende taken:

- API module guards bouwen.
- Portal module guards bouwen.
- Backoffice route/action dekking systematisch afronden.
- Background jobs module-aware maken.
- Platform-admin UI bouwen voor modules, dependencies, plan modules en limieten.
- Module-off tests automatiseren voor UI, directe URL, server action en API.

### Fase 4 - Sectorbeleid en tenant task codes

Status: tenant-sector membership bestaat; beleid/default/single-sector ontbreken.

Volgende taken:

- `tenant_sector_settings` toevoegen.
- Default sector resolver bouwen.
- Single-sector UI bouwen.
- Disable-check laten blokkeren op bestaande data.
- Sector guards in imports, planning intelligence, assignments en task codes afronden.
- `tenant_task_codes` en `tenant_task_code_prices` ontwerpen.

### Fase 5 - Data-normalisatie en storage hardening

Status: veel parent-scoped runtime guards bestaan; directe tenant_id migratiegolf ontbreekt.

Volgende taken:

- `documents.tenant_id` toevoegen en backfillen.
- `invoices`, `quotes`, `reports`, `payments`, `customer_payment_batches` en batch items tenant-aware maken.
- Assignment media tenant-aware maken waar downloadbaar/exporteerbaar.
- Audit tenant-aware maken of splitsen in tenant/platform audit.
- Storage paths canoniek tenant-prefixed maken.
- Storage/RLS/integration tests bouwen.

### Fase 6 - Platform-admin productiseren

Status: guard/shell bestaat; productbeheer ontbreekt.

Volgende taken:

- Platform-admin navigatie uitbreiden: tenants, tenant detail, modules, sectors, task codes, plans, support, audit.
- Tenantbeheer: aanmaken, activeren, suspenden, archiveren, domeinen beheren, plan wijzigen.
- Module/sector beheer per tenant met dependency validatie.
- Support grants UI inclusief actieve grants per tenant en revoke/audit.
- Plan/limietbeheer en usage-overzicht.

### Fase 7 - Provisioning en onboarding

Status: ontbreekt.

Volgende taken:

- Transactionele provisioning service bouwen.
- Onboarding wizard in platform-admin bouwen.
- Tenant first-run wizard bouwen.
- Owner invite flow met rollback bouwen.
- Provisioning tests voor succes, rollback, duplicate slug/domain en plan/module/sector combinaties.

### Fase 8 - Portalen en branding

Status: host-first identity bestaat; module/branding/sector polish ontbreekt.

Volgende taken:

- Branding resolver per tenant bouwen.
- Package-gated branding uitwerken.
- Klantportaal module guards en branding toevoegen.
- Personeelsapp module guards en branding toevoegen.
- E-mails en PDF's tenantbranding geven.
- Veele-defaults uit platform defaults halen.

### Fase 9 - Fieldgrid deployment en operatie

Status: domeinbesluiten zijn vastgelegd; operationeel playbook moet nog productieklaar.

Volgende taken:

- DNS en reverse proxy voor `fieldgrid.nl`, `platform.fieldgrid.nl`, `staging.fieldgrid.nl`, wildcard `*.fieldgrid.nl` en custom domains.
- Supabase redirect URLs, mail domains, app names en environment variables naar Fieldgrid-context.
- Backup/restore flow voor staging en productie per migratiefase.
- Smoke tests voor platformhost, tenanthost, login, migraties, module-off, sector-off en storage.
- Monitoring/error logging/audit review voor supportproces.

### Fase 10 - Security acceptance en eerste externe tenant

Status: doel; nog niet bereikt.

Volgende taken:

- Cross-tenant test suite: backoffice, klantportaal, personeelsapp, API, PDF routes, storage.
- Module acceptance: module uit, read-only history, dependency blocks, background jobs.
- Sector acceptance: single-sector Starter, multi-sector Professional, sector mismatch create/update.
- Platform-admin acceptance: tenant lifecycle, modules, sectors, plans, support grants, audit.
- Operational readiness: backups, monitoring, incident rollback, mail deliverability, docs.

## 8. Fasesprints vanaf nu

Deze sprintindeling vertaalt de roadmap naar uitvoerbare PR-groepen. Een sprint is pas klaar als de gekoppelde tests uit `docs/fieldgrid-cross-tenant-testmatrix.md` groen zijn en de data-classificatie bijgewerkt blijft.

### Sprint 0 - Canon lock en PR-hygiëne

Doel: de route vastklikken voordat runtimewerk verdergaat.

Scope:

- PR #126 mergen.
- Canon, data-classificatie en cross-tenant testmatrix als verplichte bron gebruiken.
- PR-template of PR-body discipline hanteren: elke PR noemt classificatie-items en test-id's.

Acceptatie:

- `pnpm test` en `pnpm run typecheck` groen.
- Geen runtime-, schema- of migratiewijzigingen in deze sprint.
- Volgende sprint start pas vanaf actuele `main`.

### Sprint 1 - Tenantcontext en testbasis hard maken

Doel: eerst bewijzen dat host-first routing en tenantgrenzen echt gedragen worden door tests.

Scope:

- Tenant A/B/Veele integration fixtures.
- Dashboard/layout fallback naar `DEFAULT_TENANT_ID` fail-safe maken of verwijderen.
- Host-first tests voor platformhost, tenanthost, onbekende host, custom domain en switcher override.
- Suspended/archived tenant mutatiebeleid expliciet maken.

Acceptatie:

- `FG-HOST-001` t/m `FG-HOST-006` groen.
- `FG-LIFE-001` t/m `FG-LIFE-004` groen of bewust als nog-handmatig gemarkeerd met opvolg-issue.
- Veele gedraagt zich aantoonbaar als gewone tenant.

Niet in scope:

- Nieuwe platform-admin productflows.
- Gevoelige data-migraties.

### Sprint 2 - Module enforcement runtimebreed

Doel: module uit betekent server-side uit, niet alleen verborgen UI.

Scope:

- API module guards toevoegen aan permission/route wrappers.
- Portal module guards toevoegen aan klantportaal en personeelsapp.
- Backoffice directe routes/actions nalopen en module-aware maken.
- Background jobs/workers module-aware maken waar modules data verwerken.
- Module dependency gedrag vastleggen.

Acceptatie:

- `FG-MODULE-001` t/m `FG-MODULE-008` groen voor geraakte modules.
- Module-off faalt via UI, directe URL, server action en API.
- RBAC-permissie alleen is nooit genoeg als module uit staat.

Niet in scope:

- Platform-admin modulebeheer UI; dat komt in Sprint 5.

### Sprint 3 - Sectorbeleid productklaar maken

Doel: sectoren van losse toewijzing naar harde tenantpolicy brengen.

Scope:

- `tenant_sector_settings` toevoegen met mode, max_sectors, default_sector_id en enforce_sector_scope.
- Default sector resolver bouwen.
- Single-sector gedrag server-side en UI-side bouwen.
- `assertTenantSectorCanBeDisabled()` laten blokkeren op bestaande data.
- Sector guards afronden voor klanten, objecten, personeel, opdrachten, imports, planning intelligence en task codes.

Acceptatie:

- `FG-SECTOR-001` t/m `FG-SECTOR-006` groen.
- Disable van sector in gebruik wordt geblokkeerd.
- Single-sector tenant krijgt voorspelbaar defaultgedrag.

Niet in scope:

- Tenant task-code prijzen; dat komt in Sprint 9.

### Sprint 4 - RBAC en support runtime-prioriteit

Doel: tenantrollen, support grants en platformrollen als één helder autorisatiemodel bewijzen.

Scope:

- Definitieve RBAC permissiematrix vastleggen.
- Tenant A/B roltests bouwen voor dezelfde gebruiker met verschillende tenantrollen.
- Legacy global-role runtimepaden opruimen waar tests bewijzen dat ze overbodig zijn.
- Support runtime-prioriteit integreren: platform-admin -> actieve support grant -> tenantrol.
- Supportmodus zichtbaar maken met banner, TTL, reden en auditcontext.

Acceptatie:

- `FG-RBAC-001` t/m `FG-RBAC-005` groen.
- `FG-SUPPORT-001` t/m `FG-SUPPORT-006` groen.
- Globale rollen geven geen runtime-rechten.

Niet in scope:

- Volledige platform-admin support UI; dat komt in Sprint 5.

### Sprint 5 - Platform-admin MVP beheer

Doel: de eerste echte platform-admin beheerlaag bouwen waarmee tenants zonder SQL beheerd kunnen worden.

Scope:

- Platform-admin tenantlijst en tenant detail.
- Tenant lifecycle acties: create, suspend, reactivate, archive.
- Domeinbeheer per tenant.
- Module/plan/sector beheer per tenant met dependency-validatie.
- Support grants UI met create, revoke, actieve grants en audit.
- Basis plan/limietbeheer en usage-overzicht.

Acceptatie:

- `FG-PLATFORM-001` t/m `FG-PLATFORM-006` groen.
- Tenant user kan platformroutes nooit gebruiken.
- Acties zijn transactioneel en geaudit.

Niet in scope:

- Volledige onboarding wizard; dat komt in Sprint 11.

### Sprint 6 - Documenten en storage wave 1

Doel: de eerste gevoelige data-normalisatie uitvoeren met documenten en storage als basispatroon.

Scope:

- `documents.tenant_id` toevoegen met staging-safe backfill.
- Shared storage path validator bouwen.
- Canoniek storagepad `tenant/{tenant_id}/...` voor documenten afdwingen.
- Upload, download en delete tenant-bound maken.
- Storage backfillplan voor bestaande staging paths uitwerken.

Acceptatie:

- `FG-DATA-004` groen.
- `FG-STORAGE-001`, `FG-STORAGE-002`, `FG-STORAGE-006` en `FG-STORAGE-007` groen.
- Migraties slagen op lege database en staging-copy: `FG-MIG-001`, `FG-MIG-002`.

Niet in scope:

- Finance/reporting tenant_id migraties; die komen in Sprint 7.

### Sprint 7 - Finance en reports wave 2

Doel: alle downloadbare en financieel gevoelige kernrecords direct tenant-aware maken.

Scope:

- `invoices.tenant_id`, `quotes.tenant_id` en `reports.tenant_id` toevoegen met backfills.
- PDF/download routes tenant-bound maken.
- Uniforme download audit voor facturen, offertes en rapporten.
- Direct-ID tests voor invoice, quote en report.

Acceptatie:

- `FG-DATA-005`, `FG-DATA-006` en `FG-DATA-007` groen.
- `FG-AUDIT-001` groen voor geraakte downloads.
- `FG-MIG-001` en `FG-MIG-002` groen.

Niet in scope:

- Payments en batches; die komen in Sprint 8.

### Sprint 8 - Payments, batches en audit wave 3/4

Doel: paymentflows en audit als SaaS-grens hard maken.

Scope:

- `payments.tenant_id` toevoegen.
- `customer_payment_batches` en batch items tenant-aware maken.
- Payment webhook/status flows tenantguard geven.
- `audit_log` tenant-aware maken of splitsen in tenant audit en platform audit.
- Tenant-admin auditzicht en platform/support auditzicht scheiden.

Acceptatie:

- `FG-DATA-008` en `FG-DATA-009` groen.
- `FG-AUDIT-002` t/m `FG-AUDIT-005` groen.
- `FG-MIG-001` en `FG-MIG-002` groen.

Niet in scope:

- Automatische payment-provider; handmatige SaaS-billing blijft eerst leidend.

### Sprint 9 - Tenant task codes, prijzen en sector-economie

Doel: taakcodes en prijzen SaaS-productklaar maken voor meerdere tenants en sectoren.

Scope:

- `tenant_task_codes` ontwerpen en migreren.
- `tenant_task_code_prices` of equivalent prijshistorie ontwerpen.
- Code uniqueness per tenant bepalen.
- Prijs snapshotten voor offertes/facturen.
- Sector guards voor task codes en planning intelligence afronden.

Acceptatie:

- Task code sector buiten tenant faalt.
- Historische factuur/offerte behoudt oude prijs.
- Cross-tenant code/prijsgedrag is getest met Tenant A/B/Veele.

Niet in scope:

- Uitgebreide prijswizard of commerciële prijsoptimalisatie.

### Sprint 10 - Portalen, branding en tenantervaring

Doel: klantportaal en personeelsapp voelen als tenantproduct en volgen modules, sectoren en branding.

Scope:

- Branding resolver per tenant.
- Veele-default teksten scheiden van Fieldgrid platform defaults.
- Package-gated branding uitwerken.
- Klantportaal module guards, branding en download audit afronden.
- Personeelsapp module guards, branding en media/storage acceptance afronden.
- E-mails en PDF's tenantbranding geven.

Acceptatie:

- `FG-PORTAL-C-001` t/m `FG-PORTAL-C-004` groen.
- `FG-PORTAL-P-001` t/m `FG-PORTAL-P-004` groen.
- Tenantbranding lekt niet tussen tenants.

Niet in scope:

- Nice-to-have branding preview; mag pas na harde resolver en guards.

### Sprint 11 - Provisioning en onboarding

Doel: een nieuwe tenant betrouwbaar kunnen aanmaken, configureren en overdragen.

Scope:

- Transactionele provisioning service.
- Owner invite flow met rollback.
- Platform onboarding wizard.
- Tenant first-run wizard.
- Provisioning logs/status/audit.
- Duplicate slug/domain checks.

Acceptatie:

- Provisioning succes, rollback en duplicate slug/domain zijn getest.
- Nieuwe tenant krijgt owner, domein, plan, modules, sectoren en basisrollen.
- Staging-copy blijft intact bij migraties.

Niet in scope:

- Volledig self-service verkoopkanaal.

### Sprint 12 - Operatie, release en eerste externe tenant

Doel: Fieldgrid operationeel klaarzetten voor eerste externe SaaS-acceptatie.

Scope:

- DNS, reverse proxy en TLS voor `fieldgrid.nl`, `platform.fieldgrid.nl`, `staging.fieldgrid.nl`, wildcard subdomains en custom domains.
- Supabase redirect URLs, mail domains, app names en environment variables naar Fieldgrid-context.
- Backup/restore en rollback playbooks.
- Monitoring, incidentlog en support review dashboard.
- Security acceptance suite: backoffice, API, klantportaal, personeelsapp, PDF routes en storage.
- Eerste externe tenant checklist.

Acceptatie:

- Cross-tenant security suite groen.
- Staging smoke dashboard of equivalent checklist groen.
- Backups, rollback, monitoring en mail deliverability zijn getest.
- Eerste externe tenant kan zonder SQL worden ingericht.

Niet in scope:

- Automatische billing-provider, marketplace, publieke signup en geavanceerde usage analytics.

## 9. Eerstvolgende concrete PR-volgorde

1. Sprint 0: merge PR #126 met canon en fasesprints.
2. Sprint 1 PR A: Tenant A/B/Veele integration fixture basis.
3. Sprint 1 PR B: dashboard/layout default-tenant fallback verwijderen en host-first denial tests.
4. Sprint 2 PR A: API module guards.
5. Sprint 2 PR B: portal module guards.
6. Sprint 2 PR C: background job module guards en module-off testmatrix.
7. Sprint 3 PR A: sector policy foundation met `tenant_sector_settings` en default sector resolver.
8. Sprint 3 PR B: sector disable-check blokkeren op bestaande data en assignment/import/planning sector guards.
9. Sprint 4 PR A: RBAC permissiematrix en Tenant A/B roltests.
10. Sprint 4 PR B: support runtime-prioriteit, supportmodus en auditcontext.
11. Sprint 5 PR A: platform-admin tenant detail en lifecycle acties.
12. Sprint 5 PR B: platform-admin module/plan/sector/support beheer.
13. Sprint 6 PR A: sensitive tenant_id wave 1: `documents`.
14. Sprint 6 PR B: shared storage path validator en storage backfillplan.
15. Sprint 7 PR A: sensitive tenant_id wave 2: `invoices`, `quotes`, `reports`.
16. Sprint 7 PR B: PDF/download audit uniformeren.
17. Sprint 8 PR A: sensitive tenant_id wave 3: `payments`, `customer_payment_batches`, batch items.
18. Sprint 8 PR B: audit tenant/platform split.
19. Sprint 9 PR A: tenant task-code template/override model.
20. Sprint 9 PR B: tenant/sector-prijshistorie en snapshots.
21. Sprint 10 PR A: branding resolver en Fieldgrid/Veele defaultscheiding.
22. Sprint 10 PR B: klantportaal en personeelsapp module/branding/storage acceptance.
23. Sprint 11 PR A: provisioning service en owner invite rollback.
24. Sprint 11 PR B: platform onboarding en tenant first-run wizard.
25. Sprint 12 PR A: Fieldgrid DNS/VPS/Supabase environment playbook.
26. Sprint 12 PR B: final SaaS acceptance suite en eerste externe tenant checklist.

## 10. Hard rules voor alle vervolgtaken

- Nooit tenantdata lezen of schrijven op alleen technische id.
- Host/subdomain-context wint van tenant switcher.
- Geen runtime fallback naar `DEFAULT_TENANT_ID` in productie.
- Module uit betekent server-side uit.
- Sectorbeperking is een harde businessregel, geen UI-filter.
- Veele is tenant; Fieldgrid is platform.
- Support access is expliciet, tijdelijk, tenant-scoped en geaudit.
- Nieuwe migraties moeten staging-data behouden en rollbackbaar zijn.
- Oude globale RBAC-tabellen mogen alleen templates/backfill zijn, niet runtime-autorisatie.
- Elke risicofase krijgt cross-tenant tests voordat staging wordt gepromoveerd.
- Statische tests zijn guardrails, geen vervanging voor integration/DB/RLS/storage-tests.

## 11. MVP definitie

Fieldgrid SaaS MVP is klaar wanneer:

- Platform-admin tenants kan aanmaken en configureren zonder SQL.
- Tenant heeft domein/subdomain, plan, modules, sectoren en owner.
- Tenant kan active/suspended/archived worden.
- Modules zijn per tenant server-side afgedwongen.
- Sectoren zijn per tenant server-side en database-side afgedwongen waar mogelijk.
- Runtime RBAC gebruikt alleen tenantrollen.
- Klantportaal en personeelsapp zijn host-first tenant-aware en module-aware.
- Gevoelige data heeft expliciete tenant_id of een bewust gedocumenteerde uitzondering.
- Storage is tenant-prefixed en getest.
- Support grants werken en worden geaudit.
- Starter/Professional/Enterprise bestaan in database en platform-admin.
- Fieldgrid draait op de beoogde VPS-domeinen met backup/rollbackproces.
- Cross-tenant security suite is groen.

## 12. Verplichte uitvoeringsbronnen

Vanaf elke technische PR zijn deze bronnen verplicht:

- `docs/fieldgrid-data-classification.md`: bepaalt tenantstrategie, prioriteit, migratienoodzaak en gevoelige restpunten.
- `docs/fieldgrid-cross-tenant-testmatrix.md`: bepaalt de test-id's die in PR-bodies, acceptatiecriteria en staging-promotie moeten worden genoemd.
- `docs/fieldgrid-recovery-execution-plan.md`: bewaart de recovery-guardrails die blijven gelden, vooral staging-data behoud en migratieveiligheid.

Elke vervolg-PR met tenant lifecycle, modules, sectoren, storage, finance, documenten, audit of portalen moet expliciet noemen welke classificatieregels en test-id's worden geraakt.

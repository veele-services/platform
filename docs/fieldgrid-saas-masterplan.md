# Fieldgrid SaaS masterplan canon

Datum: 2026-07-03  
Status: actuele canon na recovery, sprints 1 t/m 11, PR #149 en fase 0 canonrefresh.  
Bronnen: oorspronkelijke Fieldgrid/Veele SaaS-masterplanbijlage, huidige `main` codebase, `docs/fieldgrid-next-major-update-plan.md`, data-classificatie, cross-tenant testmatrix en staging-promotiechecklist.

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
- Sectoren blijven een globale catalogus met tenant-toewijzing en tenantpolicy.
- Starter, Professional en Enterprise zijn de eerste pakketten.
- Geen harde aantallimieten in de recovery-MVP, behalve: custom role management is Professional+.
- Facturatie van Fieldgrid-abonnementen is eerst handmatig; automatische payment-provider komt later.
- Staging-data blijft behouden; risicomigraties moeten staging-copy smoke getest worden.

## 2. Actuele codebase-status

### 2.1 Gebouwd of grotendeels gebouwd

Recovery en governance:

- `main` is opnieuw bron van waarheid.
- `docs/fieldgrid-recovery-execution-plan.md` bewaart de blijvende recovery-guardrails.
- `docs/fieldgrid-next-major-update-plan.md` is de uitvoeringscanon voor de volgende grote update.
- `docs/fieldgrid-staging-promotion-checklist.md` bepaalt per fase hoe staging zoveel mogelijk bereikbaar blijft.
- Canon-docs worden bewaakt met `tests/fieldgrid-canon.test.mjs`.

Tenantcontext en lifecycle:

- `tenant_domains` bestaat.
- Backoffice, API, klantportaal en personeelsapp zijn host-first tenant-aware.
- Onbekende Fieldgrid-subdomains falen veilig.
- Default tenant fallback is beperkt tot non-production met expliciete configuratie.
- `tenants` bevat lifecycle-status, `plan_key`, creator/auditvelden en statusdata.
- Membershipchecks sluiten inactieve, suspended en archived tenants uit.
- Provisioning foundation en runstatus bestaan; de productwizard en volledige operationele smoke ontbreken nog.

Tenant-scoped RBAC:

- Canonieke runtime-tabellen bestaan: `tenant_roles`, `tenant_role_permissions`, `tenant_user_roles`.
- `roles` en `role_permissions` blijven globale templates.
- Backoffice en API permission lookup gebruiken tenant role ids.
- Rollenbeheer-actions bestaan voor tenantrollen, permissies, gebruikersrollen en uitnodigingen.
- Custom roles zijn Professional/Enterprise gated via plan capabilities.

Modules, plans en entitlements:

- `modules`, `tenant_modules`, `module_dependencies`, `plans`, `plan_modules`, `plan_limits` en `tenant_subscriptions` bestaan.
- Starter, Professional en Enterprise zijn seedbaar/gemodelleerd.
- API `requirePermission()` heeft brede modulemapping.
- Backoffice modulemapping is smaller en dekt vooral documents, finance en reporting; harmonisatie blijft open.
- Portal- en background-job moduleguards moeten nog breed bewezen of afgerond worden.

Platform-admin en support:

- `platform_users`, platformrollen/status, support grants en support audit bestaan.
- Platformroutes hebben een platform-admin guard; gewone tenant-users mogen geen platformroutes gebruiken.
- Support grants hebben tenant scope, tijdvenster, reden, revoke en auditlog.
- Break-glass heeft nog geen harde maximale TTL-flow.
- Een centraal security/download/support dashboard ontbreekt nog.

Sectoren en task codes:

- `tenant_sectors` bestaat.
- `tenant_sector_settings` en tenant-sector policy foundation bestaan.
- `task_codes` is tenant-aware en ondersteunt tenantgerichte overrides/foundation.
- Sectoren worden server-side afgedwongen op de belangrijkste domeinen, maar runtimebewijs en disable/backfill-smokes moeten verder worden uitgebreid.

Tenant-aware datafoundation:

- `customers`, `objects`, `personnel`, `assignments`, `customer_users`, notificaties, planning intelligence en domain events hebben expliciete `tenant_id`.
- `documents`, `reports`, `quotes`, `invoices`, `payments`, `customer_payment_batches`, batch items en `audit_log` hebben tenant-aware foundation gekregen, maar gevoelige tenantdata heeft vaak nog nullable `tenant_id`.
- Voor `audit_log` is nullable deels bewust voor platform/global audit; tenant-audit moet wel tenant-aware blijven.
- `assignments.tenant_id` heeft nog een DB-default naar `DEFAULT_TENANT_ID`; dat blijft een SaaS-risico voor toekomstige writes.

Storage en downloads:

- Centrale tenant storage helpers en meerdere signed URL/download guards bestaan.
- Nieuwe documentpaden zijn richting tenant-prefix gebracht.
- Fysieke storage-backfill, Supabase Storage policy/RLS bewijs en path guessing tests ontbreken nog.
- `assignment_photos` en `assignment_report_note_attachments` blijven P1 omdat downloadbaar materiaal nog geen directe `tenant_id` heeft.

Portalen en branding:

- Klantportaal en personeelsapp zijn host-first tenant-bound voor identity/profiel.
- Portal moduleguards, brandingresolver, tenantbranding en storage acceptance tests moeten nog productklaar worden gemaakt.
- Tenant first-run foundation bestaat; echte wizardvalidatie ontbreekt nog.

Testdekking:

- Er is veel statische guardrail-dekking.
- Dat is nuttig, maar nog geen bewijs voor runtime SaaS-isolatie.
- Nodig blijven Tenant A/B/Veele integration tests, Playwright host tests, DB/RLS tests, storage signed-url tests en migratie-smokes.

### 2.2 Nog ontbreekt of moet gewijzigd worden

Deze lijst is de actuele bron voor de volgende grote update:

1. Canon refresh is uitgevoerd in fase 0; vervolg-PR's moeten de canon actueel houden.
2. Tests zijn nog te statisch: echte runtime-, Playwright-, DB/RLS-, storage- en migratiebewijzen ontbreken grotendeels.
3. Directe `tenant_id` is vaak nog nullable voor gevoelige tenantdata; post-migration hardening moet validatie en `NOT NULL` waar mogelijk afdwingen.
4. Assignment media blijft P1: `assignment_photos` en `assignment_report_note_attachments` moeten direct tenant-aware worden.
5. News scope is open: `news_posts` wordt expliciet platform-only of tenant-scoped.
6. Backoffice module mapping moet worden geharmoniseerd met API module guards of bewust worden gedocumenteerd.
7. DB-defaults naar `DEFAULT_TENANT_ID`, waaronder `assignments.tenant_id`, moeten uit tenantdata verdwijnen.
8. Support break-glass moet een korte maximale TTL, verplichte reden en auditcontext afdwingen.
9. Usage dashboard is incompleet: documenten, storagegebruik, downloads en actieve modules moeten worden toegevoegd.
10. Storage is applicatie-hard, maar nog niet volledig bewezen: fysieke backfill, Supabase policies en path guessing tests ontbreken.

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

- Tenant A/B/Veele integration fixtures bouwen.
- Playwright host-first tests bouwen.
- DB/RLS en storage signed-url testbasis opzetten.
- Migration smoke workflow bouwen op lege database en staging-copy.
- Backoffice/API/portalen/jobs module enforcement harmoniseren.
- DB-defaults naar `DEFAULT_TENANT_ID` uit tenantdata verwijderen.
- Support break-glass TTL afdwingen.
- News scope beslissen voordat news verder productmatig groeit.

### P1 - Voor externe SaaS-acceptatie

- Post-migration hardening: unresolved rows rapporteren, constraints valideren en `tenant_id NOT NULL` zetten waar stagingdata schoon is.
- Assignment media direct tenant-aware maken.
- Fysieke storage-backfill uitvoeren met copy-first, verify-second, switch-third, cleanup-last.
- Supabase Storage policy/RLS bewijs toevoegen.
- Path guessing tests automatiseren voor documenten, media, rapporten en attachments.
- `audit_log` typecontract tenant-aware maken waar tenant-audit bedoeld is.
- PDF/download audit logging uniform maken.

### P2 - Productisering en operatie

- Platform-admin onboarding wizard voor nieuwe tenants.
- Tenant first-run wizard voor eigenaar.
- Usage dashboard per tenant met users, documenten, opdrachten, storage, actieve modules en support grants.
- Branding preview per tenant.
- Security dashboard met downloads, support access en cross-tenant denial events.
- Module dependency visualisatie.
- Demo-data generator voor `demo-a`, `demo-b` en `veele`.
- Staging smoke dashboard voor host, login, modules, sectoren, storage, PDF, support, audit en migraties.
- Eerste externe tenant checklist.

## 5. Echte verbeteringen met waarde

Deze verbeteringen verlagen direct risico of verhogen beheerbaarheid:

1. Maak een post-migration hardening sprint met validate constraints, unresolved-row rapportage en `tenant_id NOT NULL` waar mogelijk.
2. Voeg echte integration fixtures toe voor `demo-a`, `demo-b` en `veele`.
3. Bouw migration smoke op lege database en staging-copy.
4. Maak een centraal audit/download/security dashboard.
5. Harmoniseer module enforcement tussen API, backoffice, portalen en jobs.
6. Verwijder DB-defaults naar `DEFAULT_TENANT_ID` uit tenantdata.
7. Maak `audit_log` typecontract tenant-aware waar tenant-audit bedoeld is.
8. Maak support TTL maximaal, bijvoorbeeld 1 tot 4 uur, met expliciete break-glass reason.

## 6. Nice-to-have status

| Nice-to-have | Status | Doelfase |
| --- | --- | --- |
| Platform-admin onboarding wizard | Gedeeltelijk: provisioning form + runstatus, geen wizard | Fase 6 |
| Tenant first-run wizard | Gedeeltelijk: checklist/foundation bestaat, geen echte wizardvalidatie | Fase 6 |
| Usage dashboard per tenant | Gedeeltelijk: basisstats, geen documenten/storage | Fase 6 |
| Branding preview per tenant | Niet meegenomen | Fase 6 |
| Support break-glass flow | Gedeeltelijk: reden + grant + audit, geen korte TTL/max-flow | Fase 5 |
| Security dashboard | Niet meegenomen, alleen losse support/auditbasis | Fase 5 |
| Module dependency visualisatie | Gedeeltelijk: dependency keys zichtbaar, geen visualisatie | Fase 4 of 6 |
| Demo-data generator | Niet meegenomen; wel statische Tenant A/B/Veele fixtures/canon | Fase 1 |
| Staging smoke dashboard | Niet meegenomen | Fase 7 |

## 7. Faseplanning vanaf nu

De gedetailleerde uitvoeringsplanning staat in `docs/fieldgrid-next-major-update-plan.md`. Deze masterplan-canon vat de fases samen.

### Fase 0 - Canon en updatecontract vastzetten

Status: uitgevoerd in deze fase-0 update.

Scope:

- Masterplan, data-classificatie en testmatrix actualiseren.
- PR-template uitbreiden met updateplan, data-items, test-id's en stagingchecklist.
- Staging-promotiechecklist toevoegen.
- Canon-tests laten bewaken dat oude actuele PR #125-status niet terugkomt.

### Fase 1 - Echte testbasis en demo-data

Scope:

- Tenant A/B/Veele fixtures.
- Demo-data generator skeleton.
- Host-first Playwright/integration basis.
- DB/RLS en storage testbasis.
- Migration smoke skeleton.

### Fase 2 - Post-migration hardening en tenant_id afdwingen

Scope:

- Unresolved-row rapportages.
- Constraint validation.
- `tenant_id NOT NULL` waar schoon.
- Bewust nullable auditdocumentatie.
- `DEFAULT_TENANT_ID` defaults verwijderen.

### Fase 3 - Assignment media, news en storage bewijs

Scope:

- Assignment media tenant-aware maken.
- News platform-only of tenant-scoped kiezen en afdwingen.
- Storage backfill en storage policy/path guessing bewijs.

### Fase 4 - Module enforcement harmoniseren

Scope:

- API, backoffice, portalen en jobs op dezelfde modulewaarheid zetten.
- Module-off denial bewijzen via UI, directe URL, server action, API en jobs.
- Module dependency inzicht toevoegen.

### Fase 5 - Support break-glass en security dashboard

Scope:

- Korte support TTL afdwingen.
- Break-glass reden en auditcontext verplichten.
- Read-only security/download/support dashboard bouwen.

### Fase 6 - Productisering: onboarding, first-run, usage en branding

Scope:

- Platform-admin onboarding wizard.
- Tenant first-run wizard.
- Usage dashboard met documenten/storage.
- Branding preview.

### Fase 7 - Staging smoke dashboard en operationele acceptatie

Scope:

- Staging smoke dashboard.
- Smoke API/script.
- Backup/restore/rollback playbook.
- Eerste externe tenant checklist.

## 8. Staging-promotiecontract

Elke fase moet `docs/fieldgrid-staging-promotion-checklist.md` volgen.

Minimumregels:

- Docs/test-only fases mogen direct na groene CI naar staging.
- Runtimefases mogen naar staging na typecheck, build, relevante tests en handmatige smokecheck.
- Migratiefases mogen naar staging na lege database smoke en staging-copy smoke.
- Storagebackfills zijn copy-first, verify-second, switch-third, cleanup-last.
- Als staging faalt, wordt alleen de betreffende fase gerepareerd; geen reset.

## 9. Hard rules voor alle vervolgtaken

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

## 10. MVP definitie

Fieldgrid SaaS MVP is klaar wanneer:

- Platform-admin tenants kan aanmaken en configureren zonder SQL.
- Tenant heeft domein/subdomain, plan, modules, sectoren en owner.
- Tenant kan active/suspended/archived worden.
- Modules zijn per tenant server-side afgedwongen.
- Sectoren zijn per tenant server-side en database-side afgedwongen waar mogelijk.
- Runtime RBAC gebruikt alleen tenantrollen.
- Klantportaal en personeelsapp zijn host-first tenant-aware en module-aware.
- Gevoelige data heeft expliciete, gevalideerde `tenant_id` of een bewust gedocumenteerde uitzondering.
- Storage is tenant-prefixed en getest.
- Support grants werken, hebben korte TTL waar break-glass geldt en worden geaudit.
- Starter/Professional/Enterprise bestaan in database en platform-admin.
- Fieldgrid draait op de beoogde VPS-domeinen met backup/rollbackproces.
- Cross-tenant security suite is groen.

## 11. Verplichte uitvoeringsbronnen

Vanaf elke technische PR zijn deze bronnen verplicht:

- `docs/fieldgrid-next-major-update-plan.md`: bepaalt de fase en PR-volgorde voor de volgende grote update.
- `docs/fieldgrid-data-classification.md`: bepaalt tenantstrategie, prioriteit, migratienoodzaak en gevoelige restpunten.
- `docs/fieldgrid-cross-tenant-testmatrix.md`: bepaalt de test-id's die in PR-bodies, acceptatiecriteria en staging-promotie moeten worden genoemd.
- `docs/fieldgrid-staging-promotion-checklist.md`: bepaalt hoe staging bereikbaar blijft per fase.
- `docs/fieldgrid-recovery-execution-plan.md`: bewaart recovery-guardrails, vooral staging-data behoud en migratieveiligheid.

Elke vervolg-PR met tenant lifecycle, modules, sectoren, storage, finance, documenten, audit, provisioning of portalen moet expliciet noemen welke fase, classificatieregels, test-id's en stagingregels worden geraakt.

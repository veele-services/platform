# Fieldgrid SaaS masterplan canon

Datum: 2026-07-03
Status: sprint 0 canon refresh 2.0. Actuele uitvoeringsbron: `docs/fieldgrid-saas-proof-sprint-plan.md`.
Bronnen: oorspronkelijke Fieldgrid/Veele SaaS-masterplanbijlage, huidige `main` codebase, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-next-major-update-plan.md`, `docs/fieldgrid-staging-promotion-checklist.md` en `docs/fieldgrid-saas-proof-sprint-plan.md`.

## 1. Doel en vaste besluiten

Fieldgrid is het SaaS-platform. Veele Services is geen platform-uitzondering meer, maar een gewone tenant binnen Fieldgrid.

Vaste besluiten:

- Productdoel: extern multi-tenant SaaS-platform.
- Databasekeuze: gedeelde database met sterke tenant-isolatie.
- Isolatie-eis: applicatiechecks, RLS/storage policies en cross-tenant tests.
- Tenantselectie: host/subdomain is leidend; tenant switcher mag hostcontext niet overschrijven.
- Platformdomeinen nu: `platform.fieldgrid.nl` voor productie en `staging.fieldgrid.nl` voor staging.
- Doeldomeinmodel: `fieldgrid.nl` als hoofd/platformmerk, `platform.fieldgrid.nl` als platform-admin, tenant-subdomains zoals `veele.fieldgrid.nl`.
- Platform-admin is gescheiden van tenant-admin.
- Fieldgrid support werkt alleen via expliciete support grants en audit logging.
- Globale `roles` blijven templates; runtime-RBAC komt uit `tenant_roles`.
- Modules worden tenant-specifiek aan/uit gezet en server-side afgedwongen.
- Sectoren blijven een globale catalogus met tenant-toewijzing en tenantpolicy.
- Regio's worden tenant-configuratie: personeel, objecten en opdrachten moeten meerdere tenant-regio's kunnen gebruiken met backoffice autocomplete/multiselect.
- Starter, Professional en Enterprise zijn de eerste pakketten.
- Geen harde aantallimieten in de recovery-MVP, behalve: custom role management is Professional+.
- Facturatie van Fieldgrid-abonnementen is eerst handmatig; automatische payment-provider komt later.
- Staging-data blijft behouden; risicomigraties moeten staging-copy smoke getest worden.

## 2. Canonieke statusvelden

Alle canonbronnen gebruiken vanaf sprint 0 dezelfde statusvelden.

| Status | Betekenis |
| --- | --- |
| `done` | Gebouwd, runtime actief en passend bewezen. |
| `partial` | Basis bestaat, maar productflow, dekking of randgevallen zijn incompleet. |
| `runtime-proof-open` | Runtime lijkt aanwezig, maar echte integration/Playwright/DB/RLS/storage-bewijzen ontbreken. |
| `hardening-open` | Schema/runtime is staging-veilig opgebouwd, maar backfill, constraint validation, `NOT NULL`, policybewijs of cleanup staat open. |
| `nice-to-have` | Waardevol voor product/operatie, maar niet vereist voor harde SaaS-isolatie. |

Geen onderwerp mag in vervolgwerk alleen als "open" blijven staan zonder status, eigenaar-sprint en test-/hardeningcontract.

## 3. Actuele codebase-status

### 3.1 `done` of grotendeels bewezen

- `main` is bron van waarheid.
- Recovery-guardrails staan in `docs/fieldgrid-recovery-execution-plan.md`.
- Host-first tenantcontext is runtimebasis voor backoffice, API, klantportaal en personeelsapp.
- `tenant_domains` bestaat.
- `tenant_roles`, `tenant_role_permissions` en `tenant_user_roles` zijn runtime-RBAC-bron.
- Globale `roles` en `role_permissions` blijven templates.
- Platform-admin en supportgrant-basis bestaan.
- Tenant-sector foundation en tenant-sector settings bestaan.
- Modules, plans, tenant modules, dependencies, subscriptions en limits hebben foundation.
- API module guards en Portal module guards moeten overal dezelfde module-uit semantiek afdwingen.
- Materialen/inventaris hebben onderzoeks- en productcanon; volledige modulebouw volgt na SaaS proof of als aparte roadmap.

### 3.2 `partial`

- Platform onboarding: wizard met save/resume/review/retry/rollback bestaat; runtimebewijs blijft open.
- Tenant first-run: checklist/foundation bestaat, echte owner wizard ontbreekt.
- Support break-glass: reden/expiry/audit bestaan, harde max TTL en centrale flow ontbreken.
- Usage dashboard: basisstats bestaan, documenten/storage/downloads/actieve modules moeten erbij.
- Staging smoke: read-only/dashboardbasis bestaat, run history, live smokes en mutating cleanup ontbreken.
- Demo-data: canon/fixtures bestaan, one-click seed/cleanup ontbreekt.
- Audit/security: basis bestaat, downloads/PDF/direct-ID/module/storage-denials moeten centraal landen.
- Regio: legacy `personnel.region`, `personnel.preferredRegions` en `assignments.requiredRegion` bestaan, maar tenant-regio datamodel en multiselect ontbreken.

### 3.3 `runtime-proof-open`

- Host-first tenantcontext moet met Tenant A/B/Veele integration en Playwright bewezen worden.
- Tenant lifecycle active/suspended/archived moet runtime bewezen worden.
- Tenant RBAC moet met echte rolverschillen per tenant bewezen worden.
- Module enforcement moet API, backoffice, portalen en jobs hetzelfde laten reageren.
- Sector enforcement moet disable/default/single-sector scenario's runtime bewijzen.
- Veele Portaal klant/personeel moet E2E bewijzen voor documenten, facturen, tickets, opdrachten, media, rapportage, notificaties, module-denials en verkeerde-host scenario's.
- Personeelsplanning heeft live/minuut-refresh, maar portal acceptance moet blijven bewijzen dat Home/Planning actueel zijn.

### 3.4 `hardening-open`

- `documents`, `reports`, `quotes`, `invoices`, `payments`, `customer_payment_batches`, batch items en tenant-audit in `audit_log` hebben tenant-aware foundation, maar nullable/backfill/constraint validation blijft open.
- `assignment_photos` en `assignment_report_note_attachments` moeten direct tenant-aware en storage-proof worden.
- Storagehelpers en guards bestaan, maar fysieke backfill, Supabase Storage policy/RLS bewijs en signed-url/path-guessing tests ontbreken.
- DB-defaults naar `DEFAULT_TENANT_ID` moeten uit tenantdata verdwijnen.
- `audit_log.tenant_id` mag alleen bewust nullable blijven voor platform/global audit en moet voor tenant-audit contractueel scherp zijn.

### 3.5 `nice-to-have`

- Branding preview per tenant voor backoffice, klantportaal, personeelsapp, email en PDF.
- Module dependency visualisatie.
- Security dashboard polish bovenop het noodzakelijke audit/security dashboard.
- Staging smoke dashboard uitbreiden met historie, trend en mutating smoke-details.

## 4. Regio-canon

Regio wordt vanaf sprint 0 een tenant-config domein.

Doelmodel:

- `tenant_regions` is de tenant-brede bron voor regio's.
- Personeel kan aan meerdere regio's gekoppeld worden.
- Objecten kunnen aan meerdere regio's gekoppeld worden.
- Opdrachten kunnen meerdere vereiste regio's hebben.
- Backoffice gebruikt overal dezelfde multiselect met autocomplete op bestaande tenant-regio's.
- Nieuwe regio's mogen via create-on-type worden toegevoegd, tenant-scoped en genormaliseerd.
- Planning matcht op overlap: opdracht zonder regio heeft geen regiobeperking; opdracht met regio's vereist ten minste een passende personeelsregio.
- Een regio-id uit een andere tenant faalt server-side.

Geraakte backofficegebieden:

- Personeelslid aanmaken/bewerken.
- Object aanmaken/bewerken.
- Opdracht aanmaken/bewerken.
- Planning/smart planning filters.
- Customer/object/personnel detailfilters waar regio operationele waarde heeft.

## 5. Nieuwe uitvoeringslijn

De volledige uitvoeringscanon staat in `docs/fieldgrid-saas-proof-sprint-plan.md`.

Samenvatting:

| Sprint | Doel |
| --- | --- |
| 0 | Canon refresh 2.0: statusvelden, sprintplan, regio-canon, guardtests. |
| 1 | Tenant A/B/Veele runtime fixtures en seed/cleanup. |
| 2 | Regio datamodel en backfill. |
| 3 | Regio UI backoffice breed met multiselect/autocomplete. |
| 4 | Regio runtime en planninglogica. |
| 5 | Runtime security proof suite. |
| 6 | Playwright host en portal acceptance. |
| 7 | Migration smoke workflow. |
| 8 | Tenant-id hardening wave. |
| 9 | Storage hardening. |
| 10 | Audit en security dashboard 2.0. |
| 11 | Module enforcement harmonisatie. |
| 12 | Platform onboarding wizard. |
| 13 | Tenant first-run wizard. |
| 14 | Usage, branding en operational readiness. |
| 15 | Staging smoke dashboard. |
| 16 | Final hardening en externe tenant gate. |

De oude fase 0-7 planning blijft alleen historisch/contextueel; de sprints 0-16 zijn vanaf nu leidend.

## 6. Runtime-volgorde

Elke server-side tenant-entrypoint moet uiteindelijk deze volgorde volgen:

1. `requireAuth()`
2. `resolveTenantFromHostOrSession()`
3. `requireActiveTenant()`
4. `requireTenantMembership()` of `requireActiveSupportGrant()`
5. `requireTenantModule()`
6. `requirePermission()` via tenantrol
7. `requireAllowedSector()` waar sector relevant is
8. `requireAllowedRegion()` waar regio relevant is
9. `requireEntityInTenant()`
10. actie uitvoeren
11. audit schrijven waar nodig

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

## 7. P0/P1/P2 backlog vanaf sprint 0

### P0

- Tenant A/B/Veele integration fixtures.
- Playwright host-first tests.
- DB/RLS en storage signed-url testbasis.
- Migration smoke workflow op lege database en staging-copy.
- Regio datamodel/UI/runtime afronden voordat het in planning als harde grens wordt gebruikt.
- Backoffice/API/portalen/jobs module enforcement harmoniseren.
- DB-defaults naar `DEFAULT_TENANT_ID` uit tenantdata verwijderen.
- Support break-glass TTL afdwingen.
- News scope beslissen.

### P1

- Post-migration hardening: unresolved rows rapporteren, constraints valideren en `tenant_id NOT NULL` waar schoon.
- Assignment media direct tenant-aware maken.
- Fysieke storage-backfill met copy-first, verify-second, switch-third, cleanup-last.
- Supabase Storage policy/RLS bewijs.
- Path guessing tests voor documenten, media, rapporten en attachments.
- `audit_log` typecontract tenant-aware maken waar tenant-audit bedoeld is.
- PDF/download audit logging uniform maken.
- Veele Portaal acceptance suite voor klantportaal en personeelsapp.

### P2

- Platform-admin onboarding wizard.
- Tenant first-run wizard.
- Usage dashboard per tenant met users, documenten, opdrachten, storage, downloads, actieve modules en support grants.
- Branding preview per tenant.
- Security dashboard uitbreiding.
- Module dependency visualisatie.
- Demo-data generator voor `demo-a`, `demo-b` en `veele`.
- Staging smoke dashboard voor host, login, modules, sectoren, regio's, storage, PDF, support, audit en migraties.
- Eerste externe tenant checklist.

## 8. Staging-promotiecontract

Elke sprint moet `docs/fieldgrid-staging-promotion-checklist.md` volgen.

Minimumregels:

- Docs/test-only sprints mogen direct na groene CI naar staging.
- Runtime sprints mogen naar staging na typecheck, build, relevante tests en handmatige smokecheck.
- Migratiesprints mogen naar staging na lege database smoke en staging-copy smoke.
- Storagebackfills zijn copy-first, verify-second, switch-third, cleanup-last.
- Als staging faalt, wordt alleen de betreffende sprint gerepareerd; geen reset.

## 9. Hard rules

- Nooit tenantdata lezen of schrijven op alleen technische id.
- Host/subdomain-context wint van tenant switcher.
- Geen runtime fallback naar `DEFAULT_TENANT_ID` in productie.
- Module uit betekent server-side uit.
- Sectorbeperking is een harde businessregel, geen UI-filter.
- Regiobeperking wordt tenant-scoped en server-side gevalideerd zodra sprint 2-4 live zijn.
- Veele is tenant; Fieldgrid is platform.
- Support access is expliciet, tijdelijk, tenant-scoped en geaudit.
- Nieuwe migraties moeten staging-data behouden en rollbackbaar zijn.
- Oude globale RBAC-tabellen mogen alleen templates/backfill zijn, niet runtime-autorisatie.
- Elke risicosprint krijgt cross-tenant tests voordat staging wordt gepromoveerd.
- Statische tests zijn guardrails, geen vervanging voor integration/DB/RLS/storage-tests.

## 10. Definition of Done voor de grote update

De grote update is klaar wanneer:

- Geen P0/P1 SaaS-hardening restpunt open staat.
- Alle canonstatussen `partial`, `runtime-proof-open` en `hardening-open` zijn gesloten of expliciet post-launch geaccepteerd.
- Runtime proof suite is groen.
- Migration smoke is groen op lege database en staging-copy.
- Storage proof is groen.
- Portal acceptance is groen.
- Regio-feature is overal multi-select, tenant-safe en bewezen.
- Platform onboarding, tenant first-run, usage, branding en staging smoke zijn productklaar.
- Staging bleef bereikbaar zonder drop/reset/rebuild.

# Fieldgrid data-classificatie canon

Datum: 2026-07-03  
Status: actuele stand na recovery, sprints 1 t/m 11, PR #149 en fase 0 canonrefresh.  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-next-major-update-plan.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-staging-promotion-checklist.md`, `docs/fieldgrid-recovery-execution-plan.md`.

## Doel

Dit document classificeert de databasegroepen en security-oppervlakken voor Fieldgrid als extern multi-tenant SaaS-platform.

De classificatie bepaalt per domein:

- welke tenantstrategie geldt;
- welk risico prioriteit heeft;
- of migratie of hardening nodig is;
- welke tests verplicht worden in volgende fases;
- welke roadmapfase eigenaar is van het restpunt.

Geen domein mag in vervolgwerk als `unknown` worden behandeld. Als een nieuw schema, nieuwe route, nieuwe storage-flow of nieuwe feature wordt toegevoegd, moet dit document in dezelfde PR worden bijgewerkt.

## Canonieke strategieen

| Strategie | Betekenis | Gebruik |
| --- | --- | --- |
| `direct_tenant_id` | De tabel heeft zelf een verplichte of bewust gevalideerde `tenant_id`. | Voorkeur voor tenantdata die direct gelezen, geschreven, geexporteerd, gedownload, betaald of geaudit wordt. |
| `parent_scoped` | Tenant loopt bewust via een verplichte parentrelatie. | Tijdelijk acceptabel voor technische child rows met sterke FK, parent-checks en tests. |
| `global_template` | Globale template of catalogus, geen runtime tenantdata. | Rollen, permissies, sectorcatalogus, modulecatalogus, plantemplates en toekomstige templates. |
| `platform_only` | Alleen Fieldgrid platform-admin/support gebruikt deze data. | Platform users, support grants, platform audit en platformbreed beheer. |
| `tenant_config` | Tenantinstelling, entitlement of policy. | Tenant domains, tenant sectors, sector settings, modules, plans, branding, SMTP en subscriptions. |
| `needs_migration` | Huidige vorm is onvoldoende voor het SaaS-doelmodel. | Gevoelige tabellen met nullable tenantkolom, legacy runtimepaden, open storagebewijs of open scopebesluit. |

## Prioriteiten

| Prioriteit | Betekenis |
| --- | --- |
| `P0` | Moet worden opgelost of hard bewezen voordat nieuwe risicovolle SaaS-runtimefuncties naar staging gaan. |
| `P1` | Moet worden opgelost voor externe SaaS-acceptatie en eerste externe tenant. |
| `P2` | Productisering, beheerbaarheid, operatie of polish na de harde securitygrenzen. |

## Actuele stand per 2026-07-03

De recovery is inhoudelijk voorbij: `main` is bron van waarheid, staging-data blijft behouden en de basis voor tenant resolver, tenant lifecycle, tenantrollen, modules/plans, platform-admin, support grants, sectoren, provisioning, finance/document/payment/audit tenant-awareness en meerdere storage/download guards bestaat.

De codebase is nog niet klaar voor externe SaaS-acceptatie. De grootste gaten zijn runtime-bewijs en post-migration hardening: veel tests zijn nog statisch, meerdere gevoelige tabellen hebben nullable `tenant_id`, storage is applicatie-hard maar nog niet volledig bewezen met fysieke backfill en policytests, en module enforcement moet tussen API, backoffice, portalen en jobs worden geharmoniseerd.

Deze fase 0 herclassificeert oude "ontbreekt"-items als:

- gebouwd en redelijk compleet;
- gebouwd maar bewijs ontbreekt;
- gebouwd maar hardening open;
- nog open productbesluit;
- nog niet gebouwd productisering.

## Classificatiematrix

| Domein | Tabellen of oppervlak | Huidige status | Doelstrategie | Risico | Migratie of werk | Vereiste tests | Roadmapfase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tenant core | `tenants` | Lifecycle-status, plan key en auditbasis bestaan. | `tenant_config` | P0 | Suspended/archived gedrag blijven bewijzen; provisioning/wizard productiseren. | `FG-LIFE-001` t/m `FG-LIFE-004`, Tenant A/B/Veele integration. | Fase 1/6/7 |
| Tenant users | `tenant_users` | Membership is tenant-scoped en inactive tenants worden uitgesloten. | `direct_tenant_id` | P0 | Geen basismigratie; integration bewijs nodig. | `FG-RBAC-*`, direct-ID denial. | Fase 1/2 |
| Tenant domains | `tenant_domains` | Host-first resolver gebruikt domeinen; platform/staginghosts zijn canoniek. | `tenant_config` | P0 | Custom-domain bewijs en platformbeheer verder productiseren. | `FG-HOST-001` t/m `FG-HOST-006`. | Fase 1/7 |
| Globale RBAC templates | `roles`, `permissions`, `role_permissions`, legacy global roles | Blijven template/backfill-bron; geen runtime-rechten. | `global_template` | P0 | Legacy runtimepaden opruimen zodra tests groen zijn. | `FG-RBAC-003`. | Fase 1/2 |
| Tenant RBAC runtime | `tenant_roles`, `tenant_role_permissions`, `tenant_user_roles` | Runtime-RBAC bestaat via tenantrollen. | `direct_tenant_id` | P0 | Product-permissiematrix en echte Tenant A/B roltests. | `FG-RBAC-001` t/m `FG-RBAC-005`. | Fase 1/2 |
| Platform users | `platform_users` | Platform-admin/support basis bestaat met status/rollen. | `platform_only` | P0 | CRUD, lifecycle-audit en security dashboard. | `FG-PLATFORM-001` t/m `FG-PLATFORM-003`. | Fase 5/6 |
| Support access | `support_access_grants`, `support_access_audit_log` | Grants, tenant scope, reden, revoke en audit bestaan. | `platform_only` + tenant-scoped support | P0 | Break-glass max TTL, priority proof en dashboard. | `FG-SUPPORT-001` t/m `FG-SUPPORT-006`, `FG-AUDIT-002`. | Fase 5 |
| Sectorcatalogus | `sectors` | Globale catalogus. | `global_template` | P0 | Beheer later via platform-admin. | Globale sector geeft geen runtime tenantrecht. | Fase 4/6 |
| Tenant sectors en policy | `tenant_sectors`, `tenant_sector_settings` | Tenant-sector membership en policy foundation bestaan. | `tenant_config` | P0 | Disable/backfill bewijs, single-sector/default acceptance en UI polish. | `FG-SECTOR-001` t/m `FG-SECTOR-006`. | Fase 1/2 |
| Customers | `customers`, notes, contacts | `customers.tenant_id` bestaat; children grotendeels parent-scoped. | `direct_tenant_id` + `parent_scoped` | P0 | Child rows opnieuw beoordelen bij exports/audit. | `FG-DATA-001`, sector tests. | Fase 1/2 |
| Customer users en klantportaal identity | `customer_users`, portal preferences | Tenant/customer/user scope bestaat; klantportaal is host-bound. | `direct_tenant_id` | P0 | Portal module guards, branding en Playwright bewijs. | `FG-PORTAL-C-001` t/m `FG-PORTAL-C-004`. | Fase 1/6 |
| Objects/locations | `objects`, object contacts/personnel | `objects.tenant_id` bestaat; children parent-scoped. | `direct_tenant_id` + `parent_scoped` | P0 | Direct-ID en sectorbewijs. | `FG-DATA-002`, sector tests. | Fase 1/2 |
| Personnel en personeelsapp identity | `personnel`, availability, qualifications, profile settings | `personnel.tenant_id` bestaat; personeelsapp is host-bound. | `direct_tenant_id` | P0 | App module guards, branding en media tests. | `FG-PORTAL-P-001` t/m `FG-PORTAL-P-004`. | Fase 1/6 |
| Assignments | `assignments` | `assignments.tenant_id` bestaat, maar DB-default naar `DEFAULT_TENANT_ID` moet weg. | `direct_tenant_id` | P0 | Default droppen, ontbrekende tenantId-writes laten falen, sectorconsistentie bewijzen. | `FG-DATA-003`, `FG-SECTOR-006`. | Fase 2 |
| Assignment technical children | `assignment_personnel`, `assignment_tasks`, `assignment_extra_work`, `assignment_material_usage`, `assignment_report_notes` | Parent-scoped via assignment. | `parent_scoped` tijdelijk acceptabel | P1 | Alleen migreren als child zelfstandig download/export/route krijgt. | Parent tenant check bij direct child route. | Fase 2/3 |
| Assignment media | `assignment_photos`, `assignment_report_note_attachments` | Downloadbaar materiaal blijft zonder directe `tenant_id`. Parent/path guards bestaan deels. | `needs_migration` naar `direct_tenant_id` | P1 | `tenant_id` toevoegen, backfill via assignment, tenant-prefix storage, signed URL helper. | `FG-STORAGE-003`, `FG-STORAGE-004`. | Fase 3 |
| Documents | `documents`, document bucket | Tenant-aware foundation bestaat; `tenant_id` kan nog nullable/backfill-afhankelijk zijn. | `direct_tenant_id` hardening | P1 | Unresolved rows rapporteren, constraints valideren, `tenant_id NOT NULL` waar schoon, storage bewijs. | `FG-DATA-004`, `FG-STORAGE-001`, `FG-STORAGE-002`, `FG-STORAGE-006`. | Fase 2/3 |
| Reports | `reports`, report PDFs | Tenant-aware foundation bestaat; nullable/hardening en downloadbewijs open. | `direct_tenant_id` hardening | P1 | Backfill/constraint validation, PDF/download audit. | `FG-DATA-005`, `FG-AUDIT-001`. | Fase 2/3 |
| Quotes | `quotes` | Tenant-aware foundation bestaat; nullable/hardening en PDFbewijs open. | `direct_tenant_id` hardening | P1 | Backfill/constraint validation, PDF/download audit. | `FG-DATA-006`, `FG-AUDIT-001`. | Fase 2 |
| Invoices | `invoices` | Tenant-aware foundation bestaat; nullable/hardening en paymentkoppeling open. | `direct_tenant_id` hardening | P1 | Backfill/constraint validation, invoice PDF audit. | `FG-DATA-007`, `FG-AUDIT-001`. | Fase 2 |
| Payments | `payments` | Tenant-aware foundation bestaat; webhook/status proof open. | `direct_tenant_id` hardening | P1 | Constraint validation, webhook tenantguard en direct-ID tests. | `FG-DATA-008`. | Fase 2 |
| Customer payment batches | `customer_payment_batches`, `customer_payment_batch_items` | Tenant-aware foundation bestaat; nullable/hardening open. | `direct_tenant_id` hardening | P1 | Constraint validation, batch-item consistency. | Batch direct-ID/payment tests, `FG-DATA-008`. | Fase 2 |
| Audit logging | `audit_log`, support audit | `audit_log.tenant_id` foundation bestaat maar kan bewust nullable zijn voor platform/global audit. | `direct_tenant_id` voor tenant-audit + `platform_only` voor platform-audit | P1/P0 | Typecontract aanscherpen, tenant-visible audit scheiden van platform/support audit. | `FG-DATA-009`, `FG-AUDIT-001` t/m `FG-AUDIT-005`. | Fase 2/5 |
| Domain events | `domain_events` | Tenant_id bestaat. | `direct_tenant_id` | P1 | Worker/consumer module- en tenantfilters bewijzen. | Worker integration, module tests. | Fase 4 |
| Notifications | notification settings, dispatch queue, attempts, push tokens | Runtime notificationdata is tenant-scoped; templates blijven globaal. | `direct_tenant_id` + `global_template` | P1 | Tenant override/audit later. | Tenant A ontvangt geen Tenant B dispatch. | Fase 4/6 |
| Tickets en messages | customer threads/entries, personnel tickets | Threads tenant/customer scoped; entries parent-scoped. | `direct_tenant_id` + `parent_scoped` | P1 | Direct-ID tests en portal module guards. | Thread/message cross-tenant denial. | Fase 1/6 |
| News | `news_posts`, `news_post_targets`, images | Scope is open: platform-only news of tenant-scoped news. | `needs_migration` of expliciet `platform_only` | P1 | Productbesluit, schema/runtime afhankelijk van keuze, visibility tests. | `FG-DATA-010`. | Fase 3 |
| Task codes | `task_codes`, tenant overrides/prices foundation | Tenant-aware foundation bestaat; pricing/snapshot bewijs productklaar maken. | `tenant_config` | P0/P1 | Historische prijssnapshots, sector economie en code uniqueness per tenant bewijzen. | Sector/task-code integration. | Fase 4/6 |
| Modules | `modules`, `tenant_modules`, `module_dependencies` | Foundation bestaat; API mapping breed, backoffice mapping kleiner, portalen/jobs bewijs open. | `tenant_config` | P0 | Enforcement harmoniseren, module dependency inspectie/visualisatie. | `FG-MODULE-001` t/m `FG-MODULE-008`. | Fase 4 |
| Plans en subscriptions | `plans`, `plan_modules`, `plan_limits`, `tenant_subscriptions` | Foundation bestaat; usage/billing/productbeheer incompleet. | `tenant_config` | P0/P2 | Platformbeheer, usage, handmatige billing en limieten later. | Plan module seed, custom roles Professional+. | Fase 4/6 |
| Organization settings | `organization_settings`, branding, SMTP | Tenant-aware; branding resolver/preview en defaults moeten productklaar. | `tenant_config` | P2 | Fieldgrid/Veele defaultscheiding, branding preview, package gating. | Tenantbranding lekt niet. | Fase 6 |
| Klantportaal runtime | host-bound customer routes, documents, invoices, tickets | Identity is host-first; module/branding/storage bewijs open. | runtime-hardening | P0/P1 | Portal module guards, branding en download audit. | `FG-PORTAL-C-001` t/m `FG-PORTAL-C-004`. | Fase 1/6 |
| Personeelsapp runtime | host-bound personnel routes, assignments, photos, tickets | Identity is host-first; module/branding/media bewijs open. | runtime-hardening | P0/P1 | App module guards, signed URL tests, branding. | `FG-PORTAL-P-001` t/m `FG-PORTAL-P-004`. | Fase 1/6 |
| Storage | documents, assignment photos, report attachments, avatars, news/org assets | Applicatieguards en tenant storage helpers bestaan; fysieke backfill/policybewijs open. | `needs_migration` naar tenant-prefixed storage | P0/P1 | Canon `tenant/{tenant_id}/...`, copy-first backfill, policy/RLS bewijs, path guessing tests. | `FG-STORAGE-001` t/m `FG-STORAGE-007`. | Fase 3 |
| Platform-admin product | platform routes, tenant detail, modules, plans, sectors, support, audit | Guard en MVP-basis bestaan; productwizard/dashboard open. | `platform_only` | P2 | Onboarding wizard, security dashboard, usage, dependency visualisatie. | `FG-PLATFORM-001` t/m `FG-PLATFORM-006`. | Fase 5/6 |
| Provisioning | tenant create service, owner invite, logs/status | Foundation en runstatus bestaan; onboarding wizard en full smoke open. | `tenant_config` + `platform_only` | P2 | Wizard, rollback/status, duplicate slug/domain acceptance. | Provisioning success/rollback tests. | Fase 6 |
| Deployment/ops | VPS, DNS, reverse proxy, backups, smoke | Domeinbesluiten zijn canon; staging smoke dashboard ontbreekt. | operationeel contract | P2 | Smoke dashboard, backup/restore, rollback, eerste externe tenant checklist. | `FG-MIG-*`, host/smoke tests. | Fase 7 |

## Directe tenant_id verplicht in hardeninggolven

Directe `tenant_id` wordt verplicht of bewust gedocumenteerd voor data die zelfstandig wordt gedownload, geexporteerd, betaald, geaudit of via directe route/id gelezen kan worden.

Golf 1 - hardening van bestaande foundation:

- `documents`
- `reports`
- `quotes`
- `invoices`
- `payments`
- `customer_payment_batches`
- `customer_payment_batch_items`
- tenant-audit in `audit_log`

Werk:

- unresolved rows rapporteren;
- backfill controleren;
- foreign keys/check constraints valideren;
- `tenant_id NOT NULL` zetten waar staging-copy schoon is;
- bewuste nullable uitzonderingen vastleggen.

Golf 2 - nog migreren:

- `assignment_photos`
- `assignment_report_note_attachments`
- legacy storage metadata/paden waar tenantcontext nu alleen uit path of parent wordt afgeleid

Golf 3 - productbesluit:

- `news_posts` en news images: platform-only of tenant-scoped.

`parent_scoped` blijft tijdelijk acceptabel voor technische child rows die nooit zelfstandig worden getoond, gedownload, betaald of geaudit en altijd via een verplicht parentrecord worden benaderd. Zodra een child row een eigen route, signed URL, export, webhook of auditregel krijgt, moet het domein opnieuw beoordeeld worden.

## Actuele harde volgorde vanaf fase 0

P0 eerst:

1. Canon en PR-contract actueel houden.
2. Tenant A/B/Veele integration fixtures bouwen.
3. Host-first Playwright tests toevoegen.
4. Migration smoke op lege database en staging-copy bouwen.
5. Module enforcement harmoniseren tussen API, backoffice, portalen en jobs.
6. DB-defaults naar `DEFAULT_TENANT_ID` verwijderen uit tenantdata.
7. Support break-glass max TTL afdwingen.
8. News scope beslissen.

P1 daarna:

1. Nullable tenantdata hardenen met validate constraints en `tenant_id NOT NULL` waar schoon.
2. Assignment media direct tenant-aware maken.
3. Storage tenant-prefix backfill uitvoeren en bewijzen.
4. Storage signed-url/path guessing tests automatiseren.
5. Audit tenant/platform contract aanscherpen.
6. PDF/download audit logging uniform maken.

P2 productisering:

1. Platform-admin onboarding wizard.
2. Tenant first-run wizard.
3. Usage dashboard inclusief documenten en storagegebruik.
4. Branding preview.
5. Security dashboard.
6. Module dependency visualisatie.
7. Demo-data generator.
8. Staging smoke dashboard.

## Testcontract

Elke PR moet expliciet verwijzen naar:

- de fase uit `docs/fieldgrid-next-major-update-plan.md`;
- de data-classificatie-items uit dit document;
- de test-id's uit `docs/fieldgrid-cross-tenant-testmatrix.md`;
- de stagingregels uit `docs/fieldgrid-staging-promotion-checklist.md`.

Minimum voor technische PR's:

- `P0` wijzigingen: static + unit/integration waar runtime geraakt wordt.
- Storage/download wijzigingen: integration + storage test, niet alleen static.
- Tenant/RBAC/support/module/sector wijzigingen: Tenant A/B/Veele integration bewijs.
- Migraties: lege database smoke en staging-copy smoke.
- Portaalwijzigingen: Playwright of vergelijkbare end-to-end host-bound test.

Statische tests blijven nuttige guardrails, maar zijn geen eindbewijs voor SaaS-isolatie.

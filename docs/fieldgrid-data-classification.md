# Fieldgrid data-classificatie canon

Datum: 2026-07-04
Status: sprint 13 tenant first-run wizard geleverd. Actuele uitvoeringsbron: `docs/fieldgrid-saas-proof-sprint-plan.md`.
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-next-major-update-plan.md`, `docs/fieldgrid-staging-promotion-checklist.md`, `docs/fieldgrid-recovery-execution-plan.md`.

## Doel

Dit document classificeert databasegroepen, routes, portalen, storagepaden en security-oppervlakken voor Fieldgrid als extern multi-tenant SaaS-platform.

Geen domein mag in vervolgwerk als `unknown` worden behandeld. Als een nieuw schema, nieuwe route, nieuwe storage-flow of nieuwe feature wordt toegevoegd, moet dit document in dezelfde PR worden bijgewerkt.

## Canonieke strategieen

| Strategie | Betekenis | Gebruik |
| --- | --- | --- |
| `direct_tenant_id` | De tabel heeft zelf een verplichte of bewust gevalideerde `tenant_id`. | Voorkeur voor tenantdata die direct gelezen, geschreven, geexporteerd, gedownload, betaald of geaudit wordt. |
| `parent_scoped` | Tenant loopt bewust via een verplichte parentrelatie. | Tijdelijk acceptabel voor technische child rows met sterke FK, parent-checks en tests. |
| `global_template` | Globale template of catalogus, geen runtime tenantdata. | Rollen, permissies, sectorcatalogus, modulecatalogus, plantemplates en toekomstige templates. |
| `platform_only` | Alleen Fieldgrid platform-admin/support gebruikt deze data. | Platform users, support grants, platform audit en platformbreed beheer. |
| `tenant_config` | Tenantinstelling, entitlement, policy of configuratie. | Tenant domains, tenant sectors, tenant regions, modules, plans, branding, SMTP en subscriptions. |
| `needs_migration` | Huidige vorm is onvoldoende voor het SaaS-doelmodel. | Gevoelige tabellen met nullable tenantkolom, legacy runtimepaden, open storagebewijs of open scopebesluit. |

## Canonieke statusvelden

| Status | Betekenis |
| --- | --- |
| `done` | Gebouwd, runtime actief en passend bewezen. |
| `partial` | Basis bestaat, maar productflow, dekking of randgevallen zijn incompleet. |
| `runtime-proof-open` | Runtime lijkt aanwezig, maar echte integration/Playwright/DB/RLS/storage-bewijzen ontbreken. |
| `hardening-open` | Schema/runtime is staging-veilig opgebouwd, maar backfill, constraint validation, `NOT NULL`, policybewijs of cleanup staat open. |
| `nice-to-have` | Waardevol voor product/operatie, maar niet vereist voor harde SaaS-isolatie. |

## Prioriteiten

| Prioriteit | Betekenis |
| --- | --- |
| `P0` | Moet worden opgelost of hard bewezen voordat nieuwe risicovolle SaaS-runtimefuncties naar staging gaan. |
| `P1` | Moet worden opgelost voor externe SaaS-acceptatie en eerste externe tenant. |
| `P2` | Productisering, beheerbaarheid, operatie of polish na de harde securitygrenzen. |

## Actuele stand

De recovery is voorbij: `main` is bron van waarheid, staging-data blijft behouden en de basis voor tenant resolver, tenant lifecycle, tenantrollen, modules/plans, platform-admin, support grants, sectoren, provisioning, finance/document/payment/audit tenant-awareness en meerdere storage/download guards bestaat.

De codebase is nog niet klaar voor externe SaaS-acceptatie. De grootste gaten zijn runtime-bewijs en post-migration hardening: veel tests zijn nog statisch, meerdere gevoelige tabellen hebben nullable `tenant_id`, storage is applicatie-hard maar nog niet volledig bewezen met fysieke backfill en policytests, module enforcement moet tussen API, backoffice, portalen en jobs worden geharmoniseerd, en regio's moeten van legacy vrije tekst naar tenant-config multiselect.

## Classificatiematrix

| Domein | Tabellen of oppervlak | Status | Doelstrategie | Risico | Werk | Vereiste tests | Sprint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tenant core | `tenants` | `runtime-proof-open` | `tenant_config` | P0 | Suspended/archived gedrag bewijzen; provisioning/wizard productiseren. | `FG-LIFE-*`, Tenant A/B/Veele integration. | 5/12/16 |
| Tenant users | `tenant_users` | `runtime-proof-open` | `direct_tenant_id` | P0 | Membership en inactive tenant gedrag integration testen. | `FG-RBAC-*`, direct-ID denial. | 1/5 |
| Tenant domains | `tenant_domains` | `runtime-proof-open` | `tenant_config` | P0 | Custom-domain bewijs en host-first Playwright. | `FG-HOST-*`. | 5/6 |
| Tenant regions | `tenant_regions`, `personnel_regions`, `object_regions`, `assignment_required_regions`, optioneel `customer_regions` | `partial` | `tenant_config` | P0 | Nieuw tenant-regio datamodel, backfill uit legacy velden, multiselect/autocomplete, planning overlap. | `FG-REGION-*`, `FG-HOST-*`, planning integration. | 2/3/4 |
| Globale RBAC templates | `roles`, `permissions`, `role_permissions` | `runtime-proof-open` | `global_template` | P0 | Bewijzen dat globale roles geen runtime-rechten geven. | `FG-RBAC-003`. | 5 |
| Tenant RBAC runtime | `tenant_roles`, `tenant_role_permissions`, `tenant_user_roles` | `runtime-proof-open` | `direct_tenant_id` | P0 | Echte Tenant A/B roltests. | `FG-RBAC-001` t/m `FG-RBAC-005`. | 5 |
| Platform users | `platform_users` | `runtime-proof-open` | `platform_only` | P0 | Inactive admin denial, tenant-user denial, platform audit. | `FG-PLATFORM-*`. | 10/12 |
| Support access | `support_access_grants`, `support_access_audit_log` | `partial` | `platform_only` + tenant-scoped support | P0 | Max TTL, break-glass reason, priority proof, securitydashboard. | `FG-SUPPORT-*`, `FG-AUDIT-002`. | 10 |
| Sectorcatalogus | `sectors` | `partial` | `global_template` | P0 | Platformbeheer later; geen runtime tenantrecht uit globale catalogus. | Sector global/template tests. | 5/14 |
| Tenant sectors en policy | `tenant_sectors`, `tenant_sector_settings` | `runtime-proof-open` | `tenant_config` | P0 | Disable/backfill/default/single-sector bewijs. | `FG-SECTOR-*`. | 5 |
| Customers | `customers`, notes, contacts | `runtime-proof-open` | `direct_tenant_id` + `parent_scoped` | P0 | Direct-ID, tenant default hardening, export/audit children beoordelen. | `FG-DATA-001`. | 5/8 |
| Customer users en klantportaal identity | `customer_users`, portal preferences | `runtime-proof-open` | `direct_tenant_id` | P0 | Portal module guards, branding, Playwright bewijs. | `FG-PORTAL-C-*`. | 6 |
| Objects/locations | `objects`, object contacts/personnel | `runtime-proof-open` | `direct_tenant_id` + `parent_scoped` | P0 | Direct-ID, sector en regio bewijs; object-regio multiselect. | `FG-DATA-002`, `FG-REGION-*`. | 2/3/4/5 |
| Personnel en personeelsapp identity | `personnel`, availability, qualifications, profile settings | `runtime-proof-open` | `direct_tenant_id` | P0 | Personnel-regio multiselect, portal module/media bewijs. | `FG-PORTAL-P-*`, `FG-REGION-*`. | 2/3/4/6 |
| Assignments | `assignments` | `hardening-open` | `direct_tenant_id` | P0 | `DEFAULT_TENANT_ID` defaults verwijderen; required regions normaliseren; sector/regio consistentie bewijzen. | `FG-DATA-003`, `FG-SECTOR-006`, `FG-REGION-*`. | 2/4/8 |
| Assignment technical children | `assignment_personnel`, `assignment_tasks`, `assignment_extra_work`, `assignment_material_usage`, `assignment_report_notes` | `partial` | `parent_scoped` tijdelijk acceptabel | P1 | Directe tenant_id alleen nodig als child zelfstandig route/download/export krijgt. | Parent tenant check bij direct child route. | 8/9 |
| Assignment media | `assignment_photos`, `assignment_report_note_attachments` | `hardening-open` | `needs_migration` naar `direct_tenant_id` | P1 | Direct tenant_id, backfill via assignment, tenant-prefix storage, signed URL helper. | `FG-STORAGE-003`, `FG-STORAGE-004`. | 9 |
| Documents | `documents`, document bucket | `hardening-open` | `direct_tenant_id` hardening | P1 | Unresolved rows, constraints, `tenant_id NOT NULL` waar schoon, storage bewijs. | `FG-DATA-004`, `FG-STORAGE-*`. | 8/9 |
| Reports | `reports`, report PDFs | `hardening-open` | `direct_tenant_id` hardening | P1 | Backfill/constraint validation, PDF/download audit. | `FG-DATA-005`, `FG-AUDIT-001`. | 8/10 |
| Quotes | `quotes` | `hardening-open` | `direct_tenant_id` hardening | P1 | Backfill/constraint validation, PDF audit. | `FG-DATA-006`, `FG-AUDIT-001`. | 8/10 |
| Invoices | `invoices` | `hardening-open` | `direct_tenant_id` hardening | P1 | Backfill/constraint validation, invoice PDF audit. | `FG-DATA-007`, `FG-AUDIT-001`. | 8/10 |
| Payments | `payments` | `hardening-open` | `direct_tenant_id` hardening | P1 | Constraint validation, webhook tenantguard, direct-ID tests. | `FG-DATA-008`. | 8 |
| Customer payment batches | `customer_payment_batches`, `customer_payment_batch_items` | `hardening-open` | `direct_tenant_id` hardening | P1 | Constraint validation, batch-item consistency. | Batch direct-ID/payment tests. | 8 |
| Audit logging | `audit_log`, support audit | `partial` | `direct_tenant_id` voor tenant-audit + `platform_only` voor platform-audit | P1/P0 | Typecontract aanscherpen, tenant/platform/support audit scheiden, denials centraliseren. | `FG-DATA-009`, `FG-AUDIT-*`. | 8/10 |
| Domain events | `domain_events`, realtime events | `runtime-proof-open` | `direct_tenant_id` | P1 | Worker/consumer module- en tenantfilters bewijzen. | Worker integration, portal live refresh tests. | 5/6/11 |
| Notifications | notification settings, dispatch queue, attempts, push tokens | `runtime-proof-open` | `direct_tenant_id` + `global_template` | P1 | Tenant override/audit later; portal acceptance bewijzen. | Tenant A ontvangt geen Tenant B dispatch. | 6/10 |
| Tickets en messages | customer threads/entries, personnel tickets | `runtime-proof-open` | `direct_tenant_id` + `parent_scoped` | P1 | Direct-ID tests en portal module guards. | Thread/message cross-tenant denial. | 6 |
| News | `news_posts`, `news_post_targets`, images | `partial` | `needs_migration` of expliciet `platform_only` | P1 | Productbesluit: platform-only of tenant-scoped. | `FG-DATA-010`. | 9 |
| Task codes | `task_codes`, tenant overrides/prices foundation | `runtime-proof-open` | `tenant_config` | P0/P1 | Historische prijssnapshots, sector/regio economie en uniqueness per tenant bewijzen. | Sector/task-code integration. | 5/11 |
| Modules | `modules`, `tenant_modules`, `module_dependencies` | `partial` | `tenant_config` | P0 | Enforcement harmoniseren, module dependency inspectie/visualisatie. | `FG-MODULE-*`. | 11 |
| Plans en subscriptions | `plans`, `plan_modules`, `plan_limits`, `tenant_subscriptions` | `partial` | `tenant_config` | P0/P2 | Platformbeheer, usage, handmatige billing. | Plan module seed, custom roles Professional+. | 11/14 |
| Organization settings | `organization_settings`, branding, SMTP | `runtime-proof-open` | `tenant_config` | P2 | First-run save/resume schrijft tenant-gescopeerd; branding preview, package gating en runtime proof open. | `FG-OPS-002`, tenantbranding lekt niet. | 13/14 |
| Klantportaal runtime | customer portal routes, documents, invoices, tickets | `runtime-proof-open` | runtime-hardening | P0/P1 | Module guards, branding, download audit, wrong-host tests. | `FG-PORTAL-C-*`. | 6 |
| Personeelsapp runtime | personnel portal routes, assignments, photos, tickets | `runtime-proof-open` | runtime-hardening | P0/P1 | App module guards, signed URL tests, planning live/minute acceptance. | `FG-PORTAL-P-*`. | 6/9 |
| Storage | documents, assignment photos, report attachments, avatars, news/org assets | `hardening-open` | `needs_migration` naar tenant-prefixed storage | P0/P1 | Canon `tenant/{tenant_id}/...`, copy-first backfill, policy/RLS bewijs, path guessing tests. | `FG-STORAGE-*`. | 9 |
| Platform-admin product | platform routes, tenant detail, modules, plans, sectors, regions, support, audit | `partial` | `platform_only` | P2 | Onboarding wizard, security dashboard, usage, dependency visualisatie. | `FG-PLATFORM-*`. | 10/12/14 |
| Provisioning en first-run | tenant create service, owner invite, logs/status, `tenant_first_run_state` | `runtime-proof-open` | `tenant_config` + `platform_only` | P2 | Platform wizard en tenant owner first-run bestaan; rollback/status en runtime proof blijven open. | `FG-OPS-001`, `FG-OPS-002`, provisioning success/rollback tests. | 12/13 |
| Deployment/ops | VPS, DNS, reverse proxy, backups, smoke | `partial` | operationeel contract | P2 | Smoke dashboard, backup/restore, rollback, eerste externe tenant checklist. | `FG-MIG-*`, host/smoke tests. | 15/16 |
| Materialen en inventaris | materials, inventory, assignment material usage, future inventory issue flows | `partial` | `direct_tenant_id` + `tenant_config` | P1/P2 | Onderzoek/canon bestaat; volledige modulebouw na SaaS proof of aparte roadmap. | Module/RBAC/storage/audit tests zodra gebouwd. | Post Sprint 16 of apart |

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

Golf 4 - regio-normalisatie:

- legacy `personnel.region`, `personnel.preferred_regions` en `assignments.required_region` backfillen naar tenant-regio join-tabellen;
- legacy velden pas opruimen wanneer UI/runtime/tests stabiel zijn.

## Testcontract

Elke PR moet expliciet verwijzen naar:

- de sprint uit `docs/fieldgrid-saas-proof-sprint-plan.md`;
- de data-classificatie-items uit dit document;
- de test-id's uit `docs/fieldgrid-cross-tenant-testmatrix.md`;
- de stagingregels uit `docs/fieldgrid-staging-promotion-checklist.md`.

Minimum voor technische PR's:

- `P0` wijzigingen: static + unit/integration waar runtime geraakt wordt.
- Storage/download wijzigingen: integration + storage test, niet alleen static.
- Tenant/RBAC/support/module/sector/regio wijzigingen: Tenant A/B/Veele integration bewijs.
- Migraties: lege database smoke en staging-copy smoke.
- Portaalwijzigingen: Playwright of vergelijkbare end-to-end host-bound test.

Statische tests blijven nuttige guardrails, maar zijn geen eindbewijs voor SaaS-isolatie.

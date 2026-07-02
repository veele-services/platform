# Fieldgrid data-classificatie canon

Datum: 2026-07-03  
Status: actuele stand na recovery, tenant lifecycle, module/plan foundation en storage-hardening t/m PR #125.  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-recovery-execution-plan.md`, `docs/tenant-query-audit-v1.md`, `docs/security-final-audit-v1.md`

## Doel

Dit document classificeert de databasegroepen en security-oppervlakken voor Fieldgrid als extern multi-tenant SaaS-platform.

De classificatie bepaalt per domein:

- welke tenantstrategie geldt;
- welk risico prioriteit heeft;
- of migratie nodig is;
- welke tests verplicht worden in volgende fases;
- welke roadmapfase eigenaar is van het restpunt.

Geen domein mag in vervolgwerk als `unknown` worden behandeld. Als een nieuw schema, nieuwe route, nieuwe storage-flow of nieuwe feature wordt toegevoegd, moet dit document in dezelfde PR worden bijgewerkt.

## Canonieke strategieen

| Strategie | Betekenis | Gebruik |
| --- | --- | --- |
| `direct_tenant_id` | De tabel heeft zelf een verplichte `tenant_id`. | Voorkeur voor tenantdata die direct gelezen, geschreven, geexporteerd, gedownload, betaald of geaudit wordt. |
| `parent_scoped` | Tenant loopt bewust via een verplichte parentrelatie. | Tijdelijk acceptabel voor technische child rows met sterke FK, parent-checks en tests. |
| `global_template` | Globale template of catalogus, geen runtime tenantdata. | Rollen, permissies, sectorcatalogus, modulecatalogus en toekomstige templates. |
| `platform_only` | Alleen Fieldgrid platform-admin/support gebruikt deze data. | Platform users, support grants, platform audit en platformbreed beheer. |
| `tenant_config` | Tenantinstelling, entitlement of policy. | Tenant domains, tenant sectors, modules, plans, branding, SMTP en subscriptions. |
| `needs_migration` | Huidige vorm is onvoldoende voor het SaaS-doelmodel. | Gevoelige tabellen zonder directe tenantkolom, legacy runtimepaden of storage zonder tenant-prefix. |

## Prioriteiten

| Prioriteit | Betekenis |
| --- | --- |
| `P0` | Moet worden opgelost of hard bewezen voordat nieuwe risicovolle SaaS-runtimefuncties naar staging gaan. |
| `P1` | Moet worden opgelost voor externe SaaS-acceptatie en eerste externe tenant. |
| `P2` | Productisering, beheerbaarheid, operatie of polish na de harde securitygrenzen. |

## Actuele stand per 2026-07-03

De recovery is inhoudelijk voorbij: `main` is bron van waarheid, staging-data blijft behouden en de basis voor tenant resolver, tenant lifecycle, tenantrollen, modules/plans, platform-admin, support grants, sectoren en meerdere storage/download guards bestaat.

De codebase is nog niet klaar voor externe SaaS-acceptatie. De grootste gaten zijn runtime-bewijs en data-normalisatie: modules zijn nog niet overal module-aware, support grants zijn nog niet overal in de permissieprioriteit verwerkt, gevoelige finance/document/report/media tabellen missen directe `tenant_id`, storage is nog niet platformbreed tenant-prefixed, en de meeste cross-tenant tests zijn nog statisch in plaats van integration, Playwright, DB/RLS of storage tests.

## Classificatiematrix

| Domein | Tabellen of oppervlak | Huidige status | Doelstrategie | Risico | Migratie of werk | Vereiste tests | Roadmapfase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tenant core | `tenants` | Heeft lifecycle-status, `plan_key`, timestamps en actieve tenantstatus. | `tenant_config` | P0 | Platform-admin lifecycle, provisioning audit en suspended-policy uitwerken. | Host-first active/suspended/archived, geen default fallback. | Fase 1/6/7 |
| Tenant users | `tenant_users` | Membership is tenant-scoped en inactive/suspended tenants worden uitgesloten. | `direct_tenant_id` | P0 | Geen basismigratie; integration bewijs ontbreekt. | Tenant A/B/Veele membership, direct-ID denial. | Fase 1/2 |
| Tenant domains | `tenant_domains` | Bestaat met domain, type, primary en verificatievelden. | `tenant_config` | P0 | Platform-admin domeinbeheer en custom-domain bewijs. | Platformhost, tenanthost, custom domain, onbekende host, switcher override. | Fase 1/6 |
| Globale RBAC templates | `roles`, `permissions`, `role_permissions`, legacy `user_roles` | Blijven template/backfill-bron; mogen geen runtime-rechten geven. | `global_template` | P0 | Legacy runtimepaden opruimen zodra tests groen zijn. | Globale role zonder tenantrol geeft geen toegang. | Fase 2 |
| Tenant RBAC runtime | `tenant_roles`, `tenant_role_permissions`, `tenant_user_roles` | Canonieke runtime-RBAC bestaat. | `direct_tenant_id` | P0 | Product-permissiematrix en Tenant A/B integration tests. | Zelfde user met verschillende rollen in Tenant A/B; custom roles Professional+. | Fase 2 |
| Platform users | `platform_users` | Technische platform-admin/support basis bestaat. | `platform_only` | P0 | Platform-admin CRUD, role/statusbeheer en audit. | Actieve admin werkt, gedeactiveerde admin faalt, tenant user faalt. | Fase 6 |
| Support access | `support_access_grants`, `support_access_audit_log` | Grants en audit bestaan met tenant scope, tijdvenster, reden en revoke. Runtimeprioriteit is nog niet overal bewezen. | `platform_only` + tenant-scoped support | P0 | Supportmodus, banner/TTL, auditcontext en guards integreren. | Geen grant faalt, actieve grant werkt, verlopen/verkeerde tenant faalt, audit verplicht. | Fase 3/6 |
| Sectorcatalogus | `sectors` | Globale catalogus. | `global_template` | P0 | Geen basismigratie; beheer later in platform-admin. | Globale sector geeft geen tenantdata of tenantrecht. | Fase 4/6 |
| Tenant sectors | `tenant_sectors` | Koppeling bestaat; enabled checks bestaan. Geen settings/default/single-sector policy. | `tenant_config` | P0 | `tenant_sector_settings`, default sector, max/mode en disable-blocking op bestaande data. | Geldige sector werkt, disabled/outside tenant faalt, single-sector default werkt. | Fase 4 |
| Customers | `customers`, notes, contacts | `customers.tenant_id` bestaat; child rows meestal parent-scoped. | `direct_tenant_id` + `parent_scoped` | P0 | Child rows opnieuw beoordelen bij gevoelige exports/audit. | Customer direct-ID cross-tenant faalt, sector outside tenant faalt. | Fase 4/5 |
| Customer users en klantportaal identity | `customer_users`, portal preferences | Tenant/customer/user scope bestaat; klantportaal is host-bound. | `direct_tenant_id` | P0 | Module-aware portal guards, branding en ambiguity tests. | Klant krijgt geen tenantkeuze; host Tenant A met Tenant B user faalt. | Fase 8 |
| Objects/locations | `objects`, object contacts/personnel | `objects.tenant_id` bestaat; children parent-scoped. | `direct_tenant_id` + `parent_scoped` | P0 | Geen basismigratie; sector/direct-ID bewijs nodig. | Object direct-ID cross-tenant faalt, sector mismatch faalt. | Fase 4/5 |
| Personnel en personeelsapp identity | `personnel`, availability, qualifications, profile settings | `personnel.tenant_id` bestaat; personeelsapp is host-bound. | `direct_tenant_id` | P0 | Module-aware app guards, branding en media tests. | Personeel ziet alleen eigen tenant en toegewezen data. | Fase 8 |
| Assignments | `assignments` | `assignments.tenant_id` bestaat. Sector loopt indirect via customer/object/task context. | `direct_tenant_id` | P0 | Expliciet sectorontwerp voor assignments. | Assignment direct-ID faalt; sector mismatch create/update faalt. | Fase 4/5 |
| Assignment technical children | `assignment_personnel`, `assignment_tasks`, `assignment_extra_work`, `assignment_material_usage`, `assignment_report_notes` | Geen eigen tenant_id; verplichte assignment FK. | `parent_scoped` tijdelijk acceptabel | P1 | Alleen migreren als directe child-routes/downloads blijven bestaan. | Child direct-ID route moet parent tenant checken. | Fase 5 |
| Assignment media | `assignment_photos`, `assignment_report_note_attachments` | Downloadbaar materiaal zonder directe tenant_id. Er zijn enkele unsafe-path en parent guards. | `needs_migration` naar `direct_tenant_id` | P1 | Backfill via assignment, canonical tenant-prefix storage, signed URL helper centraliseren. | Storage path guessing faalt; signed URL alleen na tenant/entity check. | Fase 5 |
| Documents | `documents`, document bucket | Geen directe tenant_id. Runtime heeft deels entity en tenant-prefix guards. | `needs_migration` naar `direct_tenant_id` | P1 | `documents.tenant_id`, backfill via entity, tenant-prefixed storagepad. | Upload/download/delete direct-ID en storage guessing cross-tenant faalt. | Fase 5 |
| Reports | `reports`, report PDFs | Geen directe tenant_id; parent-scoped via assignment. Extern/PDF/download gevoelig. | `needs_migration` naar `direct_tenant_id` | P1 | Backfill via assignment en PDF/download audit. | Report/PDF direct-ID cross-tenant faalt. | Fase 5 |
| Quotes | `quotes` | Geen directe tenant_id; financieel gevoelig. | `needs_migration` naar `direct_tenant_id` | P1 | Backfill via customer/assignment en PDF/download audit. | Quote/PDF direct-ID cross-tenant faalt. | Fase 5 |
| Invoices | `invoices` | Geen directe tenant_id; financieel en payment gekoppeld. Invoice PDF route is deels tenant/customer scoped en audited. | `needs_migration` naar `direct_tenant_id` | P1 | Backfill via customer/assignment en uniforme download audit. | Invoice/PDF/payment direct-ID cross-tenant faalt. | Fase 5 |
| Payments | `payments` | Geen directe tenant_id; loopt via invoice. | `needs_migration` naar `direct_tenant_id` | P1 | Backfill na invoice tenant_id, webhook tenantguard. | Webhook kan tenant niet overschrijven; payment view scoped. | Fase 5 |
| Customer payment batches | `customer_payment_batches`, `customer_payment_batch_items` | Geen directe tenant_id; loopt via customer/batch/invoice. | `needs_migration` naar `direct_tenant_id` | P1 | Backfill via customer en invoice. | Batch direct-ID/PDF/payment cross-tenant faalt. | Fase 5 |
| Audit logging | `audit_log` | Geen tenant_id; support audit heeft wel tenant scope. Sommige download metadata bevat tenant context. | `needs_migration` naar tenant/platform auditmodel | P1 | `audit_log.tenant_id` of splitsing tenant audit/platform audit. | Tenant-admin ziet alleen eigen audit; platform/support audit blijft platform-only. | Fase 5/6 |
| Domain events | `domain_events` | Tenant_id bestaat. | `direct_tenant_id` | P1 | Worker/consumer module- en tenantfilters bewijzen. | Worker verwerkt alleen tenantcontext; aggregate id alleen is onvoldoende. | Fase 5/9 |
| Notifications | notification settings, dispatch queue, attempts, push tokens | Meeste runtime notificationdata is tenant-scoped; event templates blijven globaal. | `direct_tenant_id` + `global_template` | P1 | Tenant overrides later. | Tenant A ontvangt geen Tenant B dispatch. | Fase 8/9 |
| Tickets en messages | customer threads/entries, personnel tickets | Threads tenant/customer scoped; entries parent-scoped. | `direct_tenant_id` + `parent_scoped` | P1 | Geen basismigratie; direct-ID tests ontbreken. | Thread/message direct-ID cross-tenant faalt. | Fase 5/8 |
| News | `news_posts`, `news_post_targets`, images | Nog niet duidelijk platform-only of tenant-news; storage kan tenantgevoelig zijn. | `needs_migration` of expliciet `platform_only` | P1 | Besluit: tenant-scoped news met tenant_id of platform-only news. | Tenant nieuws niet cross-tenant zichtbaar; image path scoped. | Fase 5/8 |
| Task codes huidig | `task_codes` | Heeft tenant_id, maar code uniqueness en pricing model zijn nog niet SaaS-productklaar. | `tenant_config` nu, later template/override | P0 | `tenant_task_codes`, `tenant_task_code_prices`, tenant/sector prijshistorie. | Task code sector outside tenant faalt; prijs snapshot historisch correct. | Fase 4 |
| Modules | `modules`, `tenant_modules`, `module_dependencies` | Foundation bestaat; backoffice deels module-aware. API, portalen en jobs missen nog volledige guards. | `tenant_config` | P0 | API module guards, portal module guards, job guards, platform-admin beheer. | Module uit via UI, directe URL, server action en API faalt. | Fase 3 |
| Plans en subscriptions | `plans`, `plan_modules`, `plan_limits`, `tenant_subscriptions` | Starter/Professional/Enterprise foundation bestaat; custom-role capability werkt. Platform-admin en billing ontbreken. | `tenant_config` | P0/P2 | Platform-admin plan/limit/subscription beheer, usage en handmatige billing. | Custom roles Professional+, plan modules seed, limietconfig zichtbaar. | Fase 3/6 |
| Organization settings | `organization_settings`, branding, SMTP | Tenant_id bestaat; bevat nog Veele-default teksten. | `tenant_config` | P2 | Fieldgrid platform defaults, tenantbranding, package-gated branding, secrets review. | Branding volgt tenant/plan; SMTP alleen eigen tenant. | Fase 8 |
| Klantportaal runtime | host-bound customer routes, documents, invoices, tickets | Identity is host-first; module/branding/sector/storage acceptance ontbreekt. | runtime-hardening | P0/P1 | Portal module guards, tenantbranding, download audit en storage tests. | Host-bound access; module-off denies; customer cannot guess other tenant data. | Fase 8 |
| Personeelsapp runtime | host-bound personnel routes, assignments, photos, tickets | Identity is host-first; module/branding/sector/storage acceptance ontbreekt. | runtime-hardening | P0/P1 | App module guards, tenantbranding, signed URL tests. | Personnel cannot read other tenant assignment/media. | Fase 8 |
| Storage | documents, assignment photos, report attachments, avatars, news/org assets | Meerdere runtime guards bestaan, maar tenant-prefix is nog niet platformbreed canon. | `needs_migration` naar tenant-prefixed storage | P0/P1 | Canon `tenant/{tenant_id}/...`, backfillplan, shared signed URL validator, storage tests. | Storage path guessing faalt; signed URLs valideren tenant/entity. | Fase 5 |
| Platform-admin product | platform routes, tenant detail, modules, plans, sectors, support, audit | Guard/shell bestaat; beheerschermen ontbreken grotendeels. | `platform_only` | P2 | CRUD, lifecycle, modules/plans, support grants, audit review, usage. | Tenant user faalt; active admin werkt; inactive admin faalt. | Fase 6 |
| Provisioning | tenant create service, owner invite, logs | Ontbreekt. | `needs_migration` + `tenant_config` | P2 | Transactionele provisioning, rollback, duplicate slug/domain checks. | Success, rollback, duplicate slug/domain, owner invite. | Fase 7 |
| Deployment/ops | VPS, DNS, reverse proxy, backups, smoke | Domeinbesluiten zijn canon; playbooks en smoke dashboards ontbreken. | operationeel contract | P2 | DNS/TLS/reverse proxy, backup/restore, monitoring, incident/rollback. | `platform.fieldgrid.nl`, `staging.fieldgrid.nl`, wildcard/custom domain smoke. | Fase 9/10 |

## Directe tenant_id verplicht in migratiegolven

Directe `tenant_id` wordt verplicht voor data die zelfstandig wordt gedownload, geexporteerd, betaald, geaudit of via directe route/id gelezen kan worden.

Golf 1:

- `documents`
- `assignment_photos`
- `assignment_report_note_attachments`
- storage metadata/paden waar tenantcontext nu alleen uit path of parent wordt afgeleid

Golf 2:

- `reports`
- `quotes`
- `invoices`
- PDF/download audit metadata voor deze domeinen

Golf 3:

- `payments`
- `customer_payment_batches`
- `customer_payment_batch_items`
- payment webhook/status flows

Golf 4:

- `audit_log` tenant-aware maken of splitsen in tenant audit en platform audit
- tenant-visible audit filters en platform-only support/platform audit filters

`parent_scoped` blijft tijdelijk acceptabel voor technische child rows die nooit zelfstandig worden getoond, gedownload, betaald of geaudit en altijd via een verplicht parentrecord worden benaderd. Zodra een child row een eigen route, signed URL, export, webhook of auditregel krijgt, moet het domein opnieuw beoordeeld worden.

## Actuele harde volgorde vanaf 2026-07-03

P0 eerst:

1. API module guards toevoegen.
2. Portal module guards toevoegen aan klantportaal en personeelsapp.
3. Dashboard/layout fallback naar `DEFAULT_TENANT_ID` verwijderen of fail-safe maken.
4. `tenant_sector_settings` toevoegen met mode, max, default sector en enforcement flag.
5. Sector disable-check laten blokkeren op bestaande data.
6. Support runtime-prioriteit expliciet integreren: platform-admin -> actieve support grant -> tenantrol.
7. Tenant A/B/Veele integration fixtures bouwen.
8. RBAC permissiematrix productmatig vastleggen en testen.

P1 daarna:

1. `documents.tenant_id` migreren met staging-safe backfill.
2. Finance/reporting tabellen tenant-aware maken: `invoices`, `quotes`, `reports`, `payments`, `customer_payment_batches`.
3. Assignment media tenant-aware maken.
4. Storage tenant-prefix canon en backfillplan uitvoeren.
5. Audit tenant/platform split of tenant_id migratie uitvoeren.
6. PDF/download audit logging uniform maken.
7. Task-code template/override en prijshistorie ontwerpen.

P2 productisering:

1. Platform-admin tenant detail, lifecycle, modules, plans, sectors, support en audit bouwen.
2. Provisioning en onboarding bouwen.
3. Branding resolver en package-gated branding bouwen.
4. Billing/usage en operationele playbooks bouwen.
5. Smoke dashboard en monitoring toevoegen.

## Testcontract

Elke PR moet expliciet verwijzen naar de test-id's uit `docs/fieldgrid-cross-tenant-testmatrix.md`.

Minimum voor technische PR's:

- `P0` wijzigingen: static + unit/integration waar runtime geraakt wordt.
- Storage/download wijzigingen: integration + storage test, niet alleen static.
- Tenant/RBAC/support/module/sector wijzigingen: Tenant A/B/Veele integration bewijs.
- Migraties: lege database smoke en staging-copy smoke.
- Portaalwijzigingen: Playwright of vergelijkbare end-to-end host-bound test.

Statische tests blijven nuttige guardrails, maar zijn geen eindbewijs voor SaaS-isolatie.
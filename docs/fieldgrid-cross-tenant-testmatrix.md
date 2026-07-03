# Fieldgrid cross-tenant testmatrix

Datum: 2026-07-03  
Status: verplichte acceptatiebasis na PR #149 en fase 0 canonrefresh.  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-next-major-update-plan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-staging-promotion-checklist.md`, `docs/fieldgrid-recovery-execution-plan.md`.

## Doel

Deze matrix beschrijft de vaste actoren, tenants, hosts en scenario's waarmee we bewijzen dat Fieldgrid veilig multi-tenant werkt.

Elke toekomstige PR voor tenant lifecycle, RBAC, support access, modules, sectoren, portalen, storage, finance, documenten, audit, provisioning of deployment moet in de PR-body verwijzen naar relevante test-id's uit dit document.

## Automatiseringsstatus per 2026-07-03

De huidige codebase heeft veel statische canon- en guardrail-tests. Dat is nuttig, maar niet genoeg voor SaaS-acceptatie.

Volgende automatiseringslaag:

- Tenant A/B/Veele integration fixtures voor membership, RBAC, modules, sectoren, direct-ID en support access.
- Playwright-tests voor host-first routing, tenant switcher override, klantportaal en personeelsapp.
- DB/RLS-tests voor tenantdata, support audit, platform-only tabellen en migrated sensitive tables.
- Storage-tests voor signed URLs, tenant-prefix paths en path guessing.
- Migratie-smoke op lege database en staging-copy.

Statische tests mogen alleen bewijzen dat canon of codepatronen bestaan. Runtime-isolatie moet met integration, Playwright, DB/RLS en storage tests worden bewezen.

## Teststatus per securitygrens

| Grens | Relevante test-id's | Huidige status | Nodig bewijs |
| --- | --- | --- | --- |
| Host-first tenant resolution | `FG-HOST-001` t/m `FG-HOST-006` | Static guard aanwezig; echte hosttests nog nodig. | Playwright + integration. |
| Tenant lifecycle | `FG-LIFE-001` t/m `FG-LIFE-004` | Runtime foundation aanwezig; suspended/archived bewijs uitbreiden. | Integration + DB/RLS waar mutaties geraakt worden. |
| Tenant RBAC | `FG-RBAC-001` t/m `FG-RBAC-005` | Tenantrollen bestaan; echte Tenant A/B roltests nog nodig. | Integration met dezelfde gebruiker in twee tenants. |
| Support access | `FG-SUPPORT-001` t/m `FG-SUPPORT-006` | Grants/audit bestaan; priority en TTL-flow nog bewijzen. | Integration + DB/RLS + Playwright waar support UI geraakt wordt. |
| Modules | `FG-MODULE-001` t/m `FG-MODULE-008` | Foundation bestaat; API/backoffice/portal/job harmonisatie open. | Unit + integration + Playwright + job integration. |
| Sectoren | `FG-SECTOR-001` t/m `FG-SECTOR-006` | Foundation en policy bestaan; disable/default/single-sector bewijs uitbreiden. | Integration + DB/RLS. |
| Direct-ID data | `FG-DATA-001` t/m `FG-DATA-010` | Static guards deels aanwezig; runtime bewijs nodig. | Integration + DB/RLS + storage waar downloadbaar. |
| Storage | `FG-STORAGE-001` t/m `FG-STORAGE-007` | Applicatieguards bestaan; fysieke backfill/policybewijs open. | Storage integration + migration smoke. |
| Klantportaal | `FG-PORTAL-C-001` t/m `FG-PORTAL-C-004` | Host-bound identity bestaat; module/branding/download bewijs open. | Playwright + integration + DB/RLS voor audit. |
| Personeelsapp | `FG-PORTAL-P-001` t/m `FG-PORTAL-P-004` | Host-bound identity bestaat; module/media bewijs open. | Playwright + integration + storage. |
| Audit | `FG-AUDIT-001` t/m `FG-AUDIT-005` | Support audit bestaat; tenant/platform auditcontract hardening open. | DB/RLS + integration + migration smoke. |
| Platform-admin | `FG-PLATFORM-001` t/m `FG-PLATFORM-006` | Guard en basis bestaan; productbeheer/security dashboard open. | Playwright + integration. |
| Migraties | `FG-MIG-001` t/m `FG-MIG-003` | Runner bestaat; workflow op lege DB en staging-copy formaliseren. | Migration smoke. |

## Vaste tenants

| Tenant | Slug | Doel |
| --- | --- | --- |
| Tenant Veele | `veele` | Gewone tenant. Geen platform-uitzondering. |
| Tenant A | `demo-a` | Primaire positieve testtenant. |
| Tenant B | `demo-b` | Cross-tenant denial tenant met vergelijkbare records. |

Deze set heet in vervolgwerk: Tenant A/B/Veele.

## Vaste hosts

| Host | Verwachte context |
| --- | --- |
| `platform.fieldgrid.nl` | Platform-admin productiehost. |
| `staging.fieldgrid.nl` | Staging platformhost. |
| `demo-a.fieldgrid.nl` | Tenant A host. |
| `demo-b.fieldgrid.nl` | Tenant B host. |
| `veele.fieldgrid.nl` | Veele tenant host. |
| `unknown.fieldgrid.nl` | Moet veilig falen. |

## Vaste actoren

| Actor-id | Actor | Minimale inrichting |
| --- | --- | --- |
| `PLAT-OWNER-ACTIVE` | Platform Owner actief | Actieve `platform_users` owner/admin. |
| `PLAT-ADMIN-INACTIVE` | Platform Admin gedeactiveerd | `platform_users.status != active`. |
| `SUPPORT-NO-GRANT` | Support User zonder grant | Actieve platform support user zonder tenantgrant. |
| `SUPPORT-A-GRANT` | Support User met actieve grant voor Tenant A | Actieve grant voor `demo-a`, binnen tijdvenster. |
| `SUPPORT-EXPIRED` | Support User met verlopen grant | Grant voor `demo-a`, maar `expires_at` in verleden of revoked. |
| `A-OWNER` | Tenant A owner | Active tenant user met owner/eigenaar tenantrol in `demo-a`. |
| `A-ADMIN` | Tenant A admin | Active tenant user met beheerrol in `demo-a`. |
| `A-PLANNER` | Tenant A planner | Active tenant user met planningrechten in `demo-a`. |
| `A-EMPLOYEE` | Tenant A employee | Active tenant user met beperkte operationele rol in `demo-a`. |
| `A-CUSTOMER` | Tenant A customer | `customer_users` record in `demo-a`. |
| `A-PERSONNEL` | Tenant A personnel | `personnel.user_id` record in `demo-a`. |
| `B-OWNER` | Tenant B owner | Active tenant user met owner/eigenaar tenantrol in `demo-b`. |
| `B-ADMIN` | Tenant B admin | Active tenant user met beheerrol in `demo-b`. |
| `B-PLANNER` | Tenant B planner | Active tenant user met planningrechten in `demo-b`. |
| `B-EMPLOYEE` | Tenant B employee | Active tenant user met beperkte operationele rol in `demo-b`. |
| `B-CUSTOMER` | Tenant B customer | `customer_users` record in `demo-b`. |
| `B-PERSONNEL` | Tenant B personnel | `personnel.user_id` record in `demo-b`. |
| `MULTI-A-B` | Multi-tenant backoffice user | Active tenant user in `demo-a` en `demo-b`, met verschillende tenantrollen. |

## Vaste testdata

Maak per tenant vergelijkbare records en noteer ids, slugs, document ids, invoice ids en storage paths.

| Tenant | Customer | Object | Assignment | Document | Report | Quote | Invoice | Payment | Storage path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `demo-a` | `A-Customer-01` | `A-Object-01` | `A-Assignment-01` | `A-Document-01` | `A-Report-01` | `A-Quote-01` | `A-Invoice-01` | `A-Payment-01` | `tenant/{demo-a-id}/...` |
| `demo-b` | `B-Customer-01` | `B-Object-01` | `B-Assignment-01` | `B-Document-01` | `B-Report-01` | `B-Quote-01` | `B-Invoice-01` | `B-Payment-01` | `tenant/{demo-b-id}/...` |
| `veele` | `V-Customer-01` | `V-Object-01` | `V-Assignment-01` | `V-Document-01` | `V-Report-01` | `V-Quote-01` | `V-Invoice-01` | `V-Payment-01` | `tenant/{veele-id}/...` |

## Testmatrix

| Test-id | Securitygrens | Actor | Host | Tenantcontext | Actie | Verwacht resultaat | Future testtype | Fase 0 status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `FG-HOST-001` | host-first tenant resolution | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | platform | Open platform dashboard. | Platformroute opent; geen tenant switcher nodig. | Playwright, integration | Playwright nodig. |
| `FG-HOST-002` | host-first tenant resolution | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Open backoffice dashboard. | Tenant A wordt uit host bepaald. | Playwright, unit | Playwright nodig. |
| `FG-HOST-003` | unknown host denial | `A-ADMIN` | `unknown.fieldgrid.nl` | none | Open backoffice route. | Veilige fout; geen fallback naar default tenant. | Playwright, unit | Playwright nodig. |
| `FG-HOST-004` | tenant switcher override | `MULTI-A-B` | `demo-a.fieldgrid.nl` | cookie probeert `demo-b` | Zet switcher/cookie op Tenant B. | Host wint; Tenant B data blijft onzichtbaar. | Playwright, integration | Integration nodig. |
| `FG-HOST-005` | default fallback denial | `A-ADMIN` | `demo-a.fieldgrid.nl` | invalid session tenant | Forceer ontbrekende tenantcookie. | Geen productie-fallback naar `DEFAULT_TENANT_ID`. | static, unit | Unit nodig. |
| `FG-HOST-006` | custom domain | `A-ADMIN` | custom Tenant A domain | `demo-a` | Open dashboard via custom domain. | Tenant A wordt uit `tenant_domains` bepaald. | Playwright, integration | Integration nodig. |
| `FG-LIFE-001` | active tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | active `demo-a` | Wijzig Tenant A customer. | Toegestaan. | integration | Integration nodig. |
| `FG-LIFE-002` | suspended tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | suspended `demo-a` | Probeer mutatie. | Geweigerd volgens suspended policy. | integration, DB/RLS | Integration nodig. |
| `FG-LIFE-003` | archived tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | archived `demo-a` | Probeer login/dashboard. | Geweigerd of read-only volgens policy. | integration | Integration nodig. |
| `FG-LIFE-004` | Veele gewone tenant | `A-ADMIN` | `veele.fieldgrid.nl` | `veele` | Open tenant dashboard. | Veele is gewone tenant. | Playwright, integration | Integration nodig. |
| `FG-RBAC-001` | tenant RBAC happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Lees/wijzig Tenant A customer. | Toegestaan op basis van tenantrol. | integration | Integration nodig. |
| `FG-RBAC-002` | tenant RBAC denial | `MULTI-A-B` | `demo-b.fieldgrid.nl` | `demo-b` | Voer Tenant A-only actie uit. | Geweigerd in Tenant B. | integration | Integration nodig. |
| `FG-RBAC-003` | globale roles geen runtime | `A-EMPLOYEE` | `demo-a.fieldgrid.nl` | `demo-a` | Alleen globale role, protected action. | Geweigerd. | static, integration | Static aanwezig; integration nodig. |
| `FG-RBAC-004` | custom roles plan gate | `A-OWNER` | `demo-a.fieldgrid.nl` | Starter tenant | Maak custom role. | Starter geweigerd; Professional+ toegestaan. | integration | Integration nodig. |
| `FG-RBAC-005` | tenantrol assignment | `A-OWNER` | `demo-a.fieldgrid.nl` | `demo-a` | Wijs tenantrol toe. | Alleen Tenant A rol verandert. | integration | Integration nodig. |
| `FG-SUPPORT-001` | support grant absent | `SUPPORT-NO-GRANT` | `platform.fieldgrid.nl` | `demo-a` support | Open Tenant A support entrypoint. | Geweigerd. | integration, Playwright | Integration nodig. |
| `FG-SUPPORT-002` | support grant active | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` support | Open binnen grantvenster. | Toegestaan en auditregel geschreven. | integration, DB/RLS | DB/RLS nodig. |
| `FG-SUPPORT-003` | support grant expired | `SUPPORT-EXPIRED` | `platform.fieldgrid.nl` | `demo-a` support | Open entrypoint. | Geweigerd. | integration | Integration nodig. |
| `FG-SUPPORT-004` | wrong tenant grant | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-b` support | Open Tenant B entrypoint. | Geweigerd. | integration | Integration nodig. |
| `FG-SUPPORT-005` | support audit | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` | Lees/download tenantdata. | Audit bevat support user, tenant, reden en grant. | DB/RLS, integration | DB/RLS nodig. |
| `FG-SUPPORT-006` | support priority | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` | Supportactie zonder tenantrol. | Grant werkt alleen via supportpad. | integration | Integration nodig. |
| `FG-MODULE-001` | module enabled happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | module enabled | Open module. | Toegestaan. | integration, Playwright | Integration nodig. |
| `FG-MODULE-002` | module disabled UI | `A-ADMIN` | `demo-a.fieldgrid.nl` | module disabled | Bekijk navigatie. | Module niet zichtbaar/disabled. | Playwright | Playwright nodig. |
| `FG-MODULE-003` | module disabled direct URL | `A-ADMIN` | `demo-a.fieldgrid.nl` | module disabled | Open directe route. | Server-side geweigerd. | Playwright, integration | Integration nodig. |
| `FG-MODULE-004` | module disabled server action | `A-ADMIN` | `demo-a.fieldgrid.nl` | module disabled | Roep server action aan. | Geweigerd door moduleguard. | integration | Integration nodig. |
| `FG-MODULE-005` | module disabled API | `A-ADMIN` | API host | module disabled | Roep API endpoint aan. | Geweigerd ondanks RBAC. | integration | Integration nodig. |
| `FG-MODULE-006` | module dependency | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A config | Schakel dependency uit. | Geweigerd of consequent opgelost. | unit, integration | Unit/integration nodig. |
| `FG-MODULE-007` | background job | worker | n/a | module disabled | Verwerk tenant job. | Job skip/faalt veilig. | integration | Integration nodig. |
| `FG-MODULE-008` | plan module seed | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | plans | Check plan modules. | Modules volgen plan + overrides. | DB/RLS, integration | DB/RLS nodig. |
| `FG-SECTOR-001` | sector happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | allowed sector | Maak record. | Toegestaan. | integration, DB/RLS | DB/RLS nodig. |
| `FG-SECTOR-002` | sector outside tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | Tenant B sector | Maak record. | Geweigerd. | integration, DB/RLS | DB/RLS nodig. |
| `FG-SECTOR-003` | disabled sector | `A-ADMIN` | `demo-a.fieldgrid.nl` | disabled sector | Maak/wijzig record. | Geweigerd. | integration, DB/RLS | DB/RLS nodig. |
| `FG-SECTOR-004` | disable sector with data | `A-OWNER` | `demo-a.fieldgrid.nl` | sector in gebruik | Disable sector. | Geweigerd totdat data schoon is. | integration, DB/RLS | Integration nodig. |
| `FG-SECTOR-005` | single-sector default | `A-ADMIN` | `demo-a.fieldgrid.nl` | single-sector | Maak record zonder sector. | Default gezet of faalt volgens policy. | unit, integration | Unit/integration nodig. |
| `FG-SECTOR-006` | assignment sector consistency | `A-PLANNER` | `demo-a.fieldgrid.nl` | mixed sectors | Maak assignment. | Geweigerd of expliciet toegestaan volgens policy. | integration | Integration nodig. |
| `FG-DATA-001` | customer direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A customer id. | 404/403. | integration | Integration nodig. |
| `FG-DATA-002` | object direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A object id. | 404/403. | integration | Integration nodig. |
| `FG-DATA-003` | assignment direct ID | `B-PLANNER` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A assignment id. | 404/403. | integration | Integration nodig. |
| `FG-DATA-004` | document direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Download Tenant A document. | 404/403 en geen signed URL. | integration, storage | Storage nodig. |
| `FG-DATA-005` | report direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A report/PDF. | 404/403 en audit waar nodig. | integration | Integration nodig. |
| `FG-DATA-006` | quote direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A quote/PDF. | 404/403. | integration | Integration nodig. |
| `FG-DATA-007` | invoice direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A invoice/PDF. | 404/403 en geen payment data. | integration | Integration nodig. |
| `FG-DATA-008` | payment direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open/update Tenant A payment. | 404/403; webhook tenantguard. | integration, DB/RLS | DB/RLS nodig. |
| `FG-DATA-009` | audit visibility | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Bekijk auditlog. | Alleen Tenant A audit. | DB/RLS, integration | DB/RLS nodig. |
| `FG-DATA-010` | news scope | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | `demo-a` | Open news feed. | Alleen gekozen platform/tenant scope zichtbaar. | integration | Productbesluit + integration nodig. |
| `FG-STORAGE-001` | tenant-prefix happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Download tenant-prefixed document. | Signed URL na tenant/entity check. | storage, integration | Storage nodig. |
| `FG-STORAGE-002` | path guessing | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Gebruik Tenant A path. | Geen signed URL/delete/update. | storage | Storage nodig. |
| `FG-STORAGE-003` | assignment photo URL | `B-CUSTOMER` | `demo-b.fieldgrid.nl` | `demo-b` | Vraag Tenant A photo URL. | Geweigerd. | storage, integration | Storage nodig. |
| `FG-STORAGE-004` | report attachment URL | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Vraag Tenant A attachment URL. | Geweigerd. | storage, integration | Storage nodig. |
| `FG-STORAGE-005` | avatar/org assets | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Raad Tenant A logo/avatar path. | Alleen publieke assets volgens policy. | storage | Storage nodig. |
| `FG-STORAGE-006` | delete guard | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Verwijder Tenant A document. | Geweigerd. | storage, integration | Storage nodig. |
| `FG-STORAGE-007` | storage migration smoke | migration runner | staging-copy | all tenants | Backfill storage paths. | Idempotent, geen dataverlies. | migration, storage | Migration smoke nodig. |
| `FG-PORTAL-C-001` | klantportaal host-bound | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | `demo-a` | Open klantportaal. | Alleen Tenant A context. | Playwright, integration | Playwright nodig. |
| `FG-PORTAL-C-002` | klantportaal wrong host | `A-CUSTOMER` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant B host. | Geweigerd. | Playwright, integration | Playwright nodig. |
| `FG-PORTAL-C-003` | klantportaal module off | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | module off | Open portal feature. | Geweigerd server-side. | Playwright, integration | Integration nodig. |
| `FG-PORTAL-C-004` | klantportaal invoice/PDF audit | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | `demo-a` | Download invoice PDF. | Eigen tenant/customer en audit. | integration, DB/RLS | DB/RLS nodig. |
| `FG-PORTAL-P-001` | personeelsapp host-bound | `A-PERSONNEL` | `demo-a.fieldgrid.nl` | `demo-a` | Open personeelsapp. | Alleen Tenant A context. | Playwright, integration | Playwright nodig. |
| `FG-PORTAL-P-002` | personeelsapp wrong host | `A-PERSONNEL` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant B host. | Geweigerd. | Playwright, integration | Playwright nodig. |
| `FG-PORTAL-P-003` | personeelsapp assignment media | `A-PERSONNEL` | `demo-a.fieldgrid.nl` | `demo-a` | Upload/download media. | Alleen toegestane opdracht/tenant. | storage, integration | Storage nodig. |
| `FG-PORTAL-P-004` | personeelsapp module off | `A-PERSONNEL` | `demo-a.fieldgrid.nl` | module off | Open modulefeature. | Geweigerd server-side. | Playwright, integration | Integration nodig. |
| `FG-AUDIT-001` | download audit | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Download document/invoice/report. | Audit bevat tenant, actor, entity, actie. | DB/RLS, integration | DB/RLS nodig. |
| `FG-AUDIT-002` | support audit | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` | Lees/download via support. | Audit bevat grant, reden en tenant. | DB/RLS, integration | DB/RLS nodig. |
| `FG-AUDIT-003` | platform audit | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | platform | Wijzig tenant plan/module/status. | Platform audit is platform-only. | DB/RLS, integration | DB/RLS nodig. |
| `FG-AUDIT-004` | tenant audit isolation | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Zoek Tenant A audit. | Niet zichtbaar. | DB/RLS, integration | DB/RLS nodig. |
| `FG-AUDIT-005` | audit migration smoke | migration runner | staging-copy | all tenants | Voeg tenant_id/split toe. | Backfill compleet; platform-only correct. | migration, DB/RLS | Migration smoke nodig. |
| `FG-PLATFORM-001` | active platform admin | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | platform | Open tenant list. | Toegestaan. | Playwright, integration | Integration nodig. |
| `FG-PLATFORM-002` | inactive platform admin | `PLAT-ADMIN-INACTIVE` | `platform.fieldgrid.nl` | platform | Open platform route. | Geweigerd. | Playwright, integration | Integration nodig. |
| `FG-PLATFORM-003` | tenant user platform denial | `A-ADMIN` | `platform.fieldgrid.nl` | platform | Open platform route. | Geweigerd. | Playwright, integration | Integration nodig. |
| `FG-PLATFORM-004` | lifecycle action | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A | Suspend/reactivate. | Transactioneel en geaudit. | integration | Integration nodig. |
| `FG-PLATFORM-005` | plan/module beheer | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A | Wijzig plan/modules. | Entitlements runtime afgedwongen. | integration | Integration nodig. |
| `FG-PLATFORM-006` | support grant beheer | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A | Maak/revoke grant. | Status klopt en audit bestaat. | integration, DB/RLS | DB/RLS nodig. |
| `FG-MIG-001` | lege database smoke | migration runner | local/CI | empty DB | Draai alle migraties. | Migrations slagen idempotent. | migration | Workflow nodig. |
| `FG-MIG-002` | staging-copy smoke | migration runner | staging-copy | existing data | Draai migraties. | Geen destructieve reset; backfills slagen. | migration | Workflow nodig. |
| `FG-MIG-003` | compatibility skip | migration runner | staging-copy | legacy migrations | Draai runner met legacy SQL. | Correct skipped/toegepast zonder duplicate failure. | migration | Workflow nodig. |

## Minimum green before staging

Een PR mag pas naar staging-promotie als de relevante minimum set groen is.

Altijd:

- `FG-MIG-001`
- `FG-MIG-002` voor elke migratie-PR
- `FG-HOST-001` t/m `FG-HOST-005`
- `FG-LIFE-001` en denial voor suspended/archived als lifecycle geraakt wordt
- `FG-RBAC-001` t/m `FG-RBAC-004` als auth/RBAC geraakt wordt

Voor modulewerk:

- `FG-MODULE-001` t/m `FG-MODULE-005`
- `FG-MODULE-007` als jobs/workers geraakt worden

Voor sectorwerk:

- `FG-SECTOR-001` t/m `FG-SECTOR-006`

Voor support/platformwerk:

- `FG-SUPPORT-001` t/m `FG-SUPPORT-006`
- `FG-PLATFORM-001` t/m `FG-PLATFORM-006` waar geraakt
- `FG-AUDIT-002` en `FG-AUDIT-003`

Voor gevoelige data, storage, finance en downloads:

- `FG-DATA-001` t/m `FG-DATA-010` voor geraakte domeinen
- `FG-STORAGE-001` t/m `FG-STORAGE-007` voor storage/downloads
- `FG-AUDIT-001`, `FG-AUDIT-004` en waar nodig `FG-AUDIT-005`

Voor portalen:

- `FG-PORTAL-C-001` t/m `FG-PORTAL-C-004` voor klantportaal
- `FG-PORTAL-P-001` t/m `FG-PORTAL-P-004` voor personeelsapp

Statische tests alleen tellen nooit als minimum green voor een runtime securitygrens; er moet minimaal een unit/integration/Playwright/DB/RLS/storage test bij waar de grens runtime raakt.

Gebruik daarnaast altijd `docs/fieldgrid-staging-promotion-checklist.md` voor de fasegebonden stagingregels.

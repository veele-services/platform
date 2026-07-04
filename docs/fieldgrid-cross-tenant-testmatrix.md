# Fieldgrid cross-tenant testmatrix

Datum: 2026-07-04
Status: sprint 15 staging smoke dashboard geleverd met open runtimebewijs; sprint 0 canon refresh 2.0 blijft de basis. Verplichte acceptatiebasis voor `docs/fieldgrid-saas-proof-sprint-plan.md`.
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-next-major-update-plan.md`, `docs/fieldgrid-staging-promotion-checklist.md`, `docs/fieldgrid-recovery-execution-plan.md`.

## Doel

Deze matrix beschrijft de vaste actoren, tenants, hosts en scenario's waarmee we bewijzen dat Fieldgrid veilig multi-tenant werkt.

Elke toekomstige PR voor tenant lifecycle, RBAC, support access, modules, sectoren, regio's, portalen, storage, finance, documenten, audit, provisioning of deployment moet in de PR-body verwijzen naar relevante test-id's uit dit document.

## Automatiseringsstatus

De huidige codebase heeft veel statische canon- en guardrail-tests. Dat is nuttig, maar niet genoeg voor SaaS-acceptatie.

Volgende automatiseringslaag:

- Tenant A/B/Veele integration fixtures voor membership, RBAC, modules, sectoren, regio's, direct-ID en support access.
- Playwright-tests voor host-first routing, tenant switcher override, klantportaal en personeelsapp.
- DB/RLS-tests voor tenantdata, support audit, platform-only tabellen en migrated sensitive tables.
- Storage-tests voor signed URLs, tenant-prefix paths en path guessing.
- Migratie-smoke op lege database en staging-copy.

Statische tests mogen alleen bewijzen dat canon of codepatronen bestaan. Runtime-isolatie moet met integration, Playwright, DB/RLS en storage tests worden bewezen.

## Canonieke statusvelden voor testdekking

| Status | Betekenis |
| --- | --- |
| `done` | Test bestaat en bewijst de runtimegrens voldoende. |
| `partial` | Er is dekking, maar niet voor alle actoren/hosts/denials. |
| `runtime-proof-open` | Guard/static of runtimebasis bestaat, maar echte runtime-test ontbreekt. |
| `hardening-open` | Test wacht op migratie, backfill, storage policy of constraint validation. |
| `nice-to-have` | Test is nuttig voor product/operatie, maar geen P0/P1 securitygate. |

## Teststatus per securitygrens

| Grens | Relevante test-id's | Huidige status | Nodig bewijs | Sprint |
| --- | --- | --- | --- | --- |
| Host-first tenant resolution | `FG-HOST-001` t/m `FG-HOST-006` | `runtime-proof-open` | Playwright + integration. | 5/6 |
| Tenant lifecycle | `FG-LIFE-001` t/m `FG-LIFE-004` | `runtime-proof-open` | Integration + DB/RLS waar mutaties geraakt worden. | 5 |
| Tenant RBAC | `FG-RBAC-001` t/m `FG-RBAC-005` | `runtime-proof-open` | Integration met dezelfde gebruiker in twee tenants. | 5 |
| Support access | `FG-SUPPORT-001` t/m `FG-SUPPORT-006` | `partial` | Integration + DB/RLS + Playwright waar support UI geraakt wordt. | 10 |
| Modules | `FG-MODULE-001` t/m `FG-MODULE-008` | `partial` | Unit + integration + Playwright + job integration. | 11 |
| Sectoren | `FG-SECTOR-001` t/m `FG-SECTOR-006` | `runtime-proof-open` | Integration + DB/RLS. | 5 |
| Regio's | `FG-REGION-001` t/m `FG-REGION-008` | `partial` | Migration + integration + Playwright. | 2/3/4 |
| Direct-ID data | `FG-DATA-001` t/m `FG-DATA-010` | `runtime-proof-open` | Integration + DB/RLS + storage waar downloadbaar. | 5/8/9 |
| Storage | `FG-STORAGE-001` t/m `FG-STORAGE-007` | `hardening-open` | Storage integration + migration smoke. | 9 |
| Klantportaal | `FG-PORTAL-C-001` t/m `FG-PORTAL-C-004` | `runtime-proof-open` | Playwright + integration + DB/RLS voor audit. | 6 |
| Personeelsapp | `FG-PORTAL-P-001` t/m `FG-PORTAL-P-005` | `runtime-proof-open` | Playwright + integration + storage + planning live refresh acceptance. | 6/9 |
| Audit | `FG-AUDIT-001` t/m `FG-AUDIT-005` | `partial` | DB/RLS + integration + migration smoke. | 8/10 |
| Platform-admin | `FG-PLATFORM-001` t/m `FG-PLATFORM-006` | `runtime-proof-open` | Playwright + integration. | 10/12 |
| Migraties | `FG-MIG-001` t/m `FG-MIG-003` | `partial` | Lege DB en staging-copy smoke. | 7 |
| Onboarding/first-run/usage/smoke | `FG-OPS-001` t/m `FG-OPS-008` | `partial` | Playwright + integration + read-only/mutating smoke met cleanup. | 12/13/14/15 |

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

Maak per tenant vergelijkbare records en noteer ids, slugs, document ids, invoice ids, storage paths en regio ids.

| Tenant | Customer | Object | Assignment | Personnel | Region | Document | Invoice | Storage path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `demo-a` | `A-Customer-01` | `A-Object-01` | `A-Assignment-01` | `A-Personnel-01` | `A-Region-01` | `A-Document-01` | `A-Invoice-01` | `tenant/{demo-a-id}/...` |
| `demo-b` | `B-Customer-01` | `B-Object-01` | `B-Assignment-01` | `B-Personnel-01` | `B-Region-01` | `B-Document-01` | `B-Invoice-01` | `tenant/{demo-b-id}/...` |
| `veele` | `V-Customer-01` | `V-Object-01` | `V-Assignment-01` | `V-Personnel-01` | `V-Region-01` | `V-Document-01` | `V-Invoice-01` | `tenant/{veele-id}/...` |

## Testmatrix

| Test-id | Securitygrens | Actor | Host | Tenantcontext | Actie | Verwacht resultaat | Testtype | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `FG-HOST-001` | host-first tenant resolution | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | platform | Open platform dashboard. | Platformroute opent; geen tenant switcher nodig. | Playwright, integration | `runtime-proof-open` |
| `FG-HOST-002` | host-first tenant resolution | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Open backoffice dashboard. | Tenant A wordt uit host bepaald. | Playwright, unit | `runtime-proof-open` |
| `FG-HOST-003` | unknown host denial | `A-ADMIN` | `unknown.fieldgrid.nl` | none | Open backoffice route. | Veilige fout; geen fallback naar default tenant. | Playwright, unit | `runtime-proof-open` |
| `FG-HOST-004` | tenant switcher override | `MULTI-A-B` | `demo-a.fieldgrid.nl` | cookie probeert `demo-b` | Zet switcher/cookie op Tenant B. | Host wint; Tenant B data blijft onzichtbaar. | Playwright, integration | `runtime-proof-open` |
| `FG-HOST-005` | default fallback denial | `A-ADMIN` | `demo-a.fieldgrid.nl` | invalid session tenant | Forceer ontbrekende tenantcookie. | Geen productie-fallback naar `DEFAULT_TENANT_ID`. | unit | `runtime-proof-open` |
| `FG-HOST-006` | custom domain | `A-ADMIN` | custom Tenant A domain | `demo-a` | Open dashboard via custom domain. | Tenant A wordt uit `tenant_domains` bepaald. | Playwright, integration | `runtime-proof-open` |
| `FG-LIFE-001` | active tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | active `demo-a` | Wijzig Tenant A customer. | Toegestaan. | integration | `runtime-proof-open` |
| `FG-LIFE-002` | suspended tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | suspended `demo-a` | Probeer mutatie. | Geweigerd volgens suspended policy. | integration, DB/RLS | `runtime-proof-open` |
| `FG-LIFE-003` | archived tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | archived `demo-a` | Probeer login/dashboard. | Geweigerd of read-only volgens policy. | integration | `runtime-proof-open` |
| `FG-LIFE-004` | Veele gewone tenant | `A-ADMIN` | `veele.fieldgrid.nl` | `veele` | Open tenant dashboard. | Veele is gewone tenant. | Playwright, integration | `runtime-proof-open` |
| `FG-RBAC-001` | tenant RBAC happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Lees/wijzig Tenant A customer. | Toegestaan op basis van tenantrol. | integration | `runtime-proof-open` |
| `FG-RBAC-002` | tenant RBAC denial | `MULTI-A-B` | `demo-b.fieldgrid.nl` | `demo-b` | Voer Tenant A-only actie uit. | Geweigerd in Tenant B. | integration | `runtime-proof-open` |
| `FG-RBAC-003` | globale roles geen runtime | `A-EMPLOYEE` | `demo-a.fieldgrid.nl` | `demo-a` | Alleen globale role, protected action. | Geweigerd. | static, integration | `runtime-proof-open` |
| `FG-RBAC-004` | custom roles plan gate | `A-OWNER` | `demo-a.fieldgrid.nl` | Starter tenant | Maak custom role. | Starter geweigerd; Professional+ toegestaan. | integration | `runtime-proof-open` |
| `FG-RBAC-005` | tenantrol assignment | `A-OWNER` | `demo-a.fieldgrid.nl` | `demo-a` | Wijs tenantrol toe. | Alleen Tenant A rol verandert. | integration | `runtime-proof-open` |
| `FG-SUPPORT-001` | support grant absent | `SUPPORT-NO-GRANT` | `platform.fieldgrid.nl` | `demo-a` support | Open Tenant A support entrypoint. | Geweigerd. | integration, Playwright | `partial` |
| `FG-SUPPORT-002` | support grant active | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` support | Open binnen grantvenster. | Toegestaan en auditregel geschreven. | integration, DB/RLS | `partial` |
| `FG-SUPPORT-003` | support grant expired | `SUPPORT-EXPIRED` | `platform.fieldgrid.nl` | `demo-a` support | Open entrypoint. | Geweigerd. | integration | `partial` |
| `FG-SUPPORT-004` | wrong tenant grant | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-b` support | Open Tenant B entrypoint. | Geweigerd. | integration | `partial` |
| `FG-SUPPORT-005` | support audit | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` | Lees/download tenantdata. | Audit bevat support user, tenant, reden en grant. | DB/RLS, integration | `partial` |
| `FG-SUPPORT-006` | support priority | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` | Supportactie zonder tenantrol. | Grant werkt alleen via supportpad. | integration | `partial` |
| `FG-MODULE-001` | module enabled happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | module enabled | Open module. | Toegestaan. | integration, Playwright | `partial` |
| `FG-MODULE-002` | module disabled UI | `A-ADMIN` | `demo-a.fieldgrid.nl` | module disabled | Bekijk navigatie. | Module niet zichtbaar/disabled. | Playwright | `partial` |
| `FG-MODULE-003` | module disabled direct URL | `A-ADMIN` | `demo-a.fieldgrid.nl` | module disabled | Open directe route. | Server-side geweigerd. | Playwright, integration | `partial` |
| `FG-MODULE-004` | module disabled server action | `A-ADMIN` | `demo-a.fieldgrid.nl` | module disabled | Roep server action aan. | Geweigerd door moduleguard. | integration | `partial` |
| `FG-MODULE-005` | module disabled API | `A-ADMIN` | API host | module disabled | Roep API endpoint aan. | Geweigerd ondanks RBAC. | integration | `partial` |
| `FG-MODULE-006` | module dependency | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A config | Schakel dependency uit. | Geweigerd of consequent opgelost. | unit, integration | `partial` |
| `FG-MODULE-007` | background job | worker | n/a | module disabled | Verwerk tenant job. | Job skip/faalt veilig. | integration | `partial` |
| `FG-MODULE-008` | plan module seed | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | plans | Check plan modules. | Modules volgen plan + overrides. | DB/RLS, integration | `partial` |
| `FG-SECTOR-001` | sector happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | allowed sector | Maak record. | Toegestaan. | integration, DB/RLS | `runtime-proof-open` |
| `FG-SECTOR-002` | sector outside tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | Tenant B sector | Maak record. | Geweigerd. | integration, DB/RLS | `runtime-proof-open` |
| `FG-SECTOR-003` | disabled sector | `A-ADMIN` | `demo-a.fieldgrid.nl` | disabled sector | Maak/wijzig record. | Geweigerd. | integration, DB/RLS | `runtime-proof-open` |
| `FG-SECTOR-004` | disable sector with data | `A-OWNER` | `demo-a.fieldgrid.nl` | sector in gebruik | Disable sector. | Geweigerd totdat data schoon is. | integration, DB/RLS | `runtime-proof-open` |
| `FG-SECTOR-005` | single-sector default | `A-ADMIN` | `demo-a.fieldgrid.nl` | single-sector | Maak record zonder sector. | Default gezet of faalt volgens policy. | unit, integration | `runtime-proof-open` |
| `FG-SECTOR-006` | assignment sector consistency | `A-PLANNER` | `demo-a.fieldgrid.nl` | mixed sectors | Maak assignment. | Geweigerd of expliciet toegestaan volgens policy. | integration | `runtime-proof-open` |
| `FG-REGION-001` | regio tenant-config happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Maak tenant-regio en selecteer bij personeel/object/opdracht. | Regio is tenant-scoped opgeslagen. | migration, integration | `partial` |
| `FG-REGION-002` | regio cross-tenant denial | `A-ADMIN` | `demo-a.fieldgrid.nl` | Tenant B regio-id | Koppel Tenant B regio aan Tenant A record. | Geweigerd server-side. | integration, DB/RLS | `partial` |
| `FG-REGION-003` | regio multiselect | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Selecteer meerdere regio's bij personeel/object/opdracht. | Alle gekozen tenant-regio's blijven bewaard. | Playwright, integration | `partial` |
| `FG-REGION-004` | regio autocomplete | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Typ bestaande regio in dropdown. | Bestaande tenant-regio verschijnt; geen Tenant B regio zichtbaar. | Playwright | `partial` |
| `FG-REGION-005` | regio create-on-type | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Typ nieuwe regio en sla op. | Nieuwe tenant-regio wordt herbruikbaar. | Playwright, integration | `partial` |
| `FG-REGION-006` | planning overlap happy path | `A-PLANNER` | `demo-a.fieldgrid.nl` | passende regio | Plan personeel op opdracht. | Toegestaan bij minimaal een regio-overlap. | integration | `partial` |
| `FG-REGION-007` | planning overlap denial | `A-PLANNER` | `demo-a.fieldgrid.nl` | geen overlap | Plan personeel op opdracht. | Geweigerd of niet aanbevolen volgens planningbeleid. | integration | `partial` |
| `FG-REGION-008` | legacy backfill | migration runner | staging-copy | legacy region fields | Backfill legacy `region`/`preferred_regions`/`required_region`. | Idempotent, geen dataverlies. | migration | `partial` |
| `FG-DATA-001` | customer direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A customer id. | 404/403. | integration | `runtime-proof-open` |
| `FG-DATA-002` | object direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A object id. | 404/403. | integration | `runtime-proof-open` |
| `FG-DATA-003` | assignment direct ID | `B-PLANNER` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A assignment id. | 404/403. | integration | `runtime-proof-open` |
| `FG-DATA-004` | document direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Download Tenant A document. | 404/403 en geen signed URL. | integration, storage | `hardening-open` |
| `FG-DATA-005` | report direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A report/PDF. | 404/403 en audit waar nodig. | integration | `hardening-open` |
| `FG-DATA-006` | quote direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A quote/PDF. | 404/403. | integration | `hardening-open` |
| `FG-DATA-007` | invoice direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A invoice/PDF. | 404/403 en geen payment data. | integration | `hardening-open` |
| `FG-DATA-008` | payment direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open/update Tenant A payment. | 404/403; webhook tenantguard. | integration, DB/RLS | `hardening-open` |
| `FG-DATA-009` | audit visibility | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Bekijk auditlog. | Alleen Tenant A audit. | DB/RLS, integration | `partial` |
| `FG-DATA-010` | news scope | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | `demo-a` | Open news feed. | Alleen gekozen platform/tenant scope zichtbaar. | integration | `partial` |
| `FG-STORAGE-001` | tenant-prefix happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Download tenant-prefixed document. | Signed URL na tenant/entity check. | storage, integration | `hardening-open` |
| `FG-STORAGE-002` | path guessing | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Gebruik Tenant A path. | Geen signed URL/delete/update. | storage | `hardening-open` |
| `FG-STORAGE-003` | assignment photo URL | `B-CUSTOMER` | `demo-b.fieldgrid.nl` | `demo-b` | Vraag Tenant A photo URL. | Geweigerd. | storage, integration | `hardening-open` |
| `FG-STORAGE-004` | report attachment URL | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Vraag Tenant A attachment URL. | Geweigerd. | storage, integration | `hardening-open` |
| `FG-STORAGE-005` | avatar/org assets | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Raad Tenant A logo/avatar path. | Alleen publieke assets volgens policy. | storage | `hardening-open` |
| `FG-STORAGE-006` | delete guard | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Verwijder Tenant A document. | Geweigerd. | storage, integration | `hardening-open` |
| `FG-STORAGE-007` | storage migration smoke | migration runner | staging-copy | all tenants | Backfill storage paths. | Idempotent, geen dataverlies. | migration, storage | `hardening-open` |
| `FG-PORTAL-C-001` | klantportaal host-bound | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | `demo-a` | Open klantportaal. | Alleen Tenant A context. | Playwright, integration | `runtime-proof-open` |
| `FG-PORTAL-C-002` | klantportaal wrong host | `A-CUSTOMER` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant B host. | Geweigerd. | Playwright, integration | `runtime-proof-open` |
| `FG-PORTAL-C-003` | klantportaal module off | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | module off | Open portal feature. | Geweigerd server-side. | Playwright, integration | `runtime-proof-open` |
| `FG-PORTAL-C-004` | klantportaal invoice/PDF audit | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | `demo-a` | Download invoice PDF. | Eigen tenant/customer en audit. | integration, DB/RLS | `runtime-proof-open` |
| `FG-PORTAL-P-001` | personeelsapp host-bound | `A-PERSONNEL` | `demo-a.fieldgrid.nl` | `demo-a` | Open personeelsapp. | Alleen Tenant A context. | Playwright, integration | `runtime-proof-open` |
| `FG-PORTAL-P-002` | personeelsapp wrong host | `A-PERSONNEL` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant B host. | Geweigerd. | Playwright, integration | `runtime-proof-open` |
| `FG-PORTAL-P-003` | personeelsapp assignment media | `A-PERSONNEL` | `demo-a.fieldgrid.nl` | `demo-a` | Upload/download media. | Alleen toegestane opdracht/tenant. | storage, integration | `runtime-proof-open` |
| `FG-PORTAL-P-004` | personeelsapp module off | `A-PERSONNEL` | `demo-a.fieldgrid.nl` | module off | Open modulefeature. | Geweigerd server-side. | Playwright, integration | `runtime-proof-open` |
| `FG-PORTAL-P-005` | personeelsapp planning actualiteit | `A-PERSONNEL` | `demo-a.fieldgrid.nl` | `demo-a` | Wijzig planning/tijd en bekijk Home/Planning. | Realtime event of zichtbare minuut-refresh werkt. | Playwright, integration | `runtime-proof-open` |
| `FG-AUDIT-001` | download audit | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Download document/invoice/report. | Audit bevat tenant, actor, entity, actie. | DB/RLS, integration | `partial` |
| `FG-AUDIT-002` | support audit | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` | Lees/download via support. | Audit bevat grant, reden en tenant. | DB/RLS, integration | `partial` |
| `FG-AUDIT-003` | platform audit | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | platform | Wijzig tenant plan/module/status. | Platform audit is platform-only. | DB/RLS, integration | `partial` |
| `FG-AUDIT-004` | tenant audit isolation | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Zoek Tenant A audit. | Niet zichtbaar. | DB/RLS, integration | `partial` |
| `FG-AUDIT-005` | audit migration smoke | migration runner | staging-copy | all tenants | Voeg tenant_id/split toe. | Backfill compleet; platform-only correct. | migration, DB/RLS | `partial` |
| `FG-PLATFORM-001` | active platform admin | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | platform | Open tenant list. | Toegestaan. | Playwright, integration | `runtime-proof-open` |
| `FG-PLATFORM-002` | inactive platform admin | `PLAT-ADMIN-INACTIVE` | `platform.fieldgrid.nl` | platform | Open platform route. | Geweigerd. | Playwright, integration | `runtime-proof-open` |
| `FG-PLATFORM-003` | tenant user platform denial | `A-ADMIN` | `platform.fieldgrid.nl` | platform | Open platform route. | Geweigerd. | Playwright, integration | `runtime-proof-open` |
| `FG-PLATFORM-004` | lifecycle action | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A | Suspend/reactivate. | Transactioneel en geaudit. | integration | `runtime-proof-open` |
| `FG-PLATFORM-005` | plan/module beheer | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A | Wijzig plan/modules. | Entitlements runtime afgedwongen. | integration | `runtime-proof-open` |
| `FG-PLATFORM-006` | support grant beheer | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A | Maak/revoke grant. | Status klopt en audit bestaat. | integration, DB/RLS | `runtime-proof-open` |
| `FG-MIG-001` | lege database smoke | migration runner | local/CI | empty DB | Draai alle migraties. | Migrations slagen idempotent. | migration | `partial` |
| `FG-MIG-002` | staging-copy smoke | migration runner | staging-copy | existing data | Draai migraties. | Geen destructieve reset; backfills slagen. | migration | `partial` |
| `FG-MIG-003` | compatibility skip | migration runner | staging-copy | legacy migrations | Draai runner met legacy SQL. | Correct skipped/toegepast zonder duplicate failure. | migration | `partial` |
| `FG-OPS-001` | platform onboarding wizard | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | new tenant | Doorloop wizard. | Tenant/provisioning run is save/resume/review/rollback-proof. | Playwright, integration | `partial` |
| `FG-OPS-002` | tenant first-run wizard | `A-OWNER` | `demo-a.fieldgrid.nl` | `demo-a` | Doorloop first-run. | Setupstatus en readiness worden opgeslagen. | Playwright, integration | `partial` |
| `FG-OPS-003` | usage dashboard | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A | Bekijk usage. | Users, docs, opdrachten, storage, downloads, modules zichtbaar. | integration | `partial` |
| `FG-OPS-004` | branding preview | `A-OWNER` | `demo-a.fieldgrid.nl` | `demo-a` | Wijzig branding en bekijk preview. | Portal/email/PDF preview klopt. | Playwright | `nice-to-have` |
| `FG-OPS-005` | security dashboard | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | all tenants | Filter security events. | Support/download/denial events correct gescheiden. | integration | `partial` |
| `FG-OPS-006` | module dependency visualisatie | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A | Bekijk dependencies. | Dependencies begrijpelijk en consistent met enforcement. | Playwright | `nice-to-have` |
| `FG-OPS-007` | demo-data generator | migration/test runner | local/CI | demo tenants | Seed en cleanup. | Idempotent, scoped, cleanup veilig. | integration | `partial` |
| `FG-OPS-008` | staging smoke dashboard | `PLAT-OWNER-ACTIVE` | `staging.fieldgrid.nl` | staging | Bekijk smoke run history, live-smokes en mutating cleanup-contract. | Host/login/modules/sectoren/regio/storage/PDF/migraties zichtbaar met run history en cleanupstatus. | static, Playwright, smoke | `runtime-proof-open` |

## Minimum green before staging

Een PR mag pas naar staging-promotie als de relevante minimum set groen is.

Altijd:

- `FG-MIG-001`
- `FG-MIG-002` voor elke migratie-PR
- `FG-HOST-001` t/m `FG-HOST-005`
- `FG-LIFE-001` en denial voor suspended/archived als lifecycle geraakt wordt
- `FG-RBAC-001` t/m `FG-RBAC-004` als auth/RBAC geraakt wordt

Voor regio-werk:

- `FG-REGION-001` t/m `FG-REGION-008`
- `FG-DATA-001` t/m `FG-DATA-003` waar regio op object/personeel/opdracht wordt toegepast
- Planning overlap happy path en denial path

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
- `FG-PORTAL-P-001` t/m `FG-PORTAL-P-005` voor personeelsapp

Voor productisering en operatie:

- `FG-OPS-001` t/m `FG-OPS-008` voor geraakte wizard/dashboard/smoke onderdelen

Statische tests alleen tellen nooit als minimum green voor een runtime securitygrens; er moet minimaal een unit/integration/Playwright/DB/RLS/storage test bij waar de grens runtime raakt.

Gebruik daarnaast altijd `docs/fieldgrid-staging-promotion-checklist.md` voor de sprintgebonden stagingregels.

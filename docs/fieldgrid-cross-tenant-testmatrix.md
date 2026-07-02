# Fieldgrid cross-tenant testmatrix

Datum: 2026-07-03  
Status: verplichte acceptatiebasis voor SaaS-hardening na recovery, module/plan foundation en storage-hardening t/m PR #125.  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-recovery-execution-plan.md`

## Doel

Deze matrix beschrijft de vaste actoren, tenants, hosts en scenario's waarmee we bewijzen dat Fieldgrid veilig multi-tenant werkt.

Elke toekomstige PR voor tenant lifecycle, RBAC, support access, modules, sectoren, portalen, storage, finance, documenten, audit of provisioning moet in de PR-body verwijzen naar relevante test-id's uit dit document.

## Automatiseringsstatus per 2026-07-03

De huidige codebase heeft vooral statische canon- en guardrail-tests. Dat is nuttig, maar niet genoeg voor SaaS-acceptatie.

Volgende automatiseringslaag:

- Tenant A/B/Veele integration fixtures voor membership, RBAC, modules, sectoren, direct-ID en support access.
- Playwright-tests voor host-first routing, tenant switcher override, klantportaal en personeelsapp.
- DB/RLS-tests voor tenantdata, support audit, platform-only tabellen en migrated sensitive tables.
- Storage-tests voor signed URLs, tenant-prefix paths en path guessing.
- Migratie-smoke op lege database en staging-copy.

Statische tests mogen alleen bewijzen dat canon of codepatronen bestaan. Runtime-isolatie moet met integration, Playwright, DB/RLS en storage tests worden bewezen.

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

| Tenant | Customer | Object | Assignment | Document | Report | Quote | Invoice | Storage path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `demo-a` | `A-Customer-01` | `A-Object-01` | `A-Assignment-01` | `A-Document-01` | `A-Report-01` | `A-Quote-01` | `A-Invoice-01` | `tenant/{demo-a-id}/...` |
| `demo-b` | `B-Customer-01` | `B-Object-01` | `B-Assignment-01` | `B-Document-01` | `B-Report-01` | `B-Quote-01` | `B-Invoice-01` | `tenant/{demo-b-id}/...` |
| `veele` | `V-Customer-01` | `V-Object-01` | `V-Assignment-01` | `V-Document-01` | `V-Report-01` | `V-Quote-01` | `V-Invoice-01` | `tenant/{veele-id}/...` |

## Testmatrix

| Test-id | Securitygrens | Actor | Host | Tenantcontext | Actie | Verwacht resultaat | Future testtype |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `FG-HOST-001` | host-first tenant resolution | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | platform | Open platform dashboard. | Platformroute opent; geen tenant switcher nodig. | Playwright, integration |
| `FG-HOST-002` | host-first tenant resolution | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Open backoffice dashboard. | Tenant A wordt uit host bepaald. | Playwright, unit |
| `FG-HOST-003` | unknown host denial | `A-ADMIN` | `unknown.fieldgrid.nl` | none | Open backoffice route. | Veilige fout; geen fallback naar default tenant. | Playwright, unit |
| `FG-HOST-004` | tenant switcher override | `MULTI-A-B` | `demo-a.fieldgrid.nl` | cookie probeert `demo-b` | Zet switcher/cookie op Tenant B en open Tenant A host. | Host wint; Tenant B data blijft onzichtbaar. | Playwright, integration |
| `FG-HOST-005` | default fallback denial | `A-ADMIN` | `demo-a.fieldgrid.nl` | missing/invalid session tenant | Forceer ontbrekende tenantcookie. | Geen productie-fallback naar `DEFAULT_TENANT_ID`. | static, unit |
| `FG-HOST-006` | custom domain | `A-ADMIN` | custom Tenant A domain | `demo-a` | Open dashboard via custom domain. | Tenant A wordt uit `tenant_domains` bepaald. | Playwright, integration |
| `FG-LIFE-001` | active tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | active `demo-a` | Open en wijzig Tenant A customer. | Toegestaan. | integration |
| `FG-LIFE-002` | suspended tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | suspended `demo-a` | Probeer mutatie. | Geweigerd volgens suspended policy. | integration, DB/RLS |
| `FG-LIFE-003` | archived tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | archived `demo-a` | Probeer login/dashboard. | Geweigerd of read-only volgens policy; geen mutatie. | integration |
| `FG-LIFE-004` | Veele gewone tenant | `A-ADMIN` | `veele.fieldgrid.nl` | `veele` | Open tenant dashboard. | Veele gedraagt zich als gewone tenant, niet als platform-exceptie. | Playwright, integration |
| `FG-RBAC-001` | tenant RBAC happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Lees en wijzig Tenant A customer. | Toegestaan op basis van tenantrol. | integration |
| `FG-RBAC-002` | tenant RBAC denial | `MULTI-A-B` | `demo-b.fieldgrid.nl` | `demo-b` | Voer actie uit die alleen Tenant A rol toestaat. | Geweigerd in Tenant B. | integration |
| `FG-RBAC-003` | globale roles geen runtime | `A-EMPLOYEE` | `demo-a.fieldgrid.nl` | `demo-a` | Verwijder tenantrol, laat alleen globale role staan, probeer protected action. | Geweigerd; globale role geeft geen runtime-recht. | static, integration |
| `FG-RBAC-004` | custom roles plan gate | `A-OWNER` | `demo-a.fieldgrid.nl` | Starter tenant | Maak custom role. | Geweigerd voor Starter; toegestaan voor Professional+. | integration |
| `FG-RBAC-005` | tenantrol assignment | `A-OWNER` | `demo-a.fieldgrid.nl` | `demo-a` | Wijs gebruiker een tenantrol toe. | Alleen Tenant A rol wordt aangepast; Tenant B blijft gelijk. | integration |
| `FG-SUPPORT-001` | support grant absent | `SUPPORT-NO-GRANT` | `platform.fieldgrid.nl` | `demo-a` support entry | Open Tenant A support entrypoint. | Geweigerd; geen impliciete tenanttoegang. | integration, Playwright |
| `FG-SUPPORT-002` | support grant active | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` support entry | Open Tenant A support entrypoint binnen grantvenster. | Toegestaan en auditregel geschreven. | integration, DB/RLS |
| `FG-SUPPORT-003` | support grant expired | `SUPPORT-EXPIRED` | `platform.fieldgrid.nl` | `demo-a` support entry | Open Tenant A support entrypoint. | Geweigerd; verlopen grant telt niet. | integration |
| `FG-SUPPORT-004` | wrong tenant grant | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-b` support entry | Open Tenant B support entrypoint met Tenant A grant. | Geweigerd en niet als tenantrol behandeld. | integration |
| `FG-SUPPORT-005` | support audit | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` | Lees/download tenantdata via supportmodus. | Audit bevat support user, tenant, reden, grant en actie. | DB/RLS, integration |
| `FG-SUPPORT-006` | support priority | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` | Voer toegestane supportactie uit zonder tenantrol. | Actieve grant werkt onafhankelijk van gewone tenantrol, maar alleen via supportpad. | integration |
| `FG-MODULE-001` | module enabled happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | documents enabled | Open documentmodule. | Toegestaan. | integration, Playwright |
| `FG-MODULE-002` | module disabled UI | `A-ADMIN` | `demo-a.fieldgrid.nl` | documents disabled | Bekijk navigatie/dashboard. | Module niet zichtbaar of disabled volgens productkeuze. | Playwright |
| `FG-MODULE-003` | module disabled direct URL | `A-ADMIN` | `demo-a.fieldgrid.nl` | documents disabled | Open directe documentroute. | Geweigerd server-side. | Playwright, integration |
| `FG-MODULE-004` | module disabled server action | `A-ADMIN` | `demo-a.fieldgrid.nl` | documents disabled | Roep document server action aan. | Geweigerd door `requireTenantModule`. | integration |
| `FG-MODULE-005` | module disabled API | `A-ADMIN` | API host | module disabled | Roep API endpoint voor module aan. | Geweigerd, ook als RBAC permissie bestaat. | integration |
| `FG-MODULE-006` | module dependency | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A config | Schakel module uit waarvan andere module afhankelijk is. | Geweigerd of dependency wordt consequent opgelost. | unit, integration |
| `FG-MODULE-007` | background job | worker | n/a | module disabled | Verwerk tenant job voor uitgeschakelde module. | Job wordt niet uitgevoerd of veilig overgeslagen. | integration |
| `FG-MODULE-008` | plan module seed | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Starter/Professional/Enterprise | Seed/check plan modules. | Modules volgen plan + tenant overrides. | DB/RLS, integration |
| `FG-SECTOR-001` | sector happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | allowed sector | Maak customer/object/personnel/task code met toegestane sector. | Toegestaan. | integration, DB/RLS |
| `FG-SECTOR-002` | sector outside tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | Tenant B sector id | Maak record met sector buiten tenantconfiguratie. | Geweigerd server-side en DB-side waar trigger bestaat. | integration, DB/RLS |
| `FG-SECTOR-003` | disabled sector | `A-ADMIN` | `demo-a.fieldgrid.nl` | disabled sector | Maak/wijzig record met disabled sector. | Geweigerd. | integration, DB/RLS |
| `FG-SECTOR-004` | disable sector with existing data | `A-OWNER` | `demo-a.fieldgrid.nl` | sector in gebruik | Disable sector die bestaande records raakt. | Geweigerd totdat data gemigreerd/geschoond is. | integration, DB/RLS |
| `FG-SECTOR-005` | single-sector default | `A-ADMIN` | `demo-a.fieldgrid.nl` | single-sector tenant | Maak record zonder expliciete sector. | Default sector wordt server-side gezet of mutatie faalt volgens policy. | unit, integration |
| `FG-SECTOR-006` | assignment sector consistency | `A-PLANNER` | `demo-a.fieldgrid.nl` | mixed customer/object/task sectors | Maak assignment met inconsistente sectorcontext. | Geweigerd of expliciet volgens ontworpen sectorpolicy. | integration |
| `FG-DATA-001` | customer direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A customer id. | 404/403; geen data leakage. | integration |
| `FG-DATA-002` | object direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A object id. | 404/403. | integration |
| `FG-DATA-003` | assignment direct ID | `B-PLANNER` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A assignment id. | 404/403. | integration |
| `FG-DATA-004` | document direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Download/open Tenant A document id. | 404/403 en geen signed URL. | integration, storage |
| `FG-DATA-005` | report direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A report/PDF. | 404/403 en audit indien relevant. | integration |
| `FG-DATA-006` | quote direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A quote/PDF. | 404/403. | integration |
| `FG-DATA-007` | invoice direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant A invoice/PDF. | 404/403 en geen payment data. | integration |
| `FG-DATA-008` | payment direct ID | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Open/update Tenant A payment. | 404/403; webhook guards tenant. | integration, DB/RLS |
| `FG-DATA-009` | audit visibility | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Bekijk auditlog. | Alleen Tenant A audit; geen platform/support-only data. | DB/RLS, integration |
| `FG-DATA-010` | news scope | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | `demo-a` | Open news feed. | Alleen tenant-scoped of expliciet platform-news volgens gekozen model. | integration |
| `FG-STORAGE-001` | tenant-prefix happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Download Tenant A document via tenant-prefixed path. | Signed URL alleen na tenant/entity check. | storage, integration |
| `FG-STORAGE-002` | path guessing | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Gebruik Tenant A storage path. | Geen signed URL; geen delete/update. | storage |
| `FG-STORAGE-003` | assignment photo URL | `B-CUSTOMER` | `demo-b.fieldgrid.nl` | `demo-b` | Vraag signed URL voor Tenant A assignment photo. | Geweigerd. | storage, integration |
| `FG-STORAGE-004` | report attachment URL | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Vraag signed URL voor Tenant A report attachment. | Geweigerd; unsafe path geblokkeerd. | storage, integration |
| `FG-STORAGE-005` | avatar/org assets | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Raad Tenant A logo/avatar path. | Alleen publieke assets volgens policy, geen private leakage. | storage |
| `FG-STORAGE-006` | delete guard | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Probeer Tenant A document te verwijderen via path/id. | Geweigerd. | storage, integration |
| `FG-STORAGE-007` | storage migration smoke | migration runner | staging-copy | all tenants | Backfill bestaande storage paths naar tenant-prefix. | Idempotent, geen data kwijt, oude links gecontroleerd. | migration, storage |
| `FG-PORTAL-C-001` | klantportaal host-bound | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | `demo-a` | Open klantportaal. | Alleen Tenant A customercontext. | Playwright, integration |
| `FG-PORTAL-C-002` | klantportaal wrong host | `A-CUSTOMER` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant B host met Tenant A customer. | Geweigerd. | Playwright, integration |
| `FG-PORTAL-C-003` | klantportaal module off | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | customer portal module off | Open portal feature. | Geweigerd server-side. | Playwright, integration |
| `FG-PORTAL-C-004` | klantportaal invoice/PDF audit | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | `demo-a` | Download invoice PDF. | Alleen eigen tenant/customer en auditregel geschreven. | integration, DB/RLS |
| `FG-PORTAL-P-001` | personeelsapp host-bound | `A-PERSONNEL` | `demo-a.fieldgrid.nl` | `demo-a` | Open personeelsapp. | Alleen Tenant A personnelcontext. | Playwright, integration |
| `FG-PORTAL-P-002` | personeelsapp wrong host | `A-PERSONNEL` | `demo-b.fieldgrid.nl` | `demo-b` | Open Tenant B host met Tenant A personnel. | Geweigerd. | Playwright, integration |
| `FG-PORTAL-P-003` | personeelsapp assignment media | `A-PERSONNEL` | `demo-a.fieldgrid.nl` | `demo-a` | Upload/download assignment media. | Alleen toegestane opdracht en tenant. | storage, integration |
| `FG-PORTAL-P-004` | personeelsapp module off | `A-PERSONNEL` | `demo-a.fieldgrid.nl` | personnel app module off | Open modulefeature. | Geweigerd server-side. | Playwright, integration |
| `FG-AUDIT-001` | download audit | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Download document/invoice/report. | Audit bevat tenant, actor, entity, actie, timestamp. | DB/RLS, integration |
| `FG-AUDIT-002` | support audit | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` | Lees/download tenantdata. | Audit bevat support grant, reden en tenant. | DB/RLS, integration |
| `FG-AUDIT-003` | platform audit | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | platform | Wijzig tenant plan/module/status. | Platform audit is platform-only en niet tenant-visible. | DB/RLS, integration |
| `FG-AUDIT-004` | tenant audit isolation | `B-ADMIN` | `demo-b.fieldgrid.nl` | `demo-b` | Zoek Tenant A auditregels. | Niet zichtbaar. | DB/RLS, integration |
| `FG-AUDIT-005` | audit migration smoke | migration runner | staging-copy | all tenants | Voeg tenant_id/split toe aan audit. | Backfill compleet; platform-only events correct geclassificeerd. | migration, DB/RLS |
| `FG-PLATFORM-001` | active platform admin | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | platform | Open tenant list. | Toegestaan. | Playwright, integration |
| `FG-PLATFORM-002` | inactive platform admin | `PLAT-ADMIN-INACTIVE` | `platform.fieldgrid.nl` | platform | Open platform route. | Geweigerd. | Playwright, integration |
| `FG-PLATFORM-003` | tenant user platform denial | `A-ADMIN` | `platform.fieldgrid.nl` | platform | Open platform route. | Geweigerd. | Playwright, integration |
| `FG-PLATFORM-004` | lifecycle action | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A | Suspend/reactivate tenant. | Statuswijziging transactioneel en geaudit. | integration |
| `FG-PLATFORM-005` | plan/module beheer | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A | Wijzig plan/modules. | Entitlements veranderen en worden runtime afgedwongen. | integration |
| `FG-PLATFORM-006` | support grant beheer | `PLAT-OWNER-ACTIVE` | `platform.fieldgrid.nl` | Tenant A | Maak/revoke support grant. | Grant status klopt en auditregel bestaat. | integration, DB/RLS |
| `FG-MIG-001` | lege database smoke | migration runner | local/CI | empty DB | Draai alle migraties. | Migrations slagen idempotent. | migration |
| `FG-MIG-002` | staging-copy smoke | migration runner | staging-copy | bestaande data | Draai migraties op kopie van staging. | Geen destructieve reset; backfills slagen. | migration |
| `FG-MIG-003` | compatibility skip | migration runner | staging-copy | legacy migrations | Draai migratierunner met reeds toegepaste legacy SQL. | Correct skipped/toegepast zonder duplicate failure. | migration |

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

- `FG-DATA-001` t/m `FG-DATA-009` voor geraakte domeinen
- `FG-STORAGE-001` t/m `FG-STORAGE-007` voor storage/downloads
- `FG-AUDIT-001`, `FG-AUDIT-004` en waar nodig `FG-AUDIT-005`

Voor portalen:

- `FG-PORTAL-C-001` t/m `FG-PORTAL-C-004` voor klantportaal
- `FG-PORTAL-P-001` t/m `FG-PORTAL-P-004` voor personeelsapp

Statische tests alleen tellen nooit als minimum green voor een runtime securitygrens; er moet minimaal een unit/integration/Playwright/DB/RLS/storage test bij waar de grens runtime raakt.
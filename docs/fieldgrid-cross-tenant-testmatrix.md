# Fieldgrid cross-tenant testmatrix

Datum: 2026-07-02  
Status: verplichte acceptatiebasis voor SaaS-hardening  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-data-classification.md`

## Doel

Deze matrix beschrijft de vaste testactoren, tenants en scenario's waarmee we bewijzen dat Fieldgrid veilig multi-tenant werkt.

Elke toekomstige PR voor tenant lifecycle, RBAC, support access, modules, sectoren, portalen, storage, finance, documenten of audit moet in de PR-body verwijzen naar de relevante test-id's uit dit document.

## Vaste tenants

| Tenant | Slug | Doel |
| --- | --- | --- |
| Tenant Veele | `veele` | Gewone tenant. Geen platform-uitzondering. |
| Tenant A | `demo-a` | Primaire positieve testtenant. |
| Tenant B | `demo-b` | Cross-tenant denial tenant met vergelijkbare records. |

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

Maak per tenant vergelijkbare records en noteer technische ids, slugs, document ids, invoice ids en storage paths.

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
| `FG-HOST-003` | host-first tenant resolution | `A-ADMIN` | `unknown.fieldgrid.nl` | none | Open backoffice route. | Veilige fout; geen fallback naar default tenant. | Playwright, unit |
| `FG-HOST-004` | tenant switcher override | `MULTI-A-B` | `demo-a.fieldgrid.nl` | cookie probeert `demo-b` | Zet tenant switcher/cookie op Tenant B en open Tenant A host. | Host wint; Tenant B data blijft onzichtbaar. | Playwright, integration |
| `FG-HOST-005` | productie fallback | `A-ADMIN` | `demo-a.fieldgrid.nl` | missing/invalid session tenant | Forceer ontbrekende tenantcookie. | Geen productie-fallback naar `DEFAULT_TENANT_ID`. | static, unit |
| `FG-RBAC-001` | tenant RBAC happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Lees en wijzig Tenant A customer. | Toegestaan op basis van tenantrol. | integration |
| `FG-RBAC-002` | tenant RBAC denial | `MULTI-A-B` | `demo-b.fieldgrid.nl` | `demo-b` | Voer actie uit die alleen Tenant A rol toestaat. | Geweigerd in Tenant B. | integration |
| `FG-RBAC-003` | globale roles geen runtime | `A-EMPLOYEE` | `demo-a.fieldgrid.nl` | `demo-a` | Verwijder tenantrol, laat alleen globale role staan, probeer protected action. | Geweigerd; globale role geeft geen runtime-recht. | static, integration |
| `FG-RBAC-004` | custom roles plan gate | `A-OWNER` | `demo-a.fieldgrid.nl` | Starter tenant | Maak custom role. | Geweigerd voor Starter; toegestaan voor Professional+. | integration |
| `FG-SUPPORT-001` | support grant absent | `SUPPORT-NO-GRANT` | `platform.fieldgrid.nl` | `demo-a` support entry | Open Tenant A support entrypoint. | Geweigerd; geen impliciete tenanttoegang. | integration, Playwright |
| `FG-SUPPORT-002` | support grant active | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` support entry | Open Tenant A support entrypoint binnen grantvenster. | Toegestaan en auditregel geschreven. | integration, DB/RLS |
| `FG-SUPPORT-003` | support grant expired | `SUPPORT-EXPIRED` | `platform.fieldgrid.nl` | `demo-a` support entry | Open Tenant A support entrypoint. | Geweigerd; verlopen grant telt niet. | integration |
| `FG-SUPPORT-004` | support wrong tenant | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-b` support entry | Open Tenant B support entrypoint. | Geweigerd; grant is tenant-scoped. | integration |
| `FG-SUPPORT-005` | support audit | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` | Lees gevoelige tenantdata via supportflow. | `support_access_audit_log` bevat grant, tenant, actor, action en resource. | DB/RLS, integration |
| `FG-PLATFORM-001` | platform-admin guard | `PLAT-ADMIN-INACTIVE` | `platform.fieldgrid.nl` | platform | Open platform-admin route. | Geweigerd door status. | Playwright, integration |
| `FG-PLATFORM-002` | tenant user geen platform | `A-OWNER` | `platform.fieldgrid.nl` | platform | Open platform-admin route. | Geweigerd; tenantrol is geen platformrol. | Playwright, integration |
| `FG-MODULE-001` | module happy path | `A-ADMIN` | `demo-a.fieldgrid.nl` | module enabled | Open module en voer normale leesactie uit. | Toegestaan met juiste tenantrol. | Playwright, integration |
| `FG-MODULE-002` | module off UI | `A-ADMIN` | `demo-a.fieldgrid.nl` | module disabled | Open navigatie. | Module is verborgen of disabled volgens modulebeleid. | Playwright |
| `FG-MODULE-003` | module off direct URL | `A-ADMIN` | `demo-a.fieldgrid.nl` | module disabled | Open directe module-URL. | Server blokkeert; geen data of metadata. | Playwright, integration |
| `FG-MODULE-004` | module off action/API | `A-ADMIN` | `demo-a.fieldgrid.nl` | module disabled | Roep server action/API direct aan. | Geweigerd met consistente autorisatiefout. | integration |
| `FG-SECTOR-001` | sector happy path | `A-PLANNER` | `demo-a.fieldgrid.nl` | toegestane sector | Maak customer/object/personnel/task code met toegestane sector. | Toegestaan. | integration, DB/RLS |
| `FG-SECTOR-002` | sector buiten tenant | `A-PLANNER` | `demo-a.fieldgrid.nl` | sector alleen in `demo-b` | Manipuleer create/update payload naar Tenant B sector. | Geweigerd; record blijft ongewijzigd. | integration, DB/RLS |
| `FG-SECTOR-003` | disabled sector | `A-ADMIN` | `demo-a.fieldgrid.nl` | disabled tenant sector | Maak of wijzig record naar disabled sector. | Geweigerd. | integration, DB/RLS |
| `FG-SECTOR-004` | single-sector UX | `A-ADMIN` | `demo-a.fieldgrid.nl` | single-sector tenant | Open forms waar sector relevant is. | UI toont geen overbodige sectorselectie; server vult default sector. | Playwright, integration |
| `FG-ID-001` | direct ID customer | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Open of mutate `B-Customer-01` via technische id. | Geen Tenant B data, geen side effects. | integration |
| `FG-ID-002` | direct ID object | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Open of mutate `B-Object-01` via technische id. | Geen Tenant B data, geen side effects. | integration |
| `FG-ID-003` | direct ID assignment | `A-PLANNER` | `demo-a.fieldgrid.nl` | `demo-a` | Open of mutate `B-Assignment-01` via technische id. | Geen Tenant B data, geen subresource metadata. | integration |
| `FG-ID-004` | direct ID document | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Open/download `B-Document-01` via document id. | Geen metadata, filename, path, preview of signed URL. | integration, storage |
| `FG-ID-005` | direct ID invoice/PDF | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Open/download `B-Invoice-01` of PDF-route. | Geen PDF, paymentstatus of finance metadata. | integration |
| `FG-ID-006` | direct ID report/PDF | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Open/download `B-Report-01`. | Geen rapportcontent, media of PDF. | integration, storage |
| `FG-PORTAL-C-001` | klantportaal host-bound | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | `demo-a` | Open eigen portal dashboard. | Alleen eigen customerdata Tenant A zichtbaar. | Playwright, integration |
| `FG-PORTAL-C-002` | klantportaal cross-tenant | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | payload/id uit `demo-b` | Roep B customer/object/assignment/invoice routes aan. | Geweigerd of leeg; geen Tenant B metadata. | integration |
| `FG-PORTAL-C-003` | klantportaal geen tenantkeuze | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | probeert switch naar `demo-b` | Manipuleer tenant parameter/cookie. | Host en `customer_users` winnen; geen Tenant B toegang. | Playwright, integration |
| `FG-PORTAL-P-001` | personeelsapp host-bound | `A-PERSONNEL` | `demo-a.fieldgrid.nl` | `demo-a` | Open eigen planning. | Alleen eigen/toegewezen Tenant A data zichtbaar. | Playwright, integration |
| `FG-PORTAL-P-002` | personeelsapp cross-tenant | `A-PERSONNEL` | `demo-a.fieldgrid.nl` | payload/id uit `demo-b` | Roep B assignment/open-service/media routes aan. | Geweigerd of leeg; geen Tenant B metadata. | integration, storage |
| `FG-STORAGE-001` | signed URL tenant check | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Vraag signed URL voor Tenant B document/photo/report attachment. | Geen URL; autorisatie faalt voor signing. | storage, integration |
| `FG-STORAGE-002` | storage path guessing | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | `demo-a` | Vervang `tenant/{demo-a-id}` door `tenant/{demo-b-id}` in path. | Geen read/write/delete; fout lekt geen structuur. | storage, DB/RLS |
| `FG-STORAGE-003` | public asset boundary | `A-CUSTOMER` | `demo-a.fieldgrid.nl` | public bucket | Open news/organization asset. | Alleen bewust publieke assets zijn leesbaar; private docs blijven private. | storage |
| `FG-AUDIT-001` | download audit | `A-ADMIN` | `demo-a.fieldgrid.nl` | `demo-a` | Download gevoelig document/PDF. | Tenant-audit bevat actor, tenant, resource, action. | integration, DB/RLS |
| `FG-AUDIT-002` | support audit priority | `SUPPORT-A-GRANT` | `platform.fieldgrid.nl` | `demo-a` support | Lees/download via support. | Support audit bevat grant id en tenant; geen gewone tenantrol nodig. | integration, DB/RLS |
| `FG-LIFECYCLE-001` | suspended tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | suspended tenant | Probeer mutatie. | Mutatie geweigerd; read-beleid volgens lifecycle spec. | integration |
| `FG-LIFECYCLE-002` | archived tenant | `A-ADMIN` | `demo-a.fieldgrid.nl` | archived tenant | Probeer login/mutatie. | Veilig geblokkeerd volgens archive-beleid. | integration, Playwright |
| `FG-MIGRATE-001` | lege database smoke | CI/system | n.v.t. | empty DB | Draai migraties vanaf nul. | Migraties slagen zonder handmatige fix. | DB/RLS |
| `FG-MIGRATE-002` | staging-copy smoke | CI/system | n.v.t. | kopie staging DB | Draai migraties op staging-copy. | Geen destructieve reset; bestaande data blijft bruikbaar. | DB/RLS |

## Minimum green before staging

Voordat `main` naar `staging` gaat na een risicofase, moeten minimaal groen zijn:

- `FG-HOST-001` t/m `FG-HOST-005`
- `FG-RBAC-001` t/m `FG-RBAC-004`
- `FG-SUPPORT-001` t/m `FG-SUPPORT-005`
- `FG-MODULE-002` t/m `FG-MODULE-004` zodra modules gebouwd zijn
- `FG-SECTOR-001` t/m `FG-SECTOR-003`
- `FG-ID-001` t/m `FG-ID-006`
- `FG-PORTAL-C-001` t/m `FG-PORTAL-C-003` zodra klantportaal host-bound wordt
- `FG-PORTAL-P-001` en `FG-PORTAL-P-002` zodra personeelsapp host-bound wordt
- `FG-STORAGE-001` en `FG-STORAGE-002` bij elke storage- of documentenwijziging
- `FG-MIGRATE-001` en `FG-MIGRATE-002` bij elke migratie-PR

## Verwachte denial-vorm

Per route of action mag de concrete denial-vorm verschillen, maar moet vooraf in de test worden vastgelegd:

- `403 Forbidden` voor expliciete autorisatiefout;
- `404 Not Found` wanneer bestaan niet bevestigd mag worden;
- lege dataset voor lijstqueries;
- applicatiespecifieke server-action fout zonder cross-tenant metadata.

Een denial mag nooit bestandsnamen, aantallen, storage paths, signed URLs, tenantnamen, klantnamen of andere metadata van een andere tenant lekken.

## Gebruik in vervolg-PR's

Elke vervolg-PR moet in de PR-body opnemen:

- welke test-id's relevant zijn;
- welke test-id's al geautomatiseerd zijn;
- welke test-id's nog handmatig of toekomstig blijven;
- of de wijziging staging-copy migratietests vereist;
- of storage/RLS inspect nodig is na deploy.

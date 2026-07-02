# Fieldgrid data-classificatie canon

Datum: 2026-07-02  
Status: verplichte bron voor SaaS-hardening vanaf de recovery-builds  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/tenant-query-audit-v1.md`, `docs/security-final-audit-v1.md`

## Doel

Dit document classificeert de huidige databasegroepen en security-oppervlakken voor Fieldgrid als extern multi-tenant SaaS-platform.

De classificatie bepaalt per domein:

- welke tenantstrategie geldt;
- welk risico prioriteit heeft;
- of een migratie nodig is;
- welke tests verplicht worden in volgende fases.

Geen domein mag in vervolgwerk als `unknown` worden behandeld. Als een nieuw schema of nieuwe feature wordt toegevoegd, moet dit document in dezelfde PR worden bijgewerkt.

## Canonieke strategieen

| Strategie | Betekenis | Gebruik |
| --- | --- | --- |
| `direct_tenant_id` | De tabel heeft zelf een verplichte `tenant_id`. | Voorkeur voor tenantdata die direct gelezen, geschreven, geexporteerd, gedownload of geaudit wordt. |
| `parent_scoped` | Tenant loopt bewust via een verplichte parentrelatie. | Tijdelijk acceptabel voor technische child rows met sterke FK en server/RLS-checks. |
| `global_template` | Globale template of catalogus, geen runtime tenantdata. | Rollen, permissies, sectorcatalogus en toekomstige task-code templates. |
| `platform_only` | Alleen Fieldgrid platform-admin/support gebruikt deze data. | Platform users, support grants, platform audit en platformbreed beheer. |
| `tenant_config` | Tenantinstelling, entitlement of policy. | Tenant domains, tenant sectors, modules, plans, branding en SMTP. |
| `needs_migration` | Huidige vorm is onvoldoende voor SaaS-doelmodel. | Tabellen zonder directe tenantkolom waar die wel nodig is, ontbrekende modules/plannen of legacy globale runtimepaden. |

## Prioriteiten

| Prioriteit | Betekenis |
| --- | --- |
| `P0` | Moet worden opgelost of aantoonbaar afgedekt voordat nieuwe SaaS-runtimefuncties naar staging gaan. |
| `P1` | Moet worden opgelost voor externe SaaS-acceptatie en eerste externe tenant. |
| `P2` | Productisering, beheerbaarheid of polish na de harde securitygrenzen. |

## Classificatiematrix

| Domein | Tabellen of oppervlak | Huidige status | Doelstrategie | Risico | Migratie | Vereiste tests | Roadmapfase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tenant core | `tenants`, `tenant_users` | Basis bestaat met lifecycle-status, plan key en actieve membershipchecks. | `tenant_config` + `direct_tenant_id` voor membership | P0 | Later: provisioning/auditmetadata en platform-admin lifecycleflows. | Host-first active/suspended/archived, membership denial, geen productie-default fallback. | Fase 1 |
| Tenant domains | `tenant_domains` | Bestaat met tenant, domain, type, primary en verification status. | `tenant_config` | P0 | Later: domeinbeheer/provisioning metadata. | Platformhost, tenanthost, custom domain, onbekende host, switcher override. | Fase 1 |
| Globale RBAC templates | `roles`, `permissions`, `role_permissions`, legacy `user_roles` | Blijven template/backfill-bron; mogen geen runtime tenantrechten geven. | `global_template` | P0 | Geen directe migratie, later legacy runtimepaden opruimen. | Globale role zonder tenantrol geeft geen toegang. | Fase 2 |
| Tenant RBAC runtime | `tenant_roles`, `tenant_role_permissions`, `tenant_user_roles` | Canonieke runtime-RBAC bestaat. | `direct_tenant_id` | P0 | Later: permissiematrix en DB-backed plan capabilities. | Zelfde user andere rollen in Tenant A/B, custom roles Professional+. | Fase 2 |
| Platform users | `platform_users` | Technische platform-admin/support basis bestaat. | `platform_only` | P0 | Later: rolmodel/status/audit uitbreiden indien nodig. | Actieve platform-admin werkt, gedeactiveerde admin faalt, tenant user faalt. | Fase 6 |
| Support access | `support_access_grants`, `support_access_audit_log` | Grants en audit bestaan met tenant scope. Runtimeprioriteit is nog niet overal afgedwongen. | `platform_only` + tenant-scoped support | P0 | Geen schema-migratie nu; wel runtime-integratie later. | Geen grant faalt, actieve grant werkt, verlopen/verkeerde tenant faalt, audit verplicht. | Fase 3/6 |
| Sectorcatalogus | `sectors` | Globale catalogus. | `global_template` | P0 | Geen, tenzij catalogusbeheer wordt uitgebreid. | Globale sector geeft alleen rechten via tenant assignment. | Fase 4 |
| Tenant sectors | `tenant_sectors` | Tenant-sector koppeling bestaat; geen policy/default/max/single-sector instellingen. | `tenant_config` | P0 | Ja: `tenant_sector_settings` of equivalent. | Sector buiten tenant faalt, disabled sector faalt, single-sector default werkt. | Fase 4 |
| Customer types | `customer_types` | Historisch hybride domein; moet expliciet tenant-config of globale template worden. | `tenant_config` of `global_template` | P1 | Beslissing + migratie nodig als nullable/global waarden blijven bestaan. | Tenant A ziet geen typeconfig van Tenant B; globale template alleen seed. | Fase 5 |
| Customers | `customers`, `customer_notes`, customer contacts | `customers.tenant_id` bestaat; sector en type zijn gekoppeld. Child rows moeten via customer scoped blijven of tenant_id krijgen bij gevoeligheid. | `direct_tenant_id` voor customer, `parent_scoped` voor eenvoudige children | P0 | Geen voor `customers`; child-audit bij datanormalisatie beoordelen. | Direct customer-id cross-tenant faalt, sector outside tenant faalt. | Fase 4/5 |
| Customer users en portal identity | `customer_users`, `customer_portal_preferences` | Tenant/customer/user scope bestaat; klantportaal-identiteit is host-first tenant-bound. | `direct_tenant_id` | P0 | Geen schema nu; module/branding/runtime guards later. | Klant krijgt geen tenantkeuze, host Tenant A + Tenant B user ambiguity faalt veilig. | Fase 8 |
| Objects | `objects`, `object_contacts`, `object_personnel` | `objects.tenant_id` bestaat; object contacts/personnel lopen via object/customer/personnel. | `direct_tenant_id` voor object, `parent_scoped` voor children | P0 | Geen directe migratie; child rows blijven te toetsen via parent. | Object-id guessing cross-tenant faalt, object sector buiten tenant faalt. | Fase 4/5 |
| Personnel | `personnel`, availability, qualifications, personnel notifications/tickets | `personnel.tenant_id` bestaat; personeelsapp-identiteit en profielmutaties zijn host-first tenant-bound. | `direct_tenant_id` | P0 | Geen basis-migratie; module/sector/runtime guards later. | Personeel ziet alleen eigen tenant en eigen/toegewezen opdrachten. | Fase 8 |
| Assignments | `assignments` | `assignments.tenant_id` bestaat. Sector is indirect via customer/object/task context. | `direct_tenant_id` | P0 | Later mogelijk expliciete sector/defaultvelden. | Assignment direct-id cross-tenant faalt, sector mismatch create/update faalt. | Fase 4/5 |
| Assignment technical children | `assignment_personnel`, `assignment_tasks`, `assignment_extra_work`, `assignment_material_usage`, `assignment_report_notes` | Geen eigen `tenant_id`; verplichte assignment FK. | `parent_scoped` tijdelijk acceptabel | P1 | Alleen migreren als queries/downloads direct op child id blijven leunen. | Child direct-id routes moeten parent tenant checken. | Fase 5 |
| Assignment media | `assignment_photos`, `assignment_report_note_attachments` | Geen eigen `tenant_id`; bevatten storage paths en downloadbaar materiaal. | `needs_migration` naar `direct_tenant_id` | P1 | Ja: backfill via assignment + tenant-prefixed storagestrategie. | Storage path guessing faalt, signed URL alleen na tenant/entity check. | Fase 5 |
| Documents | `documents`, document storage bucket | Geen `tenant_id`; entity type/id plus server-side entity-scope. | `needs_migration` naar `direct_tenant_id` | P1 | Ja: `documents.tenant_id`, backfill via entity, tenant storage prefix. | General upload tenant check, direct document-id cross-tenant faalt, signed URL tenant-bound. | Fase 5 |
| Reports | `reports` | Geen `tenant_id`; parent-scoped via assignment. Extern/PDF/download gevoelig. | `needs_migration` naar `direct_tenant_id` | P1 | Ja: backfill via assignment. | Report direct-id/PDF cross-tenant faalt, klant ziet alleen approved eigen data. | Fase 5 |
| Quotes | `quotes` | Geen `tenant_id`; parent/customer scoped. Financieel gevoelig. | `needs_migration` naar `direct_tenant_id` | P1 | Ja: backfill via assignment/customer. | Quote direct-id/PDF cross-tenant faalt, interne notities niet klantzichtbaar. | Fase 5 |
| Invoices | `invoices` | Geen `tenant_id`; parent/customer scoped. Financieel en payment gekoppeld. | `needs_migration` naar `direct_tenant_id` | P1 | Ja: backfill via customer/assignment. | Invoice direct-id/PDF/payment cross-tenant faalt. | Fase 5 |
| Payments | `payments` | Geen `tenant_id`; loopt via invoice. Webhook/payment status gevoelig. | `needs_migration` naar `direct_tenant_id` | P1 | Ja: backfill via invoice na invoice-tenant migratie. | Webhook update kan geen tenant overschrijven, customer payment view scoped. | Fase 5 |
| Customer payment batches | `customer_payment_batches`, `customer_payment_batch_items` | Geen `tenant_id`; loopt via customer/batch/invoice. | `needs_migration` naar `direct_tenant_id` | P1 | Ja: backfill via customer en invoice. | Batch direct-id/PDF/payment cross-tenant faalt. | Fase 5 |
| Audit logging | `audit_log` | Geen `tenant_id`; support audit heeft wel tenant. | `needs_migration` naar tenant/platform auditmodel | P1 | Ja: tenant audit met tenant_id en platform audit scheiding. | Tenant-admin ziet alleen tenant-audit; support/platform audit blijft platform-only. | Fase 5/6 |
| Domain events | `domain_events` | `tenant_id` bestaat. | `direct_tenant_id` | P1 | Geen basis-migratie; wel module/tenant filters bij consumers. | Worker verwerkt alleen tenantcontext; aggregate id alleen is onvoldoende. | Fase 5 |
| Notifications | customer notifications, push tokens, dispatch queue, attempts | De meeste runtime notificationtabellen hebben `tenant_id`; event settings zijn globale templates. | `direct_tenant_id` + `global_template` | P1 | Later: tenant overrides voor event templates indien nodig. | Tenant A ontvangt geen Tenant B dispatch, global template geeft geen tenantdata. | Fase 8/9 |
| Tickets en messages | `customer_message_threads`, `customer_message_entries`, personnel tickets | Threads hebben tenant/customer; entries lopen via thread. | `direct_tenant_id` voor thread, `parent_scoped` voor entries | P1 | Geen directe migratie nu; entries blijven parent-checked. | Thread/message direct-id cross-tenant faalt. | Fase 5/8 |
| News | `news_posts`, `news_post_targets`, hero images | Geen `tenant_id`; targets kunnen tenantgevoelig zijn. | `needs_migration` naar `direct_tenant_id` of expliciet `platform_only` news | P1 | Ja voor tenant news: `tenant_id` op posts/targets of platform-news scheiding. | Tenant nieuws niet cross-tenant zichtbaar; hero image path tenant/platform scoped. | Fase 5/8 |
| Task codes huidig | `task_codes` | Heeft `tenant_id`, maar code is globaal unique en mist template/override/prijshistorie. | `tenant_config` nu, later template/override | P0 | Ja: `tenant_task_codes`, tenant/sector prijzen, code uniqueness per tenant. | Task code sector buiten tenant faalt, prijs snapshot blijft historisch correct. | Fase 4 |
| Nummerreeksen en realtime | code sequences, assignment code sequences, portal realtime events | Sommige zijn migration-only of historisch; tenantstrategie moet opnieuw bevestigd worden. | `needs_migration` of `platform_only` per tabel | P1 | Ja waar tenantdata of tenantbroadcasts geraakt worden. | Code collisions per tenant, realtime event Tenant A niet zichtbaar in Tenant B. | Fase 5/9 |
| Organization settings | `organization_settings` | `tenant_id` bestaat; bevat branding, SMTP en Veele-default teksten. | `tenant_config` | P2 | Later: Fieldgrid platform defaults, package-gated branding, secrets handling. | Branding volgt tenant/plan; SMTP alleen eigen tenant. | Fase 8 |
| Planning intelligence | capacity checks, candidates, interest rounds/responses, sector rules | Tabellen hebben `tenant_id`; assignment/personnel refs moeten consistent blijven. | `direct_tenant_id` | P1 | Geen basis-migratie; wel module/sector guards. | Smart planning off faalt server-side, candidate from wrong tenant faalt. | Fase 3/4 |
| Modules | `modules`, `tenant_modules`, `module_dependencies` | Foundation bestaat: globale modulecatalogus, dependency model en tenant overrides. Runtime guards zijn nog niet geintegreerd. | `tenant_config` | P0 | Basis toegevoegd; later plan-koppeling, configuratievelden en guard-integratie. | Module uit via UI/direct URL/server action/API faalt. | Fase 3 |
| Plans en subscriptions | `plans`, `plan_modules`, `plan_limits`, `tenant_subscriptions` | Ontbreekt; custom-role gating is env-based. | `needs_migration` + `tenant_config` | P0 | Ja: Starter/Professional/Enterprise, plan capabilities, tenant subscription. | Custom roles Professional+, plan modules seed, limietconfig zichtbaar. | Fase 3 |
| Provisioning | provisioning service/logs/status | Ontbreekt. | `needs_migration` + `tenant_config` | P2 | Ja: provisioning log/status of auditvelden. | Tenant create rollback, duplicate slug/domain, owner invite. | Fase 7 |
| Storage | documents, assignment photos, report attachments, avatars, news/organization assets | Policies zijn aangescherpt, maar tenant-prefixed paths zijn nog geen canon. | `needs_migration` naar tenant-prefixed storage | P0 | Ja voor private buckets/paden: `tenant/{tenant_id}/...` canon en backfillplan. | Storage path guessing faalt, signed URL helpers valideren tenant/entity. | Fase 5 |
| Portal routing | backoffice, API, klant-PWA, personeel-PWA | Backoffice, API, klant-PWA en personeel-PWA zijn host-first tenant-bound; module/branding guards ontbreken nog. | runtime-hardening, geen DB-strategie | P0 | Geen DB-migratie; module/branding runtime later. | Host Tenant A kan Tenant B-context niet activeren; customer/personnel ambiguity faalt veilig. | Fase 1/8 |

## Directe tenant_id verplicht in migratiegolven

De volgende tabellen of groepen moeten expliciet als hardening-restpunt blijven staan totdat de migratie en tests zijn gedaan:

- `documents`
- `invoices`
- `quotes`
- `reports`
- `payments`
- `customer_payment_batches`
- `customer_payment_batch_items`
- assignment media: `assignment_photos`, `assignment_report_note_attachments`
- `audit_log`
- tenant news, tenzij productbesluit wordt: platform-only/global news

Deze groepen mogen tijdelijk via parentrelaties blijven werken zolang elke route/action/PDF/signed URL een tenantcheck via de parent uitvoert. Voor externe SaaS-acceptatie is dat niet genoeg voor alle groepen; vooral downloads, finance, audit en storage moeten uiteindelijk direct tenant-scoped zijn.

## Tijdelijk acceptabele parent-scope

Parent-scope is voorlopig acceptabel voor technische child rows wanneer alle voorwaarden gelden:

- de parent FK is verplicht;
- de parent heeft `tenant_id`;
- alle serveracties laden parent + tenant samen;
- directe child-id toegang wordt getest;
- RLS of database helper controleert dezelfde tenantgrens waar mogelijk.

Voorbeelden die voorlopig hieronder vallen:

- `assignment_tasks`
- `assignment_personnel`
- `assignment_extra_work`
- `assignment_material_usage`
- `assignment_report_notes`
- `customer_message_entries`
- eenvoudige object/customer child rows zonder eigen download/exportoppervlak

Zodra een child row zelfstandig downloadbaar, exporteerbaar, publiek routeerbaar, webhook-gestuurd of auditgevoelig wordt, moet de strategie opnieuw naar `direct_tenant_id` of `needs_migration`.

## Verplichte koppeling met vervolg-PR's

Elke vervolg-PR moet in de PR-body opnemen:

- welke classificatieregels worden geraakt;
- of het domein `P0`, `P1` of `P2` is;
- welke testmatrix-items worden toegevoegd of groen gemaakt;
- of er staging-data geraakt wordt;
- of er een backup/staging-copy migratietest nodig is.

Geen technische PR voor tenant lifecycle, modules, sectoren, storage, finance, documenten, audit of portalen mag naar staging zonder verwijzing naar dit document en de cross-tenant testmatrix.

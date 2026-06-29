# Fieldgrid data-classificatie en tenantstrategie

Dit document inventariseert de tabellen uit `lib/db/src/schema/`, `lib/db/migrations/` en `migrations/` voor tenant-isolatie en dataclassificatie. De kolom **huidig tenant_id aanwezig** is gebaseerd op de huidige Drizzle schema's waar aanwezig; migratie-only tabellen zijn apart beoordeeld op de SQL-migraties.

Legenda tenantstrategie:

- **explicit tenant_id**: tabel moet zelf een `tenant_id` hebben voor directe RLS, joins en backfills.
- **indirect via relatie**: tenant volgt betrouwbaar uit een verplichte parent-relatie, bijvoorbeeld `assignment_id`, `customer_id`, `personnel_id` of `invoice_id`.
- **global**: gedeelde referentie/configuratie voor alle tenants.
- **platform-only**: platform-, auth-, security- of workerdata die niet als tenantbusinessrecord behandeld moet worden, maar wel strikte platformpolicies nodig heeft.

| table | domein/module | huidig tenant_id aanwezig | gewenste tenantstrategie | bevat PII | bevat financiële data | bevat storage/media | bevat audit/securitygevoelige data | migratieprioriteit | opmerkingen |
|---|---|---:|---|---:|---:|---:|---:|---|---|
| tenants | tenantbeheer | nee | platform-only | nee | nee | nee | ja | laag | Root tenantregister; niet tenant-gescoped maar alleen platform/admin toegankelijk. |
| tenant_users | tenantbeheer/auth | ja | explicit tenant_id | ja | nee | nee | ja | laag | Koppelt auth users aan tenants en rollen; tenant_id is aanwezig. |
| roles | RBAC | nee | global | nee | nee | nee | ja | middel | Rollen zijn nu globaal; als tenants eigen rollen krijgen, tenant_id toevoegen. |
| permissions | RBAC | nee | global | nee | nee | nee | ja | laag | Rechten-catalogus hoort globaal/platformbeheerd te blijven. |
| role_permissions | RBAC | nee | indirect via relatie | nee | nee | nee | ja | middel | Volgt nu globale rollen/permissions; bij tenantrollen tenant_id of role-scope nodig. |
| user_roles | RBAC/auth | nee | platform-only | ja | nee | nee | ja | hoog | Auth user naar globale rol zonder tenantcontext; risico bij multi-tenant gebruikers. |
| audit_log | audit/security | nee | explicit tenant_id | ja | nee | nee | ja | hoog | Auditregels bevatten actor/resource/metadata; voeg tenant_id toe waar resource tenantgebonden is, met platform fallback. |
| sectors | stamdata/planning | nee | global | nee | nee | nee | nee | middel | Bekend restpunt: sectors zijn globaal; tenant-specifieke sectoren vragen explicit tenant_id of platform seed-vlag. |
| task_codes | stamdata/planning/facturatie | nee | explicit tenant_id | nee | ja | nee | ja | hoog | Bekend restpunt: codes bevatten prijs, kwalificatie-eisen en invoiceable-vlag; tenant_id toevoegen of duidelijk platform-catalogusmodel kiezen. |
| code_sequences | nummerreeksen | nee | explicit tenant_id | nee | nee | nee | ja | hoog | Migratie-only voor generieke codes; sequenties moeten tenant-gescoped zijn om botsingen/lekkage te voorkomen. |
| assignment_code_sequences | nummerreeksen | nee | explicit tenant_id | nee | nee | nee | ja | hoog | Migratie-only maandelijkse opdrachtcodes; tenant_id opnemen in unieke sleutel. |
| customers | CRM | ja | explicit tenant_id | ja | ja | nee | nee | laag | Tenant_id aanwezig; bevat contact-, adres-, BTW/KVK- en accountdata. |
| customer_types | CRM/stamdata | ja | explicit tenant_id | nee | nee | nee | nee | laag | Bekend restpunt lijkt opgelost in schema: tenant_id aanwezig, slug uniek per tenant houden. |
| customer_contacts | CRM | nee | indirect via relatie | ja | nee | nee | nee | middel | Tenant volgt uit customer_id; explicit tenant_id kan joins/RLS vereenvoudigen maar is niet strikt noodzakelijk. |
| customer_notes | CRM | nee | indirect via relatie | ja | nee | nee | ja | middel | Management-only notities; tenant volgt uit customer_id, inhoud kan gevoelige vrije tekst bevatten. |
| customer_users | klantportaal/auth | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; bevat portaalgebruikers en invite/loginstatus. |
| customer_portal_preferences | klantportaal | nee | indirect via relatie | ja | nee | nee | nee | laag | Tenant volgt uit customer_id; voorkeuren zijn laag risico. |
| customer_payment_batch_items | klantportaal/facturatie | nee | indirect via relatie | nee | ja | nee | nee | middel | Tenant volgt via batch_id/invoice_id; financieel detail. |
| objects | objectbeheer | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; bevat locatie, contact en toegangs-/alarm-/sleutelinformatie. |
| object_contacts | objectbeheer | nee | indirect via relatie | ja | nee | nee | nee | middel | Tenant volgt uit object_id; contactgegevens aanwezig. |
| object_personnel | objectbeheer/planning | nee | indirect via relatie | ja | nee | nee | nee | middel | Tenant volgt via object_id/personnel_id; koppel-/autorisatiegevoelig. |
| personnel | personeel | ja | explicit tenant_id | ja | nee | ja | ja | laag | Tenant_id aanwezig; bevat NAW, contact, avatar, kwalificaties en contract_info. |
| availability_windows | personeel/beschikbaarheid | nee | indirect via relatie | ja | nee | nee | nee | middel | Tenant volgt via personnel_id; roosterdata kan persoonsgegevens over werktijden zijn. |
| availability_day_entries | personeel/beschikbaarheid | nee | indirect via relatie | ja | nee | nee | nee | middel | Tenant volgt via personnel_id; bevat beschikbaarheid/nood-beschikbaarheid. |
| leave_periods | personeel/verlof | nee | indirect via relatie | ja | nee | nee | ja | middel | Tenant volgt via personnel_id; ziekte/verlofreden kan bijzonder gevoelig zijn. |
| personnel_qualifications | kwalificaties | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; certificaatdata en vervaldatum gekoppeld aan medewerker. |
| qualification_items | kwalificaties/stamdata | ja | explicit tenant_id | nee | nee | nee | ja | laag | Tenant_id aanwezig; kwalificatiecatalogus per tenant. |
| role_qualifications | kwalificaties/RBAC | ja | explicit tenant_id | nee | nee | nee | ja | laag | Tenant_id aanwezig; let op consistentie met mogelijk globale roles. |
| task_code_qualifications | kwalificaties/task codes | ja | explicit tenant_id | nee | nee | nee | ja | laag | Tenant_id aanwezig, maar parent task_codes mist tenant_id; integriteitscheck nodig. |
| assignments | planning/werkorders | ja | explicit tenant_id | ja | ja | ja | ja | laag | Tenant_id aanwezig; bevat klant/object, handtekeningdata-url, interne notities en lifecycle. |
| assignment_personnel | planning | nee | indirect via relatie | ja | nee | nee | ja | middel | Tenant volgt uit assignment_id/personnel_id; status beïnvloedt planningstoegang. |
| assignment_tasks | planning/uitvoering | nee | indirect via relatie | ja | ja | nee | ja | middel | Tenant volgt uit assignment_id; task_code_id wijst naar globale code zonder tenant. |
| assignment_extra_work | uitvoering/facturatie | nee | indirect via relatie | ja | ja | nee | nee | middel | Tenant volgt uit assignment_id; bevat uren/prijs/omschrijving. |
| assignment_photos | uitvoering/media | nee | indirect via relatie | ja | nee | ja | ja | hoog | Bekend media-restpunt: storage_path en uploaded_by; RLS/storage policies moeten tenant via assignment afdwingen. |
| assignment_material_usage | uitvoering/facturatie | nee | indirect via relatie | ja | ja | nee | nee | middel | Tenant volgt uit assignment_id; materiaalprijzen en vrije tekst. |
| assignment_report_notes | uitvoering/rapportage | nee | indirect via relatie | ja | nee | nee | ja | middel | Tenant volgt uit assignment_id; vrije tekst en created_by. |
| assignment_report_note_attachments | uitvoering/media | nee | indirect via relatie | ja | nee | ja | ja | hoog | Bekend media-restpunt: attachment metadata en storage_path; tenant afdwingen via assignment_id/note_id. |
| reports | rapportage | nee | indirect via relatie | ja | ja | nee | ja | hoog | Bekend restpunt; tenant volgt uit assignment_id, maar rapportcontent/uren/reviewers zijn gevoelig. Overweeg explicit tenant_id voor directe RLS. |
| invoices | facturatie | nee | indirect via relatie | ja | ja | nee | ja | hoog | Bekend restpunt; tenant volgt via customer_id/assignment_id, bevat bedragen/status/herinneringen. Explicit tenant_id aanbevolen voor finance RLS en exports. |
| payments | betalingen | nee | indirect via relatie | ja | ja | nee | ja | hoog | Tenant volgt via invoice_id; bevat Mollie-id/checkout/status. Explicit tenant_id kan reconciliatie veiliger maken. |
| quotes | offertes | nee | indirect via relatie | ja | ja | nee | ja | hoog | Bekend restpunt; tenant volgt via assignment_id/customer_id, bevat bedrag en goedkeuringen. Explicit tenant_id aanbevolen. |
| customer_payment_batches | betalingen/collectief factureren | nee | indirect via relatie | ja | ja | nee | ja | middel | Collectieve betalingen met periode, object en bedragen; tenant via customer_id. |
| documents | documenten/media | nee | explicit tenant_id | ja | nee | ja | ja | hoog | Bekend restpunt: generieke entity_type/entity_id en storage_path maken indirecte tenant-afleiding kwetsbaar; tenant_id toevoegen. |
| news_posts | nieuws/content | nee | platform-only | ja | nee | ja | ja | middel | Platform/backoffice content met author ids en hero image path; als tenantnieuws gewenst is tenant_id toevoegen. |
| news_post_targets | nieuws/content | nee | indirect via relatie | nee | nee | nee | ja | middel | Volgt post_id; target_type/target_id moet gevalideerd worden tegen tenant of platformdoelgroep. |
| organization_settings | instellingen | ja | explicit tenant_id | ja | ja | ja | ja | laag | Tenant_id aanwezig; bevat SMTP credentials, factuurinstellingen, logo en notificatietemplates. |
| notification_event_settings | notificaties/config | nee | global | nee | nee | nee | ja | laag | Event-template catalogus; platformbeheerd, geen tenantdata behalve aangepaste templates als dat later komt. |
| customer_notifications | notificaties/klant | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; notificatiebody/href kunnen businessinformatie bevatten. |
| personnel_notifications | notificaties/personeel | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; idem voor personeelsmeldingen. |
| push_subscriptions | notificaties/security | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; endpoint/keys zijn securitygevoelig. |
| native_push_device_tokens | notificaties/security | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; device token en device metadata zijn securitygevoelig. |
| notification_dispatches | notification queues | ja | explicit tenant_id | ja | nee | nee | ja | laag | Bekend restpunt queues: tenant_id aanwezig; payloadcriteria en aantallen controleren op minimale PII. |
| notification_delivery_queue | notification queues | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; recipient_email, payload, errors/responses bevatten mogelijk PII/secrets. |
| notification_delivery_attempts | notification queues | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; error/response kan providerdata bevatten. |
| domain_events | events/outbox | ja | explicit tenant_id | ja | ja | nee | ja | laag | Tenant_id aanwezig; payload kan alle domeindata bevatten, retentie/versleuteling overwegen. |
| portal_realtime_events | events/portaal | nee | explicit tenant_id | ja | nee | nee | ja | hoog | Migratie-only bekend event/restpunt; realtime payload vereist tenant_id voor broadcast/RLS. |
| customer_message_threads | ticketing/klant | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; subject/preview en status zijn gevoelig. |
| customer_message_entries | ticketing/klant | nee | indirect via relatie | ja | nee | nee | ja | middel | Tenant volgt uit thread_id; body en read-status bevatten PII/businesscontext. |
| personnel_message_threads | ticketing/personeel | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; kan assignment/interest-response koppelen. |
| personnel_message_entries | ticketing/personeel | nee | indirect via relatie | ja | nee | nee | ja | middel | Tenant volgt uit thread_id; body kan operationele/securitygevoelige info bevatten. |
| assignment_capacity_checks | smart planning | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; snapshots/samenvattingen kunnen personeels- en opdrachtdata bevatten. |
| assignment_candidates | smart planning | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; scoring/reasons per medewerker zijn gevoelig. |
| assignment_interest_rounds | smart planning | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; invitebeleid en selecties per opdracht. |
| assignment_interest_responses | smart planning | ja | explicit tenant_id | ja | nee | nee | ja | laag | Tenant_id aanwezig; reacties/notities van personeel. |
| planning_sector_rules | smart planning/stamdata | ja | explicit tenant_id | nee | nee | nee | ja | laag | Tenant_id aanwezig; afhankelijk van sectors die nu globaal zijn. |

## Hoogste migratieprioriteiten

1. **Generieke documenten/media**: voeg `tenant_id` toe aan `documents` en valideer storage paths per tenant; behandel `assignment_photos` en `assignment_report_note_attachments` via strikte parent-tenant checks.
2. **Financiële workflow**: overweeg explicit `tenant_id` op `invoices`, `quotes` en `payments` ondanks beschikbare indirecte relaties, zodat finance exports, RLS en joins niet afhankelijk zijn van meerdere parents.
3. **Audit/security**: voeg tenantcontext toe aan `audit_log`, `user_roles`, `code_sequences`, `assignment_code_sequences` en `portal_realtime_events` of documenteer ze expliciet als platform-only met bijbehorende policies.
4. **Stamdata-restpunten**: kies een definitief model voor `task_codes` en `sectors` (globale platformcatalogus versus tenantcatalogus). De huidige kwalificatie- en planningstabellen zijn al tenant-aware, maar verwijzen deels naar globale stamdata.
5. **Notification queues**: tenant_id is aanwezig op de queue/attempt-tabellen; focus vooral op payload-minimalisatie, error-redactie en retentie omdat deze tabellen PII en providerresponses kunnen bevatten.

# Personeelsmeldingen en Fieldgrid-support

Analyse en uitvoeringscontract, 30 september 2026. Baseline: `74966d8c250536466e6e1e988ef114ff6207a000`, schone `main`, bestaande GitHub/VPS-stagingketen. Dit document beschrijft de gekozen implementatie, niet reeds geslaagde controles. Releasebewijs staat in `docs/support/tickets-verification.md`.

## Impactregister en bestaande bronnen

| Onderdeel en concrete bron | Huidig gedrag / hergebruik | Benodigde wijziging en gegevensgrens | Keten, risico en controle |
| --- | --- | --- | --- |
| `lib/auth/context.ts`, `lib/supabase/server.ts`, `proxy.ts`, `tenant_memberships`, `platform_admins` | Supabase-sessie, hostname-tenant, vaste rollen | Ticketcontext scheiden: medewerker, tenantbehandelaar, tenant-support, platform. Actuele sessie, account, tenant en membership op iedere DB-actie controleren | Scherm → serveraction → JWT-client → RPC. Oude JWT/deactivering, verkeerde hostname, dubbele context en pooling testen |
| `private.has_role`, `private.is_member` in `20260928202927_fieldgrid_v1_rls_storage.sql` | Bestaande helpers bevatten algemene platformadmin-uitzondering | Niet hergebruiken als ticketleesrecht. Minimale centrale permissioncatalogus, declaratieve rolmapping en expliciete begrensde grants; geen volledig tweede rollenproduct | Platformidentiteit verleent geen tenantinhoud. Configuratierecht is geen HR-leesrecht. Beperkte HR-scope mag niet worden verruimd door Planning |
| `private.object_session_active`, `lib/objects/auth.ts`, Object 360-kluis | Actuele auth.sessions; objectgebonden OTP | Sessievalidering hergebruiken. Object-OTP niet ten onrechte als algemene beheerbevestiging gebruiken. Gevoelige ticketdelegatie krijgt sessiegebonden recente verificatie | Grant/overdracht → verificatie → actuele grant → transactie/audit; zelfuitbreiding en intrekking testen |
| `app/staff/page.tsx`, `components/fieldgrid/staff-app.tsx`, `public/sw.js` | Eigen inzet, bestaande PWA; alleen publieke offline-shell gecachet | Mijn meldingen, compacte aanmaak, mobiel gesprek, probleem melden bij eigen bon. Geen private offlinequeue of gedeelde ticketcache | Eigen bericht → veilige DTO; collega op dezelfde bon blijft uitgesloten. Logout, 320/390 px, refresh en stale reacties testen |
| `components/fieldgrid/backoffice-shell.tsx`, bestaande lijst/dialog/overlaycomponenten | Tenantbranding, tabelpatroon, popovers buiten scrollcontainer | Aparte personeelsmeldingen en supportlijsten, URL-filters, serverpaginering, gesprekdetail en drie-staps-deelwizard | Geen clientfilter als toegangsgrens; dezelfde query voor rows/tellingen/zoekfunctie/widgets |
| `app/platform/page.tsx`, `platform-console.tsx`, `lib/platform/data.ts` | Platformdashboard gebruikt brede admin-API na platformcheck | Supportdesk krijgt eigen expliciete permissiongrens en DTO; geen brede platformdataset voor ticketafhandeling | Alleen gedeelde inhoud, geen bron-ID/HR/tenantnotities; platformconfiguratie verleent niet automatisch supportinzage |
| `work_orders`, `work_order_assignments`, `lib/work-orders/*`, `app/staff/actions.ts` | Eén operationele bron, eigen inzet en historische toegang | Contextrelaties valideren; probleem melden en ticketwidget zonder uren/planning/prijs of rapportstatus te muteren | Context-ID → actuele toewijzing/moduletoegang → minimale labels. Geen objectcodes, privéadres of andere personeelsbijdragen |
| `lib/customers/data.ts`, `lib/objects/data.ts`, `lib/personnel/dossier-data.ts`, 360-dossiercomponenten | Centrale klant-, object-, personeelsdossiers | Gerichte ticketwidgets uit dezelfde autorisatiequery. HR niet in klant/object; dossierinzage op zichzelf geeft geen ticketinzage | Dossier → ticketquery met contextfilter → toegestane rows; klantportaal krijgt niets |
| `lib/dossiers/download.ts`, `lib/work-orders/report-photo.ts`, Supabase private Storage | Private downloadproxy, PNG/PDF-validatie; geen algemene malwarescan | Eigen quarantaine/finalisatie met echte ClamAV, magic bytes, hercodering/metadatareductie, vijf bestanden/10 MB, quota/rate limits | Uploadintent → private bytes → worker scan → vrijgave → parentbericht → herautoriseerde proxy. Timeout is nooit clean; spoofing, intrekking, weesbestanden testen |
| `app/api/worker/route.ts`, `outbox_events`, `notifications`, `lib/providers/sendgrid.ts`, `lib/communications/email.ts` | Geclaimde outbox, SendGrid, push, hercontrole ontvangers, bestaande tenantmail | Ticket-events op dezelfde worker aansluiten met audiencegebonden ontvangers, generieke notificaties, deliverykeys en voorkeuren. Lease/uitkomst bij netwerkonzekerheid bewaken | DB-transactie → outbox → actuele autorisatie → kanaalregistratie → provider. Geen eigen reactie of vertrouwelijke snippet; retries en intrekking testen |
| `tenant_settings`, onboarding in `app/platform/actions.ts`, platformmodulecontract | Vier bestaande modules, geen ticketflag/catalogus | Tickets apart activeren; standaardcategorieën idempotent bij bestaande/nieuwe tenants. Routing/configuratie bewaart maatwerk | Modulebeschikbaarheid is geen uitvoerrecht. HR zonder intake nooit algemeen routeren; tweemaal seeden testen |
| `audit_events`, privacy-/dossierdocumentatie | Audit en archivering, geen vastgesteld ticketbewaarprofiel | Onveranderlijke publiek/tenant/platform-audiences, beperkte auditmetadata, expliciete archivering/redactie; geen verzonnen destructieve bewaartermijn | Geen algemene HR-tekstlogs. Oude berichten niet stilzwijgend breder publiceren |
| `.github/workflows/_verify.yml`, `deploy-staging.yml`, `scripts/work-order-test-target.mjs`, runbook | Main-CI, bewuste exact-SHA-stagingpromotie, backup vóór migratie, geverifieerde TLS en health-SHA | Ticketchecks toevoegen, scan/worker gereedheid aantonen vóór GO; gecontroleerde smoke zonder echte personen te mailen | Geen productieverbinding, geen remote reset, geen bypass. Fresh schema, baseline-upgrade, RLS/runtime, browser en post-deploy |

## Actor- en zichtbaarheidsmatrix

| Context | Eigen openbare melding | Operationeel intern | Vertrouwelijk HR | Tenant-support | Tenantnotitie | Platformnotitie | Beheer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Medewerker | Alleen zelf, actuele personeelsrelatie | Geen collega-inhoud | Alleen eigen meldergesprek | Nee | Nee | Nee | Nee |
| Tenantbehandelaar | Volgens concrete ticketrechten | Passend recht én categorie/recordscope | Afzonderlijk vertrouwelijk recht én eigen scope | Alleen expliciet supportrecht | Alleen bevoegde tickets | Nee | Afzonderlijk config/delegatierecht |
| Tenant-supportcontact | Geen impliciete personeelsinzage | Alleen apart intern recht | Niet door supportrecht | Eigen toegestane tenant/scope | Volgens apart notitierecht | Nee | Niet automatisch |
| Platform-support | Geen | Geen | Geen | Alleen expliciete supportscope | Nee | Volgens platformnotitierecht | Apart platformconfiguratierecht |
| Tenant-/platformbeheerder zonder inhoudsrecht | Geen beheerdersuitzondering | Volgens expliciete mapping/grant | Niet door beheerrecht | Niet door beheerrecht | Niet door beheerrecht | Niet door beheerrecht | Beheer geeft geen inhoud |
| Klantcontact | Geen | Geen | Geen | Geen | Geen | Geen | Geen |

De repository bevat geen custom-rolleneditor, centraal rechtenregister, uitvoeringscoördinator- of verkooprol. De minimale centrale laag sluit daarom aan op de werkelijk aanwezige `app_role`/memberships. Catalogus, delegatie, scope en autorisatie zijn één bron; geen ticket-isAdminflags of extra medewerkersallowlists. Bestaande globale autorisatie wordt niet in deze opdracht volledig vervangen. Instellingen/delegatie blijven gescheiden van ticketinhoud.

## Contracten en integratiekeuzes

- Eén engine, twee onveranderlijke routes `internal` en `platform_support`; alle tickets hebben een echte tenant. Bronlinks staan apart beschermd. De platformprojectie bevat nooit de interne bronreferentie.
- Vier servergecontroleerde werkruimten: `staff`, `tenant`, `support`, `platform`; routes `/staff/meldingen`, `/app/meldingen`, `/app/support`, `/platform/support`, met eigen detail en instellingen. De gekozen context is geen bewijs van bevoegdheid.
- Centrale RPC-grens: `ticket_query(target_tenant, actor_context, operation, payload)` en `ticket_command(target_tenant, actor_context, command, payload, request_id)`. Gewone applicatieverzoeken gebruiken de JWT-client, geen service-rolefallback. Workers krijgen afzonderlijke begrensde service-only functies.
- Berichten zijn append-only met `reporter`, `tenant` of `platform` audience. Snippets, aantallen, leesstatus, tijdlijn, activiteit en revisie volgen de zichtbare projectie. Toewijzing verleent geen extra recht. Gepubliceerde zichtbaarheid verandert niet via PATCH.
- Statusmachine: nieuw → in behandeling → wachten/opgelost; oplossing verplicht; melderreactie hervat alleen daarvoor geldige statussen; expliciet bevestigen/sluiten/heropenen/intrekken. Interne notities veranderen de publieke status niet. Commands zijn transactioneel, revision-checked en idempotent.
- Doorsturen maakt een afzonderlijk supportticket met alleen beoordeelde tekst en expliciet geselecteerde vrijgegeven bestanden. HR-bronnen zijn niet deelbaar. Beide statussen blijven onafhankelijk. Een antwoord aan personeel blijft een expliciet te verzenden concept.
- Private uploads worden eerst gecontroleerd. Onvoltooide intent/kopie/scans zijn geen beschikbaar berichtbestand. Geen preview/download vóór vrijgave. Een beveiligde proxy hercontroleert actuele parent/audience-toegang; geen herbruikbare publieke downloadlink.
- Termijnen gebruiken openingstijden/tijdzone en expliciete wachtregels; inhoudelijke publieke reactie telt, ontvangst/notitie niet. Sluitjobs hercontroleren status/revisie onder lock. Geen fictieve SLA of automatische purge zonder vastgesteld bewaarbeleid.
- Geen nieuwe realtime-infrastructuur. Request-time SSR, veilige refresh na mutaties en beperkte polling; geen persistente browseropslag voor ticketinhoud.

## Uitvoeringsplan

1. Analyse/contracten en rechtenmatrix vastleggen; aanwezige scan-/workerconfiguratie onderzoeken.
2. Centrale permissionlaag en ticketdatamodel, constraints, RLS/FORCE RLS, scopes, seed/onboarding en geautoriseerde RPCs lokaal query-first bouwen. Daarna migratie genereren en fresh/upgrade valideren.
3. Serverdata/actions, statusmachine, contextvalidatie, conflict/retry en geminimaliseerde projecties aansluiten.
4. Quarantaine, echte scanworker, upload/download, delen, outbox/notificaties en deadlinejobs aansluiten op bestaande voorzieningen.
5. Herbruikbare lijst/gesprek/wizards/instellingen en navigatie/dossierwidgets implementeren met bestaande tokens; echte browserflows op 320/390/tablet/desktop.
6. Positieve én negatieve tests met twee tenants/twee medewerkers, beperkte HR-scope, losse platformrechten en ingetrokken sessies. Bestaande werkbon/dossier/commerciële/mailflows opnieuw verifiëren.
7. Expliciete GO/NO-GO vastleggen. Alleen bij complete scan/worker/runtimegereedheid en groene controles committen, main pushen, groene SHA promoveren, staging controleren. Geen productie.

## Geïmplementeerde bestanden

- `supabase/migrations/20260930192504_tickets_support.sql` en
  `20260930192516_ticket_files_delivery.sql` bevatten de lokaal opgebouwde en
  gecontroleerde schema-/RPC-wijzigingen; er is geen tweede SQL-bron buiten het
  bestaande migratieproces.
- `lib/tickets`, `app/tickets/actions.ts`, `app/api/tickets` en
  `components/fieldgrid/tickets` bevatten de gedeelde engine-integratie,
  autorisatieprojecties, bestanden, bezorging en schermcomponenten. De vier
  werkruimten gebruiken dezezelfde laag.
- De bestaande worker verwerkt ook tickettermijnen, scanleases, notificaties
  en verlopen uploaddrafts. `lib/operations/worker-request.ts` begrenst de
  staging-loopbacktoegang; `scripts/check-worker-timer.sh` controleert een verse
  uitvoering zonder VPS-units te installeren of te herladen.
- CI gebruikt de echte geïsoleerde scanner via
  `scripts/start-ticket-test-scanner.sh`. De stagingconfiguratie en
  operatorsstappen staan in het [releaserunbook](../support/tickets-release-runbook.md).

Dit beschrijft aanwezige code, niet een afgeronde release. Alleen het
[verificatiebestand](../support/tickets-verification.md) geeft de actuele
testresultaten en het GO/NO-GO-besluit weer.

## Bekende afhankelijkheden bij aanvang

Bij aanvang bevatte GitHub Environment staging de bestaande providercredentials,
maar ontbrak nog operationeel scannerbewijs. Inmiddels zijn ClamAV en de
gescheiden VPS-identiteiten door de operator bevestigd en is de worker-timer
bewust gepauzeerd voor de eerste beveiligde promotie. Scannerproeven via de
daadwerkelijk gedeployde app en een verse workeruitvoering blijven
releasevoorwaarden; scannerfouten mogen nooit als schoon worden behandeld en
notificatiewerking wordt niet vooraf geclaimd. Er is geen bestaande
privacybeslissing voor ticketbewaartermijnen: automatische destructieve purge
blijft uit totdat die is vastgesteld.

## Geraadpleegde technische bronnen

Lokale Next 16.3.6 Server Actions- en Route Handler-documentatie; Supabase JS 2.117.2, SSR 0.12.7 en CLI 2.118.0. De changelog is gecontroleerd; geen databaseversie- of cipherupgrade onderdeel van deze opdracht. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [private Storage](https://supabase.com/docs/guides/storage/security/access-control), [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [OWASP uploadcontrole](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [OWASP autorisatie](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

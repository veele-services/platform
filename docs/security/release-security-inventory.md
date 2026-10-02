# Release-inventaris — dekking en resterende controle

De oorspronkelijke scan telde 669 bronbestanden en was alleen een
bestandsinventaris. De verse Codex Security Standard-scan inventariseerde 781
bestanden en vond nul rapporteerbare bevindingen binnen de gewijzigde/ongetrackte
implementatie en de beveiligingskritieke grenzen. De algemene codedekking bleef
partieel omdat niet ieder ongewijzigd presentatie-, documentatie- en fixturebestand
regel voor regel is onderzocht. Alle daadwerkelijk ontdekte autorisatie- en
dataoppervlakken hebben inmiddels wel een expliciete voltooide status en
bewijsverwijzing. Operationele stagingvoorwaarden blijven NO-GO.

De structurele CI-inventaris `authorization-surfaces.json` beschrijft **834**
ingangen/resources uit de huidige bron en een schone database met 55 migraties:

| Soort | Aantal | Wat de registratie bewijst |
| --- | ---: | --- |
| Server-actionmodules | 27 | Exportnamen, waargenomen helpers en letterlijke tabel/RPC-afhankelijkheden |
| Routes en RSC-pagina's/layouts | 94 | Bestaande ingangen, inclusief publieke schermen zonder datahelper |
| Overige data-accessmodules | 44 | Gevonden queries/RPC's, indirecte autorisatiehelpers, servercomponenten, browser-/Realtimeclients en privileged-clientaanmaak |
| Operationele releasepaden | 51 | Inhoudshashes van alle ontdekte workflows/deploybestanden plus package/lock/config, serviceworker, migratiemanifest en runtime-/backup-/migratiescripts, inclusief de vier stagingmigratie-trust-boundaries |
| Public/private tabellen | 177 | RLS/FORCE en effectieve basisgrants |
| Public RPC's | 167 | Signatuur, definerstatus en executegrants |
| Private functies | 181 | Signatuur, definerstatus en executegrants |
| Triggerfuncties | 93 | Apart van rechtstreeks aanroepbare RPC's geclassificeerd |

`scripts/check-security-surface.mjs` laat CI falen bij toegevoegde/verwijderde
ingangen, gewijzigde resources of grants. Een reviewer moet de wijziging,
actor/resourcegrens en passende tests beoordelen vóór snapshotvernieuwing.
`--capture` produceert uitsluitend metadata, **geen auditgoedkeuring**.
Dynamische querynamen, indirecte calls en gewijzigde functie-inhoud vereisen
nog steeds bronreview. De snapshot is geen vervanging voor de onderstaande
inhoudelijke dekking of de verplichte actor/resource-tests.
De inventaris omvat nu ook `components` met serverdata, browserclients en
helpermodules die alleen een indirecte auth/provider-/bestandscontrole uitvoeren;
deze paden konden eerder buiten de structurele diffgate blijven.
`authorization-review.json` koppelt ieder van de 834 IDs aan een expliciete
status en bewijsset. `scripts/check-authorization-review.mjs` faalt bij een
ontbrekend, dubbel, verouderd, onbewezen, `pending` of `blocked` item. De
`--capture`-stand neemt bestaande beoordelingen over maar zet iedere nieuw
ontdekte ingang bewust op `pending`; een snapshotvernieuwing kan haar dus niet
automatisch goedkeuren. Iedere code-, SQL-functie-, policyset- en operationele
review is aan de actuele SHA-256-vingerafdruk gebonden; alleen een snapshot
bijwerken kan een inhoudswijziging daardoor niet als eerder beoordeeld laten gelden.

| Oppervlak | Gedaan | Nog open |
| --- | --- | --- |
| Identiteit/tenant | Live sessie/account/membership/tenant, platformbypass en redirectgrens hersteld; echte JWT-intrekking getest; platform-onboarding eenmaal gebonden aan oorspronkelijke ontvanger, ingetrokken bevoegdheid blijft ingetrokken | Deployed sessie-, cookie- en hostnameacceptatie |
| Directe gegevens | Catalogus, RLS/grants/search_path, gewone principals, service-RPC's, triggers en defaults bekeken; per-object reviewledger plus CI-gate | Stagingcatalogus en migratiedrift na uitrol vergelijken |
| Personeel/werkbon | Eigen bijdragen, rapportprojecties, checklistcondities, lineage, signatures, downloads en taakmutaties getest; legacy HR-rijen dossier-only; eigen documenten en selfservice apart getoetst; planner krijgt beschikbaarheid zonder verzuimreden/interne bron-ID | Retentiebeleid blijft een eigenaarsbeslissing |
| Klant/object/commercieel | Dossier-, binding-, vault/OTP-, offerte/boeking- en concurrencytests; loaders/actions staan in de reviewledger; publieke intake, offertebeslissing/-bestand en boeking toetsen Planning vóór fresh write én replay; bestaande objectbinding blokkeert klantverplaatsing, inclusief gelijktijdige directe INSERT; archiveren/herstellen/verwijderen volgt beheerdersrol | Publieke intake via de echte wildcardhost op staging accepteren |
| Bestanden | Alle gevonden byte-upload/downloadcalls via ticketpipeline of gedeelde scangateway; namespace, hash, intrekking en echte AV getest | Historische signed-URL-afloop; operationele afhandeling oude bestanden boven 10 MB |
| Realtime/browser | Eigen/collega INSERT/DELETE werkelijk getest; publicatie INSERT/UPDATE; SW bewaart shell; geen vrije zoektekst meer in opslag; logout/Back/vertraagde hydration met echte accounts getest | Volledige log-/retentiecontrole; URL-filters in browsergeschiedenis zijn niet gewist |
| Reistijden | Actuele scope vóór opslag en na I/O, sessiegebonden handmatige opslag en herautorisatie van historische verwijzingen; dag/persoonsidentiteit onveranderlijk en privévertrekadres niet wijzigbaar/verwijderbaar door gewone planner | Deployed provider-/schemaconfiguratie |
| Betaling/capability | Gedeelde token-intrekking; providerwrites/settlement afgeschermd; uitgegeven bundels en definitieve bronregels onveranderlijk; atomische voorbereiding en retries, huidige modulecontrole en betaling/finalisatiereplay-concurrency getest; de complete stagingmigratiehistorie is bevestigd | Werkelijke Mollie-testbetaling en deployed runtimegedrag nog niet geaccepteerd |
| Modulegrenzen/werkbonmeldingen | Tenant kan entitlements niet via verwijderen/heraanmaken/verplaatsen omzeilen; secundaire moduledata in dossier/staffprojectie afgeschermd; dispatchreplay gebonden; personeel ziet alleen eigen werkbonmeldingen/eigen bewijs; indirecte helpers zijn structureel geïnventariseerd | Deployed entitlementgedrag na migratie accepteren |
| Tickets/notificaties/mail | Scope-, lease-, providerpermit-, hook-, ontvanger-, bytes- en retrytests; upgrade behoudt historie. Bestaande grants ook na rowlock begrensd, globale concepttemplates niet naar tenant, actuele leesbevestigingen/herinneringen en minimale nieuwe klantaudit; routehelpers staan in de reviewledger | Werkelijke provideractivatie/levering en historische auditretentie |
| Deployment | Standalone guards/TLS, geheimvrije argv/logs, runtime.env, backupretry, CI-gates; externe acties op volledige commit-SHA en stagingsecrets uitsluitend per noodzakelijke stap; workersecret niet in procesargumenten; root-only key/trust/runtimecontrole strikt gescheiden van runnercontrole; echte Linux-UID/GID- en directoryrechten getest; runner online, stagingunits geïnstalleerd en operatorbewijs voor UIDs/socket. De eerste promotiepoging bewees backup, forwardmigraties, 55-regel-historie, versleutelde runtime en attestaties; activatie stopte fail-closed vóór installatie | Gecorrigeerde broker installeren en beide contractcontroles herhalen; daarna runtime-/backupinstallatie, web-health/exacte SHA, timer hervatten, verse workeruitvoering, scanner na daemonherstart, geïsoleerde restore en provideracceptatie |

## Werkelijk gecontroleerde lokale catalogus

De schone release-replaydatabase op `127.0.0.1:60322` heeft public **112/112**
tabellen met RLS én FORCE RLS, private **65/65** met RLS (**48/65** FORCE) en
Storage **10/10** met RLS. Alle negen applicatiebuckets zijn private. Er zijn
geen public/private views of materialized views in deze migraties.

De 17 private tabellen zonder FORCE zijn legacy commandreceipts, objectvault/
OTP/audit, routecache/revisies en de personeelsnummercounter. Zij hebben wel RLS;
alleen die counter heeft gewone SELECT/INSERT/UPDATE-grants, met expliciete
HR/management/tenantadmin- en modulepolicy. Overige private tabellen hebben geen
gewone grants. De eigenaar `postgres` heeft BYPASSRLS; FORCE zou die rol niet
begrenzen. Alleen beperkte callerrollen bewijzen gewone autorisatie. Verdere
inhoudelijke beoordeling van iedere definer blijft verplicht.

Alle public/private definers hebben een lege `search_path`. Geen gewone
applicatietabel of niet-triggerfunctie is rechtstreeks voor `anon` toegankelijk.
`scripts/test-security-catalog.mjs` bewaakt deze eigenschappen en de bestaande
service-only RPC's. De vier private triggerfuncties met historische PUBLIC
execute zijn geen rechtstreeks aanroepbare RPC's; de triggerbody blijft een
apart reviewoppervlak. `anon`/`authenticated` hebben geen superuser/BYPASSRLS/
CREATEROLE of membership in een privileged rol.

De oorspronkelijke lokale werkdatabase op 59322 bevat daarnaast het bestaande
niet-geactiveerde query-first rollenprototype. Dat is verklaarde lokale drift,
geen onderdeel van het release-artifact. De metadata-snapshot en replayproeven
gebruiken daarom de geïsoleerde migratiedatabase. Staging is niet onderzocht
met databasecredentials; productie is niet benaderd.

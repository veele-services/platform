# Release-inventaris — dekking en resterende controle

De oorspronkelijke scan telde 669 bronbestanden en was alleen een
bestandsinventaris. De Codex Security Standard-scan van de eerdere
releasekandidaat inventariseerde 781 bestanden en vond toen nul rapporteerbare
bevindingen binnen de onderzochte gewijzigde/ongetrackte implementatie en de
beveiligingskritieke grenzen. Dat is historisch bewijs en wordt niet als een
nieuwe scan van de huidige release gepresenteerd. De actuele klantportaal-,
OTP- en huisstijlwijzigingen en de eerdere personeelswijzigingen zijn hieronder
afzonderlijk op bron, actor/resourcegrens, grants en regressies beoordeeld.
Alle daadwerkelijk ontdekte autorisatie- en dataoppervlakken hebben
een expliciete voltooide status en bewijsverwijzing. Operationele
stagingvoorwaarden blijven NO-GO totdat de uiteindelijke SHA is uitgerold en
geaccepteerd.

De structurele CI-inventaris `authorization-surfaces.json` beschrijft **983**
ingangen/resources uit de huidige bron en een schone database met 109 migraties:

| Soort | Aantal | Wat de registratie bewijst |
| --- | ---: | --- |
| Server-actionmodules | 42 | Exportnamen, waargenomen helpers en letterlijke tabel/RPC-afhankelijkheden |
| Routes en RSC-pagina's/layouts | 102 | Bestaande ingangen, inclusief publieke schermen zonder datahelper |
| Overige data-accessmodules | 55 | Gevonden queries/RPC's, indirecte autorisatiehelpers, servercomponenten, browser-/Realtimeclients en privileged-clientaanmaak |
| Operationele releasepaden | 56 | Inhoudshashes van alle ontdekte workflows/deploybestanden plus package/lock/config, serviceworker, migratiemanifest en runtime-/backup-/migratiescripts, inclusief de vier stagingmigratie-trust-boundaries, de releasegebonden ClamAV-preflight en de publieke OTP-redirectcontrole |
| Public/private tabellen | 188 | RLS/FORCE en effectieve basisgrants |
| Public RPC's | 216 | Signatuur, definerstatus en executegrants |
| Private functies | 213 | Signatuur, definerstatus en executegrants |
| Triggerfuncties | 111 | Apart van rechtstreeks aanroepbare RPC's geclassificeerd |

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
`authorization-review.json` koppelt ieder van de 983 IDs aan een expliciete
status en bewijsset. `scripts/check-authorization-review.mjs` faalt bij een
ontbrekend, dubbel, verouderd, onbewezen, `pending` of `blocked` item. De
`--capture`-stand neemt bestaande beoordelingen over maar zet iedere nieuw
ontdekte ingang bewust op `pending`; een snapshotvernieuwing kan haar dus niet
automatisch goedkeuren. Iedere code-, SQL-functie-, policyset- en operationele
review is aan de actuele SHA-256-vingerafdruk gebonden; alleen een snapshot
bijwerken kan een inhoudswijziging daardoor niet als eerder beoordeeld laten gelden.

### Klantportaal, universele OTP en huisstijl — 5 oktober 2026

Ten opzichte van de gedeployde baseline `1f47c7b8` zijn 165 oppervlakken
inhoudelijk beoordeeld: 98 nieuw en 67 gewijzigd, zonder verwijderingen.
De finale ledger kent deze delta 145 keer `controlled` en 20 keer
`corrected-and-rechecked` toe. De bronreviews en concrete regressies staan in
[de integratiecontrole](portal-release-verification-2026-10-05.md) en de daar
gekoppelde afzonderlijke reviews voor klantprojecties, OTP en huisstijl.
De publieke standalone-redirect is daarna afzonderlijk gecorrigeerd en
opnieuw beoordeeld; zie [het regressiebewijs](staging-redirect-verification-2026-10-05.md).

De review omvat exacte account-/object-/bezoekgrenzen, intrekking tijdens
asynchrone verwerking en lockwachten, klantkopieën van rapporten, expliciete
merchantbinding en reserveringen, deferred notificaties met bronmomentbeleid,
accountprovisioning zonder uitgegeven wachtwoord of sessie en centrale
huisstijl met versiecontrole. Alle 57 reeds gedeployde migratiehashes blijven
exact behouden. Structurele classificatie, inhoudelijke review en lokale
regressies vervangen de finale CI-, browser- en staginggates niet. Hosted
mailhookactivatie blijft een afzonderlijke operatorhandeling.

### Personeelsapp-review — 5 oktober 2026

Deze eerdere review beschrijft de personeelsapp-baseline vóór de hierboven
beoordeelde uitbreiding van OTP naar alle werkruimtes.

De personeelsapp en de gedeelde compacte-filterwijzigingen veranderden 117
geregistreerde oppervlakken: 26 code-ingangen, 40 tabel-/policyoppervlakken,
48 functies en drie operationele bestanden. Daarvan zijn er 47 nieuw en 70
inhoudelijk gewijzigd; er is geen oppervlak verwijderd of alleen op naam
verplaatst. De review heeft niet de oude status overgenomen: capture zette alle
117 fingerprints eerst op `pending`, waarna ieder item aan concrete bronreview
en bestaand regressiebewijs is gekoppeld. De eindclassificatie is 74
`controlled`, 42 `corrected-and-rechecked` en één `not-applicable`: de nieuwe
staff-layout importeert alleen CSS en rendert `children`; iedere onderliggende
route houdt haar eigen sessie- en capabilitygrens.

- Identiteit en profiel: de personeels-OTP blijft beperkt tot `/staff`, maakt
  geen account aan, geeft onbekende adressen dezelfde response en controleert na
  OTP opnieuw actieve staffrol, tenant en personeelskaart. Profiel, onboarding,
  beschikbaarheid, verlof en uren gebruiken een veldallowlist, actuele
  objectsessie, module- en rolcontrole, own-recordscope en optimistic locking.
  Bewijs: `lib/auth/staff-login*.test.ts`, `tests/e2e/staff-login.spec.ts` en
  `supabase/tests/database/staff_personnel_app.sql`.
- Herstel en preflight: een ontbrekende/inactieve personeelskaart toont herstel
  vóór profielgebonden notificatie-RPC's. Ticket-/notificatieshells laden geen
  impliciet personeel-workspace. Rapportbijlagen worden vóór byteverwerking
  geautoriseerd; publicatie herhaalt de live check en voert één scan uit.
  Bewijs: `lib/staff/route-boundaries.test.ts`,
  `lib/staff/report-upload-action.test.ts` en de 10 groene HTTP/security-tests
  op 2026-10-05. De vier gewijzigde codefingerprints zijn opnieuw beoordeeld.
- Managementbesluiten: verlofsaldo, verlofbeoordeling,
  beschikbaarheidsvrijgave en urencorrectiebeoordeling vereisen een actieve
  tenantcontext plus tenantadmin/management/HR. De correctieflow verifieert de
  vastgelegde bronversie en inhoud, voorkomt overlap, audit voor/na en dwingt na
  wijziging expliciete herbevestiging af. Bewijs: de 138 gerichte assertions in
  `staff_personnel_app.sql` en de dossierflows in
  `tests/e2e/personnel-dossier.spec.ts`.
- Werkbon en rapport: staff schrijft alleen binnen een actuele eigen dispatch en
  actieve personeel/planning/rapportagemodules. Directe staffwrites naar
  rapportregels/bijlagen en de onversioneerde taakshortcut zijn gesloten;
  idempotente RPC's bewaken versies, eigenaarschap, scannerattest, exacte
  rapporthash en ondertekenprojectie. Bewijs:
  `staff_direct_rpc_guards.sql`, `staff_report_upload_finalize.sql`,
  `scripts/test-release-security.mjs` en
  `scripts/test-release-storage-http.mjs`.
- Projectie en realtime: `staff_workspace` projecteert alleen de eigen
  personeelskaart en actuele/toegestane werkbonrelaties. De browser valideert de
  complete DTO strict. Alle rijke brontabellen zijn uit de Realtime-publicatie;
  alleen de tenantgebonden revisionrij is leesbaar en niet schrijfbaar. De
  gerichte pgTAP-test controleert iedere brontrigger, de RLS/grants en de enige
  gepubliceerde relatie; `scripts/test-personnel-privacy.mjs` en
  `scripts/test-planboard.mjs` controleren de gedeelde projectiegrenzen.
- Catalogus en operatie: alle public tabellen hebben RLS én FORCE RLS, definers
  hebben een lege `search_path`, anon heeft geen applicatietabel of niet-trigger-
  RPC en de private receipt-/financegrenzen hebben geen gewone grants. De hogere
  Server Action-limiet is alleen transport voor maximaal vijf al begrensde en
  gescande rapportbijlagen; de action en databasefinalisatie blijven de
  autorisatiegrens. Bewijs: `scripts/test-security-catalog.mjs`,
  `lib/staff/report-upload-action.test.ts`, de HTTP-scannergate en het
  migratiemanifest voor alle 57 inhoudshashes.

De verhoging van de Next.js Server Action-bodylimiet naar 55 MB is begrensd op
de maximale vijf rapportbijlagen van ieder 10 MB en wordt daarna door
inhoudsvalidatie, scanner, herautorisatie en atomische databasefinalisatie
afgedwongen. Parsing vindt echter plaats vóór de action-autorisatie. Een
reverse-proxy/rate-limit en monitoring blijven daarom een operationele
beschikbaarheidsmaatregel; dit is geen verruiming van data- of mutatierechten.
De hosted Supabase OTP-instellingen en echte tenant-host code/replay-smoke
blijven eveneens stagingacceptatie en worden niet door de repositorydeploy
geconfigureerd.

Deze handmatige, fingerprintgebonden review is geen nieuwe Codex Security
Standard-scan en geen stagingacceptatie. De huidige bronsecretcontrole bekeek
798 tekstbestanden zonder herkend credentialformat; onbekende formats en
Git-historie vallen buiten die specifieke controle.

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
| Deployment | Standalone guards/TLS, geheimvrije argv/logs, runtime.env, backupretry, CI-gates; externe acties op volledige commit-SHA en stagingsecrets uitsluitend per noodzakelijke stap; workersecret niet in procesargumenten; root-only key/trust/runtimecontrole strikt gescheiden van runnercontrole; echte Linux-UID/GID- en directoryrechten getest. Het unit/preflightincident is opgelost; geïnstalleerde webunit, runnerchecker en broker matchen hun gepubliceerde hashes. Exact `d9084380` is actief en database-ready, maar health blijft HTTP 503 doordat clamd `VERSION` is uitgeschakeld; de timer blijft uit | De lokaal uitgebreide rootchecker/configremedie is nog niet op de host geïnstalleerd of bewezen. Daarna ontbreken nog gezonde exact-SHA web/scannerhealth, een verse workeruitvoering, geïsoleerde restore en provideracceptatie |

## Instellingencontactactie-review — 5 oktober 2026

`updateStaffContact` accepteert uitsluitend de verwachte personeelsversie,
naam en mobiel. De action resolveert de tenant uit de bestaande actuele
staffcontext, vereist de personeelsmodule en staffrol en roept met de gewone
sessie `staff_update_profile` aan. Die RPC bepaalt de medewerker uit de actor;
de browser kan geen tenant, medewerker, login-e-mail of overige profielvelden
kiezen. De teruggegeven versie blijft bij het zichtbare formulier. Bestaande
centrale meldingsvoorkeuren gebruiken `preferences_save` met hun eigen versie
en request-ID; apparaatregistratie en uitloggen behouden hun bestaande routes.

Gericht bewijs: negen gevallen in `lib/staff/contact-action.test.ts` toetsen
de beperkte velden, rol/module/tenantgrens en conflictafhandeling.
`tests/e2e/staff-settings.spec.ts` bewijst echte eigen-profielopslag zonder
andere dossierwijzigingen, opeenvolgende saves, voorkeurenopslag, conflictbehoud,
apparaatbediening en intrekking van de sessie bij uitloggen. De twee gewijzigde
code-oppervlakken zijn handmatig vergeleken; databasegrants en RPC's zijn niet
veranderd. Dit is een gerichte bronreview, geen brede eindcontrole of
stagingacceptatie.

## Werkelijk gecontroleerde lokale catalogus

De schone release-replaydatabase op `127.0.0.1:60322` heeft public **118/118**
tabellen met RLS én FORCE RLS, private **66/66** met RLS (**49/66** FORCE) en
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

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

## Planningstatus na uitgestelde indeling — 5 oktober 2026

De forward migratie `20261005201500_work_order_planning_state.sql` wijzigt uitsluitend
de bestaande planningtransactie en haar private snapshot. Eerste personeelsindeling
zet `unassigned` om naar `tentative`; verwijderen en undo bewaren de status bij de
uitvoering en haar historie. Publicatie, bestaande definitieve bonnen, arbeidsbudget,
klantvenster en feitelijke uitvoering worden niet aangepast door deze overgang.

De bronreview bevestigt behoud van de bestaande tenant-/planningsrolcontrole,
actuele sessie-/modulecontrole via `private.planning_access`, tenantlock,
versiecontrole, actor-/bongebonden herhaalsleutel, overlap-/beschikbaarheidsvalidatie
en undo-controle. Beide functies behouden hun lege `search_path` en bestaande
EXECUTE-grants. De private snapshot blijft ontoegankelijk voor Data API-rollen.

Een schone lokale replay behoudt alle 110 bestaande statementhashes en voegt één
forward hash toe. `scripts/test-planboard.mjs` slaagt met 10 controles, inclusief
statusovergang, expliciete afwijkingsbevestiging, retry, verwijderen, undo en behoud
van definitieve status. De gerichte werkbon-, RPC-, module- en releaseguardregressies
slagen met 29 controles. Het manifest en uitsluitend de drie daardoor gewijzigde
autorisatievingerafdrukken zijn na deze review bijgewerkt. De verplichte release-CI
en stagingacceptatie blijven afzonderlijke controles vóór een deploymentclaim.

## Portaalreeks bronreview vóór deployment — 5 oktober 2026

De vier gewijzigde bronbestanden hieronder zijn opnieuw vergeleken met de
laatste `main`-release. Hun exports, classificaties, waargenomen controles en
gegevensbronnen blijven gelijk; de opgeslagen bronhash moest worden vernieuwd.

- `app/app/operations-actions.ts`: `invitePersonnel` schrijft het ingevulde
  nummer naar `mobile_phone`. Actuele tenant/rol/module, dubbele-accountcontrole,
  bestaande lidmaatschappen en de overige uitnodigingsgrenzen blijven behouden.
  Bewijs: `lib/personnel/invitation-action.test.ts` en de bestaande
  uitnodigingsbrowsertests in de volledige release-CI.
- `app/auth/invite/actions.ts`: alleen de fouttekst verwijst naar de gewone
  e-mailcode-login. Geïsoleerde OTP-verificatie, actieve eigen staffbinding,
  sessie-intrekking en de publieke loginredirect blijven gelijk. Bewijs:
  `lib/auth/invite-form.test.ts` en de bestaande uitnodigings-/OTP-flows in CI.
- `components/fieldgrid/staff/route-shell.tsx`: alleen de portaalstijl wijzigt.
  De server bepaalt de actuele tenant, actorKey en ticketmodule; bestaande
  ticket- en notificatieroutes blijven de toegangsgrens.
- `components/fieldgrid/staff/route-shell-client.tsx`: navigatietekst/iconen en
  de ticketingang veranderen. Zonder module opent de ingang alleen uitleg;
  met module gebruikt zij de bestaande route. De sessiegebonden,
  tenantgefilterde Realtime-revisieabonnementen, refresh en uitloggen blijven
  gelijk. Bewijs: `lib/staff/route-boundaries.test.ts`,
  `tests/e2e/staff-appearance.spec.ts` en de bestaande route-/modulebrowsertests.

Alle 1.420 lokale unittests, lint en TypeScript zijn geslaagd vóór het bijwerken
van deze vier fingerprintgebonden reviewregels. De verplichte volledige CI en
deployed acceptatie blijven afzonderlijke releasecontroles; deze bronreview
verklaart geen deployment geslaagd.

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
# Personeelsapp prototypevormgeving — 6 oktober 2026

De wijzigingen in `components/fieldgrid/staff/personnel-app.tsx` en
`components/fieldgrid/staff/route-shell-client.tsx` zijn opnieuw op bronniveau
gecontroleerd. De nieuwe Meer-kaarten gebruiken dezelfde views, ticketmodule,
notificatieroute en `toggleShiftInterest`-actie. Uitloggen blijft een POST naar
`/auth/signout`. Alleen presentatie en iconen veranderen; geen query,
workspaceprojectie, realtimefilter, versiecontrole, servercommando of
autorisatievoorwaarde is verruimd. De mobiele navigatie en het profielmenu
behouden hun bestaande routes en toetsenbordbediening.

Gerichte controle: `tests/e2e/staff-appearance.spec.ts` controleert de
bereikbaarheid van alle Meer-acties, modulegrenzen, focusreturn, zichtbare
offlinestatus, tap targets en overflow op 320, 390, 768 en 1440 px.

### Personeelsapp schermen en popupcontainers — 6 oktober 2026

De wijzigingen in `app/staff/layout.tsx`, `personnel-app.tsx`, `staff-app.tsx`
en de gedeelde ticket-/notificatiecomponenten zijn afzonderlijk op bron
beoordeeld. De staffklassen en kleuren zijn alleen presentatie. De ticket- en
notificatieworkspace, opties, categorieën, uploadscan, versie-/idempotencykeys,
busy-/dirtybeveiliging, acties en servervoorwaarden blijven dezelfde.
`notifications/routes.tsx` behoudt alle context-, bevoegdheids-, ID- en
eigendomscontroles vóór de pagina wordt gerenderd. De objecttoegang blijft een
link naar de bestaande beveiligde bezoekroute; er komt geen toegangscode in
het werkbonvenster terecht.

De focushelper verplaatst uitsluitend DOM-focus bij openen/sluiten. De nieuwe
staffwrapper houdt de bestaande Radix-focusval en sluitvoorwaarden. De
herstelwijziging voor tabnavigatie past de URL alleen bij een gewijzigde query
toe; datarefresh en het tenantgebonden `staff_workspace_revisions`-kanaal
blijven actief. Broncontrols, exports en resources zijn onveranderd volgens de
structurele codeparser; uitsluitend de inhoudshashes wijzigen.

Gericht bewijs staat in `tests/e2e/staff-popups.spec.ts`,
`tests/e2e/staff-appearance.spec.ts` en de bestaande personeels-, ticket- en
notificatieflows. De aanvullende uitvoeringspopupfixture gebruikt uitsluitend
de gecontroleerde lokale database, bewaart/herstelt de oorspronkelijke status
en dient geen rapport-, meerwerk- of tijdcommando in. Zie ook
`docs/implementation/staff-prototype-visual-alignment.md` voor de visuele
inventaris, de behouden functies en de precieze grenzen van de browserdekking.

### Personeelslogin prototypevormgeving — 6 oktober 2026

`app/login/page.tsx` verandert uitsluitend de presentatie voor een bestemming
die al door `isStaffLoginDestination` wordt herkend. `getLoginBrand`, de
hostgebonden tenantcontext, het universele `LoginForm` en de bestaande
`loginOtp`-actie zijn ongewijzigd. Andere werkruimtes krijgen de bestaande
loginpresentatie. Er is geen prototype-OTP, nieuwe accountaanmaak,
authenticator, bypass, redirect of browseropslag toegevoegd. De aparte donkere
identiteitskolom en groene formulieren gebruiken alleen publieke producttekst
en dezelfde Fieldgrid-kleuren.

`tests/e2e/staff-login.spec.ts` controleert het ongewijzigde OTP-formulier voor
alle vier werkruimtes, personeel op 320/390/768/1440 px, de groene actieknop en
zichtbare desktopidentiteit, gevolgd door een echte volledige achtcijferige
lokale e-mailcode. Trace, screenshots en video blijven in die authproef uit.
De productiebuild en typecontrole zijn geslaagd; zie het visuele overzicht
voor de gerichte browserselectie en de bewust behouden real-data/authverschillen.

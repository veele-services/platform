# Tickets — verificatie en vrijgave

## Actuele aanvulling — 1 oktober, ClamAV geïnstalleerd door operator

De operator meldt ClamAV geïnstalleerd. GitHub Environment bevat inmiddels
`CLAMAV_ENABLED` en `CLAMAV_SOCKET` (alleen namen gecontroleerd). De eerdere
blokkade door ontbrekende scannervariabelen hieronder is historisch en vervalt.
De nieuwe namen en scheiding tussen runtime en runner zijn leidend; zie
[het operatorcontract](../deployment/clamav.md). Staging-hostrechten, de
bijgewerkte units en echte runtime-health zijn nog geen geverifieerd bewijs.
De bredere rollen-/mailimplementatie en releasemigraties blijven onvoltooid;
installatie van ClamAV is dus niet op zichzelf een GO voor de gehele werkboom.

### Hercontrole van het nieuwe scannercontract

Uitgevoerd op 1 oktober 2026, uitsluitend lokaal met herkenbare testgegevens:

| Controle | Uitkomst |
|---|---|
| Echte scanner | ClamAV 1.5.4, definities 28139; EICAR geweigerd, geldige PNG en PDF geaccepteerd. |
| Unit | 407 tests in 60 bestanden geslaagd, inclusief gescheiden runner-UID, socketrechten, uitgeschakelde scanner, runtimeconfig en health-gating. |
| Database/toegang | 54 controles inclusief suites geslaagd via `test-tickets.mjs`, `test-ticket-delivery.mjs` en `test-authorization-roles.mjs`; private Storage, intrekking en afscherming tegen de lokale database. Dit bewijst niet de volledige nieuwe applicatierechtenmatrix. |
| Volledige browsersuite | 43/43 geslaagd tegen de standalone-build met echte scanner; vóór de laatste gerichte runtimecontracttests. |
| Laatste gerichte browserrun | 5/5 geslaagd na een nieuwe build: `scanner-readiness.spec.ts` en `tickets.spec.ts`. Echte runtime-health, SHA-weigering, upload/scannen/downloaden, private notities, gecontroleerd doorsturen, grants/OTP en workerbezorging. |
| Statische controles | Lint, TypeScript, shellsyntax en `git diff --check` geslaagd. |

De browserrun bevat de verwachte toegangsweigering voor een onbevoegde actor;
dit is geen vrijgave van private gegevens. Testmail gaat alleen naar de lokale
testmailbox. De Supabase-skill is gebruikt voor verificatie van de bestaande
private opslag en autorisatie; geen remote database is gewijzigd of gereset.

Geen VPS-account, geïnstalleerde unit, Caddy-configuratie of productieomgeving
is aangepast. De task-eigen testscanner is na verificatie gestopt; de
definities en applicatiegegevens blijven behouden. De overige wijzigingen in
de werkboom zijn niet als afgeronde release gecommit, gepusht of gedeployd.

## Historische controles vóór deze aanvulling

Vrijgavebesluit, 30 september 2026: **NO-GO voor commit, push en stagingdeploy**.
De implementatie en onderstaande lokale controles zijn uitgevoerd. De verplichte
staging-scanner is nog niet aantoonbaar beschikbaar: een herhaalde names-only
inventaris van GitHub Environment `staging` bevat geen `TICKET_CLAMAV_SOCKET`.
De vraag aan de operator staat open. Er zijn geen secretwaarden opgehaald.

Dit is een externe releasevoorwaarde, geen reden om uploads ongecontroleerd vrij
te geven. Post-deploybewijs is afzonderlijk en kan pas na een toegestane uitrol
worden geleverd. Productie is niet benaderd of gewijzigd.

## Verplichte bewijsgroepen

1. Staff/tenant/platformgrenzen, actuele sessies en memberships, beperkte HR-scope naast brede operationele scope; geen verborgen data via query/count/unread/audit/bijlage.
2. Transactionele aanmaak, relaties, statusmachine, oplossing/bevestiging/heropening, idempotentie en stale revisies.
3. Driedelige doorstuurflow, niets vooraf geselecteerd, uitsluitend vrijgegeven versies, veilige opslagfinalisatie, ingetrokken rechten, onafhankelijke afhandeling en expliciet antwoordconcept.
4. Echte malwarescan, quarantaine, type/omvang/quota, geen preview/download bij fout, correcte cleanup en toegang na intrekking.
5. Actuele ontvangers bij enqueue én uitvoering, minimale mail/push, voorkeuren, deliverykeys, fout/retry; geen mails naar echte personen bij tests.
6. Deadlineberekening, tijdzones/zomertijd, meerdere workers, late reactie versus sluitjob.
7. Fresh migratie, upgrade met synthetische bestaande gegevens, tweemaal seed zonder maatwerkverlies; bestaande regressies.
8. Browserflows en visuele controle op desktop/tablet/320/390 px; filters/detailterugkeer, upload/scan/fout/conflict.
9. Lint, typecheck, build, unit, database/RLS/integratie, verplichte browserchecks en diff-/secretscontrole.
10. Scanner en bestaande worker gereed op staging; exacte CI/SHA; backup/migratie/deploy; health-SHA en gecontroleerde post-deploysmoke.

## Werkelijk uitgevoerd lokaal

| Controle | Resultaat / bewijsgrens |
| --- | --- |
| `pnpm lint` en TypeScript | Geslaagd; herhaald tijdens implementatie. |
| `pnpm test` | 296 tests, 41 bestanden, geslaagd. Omvat commandprojecties, OTP-payloadbinding, scannerprotocol/typecontrole, namespaces, werkcontext/groep/tijdzone en workergezondheid. |
| `pnpm build` | Geoptimaliseerde Next-build geslaagd met alle vier ticketwerkruimten, uploads/downloads en pushroute. |
| Forward upgrade | Lokale reset naar `20260930142326`, historische synthetische gegevens ingevoerd, forwardmigraties uitgevoerd en historiecontrole geslaagd. IDs, oude handtekening, goedgekeurde uren/review en taakprijs bleven intact. |
| Fresh schema | Alle migraties inclusief beide ticketmigraties vanaf leeg lokaal schema geslaagd; geen remote reset. |
| `pnpm test:db` | 228 SQL-controles en 138 Node-integratiecontroles geslaagd na de laatste migratieaanpassingen. |
| Ticketgrenzen | 18 inhoudelijke coregevallen (19 inclusief suite): actuele sessie/membership, twee tenants/medewerkers, beperkte HR-scope naast brede Planning, geen platformadminbypass, verborgen notes/search/unread/revisie/audit, versieconflicten, idempotente transfer, OTP, grant-CAS, annuleren en effectieve route-tijdzone. |
| Deadlineachterstand | 101 oudere niet-vervallen records blokkeren geen opvolging: 105 vervallen tickets worden in batches 100/5/0 verwerkt, zonder dubbele events; een later sluitrijp ticket sluit eenmaal. |
| Bestanden/delivery | 14 DB-controles: eigen concepten/quota, private Storage, actieve lease/session, geen download vóór vrijgave, intrekking/redactie, exacte onafhankelijke supportkopie, voorkeuren, platformpush en verkeerde-tenant-canaries. Geen gesimuleerde DB-scanstatus als scannerbewijs gebruikt. |
| Echte antivirus | Geïsoleerde ClamAV 1.5.4, bijgewerkte definities 28139. EICAR geweigerd, echte PNG/PDF geaccepteerd; JPEG/metadatareductie apart gecontroleerd. De CI-startprocedure is lokaal werkelijk uitgevoerd. |
| Ticketbrowserflows | 4/4 geslaagd, herhaald: eigen werkbonmelding met echte scan/download, collega geweigerd, privénotities afgeschermd, drie-staps delen met kopie, platformantwoord, expliciet antwoordconcept, oplossing/heropening/bevestiging; instellingen/routing, OTP/scopedgrant en voorkeuren. |
| Volledige browsersuite | 37/37 geslaagd tegen de gebouwde applicatie; daarna opnieuw 37/37 tegen het exacte standalone-startpad. Inclusief commerciële module, planbord, adressen/reistijd, werkbonnen, 360-dossiers, object-OTP en personeelsuitnodigingen. |
| Mailtransport | Werkelijke runtime-SendGrid-code via geïsoleerde lokale HTTP-mailbox, niet via echte ontvangers. Tenant- en Fieldgrid-huisstijl, minimale inhoud/deeplink, fan-out deduplicatie, bevestigde fout/retry en onzeker resultaat zonder automatische herverzending geslaagd. |
| Browseropslag/logout | Geen private ticket-URL in serviceworkercache; uitloggen, directe toegang en terugnavigatie gecontroleerd. |
| Visueel | Werkelijke schermen op 320, 390, 768 en 1440 px bekeken. Verborgen file-input-overloop, tabelcontainer, contrast en leesbare mobiele sorteerkeuzes hersteld; geen overflow mask als oplossing. De gerichte ticketflow is na deze laatste CSS-aanpassing opnieuw geslaagd, met zichtbare fixturelijsten en breedte-/rijasserties vóór elke opname. |
| Database-lint/advisors | Geen lintfouten. Zes bestaande performancewaarschuwingen in Object 360-policies; geen nieuwe ticketwaarschuwing of uitbreiding van oude policies. |
| Worker/release | Loopbackauth beperkt tot exact staging-POST en geldig secret; readonly timercontrole test nieuw-start/oud-start/fout/inactief. Oudere workers claimen geen ticketevents zonder expliciete opt-in. Testclaims zijn tenant-/bestandsgebonden. |

De volledige 37-test browsersuite tegen de gebouwde applicatie is geslaagd,
ook na overstap op het standalone-startpad. De eerdere devserver-runs zijn
niet als geslaagd geteld: eerst raakte
de schijf vol; daarna stopte de devserver opnieuw. De Next-trace liet circa
10 GiB RSS zien en de OS-cgroup telde twee OOM-kills. Dat ondersteunt
geheugendruk als oorzaak, maar er is geen kernelbewijs met exact proces/tijdstip.
Alleen reproduceerbare gegenereerde bestanden zijn opgeruimd.

Playwright bouwt en start nu dezelfde standalone-vorm als staging, met uitsluitend
lokale testconfiguratie en de bestaande providerinterceptors. Zo is ook de
ingebakken publieke Supabaseconfiguratie actueel. De planbordcontrole wacht op
de echte laadstatus; toleranties zijn niet verruimd. De opzettelijke
dossier-mailfout verwacht nu terecht HTTP 503/degraded en controleert herstel
met exact één mail; deze hercontrole is geslaagd.

## Externe voorwaarden en eerlijk begrensd bewijs

1. Operator: bevestig het actuele [scannercontract](../deployment/clamav.md):
   socket `/run/clamav/clamd.ctl`, `clamav:clamav`, `0660`, uitsluitend bereikbaar
   voor de runtime en niet voor de aparte runner. De nieuwe GitHub-variabelen
   bestaan al. De bovenstaande oudere instructies zijn historisch bewijs.
2. De runner doet uitsluitend de readonly configuratie-/identiteitscontrole;
   de web-runtime voert de echte scannercontrole uit via de healthcheck. De
   lokale Docker-scanner bewijst niet dat de VPS-rechten correct staan.
3. Bestaande timer was actief, maar de vorige release rapporteerde een mislukte
   workeruitvoering. De begrensde loopbackuitzondering en haar autorisatie zijn
   lokaal getest. De daadwerkelijke oude VPS-foutoorzaak en nieuwe gezonde
   uitvoering zijn nog niet op de host vastgesteld; de nieuwe deploygate
   accepteert alleen een verse geslaagde uitvoering na webactivatie.
4. Externe SendGrid-aflevering en echte browserpush zijn niet uitgevoerd. De
   lokale sink bewijst de mailintegratie; DB-tests bewijzen pushregistratie,
   endpointbegrenzing, actuele ontvangers en intrekking, niet aflevering door
   een browserpushprovider. Controleer na uitrol met beheerde testontvangers en
   expliciet aangemelde testdevices.
5. Er is geen nieuw wettelijk bewaarbeleid verzonnen. Definitieve automatische
   verwijdering blijft uit totdat de producteigenaar het ticketbewaarprofiel
   heeft vastgesteld; archivering/redactie en veilige draftcleanup werken wel.

## Gecombineerde hercontrole — 1 oktober 2026

Tickets & Support is opnieuw gecontroleerd samen met het centrale
notificatiesysteem. De bovenstaande resultaten van 30 september blijven
historisch bewijs; de actuele volledige run heeft 367 unit-, 231 SQL-,
208 database-integratie- en 42 browsertests, allemaal geslaagd. Lint,
TypeScript, de standalone-build, forward upgrades en schone migraties zijn
eveneens geslaagd. De ticketbrowserflow gebruikte opnieuw de echte lokale
ClamAV-scanner en de runtime-mailcode met een lokale testmailbox.

Het [notificatie-verificatiebestand](notifications-verification.md) beschrijft
de gezamenlijke bronafhandeling, terugzetbeperkingen en bewijsgrenzen. De
names-only staging-inventaris mist nog steeds `TICKET_CLAMAV_SOCKET`;
het vrijgavebesluit blijft daarom **NO-GO voor commit, push en stagingdeploy**.

## Release

Nog niet gecommit, gepusht of gedeployd voor deze opdracht. Bestaande gezonde release: `74966d8c250536466e6e1e988ef114ff6207a000`. Productie blijft buiten scope.

Geen nieuwe commit-SHA, workflow/deployment-ID of staging-postdeployresultaat
te rapporteren. De wijzigingen blijven reviewbaar in de lokale werkboom;
volg na het oplossen van de releasevoorwaarde de bestaande `main`-CI → bewuste
exacte-SHA-promotie naar `staging` → deployment-/health-/smokecontrole.

De uitsluitend voor deze taak gemaakte lokale scannercontainer is na de laatste
geslaagde controle gestopt. De testdefinities zijn behouden; er zijn geen
applicatiegegevens verwijderd en geen VPS-services gewijzigd.

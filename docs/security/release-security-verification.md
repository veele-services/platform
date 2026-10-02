# Releaseverificatie — bijgewerkt 2 oktober 2026, NO-GO vóór stagingacceptatie

Onderzocht: de lokaal beoordeelde releasebasis, eerste kandidaat
`f7fd0b2f25efd2bb00a144605ad809f44acf0c8c`, de beperkte brokerreparatie en
tweede kandidaat `bd7f69f6233cd7066e3f042a718b1d9f629ee86a`. Beide kandidaten
gingen door volledige `main` CI en zijn ongewijzigd naar `staging` gepromoveerd.
De tweede poging installeerde release, backup en runtime, maar webactivatie
stopte fail-closed op de ongeschikte `test -w`-predicate voor de ClamAV Unix-
socket. Zonder Daybreak gewerkt.

## Omgevingen en reikwijdte

- Echte lokale Auth/Data API/Storage/Realtime op `127.0.0.1:59321/59322`.
  Bestaande lokale werkdatabase niet gereset. Zij bevat het niet-geactiveerde
  rollenprototype en query-first drift. Een forward-poging is bij ontbrekende
  historische objecten veilig gestopt; deze werkdatabase kan daardoor al een
  eerste deel van de release-forwardmigraties hebben geregistreerd en is niet
  als releasebewijs gebruikt.
- Schone migratie-replay op `127.0.0.1:60322`, uitsluitend het voor deze audit
  aangemaakte project `fieldgrid-release-audit-20261001` onder
  `/tmp/fieldgrid-release-migrations.FlfiMa`. Alle 55 repositorymigraties,
  zonder prototype. Databaseprincipals testen met echte synthetische sessies.
- Eigen lokale ClamAV 1.5.4, definities 28140. Gebruikt door echte gateway- en
  browserproeven; geen VPS-scanner aangeroepen.
- Mail/routing hebben herkenbare lokale interceptors en testmailbox.
  Provider-/webhooktests bewijzen geen echte SendGrid/Mollie-aflevering.
- De afgeschermde stagingdatabase is uitsluitend via de workflow gecontroleerd
  en forward gemigreerd naar de complete 55-migratiehistorie. Geen productie,
  echte klantgegevens of echte verzending gebruikt.

## Laatste uitgevoerde controles

| Controle | Daadwerkelijk resultaat |
| --- | --- |
| `pnpm lint`, `pnpm typecheck` | Geslaagd, opnieuw na de laatste bron-/testwijzigingen |
| `pnpm test` | 764 tests in 92 bestanden geslaagd op de ClamAV-forward-fix; productiebuild met 54 statische pagina's eveneens groen |
| Schone replay van 55 migraties | Geslaagd op het eigen geïsoleerde project; de manifestcontrole bevestigt 55 bestandsinhoud-hashes |
| SQL-tests op die schone replay | 233 tests in 9 bestanden geslaagd |
| Node-gedeelte van `pnpm test:db` op dezelfde replay | 320 tests geslaagd, nul failures/skips |
| Werkbon-upgrade vanaf `20260930142326` → 54 migraties | Bestaande IDs, ondertekening, rapport/taakbewijs en goedgekeurde uren behouden; de laatste descriptorfix is daarna via schone replay en de volledige DB-suite getoetst |
| Notificatie-upgrade vanaf `20260930192516` → 54 migraties | Leesstanden, mailevents, aangepaste templates behouden; geen verzonnen apparaten/providerpogingen. De laatste descriptorfix raakt deze tabellen niet |
| Platform-upgrade vanaf `20261001042234` → 54 migraties | Bestaande uitnodiging/ontvanger behouden, ingetrokken membership niet hersteld; incomplete uitnodiging nog retrybaar; expliciete delegatie behouden. De laatste descriptorfix raakt deze tabellen niet |
| `pnpm test:security:http` met echte lokale scanner | 10 tests geslaagd: bytes, EICAR, huidige toegang, platform-Auth, Data API/Storage/Realtime |
| Volledige productiebuild + Playwright | Op de actuele 55-migratiekandidaat: productiebuild met 54 pagina's en alle 49 tests geslaagd op de geïsoleerde replay met echte lokale scanner. De fixtureguard accepteert uitsluitend de standaard lokale stack of het expliciet gevalideerde auditproject; CI moet dit op de uiteindelijke commit herhalen |
| Publieke commerciële modulegrens | 19 DB-tests plus gerichte browserflow: uitgeschakeld blokkeert offertepagina/-PDF en boeking, herinschakelen herstelt ze; intake fresh/replay heeft geen neveneffect bij blokkade |
| Workflow-/worker-/rollbackhardening | 21 gerichte tests in drie bestanden: alle externe actions immutable gepind, geen jobniveau-secrets, workersecret niet in argv en alleen loopbackrequest; geen automatische oude-code-rollback na forwardmigraties |
| Nieuwe accountwisselproeven medewerker A/B en klant A/B | Geslaagd; alleen een nieuw serverbevestigd document heft de oude accountafscherming op. Eigen personeelsdownload 200 met bytes, andere persoon 404 |
| Security-advisors, `--type security --level warn --fail-on warn` | Geen meldingen op de replaydatabase |
| SQL-lint, `--level warning --fail-on error` | Exit 0, maar waarschuwingen: ongebruikte parameters, JSONB-returncasts en STABLE/VOLATILE-projectie; geen schoon lintresultaat geclaimd |
| `check-security-surface.mjs` | 835 structurele classificaties gelijk, inclusief indirecte authhelpers, servercomponenten, browser-/Realtimeclients en 52 operationele releasepaden; code, SQL-functies, policysets en operations zijn inhoudelijk gefingerprint |
| `pnpm security:review` | Alle 835 ontdekte autorisatie-/releaseoppervlakken hebben één fingerprintgebonden afgeronde status en bewijsset; nieuwe, gewijzigde, ontbrekende, dubbele, verouderde, onbewezen, `pending` of `blocked` items laten CI falen |
| Codex Security Standard-scan | Scan `0b3d3db8-e01f-44cc-b996-d06f22fef2a4`: nul rapporteerbare bevindingen. De 781-bestandsinventaris had partiële codedekking: alle gewijzigde/ongetrackte implementatie en beveiligingskritieke grenzen zijn beoordeeld, niet ieder ongewijzigd presentatie-, documentatie- en fixturebestand regel voor regel |
| Finale ClamAV-forward-fix security-diffscan | Scan `0bccadf0-62e4-437a-b038-32007b495141`: alle 10 uitvoerbare/test-diffoppervlakken volledig beoordeeld, nul rapporteerbare bevindingen. Eerdere iteraties vonden de ongeschikte socketdenial-predicate en ontbrekende parent-directorycontrole; beide zijn vóór deze scan hersteld en met echte Linux-UIDs en een echte Unix-socket opnieuw getest |
| `pnpm audit --audit-level high` | Geen bekende advisories gevonden |
| `check-source-secrets.mjs` | 763 tekstbestanden, geen herkende credentialformats |
| Browserartifactscan | 93 tekstbestanden gecontroleerd, 80 binaire bestanden uitgesloten; geen herkende credentialformats |
| Bereikbare HEAD-historie | 9187 blobs: 8916 tekst gecontroleerd, 271 binair uitgesloten; geen herkende credentialformats |
| `git diff --check` | Geslaagd |
| GitHub staging-configuratie en runner | Alleen namen/status gelezen: alle vereiste namen zijn aanwezig, inclusief `STAGING_HANDOFF_ENCRYPTION_CERT_B64`. `fieldgrid-staging-veele` is online met eigen label en de GitHub-verbinding is geverifieerd. De gescheiden root- en runnerhandoffcontroles zijn geslaagd; geen secretwaarden opgevraagd |
| `main` CI en eerste stagingpromotie | `Fieldgrid CI` run `36973655736` voor exact `f7fd0b2f` is volledig groen. Stagingrun `36975937032` voltooide verificatie, backup, forwardmigraties, volledige migratiehistorie, runtimegeneratie, versleuteling en attestaties; activatie stopte vóór installatie op een extensionloze interne attestationbundel |
| Broker-correctie security-diffscan | Scan `135fe174-21db-4971-bca0-f1572ab01fc1`: nul rapporteerbare bevindingen. Root-owned werkkopie, provenancebinding, no-argument sudogrens en geheimafscherming bleven intact; de daarna bijgewerkte bestanden waren uitsluitend correcties van dit operationele bewijs |
| Tweede stagingpromotie | Exact `bd7f69f6` heeft volledige `main` CI. Stagingrun `36993643269`, attempt 2, voltooide verify, host-preflight, prepare, gevalideerde backup, forwardmigratie/55-regel-historie, encryptie, drie attestaties en brokerinstallatie. Release, runtime en backup zijn geïnstalleerd en `current` is bijgewerkt; webstart faalde vóór Node op `test -w /run/clamav/clamd.ctl`, public health gaf 502 en acceptance is overgeslagen |

Secretchecks zijn formatdetectie, geen bewijs dat ieder onbekend secret wordt
herkend. De historie is niet shallow, maar andere branches en onbereikbare
objecten vallen buiten deze controle. Waarden worden niet gelogd.

## Gericht bewijs en regressies

- Downloadtests importeren daadwerkelijke handlers met gecontroleerde
  bron/Storage-mocks: juiste bytes, scope/namespace/hash en intrekking tijdens
  I/O of PDF-render. Echte Auth/Storage/scannerproeven vullen dit aan.
- Realtime lekte vóór herstel het ID van een verwijderd privérapport.
  Na herstel bewijst een geautoriseerd volgend WAL-event dat de stream actief
  blijft terwijl het privé-DELETE-event niet wordt geleverd.
- Reiscontroles: 39 gerichte unittests, 18 DB-tests, vijf browserflows.
  Historische predecessor-toegang wordt herbeoordeeld; oude snapshots blijven
  opgeslagen en worden niet stilzwijgend herschreven.
- Betalingen: 60 gerichte unit/route-tests en acht DB-tests. Finance kan geen
  providerbewijs fabriceren; herstel van lege ongebonden poging en rollback
  bij fouten zijn getest. Terminale providerfouten blokkeren geen nieuwe poging.
- HR: zeven DB-tests; managed én legacy interne rijen afgeschermd,
  noodcontactkolom niet operationeel leesbaar, beperkte eigen documentlijst en
  descriptor wel beschikbaar. Eigen beschikbaarheid/vervoer behouden. Planner
  ziet beschikbaarheidsblokken maar geen ziekte/verlofreden of dossierbron-ID;
  HR/eigen updates blijven werken, intrekking en moduleblokkade zijn getest.
- Browser: echte tabs, heldere fictieve accountcanaries, opgehouden logout,
  Back en vertraagde JS-hydration. Geen traces/video/screenshot van deze
  privacyproeven. De extra A/B-proeven zijn onderdeel van de browsersuite.
- Platform: fingerprint/ontvanger, eenmaal binden, gelijktijdige retries,
  afgewezen gewijzigde invoer en huidige bevoegdheid; nieuwe historische
  upgrade bewaart bestaande uitnodigingsmomenten zonder autoriteit te herstellen.
- Modules: nieuwe settingslifecycle en collection-/summarygates; elf gerichte
  DB-tests, inclusief aantoonbaar bestaande data bij uitschakelen/herinschakelen.
- Meldingen: drie nieuwe DB-scenario's sluiten collega-inzage, vreemde bijlage
  en ontbrekende moduletoegang. Resolve vereist een concrete actuele versie.
- Resource-lifecycle: acht tests, inclusief twee echte gelijktijdige verbindingen.
  Objectbinding via RPC én directe INSERT blokkeert een concurrerende
  klantverplaatsing. Betaling en finalisatiereplay slaagden na correctie van een
  werkelijk gereproduceerde slotcyclus. Definitieve bronnen blijven bewaard;
  gewone profiel-, reis-, concept- en beheerdershandelingen blijven bruikbaar.
- Notificatie-/auditgrenzen: negen nieuwe DB-tests. Echte gelijktijdige
  grant-save én grant-revoke wachten op een rijslot en herbeoordelen daarna de
  bestaande delegatiescope. Tenanttemplates erven alleen gepubliceerde inhoud;
  eigen conceptbewerking blijft werken. Nieuwsleesstanden volgen huidige
  toegang en onveranderlijke identiteit; reminders vereisen actuele eigen
  scope. Alle vier klantauditbronnen leveren alleen nieuwe gebeurtenismetadata,
  terwijl de bestaande dossierhistorie dezelfde gebeurtenissen blijft tonen.
- Publieke commerciële grens: de tenantmodule wordt in de serverhelper én in
  de vier service-role-RPC's vóór fresh uitvoering en idempotente replay
  gecontroleerd. De private predicate heeft geen callergrant. Offertepagina,
  offertebestand en boeking zijn met de echte productiebuild getest; de
  wildcard-intake blijft een expliciete stagingacceptatie.
- Deployment supply chain: checkout, Node-setup en pnpm-setup zijn op volledige
  officiële commit-SHA's vastgezet. Stagingsecrets staan alleen bij de stap die
  ze gebruikt; checkout/setup/install erven ze niet. De worker zet de
  beheerdersheader intern vanuit zijn procesomgeving en neemt de waarde niet op
  in de opdrachtregel of loguitvoer.
- Deploymentherstel: een healthfout na forward-only securitymigraties herstelt
  geen oudere, niet aantoonbaar compatibele applicatiesymlink. De kandidaat
  blijft aangewezen voor veilige diagnose en een forward-fix; staging blijft
  rood totdat de exacte SHA weer gezond is.
- Uitrolvolgorde: tien adaptertests voor de readonly workercontrole, inclusief
  gepauzeerde voorbereiding, operatorhervatting, verkeerde/ontbrekende unit,
  oude successen en verse fouten. Geen echte VPS-units gewijzigd.
- Adresopslag: drie unittests voor gedeeld adres, afzonderlijke adressen en
  mislukte bevestiging zonder gedeeltelijke opslag.

Testconstructiefouten (ontbrekende fixturevelden/JSON-serialisatie en owner-
onderhoud met een nagebootste JWT) zijn apart hersteld, niet als kwetsbaarheid
gepresenteerd. De volledige 320-testset is daarna opnieuw uitgevoerd. Een
directe gelijktijdige conceptregelbewerking tijdens finalisatie kan nog een
transactie-abort met retry opleveren; er is geen automatische brede retry van
niet-idempotente opdrachten toegevoegd.

Gerichte onafhankelijke onderzoeken en één hercontrole per fix gebruikten geen
Daybreak. Reviewbevindingen over checklistcondities, planningshistorie,
betaalretries en browserremount/hydration zijn door de parent gecorrigeerd.
De HR- en afwezigheidshercontroles vonden geen concrete bypass of legitieme
regressie binnen hun onderzochte grenzen. Dit is geen onafhankelijke goedkeuring
van de volledige app. CI weigert nu expliciet SQL-lintfouten en security-advisor-
waarschuwingen; de bestaande functionele waarschuwingen worden niet verborgen.

## Herhaalbare controles

De gebruikelijke `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm test:db`, `pnpm test:security:http` en `pnpm test:e2e` blijven de
CI-ingangen. De HTTP-/browsertests vereisen de eigen lokale scanner en lokale
Supabase. De browserrunner bouwt de productiecode met de lokale publieke keys.
Alle E2E-fixtures gebruiken één fail-closed targetcontrole: uitsluitend de
gewone lokale poorten of het expliciet gevalideerde auditproject op 60321/60322.

Voor de audit-replay is het Node-gedeelte van `test:db` uitgevoerd met
`FIELDGRID_LOCAL_REPLAY_DIR=/tmp/fieldgrid-release-migrations.FlfiMa`;
`supabase test db` kreeg dezelfde expliciete `--workdir`. Gebruik geen
remote credential en reset geen bestaande gedeelde database om dit na te doen.

## Audit van de harde vrijgavevoorwaarden

| Voorwaarde uit de opdracht | Status voor deze kandidaat | Bewijs / ontbrekend bewijs |
| --- | --- | --- |
| Ieder ontdekt toegangspad beoordeeld of gemotiveerd niet van toepassing | Lokaal behaald | 835 fingerprintgebonden regels in `authorization-review.json`; CI weigert nieuwe, gewijzigde, ontbrekende, onbewezen of onafgeronde regels |
| Geen bekende onbevoegde tenant-/medewerker-/klanttoegang | Lokaal behaald | Negatieve DB-, HTTP-, Storage-, Realtime-, handler- en browserproeven; nul rapporteerbare bevindingen in de verse Standard-scan |
| Alle gevonden P0/P1 en grenslekken hersteld en opnieuw getest | Lokaal behaald | Bevindingenregister, zestien forwardmigraties en gekoppelde regressies; geen open P0/P1 in de onderzochte kandidaat |
| Objectgeheimen via actuele assignment, tijdvenster en specifieke verificatie | Lokaal behaald | Vault-RPC/OTP-/sessie-/assignmenttests en minimale projecties; stagingmail en werkelijk tijdgedrag nog als smokecheck |
| Gewone rechten niet afhankelijk van clientfilter/ongecontroleerde privileged fallback | Lokaal behaald | RLS/FORCE, grants, RPC-/service-clienttests en resourcehercontrole vóór/na I/O |
| Veldprojecties, memberships, intrekking, capabilities en beheerde caches | Lokaal behaald | Personeel/klant A/B, oude JWT, downloads, accountwissel, module-/capability- en browserprivacytests |
| Migraties/configuratie zonder onverklaarde drift in releaseomgeving | **Deels behaald** | Stagingbackup, projectguards, forwardmigraties en complete 55-regel-historie zijn groen; de tweede poging heeft de versleutelde runtime via de broker geïnstalleerd. Gezonde runtime-/schema- en provideracceptatie ontbreekt nog |
| Verplichte tests en kernprocessen op de uiteindelijke release-SHA | **Niet behaald** | `bd7f69f6` heeft volledige GitHub-CI en volledige stagingverificatie tot activatie, maar de ClamAV-preflight-forward-fix krijgt een nieuwe SHA en moet dezelfde CI plus stagingacceptatie nog doorlopen |
| Geen bekend exploiteerbaar hoog dependencyprobleem of bruikbaar gelekt secret | Lokaal behaald | Dependency-audit en bron-/browser-/bereikbare-historiescans groen; formatdetectie blijft begrensd zoals hierboven beschreven |
| Lagere risico's, privacybeslissingen en eigenaarschap vastgelegd | Vastgelegd, besluit extern | Oude signed-URL-afloop, retentie/redactie, incidentcontacten en oude bestanden boven scannerlimiet vragen eigenaar/operator |
| Geen onbewezen essentiële externe control | **Niet behaald** | Handoffcertificaat, runnerafscherming, gecorrigeerde broker en de beveiligde installatie van release/runtime/backup zijn aangetoond. De bijgewerkte webunit met echte clamd-protocolpreflight moet nog worden geïnstalleerd en host-gecontroleerd; ClamAV na daemonherstart en via de gedeployde app, restoreproef, providerhooks, Mollie-test, verse workeruitvoering en health-SHA zijn nog niet aangetoond |

De lokale statussen zijn geen formele risicoacceptatie en geen stagingbewijs.
Door de twee niet-behaalde releaseomgevingsvoorwaarden en de onbewezen externe
controls is de enige juiste totaalscore hieronder **NO-GO**.

## Open voorwaarden — geen GO

- De verse Standard-scan vond nul rapporteerbare bevindingen in de gewijzigde
  implementatie en de beveiligingskritieke grenzen. Niet ieder ongewijzigd
  presentatie-, documentatie- en fixturebestand is opnieuw regel voor regel
  beoordeeld; dit zijn geen stilzwijgend ontbrekende toegangspaden. De 835
  ontdekte autorisatie-/data-/releaseoppervlakken hebben afzonderlijk een afgeronde
  reviewstatus en bewijsset. De structurele inventaris alleen blijft geen
  zelfstandige goedkeuring van een functiebody.
- De brokerreparatie en kandidaat `bd7f69f6` hebben volledige CI en bereikten
  veilige installatie. De nieuwe ClamAV-preflight-forward-fix heeft nog geen
  definitieve, groen beoordeelde SHA; claims over haar tests volgen pas na
  daadwerkelijke uitvoering.
- Stagingrunner met label `fieldgrid-staging` is online en de GitHub-verbinding
  is geverifieerd. De eenmalige handoff heeft runner UID 994 met eigen primaire
  groep en zonder aanvullende groepen opgeleverd. Root- en runnercontrole,
  vaste broker, staging-specifieke units en handoffcertificaat zijn bevestigd in
  `docs/deployment/staging-handoff-evidence-2026-10-01.md`; de worker-timer blijft
  bewust inactief tot de nieuwe webrelease gezond is.
- De stagingmigratiehistorie en pre-migratiebackup zijn bewezen. De tweede
  poging installeerde `runtime.env`, release en backup, maar de oude systemd-
  preflight veroorzaakte een restart-loop en public 502 vóór Node. De bijgewerkte
  daadwerkelijk geladen instance-unit
  `/etc/systemd/system/fieldgrid@staging.service` en releasegebonden
  `PING`/`PONG`-preflight, socketrechten na
  daemonherstart, actuele definities en scannerproeven via de gedeployde app,
  restoreproef, een verse workeruitvoering, exacte health-SHA en
  provideractivatie moeten nog worden bewezen.
- Oude private signed URLs, privacybewaarbeleid en organisatorische
  incidentcontacten vragen operationeel/eigenaarsbewijs. Geen rotatie of
  juridische risicoacceptatie namens de eigenaar uitgevoerd.
- Configureerbare rolleninterface blijft een niet-geactiveerde vervolgopdracht;
  de huidige audit gebruikt bestaande expliciete rollen volgens opdracht §2.

Zie `release-security-runbook.md` voor de uitrolvoorwaarden en
`docs/deployment/clamav.md` / `mail-hooks.md` voor de exacte operatorstappen.

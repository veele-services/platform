# Productiepromotie van de geaccepteerde Sites v3-release

Dit verslag bewaart de situatie direct na promotie. De latere operatorcontrole
heeft de www-blokkade opgelost; de actuele publieke productieacceptatie staat
in [fase 29](phase-29.md).

Op 16 oktober 2026 heeft de eigenaar expliciet gevraagd de stagingrelease ook
naar productie te promoveren. De applicatie draait daar nu als
`5480df58a052fa795c76d1beb7172291f7e9ef1f`, dezelfde applicatiecommit die op
staging volledig is geverifieerd. De productversie blijft `1.2.0-rc.1`; er is
geen ongeteste versie- of applicatiewijziging aan deze promotie toegevoegd.

## Voltooide releaseprocedure

De bestaande [productierun 38879615718](https://github.com/veele-services/platform/actions/runs/38879615718)
is volledig geslaagd. De [workflowmetadata](evidence/phase-28/workflow.json)
bevatten de exacte commit, job- en stapuitslagen en tijdstippen.

1. De expliciet geaccepteerde SHA is ingesteld als `ACCEPTED_RELEASE_SHA` van
   GitHub Environment `production`. De commit is een gecontroleerde fast-forward
   vanaf `71df59ab0390ffeae482c7edbaf27efe3fa6546d`, is opgenomen in main en
   heeft groene main-CI en volledige stagingacceptatie voor precies die SHA.
2. De productieworkflow herhaalt alle verplichte verificatie. Resultaat:
   **1.998 units in 208 bestanden, 723 native databasechecks, 398 pgTAP-checks en
   134 browsergevallen geslaagd**. De browserstap duurt 17,1 minuten, zonder
   retries/skips. De 1.418 autorisatieoppervlakken, HTTP-privacygrenzen,
   Linux-isolatie, dependency-/credentialgates, types/lint, standaardbuild en
   verpakte standalone-runtime slagen eveneens.
3. De hostpreflight slaagt. De workflow bouwt en verpakt de exacte release,
   maakt en valideert de productiebackup en past de voorwaartse migraties toe.
   Alle 178 migraties en hun volledige statementhistorie worden gecontroleerd.
4. De versleutelde overdracht wordt geattesteerd en via de bestaande vaste
   rootbroker atomisch geactiveerd. Publieke productiehealth meldt de exacte
   SHA, `database: ready` en `scanner: ready`.
5. Een verse workeruitvoering na activatie slaagt. De finale acceptatie slaagt
   voor health, Auth-redirects, de 28 bestaande Veele-marketingroutes, robots,
   sitemap, 404 en de drie portaalinlogpunten.

De [geselecteerde testregels](evidence/phase-28/production-verify-results.log)
en [operationele uitslagen](evidence/phase-28/production-operation-results.log)
bevatten geen credential- of omgevingsblokken. Configuratie is uitsluitend op
naam geïnventariseerd; er zijn geen secretwaarden opgehaald of naar Git gekopieerd.
De volledige extra main-CI voor het eerdere documentatiedossier
([38879326047](https://github.com/veele-services/platform/actions/runs/38879326047))
slaagt ook. Latere bewijscommits wijzigen de actieve applicatie-SHA niet.

## Aanvullend publiek livebewijs

De [read-only browsercontrole](evidence/phase-28/public-acceptance.json)
controleert daadwerkelijk de productie-runtime:

- Basis- en tenanthost geven HTTP 200 met dezelfde exacte productie-SHA en
  gereedstaande database/scanner.
- Backoffice-, personeels- en klantlogin geven HTTP 200 op 1440 en 390 px,
  zonder horizontale overflow. De bestaande specifieke personeelstitel blijft
  behouden; er is geen OTP aangevraagd of formulier verstuurd.
- Privé `/platform` op de basishost verwijst naar login. De interne
  marketingnamespace en een onbekende tenantslug geven 404.
- Alle zes [inlogbeelden](evidence/phase-28/viewed-logins.json) zijn werkelijk
  bekeken, met passende tenantbranding. Dit bewijst publieke inlogpresentatie,
  niet een volledige geauthenticeerde portaal- of bedrijfsprocesketen.

De eerste aanvullende controle verwachtte ten onrechte ook bij personeel de
algemene titel “Welkom terug”. De oorspronkelijke foutuitslag is bewaard in
[initial-check-heading-mismatch.json](evidence/phase-28/initial-check-heading-mismatch.json).
Alleen die verwachting is aangepast aan de bestaande, specifieke titel
“Inloggen personeelsapp”. De applicatie, assertions over health/HTTP/overflow en
de toegangsgrenzen zijn niet aangepast om de controle te laten slagen.

## Afzonderlijk open: de publieke www-host

`https://www.fieldgrid.nl` geeft bij de controle na activatie nog **HTTP 502**.
Dat gebeurt zowel via Cloudflare als bij een directe, geldig TLS-gecontroleerde
verbinding met dezelfde VPS. Zie [vóór](evidence/phase-28/www-diagnostic-before.json)
en [na activatie](evidence/phase-28/www-diagnostic-after.json).
De gezonde basis-/tenanthealth bewijst dat de applicatie op productie draait.
De effectieve Caddy-configuratie is niet uitgelezen; de precieze foutieve
upstream is daarom niet als vastgesteld feit beschreven.

De eigenaar heeft aangegeven de proxycontrole zelf uit te voeren. De verwachte
bestaande www-route gebruikt `127.0.0.1:3302`, overeenkomstig
[Caddyfile.production.example](../../../deploy/Caddyfile.production.example).
Controleer een eventueel afzonderlijk www-blok en zijn upstream; behoud bestaande
TLS-/DNS-instellingen, overige sites en stagingroutes. Het
[productierunbook](../../deployment/production-runbook.md) beschrijft validatie en
reload als operatoractie. Er is door deze promotie geen DNS- of Caddy-wijziging
uitgevoerd en `APP_URL=https://fieldgrid.nl` is behouden.

Alle 23 Fieldgrid-marketingroutes zitten in het productieartifact. Hun publieke
productiepresentatie, canonical/robots/sitemap en intakebeschikbaarheid zijn
vanwege deze 502 **niet live geaccepteerd**. De 69 geslaagde publieke weergaven
uit fase 27 zijn stagingbewijs. Zij worden niet als productiecontrole hergebruikt.
Na herstel van de www-route moet de publieke productiecontrole opnieuw worden
uitgevoerd; het opnieuw activeren van dezelfde brokerhandoff is daarvoor niet nodig.

## Overige grenzen van het bewijs

Volledige private hosted browserketens met echte gebruikers, feitelijke externe
e-mailbezorging, fysieke Android-/iOS-installatie en echte betaalprovideracceptatie
blijven afzonderlijke acceptatiepunten. De productieprimaire-beheerregistratie
is niet afzonderlijk uitgelezen. De migratie behoudt alleen een ondubbelzinnige
bestaande geregistreerde beheerder; bij meerdere beheerders is een expliciete
keuze via de native accountpagina nodig. De stagingbootstrap wordt niet als
productiebewijs voorgesteld en er is geen extra beheeraccount of mailbox gemaakt.

De [release-status](release-status.json) en het [105-regelige register](screen-register.json)
markeren nu beide applicatiedeployments als uitgevoerd. Publieke bereikbaarheid
en volledige functionele liveacceptatie blijven afzonderlijke statussen.

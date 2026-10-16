# Exacte CI, stagingdeployment en publieke livecontrole

De applicatie uit PR [591](https://github.com/veele-services/platform/pull/591) staat
op staging als `5480df58a052fa795c76d1beb7172291f7e9ef1f`. De repository staat
uitsluitend squashmerges toe; de Git-tree is exact gelijk aan de beoordeelde
PR-head `ca13f25f3eba700ee1eb9003b463d88570548acf`. Baseline en later werk zijn
behouden. Geen force-push, geschiedenisreset of productiepromotie is uitgevoerd.
De bewijscommit wijzigt alleen documentatie; de gedeployde applicatie-SHA blijft
expliciet onderscheiden van latere bewijscommits.

## Drie volledige groene verificaties

| Controle | Exacte commit | Uitkomst |
| --- | --- | --- |
| [PR-CI 38865034609](https://github.com/veele-services/platform/actions/runs/38865034609) | `ca13f25f3eba700ee1eb9003b463d88570548acf` | 134 browsergevallen geslaagd, nul retries/skips |
| [Main-CI 38869033340](https://github.com/veele-services/platform/actions/runs/38869033340) | `5480df58a052fa795c76d1beb7172291f7e9ef1f` | 134 browsergevallen geslaagd, nul retries/skips |
| [Staging 38872995106](https://github.com/veele-services/platform/actions/runs/38872995106) | dezelfde `5480df5…` | Volledige verify én alle deploy-/acceptatiejobs geslaagd |

Elke verificatie voert ook 1.998 units in 208 bestanden, 723 native
databasechecks, 398 pgTAP-checks, tien echte HTTP-privacychecks, de
1.418-surfacecontrole, lint/types, dependency-/credentialgates, de standaard
Turbopackbuild en het echte standaloneartifact uit. [Metadata en geselecteerde
resultaatregels](evidence/phase-27/release-result.json) zijn bewaard zonder
omgeving- of credentialblokken. De eerdere mislukte runs in fase 26 blijven
zichtbaar; hun herstel wordt niet gebruikt om die oude runs alsnog groen te noemen.

## Bestaande releaseprocedure, daadwerkelijk voltooid

Na groene main-CI is precies deze main-SHA bewust naar `staging` gepromoveerd.
De workflow heeft host-/runnercontracten gecontroleerd, de release gebouwd,
een databasebackup gemaakt, 178 voorwaartse migraties en hun volledige
statementhistorie geverifieerd, de versleutelde overdracht geattesteerd en
atomisch geactiveerd. Exact-SHA public health meldt HTTP 200, staging,
database ready en scanner ready. Een verse workeruitvoering na activatie slaagt.

De bestaande hosted acceptatie slaagt met tijdelijke, teruggedraaide fixtures:
44 werkbonchecks, 35 ticketchecks en zes websiteaanvraag-/read-backchecks.
Daarnaast slagen 28 bestaande Veele-websiteroutes en de drie portaalinlogpunten.
Dit is echt hosted contractbewijs; het is geen volledige browseracceptatie van
iedere private Sites v3-keten met een echte medewerker of klant.

Na succesvolle deployment is de bestaande
[beheerbootstrap 38878426408](https://github.com/veele-services/platform/actions/runs/38878426408)
eenmalig uitgevoerd. Deze registreert exact de beheeridentiteit uit
`FIELDGRID_ADMIN_EMAIL` van GitHub Environment `staging` via de service-only RPC.
Er is geen eerste willekeurige Auth-gebruiker gekozen, wachtwoord ingesteld of
gereset, tweede mailconfiguratie gemaakt of externe testmail verstuurd.
De [healthcontrole na registratie](evidence/phase-27/post-bootstrap-health.json)
bevestigt opnieuw dezelfde gezonde applicatie-SHA.

## Publiek live bekeken

[www.staging.fieldgrid.nl](https://www.staging.fieldgrid.nl) is bereikbaar.
De [read-only browsercontrole](evidence/phase-27/public-readonly-result.json)
controleert alle 23 Fieldgrid-routes op 1440, 768 en 390 px: 69 weergaven,
alle HTTP 200, geen horizontale overflow of browserfouten, werkelijke
fontmetadata, canonicals naar het gewenste productieadres, staging-noindex,
robots en 23 sitemapverwijzingen. Publieke afspraakbeschikbaarheid geeft alleen
datum, duur, tijdzone en tijden terug, zonder persoonsgegevens.

De interne namespace geeft op beide hosts 404, privé `/platform` op de basis-host
verwijst naar login en een onbekende tenant faalt gesloten met 404.
Er zijn geen formulieren verstuurd of bestaande bedrijfsgegevens gewijzigd.

Er zijn twaalf oorspronkelijke volledige screenshots bewaard. De
[bekekenlijst](evidence/phase-27/viewed-crops.json) registreert precies 24
daadwerkelijk bekeken uitsneden: homepage en productpagina, telkens bovenkant,
midden en footer op drie breedtes; plus de bovenkanten van proefperiode en
telefonische afspraak op die breedtes. De oorspronkelijke volledige beelden
worden hierdoor niet automatisch als volledig bekeken aangemerkt. De eerdere
115 bron-/doelparen en uitgebreide interactie-/portaalvergelijkingen blijven het
Source-acceptatiebewijs. De live-regio's behouden de bronfonts, kleuren, foto's,
witruimte en responsive opbouw.

## Afzonderlijke beveiligingsbevindingen

GitHub meldt 94 open Dependabot-alerts: vier critical, dertig high, 43 medium en
zeventien low. [Alle 94](evidence/phase-27/reference-dependency-alerts.json)
verwijzen naar de vier bevroren package-/lockbestanden onder
`design-reference/sites-v3`. Die versies zijn wel kwetsbare referentiedeclaraties;
de alerts blijven open en worden niet verborgen of als opgelost voorgesteld.

De geïnstalleerde workspace bevat alleen Fieldgrid. Het verzegelde artifact
bevat geen `design-reference`-bestanden en gebruikt Next 16.3.8 en
React/react-dom 19.2.6; zie de
[runtimegrens](evidence/phase-27/runtime-dependency-boundary.json).
De high-/criticalaudit voor de werkelijke applicatiedependencies slaagt in alle
drie verificaties. De bestaande braces-uitzondering blijft gekoppeld aan de
beoordeelde upstream-patch en regressietest. Geen scanner of alert is uitgezet.

Het historische GitGuardian-incident 38269956 betreft een statische
testuitkomstnaam; de inhoudelijke beoordeling en de nog externe incidentstatus
blijven afzonderlijk beschreven in de securityreview.

## Nog niet bewezen of vrijgegeven

| Onderdeel | Concrete grens |
| --- | --- |
| Private live acceptatie | De volledige nieuwe CRM-/portaalbrowserketens slagen lokaal; hosted contractfixtures slagen. Een volledige acceptatie met echte staginggebruikers is niet geclaimd. |
| E-mail | Primaire registratie en verse worker zijn geslaagd; daadwerkelijke externe providerbezorging aan die beheerder is niet bewezen. Lokale Mailpit-/OTP-ketens en centrale transport-/retrygrenzen zijn getest. |
| PWA | Responsieve browser-/manifest-/installatieherinneringsketens slagen; fysieke Android-/iOS-installatie is niet uitgevoerd. |
| Betalen en publieke gegevens | Echte betaalprovideracceptatie waar van toepassing en definitieve juridische contactgegevens blijven afzonderlijke acceptatiepunten. |
| Productie | Niet gepromoveerd. De read-only controle op 16 oktober 2026 om 09:11 UTC ziet de gezonde oude productie-SHA `71df59a…`; `www.fieldgrid.nl` geeft op dat moment HTTP 502. Het doeladres blijft expliciet `https://www.fieldgrid.nl`. Productieacceptatie en werkende www-routing/TLS moeten via de bestaande operator-/releaseprocedure worden vastgesteld. DNS/Caddy is niet gewijzigd. |

Het [105-regelige register](screen-register.json) en de
[acceptatiematrix](acceptance-matrix.md) houden geïmplementeerd, getest,
stagingdeployment, productie en volledige liveacceptatie afzonderlijk bij.

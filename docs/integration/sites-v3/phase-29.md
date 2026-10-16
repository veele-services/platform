# Publieke productieacceptatie na de www-proxycontrole

Na de proxycontrole door de eigenaar is `https://www.fieldgrid.nl` op
16 oktober 2026 bereikbaar. De applicatie-SHA blijft
`5480df58a052fa795c76d1beb7172291f7e9ef1f`; er is geen nieuwe applicatie,
migratie of hostingconfiguratie door deze bewijswijziging gedeployed.
De eerdere HTTP 502 in fase 28 is historisch bewijs en blijft bewaard.

## Daadwerkelijke livecontrole

De [read-only browsercontrole](evidence/phase-29/result.json) slaagt voor alle
23 publieke Fieldgrid-routes op 1440, 768 en 390 px: **69 paginaweergaven**.
Elke route geeft HTTP 200, een inhoudelijke titel en de juiste canonical op www,
`index, follow`, een kop binnen de viewport en geen horizontale overflow.
Poppins en Inter zijn daadwerkelijk geladen; na het laden van de luie inhoud
zijn er geen kapotte afbeeldingen of JavaScript-paginafouten vastgesteld.

De sitemap bevat alle 23 verwijzingen; robots staat publieke indexering toe.
De publieke afspraakbeschikbaarheid geeft HTTP 200 met uitsluitend datum,
duur, tijdzone en vrije tijden, zonder persoonsgegevens. Er zijn geen formulieren
verstuurd, echte afspraken geboekt, privégebruikers ingelogd of testmails verzonden.

De hostgrenzen zijn afzonderlijk gecontroleerd:

- `www.fieldgrid.nl/platform` geeft de publieke productuitleg.
- `fieldgrid.nl/platform` geeft 307 naar de beveiligde login.
- Het interne marketingpad geeft op beide hosts 404.
- Een onbekende tenantslug faalt gesloten met 404.
- De basisproductiehealth rapporteert de verwachte SHA, database ready en scanner ready.

Alle [twaalf schermopnamen](evidence/phase-29/viewed-screenshots.json) zijn
daadwerkelijk bekeken: homepage, productpagina, proefperiode en telefonische
afspraak, elk op desktop, tablet en mobiel. Het zijn bovenste viewports van
900 pixels hoog; zij worden niet als volledig bekeken lange pagina's voorgesteld.
De eerdere Source-vergelijkingen en volledige stagingbeelden blijven apart behouden.

## Opnamefouten blijven zichtbaar

Twee eerdere pogingen stopten bij het opslaan van een volledige screenshot met
`Page.captureScreenshot: Unable to capture screenshot`. De oorspronkelijke
[eerste](evidence/phase-29/initial-screenshot-failure.json) en
[tweede](evidence/phase-29/second-fullpage-screenshot-failure.json) uitslagen zijn
bewaard. Een afzonderlijke viewport- en volledige opname lukten daarna;
de [diagnostiek](evidence/phase-29/screenshot-diagnostic.json) meet dezelfde
9871px-homepage en werkelijk geladen fonts, zonder kapotte afbeeldingen.
De lokale browser meldt ook uitgeputte inotify-instanties. Deze melding wordt
niet als bewezen afzonderlijke oorzaak van de opnamefout voorgesteld.

De definitieve controle gebruikt gewone viewportopnamen na het laden van alle
inhoud en twee renderframes. De 69 HTTP-, inhouds-, font-, beeld-, metadata- en
hostassertions blijven verplicht. Geen applicatiecode, CSS, referentiebeeld,
serverconfiguratie of beveiligingscontrole is aangepast voor dit herstel.

## Waarom de basis-host een andere pagina toont

De screenshot van de eigenaar toont `https://fieldgrid.nl` zonder www. Daar
toont de bestaande applicatie de platformstartpagina met “Werk georganiseerd.”
De publieke website staat op `https://www.fieldgrid.nl` zoals het domeincontract
voorschrijft. Beide liveweergaven zijn vastgesteld; dit is geen terugkeer van de 502.

Een eventuele operatorredirect kan worden beperkt tot GET/HEAD van exact `/`
op `fieldgrid.nl`, met een vaste bestemming `https://www.fieldgrid.nl/`.
Daarmee blijven platformlogin, API's en de overige bestaande platformpaden bij
hun eigen host. Zo'n extra rootredirect is in dit bewijs **niet toegepast** en
wordt niet als live geverifieerd voorgesteld. `APP_URL` blijft ongewijzigd.

## Afzonderlijke actuele stagingstoring

De [hostcontrole om 20:47 UTC](evidence/phase-29/host-observations.json) geeft
HTTP 502 op zowel `staging.fieldgrid.nl/api/healthz` als
`veele-services.staging.fieldgrid.nl/api/healthz`. Productie geeft tegelijkertijd
HTTP 200 met de verwachte applicatie-SHA en database/scanner ready. De eerdere
geslaagde stagingdeployment en acceptatie blijven historisch geldig, maar zijn
geen bewijs van actuele stagingbeschikbaarheid. De huidige staging-SHA kan via
deze publieke foutrespons niet worden vastgesteld.

De eigenaar bevestigt vervolgens via de [lokale diagnose](evidence/phase-29/staging-operator-diagnosis.json)
dat `fieldgrid@staging.service` inactive is en de verbinding met
`127.0.0.1:3301` direct wordt geweigerd. Daarmee is een niet-beschikbare lokale
upstream vastgesteld; waarom de service stopte is onbekend. Een operatorstart
van de bestaande service met daaropvolgende exacte-SHA-healthcontrole is
voorgesteld. Herstel is nog niet aangetoond. Er is geen Caddy-aanpassing,
herstart, herdeployment of herhaalde brokeractivatie door de agent uitgevoerd.

De [release-status](release-status.json) markeert de publieke productiecontrole
nu als geslaagd en verwijdert de opgeloste www-bereikbaarheidsblokkade.
Volledige private hosted ketens, feitelijke externe providerbezorging, fysieke
PWA-installatie en de overige expliciete acceptatiepunten blijven afzonderlijk.

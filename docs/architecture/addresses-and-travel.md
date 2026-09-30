# Adressen en basisreistijden

## Bestaande bronnen blijven leidend

Adressen blijven op `personnel.home_address`, `personnel.alternate_departure_address`,
`customers.billing_address`, `objects.address` en de nieuwe tenantgebonden
`travel_depots.address`. Het oude HR-profieladres wordt alleen bij een leeg
woonadres overgenomen, als **nog te controleren** tekst. Historische dossierdata
blijft behouden; er komt geen tweede actief adresformulier voor dezelfde persoon.

Een geselecteerd PDOK-adres bewaart straat, huisnummer, huisletter, toevoeging,
postcode, woonplaats, landcode, weergavetekst, bron-/BAG-ID, WGS84-coördinaten en
bevestigingstijd. De server haalt de selectie opnieuw bij PDOK op. Handmatig
bewerken verwijdert de oude locatie. Selectie bewijst geen eigendom of woonplaats.
Bestaande vrije tekst wordt niet automatisch gesplitst, gegeocodeerd of vervangen.
Instellingen toont objecten zonder routebestemming en ontbrekende vervoerkeuzes;
gebruikers bevestigen twijfelgevallen via hetzelfde zoekveld in het dossier.

Werkbonnen gebruiken uitsluitend het object, nooit het klantfactuuradres.
`objects.arrival_location` is een afzonderlijk `[longitude, latitude]`-punt voor
een ingang of parkeerplaats. De officiële locatie verandert niet door de marker.
Een gewijzigd officieel adres wist de afwijkende aankomstplek ter herbeoordeling.
De huidige werkbonstructuur heeft geen eigen fysieke locatie-override.

## Reisplanning

Personeel 360 en de wizard registreren vervoer en vertrek (woonadres, depot of
bevestigde afwijkende plek), zonder stilzwijgende voertuigkeuze. Op het planbord
kan per medewerker/dag een andere vervoerkeuze, vertreksoort/depot en terugrit
worden ingesteld. `personnel_travel_days` gaat vóór de medewerkerstandaard.
HR/beheer kan voor een afzonderlijke werkdag een eigen bevestigd vertrekadres
vastleggen; zonder dagadres wordt de bevestigde afwijkende plek uit Personeel 360
gebruikt. Deze privékolom is niet via de gewone daginstellingen-query leesbaar.

Auto/bestelauto → `driving-car`, fiets → `cycling-regular`, e-bike →
`cycling-electric`, lopen → `foot-walking`; overige vervoermiddelen zijn handmatig.
Een bestelautoroute controleert geen hoogte, gewicht of speciale toegang.

Per medewerker worden niet-geannuleerde toewijzingen chronologisch verbonden:
vertrek → eerste object → volgende objecten → optionele terugrit. Een pauze
introduceert geen nieuwe locatie. Meerdere medewerkers krijgen afzonderlijke
trajecten. De volgende bestemming is de aankomstplek, anders de adreslocatie.

De keten gebruikt `work_order_assignments.planned_start_at/planned_end_at`, niet
werkelijke uren of door uitvoering gewijzigde projecties.
Basisduur blijft in seconden, afstand in meters. Planningsduur is
`ceil(basisseconden / 60) + marge`. Margevoorrang: object → vervoermiddel →
tenantstandaard (initieel 5 minuten, ook bij een zeer korte rit). Voor terugreizen
geldt vervoermiddel → tenantstandaard. De marge is geen providerresultaat.
09:30 + 18 minuten + 7 minuten = 09:55; een start om 09:40 geeft 15 minuten tekort.
De eerste rit toont een geadviseerde vertrektijd, geen aanwezigheidsregistratie.

Het full-viewport planbord behoudt slepen en snappoints. Routeaanvragen volgen
op bevestigde planningwijzigingen, niet op muisbewegingen. De hele dagketen wordt
opnieuw beoordeeld (ook de achterblijvende en nieuwe medewerker). Bestaande
overlap-, beschikbaarheid- en tijdvenstercontroles blijven gelden. Reisconflicten
worden daarna per medewerker gemeld; andere bonnen verschuiven niet automatisch.
Details, handmatige invoer en routekaarten zijn ook via een mobiel paneel bereikbaar.
Werkbondetails en de eigen bon in het personeelsportaal tonen dezelfde reisbron.

## Backend, cache en fouten

De backend gebruikt de actuele PDOK OGC-search met `adres[version]=1` en BAG-detail,
beide expliciet CRS84. ORS-aanvragen gebruiken **longitude, latitude**. De Matrix
API bundelt alleen daadwerkelijk benodigde bestemmingen met hetzelfde vertrekpunt
en profiel. Geometrie via Directions wordt pas bij een kaartverzoek opgehaald.

De technische cache is privé en bevat geen tenant-, klant- of medewerker-ID.
Sleutels onderscheiden richting, coördinaten, providerbasis, profiel, opties en
geometrie. Marges zitten niet in die sleutel. Geldigheid is standaard 30 dagen.
Databaseleases bundelen gelijktijdige aanvragen, ook tussen runtimeprocessen.
Een gedeeld minuut-/24-uursbudget begrenst matrix en directions afzonderlijk.
Een verzoek verwerkt maximaal zes batches; zichtbaar geopende planningen halen
elke 30 seconden de volgende wachtende batch op. Er is geen nieuwe VPS-worker.
Time-outs/fouten hebben een retry-pauze; een oud resultaat blijft uitsluitend
voor exact hetzelfde traject/profiel bruikbaar en wordt als bij te werken gemeld.

Ontbrekende gegevens, geen route, fouten en limieten worden **Reistijd onbekend**,
nooit een fictieve nul. Een echte nulduur houdt nog steeds de aankomstmarge.
Handmatige seconden/afstand/reden staan los van providerduur/afstand/tijdstip.
Na een andere medewerker, volgorde, locatie of voertuig wordt een handmatige
waarde opnieuw ter bevestiging aangeboden. Terug naar automatisch wist de override.

Een tenantrevisie en routevingerafdruk voorkomen het opslaan/tonen van antwoorden
voor een achterhaalde planning. Werkelijk geregistreerde tijden en financiële
gegevens blijven ongemoeid. Historische/afgeronde estimates worden niet herschreven.

## Afbakening en privacy

Elke HTTP-aanvraag controleert origin, sessie, hostname-tenant en actuele toegang.
De context-/cache-/opslag-RPC's zijn uitsluitend voor de serverrol. De gewone
personeelslijst mag privé-adreskolommen niet selecteren. HR/beheer en de medewerker
zelf lezen privévertrekgegevens via het beveiligde dossierpad. Planners krijgen
duur en haalbaarheid, maar geen privé-adrestekst, coördinaten of privéroutekaart.
Medewerkers zien uitsluitend eigen gepubliceerde toewijzingen; klanten hebben
geen toegang. Opgeslagen, gedeelde estimates bevatten geen privéroutecoördinaten.
ORS ontvangt alleen locaties en routingparameters; er worden geen adressen,
personeelsnamen of sleutels gelogd. Kaarten laden alleen op gebruikersactie.

## Stagingconfiguratie

Alle onderstaande configuratie komt uitsluitend uit GitHub Environment `staging`.
De workflow schrijft de toegestane sleutels naar de bestaande runtimeomgeving.

| Naam | Type | Nodig / standaard |
| --- | --- | --- |
| `OPENROUTESERVICE_API_KEY` | Secret | Nodig voor automatische basisroutes; uit het HeiGIT/openrouteservice-account. Niet nodig voor handmatige reistijden, PDOK of kaarttegels. |
| `OPENROUTESERVICE_BASE_URL` | Variable | Optioneel; `https://api.heigit.org/openrouteservice/v2`. Een andere backend moet hetzelfde ORS-contract leveren. |
| `ROUTING_PROVIDER` | Variable | Optioneel; `openrouteservice` of `disabled`. |
| `ROUTING_CACHE_DAYS` | Variable | Optioneel; `30`, toegestaan 1–90. |
| `ROUTING_MATRIX_MINUTE_LIMIT` | Variable | Optioneel; `35`. |
| `ROUTING_MATRIX_DAY_LIMIT` | Variable | Optioneel; `450`. |
| `ROUTING_DIRECTIONS_MINUTE_LIMIT` | Variable | Optioneel; `35`. |
| `ROUTING_DIRECTIONS_DAY_LIMIT` | Variable | Optioneel; `1900`. |

Controleer de limieten tegen het werkelijk toegekende providerabonnement en tel
eventuele andere applicaties met dezelfde sleutel mee. Zonder sleutel blijft de
app bruikbaar maar zijn automatische reistijden expliciet onbekend. Google Routes
blijft uitgeschakeld; geen legacy fallback. Geen wijziging aan productie, Caddy,
systemd, poort of deployroot vereist. De bestaande staging-releaseketen voert de
forward-only migratie na backup uit.

Vóór stagingmigraties controleert de deployworkflow met de ingestelde sleutel alle
vier profielen op één traject tussen twee openbare stations. Deze controle schrijft
geen tenantdata en logt geen sleutel, coördinaten of providerantwoord. Een fout
blokkeert activatie; `ROUTING_PROVIDER=disabled` is de expliciete handmatige modus.
Reserveer naast runtimeverbruik vier Matrix-aanvragen per deployment.

## Verificatie en acceptatie

Unit-tests controleren PDOK-formaat/suffixen, coördinaatvolgorde, invalidatie,
profielen, ketens, marges, tekort, foutafhandeling, cachegebruik, handmatige waarden,
privacy en stale-response-afwijzing. `scripts/test-travel.mjs` test echte lokale
SQL-rechten, actuele sessies/publicatie, overrides, arrival, revisies en cacheleases.
Playwright test de formulieren, opslag, planbord, handmatige correctie, dagvervoer,
personeelstoegang en mobiel. Alle providerfixtures zijn expliciet fictief en worden
uitsluitend via een lokaal testproces geladen; geen productie-testmodus of fallback.

Na configuratie: bevestig object- en vertrekadressen, kies vervoer, stel marge in,
plan twee opeenvolgende bonnen en vergelijk de berekening met de provider. Controleer
ook fiets/e-bike/lopen, handmatige fallback en een medewerkerlogin. Live provider-
acceptatie gebruikt de staging-sleutel: de deployment-smokecheck bewijst de
providerkoppeling, de aansluitende tenantacceptatie controleert de eigen adressen
en planningskeuzes. Unit-/browsertests gebruiken herkenbare fixtures.
Geen live verkeersinformatie, GPS, voertuigspecifieke bestelautorestricties of
automatische onzekere adresverrijking in deze versie.

Bronnen: [PDOK Location API](https://api.pdok.nl/kadaster/location-api/v1/),
[ORS Matrix](https://giscience.github.io/openrouteservice/api-reference/endpoints/matrix/),
[ORS-profielen](https://giscience.github.io/openrouteservice/run-instance/configuration/engine/profiles/),
[MapLibre Next.js-instructies](https://maplibre.org/maplibre-gl-js/docs/),
[OpenFreeMap](https://openfreemap.org/quick_start/).

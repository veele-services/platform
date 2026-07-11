# Google Maps Platform Configuratie En Operatie

Dit document hoort bij de centrale Fieldgrid Google Maps Platform-integratie. Het beschrijft de Google Cloud setup, environmentvariabelen, privacygrenzen, kostenbeheersing, usage-rapportage en rollback voor development, staging en production.

De architectuur is strikt gescheiden:

- Maps JavaScript API draait client-side met `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY`.
- Places API (New) draait alleen server-side via Fieldgrid endpoints.
- Routes API draait alleen server-side via Fieldgrid services/endpoints.
- `GOOGLE_MAPS_SERVER_API_KEY` mag nooit in browserbundles, props, HTML, hydrationdata, publieke JSON-responses, logs of client-side environmentvariabelen terechtkomen.

## Google Cloud Services

Schakel uitsluitend deze APIs in op het Google Cloud project:

- Maps JavaScript API;
- Places API (New);
- Routes API.

Niet inschakelen of gebruiken voor Fieldgrid:

- Directions API Legacy;
- Distance Matrix API Legacy;
- Places API Legacy;
- Route Optimization API;
- Compute Route Matrix;
- Fleet Routing.

Maak minimaal twee keys:

- Browserkey voor Maps JavaScript API.
- Serverkey voor Places API (New) en Routes API.

Gebruik waar mogelijk gescheiden keys per omgeving of minimaal gescheiden restricties per omgeving.

## Environmentvariabelen

Verplicht zodra Google Maps in een omgeving actief is:

```env
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY=""
GOOGLE_MAPS_SERVER_API_KEY=""
GOOGLE_MAPS_MAP_ID=""
```

Standaardconfiguratie:

```env
GOOGLE_MAPS_ENABLED="true"
GOOGLE_MAPS_DEFAULT_COUNTRY="NL"
GOOGLE_MAPS_DEFAULT_LANGUAGE="nl"
GOOGLE_MAPS_DEFAULT_REGION="NL"
GOOGLE_PLACES_AUTOCOMPLETE_ENABLED="true"
GOOGLE_ROUTES_ENABLED="true"
GOOGLE_ROUTES_TRAFFIC_ENABLED="true"
```

Alleen voor tests/lokaal zonder live Google-calls:

```env
FIELDGRID_ROUTE_PROVIDER="mock"
```

`FIELDGRID_ROUTE_PROVIDER=mock` is niet bedoeld als productieconfiguratie. Zonder `GOOGLE_MAPS_SERVER_API_KEY` valt de routeprovider veilig terug naar mock, maar staging en production moeten een echte serverkey hebben voordat live routes worden getest. De oude routespecifieke keynaam wordt niet meer gelezen.

## Keyrestricties

Browserkey:

- API restrictie: alleen Maps JavaScript API.
- Application restriction: HTTP referrers.
- Development: `http://localhost:*/*` en eventueel lokale devhost.
- Staging: `https://admin.fieldgrid.nl/*`, `https://staging.fieldgrid.nl/*`, `https://*.fieldgrid.nl/*` voor staging tenants die live smoke nodig hebben.
- Production: `https://admin.fieldgrid.nl/*`, `https://www.fieldgrid.nl/*`, `https://*.fieldgrid.nl/*` en enterprise custom domains die daadwerkelijk via Fieldgrid lopen.

Serverkey:

- API restrictie: alleen Places API (New) en Routes API.
- Application restriction: server IP restrictie waar Google Cloud en hosting dit betrouwbaar ondersteunen.
- Nooit `NEXT_PUBLIC_*` maken.
- Nooit dezelfde waarde gebruiken als de browserkey.
- Nooit loggen of in foutmeldingen teruggeven.

Map ID:

- `GOOGLE_MAPS_MAP_ID` is geen secret.
- Gebruik dezelfde Map ID alleen als styling bewust gelijk moet blijven.
- Bij white-label thema's blijft kaartstyling neutraal; tenantbranding gebeurt in Fieldgrid UI, niet via tenant-specifieke Google keys.

## Github Environment Setup

### Staging

GitHub Environment `staging`:

- secret: `GOOGLE_MAPS_SERVER_API_KEY`;
- variable of secret: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY`;
- variable: `GOOGLE_MAPS_MAP_ID`;
- variable: `GOOGLE_MAPS_ENABLED=true`;
- variable: `GOOGLE_MAPS_DEFAULT_COUNTRY=NL`;
- variable: `GOOGLE_MAPS_DEFAULT_LANGUAGE=nl`;
- variable: `GOOGLE_MAPS_DEFAULT_REGION=NL`;
- variable: `GOOGLE_PLACES_AUTOCOMPLETE_ENABLED=true`;
- variable: `GOOGLE_ROUTES_ENABLED=true`;
- variable: `GOOGLE_ROUTES_TRAFFIC_ENABLED=true`.

Staging quota:

- lage dagelijkse quota;
- budget alert op Google Cloud project;
- live smoke alleen handmatig of expliciet in een pipeline;
- standaard tests mocken Google en doen geen betaalde calls.

### Production

GitHub Environment `production`:

- secret: `GOOGLE_MAPS_SERVER_API_KEY`;
- variable of secret: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY`;
- variable: `GOOGLE_MAPS_MAP_ID`;
- dezelfde defaults als staging, tenzij tijdelijk rollback nodig is.

Production quota:

- budget alerts verplicht;
- quota per API instellen;
- monitoring op usage spikes;
- serverkey alleen voor backend en niet beschikbaar in frontend build logs.

## Dataflow

Maps JavaScript API:

- client laadt Maps JS pas wanneer een kaart zichtbaar is;
- gebruikt alleen browserkey en Map ID;
- mag markers, polylines en UI-data tonen die Fieldgrid server-side al heeft geautoriseerd.

Places API (New):

- browser roept Fieldgrid endpoint aan;
- Fieldgrid bepaalt tenantcontext server-side;
- Fieldgrid valideert input, sessietoken en permissies;
- Fieldgrid roept Google Places server-side aan met `GOOGLE_MAPS_SERVER_API_KEY`;
- browser krijgt alleen veilige suggestie- en detailvelden terug.

Routes API:

- browser start routeberekening alleen na expliciete actie zoals "Route bekijken";
- Fieldgrid bepaalt tenantcontext server-side;
- Fieldgrid valideert origin, destination, opdracht/personeel en permissies;
- Fieldgrid roept Routes API server-side aan;
- browser krijgt alleen veilige routeweergave terug.

## Field Masks

Places autocomplete/details vraagt alleen functionele velden op:

- `id`;
- `formattedAddress`;
- `addressComponents`;
- `location`;
- `displayName`;
- `types`.

Routes vraagt alleen routevelden op die in de UI gebruikt worden:

- `routes.duration`;
- `routes.staticDuration`;
- `routes.distanceMeters`;
- `routes.polyline.encodedPolyline`;
- `routes.description`;
- `routes.viewport`.

Niet opvragen voor gewone adresselectie of routeberekening:

- reviews;
- ratings;
- fotos;
- openingstijden;
- telefoonnummers;
- websites;
- bedrijfsmetadata die niet wordt getoond;
- willekeurige Google payloads.

## Opgeslagen Google-data

Fieldgrid slaat alleen gegevens op nadat een gebruiker een adres expliciet selecteert of bevestigt:

- Fieldgrid-adresvelden, zoals straat, postcode, plaats, land en geformatteerd adres;
- latitude en longitude;
- `google_place_id`;
- `location_source`, `location_verified_at`, `location_updated_at`;
- eigen routecache-hashes en beperkte routecontexten zonder volledige raw Google payloads.

Niet opslaan:

- autocomplete prediction payloads als eigen database;
- volledige Place Details payloads;
- API keys;
- volledige routepayloads;
- ruwe origin/destination adressen in usage metrics;
- Google responseheaders;
- onbeperkte routecontent.

Het bevestigde adres wordt na selectie behandeld als Fieldgrid-klant-, object-, personeels- of opdrachtdata en valt onder de bestaande tenantisolatie, retentie en exportprocessen.

## Privacy En EEA

Privacyregels:

- tenantcontext wordt server-side bepaald;
- tenant A mag nooit adressen, routes of usage van tenant B lezen;
- personeels- en klantportalen krijgen alleen eigen toegestane context;
- metrics bevatten geen volledige adressen, API keys, tokens, polyline payloads of herleidbare routepayloads;
- logs bevatten alleen generieke Google foutcodes/statussen.

EEA-aandachtspunten:

- gebruik Google Maps Platform alleen voor de noodzakelijke functionaliteit;
- beperk field masks;
- voorkom opbouw van een eigen Places-database uit Google-resultaten;
- documenteer dat geselecteerde adressen Fieldgrid-data worden;
- vermijd langdurige opslag van Google routecontent;
- herbeoordeel Google voorwaarden bij wijzigingen in caching, routecontent of data-export.

## Attribution

Maps JavaScript API toont Google-attribution in de kaart zelf. Verberg of overschrijf deze attribution niet.

Voor tekstuele fallbacks of externe routeknoppen:

- gebruik correcte Google Maps URLs;
- presenteer de data als route-/adresondersteuning, niet als eigen geodata;
- toon geen misleidende bronvermelding.

## Cachebeleid

Autocomplete:

- geen permanente cache van predictions;
- debounce 300-400 ms;
- minimale inputlengte 3 tekens;
- in-flight dedupe toegestaan;
- zeer korte negatieve cache bij tijdelijke netwerkfouten toegestaan;
- Place Details pas na selectie.

Routes:

- routecall alleen bij expliciete route-intentie;
- dedupe op tenant, origin, destination, travel mode, vertrekbucket en traffic preference;
- DRIVE met traffic: alleen korte TTL van enkele minuten;
- TRANSIT: korte tijdgebonden TTL;
- WALK/BICYCLE: beperkt langer wanneer Google voorwaarden dit toestaan;
- fouten: zeer korte negatieve cache;
- geen automatische routecalls bij render, hover, kaartbeweging, filterrefresh of verborgen tabs.

Als Google voorwaarden caching beperken, valt de implementatie terug naar alleen in-flight dedupe.

## Rate Limits

Rate limiting is verplicht voor:

- autocomplete;
- Place Details;
- routeberekening;
- usage event ingestion.

Limieten zijn tenant- en gebruikerbewust waar mogelijk. Rate-limit responses zijn generiek richting browser en bevatten geen Google details of secrets. Rate-limit events worden als `google_api_rate_limited` in usage metrics geregistreerd.

## Usage Rapportage

Te meten events:

- `maps_view_opened`;
- `autocomplete_request`;
- `autocomplete_session_started`;
- `autocomplete_selection`;
- `place_details_request`;
- `route_request`;
- `route_request_drive_traffic`;
- `route_request_bicycle`;
- `route_request_walk`;
- `route_request_transit`;
- `google_api_error`;
- `google_api_rate_limited`.

Usage bevat:

- `tenant_id`;
- `user_id` indien beschikbaar;
- omgeving;
- datum;
- provider;
- estimated SKU;
- success/failure;
- response time;
- cache/dedupe status;
- metadata zonder adressen of Google payloads.

Platformadminrapportage mag alle tenants aggregeren. Tenantweergave mag alleen eigen usage tonen wanneer die UI actief is.

## Kostenbeheersing

Kostenmaatregelen:

- Maps JS lazy-loaden;
- geen kaartscript in app-shell;
- geen routecalls zonder expliciete actie;
- geen Place Details zonder selectie;
- session tokens per autocomplete-interactie;
- minimale field masks;
- tenant/app rate limiting;
- in-flight dedupe;
- korte routecache;
- usage metrics en budgetalerts;
- optionele live smoke met zeer beperkte calls.

## Fallbackstates

Wanneer Google Maps niet beschikbaar is:

- geen lege grijze kaart tonen;
- duidelijke configuratie- of netwerkstatus tonen;
- adresgegevens als tekst beschikbaar houden;
- links naar opdracht/object beschikbaar houden;
- handmatige adresinvoer laten werken;
- eventueel "Open in Google Maps" tonen via correcte externe URL.

Wanneer Routes faalt:

- markers blijven zichtbaar;
- routepaneel toont fout en retry;
- opdrachtdata blijft zichtbaar;
- geen onbeperkte automatische retries;
- technical metrics registreren veilige foutcodes.

## Rollback

Volledige Google rollback:

```env
GOOGLE_MAPS_ENABLED="false"
GOOGLE_PLACES_AUTOCOMPLETE_ENABLED="false"
GOOGLE_ROUTES_ENABLED="false"
```

Route-only fallback:

```env
FIELDGRID_ROUTE_PROVIDER="mock"
GOOGLE_ROUTES_ENABLED="false"
```

UI rollback:

```env
FIELDGRID_PLANNING_DAY_MAP_ENABLED="false"
```

Rollback-effecten:

- kaarttab verdwijnt of toont fallback;
- handmatige adresinvoer blijft werken;
- bestaande opdrachten/objecten/klanten blijven bereikbaar;
- routecache en usage data blijven staan voor audit/debug;
- geen migratie rollback nodig zolang de migraties additive blijven.

## Operator Checklist Staging

Voor deploy:

- [ ] `GOOGLE_MAPS_SERVER_API_KEY` staat als staging secret.
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY` staat als staging variable/secret.
- [ ] `GOOGLE_MAPS_MAP_ID` staat als staging variable.
- [ ] Browserkey heeft staging HTTP-referrers.
- [ ] Serverkey is beperkt tot Places API (New) en Routes API.
- [ ] Budget alert en lage quota staan aan.
- [ ] `GOOGLE_MAPS_ENABLED=true`.
- [ ] `GOOGLE_PLACES_AUTOCOMPLETE_ENABLED=true`.
- [ ] `GOOGLE_ROUTES_ENABLED=true`.
- [ ] `FIELDGRID_ROUTE_PROVIDER` is leeg of bewust `mock` voor testfallback.

Na deploy:

- [ ] open `/planning?view=map`;
- [ ] controleer dat Maps JS laadt zonder serverkey in browser;
- [ ] test adresautocomplete vanaf 3 tekens;
- [ ] selecteer een adres en controleer opgeslagen Fieldgrid-adresvelden;
- [ ] klik expliciet "Route bekijken";
- [ ] controleer DRIVE route met traffic;
- [ ] controleer BICYCLE/WALK waarschuwing;
- [ ] controleer TRANSIT empty/fallback;
- [ ] controleer platform usage rapportage;
- [ ] controleer Google Cloud quota/billing na test.

## Operator Checklist Production

Voor productie:

- [ ] staging checklist is volledig groen;
- [ ] production browserkey heeft alleen production hosts/custom domains;
- [ ] production serverkey is API- en waar mogelijk IP-beperkt;
- [ ] production budget alerts staan aan;
- [ ] quota's zijn passend voor beta/productiegebruik;
- [ ] rollbackvariabelen zijn bekend bij operations;
- [ ] support weet dat Maps JS client-side is en Places/Routes server-side zijn;
- [ ] er is geen `NEXT_PUBLIC_GOOGLE_MAPS_SERVER_API_KEY`;
- [ ] er is geen serverkey in frontend bundle of logs gevonden.

Na productie:

- [ ] beperkte smoke op kaart, autocomplete en route;
- [ ] usage rapportage controleren;
- [ ] Google Cloud usage controleren;
- [ ] foutlogs controleren op veilige, generieke errors;
- [ ] support/tenant feedback monitoren.

## Verificatie

Aanbevolen lokale checks:

```powershell
node --test tests/fieldgrid-google-maps-sprint*.test.mjs tests/fieldgrid-personnel-home-address-routing.test.mjs
node --test tests/fieldgrid-google-maps-sprint13-docs.test.mjs
node scripts/fieldgrid-migration-order-check.mjs --check
node node_modules/typescript/bin/tsc --build
```

Builds via `pnpm` moeten in CI/Linux of een Windowsomgeving met de juiste pnpm/preinstall ondersteuning draaien.

## Sprint 14 Acceptatiegate

Standaard CI/check zonder betaalde Google-calls:

```powershell
pnpm fieldgrid:google-maps-sprint14:check
```

Deze gate draait:

- alle Google Maps sprinttests;
- personeels-home-address route regressietest;
- migratievolgordecheck;
- gemockte Playwright UI-smoke;
- finale acceptatiecontrole met bewijsoutput in `outputs/google-maps-sprint14-acceptance/`.

Strikte releasegate inclusief typecheck en workspace build:

```powershell
pnpm fieldgrid:google-maps-sprint14:strict
```

Optionele staging live smoke met zeer beperkte live calls:

```powershell
$env:FIELDGRID_GOOGLE_MAPS_LIVE_SMOKE="1"
$env:FIELDGRID_GOOGLE_MAPS_STAGING_BASE_URL="https://veeleservices.fieldgrid.nl"
$env:FIELDGRID_GOOGLE_MAPS_STAGING_STORAGE_STATE="outputs/google-maps-sprint14-acceptance/auth/tenant-admin.json"
pnpm fieldgrid:google-maps-sprint14:staging-live
```

De live smoke is bewust opt-in. Zonder `FIELDGRID_GOOGLE_MAPS_LIVE_SMOKE=1` schrijft de smoke een `skipped` rapport en voert hij geen betaalde live check uit. De live variant opent alleen `/planning?view=map`; Places-selecties en Routes-berekeningen worden niet automatisch getriggerd.

# Google Maps Platform Integration Plan

Status: Sprint 0 baseline en regressiebescherming.

Sprint 1 vult de centrale modulebasis, env-documentatie en secret guards aan zonder de actieve kaart-, Places- of Routes-flow al te migreren.

Laatste baseline: main branch, na `git fetch origin main` en `git pull --ff-only origin main`.

Lokale werkboom bij start:

- `main` liep gelijk met `origin/main`.
- Bestaande untracked bestanden zijn genegeerd en niet meegenomen in deze sprint:
  - `docs/fieldgrid-phase-2-staging-runtime-proof-2026-07-07.md`
  - `outputs/customer-personnel-phase16-releasegate/`
  - `outputs/invoice-sprint10-release-gate/`

Deze sprint voert geen functionele migratie uit. Dit document legt de huidige situatie, canon-eisen, geraakte onderdelen, migratiestrategie, teststrategie en rollback vast voordat Google Maps Platform verder wordt ingebouwd.

## 1. Samenvatting

Fieldgrid heeft al een planningkaart en routecontexten, maar de huidige implementatie is een mix van:

- een eigen rasterkaart in React met CARTO-tiles en OpenStreetMap fallback;
- PDOK-adreszoeker/geocoding voor Nederlandse adressen;
- server-side Google Routes `computeRoutes` als optionele provider via `GOOGLE_ROUTES_API_KEY`;
- een deterministische mock routeprovider als fallback;
- tenant-scoped planningqueries en routecontextopslag;
- medewerkervervoerstypes in legacy-vorm: `car`, `bicycle`, `walking`, `moped_or_scooter`, `public_transport`.

De canon vraagt om consolidatie naar een robuuste Google Maps Platform-integratie met:

- Maps JavaScript API;
- Places API (New);
- Routes API;
- centrale Google Maps module;
- browser/server key scheiding;
- lazy-loaded kaartcomponent;
- centrale markerstatusmapping;
- kostenbewuste autocomplete en routecalls;
- tenant-safe usage metrics;
- rate limiting;
- duidelijke fallbackstates;
- geen routeoptimalisatie, matrices of fleet routing.

## 2. Huidige Implementatie

### Kaart UI

Belangrijkste bestand:

- `artifacts/backoffice/src/components/assignments/PlanningMapView.tsx`

Huidige eigenschappen:

- client component;
- bouwt een kaart op met handmatige projectie, tile grid en CSS transforms;
- gebruikt CARTO als primaire rastertile provider:
  - `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`
- gebruikt OpenStreetMap als fallback:
  - `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
- toont OSM/CARTO-attribution;
- gebruikt lokale `STATUS_COLORS`;
- heeft eigen marker-rendering, popup/selectie en pan/zoom;
- gebruikt geen Maps JavaScript API, Map ID, Advanced Markers of Google marker clustering.

Risico:

- dubbele kaartlogica bij verdere Google-implementatie;
- statuskleuren zijn niet centraal herbruikbaar;
- Google Maps lazy-loading en cleanup ontbreken;
- filterupdates en markerupdates moeten in een volgende sprint expliciet zonder remount worden geborgd.

### Planningkaartdata

Belangrijkste bestanden:

- `artifacts/backoffice/src/app/actions/planning.ts`
- `artifacts/backoffice/src/lib/planning/map-data.ts`
- `artifacts/backoffice/src/lib/planning/day-map-feature.ts`

Huidige eigenschappen:

- route `/planning?view=map`;
- sidebar item `Kaart` in tenant backoffice;
- feature flag `FIELDGRID_PLANNING_DAY_MAP_ENABLED`;
- beta auto-enable via `APP_ENV=staging`, `VERCEL_ENV=preview` of `FIELDGRID_ENV=beta`;
- `getPlanningDayMapData` controleert `planning:read`;
- tenantcontext komt uit `requireCurrentTenantId()`;
- query filtert op `assignments.tenant_id`, actieve assignment, datum en toegewezen personeel;
- joins op personeel, klant, object en routecontext zijn tenant-scoped;
- objectcoordinaten worden gebruikt voor kaartmarkers;
- klantcoordinaten worden wel geselecteerd, maar nog niet als fallback gebruikt in `resolvePlanningMapCoordinate`.

### Routes

Belangrijkste bestanden:

- `artifacts/backoffice/src/lib/planning/routes/route-provider.ts`
- `artifacts/backoffice/src/lib/planning/routes/google-routes-provider.ts`
- `artifacts/backoffice/src/lib/planning/routes/mock-route-provider.ts`
- `artifacts/backoffice/src/lib/planning/routes/route-utils.ts`
- `artifacts/backoffice/src/lib/planning/routes/route-cache.ts`

Huidige eigenschappen:

- providerselectie via `FIELDGRID_ROUTE_PROVIDER`;
- Google wordt automatisch gekozen als `GOOGLE_ROUTES_API_KEY` aanwezig is;
- fallback naar mock provider wanneer Google ontbreekt;
- Google provider gebruikt server-side endpoint:
  - `https://routes.googleapis.com/directions/v2:computeRoutes`
- Google provider gebruikt field mask:
  - `routes.duration,routes.distanceMeters,routes.warnings`
- `DRIVE` gebruikt `TRAFFIC_AWARE`;
- routecache gebruikt DB-tabel `assignment_route_cache`;
- TTL kan tot 720 uur;
- vehicle mapping gebruikt legacy waarden;
- `moped_or_scooter` wordt gemapt naar `TWO_WHEELER`, terwijl de canon dit in deze fase uitsluit.

Risico:

- env-naam wijkt af van canon: `GOOGLE_ROUTES_API_KEY` in plaats van `GOOGLE_MAPS_SERVER_API_KEY`;
- routeservice is nog niet provider-onafhankelijk gecentraliseerd onder een Google Maps module;
- routecachebeleid moet worden herzien op Google-voorwaarden en traffic-aware TTL;
- response mist `staticDuration`, `polyline`, `viewport` en richer route metadata.

### Adreszoeker En Geocoding

Belangrijkste bestanden:

- `lib/db/src/address-geocoding.ts`
- `artifacts/backoffice/src/app/api/address-suggestions/route.ts`
- `artifacts/personeel-pwa/src/app/api/address-suggestions/route.ts`
- `artifacts/backoffice/src/lib/planning/geocoding.ts`

Huidige eigenschappen:

- gebruikt PDOK Locatieserver:
  - `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free`
- providerwaarde is `pdok`;
- autocomplete start pas vanaf 4 tekens;
- backoffice endpoint controleert toegang via permissies voor personeel/objecten;
- personeel-PWA endpoint gebruikt `getMyPersonnel()`;
- suggesties worden omgezet naar Fieldgrid-adresvelden en coordinaten;
- handmatige invoer blijft mogelijk via bestaande formulieren.

Risico:

- Places API (New) wordt nog niet gebruikt;
- session tokens ontbreken;
- Place Details op selectie ontbreekt;
- Google field masks en kostenbewuste requestflow ontbreken;
- tenant-specifieke regio/landrestrictie moet nog worden ontworpen.

### Datamodel: Locaties

Relevante bestaande tabellen:

- `customers`
- `objects`
- `personnel`
- `assignments`
- `assignment_route_cache`
- `assignment_route_contexts`

Huidige klant/object velden:

- adresvelden zoals `address`, `postal_code`, `city`, `country`;
- `latitude`, `longitude`;
- `geocoded_at`;
- `geocoding_provider`;
- `geocoding_status`;
- `geocoding_confidence`;
- `geocoding_error`.

Huidige personeelsvelden:

- `address_street`;
- `address_postal_code`;
- `address_city`;
- `address_country`;
- `address_latitude`;
- `address_longitude`;
- `address_geocoded_at`;
- `address_geocoding_provider`;
- `address_geocoding_status`;
- `address_geocoding_confidence`;
- `address_geocoding_error`;
- `vehicle_type`.

Ontbrekende of te normaliseren canon-velden:

- `address_line_1`;
- `address_line_2`;
- `state_or_region`;
- `country_code`;
- `formatted_address`;
- `google_place_id`;
- `location_source`;
- `location_verified_at`;
- `location_updated_at`.

Belangrijk aandachtspunt:

- opdrachten hebben nog geen expliciete uitvoeringadres-snapshot voor historische integriteit. Een volgende sprint moet bepalen of dit nodig is voor werkbonnen, facturen en routehistorie.

### Medewerker Vervoerstype

Huidige enum:

- `car`
- `bicycle`
- `walking`
- `moped_or_scooter`
- `public_transport`

Canon enum:

- `DRIVE`
- `BICYCLE`
- `WALK`
- `TRANSIT`

Te migreren:

- `car` -> `DRIVE`
- `bicycle` -> `BICYCLE`
- `walking` -> `WALK`
- `public_transport` -> `TRANSIT`
- `moped_or_scooter` -> geen canon support in deze fase; moet worden gemigreerd naar `DRIVE` of expliciet als legacy/unsupported worden behandeld zonder `TWO_WHEELER`.

### Environmentconfiguratie

Bestaande live-day-map docs noemen:

- `FIELDGRID_PLANNING_DAY_MAP_ENABLED`
- `FIELDGRID_ROUTE_PROVIDER`
- `GOOGLE_ROUTES_API_KEY`
- historisch ook `NEXT_PUBLIC_GOOGLE_ROUTES_API_KEY` in onderzoekstekst.

Canon vereist:

- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY`
- `GOOGLE_MAPS_SERVER_API_KEY`
- `GOOGLE_MAPS_MAP_ID`

Hardcoded of default config:

- `GOOGLE_MAPS_ENABLED=true`
- `GOOGLE_MAPS_DEFAULT_COUNTRY=NL`
- `GOOGLE_MAPS_DEFAULT_LANGUAGE=nl`
- `GOOGLE_MAPS_DEFAULT_REGION=NL`
- `GOOGLE_PLACES_AUTOCOMPLETE_ENABLED=true`
- `GOOGLE_ROUTES_ENABLED=true`
- `GOOGLE_ROUTES_TRAFFIC_ENABLED=true`

Te raken documenten:

- `.env.example`;
- deployment docs;
- development docs;
- staging docs;
- production docs;
- bestaande live day map docs.

Sprint 1 documentatie:

- `docs/deployment/google-maps-platform.md`
- root `.env.example`
- `artifacts/backoffice/.env.example`

## 3. Canon Eisen Checklist

### Credentials En Security

- Browserkey alleen voor Maps JavaScript API.
- Serverkey alleen server-side voor Places API (New) en Routes API.
- Serverkey nooit in props, HTML, hydrationdata, publieke responses of clientbundles.
- Geen API-keys loggen.
- Alle Places en Routes endpoints vereisen authenticatie.
- Tenantcontext altijd server-side bepalen.
- Input valideren met bestaande schema-patronen.
- Geen generieke publieke Google proxy.

### Centrale Module

Gewenste module, passend bij repositoryconventies:

- `artifacts/backoffice/src/lib/google-maps/config.ts`
- `artifacts/backoffice/src/lib/google-maps/client-loader.ts`
- `artifacts/backoffice/src/lib/google-maps/types.ts`
- `artifacts/backoffice/src/lib/google-maps/places-client.ts` (latere sprint)
- `artifacts/backoffice/src/lib/google-maps/routes-client.ts` (latere sprint)
- `artifacts/backoffice/src/lib/google-maps/travel-modes.ts`
- `artifacts/backoffice/src/lib/google-maps/marker-status.ts`
- `artifacts/backoffice/src/lib/google-maps/errors.ts`
- `artifacts/backoffice/src/lib/google-maps/metrics.ts`
- `artifacts/backoffice/src/lib/google-maps/cache.ts`

Voor PWA/portalen kan shared code later naar `lib` of workspace package worden verplaatst als meerdere artifacts dezelfde typed services nodig hebben.

### Kaart

- Maps JavaScript API.
- Map ID.
- Advanced Markers waar passend.
- Marker clustering bij veel markers.
- Fit-to-bounds.
- Controlled zoom.
- Loading, empty, config error, API error en retry states.
- Responsive desktop/tablet/mobile.
- Accessible marker labels.
- Cleanup bij unmount.
- Geen remount bij filterwijziging, statuswijziging, markerselectie of sidepanel.
- Lazy loading: alleen laden als kaart zichtbaar is.

### Markers

- Centrale semantische statusmapping.
- Geen willekeurige kleuren in pagina's.
- Kleur is niet enige informatiedrager.
- Statuslabel, aria-label, tooltip/infovenster en waar zinvol icon/shape.
- Popup/sidepanel toont opdracht, klant, object, adres, status, planning, toegewezen personeel, vervoersmodus en acties.

### Places

- Places API (New), server-side via Fieldgrid endpoint.
- Minimaal 3 tekens.
- Debounce 300-400 ms.
- AbortController.
- Geen Place Details voor selectie.
- Session token per zoekinteractie en hergebruik bij selectie.
- Minimale field masks:
  - `id`
  - `formattedAddress`
  - `addressComponents`
  - `location`
  - `displayName`
  - `types`
- Geen dure extra velden standaard.
- Handmatige invoer blijft werken.

### Routes

- Alleen server-side Routes API `computeRoutes`.
- Geen Directions Legacy, Distance Matrix Legacy, route matrix, optimization of fleet routing.
- Routecall alleen bij expliciete route-intentie.
- `DRIVE` gebruikt `TRAFFIC_AWARE`.
- `BICYCLE`, `WALK`, `TRANSIT` gebruiken geen traffic preference.
- Vraag alleen getoonde velden op.
- Toon afstand, reistijd, staticDuration/traffic delay waar beschikbaar, polyline en fallbackstates.

### Kostenbeheersing

- Geen calls bij iedere render, kaartbeweging, hover, refresh of verborgen tab.
- Deduplicatie op tenant, origin, destination, travel mode, time bucket en traffic preference.
- Beperkte TTL of alleen in-flight dedupe wanneer voorwaarden caching beperken.
- Tenant- en app-rate limiting voor autocomplete, place details en routes.
- Usage tracking zonder volledige adressen of secrets.

### Usage Metrics

Te meten events:

- `maps_view_opened`
- `autocomplete_request`
- `autocomplete_session_started`
- `autocomplete_selection`
- `place_details_request`
- `route_request`
- `route_request_drive_traffic`
- `route_request_bicycle`
- `route_request_walk`
- `route_request_transit`
- `google_api_error`
- `google_api_rate_limited`

Te bewaren metadata:

- `tenant_id`
- `user_id`
- `event_type`
- `environment`
- `request_date`
- `success`
- `response_time_ms`
- `cache_or_dedupe_status`
- `provider`
- `estimated_sku`
- niet-persoonlijke metadata.

## 4. Geraakte Bestanden

### Bestaand

- `artifacts/backoffice/src/components/assignments/PlanningMapView.tsx`
- `artifacts/backoffice/src/app/actions/planning.ts`
- `artifacts/backoffice/src/lib/planning/map-data.ts`
- `artifacts/backoffice/src/lib/planning/day-map-feature.ts`
- `artifacts/backoffice/src/lib/planning/geocoding.ts`
- `artifacts/backoffice/src/lib/planning/routes/*`
- `artifacts/backoffice/src/app/api/address-suggestions/route.ts`
- `artifacts/personeel-pwa/src/app/api/address-suggestions/route.ts`
- `lib/db/src/address-geocoding.ts`
- `lib/db/src/schema/customers.ts`
- `lib/db/src/schema/objects.ts`
- `lib/db/src/schema/personnel.ts`
- `lib/db/src/schema/assignments.ts`
- `lib/db/src/schema/planning-routes.ts`
- `artifacts/backoffice/src/components/layout/Sidebar.tsx`
- `.env.example`
- bestaande live-day-map docs en tests.

### Nieuw Verwacht

- centrale Google Maps services;
- server-side Places endpoint;
- server-side Routes endpoint of typed action-service;
- usage metrics schema en writer;
- rate limiting helpers;
- Google Maps React component;
- address autocomplete component;
- tests voor config, routes, places, usage en UI behavior;
- docs voor Google Cloud setup en key restricties.

## 5. Databasemigraties

Sprint 0 voegt geen migratie toe.

Verwachte latere migraties:

- Google-locatievelden op klanten, objecten en personeel.
- Eventueel execution address snapshot op opdrachten.
- Travel mode enum of getypeerde setting normaliseren naar `DRIVE`, `BICYCLE`, `WALK`, `TRANSIT`.
- Usage metrics tabel, provider-onafhankelijk.
- Rate-limit/audit uitbreidingen indien bestaande infrastructuur onvoldoende is.
- Mogelijk routecache schema uitbreiden met provider, field mask versie, traffic preference, departure bucket en legal TTL metadata.

Migratiestrategie:

- bestaande adressen blijven brondata;
- bestaande coordinaten blijven geldig als legacy/import data;
- Google-data wordt pas opgeslagen na expliciete gebruikersselectie of bevestiging;
- geen historische opdrachten overschrijven wanneer object/klantadres wijzigt;
- `moped_or_scooter` wordt bewust gemigreerd of als unsupported weergegeven zonder `TWO_WHEELER` call;
- backfill wijzigt geen zichtbare klant-, object- of personeelsnamen.

## 6. API Routes En Services

Te ontwerpen:

- `POST /api/google-maps/places/autocomplete`
- `POST /api/google-maps/places/details`
- `POST /api/google-maps/routes/compute`

Of repository-conform als server actions/services wanneer routes niet nodig zijn.

Verplicht per endpoint:

- auth;
- server-side tenantcontext;
- permissiecheck;
- inputvalidatie;
- rate limiting;
- usage metrics;
- safe error mapping;
- geen Google payload/secrets lekken;
- geen arbitraire pass-through parameters.

## 7. Autorisatie

Te borgen:

- planningkaart vereist `planning:read`;
- routeberekening vereist planning- of opdrachttoegang voor de gekozen opdracht/context;
- adresautocomplete voor backoffice vereist relevante create/update/read permissie op klant, object, opdracht of personeel;
- personeel-PWA mag alleen eigen toegestane profiel/assignmentcontext gebruiken;
- tenant ID uit client wordt genegeerd;
- platform admin krijgt alleen platformcontext als daarvoor expliciet een platformkaart/rapport bestaat.

## 8. Rollbackstrategie

Huidige rollback:

- `FIELDGRID_PLANNING_DAY_MAP_ENABLED=false` verbergt de kaarttab.
- `FIELDGRID_ROUTE_PROVIDER=mock` schakelt externe routeprovider uit.
- Zonder Google routes key valt provider terug naar mock.

Nieuwe rollback na migratie:

- `GOOGLE_MAPS_ENABLED=false` toont tekstuele fallback zonder kaart.
- `GOOGLE_PLACES_AUTOCOMPLETE_ENABLED=false` behoudt handmatige invoer.
- `GOOGLE_ROUTES_ENABLED=false` behoudt markerkaart zonder routepaneel.
- oude PDOK-flow kan tijdelijk read-only/fallback blijven tot Google Places stabiel is.
- migraties moeten additive zijn totdat data bevestigd is.

## 9. Teststrategie

Sprint 0 baseline-tests leggen vast wat nu bestaat:

- CARTO/OSM kaartprovider;
- PDOK adreszoeker;
- Google Routes oude serverkey;
- mock route fallback;
- tenant-scope in planningkaartquery;
- huidige vervoerstype mapping;
- feature flag en sidebar route;
- dit trackingdocument.

Latere tests:

- unit tests voor travel mode mapping, markerstatus, field masks, env-validatie en dedupe;
- integratietests voor serverkey, auth, tenant-scope, rate limiting en safe errors;
- UI/E2E tests met gemockte Google services;
- optionele live smoke met beperkte calls, nooit standaard in CI;
- bundle scan op serversecret leakage.

## 10. Acceptatiecriteria Sprint 0

- Main is opgehaald en gecontroleerd.
- Bestaande kaart-, adres-, route-, data- en env-implementatie is geinventariseerd.
- CARTO, OSM, PDOK, mock routes en oude Google routeconfiguratie zijn benoemd.
- Trackingdocument bestaat.
- Baseline-regressietests bestaan.
- Geen functionele migratie naar Google Maps Platform is uitgevoerd.
- Typecheck en build blijven groen.
- Alleen Sprint 0 wijzigingen zijn gecommit en gepusht.

## 11. Definition Of Done Voor Volledige Canon

De volledige Google Maps Platform-integratie is pas klaar wanneer:

- Maps JavaScript API werkt met browserkey en Map ID;
- serverkey nooit client-side lekt;
- Places API (New) server-side werkt met session tokens en minimale field masks;
- Routes API server-side werkt voor `DRIVE`, `BICYCLE`, `WALK` en `TRANSIT`;
- `DRIVE` gebruikt `TRAFFIC_AWARE`;
- routeoptimalisatie en matrices ontbreken bewust;
- markerstatussen centraal gedefinieerd zijn;
- kaart lazy-loaded is en niet onnodig remount;
- adresdata tenant-safe wordt opgeslagen;
- usage per tenant meetbaar is;
- rate limiting aanwezig is;
- fallbackstates Nederlands en bruikbaar zijn;
- oude CARTO/OSM/PDOK/mock-only code gecontroleerd gemigreerd of verwijderd is;
- tests, typecheck, build en migratiecheck groen zijn;
- documentatie en `.env.example` zijn bijgewerkt.

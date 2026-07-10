# Fieldgrid Live Day Map - Fase 4 Routeprovider en cache zonder UI

## Scope

Fase 4 implementeert de routeprovider en routecache zonder UI. Er is bewust nog geen kaart, live-dagweergave, auto-snap of planningmutatie toegevoegd. Deze laag is bedoeld als server-only basis voor latere ETA-, conflict- en routebufferingfases.

## Wat Is Toegevoegd

- Server-only routeprovidercontracten in `artifacts/backoffice/src/lib/planning/routes`.
- Google Routes adapter met `GOOGLE_MAPS_SERVER_API_KEY`; `GOOGLE_ROUTES_API_KEY` blijft alleen een tijdelijke legacy fallback.
- Deterministic mock routeprovider voor tests en lokale verificatie.
- Tenant-scoped cache helpers rond `assignment_route_cache`.
- Cache TTL helper via `organization_settings.route_cache_ttl_hours`.
- Fase-4 gate: `pnpm fieldgrid:live-day-map-phase4:check`.

## Routeprovider

De default provider is de deterministische mockprovider zolang `GOOGLE_MAPS_SERVER_API_KEY` ontbreekt. Google Routes wordt alleen gebruikt wanneer `FIELDGRID_ROUTE_PROVIDER=google` is gezet of wanneer er een server-only `GOOGLE_MAPS_SERVER_API_KEY` beschikbaar is. `GOOGLE_ROUTES_API_KEY` wordt nog herkend als tijdelijke backward-compatible fallback, maar is niet leidend. De API-key mag nooit als `NEXT_PUBLIC_*` worden geconfigureerd.

Ondersteunde vervoerstypes volgen `PersonnelVehicleType`:

- `car` -> `DRIVE`
- `bicycle` -> `BICYCLE`
- `walking` -> `WALK`
- `moped_or_scooter` -> `DRIVE` als gecontroleerde legacy fallback; `TWO_WHEELER` valt buiten de Google Maps-canonfase.
- `public_transport` -> `TRANSIT`

Providerfouten zijn expliciet retryable of niet-retryable. HTTP 429 en 5xx worden retryable gemarkeerd. Ongeldige coördinaten en ontbrekende configuratie zijn niet retryable.

## Mockprovider

De mockprovider gebruikt haversine-afstand en vaste snelheden per vervoerstype. Deze provider is deterministisch en is bedoeld voor unit-/acceptatietests zonder netwerk of Google credentials.

Gebruik voor tests:

```powershell
$env:FIELDGRID_ROUTE_PROVIDER="mock"
```

of roep `createRouteProvider({ kind: "mock" })` aan.

## Routecache

De cache is tenant-scoped op:

- `tenant_id`
- `provider`
- `vehicle_type`
- `origin_hash`
- `destination_hash`
- `request_context_hash` voor vervoersmodus, vertrekbucket en verkeersvoorkeur zonder raw adressen of Google-payloads op te slaan.

Alle cache-lookups filteren op `tenantId` en `expiresAt`. Succesvolle providerresultaten worden kort gecachet volgens de Google Routes-beleidsgrenzen: autoroutes met verkeer en OV enkele minuten, fiets/lopen beperkt langer. Gelijktijdige identieke calls worden in-flight gededuped; foutresultaten krijgen alleen een zeer korte negatieve cache om stormen te voorkomen. Als de cachewrite faalt, wordt het routeantwoord alsnog teruggegeven met `cacheStatus: "write_failed"` zodat de planning later niet blokkeert door cacheproblemen.

De tenantinstelling `organization_settings.route_cache_ttl_hours` is een bovengrens; de Google-conforme korte TTL-policy wint altijd.

## Usage En Rate Limiting

Routecalls gebruiken tenant- en gebruiker-scoped rate limiting voordat Google wordt aangeroepen. Usage events worden als `route_request_*`, `google_api_error` en `google_api_rate_limited` weggeschreven zonder adressen, API-keys, polyline of payloads in metricsmetadata.

## Security

- Alle routeprovider- en cachemodules hebben `server-only`.
- Er zijn geen clientcomponenten, kaartcomponenten of MapLibre-imports toegevoegd.
- De Google API-key wordt niet naar de browser geëxporteerd.
- Routecache-reads zijn altijd tenant-scoped.
- Directe Supabase/Data API exposure blijft afhankelijk van de RLS/grants uit fase 2; deze fase voegt geen nieuwe tabellen of permissies toe.

## Geen UI En Geen Planningmutatie

Fase 4 bevat geen kaart-UI, geen live day page, geen drag-and-drop wijzigingen en geen auto-snap. Latere fases mogen deze helpers gebruiken, maar mogen routeberekeningen pas aan planningstatussen koppelen nadat de conflict- en acceptatieflows zijn gebouwd.

## Verificatie

Aanbevolen checks:

```powershell
node scripts/fieldgrid-live-day-map-phase1-baseline.mjs --check
node scripts/fieldgrid-live-day-map-phase2-datamodel.mjs --check
node scripts/fieldgrid-live-day-map-phase3-geocoding.mjs --check
node scripts/fieldgrid-live-day-map-phase4-route-provider.mjs --check
node scripts/fieldgrid-migration-order-check.mjs --check
node node_modules/typescript/bin/tsc -p artifacts/backoffice/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc --build
```

# Fieldgrid Live Day Map - Fase 4 Routeprovider en cache zonder UI

## Scope

Fase 4 implementeert de routeprovider en routecache zonder UI. Er is bewust nog geen kaart, live-dagweergave, auto-snap of planningmutatie toegevoegd. Deze laag is bedoeld als server-only basis voor latere ETA-, conflict- en routebufferingfases.

## Wat Is Toegevoegd

- Server-only routeprovidercontracten in `artifacts/backoffice/src/lib/planning/routes`.
- Google Routes adapter met `GOOGLE_ROUTES_API_KEY`.
- Deterministic mock routeprovider voor tests en lokale verificatie.
- Tenant-scoped cache helpers rond `assignment_route_cache`.
- Cache TTL helper via `organization_settings.route_cache_ttl_hours`.
- Fase-4 gate: `pnpm fieldgrid:live-day-map-phase4:check`.

## Routeprovider

De default provider is de deterministische mockprovider zolang `GOOGLE_ROUTES_API_KEY` ontbreekt. Google Routes wordt alleen gebruikt wanneer `FIELDGRID_ROUTE_PROVIDER=google` is gezet of wanneer er een server-only `GOOGLE_ROUTES_API_KEY` beschikbaar is. De API-key mag nooit als `NEXT_PUBLIC_*` worden geconfigureerd.

Ondersteunde vervoerstypes volgen `PersonnelVehicleType`:

- `car` -> `DRIVE`
- `bicycle` -> `BICYCLE`
- `walking` -> `WALK`
- `moped_or_scooter` -> `TWO_WHEELER`
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

Alle cache-lookups filteren op `tenantId` en `expiresAt`. Succesvolle providerresultaten worden gecachet. Foutresultaten worden niet gecachet. Als de cachewrite faalt, wordt het routeantwoord alsnog teruggegeven met `cacheStatus: "write_failed"` zodat de planning later niet blokkeert door cacheproblemen.

De TTL gebruikt standaard `organization_settings.route_cache_ttl_hours` met een veilige range van 1 tot 720 uur.

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
